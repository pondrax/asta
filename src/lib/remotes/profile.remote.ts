import { command, query } from "$app/server";
import { db } from "$lib/server/db";
import { signerProfiles } from "$lib/server/db/schema";
import { createId } from "$lib/utils";
import { type } from "arktype";
import { eq } from "drizzle-orm";

/**
 * Reusable signing profiles ("spesimen").
 *
 * A single email may own many profiles — e.g. one person signing for several
 * positions — so the rows returned for an email are exactly the specimen list
 * offered in /sign-v2. Profiles are keyed by email only; no BSrE lookup is
 * performed here.
 */

export const listProfiles = query(type({
  email: 'string.email',
}), async ({ email }) => {
  return db.query.signerProfiles.findMany({
    where: { email },
    orderBy: { created: 'asc' },
  });
})

export const saveProfile = command(type({
  id: 'string?',
  email: 'string.email',
  label: 'string?',
  nama: 'string?',
  jabatan: 'string?',
  pangkat: 'string?',
  instansi: 'string?',
  specimen: 'string?',
}), async (props) => {
  const { id, ...rest } = props;
  // Drop undefined so an upsert never blanks a column the caller omitted.
  const data = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );

  const profile = await db.query.signerProfiles.upsert({
    data: {
      id: id || createId(),
      ...data,
    },
    update: () => data,
  });

  return profile;
})

export const deleteProfile = command(type({
  id: 'string',
}), async ({ id }) => {
  await db.delete(signerProfiles).where(eq(signerProfiles.id, id));
  return { success: true };
})
