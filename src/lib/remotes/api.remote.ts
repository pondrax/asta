import { form, getRequestEvent, query } from "$app/server";
import { db } from "$lib/server/db";
import { delay } from "$lib/utils";
import { inArray } from "drizzle-orm";

export type Tables = typeof db.query;
export type TableName = keyof Tables;
export type TableRow<T extends TableName> = Awaited<
  ReturnType<Tables[T]["findFirst"]>
>;

const searchable = (name: keyof Tables, search?: string) => {
  if (!search) return [];
  const table = (db._ as any).relations[name]?.table;
  if (!table) return [];

  return Object.entries(table)
    .filter(
      ([key, value]) =>
        value && typeof value === "object" && "columnType" in (value as any),
    )
    .map(([key, value]: [string, any]) => {
      if (value.columnType === "PgText") {
        return { [key]: { ilike: `%${search}%` } };
      }

      if (value.columnType === "PgBoolean") {
        if (search === "true" || search === "false") {
          return { [key]: { eq: search === "true" } };
        }
      }

      return null;
    })
    .filter(Boolean);
};
const getAuthGuard = (name: keyof Tables) => {
  const event = getRequestEvent();
  const user = event.locals.user;

  const GUARD: Partial<Record<keyof Tables, any>> = {
    documents: {
      get: (search?: string) => {
        return {
          AND: [
            {
              OR: [
                { owner: user?.email ?? "-" },
                { to: { arrayContains: [user?.role?.name] } },
              ],
            },
            // search ? { OR: searchable(name, search) } : {}
          ],
        };
      },
    },
    users: {
      get: (search?: string) => {
        // return search ? { OR: searchable(name, search) } : {}
      },
    },
    roles: {
      get: (search?: string) => {
        // return search ? { OR: searchable(name, search) } : {}
      },
    },
    organizations: {
      get: (search?: string) => {
        // return search ? { OR: searchable(name, search) } : {}
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
    const conditions = [];

    if (params.where) {
      conditions.push(params.where);
    }

    const guard = getAuthGuard(table)?.get?.(params.search);
    if (guard && Object.keys(guard).length > 0) {
      conditions.push(guard);
    }

    const search = searchable(table, params.search);
    if (search.length > 0) {
      conditions.push({ OR: search });
    }

    if (conditions.length > 0) {
      params.where =
        conditions.length === 1 ? conditions[0] : { AND: conditions };
    }

    // await delay(3000)
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
    // await delay(10000)
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
