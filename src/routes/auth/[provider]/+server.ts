import { OAuth, type Providers } from '$lib/server/auth/oauth.js';
import { redirect } from '@sveltejs/kit';
export async function GET({ params }) {
  const provider = params.provider as keyof Providers;

  const oauth = new OAuth(provider);
  const { url } = oauth.getAuthUrl();

  return redirect(302, url);
}