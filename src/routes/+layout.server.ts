export async function load({ locals, url }) {
  if (!locals.user) {
    // throw redirect(302, '/login');
  }

  return {
    user: locals.user,
    baseURL: url.origin
  };
}
