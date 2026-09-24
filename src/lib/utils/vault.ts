/**
 * Client-side passphrase vault.
 *
 * Stores BSrE passphrases per-email, encrypted at rest, on the user's device.
 * Uses the WebAuthn PRF extension — the authenticator derives a deterministic
 * secret from the credential + a per-record salt after a biometric/PIN prompt.
 * Nothing decryptable is ever written to disk.
 *
 * Records are kept in an IndexedDB database keyed by email:
 *   "asta:vault" → records store → { v, email, salt, iv, data, credentialId, updatedAt }
 *
 * `save()` is an upsert — calling it again with the same email overwrites the
 * record (used both for first-time save and for updating a changed passphrase).
 */
export type VaultRecord = {
  v: 1;
  email: string;
  salt: string;
  iv: string;
  data: string;
  credentialId: string;
  updatedAt: number;
};

export type VaultTier = "prf" | "unsupported";

type VaultMap = Record<string, VaultRecord>;

/* ------------------------------------------------------------------ */
/* storage helpers (IndexedDB)                                         */
/* ------------------------------------------------------------------ */

const DB_NAME = "asta:vault";
const DB_VERSION = 1;
const RECORDS_STORE = "records";
const CREDS_STORE = "creds";

let dbPromise: Promise<IDBDatabase> | null = null;
let migrated = false;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RECORDS_STORE)) {
        db.createObjectStore(RECORDS_STORE, { keyPath: "email" });
      }
      if (!db.objectStoreNames.contains(CREDS_STORE)) {
        db.createObjectStore(CREDS_STORE, { keyPath: "email" });
      }
    };
    req.onsuccess = async () => {
      const db = req.result;
      if (!migrated) {
        migrated = true;
        try {
          await migrateFromLocalStorage(db);
        } catch {
          // best-effort
        }
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** One-time migration of records saved under the old localStorage keys. */
async function migrateFromLocalStorage(db: IDBDatabase) {
  try {
    const raw = localStorage.getItem("asta:vault");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const tx = db.transaction(RECORDS_STORE, "readwrite");
        const store = tx.objectStore(RECORDS_STORE);
        for (const record of Object.values(parsed as VaultMap)) store.put(record);
        await txDone(tx);
        localStorage.removeItem("asta:vault");
      }
    }
    const rawCreds = localStorage.getItem("asta:vault:creds");
    if (rawCreds) {
      const parsed = JSON.parse(rawCreds);
      if (parsed && typeof parsed === "object") {
        const tx = db.transaction(CREDS_STORE, "readwrite");
        const store = tx.objectStore(CREDS_STORE);
        for (const [email, credentialId] of Object.entries(
          parsed as Record<string, string>,
        )) {
          store.put({ email, credentialId });
        }
        await txDone(tx);
        localStorage.removeItem("asta:vault:creds");
      }
    }
  } catch {
    // Migration is best-effort — ignore failures.
  }
}

async function readMap(): Promise<VaultMap> {
  try {
    const db = await openDb();
    const tx = db.transaction(RECORDS_STORE, "readonly");
    const records = await idbRequest(
      tx.objectStore(RECORDS_STORE).getAll() as IDBRequest<VaultRecord[]>,
    );
    const map: VaultMap = {};
    for (const record of records) map[record.email] = record;
    return map;
  } catch {
    return {};
  }
}

