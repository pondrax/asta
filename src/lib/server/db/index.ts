import { drizzle } from 'drizzle-orm/postgres-js';
import { relations } from './relations';
import { withPlus } from './plus';
import { resolveEnv } from './utils';

const env = await resolveEnv();

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// drizzle 1.x builds db.query from `relations` (which already embeds every
// schema table + view via defineRelations), so `schema` is not a valid key here.
export const dbWithPlus = drizzle(env.DATABASE_URL, { relations });
export const db = withPlus<typeof relations>()(dbWithPlus);
