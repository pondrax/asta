import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const devUrl = env.ESIGN_DEV_URL || 'https://dev-esign.mojokertokota.go.id';
  const prodUrl = env.ESIGN_URL || 'https://esign.mojokertokota.go.id';

  const cleanUrl = (u: string) => {
    if (!u) return '';
    return u.startsWith('http://') || u.startsWith('https://') ? u : `https://${u}`;
  };

  return {
    defaultDevUrl: cleanUrl(devUrl),
    defaultProdUrl: cleanUrl(prodUrl),
  };
};
