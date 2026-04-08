<script lang="ts">
  import {
    getCollectionData,
    getCollections,
    deleteCollectionRows,
    getLogStats,
    type CollectionSchema,
  } from "$lib/remotes/collections.remote";
  import { type GetParams } from "$lib/remotes/api.remote";
  import { Toolbar, Modal, Chart } from "$lib/components";
  import { d } from "$lib/utils";

  let query: GetParams<any> = $state({
    table: "__logs",
    limit: 50,
    offset: 0,
    where: {},
    orderBy: { created: "desc" },
  });

  const collections = $derived(getCollections({}));
  const records = $derived(getCollectionData(query));
  const stats = $derived(getLogStats({ where: query.where }));

  const schema = $derived(
    collections.current?.find((c: CollectionSchema) => c.name === "__logs"),
  );
  const items = $derived(records.current ?? { data: [], count: 0 });

  let selections = $state<string[]>([]);
  let showDeleteModal = $state<boolean | undefined>(false);
  let showViewModal = $state<boolean | undefined>(false);
  let selectedLog = $state<any>(null);

  function getLevelClass(level: string) {
    switch (level?.toLowerCase()) {
      case "error":
        return "text-error bg-error/10";
      case "warn":
        return "text-warning bg-warning/10";
      default:
        return "text-info bg-info/10";
    }
  }
</script>

