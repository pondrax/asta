import { init } from '@paralleldrive/cuid2';
import crypto from 'node:crypto';
import { customType, text, timestamp } from 'drizzle-orm/pg-core';
// // import { env } from '$env/dynamic/private';
// console.log(process.env.APP_SECRET)

const key = crypto.createHash('sha256').update(String(process.env.APP_SECRET)).digest(); // 32 bytes
const GCM_IV_LENGTH = 12; // GCM recommended IV length
const CBC_IV_LENGTH = 16; // AES block size (for legacy fallback)

/** Check if a value looks like old CBC format (no auth tag = 2 parts) */
export function isLegacyCBC(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 2;
}

function encrypt(value: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:encrypted:authTag (all hex)
  return iv.toString('hex') + ':' + encrypted.toString('hex') + ':' + authTag.toString('hex');
}

function decrypt(value: string): string {
  const parts = value.split(':');

  // New GCM format: iv:encrypted:authTag (3 parts)
  if (parts.length === 3) {
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  // Legacy CBC format: iv:encrypted (2 parts) — fallback
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Re-encrypt a CBC-encrypted value to GCM. Used by migration. */
export function reEncryptToGCM(cbcValue: string): string {
  const plaintext = decrypt(cbcValue); // uses CBC fallback
  return encrypt(plaintext); // outputs GCM
}
const createId = init({ length: 15 });

export const id = text('id').primaryKey().$default(() => createId());
export const created = timestamp('created', { mode: 'string', withTimezone: true })
  .defaultNow()
export const updated = timestamp('updated', { mode: 'string', withTimezone: true })
  .defaultNow()
  .$onUpdate(() => new Date().toISOString());


export const encryptedText = customType<{ data: string }>({
  dataType() {
    return 'text';
  },
  fromDriver(value: unknown) {
    try {
      return decrypt(String(value));
    } catch (e) {
      return String(value);
    }
  },
  toDriver(value: string) {
    return encrypt(value);
  }
});


export const encryptedJson = customType<{ data: string }>({
  dataType() {
    return 'text';
  },
  fromDriver(value: unknown) {
    try {
      return JSON.parse(decrypt(String(value)));
    } catch (e) {
      return String(value);
    }
  },
  toDriver(value: string) {
    return encrypt(JSON.stringify(value));
  }
});