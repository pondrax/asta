<script lang="ts">
  import { debounce } from "$lib/utils";
  import { checkUser } from "./sign.remote";
  import ranks from "./ranks";
  import organizations from "./organizations";
  import { onMount } from "svelte";

  let {
    loading = $bindable(false),
    status = $bindable("NOT_REGISTERED"),
    bsre = $bindable(true),
    footer = $bindable(true),
    forms = $bindable({}),
    visual = $bindable({}),
  } = $props();

  const checkEmail = async (el: Event) => {
    loading = true;
    const value = (el.target as HTMLInputElement).value;
    if (!value) return;
    const result = await checkUser(value + "@mojokertokota.go.id");
    status = result.status;
    loading = false;
  };
  const debounceCheckEmail = debounce(checkEmail, 500);

  async function getUserCity() {
    if (!navigator.geolocation) {
      console.error("Geolocation not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        );
        const data = await res.json();

        forms.location = data.address.city
          ? `Kota ${data.address.city}`
          : data.address.county
            ? `Kabupaten ${data.address.county}`
            : "Kota Mojokerto";
      },
      (err) => {
        forms.location = "Kota Mojokerto";
      },
    );
  }
  onMount(() => {
    getUserCity();
  });
</script>

<ul class="menu h-full overflow-auto flex-nowrap bg-base-100 rounded-xl w-full">
  <li class="menu-title bg-inherit sticky -top-2 z-1">
    <div class="flex gap-5 justify-between bg-transparent">
      <div>Meta Data</div>
      <div class="join">
        <input
          class="join-item btn btn-xs btn-outline"
          type="radio"
          name="options"
          bind:group={bsre}
          value={true}
          aria-label="Tanda Tangan Elektronik"
        />
        <input
          class="join-item btn btn-xs btn-outline"
          type="radio"
          name="options"
          bind:group={bsre}
          value={false}
          aria-label="Manual"
        />
      </div>
    </div>
  </li>
  {#if bsre}
    <li class="p-2">
      <label class="floating-label p-0 bg-transparent">
        <span>Email Dinas Penandatangan ({status})</span>
        <div class="input input-sm">
          <input
            bind:value={forms.email}
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
        <div class="text-[10px] text-gray-400">
          Contoh: mail@mojokertokota.go.id
        </div>
      </label>
    </li>
  {:else}
    <li class="p-2">
      <label class="floating-label p-0 bg-transparent">
        <span>Email Penandatangan</span>
        <div class="input input-sm">
          <input type="text" placeholder="Email Penandatangan" />
        </div>
        <div class="text-[10px] text-gray-400">Contoh: mail@example.com</div>
      </label>
    </li>
  {/if}
  <li class="p-2">
    <label class="floating-label p-0 bg-transparent">
      <span>Nama Lengkap Beserta Gelar</span>
      <input
        type="text"
        placeholder="Nama Lengkap Beserta Gelar"
        class="input input-sm"
      />
      <div class="text-[10px] text-gray-400">
        Contoh: Budi Pekerti Akhlak, S.H
      </div>
    </label>
  </li>
  <li class="p-2">
    <label class="floating-label p-0 bg-transparent">
      <span>Jabatan Pegawai</span>
      <input type="text" placeholder="Jabatan Pegawai" class="input input-sm" />
      <div class="text-[10px] text-gray-400">Contoh: Kepala Dinas / Guru</div>
    </label>
  </li>
  <li class="p-2">
    <label class="floating-label p-0 bg-transparent">
      <span>Nama Perangkat Daerah</span>
      <select class="select select-sm">
        <option disabled selected>Pilih Opsi</option>
        {#each organizations as opt}
          <option>{opt.name}</option>
        {/each}
      </select>
      <div class="text-[10px] text-gray-400">
        Pilih Eksternal untuk intansi diluar pemerintah kota mojokerto
      </div>
    </label>
  </li>
  <li class="p-2">
    <label class="floating-label p-0 bg-transparent">
      <span>Pangkat / Golongan</span>
      <select class="select select-sm">
        <option disabled selected>Pilih Opsi</option>
        {#each ranks as opt}
          <option>{opt.rank} {opt.grade}</option>
        {/each}
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
        bind:value={forms.location}
        type="text"
        placeholder="Lokasi Penandatangan"
        class="input input-sm"
      />
    </label>
  </li>
  <li class="px-2 py-1">
    {#if bsre}
      <label
        class="label p-0 tooltip"
        data-tip="Hanya untuk dokumen draft / belum di ttd"
      >
        <input type="checkbox" class="toggle" bind:checked={footer} />
        Visualisasi Footer BSrE - BSSN
      </label>
    {:else}
      <label
        class="label p-0 tooltip"
        data-tip="Dokumen manual wajib menggunakan footer"
      >
        <input type="checkbox" class="toggle" checked={footer} disabled />
        Visualisasi Footer Dokumen
      </label>
    {/if}
  </li>
</ul>
