import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';

export async function load({ locals, url }) {
  if (!locals.user) {
    // throw redirect(302, '/login');
  }

  return {
    user: locals.user,
    baseURL: url.origin,
    baseURLSSO: `${env.OPENID_BASE_URL}/realms/${env.OPENID_REALM}`
  };
}
