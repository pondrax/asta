import { env } from "$env/dynamic/private";

const BKPSDM_BASE = "https://bkpsdm.mojokertokota.go.id/pegawai/api";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
const DEFAULT_TTL_MS = 60 * 60 * 1000;

function jwtExpiry(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const exp = Number(json?.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function getBearerToken(force = false): Promise<string> {
  if (!force && cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch(`${BKPSDM_BASE}/user-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: env.BKPSDM_USERNAME,
      password: env.BKPSDM_PASSWORD,
    }),
  });

  if (!res.ok) {
    throw new Error(`BKPSDM login failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const token = data?.token;
  if (!token) {
    throw new Error("BKPSDM login returned no token");
  }

  cachedToken = token;
  tokenExpiresAt = jwtExpiry(token) || Date.now() + DEFAULT_TTL_MS;
  return token;
}

export type BkpsdmAsn = {
  nama?: string | null;
  nip?: string | null;
  jabatan?: string | null;
  unitkerja?: string | null;
  golongan?: string | null;
  StatusPegawai?: string | null;
};

function formatNip(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 18);
  if (!d) return "";
  const parts = [d.slice(0, 8), d.slice(8, 14), d.slice(14, 15), d.slice(15, 18)];
  return parts.filter(Boolean).join(" ");
}

export async function fetchAsnByNip(nip: string): Promise<BkpsdmAsn | null> {
  const formatted = formatNip(nip);
  if (!formatted) return null;
  const url = `${BKPSDM_BASE}/tapakasta/dataasn/${encodeURIComponent(formatted)}`;

  const doFetch = async (token: string) =>
    fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

  let res: Response;
  try {
    res = await doFetch(await getBearerToken());
    if (res.status === 401) {
      cachedToken = null;
      tokenExpiresAt = 0;
      res = await doFetch(await getBearerToken(true));
    }
  } catch {
    return null;
  }

  if (!res.ok) return null;

  try {
    const body = await res.json();
    const data = body?.data ?? body;
    const first = Array.isArray(data) ? data[0] : data;
    return first ?? null;
  } catch {
    return null;
  }
}
