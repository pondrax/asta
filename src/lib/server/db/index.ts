// import type { BuildQueryResult, ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "$env/dynamic/private";
import { relations } from "./relations";

import "drizzle-plus/pg/findManyAndCount";
import "drizzle-plus/pg/updateMany";
import "drizzle-plus/pg/upsert";

if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

export const db = drizzle(env.DATABASE_URL, { relations });
