<script lang="ts">
  import {
    getCollections,
    upsertData,
    batchUpdate,
    deleteCollectionRows,
    getCollectionData,
    type CollectionSchema,
  } from "$lib/remotes/collections.remote";
  import { type GetParams } from "$lib/remotes/api.remote";
  import { Toolbar, Modal } from "$lib/components";
  import { d } from "$lib/utils";
  import {
    OPERATORS,
    defaultOpFor,
    opDef,
    operatorsFor,
    resolveFilter,
    toSql,
    type FilterRow,
    type FilterOpId,
    type OperatorDef,
  } from "$lib/utils/filters";
  import { app } from "$lib/app/index.svelte";
  import { untrack } from "svelte";

  const collections = $derived(getCollections({}));
  let selectedTable = $state("");

  let query: GetParams<any> = $state({
    table: "",
    limit: 20,
    offset: 0,
    where: {},
    orderBy: {},
  });

  let editingRow = $state<any>(null);
  let batchData = $state<Record<string, any>>({});
  let inlineEdits = $state<Record<string, any>>({});
  let selections = $state<string[]>([]);

  let editingCell = $state<{
    id: any;
    key: string;
    value: any;
    type: string;
    header: string;
    multiline: boolean;
  } | null>(null);

  $effect(() => {
    let hash = window.location.hash.slice(1);
    if (hash.startsWith("!/")) hash = hash.slice(2);

    if (hash && collections.current?.some((c: any) => c.name === hash)) {
      if (selectedTable !== hash) {
        untrack(() => selectCollection(hash));
      }
    } else if (collections.current?.length && !selectedTable) {
      selectedTable = collections.current[0].name;
      untrack(() => {
        query.table = selectedTable;
        query.orderBy = defaultOrderBy(selectedTable);
      });
    }
  });

  $effect(() => {
    const currentHash = window.location.hash.slice(1);
    const targetHash = "!/" + selectedTable;
    if (selectedTable && currentHash !== targetHash) {
      window.location.hash = targetHash;
    }
  });

  function selectCollection(name: string) {
    selectedTable = name;
    query.table = name;
    query.offset = 0;
    query.where = {};
    query.orderBy = defaultOrderBy(name);
    // The draft and the where clause for the new table are restored by the
    // effects below, so switching away and back doesn't lose a filter.
  }

  const records = $derived(
    selectedTable && query.table === selectedTable
      ? getCollectionData(query)
      : ({
          current: null,
          loading: false,
          error: null,
          refresh: () => {},
        } as any),
  );
  const items = $derived(records.current ?? { data: [], count: 0 });
  const schema = $derived(
    collections.current?.find(
      (c: CollectionSchema) => c.name === selectedTable,
    ),
  );

  /* ------------------------------------------------------------------ *
   * Column order (drag) + column sort
   * ------------------------------------------------------------------ */

  const COLUMN_ORDER_STORE = "asta:collections:column-order";

  /** Newest rows first. Tables without an `updated` column stay unsorted, so
   *  the server never sees an orderBy it cannot resolve. */
  function defaultOrderBy(table: string): Record<string, "asc" | "desc"> {
    const has = collections.current?.some(
      (c: CollectionSchema) =>
        c.name === table && c.columns.some((col: any) => col.key === "updated"),
    );
    return has ? { updated: "desc" } : {};
  }

  /** Persisted display order of column keys for the active table.
   *  Empty means "use the schema order". */
  let columnOrder = $state<string[]>([]);

  let dragKey = $state<string | null>(null);
  let overKey = $state<string | null>(null);
  /** Guards against the click browsers fire on the header after a drag ends. */
  let justDragged = false;

  /** Schema columns, re-ordered to match the user's drag layout. */
  const columns = $derived.by(() => {
    const cols: any[] = schema?.columns || [];
    if (!columnOrder.length) return cols;

    const byKey = new Map(cols.map((c) => [c.key, c]));
    const known = new Set(cols.map((c) => c.key));

    const ordered = columnOrder
      .filter((k) => known.has(k))
      .map((k) => byKey.get(k));
    // Columns added to the schema after the layout was saved stay at the end.
    const added = cols.filter((c) => !columnOrder.includes(c.key));

    return [...ordered, ...added];
  });

  /** Current sort, derived from `query.orderBy` so there is a single source of truth. */
  const sort = $derived.by(() => {
    const orderBy = query.orderBy;
    if (!orderBy || typeof orderBy !== "object") {
      return { key: null as string | null, dir: null as "asc" | "desc" | null };
    }
    const [key, dir] = Object.entries(orderBy)[0] ?? [];
    return {
      key: key ?? null,
      dir: dir === "asc" || dir === "desc" ? dir : null,
    };
  });

  const columnOrderKey = (table: string) => `${COLUMN_ORDER_STORE}:${table}`;

  // Load the saved layout whenever the active table changes (browser only).
  $effect(() => {
    const table = selectedTable;
    if (!table) return;

    let parsed: unknown = [];
    try {
      const raw = localStorage.getItem(columnOrderKey(table));
      parsed = raw ? JSON.parse(raw) : [];
    } catch {
      parsed = [];
    }

    columnOrder = Array.isArray(parsed)
      ? parsed.filter((k: unknown): k is string => typeof k === "string")
      : [];
  });

  // Persist whenever the layout changes.
  //
  // `columnOrder` is read *outside* untrack so the effect re-runs on real edits,
  // while `selectedTable` is read *inside* so switching tables doesn't re-persist.
  // (Without the first read this effect would have zero dependencies and would
  // only ever run on mount; without the second, loading table B's layout would
  // immediately write it back and clobber the stored value.)
  $effect(() => {
    const order = columnOrder;
    const table = untrack(() => selectedTable);
    if (!table) return;

    try {
      if (order.length) {
        localStorage.setItem(columnOrderKey(table), JSON.stringify(order));
      } else {
        localStorage.removeItem(columnOrderKey(table));
      }
    } catch {
      // storage unavailable (private mode / quota) — layout stays in-memory
    }
  });

  /** Click a header: asc → desc → unsorted. */
  function toggleSort(key: string) {
    if (justDragged) return;
    query.offset = 0;
    if (sort.key !== key) query.orderBy = { [key]: "asc" };
    else if (sort.dir === "asc") query.orderBy = { [key]: "desc" };
    else query.orderBy = {};
  }

  /* ------------------------------------------------------------------ *
   * Filter bar
   * ------------------------------------------------------------------ */

  /**
   * `filterRows` is the *draft* the bar edits; `appliedFilters` is the frozen
   * snapshot the query actually runs. Keeping them apart is what lets Apply be
   * a real commit point — otherwise every keystroke refires the remote query and
   * the submenu would flicker as conditions are half-typed.
   *
   * The where clause is derived from the snapshot rather than kept in sync by
   * hand: the bar has per-row operator state and *incomplete* rows, and a bare
   * `{ col: value }` object can't represent either. A row with no value yet is
   * simply left out of the where clause — it must not turn into
   * `ilike '%%'`, which matches everything and hides the other filters.
   */
  let filterRows = $state<FilterRow[]>([]);
  let appliedFilters = $state<FilterRow[]>([]);
  let showFilters = $state(false);
  let sqlPreview = $state<string | null>(null);

  /* ------------------------------------------------------------------ *
   * Per-table filter persistence
   * ------------------------------------------------------------------ */

  const FILTER_STORE = "asta:collections:filters";

  const filterStoreKey = (table: string) => `${FILTER_STORE}:${table}`;

  /** Reject anything that isn't a well-formed row, so a stale or hand-edited
   *  entry can't inject an operator that no longer exists. */
  function sanitizeFilters(parsed: unknown): FilterRow[] {
    if (!Array.isArray(parsed)) return [];
    const rows: FilterRow[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const { col, op, values } = entry as Record<string, unknown>;
      if (typeof col !== "string" || !OPERATORS[op as FilterOpId]) continue;
      if (!Array.isArray(values)) continue;
      rows.push({
        col,
        op: op as FilterOpId,
        values: values.filter((v): v is string => typeof v === "string"),
      });
    }
    return rows;
  }

  // Load the active table's filters whenever it changes.
  $effect(() => {
    const table = selectedTable;
    if (!table) return;

    let parsed: unknown = [];
    try {
      const raw = localStorage.getItem(filterStoreKey(table));
      parsed = raw ? JSON.parse(raw) : [];
    } catch {
      parsed = [];
    }

    const rows = sanitizeFilters(parsed);
    appliedFilters = rows.map((row) => ({ ...row, values: [...row.values] }));
    // Seed the draft from the snapshot so the bar shows what is actually
    // running — otherwise a restored filter would apply but look unconfigured,
    // and the first keystroke in the bar would appear to "edit" nothing.
    filterRows = rows.map((row) => ({ ...row, values: [...row.values] }));
    // Open the bar if there is something to show, so a restored filter isn't
    // invisible. An empty table leaves the bar as the user had it.
    if (rows.length) showFilters = true;
  });

  // Persist whenever the applied filters change.
  //
  // `appliedFilters` is read *outside* untrack so the effect re-runs on real
  // commits, while `selectedTable` is read *inside* so switching tables doesn't
  // re-persist the previous table's filters under the new key. Reading it
  // inside also means the load above can't race the write: this effect only
  // ever wakes because `appliedFilters` changed, and by then the table has
  // already switched, so a load writes that table's own filters straight back
  // under the same key — a no-op rather than a clobber.
  $effect(() => {
    const filters = appliedFilters;
    const table = untrack(() => selectedTable);
    if (!table) return;

    try {
      if (filters.length) {
        localStorage.setItem(filterStoreKey(table), JSON.stringify(filters));
      } else {
        localStorage.removeItem(filterStoreKey(table));
      }
    } catch {
      // storage unavailable (private mode / quota) — filters stay in-memory
    }
  });
  /** Tables whose sidebar filter submenu the user has explicitly closed.
   *  Modelled as collapse flags rather than an "open" pointer so a submenu with
   *  children starts expanded instead of having to be opened once per table. */
  let collapsedFilterMenus = $state<Record<string, boolean>>({});

  /** The submenu shows its applied conditions for the active table, unless the
   *  user collapsed it. It has nothing to show on other tables or with no
   *  applied filters, so it stays shut then. */
  function isFilterMenuOpen(table: string) {
    return (
      table === selectedTable &&
      activeFilters.length > 0 &&
      !collapsedFilterMenus[table]
    );
  }

  function toggleFilterMenu(table: string) {
    collapsedFilterMenus = {
      ...collapsedFilterMenus,
      [table]: !collapsedFilterMenus[table],
    };
  }

  /** Sidebar table search, mirroring Drizzle Studio's sidebar search box. */
  let tableSearch = $state("");

  const visibleCollections = $derived.by(() => {
    const all = (collections.current || []).filter(
      (c: any) => !c.name.startsWith("__"),
    );
    const term = tableSearch.trim().toLowerCase();
    if (!term) return all;
    // Subsequence match, so "dcm" finds "documents" — Studio highlights a
    // partial match rather than requiring a contiguous substring.
    return all.filter((c: any) => fuzzyMatch(c.name.toLowerCase(), term));
  });

  /** True when every char of `term` appears in `text`, in order. */
  function fuzzyMatch(text: string, term: string) {
    if (term.includes(" ")) return text.includes(term);
    let i = 0;
    for (const ch of text) {
      if (ch === term[i]) i++;
      if (i === term.length) return true;
    }
    return false;
  }

  const filterableColumns = $derived<any[]>(schema?.columns ?? []);

  /** The condition a row resolves to *if it were applied*, resolved against the
   *  active schema. */
  function resolvedFilterFor(row: FilterRow, key: string) {
    const col = filterableColumns.find((c) => c.key === key);
    return col ? resolveFilter(row, col) : undefined;
  }

  /** Rows that currently resolve to a runnable predicate, from the *applied*
   *  snapshot — the draft may be incomplete. */
  const activeFilters = $derived.by(() => resolvedFiltersOf(appliedFilters));

  /** The same resolution pass over a set of rows, used for both the applied
   *  snapshot and the draft. Incomplete rows simply drop out. */
  function resolvedFiltersOf(rows: FilterRow[]) {
    const out: { row: FilterRow; col: any; op: OperatorDef; value: unknown }[] =
      [];
    for (const row of rows) {
      const col = filterableColumns.find((c) => c.key === row.col);
      if (!col) continue;
      const resolved = resolveFilter(row, col);
      if (!resolved) continue;
      out.push({ row, col, op: opDef(row.op), value: resolved.value });
    }
    return out;
  }

  // The single write into query.where, driven by the applied snapshot. Typing
  // in the bar only touches the draft, so this doesn't re-run per keystroke.
  $effect(() => {
    const filters = activeFilters;
    const next: Record<string, any> = {};
    for (const { row, value } of filters) {
      next[row.col] = { [OPERATORS[row.op].op]: value };
    }
    // Reset paging whenever the result set changes shape, otherwise a filter
    // applied on page 5 shows an empty page.
    if (JSON.stringify(next) !== JSON.stringify(query.where)) {
      query.where = next;
      query.offset = 0;
    }
  });

  function addFilter() {
    const col = filterableColumns[0];
    if (!col) return;
    filterRows = [
      ...filterRows,
      { col: col.key, op: defaultOpFor(col), values: [""] },
    ];
  }

  /**
   * Toggling the bar open from empty would otherwise land the user on a blank
   * panel, so seed the first row for them.
   */
  function toggleFilters() {
    const opening = !showFilters;
    showFilters = opening;
    if (opening && filterRows.length === 0) addFilter();
  }

  /** Commit the draft. */
  function applyFilters() {
    appliedFilters = filterRows.map((row) => ({
      col: row.col,
      op: row.op,
      values: [...row.values],
    }));
  }

  /** True when the draft differs from what was last applied — drives the Apply
   *  button. Compared on *resolved* predicates, not raw rows: the auto-seeded
   *  blank row resolves to nothing, so merely opening the bar must not enable
   *  Apply, and re-opening it after applying must show nothing pending. */
  const hasPendingEdits = $derived.by(() => {
    const shape = (rows: FilterRow[]) =>
      JSON.stringify(
        resolvedFiltersOf(rows)
          .map((f) => [f.col.key, f.op.op, f.value])
          .sort(),
      );
    return shape(filterRows) !== shape(appliedFilters);
  });

  /** Load an applied condition back into the bar for editing. */
  function editFilter(row: FilterRow) {
    const index = filterRows.findIndex(
      (r) => r.col === row.col && r.op === row.op,
    );
    if (index === -1) {
      filterRows = [
        ...filterRows,
        { col: row.col, op: row.op, values: [...row.values] },
      ];
    } else {
      filterRows = filterRows.with(index, {
        col: row.col,
        op: row.op,
        values: [...row.values],
      });
    }
    showFilters = true;
  }

  function removeFilter(index: number) {
    filterRows = filterRows.filter((_, i) => i !== index);
  }

  /** Drop a condition from both the bar and the committed snapshot. The
   *  submenu's × does this directly rather than routing through the bar,
   *  because it is an immediate action rather than a staged edit. */
  function removeFilterByCol(key: string) {
    filterRows = filterRows.filter((r) => r.col !== key);
    appliedFilters = appliedFilters.filter((r) => r.col !== key);
  }

  /** Wipe both the draft and what was applied, so the grid truly resets. */
  function clearFilters() {
    filterRows = [];
    appliedFilters = [];
  }

  /** Columns already filtered by another row are disabled — the RQB object
   *  format has no way to AND two conditions on the same field. */
  function columnTaken(key: string, index: number) {
    return filterRows.some((row, i) => i !== index && row.col === key);
  }

  function setColumn(row: FilterRow, key: string) {
    const col = filterableColumns.find((c) => c.key === key);
    if (!col) return;
    row.col = key;
    // The previous operator may not exist for the new column's type.
    if (!operatorsFor(col).includes(row.op)) row.op = defaultOpFor(col);
    row.values = [""];
  }

  /** The where clause as SQL, matching what the server will run. */
  const sqlPreviewText = $derived.by(() => {
    const clauses = activeFilters.map(({ col, op, value }) =>
      toSql(col.name ?? col.key, op, value),
    );
    if (!clauses.length) return "";
    return `SELECT * FROM "${selectedTable}"\nWHERE ${clauses.join("\n  AND ")};`;
  });

  function resetColumns() {
    columnOrder = [];
    query.orderBy = defaultOrderBy(selectedTable);
    query.offset = 0;
  }

  /** Suppress the next header click — a completed drag also emits one. */
  function markDragged() {
    justDragged = true;
    setTimeout(() => (justDragged = false), 0);
  }

  function onDragStart(e: DragEvent, key: string) {
    dragKey = key;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", key);
    }
  }

  function onDragOver(e: DragEvent, key: string) {
    if (!dragKey) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (overKey !== key) overKey = key;
  }

  function onDrop(e: DragEvent, key: string) {
    const from = dragKey || e.dataTransfer?.getData("text/plain");
    onDragEnd();

    if (!from || from === key) return;

    e.preventDefault();
    markDragged();

    const order = columns.map((c: any) => c.key as string);
    const fromIdx = order.indexOf(from);
    const toIdx = order.indexOf(key);
    if (fromIdx === -1 || toIdx === -1) return;

    const next = [...order];
    next.splice(toIdx, 0, ...next.splice(fromIdx, 1));
    columnOrder = next;
  }

  function onDragEnd() {
    // Any drag (even one abandoned with Escape) can be followed by a click.
    if (dragKey) markDragged();
    dragKey = null;
    overKey = null;
  }

  // Modal states
  let showEditModal = $state<boolean | undefined>(false);
  let showDeleteModal = $state<boolean | undefined>(false);

  function startEdit(row: any) {
    editingRow = JSON.parse(JSON.stringify(row));
    showEditModal = true;
  }

  function startCreate() {
    editingRow = {};
    if (schema) {
      schema.columns.forEach((col: CollectionSchema["columns"][number]) => {
        if (!col.isId) {
          editingRow[col.key] =
            col.defaultValue ?? (col.type === "PgBoolean" ? false : null);
        }
      });
    }
    showEditModal = true;
  }

  function startDelete() {
    showDeleteModal = true;
  }

  function startInlineEdit(row: any, col: any, multiline = false) {
    if (col.isId || col.type === "PgTimestamp") return;
    if (
      editingCell &&
      editingCell.id === row.id &&
      editingCell.key === col.key &&
      editingCell.multiline === multiline
    )
      return;

    editingCell = {
      id: row.id,
      key: col.key,
      value:
        inlineEdits[row.id]?.[col.key] ??
        (typeof row[col.key] === "object"
          ? JSON.stringify(row[col.key], null, 2)
          : row[col.key]),
      type: col.type,
      header: col.header,
      multiline: multiline,
    };
  }

  function saveInlineEdit() {
    if (!editingCell) return;
    const { id, key, value, type, multiline } = editingCell;

    if (!inlineEdits[id]) inlineEdits[id] = {};

    let val = value;
    if (
      (type === "PgJson" || type.includes("[]")) &&
      typeof val === "string" &&
      val.trim()
    ) {
      try {
        val = JSON.parse(val);
      } catch (e) {
        // keep as string if not valid json
      }
    }

    inlineEdits[id][key] = val;
    editingCell = null;
  }
