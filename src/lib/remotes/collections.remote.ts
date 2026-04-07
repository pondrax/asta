import { form, query } from "$app/server";
import { db } from "$lib/server/db";
import { type } from "arktype";
import { getColumns } from "drizzle-orm";
import type { TableName } from "./api.remote";

export interface CollectionSchema {
    name: string;
    columns: {
        key: string;
        name: string;
        type: string;
        header: string;
        isId: boolean;
        isNullable: boolean;
        isArray: boolean;
        defaultValue: any;
        enumValues: string[] | null;
    }[];
}

// Use a more standard ArkType union of literals
const getTableNames = () => Object.keys(db.query) as [string, ...string[]];

export const getCollections = query('unchecked', async (params: any): Promise<CollectionSchema[]> => {
    const tableNames = getTableNames() as TableName[];
    const result = tableNames.map(name => {
        const table = (db._ as any).relations[name]?.table;
        const columns = table ? getColumns(table) : {};

        return {
            name,
            columns: Object.entries(columns).map(([key, col]: [string, any]) => ({
                key,
                name: col.name,
                type: col.columnType,
                header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                isId: col.primary || key === 'id',
                isNullable: !col.notNull,
                isArray: (col as any).array === true || col.columnType.includes('Array'),
                // Ensure defaultValue is a plain primitive for serialization
                defaultValue: typeof col.default === 'function' ? null : col.default,
                enumValues: col.enumValues && Array.isArray(col.enumValues) ? col.enumValues : null,
            }))
        };
    });
    // Final defensive serialization test via JSON stringify/parse to avoid non-POJO errors
    return JSON.parse(JSON.stringify(result));
});

// Avoid manual validation block for a moment to isolate the issue, but using 'untrack' on the client might have helped
// Also using any for props to bypass any potential proxy/pojo issues before manual validation
export const upsertData = form('unchecked', async (props: any) => {
    // console.log("[upsertData] props", props);

    // Fallback manual checks if ArkType is failing for unknown reasons
    const table = props.table as string;
    if (!table) throw new Error("Table name is required");

    const payload = { ...props };
    delete payload.table;

    const time = performance.now();

    // cast db.query as any to allow dynamic indexing
    const queryBuilder = (db.query as any)[table];
    if (!queryBuilder || !queryBuilder.upsert) {
        throw new Error(`Table ${table} not found or doesn't support upsert`);
    }

    const result = await queryBuilder.upsert({
        data: payload,
        update: () => payload, // Update with the same data
    });

    // Strip out non-POJO elements from Drizzle results for serialization
    return JSON.parse(JSON.stringify({
        data: result,
        time: (performance.now() - time).toFixed(2) + 'ms'
    }));
});
// Unguarded data fetcher specifically for admin collections management
export const getCollectionData = query('unchecked', async (params: any) => {
    const { table, ...rest } = params;
    
    const queryBuilder = (db.query as any)[table];
    if (!queryBuilder) {
        return { data: [], count: 0, time: '0ms' };
    }

    const time = performance.now();
    const result = await queryBuilder.findManyAndCount(rest);

    return JSON.parse(JSON.stringify({
        ...result,
        time: (performance.now() - time).toFixed(2) + 'ms'
    }));
});
