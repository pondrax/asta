<script lang="ts">
  import { delData, getData, type GetParams } from "$lib/remotes/api.remote";
  import { Modal, Toolbar } from "$lib/components";
  import { d } from "$lib/utils";

  const expand = {};
  let query: GetParams<"__logs"> = $state({
    table: "__logs",
    limit: 20,
    offset: 0,
    orderBy: {
      created: "desc",
    },
    where: {},
    ...expand,
  });
  const records = $derived(getData({ ...query, ...expand }));
  const items = $derived(records.current ?? { data: [], count: 0 });
  const forms: Record<string, any> = $state({});
  let selections: string[] = $state([]);

  let lastCount = $state(0);
  $effect(() => {
    if (records.current && lastCount !== items.count) {
      query.offset = 0;
      lastCount = items.count;
      selections = [];
    }
  });
</script>

<!-- <Modal bind:data={forms.del} title="Delete Data">
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
        - {item?.email}
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
</Modal> -->

<div class="px-6 py-4 space-y-3 max-w-7xl mx-auto">
  <div class="flex items-center justify-between gap-4">
    <div>
      <h1
        class="text-2xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent"
      >
        Log Aktivitas
      </h1>
      <p class="text-sm opacity-60">Catatan aktivitas dan audit trail sistem</p>
    </div>
  </div>

  <div
    class="bg-base-100/40 border border-base-200/60 rounded-2xl p-4 shadow-sm backdrop-blur space-y-4"
  >
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
      {#snippet filter(where)}
        <div class="form-control w-full max-w-xs">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="label py-1">
            <span class="label-text font-bold text-xs opacity-75">Cari Pesan</span>
          </label>
          <input
            bind:value={where.message}
            class="input input-sm input-bordered"
            placeholder="Masukkan kata kunci..."
          />
        </div>
      {/snippet}
    </Toolbar>

    <!-- Table Container -->
    <div
      class="overflow-x-auto border border-base-300/60 rounded-xl bg-base-100/50 backdrop-blur-md h-[calc(100vh-17.5rem)] relative shadow-inner"
    >
      <table class="table table-md table-pin-rows table-pin-cols">
        <thead>
          <tr
            class="bg-base-200/50 text-base-content/80 font-bold border-b border-base-300"
          >
            <th class="w-12 text-center bg-base-200/50 z-20">
              <input
                type="checkbox"
                class="checkbox checkbox-sm checkbox-primary"
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
            <th class="w-24">Level</th>
            <th class="min-w-[280px]">Pesan</th>
            <th class="w-48">URL</th>
            <th class="w-24">Method</th>
            <th class="w-44">Waktu</th>
          </tr>
        </thead>
        <tbody>
          {#if records.loading}
            <tr>
              <td colspan="6" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-2">
                  <span class="loading loading-spinner loading-md text-primary"></span>
                  <span class="text-sm opacity-55 font-medium">Memuat data log...</span>
                </div>
              </td>
            </tr>
          {:else if records.error}
            <tr>
              <td colspan="6" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-3 text-error">
                  <iconify-icon icon="bx:error-circle" class="text-3xl"></iconify-icon>
                  <div class="text-sm font-semibold">
                    Gagal memuat data: {records.error.message}
                  </div>
                  <button
                    class="btn btn-sm btn-error btn-outline"
                    onclick={() => records.refresh()}
                  >
                    Coba Lagi
                  </button>
                </div>
              </td>
            </tr>
          {:else if !items.data?.length}
            <tr>
              <td colspan="6" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-2 opacity-40">
                  <iconify-icon icon="bx:list-ul" class="text-3xl"></iconify-icon>
                  <span class="text-sm font-medium">Tidak ada data log</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each items.data as item}
              <tr class="hover:bg-base-200/30 transition-colors">
                <td class="text-center">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm checkbox-primary"
                    bind:group={selections}
                    value={item.id}
                  />
                </td>
                <td>
                  <span
                    class="badge badge-sm font-black uppercase border-none"
                    class:badge-error={item.level === "error"}
                    class:badge-warning={item.level === "warn"}
                    class:badge-info={item.level === "info"}
                  >
                    {item.level}
                  </span>
                </td>
                <td class="font-mono text-xs max-w-sm truncate">{item.message || "-"}</td>
                <td class="text-xs opacity-60 max-w-48 truncate font-mono">{item.url || "-"}</td>
                <td class="text-xs opacity-60 font-mono">{item.method || "-"}</td>
                <td class="text-xs opacity-60 whitespace-nowrap">
                  {d(item.created).format("HH:mm, DD MMM YYYY")}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>

