/**
 * Filter catalog for the collections explorer.
 *
 * The filter bar in `/_/collections` builds a drizzle RQB object filter
 * (`{ status: { eq: 'active' } }`) from its rows. Those rows are built from the
 * operator catalog below, and `collections.remote.ts` re-validates every entry
 * against it before the value ever reaches drizzle — unknown columns and unknown
 * operators are dropped rather than forwarded, because drizzle happily turns an
 * unknown key into a raw `sql.identifier(...)`.
 *
 * One filter per column: the object filter format has no array-of-conditions
 * form for a single field, so adding a second row for the same column would need
 * a top-level `AND` wrapper. Instead the column dropdown disables columns that
 * are already filtered, and range/list queries are covered by `between` and
 * `isOneOf`.
 *
 * The wire format carries *raw* form values ("a,b" for lists, `["a","b"]` for
 * ranges). Normalization — `%` padding, number coercion — happens in
 * `normalizeValue`, which both the client and the server call, so the "Open in
 * SQL" preview is byte-for-byte what the server runs.
 */

/** Drizzle RQB field operators that may be used inside a where clause. */
export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "notBetween"
  | "like"
  | "notLike"
  | "ilike"
  | "notIlike"
  | "inArray"
  | "notInArray"
  | "arrayContains"
  | "arrayContained"
  | "arrayOverlaps"
  | "isNull"
  | "isNotNull";

export type FilterKind =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "array"
  | "json";

export type OperatorDef = {
  /** Text shown in the operator dropdown. */
  label: string;
  /** The drizzle RQB operator this row maps to. */
  op: FilterOperator;
  /** Number of value inputs to render. `0` means the value is implied. */
  arity: 0 | 1 | 2;
  /** The value is a comma-separated list. */
  list?: boolean;
  /** `%` padding for the like/ilike family. */
  wrap?: "start" | "end" | "both";
  /** Value implied by the operator itself (no input rendered). */
  value?: string | number | boolean;
};

export const OPERATORS = {
  equals: { label: "equals", op: "eq", arity: 1 },
  notEquals: { label: "does not equal", op: "ne", arity: 1 },

  greaterThan: { label: "greater than", op: "gt", arity: 1 },
  greaterOrEqual: { label: "greater than or equal", op: "gte", arity: 1 },
  lessThan: { label: "less than", op: "lt", arity: 1 },
  lessOrEqual: { label: "less than or equal", op: "lte", arity: 1 },
  between: { label: "between", op: "between", arity: 2 },
  notBetween: { label: "not between", op: "notBetween", arity: 2 },

  contains: { label: "contains", op: "ilike", arity: 1, wrap: "both" },
  notContains: {
    label: "does not contain",
    op: "notIlike",
    arity: 1,
    wrap: "both",
  },
  startsWith: { label: "starts with", op: "like", arity: 1, wrap: "end" },
  endsWith: { label: "ends with", op: "like", arity: 1, wrap: "start" },
  isEmpty: { label: "is empty", op: "eq", arity: 0, value: "" },
  isNotEmpty: { label: "is not empty", op: "ne", arity: 0, value: "" },
  isOneOf: { label: "is one of", op: "inArray", arity: 1, list: true },
  isNoneOf: { label: "is none of", op: "notInArray", arity: 1, list: true },

  containsItem: { label: "contains item", op: "arrayContains", arity: 1, list: true },
  containedBy: { label: "contained by", op: "arrayContained", arity: 1, list: true },
  overlaps: { label: "overlaps with", op: "arrayOverlaps", arity: 1, list: true },

  isTrue: { label: "is true", op: "eq", arity: 0, value: true },
  isFalse: { label: "is false", op: "eq", arity: 0, value: false },

  isNull: { label: "is null", op: "isNull", arity: 0 },
  isNotNull: { label: "is not null", op: "isNotNull", arity: 0 },
} as const satisfies Record<string, OperatorDef>;

export type FilterOpId = keyof typeof OPERATORS;

/**
 * Typed view of a catalog entry.
 *
 * `OPERATORS` is declared `as const` so `row.op = …` narrows to a real id, but
 * that makes each entry a literal object without the optional `list`/`wrap`/
 * `value` keys. Callers that inspect those need the widened shape.
 */
export function opDef(op: FilterOpId): OperatorDef {
  return OPERATORS[op] as OperatorDef;
}

/** Reverse lookup, so a wire-format operator name maps back to its row. */
const OP_INDEX: ReadonlyMap<FilterOperator, OperatorDef> = new Map(
  Object.values(OPERATORS).map((def) => [def.op, def]),
);

export function defForOp(op: string): OperatorDef | undefined {
  return OP_INDEX.get(op as FilterOperator);
}

/** Every drizzle operator the catalog can emit — the server's allow-list. */
export const ALLOWED_OPERATORS: ReadonlySet<string> = new Set<string>(OP_INDEX.keys());

