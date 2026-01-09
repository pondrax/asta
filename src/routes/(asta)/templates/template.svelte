<script lang="ts">
  import { getTemplates } from "$lib/remotes/sign.remote";
  import { d } from "$lib/utils";

  let {
    onSelect,
  }: {
    onSelect?: (item: any) => void;
  } = $props();
  let records = await getTemplates({});
</script>

<div class="">
  <div class="py-3">
    Berikut adalah template dokumen tersedia untuk digunakan dalam proses
    penandatanganan
  </div>
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
      {#each records as item}
        <tr>
          <td>{item.name}</td>
          <td>{item.properties?.description}</td>
          <td
            >{item.properties?.type === "bsre"
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
</div>
