import { form, query, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { getColumns } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

// Auth guard helper
const checkAdmin = () => {
  const event = getRequestEvent();
  if (event?.locals?.user?.role?.name !== 'admin') {
    throw error(403, 'Forbidden: Admin access only');
  }
}

/**
 * Automaticaly back up the schema before modification
 */
const backupSchema = async (content: string) => {
  const backupDir = path.resolve('src/lib/server/db/backups');
  try { await fs.mkdir(backupDir, { recursive: true }); } catch (e) {}
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.writeFile(path.join(backupDir, `schema.${timestamp}.ts`), content);
}

/**
 * Get the current database schema structure from Drizzle's runtime metadata.
 */
export const getSchema = query('unchecked', async () => {
  checkAdmin();
  const tableNames = Object.keys(db.query);
  const result = tableNames.map(name => {
    const table = (db._ as any).relations[name]?.table;
    const columns = table ? getColumns(table) : {};
    const relationsObj = (db._ as any).relations[name]?.relations || {};
    
    return {
      name,
      columns: Object.entries(columns).map(([key, col]: [string, any]) => ({
        key,
        name: col.name,
        type: col.columnType,
        isId: col.primary || key === 'id',
        isNullable: !col.notNull,
        isArray: (col as any).array === true || col.columnType.includes('Array'),
        defaultValue: typeof col.default === 'function' ? 'SQL_FN' : col.default,
      })),
      relations: Object.entries(relationsObj).map(([key, rel]: [string, any]) => {
        // Drizzle Beta uses targetTable and targetTableName internally instead of referencedTable
        const tbl = rel.targetTable || rel.referencedTable;
        
        let targetTableName = rel.targetTableName 
          || tbl?.[Symbol.for('drizzle:Name')] 
          || tbl?.[Symbol.for('drizzle:OriginalName')] 
          || 'unknown';

        if (targetTableName === 'unknown') {
          // Fallback reverse lookup
          targetTableName = Object.entries((db._ as any).relations)
            .find(([_, v]: [any, any]) => v.table === tbl)?.[0] || 'unknown';
        }
          
        const localColumn = (rel.sourceColumns?.[0]?.name) || (rel.from?.[0]?.name) || '';
        const remoteColumn = (rel.targetColumns?.[0]?.name) || (rel.to?.[0]?.name) || '';

        return {
          name: key,
          type: rel.relationType === 'one' ? 'One' : 'Many',
          targetTable: targetTableName,
          localColumn,
          remoteColumn,
        }
      })
    };
  });
  
  return JSON.parse(JSON.stringify(result));
});

/**
 * "Modify Schema" logic.
 * In a dev environment, this can actually append/modify the schema.ts file.
 * This is a powerful, slightly dangerous feature that facilitates rapid prototyping.
 */
export const modifySchema = form('unchecked', async (params: { 
  action: 'addColumn' | 'createTable' | 'alterColumn', 
  tableName: string, 
  columnName?: string,
  columnType?: string,
  columnNullable?: string | boolean
}) => {
  checkAdmin();
  const schemaPath = path.resolve('src/lib/server/db/schema.ts');
  let content = await fs.readFile(schemaPath, 'utf-8');

  if (params.action === 'addColumn' && params.columnName && params.columnType) {
    const { columnName, columnType, columnNullable } = params;
    const isNullable = columnNullable === 'true' || columnNullable === true;
    
    // Improved logic: Find table block, then find the fields object
    const startToken = `export const ${params.tableName} = pgTable(`;
    const startIndex = content.indexOf(startToken);
    
    if (startIndex !== -1) {
      // Find the first '{' after startToken
      const fieldsStartIndex = content.indexOf('{', startIndex);
      if (fieldsStartIndex !== -1) {
        // Find matching '}' by counting curly braces
        let depth = 0;
        let fieldsEndIndex = -1;
        for (let i = fieldsStartIndex; i < content.length; i++) {
          if (content[i] === '{') depth++;
          if (content[i] === '}') depth--;
          if (depth === 0) {
            fieldsEndIndex = i;
            break;
          }
        }

        if (fieldsEndIndex !== -1) {
          const currentFields = content.slice(fieldsStartIndex + 1, fieldsEndIndex);
          const nullableChain = isNullable ? '' : '.notNull()';
          const newField = `\n\t${columnName}: ${columnType}('${columnName}')${nullableChain},`;
          
          // Construct the new content
          const updatedFields = currentFields.trimEnd() + newField + "\n";
          const finalContent = content.slice(0, fieldsStartIndex + 1) + updatedFields + content.slice(fieldsEndIndex);
          
          await backupSchema(content);
          await fs.writeFile(schemaPath, finalContent);
          return { success: true, message: `Added column ${columnName} to ${params.tableName}` };
        }
      }
    }
  }

  if (params.action === 'alterColumn' && params.columnName && params.columnType) {
    const { columnName, columnType, columnNullable } = params;
    const isNullable = columnNullable === 'true' || columnNullable === true;
    
    const startToken = `export const ${params.tableName} = pgTable(`;
    const startIndex = content.indexOf(startToken);
    
    if (startIndex !== -1) {
      const fieldsStartIndex = content.indexOf('{', startIndex);
      if (fieldsStartIndex !== -1) {
        let depth = 0;
        let fieldsEndIndex = -1;
        for (let i = fieldsStartIndex; i < content.length; i++) {
          if (content[i] === '{') depth++;
          if (content[i] === '}') depth--;
          if (depth === 0) {
            fieldsEndIndex = i;
            break;
          }
        }

        if (fieldsEndIndex !== -1) {
          const currentFields = content.slice(fieldsStartIndex + 1, fieldsEndIndex);
          
          // Match the line that starts with the column name
          const columnLineRegex = new RegExp(`^\\s*${columnName}:\\s*[\\s\\S]*?,`, 'm');
          const columnMatch = currentFields.match(columnLineRegex);
          
          if (columnMatch) {
            const nullableChain = isNullable ? '' : '.notNull()';
            const updatedColumn = `\n\t${columnName}: ${columnType}('${columnName}')${nullableChain},`;
            
            const updatedFields = currentFields.replace(columnMatch[0], updatedColumn);
            const finalContent = content.slice(0, fieldsStartIndex + 1) + updatedFields + content.slice(fieldsEndIndex);
            
            await backupSchema(content);
            await fs.writeFile(schemaPath, finalContent);
            return { success: true, message: `Altered column ${columnName} in ${params.tableName}` };
          }
        }
      }
    }
  }

  if (params.action === 'createTable') {
    const { tableName } = params;
    const newTable = `\nexport const ${tableName} = pgTable('${tableName}', {\n\tid,\n\tcreated,\n\tupdated,\n});\n`;
    const finalContent = content + newTable;
    await backupSchema(content);
    await fs.writeFile(schemaPath, finalContent);
    return { success: true, message: `Created table ${tableName}` };
  }

  throw new Error("Action not supported or table not found in schema.ts");
});
