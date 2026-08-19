<script lang="ts">
  import { delData, getData, type GetParams } from "$lib/remotes/api.remote";
  import { Modal, Toolbar } from "$lib/components";
  import { d } from "$lib/utils";

  let query: GetParams<"templates"> = $state({
    table: "templates",
    limit: 20,
    offset: 0,
    where: {},
  });
  const records = $derived(getData({ ...query }));
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

  let editItem = $state<any>(null);
  let editForm = $state<any>({});

  function openEdit(item: any) {
    editItem = item;
    editForm = {
      name: item.name,
      description: item.properties?.description || "",
      type: item.properties?.type || "bsre",
    };
    forms.edit = true;
  }
</script>

<Modal bind:data={forms.del} title="Hapus Template">
  <form
    {...delData.enhance(async (form) => {
      try {
        const data = await form.submit();
        forms.del = false;
        selections = [];
        console.log(data);
      } catch (e) {
        console.error(e);
      }
    })}
    class="space-y-4"
  >
    <input type="hidden" name="table" value="templates" />
    <div class="text-sm opacity-80 mb-2">
      Apakah Anda yakin ingin menghapus template berikut? Tindakan ini tidak
      dapat dibatalkan.
    </div>
    <div class="max-h-48 overflow-y-auto space-y-2 pr-1">
      {#each selections as id}
        {@const item = items.data.find((i) => i.id === id)}
        <div
          class="flex items-center gap-2 p-2 rounded-lg bg-base-200/50 border border-base-300"
        >
          <input
            type="text"
            name="id[]"
            value={id}
            class="input input-xs w-24 font-mono text-center"
            readonly
          />
          <span class="text-sm font-semibold truncate flex-1"
            >{item?.name || "Template Tanpa Nama"}</span
          >
        </div>
      {/each}
    </div>
    <div class="flex justify-end gap-2 pt-2 border-t border-base-200">
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        onclick={() => (forms.del = false)}>Batal</button
      >
      <button
        type="submit"
        class="btn btn-sm btn-error"
        disabled={!!delData.pending}
      >
        {#if delData.pending}
          <span class="loading loading-spinner loading-xs"></span>
        {:else}
          <iconify-icon icon="bx:trash" class="text-sm"></iconify-icon>
        {/if}
        Hapus {selections.length} Template
      </button>
    </div>
  </form>
</Modal>

<Modal bind:data={forms.edit} title="Detail Template" size="lg">
  {#if editItem}
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <label class="floating-label">
          <span>Nama</span>
          <input
            type="text"
            class="input"
            value={editForm.name}
            readonly
          />
        </label>
        <label class="floating-label">
          <span>Tipe</span>
          <input
            type="text"
            class="input"
            value={editForm.type === "bsre" ? "Tanda Tangan Elektronik" : "Tanda Tangan Manual"}
            readonly
          />
        </label>
      </div>
      <label class="floating-label">
        <span>Deskripsi</span>
        <input
          type="text"
          class="input"
          value={editForm.description}
          readonly
        />
      </label>
      <div>
        <div class="text-xs font-bold opacity-70 mb-1">File</div>
        {#if editItem.file}
          <div class="flex items-center gap-2">
            <a
              href={editItem.file}
              target="_blank"
              class="btn btn-xs btn-primary"
            >
              <iconify-icon icon="bx:link-external" class="text-sm"></iconify-icon>
              Lihat File
            </a>
            <span class="text-xs opacity-50 font-mono truncate max-w-xs">
              {editItem.file.split("/").pop()}
            </span>
          </div>
        {:else}
          <span class="text-xs opacity-50 italic">Tidak ada file</span>
        {/if}
      </div>
      {#if editItem.properties?.to?.length}
        <div>
          <div class="text-xs font-bold opacity-70 mb-1">Ditujukan Untuk</div>
          <div class="flex flex-wrap gap-1">
            {#each editItem.properties.to as role}
              <span class="badge badge-sm badge-outline">{role}</span>
            {/each}
          </div>
        </div>
      {/if}
      <div class="grid grid-cols-2 gap-4 text-xs opacity-60">
        <div>Dibuat: {d(editItem.created).format("DD MMM YYYY HH:mm")}</div>
        <div>Diperbarui: {d(editItem.updated).format("DD MMM YYYY HH:mm")}</div>
      </div>
    </div>
  {/if}
</Modal>

<div class="px-6 py-4 space-y-3 mx-auto">
  <div class="flex items-center justify-between gap-4">
    <div>
      <h1
        class="text-2xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent"
      >
        Manajemen Template
      </h1>
      <p class="text-sm opacity-60">
        Kelola template dokumen untuk proses penandatanganan
      </p>
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
          ...item,
          properties: JSON.stringify(item.properties),
        }),
      }}
    >
      {#if selections.length}
        <div class="flex items-center gap-2 animate-fade-in">
          <button
            class="btn btn-sm btn-error btn-outline gap-1.5"
            onclick={() => (forms.del = true)}
          >
            <iconify-icon icon="bx:trash" class="text-sm"></iconify-icon>
            Hapus ({selections.length})
          </button>
        </div>
      {/if}
      {#snippet filter(where)}
        <div class="form-control w-full max-w-xs">
          <label class="label py-1">
            <span class="label-text font-bold text-xs opacity-75"
              >Cari Nama</span
            >
          </label>
          <input
            bind:value={where.name}
            class="input input-sm input-bordered"
            placeholder="Masukkan nama template..."
          />
        </div>
      {/snippet}
    </Toolbar>

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
            <th class="min-w-48">Nama</th>
            <th class="min-w-48">Deskripsi</th>
            <th class="w-44">Tipe</th>
            <th class="w-44">Dibuat</th>
            <th class="w-44">Diperbarui</th>
            <th class="w-20"></th>
          </tr>
        </thead>
        <tbody>
          {#if records.loading}
            <tr>
              <td colspan="7" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-2">
                  <span class="loading loading-spinner loading-md text-primary"
                  ></span>
                  <span class="text-sm opacity-55 font-medium"
                    >Memuat data template...</span
                  >
                </div>
              </td>
            </tr>
          {:else if records.error}
            <tr>
              <td colspan="7" class="py-12 text-center">
                <div
                  class="flex flex-col items-center justify-center gap-3 text-error"
                >
                  <iconify-icon icon="bx:error-circle" class="text-3xl"
                  ></iconify-icon>
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
              <td colspan="7" class="py-12 text-center">
                <div
                  class="flex flex-col items-center justify-center gap-2 opacity-40"
                >
                  <iconify-icon icon="bx:file" class="text-3xl"
                  ></iconify-icon>
                  <span class="text-sm font-medium"
                    >Tidak ada data template</span
                  >
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
                <td class="font-medium">{item.name}</td>
                <td class="text-sm opacity-70 truncate max-w-xs">
                  {item.properties?.description || "-"}
                </td>
                <td>
                  <span
                    class="badge badge-sm {item.properties?.type === 'bsre'
                      ? 'badge-primary'
                      : 'badge-secondary'}"
                  >
                    {item.properties?.type === "bsre" ? "TTE" : "Manual"}
                  </span>
                </td>
                <td class="text-xs opacity-60 whitespace-nowrap">
                  {d(item.created).format("HH:mm, DD MMM YYYY")}
                </td>
                <td class="text-xs opacity-60 whitespace-nowrap">
                  {d(item.updated).format("HH:mm, DD MMM YYYY")}
                </td>
                <td>
                  <button
                    class="btn btn-xs btn-ghost btn-square"
                    onclick={() => openEdit(item)}
                  >
                    <iconify-icon icon="bx:info-circle"></iconify-icon>
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
