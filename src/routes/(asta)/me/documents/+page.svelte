<script lang="ts">
  import { delData, getData, type GetParams } from "$lib/remotes/api.remote";
  import { Modal, Toolbar, Preview } from "$lib/components";
  import { d } from "$lib/utils";

  const { data } = $props();
  const expand = {
    with: {
      user: {},
    },
  };
  let query: GetParams<"documents"> = $state({
    table: "documents",
    limit: 20,
    offset: 0,
    orderBy: {
      updated: "desc",
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

  let administrative = $state(false);
  $effect(() => {
    if (administrative) {
      query.where!.to = { arrayContains: [data.user?.role.name] };
      delete query.where!.owner;
    } else {
      delete query.where!.to;
      query.where!.owner = data.user?.email;
    }
  });

  const baseWhere = $derived.by(() => {
    const w = { ...query.where };
    delete w.status;
    return w;
  });
  const draftCountQuery = $derived(
    getData({
      table: "documents",
      limit: 1,
      offset: 0,
      where: { ...baseWhere, status: "draft" },
    }),
  );
  const signedCountQuery = $derived(
    getData({
      table: "documents",
      limit: 1,
      offset: 0,
      where: { ...baseWhere, status: "signed" },
    }),
  );
  const draftCount = $derived(draftCountQuery.current?.count ?? 0);
  const signedCount = $derived(signedCountQuery.current?.count ?? 0);

  const adminCountQuery = $derived(
    getData({
      table: "documents",
      limit: 1,
      offset: 0,
      where: {
        to: { arrayContains: [data.user?.role.name] },
      },
    }),
  );
  const adminCount = $derived(adminCountQuery.current?.count ?? 0);

  // States for Preview Modal
  let previewFile = $state<File | null>(null);
  let previewLoading = $state(false);
  let previewFileName = $state("");
  let previewDownloadUrl = $state("");

  async function openPreview(url: string) {
    forms.preview = true;
    previewLoading = true;
    previewFile = null;
    previewDownloadUrl = "";

    try {
      const cleanName =
        url
          .split("/")
          .pop()
          ?.replace(/\.[a-z0-9]{4}\.enc$/, "")
          .replace(/\.enc$/, "") || "dokumen.pdf";
      previewFileName = cleanName;

      const response = await fetch(url);
      if (!response.ok) throw new Error("Gagal mengambil file");
      const blob = await response.blob();

      // Create a clean URL for downloading (without .enc)
      const blobUrl = URL.createObjectURL(blob);
      previewDownloadUrl = blobUrl;

      previewFile = new File([blob], cleanName, { type: "application/pdf" });
    } catch (e) {
      console.error(e);
    } finally {
      previewLoading = false;
    }
  }

  // Cleanup blob URL when modal closes
  $effect(() => {
    if (!forms.preview && previewDownloadUrl) {
      URL.revokeObjectURL(previewDownloadUrl);
      previewDownloadUrl = "";
      previewFile = null;
    }
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
    class="space-y-4"
  >
    <input type="hidden" name="table" value="documents" />
    <div class="text-sm opacity-80 mb-2">
      Apakah Anda yakin ingin menghapus data dokumen berikut? Tindakan ini tidak
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
            >{item?.title || "Dokumen Tanpa Judul"}</span
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
        Hapus {selections.length} Dokumen
      </button>
    </div>
  </form>
</Modal>

<Modal bind:data={forms.preview} title="Pratinjau Dokumen" size="xl">
  {#if previewLoading}
    <div class="flex flex-col items-center justify-center gap-2 h-96">
      <span class="loading loading-spinner loading-md text-primary"></span>
      <span class="text-sm opacity-55 font-medium"
        >Memuat pratinjau dokumen...</span
      >
    </div>
  {:else if previewFile}
    <div class="h-[70vh] overflow-hidden flex flex-col">
      <div class="flex justify-between items-center mb-3">
        <span class="text-xs opacity-60 font-mono truncate mr-4"
          >{previewFileName}</span
        >
        <a
          href={previewDownloadUrl}
          download={previewFileName}
          class="btn btn-sm btn-secondary gap-1.5 shrink-0 shadow-sm"
        >
          <iconify-icon icon="bx:download" class="text-sm"></iconify-icon>
          Unduh PDF
        </a>
      </div>
      <div
        class="flex-1 overflow-hidden bg-base-200/50 rounded-xl border border-base-300"
      >
        <Preview file={previewFile} />
      </div>
    </div>
  {/if}
</Modal>

<div class="px-6 py-4 space-y-3 max-w-7xl mx-auto">
  <div class="flex items-center justify-between gap-4">
    <div>
      <h1
        class="text-2xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent"
      >
        Daftar Dokumen
      </h1>
      <p class="text-sm opacity-60">
        Kelola dan tandatangani dokumen elektronik Anda
      </p>
    </div>
    <a
      href="/sign"
      class="btn btn-sm btn-primary gap-1.5 shadow-sm hover:scale-102 active:scale-98 transition-all"
    >
      <iconify-icon icon="bx:plus" class="text-base"></iconify-icon>
      <span>Unggah Dokumen</span>
    </a>
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
      {#if selections.length}
        <div class="flex items-center gap-2 animate-fade-in">
          <form action="/sign" method="POST">
            <input type="hidden" name="id" value={selections} />
            <button
              type="submit"
              class="btn btn-sm btn-primary gap-1.5 shadow-sm"
            >
              <iconify-icon icon="bx:pen" class="text-sm"></iconify-icon>
              Tandatangani ({selections.length})
            </button>
          </form>
          <button
            class="btn btn-sm btn-error btn-outline gap-1.5"
            onclick={() => (forms.del = true)}
          >
            <iconify-icon icon="bx:trash" class="text-sm"></iconify-icon>
            Hapus
          </button>
        </div>
      {/if}
      {#snippet extended()}
        <div class="flex gap-2">
          <div class="filter flex items-center">
            <label
              class="btn btn-sm btn-soft flex items-center gap-2 cursor-pointer"
            >
              <input
                bind:checked={administrative}
                type="checkbox"
                class="checkbox checkbox-xs checkbox-primary"
              />
              <span class="text-xs font-semibold"
                >Administratif ({adminCount})</span
              >
            </label>
          </div>
          <div class="filter">
            <input
              bind:group={query.where!.status}
              value="draft"
              class="btn btn-sm"
              type="radio"
              name="status"
              aria-label="Draft ({draftCount})"
            />
            <input
              bind:group={query.where!.status}
              value="signed"
              class="btn btn-sm"
              type="radio"
              name="status"
              aria-label="Ditandatangani ({signedCount})"
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
        </div>
      {/snippet}
      {#snippet filter(where)}
        <div class="form-control w-full max-w-xs">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="label py-1">
            <span class="label-text font-bold text-xs opacity-75"
              >Cari Judul Dokumen</span
            >
          </label>
          <input
            bind:value={where.title}
            class="input input-sm input-bordered"
            placeholder="Masukkan judul..."
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
            <th class="min-w-[280px]">Nama Dokumen</th>
            <th class="w-72">File Terlampir</th>
            <th class="w-32 text-center">Metode</th>
            <th class="w-32 text-center">Status</th>
            <th class="w-48">Signer</th>
            <th class="w-44">Diperbarui</th>
            <th class="w-64">Metadata</th>
            <th class="w-24 text-center bg-base-200/50 z-20">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {#if records.loading}
            <tr>
              <td colspan="9" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-2">
                  <span class="loading loading-spinner loading-md text-primary"
                  ></span>
                  <span class="text-sm opacity-55 font-medium"
                    >Memuat data dokumen...</span
                  >
                </div>
              </td>
            </tr>
          {:else if records.error}
            <tr>
              <td colspan="9" class="py-12 text-center">
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
              <td colspan="9" class="py-16 text-center">
                <div
                  class="flex flex-col items-center justify-center gap-3 opacity-40"
                >
                  <iconify-icon icon="bx:folder-open" class="text-4xl"
                  ></iconify-icon>
                  <div class="text-sm font-medium">
                    Tidak ada data dokumen ditemukan
                  </div>
                </div>
              </td>
            </tr>
          {:else}
            {#each items.data as item (item.id)}
              <tr
                class="hover:bg-base-200/30 transition-all border-b border-base-200/40"
              >
                <td class="text-center">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm checkbox-primary"
                    bind:group={selections}
                    value={item.id}
                  />
                </td>
                <td>
                  <div class="flex flex-col gap-0.5">
                    <span
                      class="font-bold text-sm text-base-content/90 line-clamp-1"
                      >{item.title}</span
                    >
                    <span class="text-[10px] font-mono opacity-40 select-all"
                      >{item.id}</span
                    >
                  </div>
                </td>
                <td>
                  <div class="flex flex-col gap-1 max-w-xs">
                    {#each item.files || [] as file}
                      {@const cleanName =
                        file
                          ?.split("/")
                          ?.pop()
                          ?.replace(/\.[a-z0-9]{4}\.enc$/, "")
                          .replace(/\.enc$/, "") || "unduh.pdf"}
                      <div class="join w-full">
                        <button
                          type="button"
                          onclick={() => openPreview(file)}
                          class="btn btn-xs btn-outline hover:btn-primary justify-start gap-1.5 truncate border-base-300 font-medium join-item flex-1 text-left"
                        >
                          <iconify-icon icon="bx:file" class="text-sm shrink-0"
                          ></iconify-icon>
                          <span class="truncate">{cleanName}</span>
                        </button>
                        <a
                          href={file}
                          download={cleanName}
                          class="btn btn-xs btn-outline hover:btn-secondary border-base-300 join-item px-2 flex items-center justify-center"
                          title="Unduh PDF (Clean)"
                        >
                          <iconify-icon icon="bx:download" class="text-sm"
                          ></iconify-icon>
                        </a>
                      </div>
                    {/each}
                  </div>
                </td>
                <td class="text-center">
                  {#if item.esign}
                    <span
                      class="badge badge-sm font-semibold border-0 bg-primary/10 text-primary uppercase text-[10px]"
                    >
                      esign
                    </span>
                  {:else}
                    <span
                      class="badge badge-sm font-semibold border-0 bg-secondary/10 text-secondary uppercase text-[10px]"
                    >
                      manual
                    </span>
                  {/if}
                </td>
                <td class="text-center">
                  <span
                    class="badge badge-sm font-bold border-0 text-[10px] capitalize {item.status ===
                    'draft'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-success/10 text-success'}"
                  >
                    {item.status}
                  </span>
                </td>
                <td class="text-sm font-medium text-base-content/70">
                  {item.signer?.split("@")[0] || "-"}
                </td>
                <td class="text-xs whitespace-nowrap opacity-60 font-medium">
                  {d(item.updated).format("HH:mm, DD MMM YYYY")}
                </td>
                <td>
                  {#if item.metadata && Object.keys(item.metadata).length > 0}
                    <div class="flex flex-wrap gap-1 max-w-xs">
                      {#each Object.entries(item.metadata) as [key, val]}
                        <span
                          class="badge badge-xs bg-base-200/80 border-0 text-[9px] font-mono text-base-content/60"
                        >
                          {key}: {typeof val === "object"
                            ? JSON.stringify(val)
                            : val}
                        </span>
                      {/each}
                    </div>
                  {:else}
                    <span class="text-xs opacity-30 italic">-</span>
                  {/if}
                </td>
                <td class="text-center">
                  <div class="flex justify-center gap-1.5">
                    <form action="/sign" method="POST" target="_blank">
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        type="submit"
                        class="btn btn-sm btn-circle btn-ghost text-primary hover:bg-primary/10 tooltip tooltip-left"
                        aria-label="Tanda Tangan"
                        data-tip="Tanda Tangan"
                      >
                        <iconify-icon icon="bx:pen" class="text-base"
                        ></iconify-icon>
                      </button>
                    </form>
                    <a
                      href="/verify?id={item.id}"
                      target="_blank"
                      class="btn btn-sm btn-circle btn-ghost text-accent hover:bg-accent/10 tooltip tooltip-left"
                      aria-label="Verifikasi"
                      data-tip="Verifikasi Dokumen"
                    >
                      <iconify-icon icon="bx:search" class="text-base"
                      ></iconify-icon>
                    </a>
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>
