<script lang="ts">
  import { getData, type GetParams } from "$lib/remotes/api.remote";
  import { d } from "$lib/utils";

  let {
    onSelect,
  }: {
    onSelect?: (item: any) => void;
  } = $props();

  const records = getData({
    table: "templates",
    limit: 100,
    offset: 0,
    where: { status: true },
  } satisfies GetParams<"templates">);
  const items = $derived(records.current?.data ?? []);
</script>

<div class="">
  <div class="py-3">
    Berikut adalah template dokumen tersedia untuk digunakan dalam proses
    penandatanganan
  </div>
  {#if records.loading}
    <div class="flex justify-center py-8">
      <span class="loading loading-spinner loading-md text-primary"></span>
    </div>
  {:else if records.error}
    <div class="alert alert-error">
      <iconify-icon icon="bx:error-circle"></iconify-icon>
      <span>Gagal memuat template: {records.error.message}</span>
      <button class="btn btn-sm" onclick={() => records.refresh()}>
        Coba Lagi
      </button>
    </div>
  {:else if !items.length}
    <div class="text-center py-8 opacity-40">
      <iconify-icon icon="bx:file" class="text-3xl"></iconify-icon>
      <p class="text-sm mt-2">Tidak ada template tersedia</p>
    </div>
  {:else}
    <table class="table table-sm table-hover">
      <thead>
        <tr>
          <!-- <th>ID</th> -->
          <th>Nama</th>
          <th>Deskripsi</th>
          <th>Tipe Tanda Tangan</th>
          <th>Tanggal Dibuat</th>
        </tr>
      </thead>
      <tbody>
        {#each items as item (item.id)}
          <tr>
            <td>{item.name}</td>
            <td>{item.description}</td>
            <td
              >{item.sign_type === "bsre"
                ? "Tanda Tangan Elektronik"
                : "Tanda Tangan Manual"}</td
            >
            <!-- <td>{item.file}</td> -->
            <!-- <td>{JSON.stringify(item.properties)}</td> -->
            <td>{d(item.created).format("YYYY-MM-DD HH:mm:ss")}</td>
            <td>
              <button
                class="btn btn-sm btn-primary tooltip tooltip-left"
                data-tip="Gunakan template ini"
                onclick={() => {
                  if (onSelect) {
                    onSelect(item);
                  } else {
                    location.href = `/sign?template=${item.id}`;
                  }
                }}
              >
                Pilih
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
