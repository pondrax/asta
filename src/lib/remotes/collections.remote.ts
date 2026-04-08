import { query, form } from "$app/server";
import { db } from '$lib/server/db';
import { checkAdmin } from '$lib/utils/server';
import { and, ilike, eq, sql, inArray, getColumns } from 'drizzle-orm';

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
    const result = tableNames.map(name => {
      // Find the table object from the schema
      // In this setup, it's usually at db._.fullSchema[name]
      const table = (db._ as any).fullSchema[name];
      const columns = table ? getColumns(table) : {};
      
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
    const { table, limit, offset, where = {}, orderBy = {}, search } = params;
    
    // @ts-ignore
    const qb = db.query[table];
    if (!qb) return { data: [], count: 0 };

    const filter = buildWhere(where);

    // Drizzle Plus supports findManyAndCount
    const result = await qb.findManyAndCount({
        limit,
        offset,
        where: filter ? (t: any, ops: any) => filter(t, ops) : undefined,
        orderBy: (t: any, { asc, desc }: any) => {
            return Object.entries(orderBy).map(([k, v]) => v === 'desc' ? desc(t[k]) : asc(t[k]));
        }
    });

    return JSON.parse(JSON.stringify({ 
        data: result.data, 
        count: result.count,
        time: result.time || '0ms'
    }));
});

export const upsertData = form('unchecked', async (params: { table: string, data: any }) => {
    checkAdmin();
    const { table, data } = params;
    
    // @ts-ignore
    const tableObj = db._.fullSchema[table];
    if (!tableObj) throw new Error('Table not found');
    
    if (data.id) {
        // @ts-ignore
        await db.update(tableObj).set(data).where(eq(tableObj.id, data.id));
    } else {
        // @ts-ignore
        await db.insert(tableObj).values(data);
    }
    
    return { success: true };
});

export const batchUpdate = form('unchecked', async (params: { table: string, ids: string[], data: any }) => {
    checkAdmin();
    const { table, ids, data } = params;
    // @ts-ignore
    const tableObj = db._.fullSchema[table];
    if (!tableObj) throw new Error('Table not found');

    // @ts-ignore
    await db.update(tableObj).set(data).where(inArray(tableObj.id, ids));
    return { success: true };
});

export const deleteCollectionRows = form('unchecked', async (params: { table: string, ids: string[] }) => {
    checkAdmin();
    const { table, ids } = params;
    // @ts-ignore
    const tableObj = db._.fullSchema[table];
    if (!tableObj) throw new Error('Table not found');
    
    // @ts-ignore
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
        const d = new Date(anchor.getTime());
        d.setDate(d.getDate() - i);
        series[d.toISOString().split('T')[0]] = 0;
    }

    records.forEach((r: any) => {
        if (r.created) {
            const date = new Date(r.created).toISOString().split('T')[0];
            if (series[date] !== undefined) series[date]++;
        }
    });

    return JSON.parse(JSON.stringify({
        series: Object.entries(series).map(([date, count]) => {
            const [y, m, d] = date.split('-');
            return { label: `${d}/${m}`, count };
        }).reverse(),
        total: records.length,
        time: (performance.now() - time).toFixed(2) + 'ms'
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
        const d = new Date(anchor.getTime());
        d.setDate(d.getDate() - i);
        const dayKey = d.toISOString().split('T')[0];
        series[dayKey] = { info: 0, warn: 0, error: 0 };
    }

    logs.forEach((l: any) => {
        const dayKey = new Date(l.created!).toISOString().split('T')[0];
        if (series[dayKey] !== undefined) {
            const level = (l.level?.toLowerCase() || 'info') as keyof LevelCounts;
            if (series[dayKey][level] !== undefined) {
                series[dayKey][level]++;
            } else {
                series[dayKey].info++;
            }
        }
    });

    return JSON.parse(JSON.stringify({
        series: Object.entries(series).map(([day, counts]) => {
            const [y, m, d] = day.split('-');
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
