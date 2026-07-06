/**
 * Re-encrypt all CBC-encrypted metadata to AES-256-GCM.
 * Runs once on server start — skips if no legacy data found.
 */
import { db } from '.';
import { documents } from './schema';
import { isLegacyCBC, reEncryptToGCM } from './utils';
import { sql } from 'drizzle-orm';

export async function migrateEncryption(): Promise<void> {
  console.log('[migration] Checking for CBC-encrypted data to re-encrypt...');

  // Find all rows where metadata looks like CBC (2-part hex, no auth tag)
  const rows = await db
    .select({ id: documents.id, metadata: documents.metadata })
    .from(documents)
    .where(sql`${documents.metadata} IS NOT NULL`);

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.metadata || !isLegacyCBC(row.metadata)) {
      skipped++;
      continue;
    }

    try {
      const gcmValue = reEncryptToGCM(row.metadata);
      await db
        .update(documents)
        .set({ metadata: gcmValue })
        .where(sql`${documents.id} = ${row.id}`);
      migrated++;
    } catch (err) {
      console.error(`[migration] Failed to migrate document ${row.id}:`, err);
    }
  }

  if (migrated > 0) {
    console.log(`[migration] Re-encrypted ${migrated} documents from CBC → GCM`);
  } else {
    console.log('[migration] No legacy CBC data found — nothing to migrate');
  }
}
