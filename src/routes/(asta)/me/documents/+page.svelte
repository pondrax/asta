<script lang="ts">
  import { getData, type GetDataParams } from "$lib/remotes/api.remote";
  import { Toolbar } from "$lib/components";
  let query: GetDataParams<"documents"> = $state({
    limit: 10,
    offset: 0,
    where: {},
    search: "",
  });
  const records = $derived(
    getData({
      table: "documents",
      ...query,
    }),
  );
  const items = $derived(records.current ?? { data: [], count: 0 });
  let selections: string[] = $state([]);
</script>

<div class="p-5">
  <h3 class="text-xl">Daftar Dokumen</h3>

  <Toolbar bind:query {records}>
    <div class="fab">
      <a
        href="/sign"
        class="btn btn-lg btn-circle btn-primary"
        aria-label="Unggah"
      >
        <iconify-icon icon="bx:plus"></iconify-icon>
      </a>
    </div>
    {#if selections.length}
      <a href="/sign?id={selections}" class="btn btn-sm btn-primary">
        <iconify-icon icon="bx:pen" class="mr-2"></iconify-icon>
        Tanda Tangan
      </a>
      <button class="btn btn-sm btn-error">
        <iconify-icon icon="bx:trash" class="mr-2"></iconify-icon>
        Hapus
      </button>
    {/if}
    {#snippet extended()}
      <form
        class="filter"
        onchange={(e) => (query.where!.status = e.currentTarget.status.value)}
        onreset={() => (query.where!.status = {})}
      >
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
    {/snippet}
    {#snippet filter()}
      <input bind:value={query.search} />
    {/snippet}
  </Toolbar>

  <div class="overflow-x-auto h-[calc(100vh-12rem)] w-full z-0 relative">
    <table class="table table-pin-rows table-pin-cols">
      <thead>
        <tr>
          <th class="w-1 z-1">
            <input
              type="checkbox"
              class="checkbox"
              bind:checked={
                () =>
                  !!selections.length &&
                  selections.length === items.data?.length,
                (v) => {
                  selections = v ? items.data?.map((r) => r.id) || [] : [];
                }
              }
            />
          </th>
          <th class="w-1">No</th>
          <th class="min-w-64">Nama Dokumen</th>
          <th class="w-64">File</th>
          <th>Metadata</th>
          <th>Signer</th>
          <th>Tanggal</th>
          <th>Status</th>
          <th class="w-1">#</th>
        </tr>
      </thead>
      <tbody>
        {#if records.loading}
          <tr>
            <th></th>
            <th colspan="4">Loading...</th>
          </tr>
        {:else if !items.data?.length}
          <tr>
            <th></th>
            <th colspan="4">No data</th>
          </tr>
        {:else}
          {#each items.data.slice(0, query.limit) as item, i}
            <tr>
              <th>
                <div class="flex gap-1">
                  <input
                    type="checkbox"
                    class="checkbox"
                    bind:group={selections}
                    value={item.id}
                  />
                </div>
              </th>
              <td>{i + 1}</td>
              <td>{item.title}</td>
              <td>
                <div class="space-y-2">
                  {#each item.files as file}
                    <a href={file} target="_blank" class="btn btn-xs btn-soft">
                      <iconify-icon icon="bx:file"></iconify-icon>
                      <span class="max-w-64 truncate text-left">
                        {file?.split("/")?.pop()}
                      </span>
                    </a>
                  {/each}
                </div>
              </td>
              <td>{JSON.stringify(item.metadata)}</td>
              <td>{item.signer?.split("@")[0]}</td>
              <td>{item.created}</td>
              <td>{item.status}</td>
              <th>
                <a
                  href={`/sign?id=${item.id}`}
                  class="btn btn-xs btn-soft"
                  aria-label="sign"
                >
                  <iconify-icon icon="bx:pen"></iconify-icon>
                </a>
              </th>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
