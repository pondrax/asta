// src/routes/d/+page.server.js
import { redirect } from '@sveltejs/kit';

export function load({ url }) {
  // Get all query parameters from the current URL
  const params = url.searchParams.toString();
  const redirectUrl = params ? `/verify?${params}` : '/verify';

  throw redirect(308, redirectUrl);
}