/** Shape of a collection column, as far as filtering is concerned. */
export type FilterableColumn = {
  key: string;
  name?: string;
  /** Drizzle column type, e.g. `PgText`. */
  type?: string;
  /** Drizzle data type, e.g. `string`, `number`, `object json`. */
  dataType?: string;
  isNullable?: boolean;
  isArray?: boolean;
};

const TEXT_OPS: FilterOpId[] = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
  "isOneOf",
  "isNoneOf",
  "isNull",
  "isNotNull",
];

const NUMBER_OPS: FilterOpId[] = [
  "equals",
  "notEquals",
  "greaterThan",
  "greaterOrEqual",
  "lessThan",
  "lessOrEqual",
  "between",
  "notBetween",
  "isOneOf",
  "isNoneOf",
  "isNull",
  "isNotNull",
];

const DATE_OPS: FilterOpId[] = [
  "equals",
  "notEquals",
  "greaterThan",
  "greaterOrEqual",
  "lessThan",
  "lessOrEqual",
  "between",
  "notBetween",
  "isNull",
  "isNotNull",
];

const BOOLEAN_OPS: FilterOpId[] = ["isTrue", "isFalse", "isNull", "isNotNull"];

const ARRAY_OPS: FilterOpId[] = [
  "containsItem",
  "containedBy",
  "overlaps",
  "isNull",
  "isNotNull",
];

// JSON has no meaningful text/ordering comparison, so only null checks.
const JSON_OPS: FilterOpId[] = ["isNull", "isNotNull"];

/**
 * Classify a column for filtering. `dataType` is authoritative when present;
 * `columnType` is only a fallback for columns the explorer can't classify.
 */
export function filterKind(col: FilterableColumn): FilterKind {
  if (col.isArray) return "array";

  const dataType = col.dataType || "";
  if (
    dataType.includes("date") ||
    dataType.includes("timestamp") ||
    dataType.includes("time")
  )
    return "date";
  if (dataType.startsWith("number") || dataType === "string numeric")
    return "number";
  if (dataType === "boolean") return "boolean";
  if (dataType.includes("json") || dataType === "custom") return "json";
  if (dataType === "string") return "text";

  const type = col.type || "";
  if (/Numeric|BigInt|Serial|Integer|Real|DoublePrecision/.test(type))
    return "number";
  if (type === "PgBoolean") return "boolean";
  if (/Timestamp|PgDate|PgTime/.test(type)) return "date";
  if (/Json/.test(type)) return "json";

  return "text";
}

/** Operators available for a column, in dropdown order. */
export function operatorsFor(col: FilterableColumn): FilterOpId[] {
  switch (filterKind(col)) {
    case "number":
      return NUMBER_OPS;
    case "date":
      return DATE_OPS;
    case "boolean":
      return BOOLEAN_OPS;
    case "array":
      return ARRAY_OPS;
    case "json":
      return JSON_OPS;
    default:
      return TEXT_OPS;
  }
}

const DEFAULT_OP: Record<FilterKind, FilterOpId> = {
  text: "contains",
  number: "equals",
  date: "equals",
  boolean: "isTrue",
  array: "containsItem",
  json: "isNull",
};

export function defaultOpFor(col: FilterableColumn): FilterOpId {
  return DEFAULT_OP[filterKind(col)];
}

function coerce(raw: string, kind: FilterKind): string | number | undefined {
  const trimmed = raw.trim();
  // `Number('')` is `0`, not `NaN`, so an empty number field would silently
  // become a filter on zero. An empty input is an unfinished form field — the
  // one exception is text, where `''` is the real value behind `is empty`.
  if (trimmed === '' && kind !== 'text') return undefined;
  if (kind === "number") {
    const n = Number(trimmed);
    return Number.isNaN(n) ? undefined : n;
  }
  return raw;
}

function pad(value: string | number, wrap: OperatorDef["wrap"]) {
  if (typeof value !== "string" || !wrap) return value;
  if (wrap === "start") return `%${value}`;
  if (wrap === "end") return `${value}%`;
  return `%${value}%`;
}

/**
 * Turn a raw form value into the value drizzle will be given, or `undefined`
 * while the row is still incomplete (a value-less `contains` is not run).
 */
