import { error, redirect, type Handle, type HandleValidationError } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { verifyJWT } from '$lib/server/plugins/jwt';
import { sequence } from '@sveltejs/kit/hooks';
import { db } from '$lib/server/db';
import { startCron } from '$lib/server/cron';
import { migrateEncryption } from '$lib/server/db/migrate-encryption';

const handleParaglide: Handle = ({ event, resolve }) => paraglideMiddleware(event.request, ({ request, locale }) => {
  event.request = request;

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
  });
});


export const handleAuth: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('auth-token');

  if (token) {
    try {
      const userjwt = await verifyJWT(token);

      event.locals.user = await db.query.users.findFirst({
        where: {
          email: userjwt?.email || '-'
        },
        with: {
          role: true,
        },
      });

      if (event.url.pathname.startsWith('/main')) {
        if (event.locals.user?.role.name !== 'admin') {
          return error(403, 'Forbidden. Anda tidak memiliki akses ke halaman ini');
        }
      }
    } catch {
      event.cookies.delete('auth-token', { path: '/' });
    }
  } else {
    if (event.url.pathname.startsWith('/main')) {
      if (event.locals.user?.role.name === 'admin') {
        return resolve(event);
      }
      return error(403, 'Forbidden. Anda tidak memiliki akses ke halaman ini');
    }
  }

  return resolve(event);
};
export const handleRedirect: Handle = ({ event, resolve }) => {
  if (event.url.pathname === '/asta') {
    return redirect(302, '/');
  }
  if (event.url.pathname === '/d') {
    return redirect(302, `/verify${event.url.search}`);
  }

  return resolve(event);
};
export const handle: Handle = sequence(handleParaglide, handleAuth, handleRedirect);


startCron();
try {
  await migrateEncryption();
} catch (err) {
  console.error('[migration] Encryption migration failed:', err);
}

export const handleValidationError: HandleValidationError = ({ issues }) => {
  return {
    message: 'Validation Errors',
    //@ts-ignore - the summary property exists at runtime but is not in the type definition
    issues: issues?.summary || issues,
  };
};
