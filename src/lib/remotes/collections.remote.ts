import { query, form } from "$app/server";
import { db } from '$lib/server/db';
import { checkAdmin } from '$lib/utils/server';
import { eq, inArray, getColumns } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';

export interface CollectionSchema {
  name: string;
  columns: {
    key: string;
    name: string;
    type: string;
    isId: boolean;
    isNullable: boolean;
    isArray: boolean;
    defaultValue: any;
  }[];
}

export const getCollections = query('unchecked', async () => {
  checkAdmin();
  // In Drizzle RQB, db.query keys are our tables
  const tableNames = Object.keys(db.query);
  const result = tableNames.map((name) => {
    // Use the schema import directly (fullSchema removed in drizzle-orm 1.0.0-rc.4)
    const table = (schema as any)[name];
    const columns = table ? getColumns(table) : {};

    // console.log(table);
    return {
      name,
      columns: Object.entries(columns).map(([key, col]: [string, any]) => ({
        key,
        name: col.name,
        header: key.replace(/_/g, ' '),
        type: col.columnType,
        isId: col.primary || key === 'id',
        isNullable: !col.notNull,
        isArray: (col as any).array === true || col.columnType.includes('Array'),
        defaultValue: col.default,
      }))

    };
  });

  return JSON.parse(JSON.stringify(result));
});

export const getCollectionData = query('unchecked', async (params: {
  table: string;
  limit: number;
  offset: number;
  where?: Record<string, any>;
  orderBy?: any;
  search?: string;
}) => {

  checkAdmin();
  const { table, limit, offset, where = {}, search } = params;
  const time = performance.now();

  //@ts-ignore - db.query[table] is a dynamic index access on the query builder
  const qb = db.query[table];
  if (!qb) return { data: [], count: 0 };

  // Build search conditions using RQB object filter format (for relationsFilterToSQL)
  const conditions: any[] = [];

  if (where && Object.keys(where).length > 0) {
    const filterWhere: Record<string, any> = {};
    for (const [k, v] of Object.entries(where)) {
      if (v == null || v === '') continue;
      filterWhere[k] = typeof v === 'string' ? { ilike: `%${v}%` } : { eq: v };
    }
    if (Object.keys(filterWhere).length > 0) conditions.push(filterWhere);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    const tableObj = (schema as any)[table];
    if (tableObj) {
      const columns = getColumns(tableObj);
      const orSearch = Object.entries(columns)
        .filter(([, col]: [string, any]) => col.columnType === 'PgText')
        .map(([key]) => ({ [key]: { ilike: term } }));
      if (orSearch.length > 0) conditions.push({ OR: orSearch });
    }
  }

  const mergedWhere = conditions.length === 0 ? undefined
    : conditions.length === 1 ? conditions[0]
      : { AND: conditions };

  // `orderBy` keys arrive from the client, so only keep entries that resolve to
  // a real column with a known direction. A stable tiebreaker on the primary
  // key keeps offset pagination from skipping/duplicating rows when the
  // requested sort has ties.
  const orderBy = buildOrderBy(table, params.orderBy);

  const data = await qb.findManyAndCount({
    limit,
    offset,
    where: mergedWhere,
    orderBy,
  });

  return JSON.parse(JSON.stringify({
    data: data.data,
    count: data.count,
    time: `${(performance.now() - time).toFixed(2)}ms`
  }));
});

/**
 * Turn a client-supplied `orderBy` object into a validated RQB orderBy.
 *
 * The keys come from the browser, so anything that isn't a real column of the
 * table with an `asc`/`desc` direction is dropped rather than forwarded to
 * drizzle (which would fall back to `sql.identifier(target)` for unknown keys).
 *
 * When sorting is active we append the primary key as a tiebreaker so that
 * offset pagination stays stable — without it, rows with equal sort values can
 * be skipped or repeated across pages.
 */
function buildOrderBy(table: string, orderBy: unknown): Record<string, 'asc' | 'desc'> | undefined {
  if (!orderBy || typeof orderBy !== 'object' || Array.isArray(orderBy)) return undefined;

  const tableObj = (schema as any)[table];
  if (!tableObj) return undefined;

  const columns = getColumns(tableObj);
  const result: Record<string, 'asc' | 'desc'> = {};

  for (const [key, dir] of Object.entries(orderBy as Record<string, unknown>)) {
    if (dir !== 'asc' && dir !== 'desc') continue;
    if (!(key in columns)) continue;
    result[key] = dir;
  }

  // Stable tiebreaker so paging never repeats or skips rows on tied values.
  // Only applied when a real sort was requested — with no sort we keep the
  // previous unsorted behaviour.
  if (Object.keys(result).length) {
    const pk = Object.entries(columns).find(([, col]: [string, any]) => col.primary);
    if (pk && !(pk[0] in result)) result[pk[0]] = 'asc';
  }

  return Object.keys(result).length ? result : undefined;
}

