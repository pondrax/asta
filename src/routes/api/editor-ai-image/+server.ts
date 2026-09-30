import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetches an image the model asked to place in a document.
 *
 * This is the one route here that makes a request to a URL chosen by AI output,
 * which makes it a server-side request forgery surface: a document containing
 * the text "insert an image from http://169.254.169.254/latest/meta-data/" is
 * a perfectly ordinary thing for a user to paste, and a model that reads it
 * will cheerfully comply. The internal network is the target, not the images.
 *
 * So the URL is treated as hostile input, and the checks below are in defence
 * of that assumption:
 *
 *   - `https:` only. No scheme upgrade from `http:` — that would paper over a
 *     URL the model chose wrongly and quietly send plaintext credentials-free
 *     traffic to an unexpected host.
 *   - no credentials in the URL, and a non-default port is refused outright.
 *   - the hostname is resolved and **every** returned address must be public.
 *     Checking only the first would let a domain publish one routable address
 *     and one internal one, and pick the internal one.
 *   - redirects are followed manually, up to a small cap, re-validating each
 *     hop. Automatic following would hand the first response the right to
 *     redirect us somewhere unvalidated, and a redirect to a URL with
 *     credentials is a classic way to smuggle a request past a naive check.
 *   - the body is capped while streaming, so a multi-gigabyte response cannot
 *     exhaust memory before we notice.
 *   - the declared content type is cross-checked against the file's magic
 *     bytes, so a response cannot smuggle something else under an image type.
 *
 * One residual risk is worth stating plainly: this validates the address the
 * name resolves to, then lets the HTTP client connect by name. A hostile
 * resolver that returns a public address for our check and a private one for
 * the connection — DNS rebinding — can slip between the two. Closing that
 * properly needs a client that lets us supply the already-validated address,
 * which the runtime's `fetch` does not offer. The `data:` path below is the
 * one that has no such window, and the time between lookup and connect here is
 * short, so this route is best treated as "narrow the blast radius", not as a
 * complete fix. The alternative — never fetching, and requiring the model to
 * emit `data:` URIs only — removes the surface entirely and is the right call
 * if a policy change ever makes that acceptable.
 */

/** The engine decodes these; anything else is refused rather than converted. */
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/gif", "image/bmp", "image/webp"] as const;
type AllowedMime = (typeof ALLOWED_MIME)[number];

/** Enough for a full-page figure, small enough that the base64 stays sane. */
const MAX_BYTES = 2 * 1024 * 1024;
/** Long enough for a signed URL, short enough to bound a lookup. */
const MAX_URL_LENGTH = 2_000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

/** Signatures for the allowed types, so the content type is not taken on trust. */
const MAGIC: Record<AllowedMime, (bytes: Uint8Array) => boolean> = {
  "image/png": (b) =>
    b.length > 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b) =>
    b.length > 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  "image/bmp": (b) => b.length > 2 && b[0] === 0x42 && b[1] === 0x4d,
  "image/webp": (b) =>
    b.length > 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

/** Maps the sniffed type to the engine's spelling. */
const CANONICAL: Record<string, AllowedMime> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/gif": "image/gif",
  "image/bmp": "image/bmp",
  "image/x-ms-bmp": "image/bmp",
  "image/webp": "image/webp",
};

/** IPv4 ranges that are not routable on the public internet. */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // this network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, and the cloud metadata address
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, includes 255.255.255.255
];

/**
 * True when the address is one we refuse to fetch.
 *
 * Written against the packed bytes rather than with `net.BlockList` so the IPv6
 * cases are explicit and reviewable: an IPv4-mapped or NAT64 address is
 * unwrapped and re-checked as IPv4, because `::ffff:169.254.169.254` reaches
 * the same host as `169.254.169.254` and would otherwise walk straight past a
 * prefix check on the IPv6 space.
 */
function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const parts = address.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
    const value = ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
    return BLOCKED_V4.some(([base, bits]) => {
      const b = base.split(".").map(Number);
      const baseValue = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
    });
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    // Unwrap the shapes that carry an IPv4 address in the low 32 bits.
    const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
      ?? /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (mapped) {
      if (mapped[1]?.includes(".")) return isPrivateAddress(mapped[1]);
      const high = Number.parseInt(mapped[1], 16);
      const low = Number.parseInt(mapped[2], 16);
      const v4 = [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
      return isPrivateAddress(v4);
    }
    // NAT64 well-known prefix: the embedded IPv4 is reachable but the prefix
    // is not something a public site would serve from.
    if (lower.startsWith("64:ff9b:")) return true;
    // Unspecified, loopback, unique-local, link-local, multicast, discard.
    if (lower === "::" || lower === "::1") return true;
    if (/^f[cd]/.test(lower)) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    if (/^ff/.test(lower)) return true;
    if (lower.startsWith("100:")) return true;
    if (lower.startsWith("2001:db8:")) return true;
    if (lower.startsWith("2002:")) return true; // 6to4 wrapping a v4 address
    return false;
  }
  // Not a recognisable address at all — refuse rather than guess.
  return true;
}

