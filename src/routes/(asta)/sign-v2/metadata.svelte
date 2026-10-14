<script lang="ts">
  import { onMount } from "svelte";
  import { debounce } from "$lib/utils";
  import { checkUser } from "$lib/remotes/sign.remote";
  import Signature from "./signature.svelte";
  import { type } from "arktype";
  import { getData } from "$lib/remotes/api.remote";
  import { Select } from "$lib/components";
  import {
    listProfiles,
    saveProfile,
    deleteProfile,
  } from "$lib/remotes/profile.remote";

  let {
    data,
    children,
    loading = $bindable(false),
    status = $bindable("NOT_REGISTERED"),
    bsre = $bindable(true),
    // footer = $bindable(true),
    form = $bindable({}),
    fields = $bindable({}),
    hasSignature,
    signatures = $bindable([]),
    setSignature,
    openVisual = $bindable(undefined),
    onSign,
    useEmail = $bindable(true),
  } = $props();

  let visual = $state<"image" | "qr" | "box" | "draw">("box");

  /** Visual picker lives in a nested dialog; the preview overlay stays on the
   *  page. A native <dialog> is used (rather than the shared Modal) so Esc only
   *  closes the top-most dialog instead of tearing down the signing modal too. */
  let visualDialog = $state<HTMLDialogElement>();
  const openVisualDialog = () => {
    if (!visualDialog?.open) visualDialog?.showModal();
  };

  // Hand the parent a way to open the visualisation dialog from the toolbar.
  $effect(() => {
    openVisual = openVisualDialog;
    return () => {
      openVisual = undefined;
    };
  });

  /** A saved signing profile ("spesimen"). One email may own many. */
  type Profile = {
    id: string;
    email: string;
    label?: string | null;
    nama?: string | null;
    jabatan?: string | null;
    pangkat?: string | null;
    instansi?: string | null;
    specimen?: string | null;
  };

  let profiles = $state<Profile[]>([]);
  let selectedProfile = $state("");
  let profileDialog = $state<HTMLDialogElement>();
  let profileDraft = $state<Partial<Profile>>({});
  let profileSaving = $state(false);

  /** Swaps the "Simpan Dokumen" checkbox for the owner email input on the same row. */
  let ownerEdit = $state(false);

  const currentProfile = $derived(
    profiles.find((p) => p.id === selectedProfile),
  );

  const profileSummary = (p?: Partial<Profile>) =>
    [p?.nama, p?.jabatan, p?.instansi, p?.pangkat].filter(Boolean).join(" · ");

  const loadProfiles = async (_el?: Event) => {
    if (!form.email || type("string.email")(form.email) instanceof type.errors) {
      profiles = [];
      return;
    }
    try {
      profiles = (await listProfiles({ email: form.email })) as Profile[];
    } catch {
      profiles = [];
    }
  };
  const debounceLoadProfiles = debounce(loadProfiles, 500);

  /** Copy a profile's identity fields onto the form. */
  const applyProfile = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    form.nama = p.nama ?? form.nama;
    form.jabatan = p.jabatan ?? form.jabatan;
    form.pangkat = p.pangkat ?? form.pangkat;
    form.instansi = p.instansi ?? form.instansi;
    form.specimen = p.specimen ?? form.specimen;
  };

  const openProfileModal = (profile?: Profile) => {
    profileDraft = profile
      ? { ...profile }
      : {
          email: form.email,
          nama: form.nama,
          jabatan: form.jabatan,
          pangkat: form.pangkat,
          instansi: form.instansi,
          specimen: form.specimen,
        };
    if (!profileDialog?.open) profileDialog?.showModal();
  };

  const submitProfile = async () => {
    if (!form.email) return;
    profileSaving = true;
    try {
      const saved = (await saveProfile({
        id: profileDraft.id,
        email: form.email,
        label: profileDraft.label ?? undefined,
        nama: profileDraft.nama ?? undefined,
        jabatan: profileDraft.jabatan ?? undefined,
        pangkat: profileDraft.pangkat ?? undefined,
        instansi: profileDraft.instansi ?? undefined,
        specimen: profileDraft.specimen ?? undefined,
      })) as Profile;
      await loadProfiles();
      if (saved?.id) {
        selectedProfile = saved.id;
        applyProfile(saved.id);
      }
      profileDialog?.close();
    } finally {
      profileSaving = false;
    }
  };

  const removeProfile = async () => {
    if (!selectedProfile) return;
    await deleteProfile({ id: selectedProfile });
    selectedProfile = "";
    await loadProfiles();
  };

  /** Persist the specimen used by a freshly added visualisation into the
   *  specimen list — one profile row per specimen, so a signer can keep
   *  several. */
  const saveSpecimen = async (specimen: string) => {
    if (!form.email || type("string.email")(form.email) instanceof type.errors)
      return;
    const existing = profiles.find((p) => (p.specimen ?? "") === specimen);
    if (existing) {
      selectedProfile = existing.id;
      return;
    }
    try {
      const saved = (await saveProfile({
        email: form.email,
        // BSrE returns "-" for unset fields, so skip those when naming.
        label:
          [form.nama, form.jabatan, form.instansi].find(
            (v) => v && v !== "-",
          ) || "Spesimen",
        nama: form.nama ?? undefined,
        jabatan: form.jabatan ?? undefined,
        pangkat: form.pangkat ?? undefined,
        instansi: form.instansi ?? undefined,
        specimen,
      })) as Profile;
      await loadProfiles();
      if (saved?.id) selectedProfile = saved.id;
    } catch {
      // The visualisation is already added; failing to save the specimen
      // must not block signing.
    }
  };

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
  // Lock identity fields until the BSrE account is verified (ISSUE).
  // Manual signing always allows editing.
  const locked = $derived(bsre && status !== "ISSUE");
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
      // A picked profile is the source of truth for the identity fields, so
      // re-apply it after the BSrE lookup lands.
      if (selectedProfile) applyProfile(selectedProfile);
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
    debounceCheckEmail(new Event("init"));
  });

  // Reload the signer's saved profiles whenever the email changes — this also
  // covers emails pre-filled from URL params or localStorage.
  $effect(() => {
    form.email;
    debounceLoadProfiles(new Event("init"));
  });
  $effect(() => {
    hasSignature;
    getUserCity();
  });

  // $inspect(form, form.instansi);
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    onSign?.();
  }}
  class="h-full relative flex flex-col"
