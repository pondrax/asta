<script
  lang="ts"
  generics="T extends {
    current?: { data: any[]; count: number; time: string };
    refresh: () => void;
    loading: boolean
  }"
>
  import { d, getLeafValues } from "$lib/utils";
  import Export from "./export.svelte";
  import Modal from "./modal.svelte";

  type Item = NonNullable<T["current"]>["data"][number];
  type Where = NonNullable<Props["query"]["where"]>;
  type Props = {
    query: {
      table: string;
      limit: number;
      offset: number;
      search?: string;
      where?: Record<string, any>;
    };
    records: T;
    children?: () => any;
    extended?: () => any;
    filter?: (query: Where) => any;
    mapper?: {
      import?: (item: Item, data: Item[]) => void;
      export?: (item: Item, index: number, data: Item[]) => any;
    };
    pageList?: number[];
    defaultFilter?: Record<string, any>;
  };
  let {
    query = $bindable({
      table: "",
      limit: 10,
      offset: 0,
      search: "",
    }),
    records,
    children,
    extended,
    filter,
    mapper,
    pageList = $bindable([5, 10, 20, 30, 50, 100, 250, 500, 1000]),
    defaultFilter = [],
  }: Props = $props();

  let search = $state("");
  let filterWhere: Where = $state({});
  let exportAll = $state(false);
  let filterModal = $state(false);
  let exportLoading = $state(false);

  let searchInput = $state() as HTMLInputElement;
  let pagingDropdown = $state() as HTMLDivElement;
  let actionDropdown = $state() as HTMLDivElement;

  function toggleFocus(el: HTMLElement | null | undefined) {
    if (!el) return;

    if (document.activeElement === el) {
      el.blur(); // unfocus
    } else {
      el.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const shortcuts: Record<string, () => void> = {
      "Shift+ArrowLeft": () =>
        (query.offset = Math.max(0, query.offset - query.limit)),
      "Shift+ArrowRight": () =>
        (query.offset = Math.min(
          records.current?.count || 0,
          query.offset + query.limit,
        )),
      "Shift+f": () => (filterModal = !filterModal),
      "Shift+g": () => toggleFocus(pagingDropdown),
      "Shift+a": () => toggleFocus(actionDropdown),
      k: () => toggleFocus(searchInput),
    };

    const key = e.shiftKey ? `Shift+${e.key}` : e.key;

    const handler = shortcuts[key];

    if (!handler) return;

    e.preventDefault();
    handler();
  }
</script>

<div>
  <div class="flex gap-2 justify-between mb-2 z-1 relative">
    <div class="flex gap-2">
      {#if filter}
        <div class="tooltip">
          <div class="tooltip-content text-xs">
            Filter
            <kbd class="kbd kbd-sm ml-2">⌘</kbd>
            <kbd class="kbd kbd-sm">⇧</kbd>
            <kbd class="kbd kbd-sm">F</kbd>
          </div>
          <button
            class="btn btn-sm"
            onclick={() => {
              filterModal = !filterModal;
              filterWhere = Object.assign({}, query.where);
            }}
          >
            <iconify-icon icon="bx:filter-alt"></iconify-icon>
            Filter
          </button>
        </div>
      {/if}

      <div class="tooltip">
        {#if !search}
          <div class="tooltip-content text-xs">
            Search
            <kbd class="kbd kbd-sm ml-2">⌘</kbd>
            <kbd class="kbd kbd-sm">K</kbd>
          </div>
        {/if}
        <div class="input input-sm">
          <iconify-icon icon="bx:search"></iconify-icon>
          <input
            bind:this={searchInput}
            type="search"
            placeholder="Cari dokumen"
            class="transition-all"
            onfocus={(e) => e.currentTarget.classList.add("w-64")}
            onblur={(e) => e.currentTarget.classList.remove("w-64")}
            bind:value={
              () => search,
              (v) => {
                search = v;
                query.search = v;
                query.offset = 0;
              }
            }
          />
        </div>
      </div>
      {@render children?.()}
    </div>

    <div class="flex gap-2">
      {@render extended?.()}
      <div class="join">
        <div class="tooltip">
          <div class="tooltip-content text-xs">
            Previous
            <kbd class="kbd kbd-sm ml-2">⌘</kbd>
            <kbd class="kbd kbd-sm">⇧</kbd>
            <kbd class="kbd kbd-sm">←</kbd>
          </div>
          <button
            class="btn btn-sm join-item"
            onclick={() => (query.offset -= query.limit)}
            disabled={query.offset <= 0}
            aria-label="Previous"
          >
            <iconify-icon icon="bx:chevron-left"></iconify-icon>
          </button>
        </div>
        <div class="tooltip">
          <div class="tooltip-content text-xs">
            Next
            <kbd class="kbd kbd-sm ml-2">⌘</kbd>
            <kbd class="kbd kbd-sm">⇧</kbd>
            <kbd class="kbd kbd-sm">→</kbd>
          </div>
          <button
            class="btn btn-sm join-item"
            onclick={() => (query.offset += query.limit)}
            disabled={query.offset + query.limit >=
              (records.current?.count || 0)}
            aria-label="Next"
          >
            <iconify-icon icon="bx:chevron-right"></iconify-icon>
          </button>
        </div>

        <div class="dropdown dropdown-end">
          <div class="tooltip">
            <div class="tooltip-content text-xs">
              Paging
              <kbd class="kbd kbd-sm">⌘</kbd>
              <kbd class="kbd kbd-sm">⇧</kbd>
              <kbd class="kbd kbd-sm">G</kbd>
            </div>
            <div
              bind:this={pagingDropdown}
              tabindex="0"
              role="button"
              class="btn btn-sm join-item font-normal flex-col gap-0 text-[10px]! min-w-36 whitespace-nowrap"
              aria-label="Paging"
            >
              <div>
                {#if records.current?.count}
                  {query.offset + 1} -
                  {isNaN(query.limit) || query.limit > records.current?.count
                    ? records.current?.count
                    : query.offset + query.limit}
                  of
                  {records.current?.count}
                {:else if records.loading}
                  Loading...
                {:else}
                  No data
                {/if}
              </div>
              <div>
                {records.current?.time}
              </div>
            </div>
          </div>
          <ul
            tabindex="-1"
            class="dropdown-content menu bg-base-100 rounded-box z-1 w-36 p-2 shadow-sm"
          >
            <li class="menu-title text-xs">Goto Page</li>
            <li>
              <form class="input input-sm">
                <input
                  type="number"
                  min={1}
                  max={Math.ceil((records.current?.count || 0) / query.limit)}
                  value={query.offset / query.limit + 1}
                />

                <button
                  onclick={(e) => {
                    const input = e.currentTarget
                      .previousElementSibling as HTMLInputElement;
                    const page = Number(input.value) || 1;

                    query.offset = (page - 1) * query.limit;
                  }}
                >
                  Go
                </button>
              </form>
            </li>
            <li></li>
            <li class="menu-title text-xs">Per Page</li>
            {#each pageList.filter((v, i, arr) => {
              const count = records.current?.count ?? -1;
              return v <= count || v === arr.find((x) => x >= count);
            }) as perPage}
              <li class:menu-active={query.limit === perPage}>
                <button
                  onclick={() => {
                    query.limit = perPage;
                    query.offset = 0;
                  }}
                >
                  {perPage}
                </button>
              </li>
            {/each}
          </ul>
        </div>

        <div class="dropdown dropdown-end">
          <div class="tooltip">
            <div class="tooltip-content text-xs">
              <kbd class="kbd kbd-sm">⌘</kbd>
              <kbd class="kbd kbd-sm">⇧</kbd>
              <kbd class="kbd kbd-sm">A</kbd>
            </div>
            <div
              bind:this={actionDropdown}
              tabindex="0"
              role="button"
              class="btn btn-sm join-item"
              aria-label="Setting"
            >
              <iconify-icon icon="bx:dots-vertical"></iconify-icon>
            </div>
          </div>
          <ul
            tabindex="-1"
            class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm"
          >
            <li class="menu-title text-xs">Actions</li>
            <li>
              <button onclick={() => records.refresh()}>
                <iconify-icon
                  icon="bx:refresh"
                  class:animate-spin={records.loading}
                ></iconify-icon>
                Refresh
              </button>
            </li>
            <li></li>
            <li class="menu-title text-xs">
              <label class="flex justify-between">
                Export {exportAll ? "All Data" : "Current Page"}
                {#if exportLoading}
                  <span class="loading loading-spinner loading-xs"></span>
                {:else}
                  <input
                    type="checkbox"
                    class="toggle toggle-sm"
                    bind:checked={exportAll}
                  />
                {/if}
              </label>
            </li>
            <Export
              data={records.current?.data || []}
              bind:exportLoading
              {exportAll}
              {query}
              {mapper}
            />
          </ul>
        </div>
      </div>
    </div>
  </div>
  <div>
    {#each Object.entries(query.where ?? {}) as [key, value]}
      {@const val = getLeafValues(value)}
      {#if val.length}
        <div class="join">
          <span class="btn btn-xs btn-soft">
            {key?.toUpperCase()} : {val}
          </span>
          <button
            type="button"
            class="btn btn-xs btn-square"
            aria-label="remove"
            onclick={() => {
              if (query.where) {
                if (key in defaultFilter) {
                  // reset to default value
                  query.where[key] = defaultFilter[key];
                } else {
                  // remove completely
                  delete query.where[key];
                }
              }
            }}
          >
            <iconify-icon icon="bx:x" class="text-lg"></iconify-icon>
          </button>
        </div>
      {/if}
    {/each}
  </div>
</div>

<Modal bind:data={filterModal} title="Filter Data">
  <form
    onsubmit={() => {
      query.where = Object.assign({}, filterWhere);
      filterModal = false;
    }}
  >
    <div class="space-y-2 min-h-30 overflow-y-auto px-1">
      {@render filter?.(filterWhere)}
    </div>
    <div class="flex gap-2">
      <button type="submit" class="btn btn-sm btn-secondary">
        <iconify-icon icon="bx:filter-alt"></iconify-icon>
        Filter
      </button>
      <button
        type="button"
        class="btn btn-sm btn-soft"
        onclick={() => {
          query.where = {};
          filterModal = false;
        }}
      >
        <iconify-icon icon="bx:x"></iconify-icon>
        Reset
      </button>
    </div>
  </form>
</Modal>

<svelte:window onkeydown={handleKeyDown} />
