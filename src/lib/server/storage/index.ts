import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import { createId } from '$lib/utils';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended IV length
const KEY = Buffer.from(env.APP_SECRET || 'secret-key').subarray(0, 32);

function encrypt(buffer: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function decrypt(buffer: Buffer): Buffer | null {
  try {
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = buffer.subarray(IV_LENGTH + 16);
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch (e) {
    // Fallback: legacy CBC files (no auth tag, 16-byte IV)
    try {
      const iv = buffer.subarray(0, 16);
      const encrypted = buffer.subarray(16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch {
      return null;
    }
  }
}

// Type definitions
export interface StorageConfig {
  provider?: 'local' | 'vercel' | 's3';
  baseDir?: string;
}

export interface StorageResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

// Determine provider from environment or config
function getProvider(config?: StorageConfig): 'local' | 'vercel' | 's3' {
  if (config?.provider) return config.provider;
  const envProvider = env.STORAGE_PROVIDER as 'local' | 'vercel' | 's3' | undefined;
  return envProvider || 'local';
}

function getBaseDir(config?: StorageConfig): string {
  return config?.baseDir || env.STORAGE_BASE_DIR || './uploads';
}

function getVercelToken(): string {
  return env.BLOB_READ_WRITE_TOKEN || '';
}

// ---------------------------------------------------------------------------
// S3-compatible storage (rustfs / MinIO) — no SDK, raw fetch + AWS SigV4
// ---------------------------------------------------------------------------

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

// Add a random 4-char suffix before the extension to avoid collisions
function uniquify(filename: string): string {
  const suffix = createId(4);
  return filename.replace(/(\.[^/.]+)$/, `.${suffix}$1`);
}

interface S3Options {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKey: string;
  secretKey: string;
}

class S3Storage {
  private endpoint: string;
  private bucket: string;
  private region: string;
  private accessKey: string;
  private secretKey: string;
  private bucketReady?: Promise<void>;

  constructor(opts: S3Options) {
    if (!opts.endpoint || !opts.bucket || !opts.accessKey || !opts.secretKey) {
      throw new Error(
        'S3 storage misconfigured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY env vars.',
      );
    }
    this.endpoint = opts.endpoint.replace(/\/+$/, '');
    this.bucket = opts.bucket;
    this.region = opts.region || 'us-east-1';
    this.accessKey = opts.accessKey;
    this.secretKey = opts.secretKey;
  }

  /** Path-style URL: endpoint/bucket/encoded-key (required for MinIO/rustfs) */
  private objectUrl(key: string): string {
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `${this.endpoint}/${this.bucket}/${encoded}`;
  }

  /** Ensure the bucket exists (HEAD; create on 404). Idempotent per instance. */
  private ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = this.doEnsureBucket();
    }
    return this.bucketReady;
  }

  private async doEnsureBucket(): Promise<void> {
    const url = `${this.endpoint}/${this.bucket}`;
    const head = await fetch(url, {
      method: 'HEAD',
      headers: await this.signedHeaders('HEAD', url, null),
    });
    if (head.status === 404 || head.status === 403) {
      const put = await fetch(url, {
        method: 'PUT',
        headers: await this.signedHeaders('PUT', url, null),
      });
      if (!put.ok && put.status !== 409) {
        throw new Error(`S3 create bucket failed: ${put.status} ${await put.text()}`);
      }
    } else if (!head.ok) {
      throw new Error(`S3 bucket HEAD failed: ${head.status} ${await head.text()}`);
    }
  }

  /** Build SigV4-signed headers for a request. */
  private async signedHeaders(
    method: string,
    url: string,
    payload: Buffer | null,
    extra: Record<string, string> = {},
  ): Promise<Record<string, string>> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;

    const parsed = new URL(url);
    const canonicalUri = parsed.pathname || '/';
    // Search params are already encoded; sort them for the canonical form
    const canonicalQuery = [...parsed.searchParams.entries()]
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .sort()
      .join('&');

    const payloadHash = payload ? sha256Hex(payload) : EMPTY_SHA256;

    const headers: Record<string, string> = {
      host: parsed.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...extra,
    };

    const canonicalHeaders = Object.entries(headers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}\n`)
      .join('');

    const signedHeaders = Object.keys(headers)
      .sort()
      .map((k) => k.toLowerCase())
      .join(';');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = hmac(`AWS4${this.secretKey}`, dateStamp);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    return {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
  }

  async save(filename: string, content: Buffer | string): Promise<StorageResult> {
    try {
      await this.ensureBucket();

      filename = uniquify(filename);
      const buffer = typeof content === 'string' ? Buffer.from(content) : content;
      const url = this.objectUrl(filename);

      const response = await fetch(url, {
        method: 'PUT',
        headers: await this.signedHeaders('PUT', url, buffer, {
          'content-type': 'application/octet-stream',
        }),
        // Uint8Array is a valid BodyInit (Buffer itself isn't per TS types)
        body: new Uint8Array(buffer),
      });

      if (!response.ok) {
        throw new Error(`S3 PUT failed: ${response.status} ${await response.text()}`);
      }

      return {
        success: true,
        path: filename,
        url: `/uploads/${filename}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `S3 storage error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async read(filename: string): Promise<ArrayBuffer> {
    try {
      await this.ensureBucket();
      const url = this.objectUrl(filename);
      const response = await fetch(url, {
        method: 'GET',
        headers: await this.signedHeaders('GET', url, null),
      });

      if (!response.ok) {
        throw new Error(`S3 GET failed: ${response.status}`);
      }
      return await response.arrayBuffer();
    } catch (error) {
      throw new Error(`S3 storage read error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(filename: string): Promise<StorageResult> {
    try {
      await this.ensureBucket();
      const url = this.objectUrl(filename);
      const response = await fetch(url, {
        method: 'DELETE',
        headers: await this.signedHeaders('DELETE', url, null),
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`S3 DELETE failed: ${response.status}`);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `S3 storage delete error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Total bytes stored in the bucket.
   * Lists all objects (ListObjectsV2, paginated) and sums their sizes.
   */
  async usage(): Promise<number> {
    await this.ensureBucket();
    let total = 0;
    let token: string | undefined;

    do {
      const query = token
        ? `list-type=2&continuation-token=${encodeURIComponent(token)}`
        : 'list-type=2';
      const url = `${this.endpoint}/${this.bucket}?${query}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: await this.signedHeaders('GET', url, null),
      });

      if (!response.ok) {
        throw new Error(`S3 ListObjectsV2 failed: ${response.status} ${await response.text()}`);
      }

      const xml = await response.text();

      // Sum the <Size> of every object returned on this page
      for (const match of xml.matchAll(/<Size>(\d+)<\/Size>/g)) {
        total += Number(match[1]);
      }

      const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
      const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
      token = truncated && next ? next[1] : undefined;
    } while (token);

    return total;
  }
}

// Local file storage implementation
class LocalStorage {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async save(filename: string, content: Buffer | string): Promise<StorageResult> {
    try {
      // Create full directory path including any subdirectories in the filename
      const fullPath = path.join(this.baseDir, filename);
      const dirname = path.dirname(fullPath);

      // Recursively create directory structure if it doesn't exist
      await fs.mkdir(dirname, { recursive: true });

      const suffix = createId(4);
      filename = filename.replace(/(\.[^/.]+)$/, `.${suffix}$1`);

      const filepath = path.join(this.baseDir, filename);
      const buffer = typeof content === 'string' ? Buffer.from(content) : content;

      await fs.writeFile(filepath, buffer);

      return {
        success: true,
        path: filepath,
        url: `/uploads/${filename}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Local storage error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async read(filename: string): Promise<ArrayBuffer> {
    try {
      const filepath = path.join(this.baseDir, filename);
      return (await fs.readFile(filepath)).buffer;

    } catch (error) {
      throw new Error(`Local storage read error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(filename: string): Promise<StorageResult> {
    try {
      const filepath = path.join(this.baseDir, filename);
      await fs.unlink(filepath);

      return {
        success: true,
        path: filepath,
      };
    } catch (error) {
      return {
        success: false,
        error: `Local storage delete error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// Vercel Blob storage implementation
class VercelBlobStorage {
  private token: string;
  private apiUrl = 'https://blob.vercel-storage.com';

  constructor(token: string) {
    if (!token) {
      throw new Error('Vercel Blob token not found. Set BLOB_READ_WRITE_TOKEN env var.');
    }
    this.token = token;
  }

  async save(filename: string, content: Buffer | string): Promise<StorageResult> {
    try {
      const buffer = typeof content === 'string' ? Buffer.from(content) : content;

      const response = await fetch(`${this.apiUrl}/${filename}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/octet-stream',
        },
        //@ts-ignore - Buffer is assignable to BodyInit at runtime but TS complains
        body: buffer,
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Vercel Blob API error: ${response.status} - ${errorData}`);
      }

      const data = await response.json() as { url: string };

      return {
        success: true,
        url: data.url,
      };
    } catch (error) {
      return {
        success: false,
        error: `Vercel Blob error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async read(filename: string): Promise<ArrayBuffer> {
    try {
      const response = await fetch(`${this.apiUrl}/get/${filename}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to read file: ${response.status}`);
      }
      return await response.arrayBuffer();
      // return {
      //   success: true,
      //   url: `${this.apiUrl}/get/${filename}`,
      // };
    } catch (error) {
      throw new Error(`Vercel Blob read error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(filename: string): Promise<StorageResult> {
    try {
      const response = await fetch(`${this.apiUrl}/delete/${filename}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.status}`);
      }

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: `Vercel Blob delete error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// Main storage factory with global env config
export class FileStorage {
  private storage: LocalStorage | VercelBlobStorage | S3Storage;
  private _provider: 'local' | 'vercel' | 's3';

  constructor(config?: StorageConfig) {
    this._provider = getProvider(config);

    if (this._provider === 'vercel') {
      const token = getVercelToken();
      this.storage = new VercelBlobStorage(token);
    } else if (this._provider === 's3') {
      this.storage = new S3Storage({
        endpoint: env.S3_ENDPOINT || '',
        bucket: env.S3_BUCKET || '',
        region: env.S3_REGION,
        accessKey: env.S3_ACCESS_KEY_ID || '',
        secretKey: env.S3_SECRET_ACCESS_KEY || '',
      });
    } else {
      const baseDir = getBaseDir(config);
      this.storage = new LocalStorage(baseDir);
    }
  }

  /** Active storage provider */
  get provider(): 'local' | 'vercel' | 's3' {
    return this._provider;
  }

  /**
   * Total bytes stored — only meaningful for S3 (sum of all object sizes).
   * Returns null when not using the S3 provider.
   */
  async getUsage(): Promise<number | null> {
    if (this.storage instanceof S3Storage) {
      return await this.storage.usage();
    }
    return null;
  }

  async save(filename: string, content: Buffer | ArrayBuffer | string): Promise<StorageResult> {
    const buffer = Buffer.isBuffer(content)
      ? content
      : content instanceof ArrayBuffer
        ? Buffer.from(content)
        : Buffer.from(content);

    const encrypted = encrypt(buffer);
    return await this.storage.save(`${filename}.enc`, encrypted);
  }

  async read(filename: string): Promise<ArrayBuffer> {
    const content = await this.storage.read(filename);
    const buffer = Buffer.from(content);
    const decrypted = decrypt(buffer);

    if (decrypted) {
      const arrayBuffer = new ArrayBuffer(decrypted.length);
      const view = new Uint8Array(arrayBuffer);
      view.set(decrypted);
      return arrayBuffer;
    }
    return content;
  }

  delete(filename: string): Promise<StorageResult> {
    return this.storage.delete(filename);
  }
}