async function writeMap(map: VaultMap): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(RECORDS_STORE, "readwrite");
  const store = tx.objectStore(RECORDS_STORE);
  store.clear();
  for (const record of Object.values(map)) store.put(record);
  await txDone(tx);
}

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(str: string): Uint8Array {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function fromBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/* ------------------------------------------------------------------ */
/* WebAuthn PRF helpers                                                */
/* ------------------------------------------------------------------ */

async function isPrfSupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return (
      typeof window.PublicKeyCredential.isConditionalMediationAvailable ===
        "function" &&
      typeof window.PublicKeyCredential
        .isUserVerifyingPlatformAuthenticatorAvailable === "function" &&
      (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

function prfExtension(salt: Uint8Array): any {
  return {
    prf: {
      eval: {
        first: salt,
      },
    },
  };
}

function getPrfResult(assertion: any): Uint8Array | null {
  const prf = assertion?.getClientExtensionResults?.()?.prf;
  const first = prf?.results?.first;
  if (!first) return null;
  return new Uint8Array(first);
}

/** Registration output is `{ enabled: true }` — not `results.first`. */
function prfEnabled(creation: any): boolean {
  return Boolean(creation?.getClientExtensionResults?.()?.prf?.enabled);
}

/* ------------------------------------------------------------------ */
/* crypto helpers                                                      */
/* ------------------------------------------------------------------ */

async function aesGcmEncrypt(
  key: CryptoKey,
  iv: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return new Uint8Array(cipher);
}

async function aesGcmDecrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new Uint8Array(plain);
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/* ------------------------------------------------------------------ */
/* vault API                                                           */
/* ------------------------------------------------------------------ */

export const vault = {
  /** True when a record exists for this email. */
  async has(email: string): Promise<boolean> {
    if (typeof indexedDB === "undefined") return false;
    return Boolean((await readMap())[email]);
  },

  /** True when the WebAuthn PRF tier is available on this device. */
  async supported(): Promise<boolean> {
    return isPrfSupported();
  },

  /** Metadata for the stored record (e.g. "tersimpan sejak …"). */
  async get(email: string): Promise<VaultRecord | null> {
    if (typeof indexedDB === "undefined") return null;
    return (await readMap())[email] ?? null;
  },

  /**
   * Upsert — saves (or overwrites) the passphrase for `email`.
   * Returns "prf" on success, or "unsupported" when PRF is unavailable
   * (no platform authenticator / user cancels / authenticator lacks PRF).
   */
  async save(email: string, passphrase: string): Promise<VaultTier> {
    if (typeof indexedDB === "undefined") return "unsupported";
    if (!email || !passphrase) return "unsupported";
    if (!(await isPrfSupported())) return "unsupported";

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    try {
      const { credentialId, prfKey } = await ensurePrfCredential(email, salt);
      const key = await importAesKey(prfKey);
      const data = await aesGcmEncrypt(key, iv, toBytes(passphrase));
      const map = await readMap();
      map[email] = {
        v: 1,
        email,
        salt: b64encode(salt),
        iv: b64encode(iv),
        data: b64encode(data),
        credentialId,
        updatedAt: Date.now(),
      };
      await writeMap(map);
      return "prf";
    } catch (err) {
      console.warn("[vault] PRF save failed", err);
      return "unsupported";
    }
  },

  /**
   * Decrypts and returns the passphrase for `email`, or null when there is no
   * record / the user cancels the biometric prompt / decryption fails.
   */
  async unlock(email: string): Promise<string | null> {
    if (typeof indexedDB === "undefined") return null;
    const record = (await readMap())[email];
    if (!record?.credentialId) return null;

    const salt = b64decode(record.salt);
    const iv = b64decode(record.iv);
    const data = b64decode(record.data);

    try {
      const prfKey = await getPrfKey(record.credentialId, salt);
      const key = await importAesKey(prfKey);
      const plain = await aesGcmDecrypt(key, iv, data);
      return fromBytes(plain);
    } catch (err) {
      console.warn("[vault] PRF unlock failed", err);
      return null;
    }
  },

  /** Removes the record for `email` (and its PRF credential reference). */
  async clear(email: string): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    const map = await readMap();
    const record = map[email];
    if (record?.credentialId) {
      try {
        await deletePrfCredential(record.credentialId);
      } catch (err) {
        console.warn("[vault] failed to delete PRF credential", err);
      }
    }
    delete map[email];
    await writeMap(map);
  },
};

/* ------------------------------------------------------------------ */
/* PRF credential management                                           */
/* ------------------------------------------------------------------ */

async function ensurePrfCredential(
  email: string,
  salt: Uint8Array,
): Promise<{ credentialId: string; prfKey: Uint8Array }> {
  const existing = await findPrfCredential(email);
  if (existing) {
    // Credential already exists — derive the key via a single auth ceremony.
    const prfKey = await getPrfKey(existing, salt);
    return { credentialId: existing, prfKey };
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = toBytes(email);

  const creation = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge as BufferSource,
      rp: { name: "Tapak Astà" },
      user: {
        id: userId as BufferSource,
        name: email,
        displayName: email,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      // Request the PRF key during creation — supported authenticators return
      // `results.first` here, avoiding a second prompt.
      extensions: { prf: { eval: { first: salt as BufferSource } } },
    },
  })) as any;

  if (!creation) throw new Error("PRF credential creation cancelled");

  const credentialId = b64encode(new Uint8Array(creation.rawId));
  const prf = creation?.getClientExtensionResults?.()?.prf;
  const prfKey = prf?.results?.first
    ? new Uint8Array(prf.results.first)
    : null;

  if (!prf?.enabled && !prfKey) {
    // PRF not actually supported by the authenticator — clean up and bail.
    await deletePrfCredential(credentialId);
    throw new Error("PRF not supported by authenticator");
  }

  // Remember the credential id so we can find it again.
  const map = await readMap();
  const existingRecord = map[email];
  if (existingRecord) {
    existingRecord.credentialId = credentialId;
    await writeMap(map);
  } else {
    // No record yet — stash the credential id in a side map so `has()` stays
    // false until the first successful save.
    const creds = await readCredentialMap();
    creds[email] = credentialId;
    await writeCredentialMap(creds);
  }

  if (prfKey) {
    // Authenticator returned the key during creation — no second prompt.
    return { credentialId, prfKey };
  }

  // Fallback: derive the key via an authentication ceremony.
  const derived = await getPrfKey(credentialId, salt);
  return { credentialId, prfKey: derived };
}

