import { form, getRequestEvent, query } from "$app/server";
import { db } from "$lib/server/db";
import { delay } from "$lib/utils";
import { inArray } from "drizzle-orm";

type Tables = typeof db.query;

const getAuthGuard = (name: keyof Tables) => {
  const event = getRequestEvent();
  const user = event.locals.user;

  const searchable = (name: keyof Tables, search?: string) => {
    return !search
      ? []
      : Object.entries(db._.relations[name].table)
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
              // return {
              //   RAW: (t: any) =>
              //     sql`${t[key]}::text ILIKE ${'%' + search + '%'}`,
              // };
            }
          })
          .filter(Boolean);
  };
  const GUARD: Partial<Record<keyof Tables, any>> = {
    documents: {
      get: (search?: string) => {
        return {
          owner: user?.email ?? "-",
          OR: searchable(name, search),
        };
      },
    },
    users: {
      get: (search?: string) => {
        return {
          OR: searchable(name, search),
        };
      },
    },
  };
  return GUARD[name];
};

export type GetParams<T extends keyof Tables> = Parameters<
  Tables[T]["findMany"]
>[0] & {
  table: T;
  limit: number;
  offset: number;
  search?: string;
};

export const getData = query(
  "unchecked",
  async <T extends keyof Tables, Params extends GetParams<T>>({
    table,
    ...params
  }: { table: T } & Params) => {
    const time = performance.now();
    params.where = Object.assign(
      params.where ?? {},
      getAuthGuard(table)?.get(params.search) ?? {},
    );

    // @ts-expect-error Drizzle type inference is not working
    const data = await db.query[table].findManyAndCount(params);

    return Object.assign(data, {
      time: (performance.now() - time).toFixed(2) + "ms",
    });
  },
);

export const delData = form(
  "unchecked",
  async ({ table, id }: { table: keyof Tables; id: string[] }) => {
    if (!id || !table) return;
    const time = performance.now();
    const schemaTable = db._.relations[table].table;
    await delay(10000);
    const data = await db
      .delete(schemaTable)
      .where(inArray(schemaTable.id, id));

    return Object.assign(data, {
      time: (performance.now() - time).toFixed(2) + "ms",
    });
  },
);

async function xx() {
  const x = getData({
    table: "users",
    limit: 10,
    offset: 0,
    with: {
      posts: true,
    },
  });

  const d = getData({
    table: "documents",
    limit: 10,
    offset: 0,
    with: {
      user: true,
    },
  });
  d.current?.data.at(0)?.user?.email;
}
