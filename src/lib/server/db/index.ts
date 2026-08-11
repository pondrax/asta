import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { relations } from './relations';
import { withPlus } from './plus';
import { resolveEnv } from './utils';

const env = await resolveEnv();

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

export const dbWithPlus = drizzle(env.DATABASE_URL, { schema, relations });
export const db = withPlus<typeof relations>()(dbWithPlus);
