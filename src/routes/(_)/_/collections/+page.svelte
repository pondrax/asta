<script lang="ts">
  import {
    getCollections,
    upsertData,
    batchUpdate,
    deleteCollectionRows,
    getCollectionData,
    getTableStats,
    type CollectionSchema,
  } from "$lib/remotes/collections.remote";
  import { type GetParams } from "$lib/remotes/api.remote";
  import { Toolbar, Modal, Chart } from "$lib/components";
  import { d } from "$lib/utils";
  import { untrack } from "svelte";

  const collections = $derived(getCollections({}));
  let selectedTable = $state("");

  let query: GetParams<any> = $state({
    table: "",
    limit: 20,
    offset: 0,
    where: {},
  });

  let editingRow = $state<any>(null);
  let batchData = $state<Record<string, any>>({});
  let inlineEdits = $state<Record<string, any>>({});
  let selections = $state<string[]>([]);
  let toasts = $state<{ id: number; msg: string; type: string }[]>([]);

  let editingCell = $state<{
    id: any;
    key: string;
    value: any;
    type: string;
    header: string;
    multiline: boolean;
  } | null>(null);

  function showToast(msg: string, type = "success") {
    const id = Date.now();
    toasts = [...toasts, { id, msg, type }];
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 3000);
  }

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

  const stats = $derived(
    selectedTable
      ? getTableStats({ table: selectedTable, where: query.where })
      : ({ current: null, loading: false } as any),
  );

  const items = $derived(records.current ?? { data: [], count: 0 });
  const schema = $derived(
    collections.current?.find(
      (c: CollectionSchema) => c.name === selectedTable,
    ),
  );
  const displayName = $derived(selectedTable.replace(/_/g, " "));

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

