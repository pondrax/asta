import { OAuth, type Providers } from '$lib/server/auth/oauth.js';
import config from '$lib/server/auth/providers/config.js';
export async function GET({ params, request }) {
  const provider = params.provider;

  const oauth = new OAuth('openid',
    config.openid,
  );
  const { state, url } = oauth.getAuthUrl();

  console.log(state, url);
  return Response.redirect(url);
}