import { redirect } from '@sveltejs/kit';

export async function GET({ cookies }) {
  cookies.delete('auth-token', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true
  });
  return redirect(302, '/');
}