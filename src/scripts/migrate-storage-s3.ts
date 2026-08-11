/**
 * Migrate existing `documents.files` from local disk storage to rustfs/S3.
 *
 * For every file referenced in the documents table (`/uploads/...`), reads the
 * raw bytes from local disk and PUTs them to the S3 bucket under the same key
 * (i.e. `/uploads/documents/x.enc` → key `documents/x.enc`). The stored URLs
 * do NOT need to change — the `/uploads/[...uri]` route reads through
 * `FileStorage`, which now serves from S3.
 *
 * Files are copied verbatim (already encrypted `.enc` bytes are NOT
 * re-encrypted) so `FileStorage.read()` still decrypts them correctly.
 *
 * Requirements: `.env` with DATABASE_URL + S3_* vars (bun auto-loads .env).
 * Safe to re-run (PUT overwrites).
 *
 * Usage:
 *   bun run migrate:storage
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../lib/server/db';
import { documents } from '../lib/server/db/schema';

const BASE_DIR = path.resolve(process.env.STORAGE_BASE_DIR || './uploads');
const ENDPOINT = (process.env.S3_ENDPOINT || '').replace(/\/+$/, '');
const BUCKET = process.env.S3_BUCKET || '';
const REGION = process.env.S3_REGION || 'us-east-1';
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID || '';
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY || '';

// ---------------------------------------------------------------------------
// Minimal S3 client (SigV4) — mirrors src/lib/server/storage/index.ts
// ---------------------------------------------------------------------------

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function objectUrl(key: string): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${ENDPOINT}/${BUCKET}/${encoded}`;
}

async function signedHeaders(
  method: string,
  url: string,
  payload: Buffer | null,
): Promise<Record<string, string>> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${REGION}/s3/aws4_request`;

  const parsed = new URL(url);
  const canonicalUri = parsed.pathname || '/';
  const canonicalQuery = [...parsed.searchParams.entries()]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join('&');

  const payloadHash = payload ? sha256Hex(payload) : EMPTY_SHA256;

  const headers: Record<string, string> = {
    host: parsed.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}\n`)
    .join('');

  const signedHeadersList = Object.keys(headers)
    .sort()
    .map((k) => k.toLowerCase())
    .join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeadersList,
    payloadHash,
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${SECRET_KEY}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${scope}, SignedHeaders=${signedHeadersList}, Signature=${signature}`,
  };
}

async function ensureBucket(): Promise<void> {
  const url = `${ENDPOINT}/${BUCKET}`;
  const head = await fetch(url, { method: 'HEAD', headers: await signedHeaders('HEAD', url, null) });
  if (head.status === 404 || head.status === 403) {
    const put = await fetch(url, { method: 'PUT', headers: await signedHeaders('PUT', url, null) });
    if (!put.ok && put.status !== 409) {
      throw new Error(`create bucket failed: ${put.status} ${await put.text()}`);
    }
  } else if (!head.ok) {
    throw new Error(`bucket HEAD failed: ${head.status} ${await head.text()}`);
  }
}

async function putObject(key: string, content: Buffer): Promise<void> {
  const url = objectUrl(key);
  const res = await fetch(url, {
    method: 'PUT',
    headers: await signedHeaders('PUT', url, content),
    body: new Uint8Array(content),
  });
  if (!res.ok) {
    throw new Error(`PUT ${key} → ${res.status} ${await res.text()}`);
  }
}

/** Returns the object size, or null if it doesn't exist / can't be read. */
async function headObjectSize(key: string): Promise<number | null> {
  const url = objectUrl(key);
  const res = await fetch(url, { method: 'HEAD', headers: await signedHeaders('HEAD', url, null) });
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length'));
  return Number.isFinite(len) ? len : null;
}

/** Total bytes stored in the bucket (ListObjectsV2, paginated). */
async function bucketUsage(): Promise<number> {
  let total = 0;
  let token: string | undefined;
  do {
    const query = token
      ? `list-type=2&continuation-token=${encodeURIComponent(token)}`
      : 'list-type=2';
    const url = `${ENDPOINT}/${BUCKET}?${query}`;
    const res = await fetch(url, { method: 'GET', headers: await signedHeaders('GET', url, null) });
    if (!res.ok) {
      throw new Error(`list failed: ${res.status} ${await res.text()}`);
    }
    const xml = await res.text();
    for (const m of xml.matchAll(/<Size>(\d+)<\/Size>/g)) {
      total += Number(m[1]);
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    token = truncated && next ? next[1] : undefined;
  } while (token);
  return total;
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function main() {
  if (!ENDPOINT || !BUCKET || !ACCESS_KEY || !SECRET_KEY) {
    console.error('[migrate] S3 misconfigured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY in .env');
    process.exit(1);
  }
  if (!(await fs.stat(BASE_DIR).catch(() => null))) {
    console.error(`[migrate] Local storage dir not found: ${BASE_DIR}`);
    process.exit(1);
  }

  console.log(`[migrate] Ensuring bucket "${BUCKET}"...`);
  await ensureBucket();

  console.log('[migrate] Reading documents.files from DB...');
  const rows = await db.query.documents.findMany({
    columns: { id: true, files: true },
  });

  // Collect unique local keys referenced by documents
  const keys = new Set<string>();
  for (const row of rows) {
    for (const f of row.files || []) {
      if (!f?.startsWith('/uploads/')) continue;
      const key = f.slice('/uploads/'.length);
      // Safety: reject path traversal from dirty DB values
      if (key.split('/').some((seg) => seg === '..')) {
        console.warn(`[skip] unsafe path in db: ${f}`);
        continue;
      }
      keys.add(key);
    }
  }

  console.log(`[migrate] ${rows.length} documents, ${keys.size} unique files.`);
  if (!keys.size) {
    console.log('[migrate] Nothing to migrate.');
    return;
  }

  const usageBefore = await bucketUsage().catch(() => 0);
  console.log(`[migrate] Bucket usage before: ${usageBefore} bytes`);

  let uploaded = 0;
  let skipped = 0;
  let mismatch = 0;
  let failed = 0;

  for (const key of [...keys].sort()) {
    const local = path.join(BASE_DIR, key);

    let content: Buffer;
    try {
      content = await fs.readFile(local);
    } catch {
      console.warn(`[skip] not on disk: ${key}`);
      skipped++;
      continue;
    }

    try {
      await putObject(key, content);
      const remoteSize = await headObjectSize(key);
      if (remoteSize !== null && remoteSize !== content.length) {
        console.warn(`[mismatch] ${key}: local=${content.length} remote=${remoteSize}`);
        mismatch++;
      } else {
        console.log(`[ok] ${key} (${content.length} bytes)`);
      }
      uploaded++;
    } catch (err) {
      console.error(`[fail] ${key}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  const usageAfter = await bucketUsage().catch(() => 0);
  console.log(`[migrate] Bucket usage after: ${usageAfter} bytes`);

  console.log(
    `\nDone — ${uploaded} uploaded, ${skipped} skipped (missing locally), ` +
    `${mismatch} size mismatch, ${failed} failed.`,
  );

  // fetch keeps the event loop alive; force-exit like cron.ts
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
