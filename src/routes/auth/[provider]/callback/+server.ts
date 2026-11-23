import { OAuth, type Providers } from "#lib/server/auth/oauth.ts";
import { db } from "#lib/server/db/index.ts";
import { createJWT } from "#lib/server/plugins/jwt.ts";
import { redirect } from "@sveltejs/kit";

export async function GET({ params, url, cookies }) {
  const provider = params.provider as keyof Providers;

  const code = url.searchParams.get('code');
  const oauth = new OAuth(provider);

  const token = await oauth.getAccessToken(code as string);
  const user = await oauth.getUser(token);

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
}