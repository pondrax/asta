import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { env } from '$env/dynamic/private';
import * as schema from './schema';
import { relations } from './relations';
import { withPlus } from './plus';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

export const dbWithPlus = drizzle(env.DATABASE_URL, { schema, relations });
export const db = withPlus(dbWithPlus);
