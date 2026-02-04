import { OPENID_BASE_URL, OPENID_REALM } from '$env/static/private';
import { db } from '$lib/server/db';

export async function load({ locals, url }) {
  if (!locals.user) {
    // throw redirect(302, '/login');
  }

  const user = await db.query.users.findFirst({
    where: {
      email: locals.user?.email || '-'
    },
    with: {
      role: true,
    },
  });

  return {
    user,
    baseURL: url.origin,
    baseURLSSO: `${OPENID_BASE_URL}/realms/${OPENID_REALM}`
  };
}