async function findPrfCredential(email: string): Promise<string | null> {
  const record = (await readMap())[email];
  if (record?.credentialId) return record.credentialId;
  return (await readCredentialMap())[email] ?? null;
}

async function getPrfKey(
  credentialId: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge as BufferSource,
      allowCredentials: [
        {
          type: "public-key",
          id: b64decode(credentialId) as BufferSource,
        },
      ],
      userVerification: "required",
      extensions: prfExtension(salt),
    },
  })) as any;

  if (!assertion) throw new Error("PRF assertion cancelled");

  const prf = getPrfResult(assertion);
  if (!prf) throw new Error("PRF result missing");
  return prf;
}

async function deletePrfCredential(credentialId: string): Promise<void> {
  // WebAuthn has no API to delete a credential; we only remove our reference.
  const creds = await readCredentialMap();
  for (const email of Object.keys(creds)) {
    if (creds[email] === credentialId) delete creds[email];
  }
  await writeCredentialMap(creds);
}

/* Side map for credential ids before the first record exists. */
async function readCredentialMap(): Promise<Record<string, string>> {
  try {
    const db = await openDb();
    const tx = db.transaction(CREDS_STORE, "readonly");
    const creds = await idbRequest(
      tx.objectStore(CREDS_STORE).getAll() as IDBRequest<
        { email: string; credentialId: string }[]
      >,
    );
    const map: Record<string, string> = {};
    for (const c of creds) map[c.email] = c.credentialId;
    return map;
  } catch {
    return {};
  }
}

async function writeCredentialMap(
  map: Record<string, string>,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CREDS_STORE, "readwrite");
  const store = tx.objectStore(CREDS_STORE);
  store.clear();
  for (const [email, credentialId] of Object.entries(map)) {
    store.put({ email, credentialId });
  }
  await txDone(tx);
}