<div class="flex h-screen w-full overflow-hidden bg-base-200/50">
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
        {#each (collections.current || []).filter((c: any) => !c.name.startsWith("__")) as coll}
          <a
            href="#!/{coll.name}"
            class="btn btn-ghost btn-sm w-full justify-start gap-4 normal-case rounded-xl font-medium {selectedTable ===
            coll.name
              ? 'btn-active bg-primary/10 text-primary hover:bg-primary/20'
              : 'opacity-60 hover:opacity-100'}"
            onclick={() => selectCollection(coll.name)}
          >
            <iconify-icon icon="bx:table" class="text-lg opacity-40"
            ></iconify-icon>
            <span class="truncate">{coll.name}</span>
          </a>
        {/each}
      {/if}
    </div>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 flex flex-col min-w-0">
    <div class="flex-1 p-4 space-y-4 overflow-hidden flex flex-col">
      <div class="flex justify-between items-center gap-4 px-2 pt-2">
        <div class="flex items-center gap-3 whitespace-nowrap min-w-0">
          <h1
            class="text-3xl font-black tracking-tight capitalize text-base-content shrink-0"
          >
            {displayName}
          </h1>
        </div>

        <div class="flex gap-2 items-center">
          {#if (selections.length > 0 && Object.keys(batchData).length > 0) || Object.keys(inlineEdits).length > 0}
            <form
              class="contents"
              {...batchUpdate.enhance(async ({ submit }: any) => {
                await submit();
                const count = [
                  ...new Set([...selections, ...Object.keys(inlineEdits)]),
                ].length;
                showToast(`Successfully updated ${count} rows`);
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
              <button type="submit" class="btn btn-warning btn-sm shadow-sm">
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
            class="btn btn-primary btn-sm shadow-sm shadow-primary/20 rounded-lg px-4"
            onclick={startCreate}
          >
            <iconify-icon icon="bx:plus" class="text-lg"></iconify-icon>
            New Row
          </button>
        </div>
      </div>

      <div
        class="bg-base-100 rounded-t-3xl shadow-2xl shadow-base-300/50 border border-base-300 border-b-0 flex-1 flex flex-col overflow-hidden"
      >
        <nav
          class="text-[10px] uppercase tracking-widest font-bold breadcrumbs px-6 pt-5 opacity-80 min-w-0"
        >
          <ul class="flex-nowrap">
            <li>
              <iconify-icon icon="bx:data" class="mr-1"></iconify-icon> Database
            </li>
            <li>
              <a
                href="/_/collections"
                class="hover:text-primary transition-colors">Collections</a
              >
            </li>
            <li
              class="text-primary font-mono tracking-normal uppercase truncate"
            >
              {selectedTable}
            </li>
          </ul>
        </nav>

        <!-- Reusable Chart Component -->
        <div class="px-6 py-2 mt-2 bg-base-100">
          <Chart
            data={stats.current?.series || []}
            loading={stats.loading}
            isCollapsed={true}
            title={items.count.toString()}
            subtitle="Archive Growth (30d)"
            height={180}
            categories={[
              { key: "count", color: "var(--color-primary)", label: "Rows" },
            ]}
          />
        </div>

        <div
          class="p-4 border-b border-base-300 bg-white!/5 backdrop-blur-md z-100"
        >
          <Toolbar bind:query {records}>
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

            {#snippet filter(where)}
              <div class="grid grid-cols-1 gap-4 py-4 min-w-[300px]">
                {#each schema?.columns || [] as col}
                  <div class="form-control w-full">
                    <label class="label pb-1" for={`filter_${col.key}`}>
                      <span class="label-text text-xs font-semibold"
                        >{col.header}</span
                      >
                    </label>
                    <input
                      id={`filter_${col.key}`}
                      bind:value={where[col.key]}
                      placeholder={`Search ${col.header}...`}
                      class="input input-bordered input-sm w-full"
                    />
                  </div>
                {/each}
              </div>
            {/snippet}
          </Toolbar>
        </div>

        <div class="flex-1 overflow-auto relative pt-0.5">
          <table class="table table-xs table-pin-rows table-pin-cols">
            <thead>
              <tr class="bg-base-100/90 backdrop-blur-sm">
                <th
                  class="w-10 sticky left-0 z-20 bg-base-100/90 backdrop-blur-sm border-r border-base-200"
                >
                  <input
                    aria-label="Pilih Semua"
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    checked={selections.length > 0 &&
                      selections.length === items.data.length}
                    onchange={(e) =>
                      (selections = e.currentTarget.checked
                        ? items.data.map((r: any) => r.id)
                        : [])}
                  />
                </th>
                {#each schema?.columns || [] as col}
                  <th
                    class="whitespace-nowrap py-4 text-[10px] uppercase tracking-widest font-black opacity-60"
                    >{col.header}</th
                  >
                {/each}
                <th
                  class="w-20 text-center sticky right-0 z-20 bg-base-100/90 backdrop-blur-sm border-l border-base-200 text-[10px] uppercase font-black opacity-60"
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
                  {#each schema?.columns || [] as col}
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
                    {#each schema?.columns || [] as col}
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
                                class="absolute top-0 left-0 z-500 bg-base-100 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-primary/30 overflow-hidden flex flex-col w-sm h-30"
                                onclick={(e) => e.stopPropagation()}
                                onmousedown={(e) => e.stopPropagation()}
                              >
                                <textarea
                                  class="textarea textarea-ghost flex-1 font-mono text-[10px] px-3 leading-relaxed resize-none focus:outline-none bg-transparent"
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
                      <div
                        class="flex items-center justify-center h-full gap-1"
                      >
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
      showToast(
        editingRow?.id
          ? "Row updated successfully"
          : "New row created successfully",
      );
      showEditModal = false;
      records.refresh();
      if (stats.refresh) stats.refresh();
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
      showToast(`Deleted ${selections.length} rows successfully`, "error");
      showDeleteModal = false;
      selections = [];
      records.refresh();
      if (stats.refresh) stats.refresh();
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

<div class="toast toast-end toast-bottom z-9999">
  {#each toasts as toast (toast.id)}
    <div
      class="alert {toast.type === 'error'
        ? 'alert-error'
        : 'alert-success'} py-2 px-4 shadow-xl text-white text-xs font-semibold animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <iconify-icon
        icon={toast.type === "error" ? "bx:error-circle" : "bx:check-circle"}
      ></iconify-icon>
      <span>{toast.msg}</span>
    </div>
  {/each}
</div>

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
</style>
