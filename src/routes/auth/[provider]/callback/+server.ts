import { OAuth, type Providers } from "$lib/server/auth/oauth";
import { db } from "$lib/server/db/index.js";
import { createJWT } from "$lib/server/plugins/jwt.js";
import { error, json, redirect } from "@sveltejs/kit";

export async function GET({ params, url, cookies }) {
  const provider = params.provider as keyof Providers;

  const code = url.searchParams.get('code');
  const oauth = new OAuth(provider);

  // console.log('Code:', code);
  const token = await oauth.getAccessToken(code as string);
  // console.log('Token:', token);
  const user = await oauth.getUser(token);
  // console.log('User:', user);


  const jwt = await createJWT(user);
  cookies.set('auth-token', jwt, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true
  });
  await db.query.users.upsert({
    data: {
      email: user.email,
    }
  })

  return redirect(302, '/');
  // return json({
  //   user
  // })
}