
import { init } from '@paralleldrive/cuid2';
import crypto from 'node:crypto';
import { customType, text, timestamp } from 'drizzle-orm/pg-core';
// import { env } from '$env/dynamic/private';
// console.log(process.env.APP_SECRET)
const algorithm = 'aes-256-cbc';
const key = crypto.createHash('sha256').update(String(process.env.APP_SECRET)).digest(); // 32 bytes
const ivLength = 16; // AES block size

function encrypt(value: string): string {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(value: string): string {
  const [ivHex, encryptedHex] = value.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
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