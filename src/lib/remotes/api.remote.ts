import { getRequestEvent, query } from "$app/server";
import { db } from "$lib/server/db";
import { sql } from "drizzle-orm";

type Tables = typeof db.query;

// export const getData = query('unchecked', async <
//   T extends keyof Tables,
//   Params extends Parameters<Tables[T]['findMany']>[0]
// >({ table, ...params }: { table: T } & Params) => {
//   // @ts-expect-error Drizzle type inference is not working with dynamic table names
//   const data = await db.query[table].findMany(params)

//   return data
// })

const GUARD = () => {
  const event = getRequestEvent();
  const user = event.locals.user;
  return {
    documents: {
      get: (search?: string) => {
        const searchable = Object.entries(
          db._.relations.documents.table.$inferSelect || {},
        );
        const searchableKeys = Object.entries(db._.relations.documents.table)
          .filter(([key, value]) => typeof value === "object")
          .map(([key, value]) => {
            // console.log(value.columnType)
            if (value.columnType === "PgText") {
              return { [key]: { ilike: `%${search}%` } };
            }

            if (value.columnType === "PgBoolean") {
              if (search === "true" || search === "false") {
                return { [key]: { eq: search === "true" } };
              }
              return null;
            }

            if (
              value.columnType === "PgInteger" ||
              value.columnType === "PgFloat" ||
              value.columnType === "PgTimestampString" ||
              value.columnType === "PgArray" ||
              value.columnType === "PgJson"
            ) {
              return {
                RAW: (t: any) =>
                  sql`${t[key]}::text ILIKE ${"%" + search + "%"}`,
              };
            }
          })
          .filter(Boolean);
        // console.log(searchableKeys)

        return {
          owner: user?.email ?? "-",
          OR: searchableKeys,
        };
      },
    },
  };
};

type Params<T extends keyof Tables> = Parameters<Tables[T]["findMany"]>[0];
export type GetDataParams<T extends keyof Tables> = Params<T> & {
  limit: number;
  offset: number;
  search?: string;
};

export const getData = query(
  "unchecked",
  async <T extends keyof Tables>({
    table,
    ...params
  }: { table: T } & GetDataParams<T>) => {
    const time = performance.now();
    // @ts-expect-error Drizzle type inference is not working
    params.where = Object.assign(
      params.where ?? {},
      GUARD()[table]?.get(params.search) ?? {},
    );

    // @ts-expect-error Drizzle type inference is not working
    const data = await db.query[table].findManyAndCount(params);
    return Object.assign(data, {
      time: (performance.now() - time).toFixed(2) + "ms",
    });
  },
);

// const x= getData({
//   table: 'documents',
//   limit: 10,
//   offset: 0,
//   search: 'test',
//   extras
// })
