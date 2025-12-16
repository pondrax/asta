<script lang="ts">
  import { onMount } from "svelte";
  import { debounce } from "$lib/utils";
  import { checkUser } from "$lib/remotes/sign.remote";
  import ranks from "./ranks";
  import organizations from "./organizations";
  import Signature from "./signature.svelte";
  import { type } from "arktype";

  let {
    children,
    loading = $bindable(false),
    status = $bindable("NOT_REGISTERED"),
    bsre = $bindable(true),
    // footer = $bindable(true),
    form = $bindable({}),
    fields = $bindable({}),
    visual = $bindable({}),
    hasSignature,
    setSignature,
    signButton,
  } = $props();

  let signaturePanel = $state(true);
  const checkEmail = async (el: Event) => {
    loading = true;
    try {
      const result = await checkUser(form.email);
      status = result.status;
      form = {
        ...form,
        nama: result.user?.name,
        pangkat: result.user?.rank,
        instansi: result.user?.organizations,
        jabatan: result.user?.position,
      };
      console.log(result);
    } catch {
      status = "NOT_REGISTERED";
    }
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

        form.location = data.address.city
          ? `Kota ${data.address.city}`
          : data.address.county
            ? `Kabupaten ${data.address.county}`
            : "Kota Mojokerto";
      },
      (err) => {
        form.location = "Kota Mojokerto";
      },
    );
  }

  onMount(() => {
    // getUserCity();
    // @ts-expect-error
    debounceCheckEmail();
  });
  $effect(() => {
    hasSignature;
    getUserCity();
  });
</script>

<form
  onsubmit={async (e) => {
    e.preventDefault();
    signButton?.click();
    console.log(e);
  }}
  class="h-full relative"
>
  <ul
    class="menu h-full overflow-auto flex-nowrap bg-base-100 rounded-xl w-full relative"
  >
    <li class="menu-title bg-inherit sticky -top-2 z-5">
      <div class="flex gap-5 justify-between bg-transparent items-center">
        <div>Meta Data</div>
        <div class="join">
          <input
            class="join-item btn btn-sm btn-outline"
            type="radio"
            name="options"
            bind:group={bsre}
            value={true}
            aria-label="Tanda Tangan Elektronik"
          />
          <input
            class="join-item btn btn-sm btn-outline"
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
              bind:value={
                () => form.email?.split("@")?.at(0),
                (value) => (form.email = value + "@mojokertokota.go.id")
              }
              required
              type="text"
              placeholder="Email Dinas"
              oninput={debounceCheckEmail}
            />
            <span class="label">@mojokertokota.go.id</span>
            {#if loading}
              <span class="loading"></span>
            {:else if status == "ISSUE"}
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
            <input
              bind:value={form.email}
              required
              type="text"
              placeholder="Email Penandatangan"
            />
            {#if !(type("string.email")(form.email) instanceof type.errors)}
              <iconify-icon icon="bx:check" class="text-success"></iconify-icon>
            {:else}
              <iconify-icon icon="bx:x" class="text-error"></iconify-icon>
            {/if}
          </div>
          <div class="text-[10px] text-gray-400">Contoh: mail@example.com</div>
        </label>
      </li>
    {/if}
    <li class="p-2">
      <label class="floating-label p-0 bg-transparent">
        <span>Nama Lengkap Beserta Gelar</span>

        <div class="input input-sm">
          <input
            bind:value={form.nama}
            required
            type="text"
            placeholder="Nama Lengkap Beserta Gelar"
          />
          {#if form.nama}
            <iconify-icon icon="bx:check" class="text-success"></iconify-icon>
          {:else}
            <iconify-icon icon="bx:x" class="text-error"></iconify-icon>
          {/if}
        </div>
        <div class="text-[10px] text-gray-400">
          Contoh: Budi Pekerti Akhlak, S.H
        </div>
      </label>
    </li>
    <li class="p-2">
      <label class="floating-label p-0 bg-transparent">
        <span>Jabatan Pegawai</span>
        <input
          bind:value={form.jabatan}
          type="text"
          placeholder="Jabatan Pegawai"
          class="input input-sm"
        />
        <div class="text-[10px] text-gray-400">Contoh: Kepala Dinas / Guru</div>
      </label>
    </li>
    <li class="p-2">
      <label class="floating-label p-0 bg-transparent">
        <span>Nama Perangkat Daerah</span>
        <select bind:value={form.instansi} class="select select-sm">
          <option disabled selected>Pilih Opsi</option>
          {#each organizations as opt}
            <option value={opt.short_name}>{opt.name}</option>
          {/each}
        </select>
        <div class="text-[10px] text-gray-400">
          Pilih Eksternal untuk intansi diluar pemerintah kota mojokerto
        </div>
      </label>
    </li>

    <li class="p-2" class:hidden={form.instansi == "Eksternal"}>
      <label class="floating-label p-0 bg-transparent">
        <span>Pangkat / Golongan</span>
        <select bind:value={form.pangkat} class="select select-sm">
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
        <input
          bind:value={form.note}
          type="text"
          placeholder="Catatan Dokumen"
          class="input input-sm"
        />
      </label>
    </li>
    <li class="p-2">
      <label class="floating-label p-0 bg-transparent">
        <span>Lokasi Penandatangan</span>
        <input
          bind:value={form.location}
          type="text"
          placeholder="Lokasi Penandatangan"
          class="input input-sm"
        />
      </label>
      <!-- {JSON.stringify(Object.keys(fields))}
      {JSON.stringify(Object.keys(form))} -->
    </li>
    {#each Object.keys(fields) as key}
      {#if !Object.keys(form).includes(key)}
        <li class="p-2">
          <label class="floating-label p-0 bg-transparent">
            <span>{key}</span>
            <input
              bind:value={form[key]}
              type="text"
              placeholder={key}
              class="input input-sm"
            />
          </label>
        </li>
      {/if}
    {/each}
    <li class="px-2 py-1 pb-100">
      {#if bsre}
        <label
          class="label p-0 tooltip"
          data-tip="Hanya untuk dokumen draft / belum di ttd"
        >
          <input
            type="checkbox"
            class="toggle"
            bind:checked={
              () => (hasSignature ? false : form.footer),
              (val) => (form.footer = val)
            }
            disabled={hasSignature}
          />
          Visualisasi Footer BSrE - BSSN
        </label>
      {:else}
        <label
          class="label p-0 tooltip"
          data-tip="Dokumen manual wajib menggunakan footer"
        >
          <input
            type="checkbox"
            class="toggle"
            checked={form.footer}
            disabled
          />
          Visualisasi Footer Dokumen
        </label>
      {/if}
    </li>
  </ul>

  {#if signaturePanel}
    <div class="absolute bottom-0 z-5 p-3">
      <Signature
        {form}
        {setSignature}
        {hasSignature}
        availableVisual={bsre ? ["image", "qr", "box", "draw"] : ["draw"]}
      />

      {@render children?.()}
    </div>
  {/if}
</form>
