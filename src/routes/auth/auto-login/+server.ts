import { dev } from '$app/env';
import { error, redirect } from '@sveltejs/kit';
import { verifyJWT } from '#lib/server/plugins/jwt.ts';

export async function GET({ url, cookies }) {
  if (!dev) error(404);

  const token = url.searchParams.get('token');
  if (!token) error(400, 'Missing token');

  try {
    await verifyJWT(token);
  } catch {
    error(401, 'Invalid token');
  }

  cookies.set('auth-token', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev
  });

  redirect(302, '/');
}