export const upsertData = form('unchecked', async (params: { table: string, data: any }) => {
  checkAdmin();
  const { table, data } = params;

  const tableObj = (schema as any)[table];
  if (!tableObj) throw new Error('Table not found');

  if (data.id) {
    //@ts-ignore - tableObj is dynamic and db.update expects a typed table
    await db.update(tableObj).set(data).where(eq(tableObj.id, data.id));
  } else {
    //@ts-ignore - tableObj is dynamic and db.insert expects a typed table
    await db.insert(tableObj).values(data);
  }

  return { success: true };
});

export const batchUpdate = form('unchecked', async (params: { table: string, ids: string[], data: any }) => {
  checkAdmin();
  const { table, ids, data } = params;
  const tableObj = (schema as any)[table];
  if (!tableObj) throw new Error('Table not found');

  await db.update(tableObj).set(data).where(inArray(tableObj.id, ids));
  return { success: true };
});

export const deleteCollectionRows = form('unchecked', async (params: { table: string, ids: string[] }) => {
  checkAdmin();
  const { table, ids } = params;
  const tableObj = (schema as any)[table];
  if (!tableObj) throw new Error('Table not found');

  await db.delete(tableObj).where(inArray(tableObj.id, ids));
  return { success: true };
});

export const getTableStats = query('unchecked', async (params: { table: string, where?: Record<string, any> }) => {
  checkAdmin();
  const { table, where = {} } = params;
  const time = performance.now();

  const qb = (db.query as any)[table];
  if (!qb) return { series: [], time: '0ms' };

  const filter = buildWhere(where);

  const latest = await qb.findFirst({
    where: filter ? (t: any, ops: any) => filter(t, ops) : undefined,
    orderBy: (t: any, { desc }: any) => [desc(t.created)]
  });

  const anchor = latest?.created ? new Date(latest.created) : new Date();

  const records = await qb.findMany({
    where: filter ? (t: any, ops: any) => filter(t, ops) : undefined,
    columns: { created: true },
    limit: 5000,
    orderBy: (t: any, { desc }: any) => [desc(t.created)]
  });

  const series: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const dayDate = new Date(anchor.getTime());
    dayDate.setDate(dayDate.getDate() - i);
    const dayKey = dayDate.toISOString().split('T')[0];
    series[dayKey] = 0;
  }

  records.forEach((record: any) => {
    if (record.created) {
      const date = new Date(record.created).toISOString().split('T')[0];
      if (series[date] !== undefined) series[date]++;
    }
  });

  return JSON.parse(JSON.stringify({
    series: Object.entries(series).map(([date, count]) => {
      const [, m, d] = date.split('-');
      return { label: `${d}/${m}`, count };
    }).reverse(),
    total: records.length,
    time: `${(performance.now() - time).toFixed(2)}ms`
  }));
});

export const getLogStats = query('unchecked', async (params: { where?: Record<string, any> } = {}) => {
  checkAdmin();
  const { where = {} } = params;
  const time = performance.now();

  const qb = db.query.__logs as any;
  const filter = buildWhere(where);

  const latest = await qb.findFirst({
    where: filter ? (t: any, ops: any) => filter(t, ops) : undefined,
    orderBy: (l: any, { desc }: any) => [desc(l.created)]
  });

  const anchor = latest?.created ? new Date(latest.created) : new Date();

  const logs = await qb.findMany({
    where: filter ? (t: any, ops: any) => filter(t, ops) : undefined,
    limit: 5000,
    orderBy: (l: any, { desc }: any) => [desc(l.created)]
  });

  type LevelCounts = { info: number; warn: number; error: number };
  const series: Record<string, LevelCounts> = {};

  for (let i = 0; i < 30; i++) {
    const dayDate = new Date(anchor.getTime());
    dayDate.setDate(dayDate.getDate() - i);
    const dayKey = dayDate.toISOString().split('T')[0];
    series[dayKey] = { info: 0, warn: 0, error: 0 };
  }

  logs.forEach((log: any) => {
    const dayKey = new Date(log.created!).toISOString().split('T')[0];
    if (series[dayKey] !== undefined) {
      const level = (log.level?.toLowerCase() || 'info') as keyof LevelCounts;
      if (series[dayKey][level] !== undefined) {
        series[dayKey][level]++;
      } else {
        series[dayKey].info++;
      }
    }
  });

  return JSON.parse(JSON.stringify({
    series: Object.entries(series).map(([day, counts]) => {
      const [, m, d] = day.split('-');
      return {
        label: `${d}/${m}`,
        ...counts
      };
    }).reverse(),
    total: logs.length,
    time: (performance.now() - time).toFixed(2) + 'ms'
  }));
});


function buildWhere(where: Record<string, any>) {
  if (!where || Object.keys(where).length === 0) return null;

  return (t: any, { and, ilike, eq }: any) => {
    const conds = Object.entries(where)
      .filter(([_, v]) => v != null && v !== '')
      .map(([k, v]) => {
        const col = t[k];
        if (!col) return null;
        if (typeof v === 'string') return ilike(col, `%${v}%`);
        return eq(col, v);
      })
      .filter((c): c is any => c !== null);

    return conds.length > 0 ? and(...conds) : undefined;
  };
}
