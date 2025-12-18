import { json } from '@sveltejs/kit';
import { createJWT } from '$lib/server/plugins/jwt';

export async function POST({ request, cookies }) {
  const { email, password } = await request.json();

  // 🔒 replace with DB check
  if (email !== 'admin@test.com' || password !== '123') {
    return json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const jwt = await createJWT({ userId: 1, email });

  cookies.set('auth-token', jwt, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true
  });

  return json({ success: true });
}
