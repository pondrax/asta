import crypto from "node:crypto";

/**
 * Hash a document "passcode" for storage. Salted scrypt, kept in a
 * `salt:hash` (both hex) string so verification is self-contained.
 */
export function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(passcode, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Constant-time check of a passcode against a stored `salt:hash`. */
export function verifyPasscode(passcode: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(passcode, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
