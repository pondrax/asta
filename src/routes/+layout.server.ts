import { OPENID_BASE_URL, OPENID_REALM } from '$env/static/private';

export async function load({ locals, url }) {
  if (!locals.user) {
    // throw redirect(302, '/login');
  }

  return {
    user: locals.user,
    baseURL: url.origin,
    baseURLSSO: `${OPENID_BASE_URL}/realms/${OPENID_REALM}`
  };
}
