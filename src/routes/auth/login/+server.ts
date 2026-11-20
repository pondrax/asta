import { json } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { createJWT } from '#lib/server/plugins/jwt.ts';
import { verifyPasscode } from '#lib/server/passcode.ts';

export async function POST({ request, cookies }) {
  const { email, password } = await request.json();

  if (typeof email !== 'string' || typeof password !== 'string') {
    return json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: { email },
    with: { role: true },
  });

  if (!user?.password || !verifyPasscode(password, user.password)) {
    return json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const jwt = await createJWT({ userId: user.id, email: user.email });

  cookies.set('auth-token', jwt, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true
  });

  return json({ success: true });
}
