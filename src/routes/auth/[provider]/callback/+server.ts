import { OAuth, type Providers } from "$lib/server/auth/oauth";
import { error, json } from "@sveltejs/kit";

export async function GET({ params, url }) {
  const provider = params.provider as keyof Providers;

  const code = url.searchParams.get('code');
  const oauth = new OAuth(provider);

  const token = await oauth.getAccessToken(code as string);
  console.log('Token:', token);
  const user = await oauth.getUser(token);
  console.log('User:', user);


  return json({
    user
  })
}