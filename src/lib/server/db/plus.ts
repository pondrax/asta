import { sql, type SQL, is, getTableColumns, relationsFilterToSQL, type BuildQueryResult, type DBQueryConfig, type TablesRelationalConfig } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
// @ts-ignore
import { RelationalQueryBuilder } from "drizzle-orm/pg-core/query-builders/query";

export const withPlus = <TSchema extends TablesRelationalConfig>() => <T extends { query: any }>(db: T): T & {
  query: {
    [K in keyof T['query'] & keyof TSchema]: T['query'][K] & {
      findManyAndCount<TConfig extends DBQueryConfig<'many', TSchema, TSchema[K]>>(
        args?: TConfig
      ): Promise<{
        data: BuildQueryResult<TSchema, TSchema[K], TConfig>[];
        count: number;
      }>;
      updateMany<TConfig extends DBQueryConfig<'many', TSchema, TSchema[K]>>(
        args: { data: any, where?: TConfig['where'] }
      ): Promise<BuildQueryResult<TSchema, TSchema[K], TConfig>[]>;
      upsert<TConfig extends DBQueryConfig<'one', TSchema, TSchema[K]>>(
        args: { 
          data: any, 
          update?: (table: BuildQueryResult<TSchema, TSchema[K], {}>) => any, 
          conflict?: any, 
          where?: TConfig['where'] 
        }
      ): Promise<BuildQueryResult<TSchema, TSchema[K], TConfig>>;
    }
  }
} => {
  const _db = db as any;
  // Use the RelationalQueryBuilder prototype to monkey-patch all RQB instances
  if (RelationalQueryBuilder.prototype) {
    const proto = RelationalQueryBuilder.prototype as any;

    // findManyAndCount
    proto.findManyAndCount = async function (this: any, args: any = {}) {
      const dataPromise = this.findMany(args);

      let countPromise;
      if (typeof this.count === 'function') {
        countPromise = this.count(args.where);
      } else {
        const query = _db.select({ count: sql<number>`count(*)` }).from(this.table);
        const filter = args.where ? relationsFilterToSQL(
          this.table,
          args.where,
          this.tableConfig.relations,
          this.schema,
          this.tableNamesMap,
          this.dialect.casing
        ) : undefined;
        if (filter) query.where(filter);
        countPromise = query.execute().then((r: any) => r[0].count);
      }

      const [data, count] = await Promise.all([
        (dataPromise.then ? dataPromise : dataPromise.execute()),
        (countPromise.then ? countPromise : countPromise.execute())
      ]);

      return { data, count: Number(count) };
    };

    // updateMany
    proto.updateMany = async function (this: any, args: { data: any, where?: any }) {
      const query = _db.update(this.table).set(args.data);
      const filter = args.where ? relationsFilterToSQL(
        this.table,
        args.where,
        this.tableConfig.relations,
        this.schema,
        this.tableNamesMap,
        this.dialect.casing
      ) : undefined;

      if (filter) query.where(filter);
      return await query.returning().execute();
    };

    // upsert (Overriding drizzle-plus which uses broken query.then on builders)
    proto.upsert = async function (this: any, args: { data: any, update?: (table: any) => any, conflict?: any, where?: any }) {
      const { data, update, conflict, where } = args;

      let updateValues = update;
      if (typeof update === 'function') {
        updateValues = update(this.table);
      }

      const columns = getTableColumns(this.table);
      const queryBuilder = _db.insert(this.table).values(data);

      // Smart conflict target detection
      let conflictTarget = conflict;
      if (!conflictTarget) {
        const dataArray = Array.isArray(data) ? data : [data];
        const firstData = dataArray[0];

        // If ID is not provided in data, look for other unique columns
        if (!firstData.id) {
          const uniqueColumn = Object.values(columns).find((col: any) =>
            col.isUnique && firstData[col.name || col.key] !== undefined
          );
          if (uniqueColumn) {
            conflictTarget = [uniqueColumn];
          }
        }

        // Default back to ID if still no target
        if (!conflictTarget) {
          // Find primary key column
          const pkColumn = Object.values(columns).find((col: any) => col.primary);
          conflictTarget = pkColumn ? [pkColumn] : [columns.id];
        }
      }

      let finalQuery: any;
      if (updateValues) {
        const setWhere = where ? relationsFilterToSQL(
          this.table,
          where,
          this.tableConfig.relations,
          this.schema,
          this.tableNamesMap,
          this.dialect.casing
        ) : undefined;

        finalQuery = queryBuilder.onConflictDoUpdate({
          target: conflictTarget,
          set: updateValues,
          setWhere
        });
      } else {
        finalQuery = queryBuilder.onConflictDoNothing({
          target: conflictTarget
        });
      }

      const results = await finalQuery.returning().execute();
      return Array.isArray(data) ? results : results[0];
    };
  }

  // To support the project's rule of using "query.batch"
  if (_db.batch && !_db.query.batch) {
    _db.query.batch = _db.batch.bind(_db);
  }

  return db as any;
}