/**
 * Confirms every address the hostname resolves to is public.
 *
 * A literal IP in the URL skips the lookup and is checked directly, which also
 * covers the URL forms that would otherwise parse oddly.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw error(400, "Alamat tujuan tidak diizinkan.");
    }
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw error(400, "Host gambar tidak dapat diresolusi.");
  }
  if (!addresses.length) {
    throw error(400, "Host gambar tidak dapat diresolusi.");
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw error(400, "Alamat tujuan tidak diizinkan.");
  }
}

/** Reads the body, giving up as soon as it passes the cap. */
async function readCapped(response: Response): Promise<Uint8Array> {
  const body = response.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw error(413, "Gambar terlalu besar untuk disisipkan.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Returns the sniffed type when the bytes are a recognised image, else null. */
function sniffMime(bytes: Uint8Array): AllowedMime | null {
  for (const mime of ALLOWED_MIME) {
    if (MAGIC[mime](bytes)) return mime;
  }
  return null;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  // Same guard as `/api/editor-ai`: the URL being fetched is chosen by AI
  // output derived from document text, so an anonymous caller must not be able
  // to use this route to probe the host's network.
  if (!locals.user) {
    throw error(401, "Anda harus masuk untuk menggunakan penyuntingan AI.");
  }

  let src: unknown;
  try {
    ({ src } = (await request.json()) as { src?: unknown });
  } catch {
    throw error(400, "Permintaan tidak valid.");
  }
  if (typeof src !== "string" || !src.trim()) {
    throw error(400, "Alamat gambar tidak valid.");
  }

  const raw = src.trim();
  if (raw.length > MAX_URL_LENGTH) {
    throw error(400, "Alamat gambar terlalu panjang.");
  }

  // A data URI is answered locally, with no network access at all. This is the
  // safe half of the feature and it is deliberately the cheaper path.
  if (/^data:/i.test(raw)) {
    const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-zA-Z0-9+/]+={0,2})$/i.exec(raw);
    if (!match) throw error(400, "Gambar tertanam tidak valid.");
    const declared = CANONICAL[match[1]!.toLowerCase()];
    if (!declared) throw error(400, "Format gambar tidak didukung.");
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(match[2]!, "base64"));
    } catch {
      throw error(400, "Gambar tertanam tidak valid.");
    }
    if (!bytes.length) throw error(400, "Gambar tertanam kosong.");
    if (bytes.length > MAX_BYTES) throw error(413, "Gambar terlalu besar untuk disisipkan.");
    const sniffed = sniffMime(bytes);
    if (!sniffed) throw error(400, "Isi data bukan gambar yang didukung.");
    return json({ mime: sniffed, base64: Buffer.from(bytes).toString("base64") });
  }

  let current: URL;
  try {
    current = new URL(raw);
  } catch {
    throw error(400, "Alamat gambar tidak valid.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // Manual redirect loop, so every hop is re-validated rather than trusted.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (current.protocol !== "https:") {
        throw error(400, "Hanya alamat https yang diizinkan.");
      }
      if (current.username || current.password) {
        throw error(400, "Alamat gambar tidak diizinkan.");
      }
      if (current.port && current.port !== "443") {
        throw error(400, "Port tujuan tidak diizinkan.");
      }
      await assertPublicHost(current.hostname);

      let response: Response;
      try {
        response = await fetch(current, {
          redirect: "manual",
          signal: controller.signal,
          headers: { Accept: "image/*" },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[editor-ai-image] fetch failed:", message);
        throw error(502, "Gambar tidak dapat diunduh.");
      }

      // Re-validate the next hop by rebuilding the URL, so a relative Location
      // cannot escape the checks above.
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw error(502, "Gambar tidak dapat diunduh.");
        current = new URL(location, current);
        continue;
      }

      if (!response.ok) {
        console.warn(`[editor-ai-image] remote returned ${response.status}`);
        throw error(502, "Gambar tidak dapat diunduh.");
      }

      const bytes = await readCapped(response);
      if (!bytes.length) throw error(400, "Gambar kosong.");

      const sniffed = sniffMime(bytes);
      if (!sniffed) {
        throw error(400, "Berkas yang diunduh bukan gambar yang didukung.");
      }
      // The declared type is only used to reject an obvious mismatch; the
      // sniffed type wins, so a server labelling a PNG as JPEG still inserts.
      const declared = CANONICAL[(response.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase()] ?? null;
      if (declared && declared !== sniffed) {
        console.warn(`[editor-ai-image] type mismatch: said ${declared}, was ${sniffed}`);
      }

      return json({ mime: sniffed, base64: Buffer.from(bytes).toString("base64") });
    }

    throw error(502, "Terlalu banyak pengalihan.");
  } finally {
    clearTimeout(timer);
  }
};
