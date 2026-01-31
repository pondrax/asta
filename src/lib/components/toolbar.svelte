<script
  lang="ts"
  generics="T extends {
    current?: { data: any[]; count: number; time: string };
    refresh: () => void;
    loading: boolean
  }"
>
  import { getLeafValues } from "$lib/utils";

  import Modal from "./modal.svelte";
  type Props = {
    query: {
      limit: number;
      offset: number;
      search?: string;
      where?: Record<string, any>;
    };
    records: T;
    children?: () => any;
    extended?: () => any;
    filter?: () => any;
    pageList?: number[];
    defaultFilter?: Record<string, any>;
  };
  let {
    query = $bindable({
      limit: 10,
      offset: 0,
      search: "",
    }),
    records,
    children,
    extended,
    filter,
    pageList = $bindable([5, 10, 20, 30, 50, 100, 250]),
    defaultFilter = [],
  }: Props = $props();

  let exportAll = $state(false);
  let filterModal = $state(false);
  let search = $state("");
</script>

<div>
  <div class="flex gap-2 justify-between mb-2 z-1 relative">
    <div class="flex gap-2">
      {#if filter}
        <button class="btn btn-sm" onclick={() => (filterModal = !filterModal)}>
          <iconify-icon icon="bx:filter-alt"></iconify-icon>
          Filter
        </button>
      {/if}
      <div class="input input-sm">
        <iconify-icon icon="bx:search"></iconify-icon>
        <input
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
      {@render children?.()}
    </div>

    <div class="flex gap-2">
      {@render extended?.()}
      <div class="join">
        <button
          class="btn btn-sm join-item"
          onclick={() => (query.offset -= query.limit)}
          disabled={query.offset <= 0}
          aria-label="Previous"
        >
          <iconify-icon icon="bx:chevron-left"></iconify-icon>
        </button>
        <button
          class="btn btn-sm join-item"
          onclick={() => (query.offset += query.limit)}
          disabled={query.offset + query.limit >= (records.current?.count || 0)}
          aria-label="Next"
        >
          <iconify-icon icon="bx:chevron-right"></iconify-icon>
        </button>
        <div class="dropdown dropdown-end">
          <div
            tabindex="0"
            role="button"
            class="btn btn-sm join-item font-normal flex-col gap-0 text-[10px]!"
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
              {:else}
                No data
              {/if}
            </div>
            <div>
              {records.current?.time}
            </div>
          </div>
          <ul
            tabindex="-1"
            class="dropdown-content menu bg-base-100 rounded-box z-1 w-36 p-2 shadow-sm"
          >
            <li class="menu-title text-xs">Goto Page</li>
            <li>
              <div class="input input-sm">
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
              </div>
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
          <div
            tabindex="0"
            role="button"
            class="btn btn-sm join-item"
            aria-label="Setting"
          >
            <iconify-icon icon="bx:dots-vertical"></iconify-icon>
          </div>
          <ul
            tabindex="-1"
            class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm"
          >
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
                Export {exportAll ? "All" : "Current Page"}
                <input
                  type="checkbox"
                  class="toggle toggle-sm"
                  bind:checked={exportAll}
                />
              </label>
            </li>
            <li><button>JSON</button></li>
            <li><button>CSV</button></li>
          </ul>
        </div>
      </div>
    </div>
  </div>
  <div>
    <!-- {JSON.stringify(query.where)} -->

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
  {@render filter?.()}
</Modal>
