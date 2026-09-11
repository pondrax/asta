/**
 * Backfill `documents.histories` for older non-draft documents.
 *
 * The current sign flow records authoritatively in `histories[].signer`, but
 * documents created before that had no `histories` AND a `signer` that was
 * deliberately nulled on save. For those rows the only remaining attribution is
 * the document `owner`, which for self-service e-signing equals the signer.
 *
 * Generic for all users: every non-draft document (status != 'draft') with no
 * histories and no signer gets a single history entry attributed to its owner,
 * using `updated` (falling back to `created`) as `signedAt`. Rows without an
 * owner are skipped (cannot be attributed).
 *
 * Safe to re-run any number of times — filled rows are skipped.
 *
 * Usage:
 *   bun run migrate:histories
 */
import { sql } from 'drizzle-orm';
import { db } from '../lib/server/db';
import { documents } from '../lib/server/db/schema';

const HISTORY_STATUS: 'signed' = 'signed';

async function main() {
  const rows = await db
    .select({
      id: documents.id,
      owner: documents.owner,
      signer: documents.signer,
      status: documents.status,
      created: documents.created,
      updated: documents.updated,
    })
    .from(documents)
    .where(sql`
      ${documents.status} != 'draft'
      and ${documents.signer} is null
      and (
        ${documents.histories} is null
        or jsonb_array_length(${documents.histories}) = 0
      )
    `);

  console.log(`[migrate:histories] ${rows.length} non-draft document(s) missing histories.`);

  let filled = 0;
  let skipped = 0;

  for (const row of rows) {
    const signedAt = row.updated ?? row.created;
    if (!row.owner || !signedAt) {
      console.warn(`[skip] ${row.id}: no owner/signedAt to attribute (owner=${row.owner ?? '-'})`);
      skipped++;
      continue;
    }

    await db.update(documents)
      .set({
        histories: [{
          signer: row.owner,
          signedAt,
          status: HISTORY_STATUS,
        }],
      })
      .where(sql`${documents.id} = ${row.id}`);

    filled++;
    console.log(`[migrate] ${row.id} (${row.status}) → ${row.owner} @ ${signedAt}`);
  }

  console.log(`[migrate:histories] done. filled=${filled}, skipped=${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrate:histories] failed:', err);
  process.exit(1);
});