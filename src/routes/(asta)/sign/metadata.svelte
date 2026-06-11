<script lang="ts">
  import { onMount } from "svelte";
  import { debounce } from "$lib/utils";
  import { checkUser } from "$lib/remotes/sign.remote";
  import Signature from "./signature.svelte";
  import { type } from "arktype";
  import { getData } from "$lib/remotes/api.remote";
  import { Select } from "$lib/components";

  let {
    data,
    children,
    loading = $bindable(false),
    status = $bindable("NOT_REGISTERED"),
    bsre = $bindable(true),
    // footer = $bindable(true),
    form = $bindable({}),
    fields = $bindable({}),
    visual = $bindable({}),
    hasSignature,
    signatures = $bindable([]),
    setSignature,
    signButton,
    useEmail = $bindable(true),
  } = $props();

  const predefinedForms = [
    "email",
    "nik",
    "nama",
    "jabatan",
    "instansi",
    "pangkat",
    "note",
    "location",
    "tanggal",
    "nomor_telepon",
  ];
  let signaturePanel = $state(true);
  let emailFocused = $state(false);
  const checkEmail = async (el: Event) => {
    if (!form.email && !form.nik) return;
    const cancel = useEmail
      ? form.email.startsWith("@") || form.email.length === 0
      : form.nik.length == 0;
    if (cancel) return;
    // console.log(form, cancel);
    loading = true;

    try {
      const result = await checkUser(
        useEmail ? { email: form.email } : { nik: form.nik },
      );
      status = result.status;
      form = {
        ...form,
        nama: result.user?.name,
        pangkat: result.user?.rank,
        instansi: result.user?.organizations,
        jabatan: result.user?.position,
        nomor_telepon: result.user?.phone || "",
      };
      // console.log(result);
      localStorage.setItem("email", form.email);
    } catch {
      status = "[Server Esign Error] Check User Failed";
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
    //@ts-ignore - debounceCheckEmail is called on mount before its definition in the parent
    debounceCheckEmail();
  });
  $effect(() => {
    hasSignature;
    getUserCity();
  });

  // $inspect(form, form.instansi);
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
    id="tour-metadata"
    class="menu h-full overflow-auto flex-nowrap rounded-xl w-full relative"
  >
    <li class="menu-title bg-base-100 sticky -top-2 z-5">
      <div class="flex gap-5 justify-between items-center">
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
            onclick={() => {
              form.footer = true;
            }}
            aria-label="Manual"
          />
        </div>
      </div>
    </li>
    {#if bsre}
      <li
        class="p-2 tooltip bg-base-100 sticky top-10 z-25"
        class:tooltip-open={status === "NOT_REGISTERED"}
      >
        {#if form.email?.split("@").at(0) !== ""}
          <div class="tooltip-content pointer-events-auto!">
            {#if status === "ISSUE"}
              <div class="">
                Status Akun : {status}
              </div>
            {:else if status === "NOT_REGISTERED"}
              <div class="">
                {status}
              </div>
              <div>
                <a
                  href={`/services/register?identity=${form.email}`}
                  class="btn btn-xs btn-error"
                  target="_blank"
                >
                  Daftar Sekarang
                </a>
              </div>
            {:else}
              <div class="">
                {status}
              </div>
            {/if}
          </div>
        {/if}

        <label class="floating-label p-0 bg-transparent">
          <span class="text-nowrap">Email Dinas Penandatangan ({status})</span>
          <div class="input input-sm">
            <input
              bind:value={
                () => form.email?.split("@")?.at(0),
                (value) =>
                  (form.email =
                    String(value).toLowerCase() + "@mojokertokota.go.id")
              }
              required
              type="text"
              placeholder="Email Dinas"
              oninput={debounceCheckEmail}
              onfocus={() => (emailFocused = true)}
              onblur={() => (emailFocused = false)}
            />
            <span class="label"
              >{emailFocused ? "***go.id" : "@mojokertokota.go.id"}</span
            >
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
      <li class="p-2 bg-base-100 sticky top-10 z-25">
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
        <span>Nomor Telepon (Whatsapp)</span>
        <div class="flex gap-2 items-center w-full mt-1">
          <div class="input input-sm grow flex items-center">
            <span class="text-gray-500 mr-1">+62</span>
            <input
              bind:value={
                () => String(form.nomor_telepon ?? "").replace(/^62/, ""),
                (value) =>
                  (form.nomor_telepon =
                    "62" +
                    String(value)
                      .replace(/[^0-9]/g, "")
                      .replace(/^0+/, "")
                      .replace(/^62/, ""))
              }
              required
              type="text"
              placeholder="Nomor Telepon WA"
              class="w-full bg-transparent outline-none"
            />
          </div>
          <label
            class="btn btn-sm tooltip tooltip-left flex gap-2 items-center"
            data-tip="Kirim File PDF ke Whatsapp"
          >
            <input
              type="checkbox"
              class="checkbox checkbox-xs"
              bind:checked={form.send_file}
            />
            Kirim File
          </label>
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
      <div class="p-0 bg-transparent flex flex-col gap-0">
        <Select
          bind:value={form.instansi}
          label="Perangkat Daerah"
          table="organizations"
          labelKey="name"
          valueKey="short_name"
          inputClass="input-sm"
          limit={100}
          orderBy={{ id: "asc" }}
        />
        <div class="text-[10px] text-gray-400">
          Pilih Eksternal untuk intansi diluar pemerintah kota mojokerto
        </div>
      </div>
    </li>

    <li class="p-2" class:hidden={form.instansi == "Eksternal"}>
      <div class="p-0 bg-transparent flex">
        <Select
          bind:value={form.pangkat}
          inputClass="input-sm"
          label="Pangkat / Golongan"
          table="ranks"
          labelKey={(prop) =>
            `${prop.grade} ${prop.rank != "-" ? "(" + prop.rank + ")" : ""}`}
          valueKey={(prop) =>
            `${prop.grade} ${prop.rank != "-" ? "(" + prop.rank + ")" : ""}`}
          limit={100}
          orderBy={{ id: "asc" }}
        >
          <!-- {#snippet children(prop)}
            <div class="flex justify-between w-full">
              <span>{prop.grade}</span>
              <span class="opacity-50 text-xs">{prop.rank}</span>
            </div>
          {/snippet}

          {#snippet selected(prop)}
            <div class="font-bold text-primary italic">
              {prop.grade} <span class="text-xs opacity-50">[{prop.rank}]</span>
            </div>
          {/snippet} -->
        </Select>
      </div>
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
    <li class="p-2">
      <label class="floating-label p-0 bg-transparent">
        <span>Tanggal Penandatangan</span>
        <input
          bind:value={form.tanggal}
          type="text"
          placeholder="Tanggal Penandatangan"
          class="input input-sm"
        />
      </label>
      <!-- {JSON.stringify(Object.keys(fields))}
      {JSON.stringify(Object.keys(form))} -->
    </li>

    {#each Object.keys(fields) as key}
      {#if !predefinedForms.includes(key)}
        {@const readableKey = key.replace(/[_\W]/g, " ")}
        <li class="p-2">
          <label class="floating-label p-0 bg-transparent">
            <span class="capitalize">{readableKey}</span>
            <!-- {JSON.stringify(fields[key])} -->
            {#if fields[key].multiline}
              <textarea
                bind:value={form[key]}
                placeholder={readableKey}
                class="textarea textarea-sm w-full"
              ></textarea>
            {:else}
              <input
                bind:value={form[key]}
                type="text"
                placeholder={readableKey}
                class="input input-sm"
              />
            {/if}
          </label>
        </li>
      {/if}
    {/each}
  </ul>

  <div id="tour-signature" class="absolute bottom-0 z-20 left-0 right-0 px-3">
    <div class="bg-base-200 rounded-lg shadow-sm">
      <button
        type="button"
        class="btn btn-ghost btn-sm w-full flex items-center gap-2 rounded-lg"
        onclick={() => (signaturePanel = !signaturePanel)}
      >
        <iconify-icon
          icon={signaturePanel ? "bx:chevron-down" : "bx:chevron-right"}
          class="text-lg"
        ></iconify-icon>
        <span class="text-xs font-medium">Visualisasi Tanda Tangan</span>
        <span class="badge badge-xs badge-primary">{signatures.length}</span>
        <span class="ml-auto text-[10px] opacity-60">
          {signaturePanel ? "sembunyikan" : "tampilkan"}
        </span>
      </button>

      {#if signaturePanel}
        <div class="px-2 pb-2">
          <div class="py-1 border-b border-base-300 mb-1">
            {#if bsre}
              <label
                class="label p-0 tooltip cursor-pointer"
                data-tip="Hanya untuk dokumen draft / belum di ttd"
              >
                <input
                  type="checkbox"
                  class="toggle toggle-sm"
                  bind:checked={
                    () => (hasSignature ? false : form.footer),
                    (val) => (form.footer = val)
                  }
                  disabled={hasSignature}
                />
                <span class="text-xs">Visualisasi Footer BSrE - BSSN</span>
              </label>
            {:else}
              <label
                class="label p-0 tooltip cursor-pointer"
                data-tip="Dokumen manual wajib menggunakan footer"
              >
                <input
                  type="checkbox"
                  class="toggle toggle-sm"
                  checked={true}
                  disabled
                />
                <span class="text-xs">Visualisasi Footer Dokumen</span>
              </label>
            {/if}
          </div>

          <Signature
            {form}
            {setSignature}
            {hasSignature}
            availableVisual={bsre ? ["image", "qr", "box", "draw"] : ["draw"]}
          />

          {@render children?.()}
        </div>
      {/if}
    </div>
  </div>
</form>
