import { getRequestEvent, query } from "$app/server";
import { db } from "$lib/server/db";

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
  const event = getRequestEvent()
  const user = event.locals.user
  return {
    documents: {
      findMany: () => {
        return {
          owner: user?.email ?? '-'
        }
      }
    }
  }
}

export type GetDataParams<T extends keyof Tables> =
  { table: T } &
  Parameters<Tables[T]['findMany']>[0];

export const getData = query(
  'unchecked',
  async <T extends keyof Tables>(
    { table, ...params }: GetDataParams<T>
  ) => {
    // @ts-expect-error Drizzle type inference is not working
    params.where = Object.assign(params.where ?? {}, GUARD()[table]?.findMany() ?? {})

    // @ts-expect-error Drizzle type inference is not working
    const data = await db.query[table].findManyAndCount(params);
    return data;
  }
);