export function normalizeValue(
  def: OperatorDef,
  raw: unknown,
  kind: FilterKind,
): unknown {
  // Null checks take no value at all; drizzle only tests it for truthiness.
  if (def.op === "isNull" || def.op === "isNotNull") return true;

  // `is empty` / `is not empty` are the only operators whose value *is* the
  // empty string, so they must be checked before the emptiness guard below.
  if (def.value === "" && def.arity === 0) return "";

  // An empty input is an unfinished form field, not a real value: without this
  // an untouched `contains` box would turn into `ilike '%%'`, which matches
  // every row and silently discards every other filter. Dropping it keeps the
  // rest of the where clause intact.
  if (isBlank(raw)) return undefined;

  if (def.list) {
    const items = (Array.isArray(raw) ? raw : String(raw ?? "").split(","))
      .map((item) => coerce(String(item).trim(), kind))
      .filter((item): item is string | number => item !== undefined && item !== "");
    return items.length ? items : undefined;
  }

  if (def.arity === 2) {
    const [minRaw, maxRaw] = Array.isArray(raw) ? raw : [raw, ""];
    const min = coerce(String(minRaw ?? ""), kind);
    const max = coerce(String(maxRaw ?? ""), kind);
    if (min === undefined || max === undefined) return undefined;
    return [pad(min, def.wrap), pad(max, def.wrap)];
  }

  if (raw === true || raw === false) return raw;

  const value = coerce(String(raw), kind);
  if (value === undefined) return undefined;
  return pad(value, def.wrap);
}

/** True when every value of a raw (possibly multi-input) filter value is empty. */
function isBlank(raw: unknown): boolean {
  if (Array.isArray(raw)) return raw.every((v) => isBlank(v));
  if (raw === null || raw === undefined) return true;
  if (raw === true || raw === false) return false;
  return String(raw).trim() === '';
}

/**
 * Server-side counterpart of {@link normalizeValue}, for a value that already
 * crossed the wire from the filter bar.
 *
 * Identical except that `%` padding is skipped, because the padding cannot be
 * recovered from the drizzle operator name: `startsWith` and `endsWith` both
 * map to `like`, so `defForOp('like')` resolves to only one of them and would
 * pad a prefix match as a suffix match. The client pads once, before sending.
 * Type coercion still runs here since numbers arrive as strings.
 */
export function normalizeIncomingValue(
  def: OperatorDef,
  raw: unknown,
  kind: FilterKind,
): unknown {
  return normalizeValue({ ...def, wrap: undefined }, raw, kind);
}

/**
 * One row of the filter bar, in its wire shape: a column, a catalog operator
 * id, and the raw input strings (one per rendered input, so `"a"` for `between`
 * still carries its second half in `values[1]`).
 */
export type FilterRow = {
  col: string;
  op: FilterOpId;
  values: string[];
};

/** A resolved filter: the exact `{ col: { <op>: <value> } }` pair to merge. */
export type ResolvedFilter = { col: string; op: FilterOperator; value: unknown };

/**
 * Turn one bar row into the RQB entry it stands for, or `undefined` while the
 * row is still incomplete (no value typed yet, a half-filled `between`, …).
 *
 * The client and the server both go through `normalizeValue` so the value in
 * `query.where` is already the final one — `getData` (Export) and
 * `getTableStats` consume that object directly, without re-normalizing.
 */
export function resolveFilter(row: FilterRow, col: FilterableColumn): ResolvedFilter | undefined {
  const def = OPERATORS[row.op];
  if (!def) return undefined;

  const kind = filterKind(col);
  // `normalizeValue` expects the two ends of a range as a 2-tuple and a
  // single-input operator as a scalar.
  const raw = def.arity === 2 ? [row.values[0] ?? "", row.values[1] ?? ""] : row.values[0];

  const value = normalizeValue(def, raw, kind);
  if (value === undefined) return undefined;

  return { col: col.key, op: def.op, value };
}

const SQL_KEYWORD: Record<FilterOperator, string> = {
  eq: "=",
  ne: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  between: "BETWEEN",
  notBetween: "NOT BETWEEN",
  like: "LIKE",
  notLike: "NOT LIKE",
  ilike: "ILIKE",
  notIlike: "NOT ILIKE",
  inArray: "IN",
  notInArray: "NOT IN",
  arrayContains: "@>",
  arrayContained: "<@",
  arrayOverlaps: "&&",
  isNull: "IS NULL",
  isNotNull: "IS NOT NULL",
};

function literal(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Render one filter as a SQL predicate, for the "Open in SQL" preview. */
export function toSql(columnName: string, def: OperatorDef, value: unknown) {
  const column = `"${String(columnName).replace(/"/g, '""')}"`;
  const keyword = SQL_KEYWORD[def.op];

  if (def.op === "isNull" || def.op === "isNotNull") return `${column} ${keyword}`;

  if (def.op === "between" || def.op === "notBetween") {
    const [min, max] = Array.isArray(value) ? value : [];
    return `${column} ${keyword} ${literal(min)} AND ${literal(max)}`;
  }

  if (def.op === "inArray" || def.op === "notInArray") {
    const items = Array.isArray(value) ? value : [value];
    return `${column} ${keyword} (${items.map(literal).join(", ")})`;
  }

  return `${column} ${keyword} ${literal(value)}`;
}
