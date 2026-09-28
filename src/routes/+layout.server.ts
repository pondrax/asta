import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import { parseConsent, CONSENT_COOKIE } from '$lib/app/cookie-consent';

export async function load({ locals, url, cookies }) {
  if (!locals.user) {
    // throw redirect(302, '/login');
  }

  return {
    user: locals.user,
    impersonated: locals.impersonated === true,
    baseURL: url.origin,
    baseURLSSO: `${env.OPENID_BASE_URL}/realms/${env.OPENID_REALM}`,
    // Read on the server so the consent banner is decided during SSR. Reading
    // it on the client instead would flash the banner in after hydration for
    // visitors who already answered.
    consent: parseConsent(cookies.get(CONSENT_COOKIE))
  };
}
