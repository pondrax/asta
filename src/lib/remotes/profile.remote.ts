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
 * offered in /sign. Profiles are keyed by email only.
 *
 * The BSrE account (`bsre_users`) is a separate source used as the default:
 * when an email has no saved profile yet, {@link getBsreProfile} supplies the
 * identity so the signer never has to type what the account already holds.
 */

/**
 * Identity for a signer, in the same shape as a saved profile.
 *
 * `id` is namespaced (`bsre:<row id>`) so a client can never mistake it for a
 * `signer_profiles` row and try to save or delete it as one.
 */
export type ProfileIdentity = {
  id: string;
  email: string;
  label: string | null;
  nama: string | null;
  jabatan: string | null;
  pangkat: string | null;
  instansi: string | null;
  specimen: string | null;
  /** True when this came from `bsre_users` rather than a saved profile. */
  derived?: boolean;
};

/**
 * Look the signer up in `bsre_users`. Matched on the e-mail address first, then
 * on the BSrE login name (which is an e-mail too). Returns `null` when the
 * account is unknown — never throws, so a missing account just means "no
 * default identity".
 */
export const getBsreProfile = query(
  type({ email: "string.email" }),
  async ({ email }): Promise<ProfileIdentity | null> => {
    // `ilike` is how this codebase does case-insensitive matching, but `_` and
    // `%` are wildcards and an address like `budi_santoso@…` would otherwise
    // match a different row — escape them for a case-insensitive exact match.
    const exact = email.replace(/([\\%_])/g, "\\$1");
    const user =
      (await db.query.bsreUsers.findFirst({
        where: { emailAddress: { ilike: exact } },
      })) ??
      (await db.query.bsreUsers.findFirst({
        where: { username: { ilike: exact } },
      }));

    if (!user?.id) return null;

    // BSrE writes "-" for unset columns; treat those as genuinely empty so a
    // label or field never ends up displaying a dash.
    const or = (...vals: (string | null | undefined)[]) =>
      vals.find((v) => v && v !== "-") ?? null;

    return {
      id: `bsre:${user.id}`,
      email: user.emailAddress || email,
      label: or(user.jabatanOrganisasi, user.organisasi, user.nama),
      nama: or(user.nama),
      jabatan: or(user.jabatanOrganisasi),
      pangkat: null,
      instansi: or(user.organisasi, user.organisasiUnit),
      specimen: null,
      derived: true,
    };
  },
);

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
