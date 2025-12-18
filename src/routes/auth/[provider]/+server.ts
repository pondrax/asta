import { OAuth, type Providers } from '$lib/server/auth/oauth.js';
import config from '$lib/server/auth/providers/config.js';
import { redirect } from '@sveltejs/kit';
export async function GET({ params, request }) {
  const provider = params.provider as keyof Providers;

  const oauth = new OAuth(provider);
  const { state, url } = oauth.getAuthUrl();

  // console.log(state, url);

  return redirect(302, url);
  // return Response.redirect(url);
}