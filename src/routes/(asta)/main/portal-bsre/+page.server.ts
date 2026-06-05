import type { PageServerLoad } from './$types';

// Access is already guarded by hooks.server.ts (role === 'admin' for /main/*)
export const load: PageServerLoad = async ({ locals }) => {
  return {
    user: locals.user,
  };
};
