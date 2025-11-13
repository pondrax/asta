<script lang="ts">
  import { debounce } from "$lib/utils";
  import { checkUser } from "./sign.remote";
  let { status = $bindable("NOT_REGISTERED"), bsre = $bindable(true) } =
    $props();

  const checkEmail = async (el: Event) => {
    const value = (el.target as HTMLInputElement).value;
    if (!value) return;
    const result = await checkUser(value + "@mojokertokota.go.id");
    status = result.status;
  };
  const debounceCheckEmail = debounce(checkEmail, 500);
</script>

<ul class="menu h-full overflow-auto flex-nowrap bg-base-100 rounded-xl w-full">
  <li class="menu-title sticky -top-2 bg-inherit z-1">
    Visualisasi Tanda Tangan
  </li>
  <!-- <li class="p-2">
    <label class="floating-label p-0 bg-transparent">
      <span>Email Dinas ({status})</span>
      <div class="input input-sm">
        <input
          type="text"
          placeholder="Email Dinas"
          onblur={debounceCheckEmail}
          oninput={debounceCheckEmail}
        />
        <span class="label">@mojokertokota.go.id</span>
        {#if status == "ISSUE"}
          <iconify-icon icon="bx:check" class="text-success"></iconify-icon>
        {:else}
          <iconify-icon icon="bx:x" class="text-error"></iconify-icon>
        {/if}
      </div>
      <div class="text-xs text-gray-400 -mb-2">
        Contoh: mail@mojokertokota.go.id
      </div>
    </label>
  </li>
  <li class="p-2">
    <label class="floating-label p-0 bg-transparent">
      <span>Nama Lengkap Beserta Gelar</span>
      <input
        type="text"
        placeholder="Nama Lengkap Beserta Gelar"
        class="input input-sm"
      />
    </label>
  </li>
  <li class="p-2">
    <label class="floating-label p-0 bg-transparent">
      <span>Jabatan Pegawai</span>
      <input type="text" placeholder="Jabatan Pegawai" class="input input-sm" />
    </label>
  </li>
  <li class="p-2">
    <label class="floating-label p-0 bg-transparent">
      <span>Nama Perangkat Daerah</span>
      <select class="select select-sm">
        <option disabled selected>Pilih Opsi</option>
        <option>Crimson</option>
        <option>Amber</option>
        <option>Velvet</option>
      </select>
    </label>
  </li>
  <li class="p-2">
    <label class="floating-label p-0 bg-transparent">
      <span>Pangkat / Golongan</span>
      <select class="select select-sm">
        <option disabled selected>Pilih Opsi</option>
        <option>Crimson</option>
        <option>Amber</option>
        <option>Velvet</option>
      </select>
    </label>
  </li>
  <li class="p-2">
    <label class="floating-label p-0 bg-transparent">
      <span>Catatan Dokumen</span>
      <input type="text" placeholder="Catatan Dokumen" class="input input-sm" />
    </label>
  </li>
  <li class="p-2">
    <label class="floating-label p-0 bg-transparent">
      <span>Lokasi Penandatangan</span>
      <input
        type="text"
        placeholder="Lokasi Penandatangan"
        class="input input-sm"
      />
    </label>
  </li> -->
  <li class="px-2 py-1">
    <label class="label p-0">
      <input type="checkbox" class="toggle" />
      Visualisasi Footer
    </label>
  </li>
</ul>