</script>

<div
  class="collections-root flex h-screen w-full overflow-hidden bg-base-200/50"
>
  <!-- Sidebar -->
  <aside
    class="w-64 bg-base-100 border-r border-base-300 flex flex-col pt-2 shadow-sm"
  >
    <div class="p-4 border-b border-white!/5 bg-base-100 sticky top-0 z-10">
      <h2 class="text-xl font-black flex items-center gap-2">
        <iconify-icon icon="bx:data" class="text-primary"></iconify-icon>
        Collections
      </h2>
      <p
        class="text-[10px] uppercase tracking-widest font-bold opacity-30 mb-4"
      >
        Database Explorer
      </p>
      <a
        href="/_/designer"
        class="btn btn-xs btn-outline btn-primary w-full gap-2 rounded-lg"
      >
        <iconify-icon icon="bx:wrench"></iconify-icon>
        Designer
      </a>
    </div>

    <!-- Table search, mirroring Drizzle Studio's sidebar "Search…" box. -->
    <div class="px-3 pt-3">
      <div class="input input-sm flex items-center gap-2">
        <iconify-icon icon="bx:search" class="opacity-40 shrink-0"
        ></iconify-icon>
        <input
          type="search"
          aria-label="Filter tables"
          placeholder="Search..."
          class="grow min-w-0"
          bind:value={tableSearch}
        />
        {#if tableSearch}
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-square"
            aria-label="Clear table search"
            onclick={() => (tableSearch = "")}
          >
            <iconify-icon icon="bx:x" class="text-base"></iconify-icon>
          </button>
        {/if}
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-1">
      {#if collections.loading && !collections.current}
        <div class="flex flex-col gap-2 p-2">
          {#each Array(8) as _}
            <div
              class="h-10 w-full bg-base-300 animate-pulse rounded-lg opacity-40"
            ></div>
          {/each}
        </div>
      {:else}
        {#each visibleCollections as coll}
          {@const isSelected = selectedTable === coll.name}
          {@const ownFilters =
            isSelected && activeFilters.length ? activeFilters : []}
          <div class="space-y-0.5">
            <div class="flex items-stretch gap-0.5">
              <a
                href="#!/{coll.name}"
                class="btn btn-ghost btn-sm grow justify-start gap-4 normal-case rounded-xl font-medium min-w-0 {isSelected
                  ? 'btn-active bg-primary/10 text-primary hover:bg-primary/20'
                  : 'opacity-60 hover:opacity-100'}"
                onclick={() => selectCollection(coll.name)}
              >
                <iconify-icon icon="bx:table" class="text-lg opacity-40"
                ></iconify-icon>
                <span class="truncate">{coll.name}</span>
              </a>
              {#if isSelected && activeFilters.length}
                <button
                  type="button"
                  class="btn btn-ghost btn-sm btn-square shrink-0 rounded-xl normal-case opacity-60 hover:opacity-100"
                  aria-label="Toggle filters for {coll.name}"
                  aria-expanded={isFilterMenuOpen(coll.name)}
                  onclick={() => toggleFilterMenu(coll.name)}
                >
                  <iconify-icon icon="bx:filter-alt" class="text-lg"
                  ></iconify-icon>
                </button>
              {/if}
            </div>
            <!-- Applied conditions for this table, so you can see or revise a
                 filter without reopening the bar. -->
            {#if isFilterMenuOpen(coll.name)}
              <div
                class="ml-4 pl-3 border-l border-base-300 space-y-0.5 py-0.5"
              >
                {#each ownFilters as f (f.row.col + f.op.label)}
                  <div class="group/filter flex items-stretch gap-0.5">
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm grow justify-start gap-2 normal-case rounded-xl font-medium min-w-0 opacity-60 hover:opacity-100 px-2"
                      title="Edit this filter"
                      onclick={() => editFilter(f.row)}
                    >
                      <span
                        class="badge badge-xs badge-soft badge-primary shrink-0"
                        >{f.col.key}</span
                      >
                      <span class="opacity-50 shrink-0">{f.op.label}</span>
                      <span class="truncate">{f.value}</span>
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm btn-square shrink-0 self-center rounded-xl normal-case opacity-0 group-hover/filter:opacity-60 hover:opacity-100!"
                      aria-label="Remove filter on {f.col.key}"
                      onclick={() => removeFilterByCol(f.row.col)}
                    >
                      <iconify-icon icon="bx:x" class="text-base"
                      ></iconify-icon>
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        {#if !visibleCollections.length}
          <p class="text-xs opacity-40 text-center py-4">No tables found</p>
        {/if}
      {/if}
    </div>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 flex flex-col min-w-0">
    <!-- No side/bottom padding, so the grid runs to the edges like Studio. The
         toolbar tooltips open downward, so nothing needs headroom above and the
         grid can sit flush under the toolbar. -->
    <div class="flex-1 overflow-visible flex flex-col">
      <div
        class="px-4 pt-2 border-b border-base-300 bg-white!/5 backdrop-blur-md z-100"
      >
        <Toolbar bind:query {records}>
          {#snippet trail()}
            {#if (selections.length > 0 && Object.keys(batchData).length > 0) || Object.keys(inlineEdits).length > 0}
              <form
                class="contents"
                {...batchUpdate.enhance(async ({ submit }: any) => {
                  await submit();
                  const count = [
                    ...new Set([...selections, ...Object.keys(inlineEdits)]),
                  ].length;
                  app.showToast(
                    "success",
                    `Successfully updated ${count} rows`,
                  );
                  batchData = {};
                  inlineEdits = {};
                  selections = [];
                  records.refresh();
                })}
              >
                <input type="hidden" name="table" value={selectedTable} />
                <input
                  type="hidden"
                  name="ids"
                  value={JSON.stringify([
                    ...new Set([...selections, ...Object.keys(inlineEdits)]),
                  ])}
                />
                <input
                  type="hidden"
                  name="data"
                  value={JSON.stringify(batchData)}
                />
                <input
                  type="hidden"
                  name="inlineData"
                  value={JSON.stringify(inlineEdits)}
                />
                <button type="submit" class="btn btn-warning btn-sm">
                  {#if batchUpdate.pending}
                    <span class="loading loading-spinner loading-xs"></span>
                  {:else}
                    <iconify-icon icon="bx:save"></iconify-icon>
                  {/if}
                  Save ({[
                    ...new Set([...selections, ...Object.keys(inlineEdits)]),
                  ].length})
                </button>
              </form>
            {/if}
            <button
              class="btn btn-primary btn-sm"
              aria-label="New Row"
              onclick={startCreate}
            >
              <iconify-icon icon="bx:plus"></iconify-icon>
              New Row
            </button>
          {/snippet}

          {#snippet lead()}
            <div class="tooltip">
              <div class="tooltip-content text-xs">
                Filters
                <kbd class="kbd kbd-xs">⇧</kbd>
                <kbd class="kbd kbd-xs">F</kbd>
              </div>
              <button
                class="btn btn-sm relative"
                class:btn-active={showFilters || activeFilters.length > 0}
                aria-label="Toggle filters"
                onclick={toggleFilters}
              >
                <iconify-icon icon="bx:filter-alt"></iconify-icon>
                Filters
                {#if activeFilters.length}
                  <span class="badge badge-xs badge-primary"
                    >{activeFilters.length}</span
                  >
                {/if}
              </button>
            </div>
          {/snippet}

          {#if columnOrder.length || sort.key}
            <div class="tooltip">
              <div class="tooltip-content text-xs">
                Restore default column order and clear sorting
              </div>
              <button
                class="btn btn-sm"
                aria-label="Reset columns"
                onclick={resetColumns}
              >
                <iconify-icon icon="bx:reset"></iconify-icon>
                Reset Columns
              </button>
            </div>
          {/if}

          {#if selections.length}
            <button
              aria-label="Delete Selections"
              class="btn btn-sm btn-error btn-soft"
              onclick={startDelete}
            >
              <iconify-icon icon="bx:trash"></iconify-icon>
              Delete ({selections.length})
            </button>
          {/if}
        </Toolbar>

        <!-- Active filters, modelled on the Drizzle Studio filter bar:
               one row per condition, each a column / operator / value trio. -->
        {#if showFilters}
          <div class="mt-1 py-1 border-t border-base-300 overflow-x-auto">
            <div class="flex w-fit gap-3">
              <div class="grid gap-3">
                {#each filterRows as row, index (index)}
                  {@const col = filterableColumns.find(
                    (c) => c.key === row.col,
                  )}
                  {@const def = opDef(row.op)}
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      class="btn btn-xs btn-square btn-soft"
                      aria-label="Remove filter"
                      onclick={() => removeFilter(index)}
                    >
                      <iconify-icon icon="bx:x" class="text-base"
                      ></iconify-icon>
                    </button>

                    <span
                      class="btn btn-xs btn-soft pointer-events-none w-16 font-normal"
                      aria-hidden="true">where</span
                    >

                    <select
                      class="select select-xs min-w-25 border-none bg-base-200 font-normal"
                      aria-label="Filter column"
                      value={row.col}
                      onchange={(e) => setColumn(row, e.currentTarget.value)}
                    >
                      {#each filterableColumns as c}
                        <option
                          value={c.key}
                          disabled={columnTaken(c.key, index)}
                        >
                          {c.key}
                        </option>
                      {/each}
                    </select>

                    <select
                      class="select select-xs min-w-25 border-none bg-base-200 font-normal"
                      aria-label="Filter operator"
                      value={row.op}
                      onchange={(e) => {
                        row.op = e.currentTarget.value as any;
                        row.values = [""];
                      }}
                    >
                      {#each col ? operatorsFor(col) : [] as opId}
                        <option value={opId}>{OPERATORS[opId].label}</option>
                      {/each}
                    </select>

                    {#if def.arity > 0}
                      {#each Array(def.arity) as _, vIndex}
                        <input
                          aria-label="Filter value"
                          class="input input-xs w-25 border-none bg-base-200 font-normal"
                          placeholder={def.list ? "a, b, c" : "value"}
                          value={row.values[vIndex] ?? ""}
                          oninput={(e) => {
                            row.values[vIndex] = e.currentTarget.value;
                          }}
                        />
                      {/each}
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="flex items-center gap-2 min-w-0.0625rem">
                <div class="self-stretch w-px bg-base-300"></div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="btn btn-xs btn-primary gap-1"
                    disabled={!hasPendingEdits}
                    onclick={applyFilters}
                  >
                    <iconify-icon icon="bx:check" class="text-base"
                    ></iconify-icon>
                    Apply
                  </button>
                  <button
                    type="button"
                    class="btn btn-xs btn-ghost gap-1"
                    onclick={addFilter}
                  >
                    <iconify-icon icon="bx:plus" class="text-base"
                    ></iconify-icon>
                    Add filter
                  </button>
                  <button
                    type="button"
                    class="btn btn-xs btn-ghost gap-1"
                    disabled={!activeFilters.length}
                    onclick={() => (sqlPreview = sqlPreviewText)}
                  >
                    <iconify-icon icon="bx:code" class="text-base"
                    ></iconify-icon>
                    Open in SQL
                  </button>
                  <button
                    type="button"
                    class="btn btn-xs btn-ghost underline"
                    disabled={!filterRows.length}
                    onclick={clearFilters}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <Modal bind:data={sqlPreview} title="SQL Preview" size="lg">
        <pre class="text-xs whitespace-pre-wrap break-all">{sqlPreview}</pre>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn btn-sm btn-secondary"
            onclick={async () => {
              try {
                await navigator.clipboard.writeText(sqlPreview ?? "");
                app.showToast("success", "SQL copied to clipboard");
              } catch {
                app.showToast("error", "Could not access the clipboard");
              }
            }}
          >
            <iconify-icon icon="bx:copy"></iconify-icon>
            Copy
          </button>
        </div>
      </Modal>

      <div class="flex-1 overflow-auto relative pt-0.5">
        <table class="table table-xs table-pin-rows table-pin-cols">
          <thead>
            <tr class="bg-base-100/90 backdrop-blur-sm group/th">
              <th
                class="w-10 sticky left-0 z-20 bg-base-100/90 backdrop-blur-sm border-r border-base-200 p-0 h-7"
              >
                <!-- Mirrors the row checkbox cell so the column stays aligned. -->
                <div class="flex items-center justify-center h-full px-2">
                  <input
                    aria-label="Pilih Semua"
                    type="checkbox"
                    class="checkbox checkbox-xs"
                    checked={selections.length > 0 &&
                      selections.length === items.data.length}
                    onchange={(e) =>
                      (selections = e.currentTarget.checked
                        ? items.data.map((r: any) => r.id)
                        : [])}
                  />
                </div>
              </th>
              {#each columns as col (col.key)}
                {@const isSorted = sort.key === col.key}
                <th
                  class="whitespace-nowrap py-2 pl-3 pr-1 text-[10px] uppercase tracking-widest font-black select-none
                      {isSorted ? 'opacity-100 text-primary' : 'opacity-60'}
                      {dragKey === col.key ? 'opacity-30' : ''}
                      {overKey === col.key && dragKey && dragKey !== col.key
                    ? 'ring-2 ring-inset ring-primary/40'
                    : ''}"
                  draggable="true"
                  aria-sort={isSorted
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"}
                  ondragstart={(e) => onDragStart(e, col.key)}
                  ondragover={(e) => onDragOver(e, col.key)}
                  ondragleave={() => overKey === col.key && (overKey = null)}
                  ondrop={(e) => onDrop(e, col.key)}
                  ondragend={onDragEnd}
                  title="Drag to reorder · Click to sort"
                >
                  <button
                    type="button"
                    class="flex items-center gap-1 cursor-pointer uppercase hover:text-primary transition-colors w-full text-left"
                    onclick={() => toggleSort(col.key)}
                  >
                    <iconify-icon
                      icon="bx:draggable"
                      class="text-sm opacity-0 group-hover/th:opacity-40 hover:!opacity-100 -ml-1 transition-opacity shrink-0 cursor-grab active:cursor-grabbing"
                    ></iconify-icon>
                    <span class="truncate">{col.header}</span>
                    {#if isSorted}
                      <iconify-icon
                        icon={sort.dir === "asc"
                          ? "bx:sort-a-z"
                          : "bx:sort-z-a"}
                        class="text-sm shrink-0"
                      ></iconify-icon>
                    {/if}
                  </button>
                </th>
              {/each}
              <th
                class="w-20 text-center sticky right-0 z-20 bg-base-100/90 backdrop-blur-sm border-l border-base-200 py-2 text-[10px] uppercase font-black opacity-60"
                >Actions</th
              >
            </tr>

            {#if selections.length > 0}
              <tr class="bg-warning/5 border-b-2 border-warning/20">
                <th class="sticky left-0 z-20 bg-warning/5 px-2">
                  <button
                    class="btn btn-ghost btn-xs text-error"
                    onclick={() => (batchData = {})}
                    title="Clear batch edits"
                  >
                    <iconify-icon icon="bx:x"></iconify-icon>
                  </button>
                </th>
                {#each columns as col (col.key)}
                  <th class="p-1">
                    {#if !col.isId}
                      <input
                        aria-label={`Bulk edit ${col.header}`}
                        type="text"
                        class="input input-bordered input-xs w-full bg-base-100"
                        placeholder={`Bulk ${col.header}...`}
                        bind:value={batchData[col.key]}
                      />
                    {/if}
                  </th>
                {/each}
                <th class="sticky right-0 z-20 bg-warning/5"></th>
              </tr>
            {/if}
          </thead>
          <tbody>
            {#if records.loading}
              {#each Array(5) as _}
                <tr class="animate-pulse">
                  <td><div class="h-4 w-4 bg-base-300 rounded"></div></td>
                  {#each schema?.columns || [] as _}
                    <td><div class="h-4 w-24 bg-base-300 rounded"></div></td>
                  {/each}
                  <td
                    ><div
                      class="h-8 w-16 bg-base-300 rounded mx-auto"
                    ></div></td
                  >
                </tr>
              {/each}
            {:else if !items.data?.length}
              <tr>
                <td
                  colspan={(schema?.columns.length || 0) + 2}
                  class="text-center py-20 opacity-50"
                >
                  <div class="flex flex-col items-center gap-3">
                    <iconify-icon icon="bx:folder-open" class="text-5xl"
                    ></iconify-icon>
                    <p>No rows found in this collection</p>
                  </div>
                </td>
              </tr>
            {:else}
              {#each items.data as row}
                <tr class="hover:bg-base-200/50 transition-colors group">
                  <td
                    class="sticky left-0 z-10 bg-base-100 group-hover:bg-base-200 transition-colors border-r border-base-200/50 p-0 h-7"
                  >
                    <div class="flex items-center justify-center h-full px-2">
                      <input
                        aria-label="Pilih Baris"
                        type="checkbox"
                        class="checkbox checkbox-xs"
                        bind:group={selections}
                        value={row.id}
                      />
                    </div>
                  </td>
                  {#each columns as col (col.key)}
                    <td
                      class="p-0 border-r border-base-200/30 last:border-r-0 min-w-50"
                    >
                      {#if col.isId || col.type === "PgTimestamp"}
                        <div
                          class="px-4 h-7 flex items-center truncate text-[10px] font-mono opacity-40 select-none"
                        >
                          {col.type === "PgTimestamp"
                            ? d(row[col.key]).format("DD/MM/YY HH:mm")
                            : (row[col.key] ?? "-")}
                        </div>
                      {:else}
                        {@const hasEdit =
                          inlineEdits[row.id]?.[col.key] !== undefined}
                        {@const hasBatch =
                          selections.includes(row.id) &&
                          batchData[col.key] !== undefined}
                        {@const val = hasEdit
                          ? inlineEdits[row.id][col.key]
                          : hasBatch
                            ? batchData[col.key]
                            : row[col.key]}
                        {@const isEditingMultiline =
                          editingCell?.id === row.id &&
                          editingCell?.key === col.key &&
                          editingCell?.multiline}

                        <div class="relative w-full h-7 group/cell">
                          <input
                            aria-label={`Edit ${col.header}`}
                            type="text"
                            class="input input-xs w-full h-full bg-transparent border-none rounded-none font-mono text-[10px] px-4 focus:bg-base-100 focus:outline outline-primary/50 transition-all hover:bg-base-200/20 focus:z-30 relative {hasEdit ||
                            hasBatch
                              ? 'bg-warning/10 border-l-2 border-warning/50'
                              : ''} {val === null ? 'opacity-20 italic' : ''}"
                            value={typeof val === "object"
                              ? JSON.stringify(val)
                              : (val ?? "NULL")}
                            oninput={(e: any) => {
                              if (!inlineEdits[row.id])
                                inlineEdits[row.id] = {};
                              inlineEdits[row.id][col.key] =
                                e.currentTarget.value;
                            }}
                            ondblclick={() => startInlineEdit(row, col, true)}
                          />

                          <button
                            aria-label="Edit cell"
                            class="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/cell:opacity-100 btn btn-square btn-ghost btn-xs text-primary transition-all"
                            onclick={(e) => {
                              e.stopPropagation();
                              startInlineEdit(row, col, true);
                            }}
                          >
                            <iconify-icon icon="bx:edit-alt"></iconify-icon>
                          </button>

                          {#if isEditingMultiline}
                            {@const cell = editingCell!}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                              class="absolute top-0 left-0 z-500 bg-base-100 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-primary/30 flex flex-col min-w-xs w-sm"
                              onclick={(e) => e.stopPropagation()}
                              onmousedown={(e) => e.stopPropagation()}
                            >
                              <textarea
                                class="textarea textarea-ghost w-full font-mono text-[10px] px-3 leading-relaxed resize-y overflow-auto focus:outline-none bg-transparent"
                                rows="6"
                                bind:value={cell.value}
                                onkeydown={(e) => {
                                  if (
                                    e.key === "Enter" &&
                                    (e.ctrlKey || e.metaKey)
                                  )
                                    saveInlineEdit();
                                  if (e.key === "Escape") editingCell = null;
                                }}
                              ></textarea>

                              <div
                                class="bg-base-200/80 backdrop-blur-sm p-2 flex justify-between items-center border-t border-base-300"
                              >
                                <div class="flex gap-1">
                                  <button
                                    class="btn btn-xs btn-ghost text-[9px] font-bold opacity-50 hover:opacity-100"
                                    onclick={() => {
                                      cell.value = null;
                                      saveInlineEdit();
                                    }}
                                  >
                                    SET NULL
                                  </button>
                                </div>
                                <div class="flex gap-2">
                                  <button
                                    class="btn btn-xs btn-ghost text-[9px]"
                                    onclick={() => (editingCell = null)}
                                  >
                                    CANCEL
                                  </button>
                                  <button
                                    class="btn btn-xs btn-primary text-[9px] px-3 font-bold"
                                    onclick={saveInlineEdit}
                                  >
                                    SAVE ⌃↵
                                  </button>
                                </div>
                              </div>
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </td>
                  {/each}
                  <td
                    class="text-center p-0 sticky right-0 z-10 bg-base-100 group-hover:bg-base-200 transition-colors border-l border-base-200/50 h-7"
                  >
                    <div class="flex items-center justify-center h-full gap-1">
                      <button
                        title="Edit"
                        aria-label="Edit Baris"
                        class="btn btn-square btn-ghost btn-xs transition-all text-base-content/30 group-hover:text-primary scale-75"
                        onclick={() => startEdit(row)}
                      >
                        <iconify-icon icon="bx:edit-alt" class="text-xl"
                        ></iconify-icon>
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </main>
</div>

<!-- Edit Modal -->
<Modal
  bind:data={showEditModal}
  title={editingRow?.id ? `Edit Row: ${editingRow.id}` : "Create New Row"}
>
  <form
    {...upsertData.enhance(async ({ submit }: any) => {
      await submit();
      app.showToast(
        "success",
        editingRow?.id
          ? "Row updated successfully"
          : "New row created successfully",
      );
      showEditModal = false;
      records.refresh();
    })}
    class="space-y-4"
  >
    <input type="hidden" name="table" value={selectedTable} />

    <div class="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto px-1">
      {#each schema?.columns || [] as col}
        <fieldset class="fieldset w-full p-0 m-0">
          <legend
            class="fieldset-legend uppercase font-bold text-[9px] opacity-40 px-1 py-0 mb-0.5"
          >
            {col.header}
            {#if !col.isNullable && !col.isId}
              <span class="text-error font-mono">*</span>
            {/if}
            <span class="ml-auto font-mono lowercase text-[9px] opacity-30">
              {col.type}{col.isArray ? "[]" : ""}
            </span>
          </legend>

          {#if col.isId}
            <input
              id={`input_${col.key}`}
              name={col.key}
              bind:value={editingRow[col.key]}
              class="input input-bordered input-sm w-full font-mono text-xs"
              placeholder={editingRow?.id
                ? editingRow[col.key]
                : "Enter ID or leave for auto"}
            />
          {:else if col.type === "PgBoolean"}
            <div class="flex items-center h-8">
              <input
                id={`input_${col.key}`}
                type="checkbox"
                name={col.key}
                bind:checked={editingRow[col.key]}
                class="toggle toggle-primary toggle-sm"
              />
            </div>
          {:else if col.isArray || col.type === "PgJson" || (col.type === "PgText" && (editingRow[col.key]?.length > 50 || col.header
                  .toLowerCase()
                  .includes("desc")))}
            <textarea
              id={`input_${col.key}`}
              name={col.key}
              bind:value={editingRow[col.key]}
              onfocus={(e) => {
                if (
                  (col.type === "PgJson" || col.isArray) &&
                  typeof editingRow[col.key] === "object"
                ) {
                  editingRow[col.key] = JSON.stringify(
                    editingRow[col.key],
                    null,
                    2,
                  );
                }
              }}
              class="textarea textarea-bordered textarea-sm w-full font-mono text-xs"
              rows="6"
            ></textarea>
          {:else}
            <input
              id={`input_${col.key}`}
              type={col.type === "PgInteger" ? "number" : "text"}
              name={col.key}
              bind:value={editingRow[col.key]}
              class="input input-bordered input-sm w-full font-mono text-xs"
            />
          {/if}
        </fieldset>
      {/each}
    </div>

    <div class="modal-action mt-4 border-t border-base-300 pt-3">
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        onclick={() => (showEditModal = false)}
        disabled={!!upsertData.pending}
      >
        Cancel
      </button>
      <button
        type="submit"
        class="btn btn-sm btn-primary min-w-[100px]"
        disabled={!!upsertData.pending}
      >
        {#if upsertData.pending}
          <span class="loading loading-spinner loading-xs mr-2"></span>
          Saving...
        {:else}
          <iconify-icon icon="bx:save" class="mr-2"></iconify-icon>
          {editingRow?.id ? "Update Row" : "Create Row"}
        {/if}
      </button>
    </div>
  </form>
</Modal>

<!-- Delete Modal -->
<Modal bind:data={showDeleteModal} title="Delete Confirmation">
  <form
    {...deleteCollectionRows.enhance(async ({ submit }: any) => {
      await submit();
      app.showToast("error", `Deleted ${selections.length} rows successfully`);
      showDeleteModal = false;
      selections = [];
      records.refresh();
    })}
    class="space-y-4"
  >
    <input type="hidden" name="table" value={selectedTable} />
    <input type="hidden" name="ids" value={JSON.stringify(selections)} />

    <div class="flex flex-col items-center gap-4 py-6">
      <div
        class="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center text-error"
      >
        <iconify-icon icon="bx:trash" class="text-4xl"></iconify-icon>
      </div>
      <div class="text-center">
        <h3 class="text-lg font-bold">Are you absolutely sure?</h3>
        <p class="text-sm opacity-60">
          This will permanently delete <span class="font-bold text-error"
            >{selections.length}</span
          >
          rows from the <span class="font-bold">{selectedTable}</span> collection.
          This action cannot be undone.
        </p>
      </div>
    </div>

    <div class="modal-action border-t border-base-300 pt-4">
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        onclick={() => (showDeleteModal = false)}
        disabled={!!deleteCollectionRows.pending}
      >
        Cancel
      </button>
      <button
        type="submit"
        class="btn btn-sm btn-error"
        disabled={!!deleteCollectionRows.pending}
      >
        {#if deleteCollectionRows.pending}
          <span class="loading loading-spinner loading-xs mr-2"></span>
          Deleting...
        {:else}
          <iconify-icon icon="bx:trash" class="mr-2"></iconify-icon>
          Confirm Delete
        {/if}
      </button>
    </div>
  </form>
</Modal>

<svelte:window
  onhashchange={() => {
    let hash = window.location.hash.slice(1);
    if (hash.startsWith("!/")) hash = hash.slice(2);
    if (hash && hash !== selectedTable) {
      selectCollection(hash);
    }
  }}
  onmousedown={(e) => {
    if (editingCell && !(e.target as HTMLElement).closest(".relative.z-100")) {
      editingCell = null;
    }
  }}
/>

<style>
  :global(.table :where(th, td)) {
    border-color: color-mix(in srgb, var(--color-base-300), transparent 70%);
  }

  .btn-active {
    box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
  }

  /* The toolbar hugs the top of the viewport here, and daisyUI's default
     tooltips open upward, so they get clipped by the page shell. Flip every
     tooltip in this page to open downward instead. `collections-root` scopes
     it to this page, and `:global` is required because the shared <Toolbar>
     renders its own tooltips in its own scope. */
  .collections-root :global(.tooltip) {
    --tt-off: calc(-100% - 0.5rem);
    --tt-tail: calc(-100% - 1px - 0.25rem);
  }
</style>
