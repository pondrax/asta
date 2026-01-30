<script lang="ts">
  import { getData, type GetDataParams } from "$lib/remotes/api.remote";

  type Query = Omit<GetDataParams<"documents">, "table">;
  let query = $state<
    Query & {
      limit: number;
      offset: number;
      where: NonNullable<Query["where"]>;
    }
  >({
    limit: 30,
    offset: 0,
    where: {},
  });
  const records = $derived(
    getData({
      table: "documents",
      ...query,
    }),
  );
  let selections: string[] = $state([]);
  let search = $state("");
</script>

<div class="max-w-7xl mx-auto p-5">
  <h3 class="text-xl">Daftar Dokumen</h3>

  <!-- <pre>{JSON.stringify(selections, null, 2)}</pre> -->
  <div class="flex gap-2 justify-between mb-2">
    <div class="flex gap-2">
      <div class="input input-sm">
        <iconify-icon icon="bx:search"></iconify-icon>
        <input
          type="search"
          placeholder="Cari dokumen"
          bind:value={
            () => search,
            (v) => {
              search = v;
              query.where.title = v ? { like: `%${v}%` } : {};
              query.offset = 0;
            }
          }
        />
      </div>
      <a href="/sign" class="btn btn-primary btn-sm btn-soft">
        <iconify-icon icon="bx:pen" class="mr-2"></iconify-icon>
        Tanda Tangan Dokumen
      </a>
    </div>
    <div class="flex gap-2">
      <form class="filter" onchange={(e) => console.log(e)}>
        <input class="btn btn-sm btn-square" type="reset" value="x" />
        <input
          class="btn btn-sm"
          type="radio"
          name="status"
          value="draft"
          aria-label="Draft"
        />
        <input
          class="btn btn-sm"
          type="radio"
          name="status"
          value="signed"
          aria-label="Ditandatangani"
        />
      </form>
      <div class="join">
        <div
          class="btn btn-sm text-xs! font-normal join-item whitespace-nowrap"
        >
          {#if records.current?.count}
            {query.offset + 1} -
            {query.offset + query.limit}
            /
            {records.current?.count}
          {:else}
            No data
          {/if}
        </div>
        <button
          class="btn btn-sm join-item"
          onclick={() =>
            (query.offset = Math.max(0, query.offset - query.limit))}
          aria-label="Previous"
        >
          <iconify-icon icon="bx:chevron-left"></iconify-icon>
        </button>
        <button
          class="btn btn-sm join-item"
          onclick={() =>
            (query.offset = Math.min(
              records.current?.count || -1,
              query.offset + query.limit,
            ))}
          aria-label="Next"
        >
          <iconify-icon icon="bx:chevron-right"></iconify-icon>
        </button>
      </div>
    </div>
  </div>
  <div class="overflow-x-auto h-[calc(100vh-12rem)] w-full">
    <table class="table table-pin-rows table-pin-cols">
      <thead>
        <tr>
          <th class="w-1">
            <input
              type="checkbox"
              class="checkbox"
              bind:checked={
                () => selections.length == records.current?.data?.length,
                (v) => {
                  selections = v
                    ? records.current?.data?.map((r) => r.id) || []
                    : [];
                }
              }
            />
          </th>
          <th class="w-1">No</th>
          <th>Nama Dokumen</th>
          <th>Tanggal Dibuat</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {#if records.loading}
          <tr>
            <th></th>
            <th colspan="4">Loading...</th>
          </tr>
        {:else if records.current}
          {#each records.current?.data as record, i}
            <tr>
              <td>
                <input
                  type="checkbox"
                  class="checkbox"
                  bind:group={selections}
                  value={record.id}
                />
              </td>
              <td>{i + 1}</td>
              <td>{record.title}</td>
              <td>{record.created}</td>
              <td>{record.status}</td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
