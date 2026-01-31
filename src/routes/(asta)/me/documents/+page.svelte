<script lang="ts">
  import { getData, type GetParams } from "$lib/remotes/api.remote";
  import { Toolbar } from "$lib/components";
  import { d } from "$lib/utils";

  const expand = {
    with: {
      user: {},
    },
  };
  let query: GetParams<"documents"> = $state({
    table: "documents",
    limit: 20,
    offset: 0,
    where: {},
    ...expand,
  });
  const records = $derived(getData({ ...query, ...expand }));
  const items = $derived(records.current ?? { data: [], count: 0 });
  let selections: string[] = $state([]);

  $effect(() => {
    items;
    selections = [];
  });
</script>

<div class="px-5">
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
          <th class="min-w-64">Nama Dokumen</th>
          <th class="w-64">File</th>
          <th>Tipe</th>
          <th>Status</th>
          <th>Signer</th>
          <th>Dibuat</th>
          <th>Diperbarui</th>
          <th>Metadata</th>
          <th class="w-1 text-center">#</th>
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
          {#each items.data as item, i}
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
              <td>
                {#if item.esign}
                  <span class="badge badge-sm badge-soft badge-success">
                    ESign
                  </span>
                {:else}
                  <span class="badge badge-sm badge-soft badge-warning">
                    Manual
                  </span>
                {/if}
              </td>
              <td>{item.status}</td>
              <td>{item.signer?.split("@")[0]}</td>
              <td class="text-xs whitespace-nowrap">
                {d(item.created).format("HH:mm, DD MMM YYYY")}
              </td>
              <td class="text-xs whitespace-nowrap">
                {d(item.updated).format("HH:mm, DD MMM YYYY")}
              </td>
              <td>{JSON.stringify(item.metadata)}</td>
              <th>
                <a
                  href={`/sign?id=${item.id}`}
                  class="btn btn-sm btn-soft tooltip tooltip-left"
                  aria-label="sign"
                  data-tip="Tanda Tangan"
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