<div class="flex flex-col h-screen w-full bg-base-200/50 overflow-hidden">
  <header class="p-6 bg-base-100 border-b border-base-300">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-black tracking-tight flex items-center gap-3">
          <iconify-icon icon="bx:history" class="text-primary"></iconify-icon>
          System Logs
        </h1>
      </div>

      <div class="flex gap-2">
        {#if selections.length}
          <button
            class="btn btn-error btn-xs gap-2"
            onclick={() => (showDeleteModal = true)}
          >
            <iconify-icon icon="bx:trash"></iconify-icon>
            Clear Selected ({selections.length})
          </button>
        {/if}
        <button
          aria-label="Refresh Logs"
          class="btn btn-ghost btn-xs btn-square"
          onclick={() => {
            records.refresh();
            stats.refresh();
          }}
        >
          <iconify-icon icon="bx:refresh" class="text-lg"></iconify-icon>
        </button>
      </div>
    </div>
  </header>

  <main class="flex-1 p-4 overflow-hidden flex flex-col pt-2">
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
          <li>Status</li>
          <li class="text-primary font-mono tracking-normal uppercase truncate">
            System Logs
          </li>
        </ul>
      </nav>

      <!-- Reusable Chart Component -->
      <div class="px-4 py-0 bg-base-100">
        <Chart
          data={stats.current?.series || []}
          loading={stats.loading}
          title={items.count.toString()}
          subtitle="Severity Distribution (30d)"
          height={200}
        />
      </div>

      <div
        class="p-4 border-b border-base-300 bg-base-100/80 backdrop-blur-md z-30"
      >
        <Toolbar bind:query {records}>
          {#snippet filter(where)}
            <div class="flex flex-col gap-4 p-4 min-w-[300px]">
              <div class="form-control">
                <label class="label pb-1" for="filter_level">
                  <span class="label-text text-xs font-semibold"
                    >Severity Level</span
                  >
                </label>
                <select
                  id="filter_level"
                  bind:value={where.level}
                  class="select select-bordered select-sm w-full"
                >
                  <option value="">All Gravities</option>
                  <option value="info">Information</option>
                  <option value="warn">Warning</option>
                  <option value="error">Critical Error</option>
                </select>
              </div>
              <div class="form-control">
                <label class="label pb-1" for="filter_message">
                  <span class="label-text text-xs font-semibold"
                    >Search Content</span
                  >
                </label>
                <input
                  id="filter_message"
                  bind:value={where.message}
                  placeholder="Keyword search..."
                  class="input input-bordered input-sm w-full"
                />
              </div>
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
                  aria-label="Select All"
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
                >
                  {col.header}
                </th>
              {/each}
              <th
                class="w-10 text-center sticky right-0 z-20 bg-base-100/90 backdrop-blur-sm border-l border-base-200 text-[10px] uppercase font-black opacity-60"
                >Actions</th
              >
            </tr>
          </thead>
          <tbody>
            {#if records.loading}
              {#each Array(8) as _}
                <tr class="animate-pulse">
                  <td class="sticky left-0 bg-base-100 border-r border-base-200"
                    ><div class="h-4 w-4 bg-base-200 rounded"></div></td
                  >
                  {#each Array(schema?.columns.length || 5) as _}
                    <td><div class="h-4 w-24 bg-base-200 rounded"></div></td>
                  {/each}
                </tr>
              {/each}
            {:else if !items.data?.length}
              <tr>
                <td
                  colspan={(schema?.columns.length || 0) + 1}
                  class="text-center py-32 opacity-20"
                >
                  <div class="flex flex-col items-center gap-4">
                    <iconify-icon icon="bx:ghost" class="text-7xl"
                    ></iconify-icon>
                    <p class="font-bold tracking-widest uppercase text-xs">
                      A Silence in the Machine
                    </p>
                  </div>
                </td>
              </tr>
            {:else}
              {#each items.data as log}
                <tr class="hover:bg-base-200/50 group transition-colors">
                  <td
                    class="sticky left-0 z-10 bg-base-100 group-hover:bg-base-200 transition-colors border-r border-base-200/50"
                  >
                    <input
                      aria-label="Select Entry"
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      bind:group={selections}
                      value={log.id}
                    />
                  </td>

                  {#each schema?.columns || [] as col}
                    <td
                      class="border-r border-base-200/30 font-mono text-[10px] py-3"
                    >
                      {#if col.key === "level"}
                        <span
                          class="badge badge-sm font-black uppercase text-[8px] border-none {getLevelClass(
                            log[col.key],
                          )}"
                        >
                          {log[col.key]}
                        </span>
                      {:else if col.key === "created"}
                        <span class="opacity-40"
                          >{d(log[col.key]).format("DD/MM HH:mm:ss")}</span
                        >
                      {:else if col.key === "message"}
                        <div
                          class="font-bold text-base-content/80 max-w-xl truncate"
                          title={log[col.key]}
                        >
                          {log[col.key]}
                        </div>
                      {:else if col.key === "metadata"}
                        <div class="opacity-30 italic truncate max-w-xs">
                          {JSON.stringify(log[col.key])}
                        </div>
                      {:else}
                        <span
                          class={col.key === "method"
                            ? "font-black text-primary"
                            : "opacity-60"}
                        >
                          {log[col.key] ?? "-"}
                        </span>
                      {/if}
                    </td>
                  {/each}
                  <td
                    class="sticky right-0 z-10 bg-base-100 group-hover:bg-base-200 transition-colors border-l border-base-200/50 text-center"
                  >
                    <button
                      class="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100 transition-all"
                      onclick={() => {
                        selectedLog = log;
                        showViewModal = true;
                      }}
                      title="View Details"
                    >
                      <iconify-icon icon="bx:show" class="text-lg"
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
  </main>
</div>

<Modal bind:data={showDeleteModal} title="Confirm Archival">
  <form
    {...deleteCollectionRows.enhance(async ({ submit }: any) => {
      await submit();
      showDeleteModal = false;
      selections = [];
      records.refresh();
      stats.refresh();
    })}
    class="space-y-6"
  >
    <input type="hidden" name="table" value="__logs" />
    <input type="hidden" name="ids" value={JSON.stringify(selections)} />

    <div class="flex flex-col items-center gap-6 py-6 text-center">
      <div
        class="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center text-error border-4 border-error/5 animate-pulse"
      >
        <iconify-icon icon="bx:trash" class="text-5xl"></iconify-icon>
      </div>
      <div>
        <h3 class="text-xl font-black">Purge {selections.length} Entries?</h3>
        <p class="text-sm opacity-50 mt-2 px-6">
          You are about to permanently remove these history markers from the
          core logging system. This cannot be undone.
        </p>
      </div>
    </div>

    <div class="modal-action border-t border-base-300 pt-4">
      <button
        type="button"
        class="btn btn-ghost"
        onclick={() => (showDeleteModal = false)}>Keep Logs</button
      >
      <button type="submit" class="btn btn-error shadow-lg shadow-error/30"
        >Destroy Permanently</button
      >
    </div>
  </form>
</Modal>

<Modal bind:data={showViewModal} title="Event Deep Dive">
  {#if selectedLog}
    <div class="space-y-6 max-h-[70vh] overflow-auto pr-4">
      <div class="flex items-center gap-4 p-4 bg-base-200 rounded-2xl">
        <div
          class="badge badge-lg font-black uppercase {getLevelClass(
            selectedLog.level,
          )}"
        >
          {selectedLog.level}
        </div>
        <div class="flex flex-col">
          <span class="text-[10px] font-black uppercase opacity-40"
            >Timestamp</span
          >
          <span class="font-mono text-sm"
            >{d(selectedLog.created).format("LLLL")}</span
          >
        </div>
      </div>

      <div class="space-y-2">
        <h4 class="text-xs font-black uppercase tracking-widest opacity-40">
          Message
        </h4>
        <div
          class="p-4 bg-base-300/50 rounded-2xl font-mono text-sm border border-base-300"
        >
          {selectedLog.message}
        </div>
      </div>

      {#if selectedLog.metadata}
        <div class="space-y-2">
          <h4 class="text-xs font-black uppercase tracking-widest opacity-40">
            Context Metadata
          </h4>
          <pre
            class="p-4 bg-neutral text-neutral-content rounded-2xl text-xs overflow-auto max-h-[300px]">
              {JSON.stringify(selectedLog.metadata, null, 2)}
           </pre>
        </div>
      {/if}

      <div class="grid grid-cols-2 gap-4">
        {#each Object.entries(selectedLog) as [key, value]}
          {#if !["id", "message", "level", "created", "metadata"].includes(key)}
            <div
              class="flex flex-col gap-1 p-3 border border-base-300 rounded-xl"
            >
              <span class="text-[9px] font-black uppercase opacity-40"
                >{key}</span
              >
              <span
                class="font-mono text-xs truncate bg-base-200 px-2 py-1 rounded-md"
                >{value ?? "-"}</span
              >
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
  <div class="modal-action border-t border-base-300 pt-4">
    <button
      class="btn btn-primary rounded-xl px-10"
      onclick={() => (showViewModal = false)}>Close Analysis</button
    >
  </div>
</Modal>

<style>
  :global(.table :where(th, td)) {
    border-color: color-mix(in srgb, var(--color-base-300), transparent 80%);
  }
</style>
