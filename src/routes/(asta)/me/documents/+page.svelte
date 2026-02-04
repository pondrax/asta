<script lang="ts">
  import { delData, getData, type GetParams } from "$lib/remotes/api.remote";
  import { Modal, Toolbar } from "$lib/components";
  import { d, withTimeout } from "$lib/utils";

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
  const forms: Record<string, any> = $state({});
  let selections: string[] = $state([]);
  $effect(() => {
    items.count;
    selections = [];
  });
</script>

<Modal bind:data={forms.del} title="Delete Data">
  <form
    {...delData.enhance(async ({ form, data, submit }) => {
      try {
        await submit();
        forms.del = false;
      } catch (e) {
        console.error(e);
      }
    })}
  >
    <input type="hidden" name="table" value="documents" />
    <p class="sticky top-0 bg-base-100 py-2">
      Apakah Anda yakin ingin menghapus data ini?
    </p>
    {#each selections as id}
      {@const item = items.data.find((i) => i.id === id)}
      <div>
        <input type="text" name="id[]" value={id} class="w-20" readonly />
        - {item?.title}
      </div>
    {/each}
    <div class="sticky bottom-0 bg-base-100 pt-2">
      <button
        type="submit"
        class="btn btn-sm btn-error"
        disabled={!!delData.pending}
      >
        {#if delData.pending}
          <span class="loading loading-spinner loading-xs"></span>
        {:else}
          <iconify-icon icon="bx:trash"></iconify-icon>
        {/if}
        Hapus
      </button>
    </div>
  </form>
</Modal>

<div class="px-5 overflow-x-clip pt-2">
  <h3 class="text-xl">Daftar Dokumen</h3>

  <Toolbar
    bind:query
    {records}
    mapper={{
      export: (item) => ({
        coba: item.id,
        ...item,
      }),
    }}
  >
    <div class="fab">
      <a
        href="/sign"
        class="btn btn-lg btn-circle btn-primary tooltip"
        data-tip="Unggah"
        aria-label="Unggah"
      >
        <iconify-icon icon="bx:plus"></iconify-icon>
      </a>
    </div>
    {#if selections.length}
      <form action="/sign" method="POST">
        <input type="hidden" name="id" value={selections} />
        <button type="submit" class="btn btn-sm btn-primary whitespace-nowrap">
          <iconify-icon icon="bx:pen"></iconify-icon>
          Tanda Tangan
        </button>
      </form>
      <!-- <a href="/sign?id={selections}" class="btn btn-sm btn-primary">
        <iconify-icon icon="bx:pen" class="mr-2"></iconify-icon>
        Share
      </a> -->
      <button class="btn btn-sm btn-error" onclick={() => (forms.del = true)}>
        <iconify-icon icon="bx:trash" class="mr-2"></iconify-icon>
        Hapus
      </button>
    {/if}
    {#snippet extended()}
      <div class="filter">
        <input
          bind:group={query.where!.status}
          value="draft"
          class="btn btn-sm"
          type="radio"
          name="status"
          aria-label="Draft"
        />
        <input
          bind:group={query.where!.status}
          value="signed"
          class="btn btn-sm"
          type="radio"
          name="status"
          aria-label="Ditandatangani"
        />
        <input
          bind:group={query.where!.status}
          value={{}}
          class="btn btn-sm filter-reset"
          type="radio"
          name="status"
          aria-label="x"
        />
      </div>
    {/snippet}
    {#snippet filter(where)}
      <div>
        <span class="text-xs">Judul</span>
        <input bind:value={where.title} class="input input-sm" />
      </div>
    {/snippet}
  </Toolbar>

  <div class="overflow-x-auto h-[calc(100vh-12rem)] w-full z-0 relative">
    <table class="table table-sm table-pin-rows table-pin-cols">
      <thead>
        <tr>
          <th class="w-1 z-1">
            <div
              class="tooltip tooltip-right"
              class:tooltip-open={!!selections.length}
              data-tip={selections.length
                ? selections.length + " Terpilih"
                : "Pilih Semua"}
            >
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
            </div>
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
            <th colspan="10">
              <span class="loading loading-spinner loading-xs mr-2"></span>
              Memuat data...
            </th>
          </tr>
        {:else if records.error}
          <tr>
            <th></th>
            <th colspan="10" class="text-error">
              <iconify-icon icon="bx:error-circle" class="mr-2"></iconify-icon>
              Gagal memuat data: {records.error.message}
              <button
                class="btn btn-xs btn-error btn-outline ml-2"
                onclick={() => records.refresh()}
              >
                Coba Lagi
              </button>
            </th>
          </tr>
        {:else if !items.data?.length}
          <tr>
            <th></th>
            <th colspan="10">No data</th>
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
                <div class="flex gap-1 -m-1">
                  <form action="/sign" method="POST" target="_blank">
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      class="btn btn-sm btn-soft btn-primary tooltip tooltip-left"
                      aria-label="sign"
                      data-tip="Tanda Tangan"
                    >
                      <iconify-icon icon="bx:pen"></iconify-icon>
                    </button>
                  </form>
                  <a
                    href="/verify?id={item.id}"
                    target="_blank"
                    class="btn btn-sm btn-soft btn-accent tooltip tooltip-left"
                    aria-label="Verifikasi"
                    data-tip="Verifikasi Dokumen"
                  >
                    <iconify-icon icon="bx:search"></iconify-icon>
                  </a>
                </div>
              </th>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
