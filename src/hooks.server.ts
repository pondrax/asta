import { redirect, type Handle, type HandleValidationError } from '@sveltejs/kit';
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


const getUserByToken = async (token: string) => {
  const userjwt = await verifyJWT(token);
  return db.query.users.findFirst({
    where: {
      email: userjwt?.email || '-'
    },
    with: {
      role: true,
      organization: true,
    },
  });
};

const revertImpersonation = async (event: Parameters<Handle>[0]['event']) => {
  event.cookies.delete('impersonate-token', { path: '/' });
  event.locals.impersonated = false;
  try {
    const adminToken = event.cookies.get('auth-token');
    if (!adminToken) {
      event.locals.user = null;
      return;
    }
    event.locals.user = await getUserByToken(adminToken);
  } catch {
    event.locals.user = null;
  }
};

export const handleAuth: Handle = async ({ event, resolve }) => {
  // Impersonate-token takes priority — original auth-token stays for reverting
  const impersonateToken = event.cookies.get('impersonate-token');
  const token = impersonateToken || event.cookies.get('auth-token');

  if (!token) {
    return resolve(event);
  }

  try {
    event.locals.user = await getUserByToken(token);
    event.locals.impersonated = !!impersonateToken;

    // Safety net: if an impersonated (non-admin) user hits an admin-only
    // path, drop the impersonation and fall back to the original admin
    // session instead of forcing a re-login.
    if (event.url.pathname.startsWith('/main') && impersonateToken) {
      await revertImpersonation(event);
    }

    // The admin check itself lives in `(asta)/main/+layout.server.ts`. An
    // error thrown from a hook is answered with SvelteKit's built-in error
    // page instead of the app's own `+error.svelte`, so it has to be thrown
    // from a `load` to get the real error page.
  } catch {
    event.cookies.delete('auth-token', { path: '/' });
    event.cookies.delete('impersonate-token', { path: '/' });
  }

  return resolve(event);
};
export const handleRedirect: Handle = ({ event, resolve }) => {
  if (event.url.pathname === '/asta') {
    return redirect(302, '/');
  }
  if (event.url.pathname === '/d' || event.url.pathname === '/verify') {
    // Verification now lives in the /sign modal; keep old links working.
    const params = new URLSearchParams(event.url.search);
    if (!params.has('verify')) params.set('verify', '1');
    return redirect(302, `/sign?${params.toString()}`);
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
