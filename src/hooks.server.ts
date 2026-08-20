import { error, redirect, type Handle, type HandleValidationError } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { verifyJWT } from '$lib/server/plugins/jwt';
import { sequence } from '@sveltejs/kit/hooks';
import { db } from '$lib/server/db';
import { startCron } from '$lib/server/cron';
import { migrateEncryption } from '$lib/../scripts/migrate-encryption';

const handleParaglide: Handle = ({ event, resolve }) => paraglideMiddleware(event.request, ({ request, locale }) => {
  event.request = request;

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
  });
});


export const handleAuth: Handle = async ({ event, resolve }) => {
  // Impersonate-token takes priority — original auth-token stays for reverting
  const impersonateToken = event.cookies.get('impersonate-token');
  const token = impersonateToken || event.cookies.get('auth-token');

  if (token) {
    try {
      const userjwt = await verifyJWT(token);

      event.locals.user = await db.query.users.findFirst({
        where: {
          email: userjwt?.email || '-'
        },
        with: {
          role: true,
          organization: true,
        },
      });

      event.locals.impersonated = !!impersonateToken;

      if (event.url.pathname.startsWith('/main')) {
        if (event.locals.user?.role.name !== 'admin') {
          return error(403, 'Forbidden. Anda tidak memiliki akses ke halaman ini');
        }
      }
    } catch {
      event.cookies.delete('auth-token', { path: '/' });
      if (impersonateToken) event.cookies.delete('impersonate-token', { path: '/' });
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


// Encapsulated migration: only runs when invoked via `bun run start -- migrate`
const [, , ...cliArgs] = process.argv;
if (cliArgs.includes('migrate')) {
  console.log('[migration] Starting...');
  try {
    await migrateEncryption();
    console.log('[migration] Done.');
  } catch (err) {
    console.error('[migration] Encryption migration failed:', err);
  }
}

startCron();

export const handleValidationError: HandleValidationError = ({ issues }) => {
  return {
    message: 'Validation Errors',
    //@ts-ignore - the summary property exists at runtime but is not in the type definition
    issues: issues?.summary || issues,
  };
};
