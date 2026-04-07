<script lang="ts">
  import {
    getCollections,
    upsertData,
    getCollectionData,
    type CollectionSchema,
  } from "$lib/remotes/collections.remote";
  import { delData, type GetParams } from "$lib/remotes/api.remote";
  import { Toolbar, Modal } from "$lib/components";
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

  $effect(() => {
    if (collections.current?.length && !selectedTable) {
      selectedTable = collections.current[0].name;
      untrack(() => {
        query.table = selectedTable;
      });
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
  const items = $derived(records.current ?? { data: [], count: 0 });
  const schema = $derived(
    collections.current?.find(
      (c: CollectionSchema) => c.name === selectedTable,
    ),
  );
  const displayName = $derived(selectedTable.replace(/_/g, " "));

  let editingRow = $state<any>(null);
  // Modal states should be boolean or any T that is truthy... using boolean | undefined to match modal's Esc close behavior
  let showEditModal = $state<boolean | undefined>(false);
  let showDeleteModal = $state<boolean | undefined>(false);
  let selections: string[] = $state([]);

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
</script>

<div class="flex h-screen overflow-hidden bg-base-200/50">
  <!-- Sidebar -->
  <aside class="w-64 bg-base-100 border-r border-base-300 flex flex-col">
    <div
      class="p-4 border-b border-base-300 bg-base-100/50 backdrop-blur-sm sticky top-0 z-10"
    >
      <h2 class="text-lg font-bold flex items-center gap-2">
        <iconify-icon icon="bx:data" class="text-primary"></iconify-icon>
        Collections
      </h2>
      <p class="text-xs text-base-content/60">Manage Database Tables</p>
    </div>

    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      {#if collections.loading && !collections.current}
        <div class="flex flex-col gap-2 p-2">
          {#each Array(8) as _}
            <div class="h-10 w-full bg-base-300 animate-pulse rounded-lg"></div>
          {/each}
        </div>
      {:else}
        {#each collections.current || [] as coll}
          <button
            class="btn btn-ghost btn-sm w-full justify-start gap-3 normal-case {selectedTable ===
            coll.name
              ? 'btn-active bg-primary/10 text-primary hover:bg-primary/20'
              : ''}"
            onclick={() => selectCollection(coll.name)}
          >
            <iconify-icon icon="bx:table" class="text-lg opacity-70"
            ></iconify-icon>
            <span class="truncate">{coll.name}</span>
            <span class="ml-auto opacity-40 text-[10px]">CQL</span>
          </button>
        {/each}
      {/if}
    </div>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 flex flex-col min-w-0">
    <div class="flex-1 p-3 pb-0 space-y-4 overflow-hidden flex flex-col">
      <div class="flex justify-between items-center gap-4 px-1">
        <div class="flex items-center gap-3 whitespace-nowrap min-w-0">
          <h1
            class="text-2xl font-black tracking-tight capitalize text-base-content shrink-0"
          >
            {displayName}
          </h1>
        </div>

        <div class="flex gap-2">
          <button
            class="btn btn-primary btn-sm shadow-sm"
            onclick={startCreate}
          >
            <iconify-icon icon="bx:plus"></iconify-icon>
            New Row
          </button>
        </div>
      </div>

      <nav
        class="text-[10px] uppercase tracking-widest font-bold breadcrumbs p-0 opacity-40 min-w-0"
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
            class="text-primary/80 font-mono tracking-normal lowercase truncate"
          >
            {selectedTable}
          </li>
        </ul>
      </nav>
      <div
        class="bg-base-100 rounded-t-2xl shadow-2xl shadow-base-300/50 border border-base-300 border-b-0 flex-1 flex flex-col overflow-hidden"
      >
        <div
          class="p-4 border-b border-base-300 bg-base-100/80 backdrop-blur-md"
        >
          <Toolbar bind:query {records}>
            {#if selections.length}
              <button
                class="btn btn-sm btn-error btn-soft"
                onclick={startDelete}
              >
                <iconify-icon icon="bx:trash"></iconify-icon>
                Delete ({selections.length})
              </button>
            {/if}

            {#snippet filter(where)}
              <div class="grid grid-cols-2 gap-4 p-4">
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

        <div class="flex-1 overflow-auto relative">
          <table class="table table-sm table-pin-rows table-pin-cols">
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
                  <th class="whitespace-nowrap py-3">{col.header}</th>
                {/each}
                <th
                  class="w-20 text-center sticky right-0 z-20 bg-base-100/90 backdrop-blur-sm border-l border-base-200"
                  >Actions</th
                >
              </tr>
            </thead>
            <tbody>
              {#if records.loading}
                {#each Array(5) as _}
                  <tr>
                    <td
                      ><div
                        class="h-4 w-4 bg-base-300 animate-pulse rounded"
                      ></div></td
                    >
                    {#each schema?.columns || [] as _}
                      <td
                        ><div
                          class="h-4 w-24 bg-base-300 animate-pulse rounded"
                        ></div></td
                      >
                    {/each}
                    <td
                      ><div
                        class="h-8 w-16 bg-base-300 animate-pulse rounded mx-auto"
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
                      class="sticky left-0 z-10 bg-base-100 group-hover:bg-base-200 transition-colors border-r border-base-200/50"
                    >
                      <input
                        aria-label="Pilih Baris"
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        bind:group={selections}
                        value={row.id}
                      />
                    </td>
                    {#each schema?.columns || [] as col}
                      <td
                        class="max-w-xs truncate text-xs font-mono opacity-80"
                      >
                        {#if col.type === "PgTimestamp"}
                          {d(row[col.key]).format("DD MMM YYYY, HH:mm")}
                        {:else if typeof row[col.key] === "object"}
                          <span class="text-[10px] opacity-60"
                            >{JSON.stringify(row[col.key])}</span
                          >
                        {:else}
                          {row[col.key] ?? "-"}
                        {/if}
                      </td>
                    {/each}
                    <td
                      class="text-center p-0.5 sticky right-0 z-10 bg-base-100 group-hover:bg-base-200 transition-colors border-l border-base-200/50"
                    >
                      <button
                        title="Edit"
                        aria-label="Edit Baris"
                        class="btn btn-square btn-ghost btn-sm transition-all"
                        onclick={() => startEdit(row)}
                      >
                        <iconify-icon icon="bx:edit-alt" class="text-lg"
                        ></iconify-icon>
                      </button>
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
    {...upsertData.enhance(async ({ submit }) => {
      await submit();
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
    {...delData.enhance(async ({ submit }) => {
      await submit();
      showDeleteModal = false;
      selections = [];
      records.refresh();
    })}
    class="space-y-4"
  >
    <input type="hidden" name="table" value={selectedTable} />
    {#each selections as id}
      <input type="hidden" name="id[]" value={id} />
    {/each}

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
        disabled={!!delData.pending}
      >
        Cancel
      </button>
      <button
        type="submit"
        class="btn btn-sm btn-error"
        disabled={!!delData.pending}
      >
        {#if delData.pending}
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

<style>
  :global(.table :where(th, td)) {
    border-color: color-mix(in srgb, var(--color-base-300), transparent 70%);
  }

  .btn-active {
    box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
  }
</style>