>
  <ul
    id="tour-metadata"
    class="menu grow overflow-auto flex-nowrap rounded-xl w-full relative"
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
                    String(value)
                      .toLowerCase()
                      .replace(/@mojokertokota\.go\.id/gi, "") +
                    "@mojokertokota.go.id")
              }
              required
              type="text"
              placeholder="Email Dinas"
              oninput={debounceCheckEmail}
              onfocus={() => (emailFocused = true)}
              onblur={() => (emailFocused = false)}
              onpaste={(e) => {
                const text = e.clipboardData?.getData("text") || "";
                if (/@mojokertokota\.go\.id/i.test(text)) {
                  e.preventDefault();
                  const cleaned = text.replace(/@mojokertokota\.go\.id/gi, "");
                  const input = e.currentTarget as HTMLInputElement;
                  const start = input.selectionStart ?? input.value.length;
                  const end = input.selectionEnd ?? input.value.length;
                  input.value =
                    input.value.slice(0, start) +
                    cleaned +
                    input.value.slice(end);
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }}
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
      <li class="px-2 relative">
        <div class="flex gap-2 items-center bg-transparent p-0">
          {#if ownerEdit}
            <input
              bind:value={form.owner}
              type="text"
              placeholder={form.email || "Email Pemilik Dokumen"}
              class="input input-xs grow text-xs tooltip tooltip-bottom"
              data-tip="Pemilik tidak diverifikasi ke BSrE"
              aria-label="Email Pemilik Dokumen"
            />
          {:else}
            <label
              class="tooltip tooltip-bottom flex gap-2 items-center justify-start grow cursor-pointer text-xs"
              data-tip="Simpan dokumen sebagai {form.email || 'Email Pemilik Dokumen'}"
            >
              <input
                type="checkbox"
                class="checkbox checkbox-xs checkbox-success"
                bind:checked={form.save_document}
              />
              Simpan Dokumen
            </label>
          {/if}
          <button
            type="button"
            class="btn btn-xs btn-square btn-ghost tooltip tooltip-left"
            data-tip={ownerEdit ? "Selesai ubah pemilik" : "Ubah pemilik dokumen"}
            aria-label={ownerEdit
              ? "Selesai ubah pemilik"
              : "Ubah pemilik dokumen"}
            onclick={() => (ownerEdit = !ownerEdit)}
          >
            <iconify-icon
              icon={ownerEdit ? "bx:x" : "bx:edit"}
              class="text-base"
            ></iconify-icon>
          </button>
        </div>
      </li>
      <li class="p-2">
        <div class="card card-sm bg-base-200">
          <div class="card-body p-2 gap-1">
            <div class="flex items-center gap-1">
              <span class="text-xs font-semibold grow">Profil / Spesimen</span>
              <button
                type="button"
                class="btn btn-xs btn-square btn-ghost tooltip"
                data-tip="Simpan profil baru"
                aria-label="Simpan profil baru"
                disabled={locked}
                onclick={() => openProfileModal()}
              >
                <iconify-icon icon="bx:plus" class="text-base"></iconify-icon>
              </button>
              <button
                type="button"
                class="btn btn-xs btn-square btn-ghost tooltip"
                data-tip="Ubah profil terpilih"
                aria-label="Ubah profil terpilih"
                disabled={locked || !currentProfile}
                onclick={() => openProfileModal(currentProfile)}
              >
                <iconify-icon icon="bx:edit" class="text-base"></iconify-icon>
              </button>
              <button
                type="button"
                class="btn btn-xs btn-square btn-ghost tooltip text-error"
                data-tip="Hapus profil terpilih"
                aria-label="Hapus profil terpilih"
                disabled={locked || !currentProfile}
                onclick={removeProfile}
              >
                <iconify-icon icon="bx:trash" class="text-base"></iconify-icon>
              </button>
            </div>
            <select
              class="select select-sm w-full"
              value={selectedProfile}
              disabled={locked || profiles.length === 0}
              onchange={(e) => {
                selectedProfile = e.currentTarget.value;
                applyProfile(selectedProfile);
              }}
            >
              <option value="">
                {profiles.length
                  ? "— Pilih profil —"
                  : "Belum ada profil tersimpan"}
              </option>
              {#each profiles as p (p.id)}
                <option value={p.id}>{p.label || p.nama || p.email}</option>
              {/each}
            </select>
            {#if currentProfile}
              <div class="text-[10px] opacity-70">
                {profileSummary(currentProfile)}
              </div>
              {#if currentProfile.specimen}
                <pre
                  class="text-[10px] leading-tight bg-base-100 rounded p-1 whitespace-pre-wrap m-0">{currentProfile.specimen}</pre>
              {/if}
            {/if}
          </div>
        </div>
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
            type="text"
            placeholder="Nama Lengkap Beserta Gelar"
            disabled={locked}
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
    {#if data.whatsappNotifyDocument}
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
                disabled={locked}
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
    {/if}
    <li class="p-2">
      <label class="floating-label p-0 bg-transparent">
        <span>Jabatan Pegawai</span>
        <input
          bind:value={form.jabatan}
          type="text"
          placeholder="Jabatan Pegawai"
          class="input input-sm"
          disabled={locked}
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
          disabled={locked}
        />
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
          disabled={locked}
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
        <span>Keterangan</span>
        <input
          bind:value={form.note}
          required
          type="text"
          placeholder="Keterangan"
          class="input input-sm"
          disabled={locked}
        />
      </label>
    </li>
    <li class="p-2">
      <label class="floating-label p-0 bg-transparent">
        <span>Lokasi Penandatangan</span>
        <input
          bind:value={form.location}
          required
          type="text"
          placeholder="Lokasi Penandatangan"
          class="input input-sm"
          disabled={locked}
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
          disabled={locked}
        />
      </label>
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
                disabled={locked}
              ></textarea>
            {:else}
              <input
                bind:value={form[key]}
                type="text"
                placeholder={readableKey}
                class="input input-sm"
                disabled={locked}
              />
            {/if}
          </label>
        </li>
      {/if}
    {/each}
  </ul>

  <div id="tour-signature" class="bg-base-200 rounded-lg shadow-sm">
    <div class="flex items-center justify-between px-1 py-1">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <label
        class="btn btn-xs btn-ghost tooltip"
        data-tip="Visualisasi (Opsional)"
        onclick={() => (signaturePanel = true)}
      >
        <input
          type="checkbox"
          class="checkbox checkbox-xs"
          class:checkbox-success={signatures.length > 0}
          checked={signatures.length > 0}
          readonly
        />
        Visualisasi Tanda Tangan
      </label>
      {#if bsre}
        <label
          class="btn btn-xs tooltip btn-ghost"
          data-tip="Hanya untuk dokumen draft / belum di ttd"
        >
          <input
            type="checkbox"
            class="checkbox checkbox-xs"
            class:checkbox-success={form.footer}
            bind:checked={
              () => (hasSignature ? false : form.footer),
              (val) => (form.footer = val)
            }
            disabled={hasSignature}
          />
          Footer BSrE
        </label>
      {:else}
        <label
          class="btn btn-xs btn-ghost tooltip"
          data-tip="Dokumen manual wajib menggunakan footer"
        >
          <input
            type="checkbox"
            class="checkbox checkbox-xs checkbox-success"
            checked={true}
            disabled
          />
          Footer
        </label>
      {/if}
      <button
        type="button"
        aria-label="Toggle Signature Panel"
        class="btn btn-xs btn-square btn-ghost ml-auto"
        onclick={() => (signaturePanel = !signaturePanel)}
      >
        <iconify-icon
          icon={signaturePanel ? "bx:chevron-down" : "bx:chevron-up"}
          class="text-lg"
        ></iconify-icon>
      </button>
    </div>

    {#if signaturePanel}
      <div class="px-2 pb-2 flex flex-col gap-1">
        <button
          type="button"
          class="btn btn-sm btn-outline"
          onclick={openVisualDialog}
        >
          <iconify-icon icon="bx:plus-circle" class="text-lg"></iconify-icon>
          Tambah Visualisasi
        </button>

        {@render children?.()}
      </div>
    {/if}
  </div>
</form>

<dialog class="modal" bind:this={visualDialog}>
  <div class="modal-box w-11/12 max-w-3xl">
    <button
      type="button"
      class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
      aria-label="Tutup"
      onclick={() => visualDialog?.close()}
    >
      ✕
    </button>
    <h3 class="text-lg font-bold">Tambah Visualisasi</h3>
    <Signature
      {form}
      setSignature={(props) => {
        setSignature(props);
        visualDialog?.close();
      }}
      {hasSignature}
      bind:visual
      disabled={locked}
      availableVisual={bsre ? ["image", "qr", "box", "draw"] : ["draw"]}
      onAddSignature={saveSpecimen}
    />
  </div>
  <button
    type="button"
    class="modal-backdrop"
    aria-label="Tutup"
    onclick={() => visualDialog?.close()}
  ></button>
</dialog>

<dialog class="modal" bind:this={profileDialog}>
  <div class="modal-box">
    <button
      type="button"
      class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
      aria-label="Tutup"
      onclick={() => profileDialog?.close()}
    >
      ✕
    </button>
    <h3 class="text-lg font-bold">Profil / Spesimen</h3>
    <ul class="menu w-full gap-1 p-0">
      <li class="p-0">
        <label class="floating-label p-0 bg-transparent">
          <span>Nama Profil</span>
          <input
            bind:value={profileDraft.label}
            type="text"
            placeholder="Nama Profil"
            class="input input-sm"
          />
          <div class="text-[10px] text-gray-400">
            Contoh: Kepala Dinas / Sekretaris
          </div>
        </label>
      </li>
      <li class="p-0">
        <label class="floating-label p-0 bg-transparent">
          <span>Nama Lengkap Beserta Gelar</span>
          <input
            bind:value={profileDraft.nama}
            type="text"
            placeholder="Nama Lengkap Beserta Gelar"
            class="input input-sm"
          />
        </label>
      </li>
      <li class="p-0">
        <label class="floating-label p-0 bg-transparent">
          <span>Jabatan</span>
          <input
            bind:value={profileDraft.jabatan}
            type="text"
            placeholder="Jabatan"
            class="input input-sm"
          />
        </label>
      </li>
      <li class="p-0">
        <label class="floating-label p-0 bg-transparent">
          <span>Pangkat / Golongan</span>
          <input
            bind:value={profileDraft.pangkat}
            type="text"
            placeholder="Pangkat / Golongan"
            class="input input-sm"
          />
        </label>
      </li>
      <li class="p-0">
        <label class="floating-label p-0 bg-transparent">
          <span>Perangkat Daerah</span>
          <input
            bind:value={profileDraft.instansi}
            type="text"
            placeholder="Perangkat Daerah"
            class="input input-sm"
          />
        </label>
      </li>
      <li class="p-0">
        <div class="flex items-center gap-1">
          <span class="text-xs font-semibold grow">Spesimen Tanda Tangan</span>
          <button
            type="button"
            class="btn btn-xs btn-ghost"
            onclick={() => {
              profileDialog?.close();
              openVisualDialog();
            }}
          >
            <iconify-icon icon="bx:edit" class="text-base"></iconify-icon>
            Ubah di Visualisasi
          </button>
        </div>
        <pre
          class="text-[10px] leading-tight bg-base-200 rounded p-1 whitespace-pre-wrap m-0">{profileDraft.specimen ||
            form.specimen ||
            "jabatan\ninstansi\n\nnama"}</pre>
        <div class="text-[10px] text-gray-400">
          Spesimen mengikuti visualisasi tanda tangan.
        </div>
      </li>
    </ul>
    <div class="modal-action">
      <button
        type="button"
        class="btn btn-sm btn-primary"
        disabled={profileSaving || !form.email}
        onclick={submitProfile}
      >
        {#if profileSaving}<span class="loading loading-xs"></span>{/if}
        Simpan Profil
      </button>
    </div>
  </div>
  <button
    type="button"
    class="modal-backdrop"
    aria-label="Tutup"
    onclick={() => profileDialog?.close()}
  ></button>
</dialog>
