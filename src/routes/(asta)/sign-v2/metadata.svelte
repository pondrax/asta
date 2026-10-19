<script lang="ts">
  import { debounce } from "$lib/utils";
  import Signature from "./signature.svelte";
  import SignaturePreview from "./signature-preview.svelte";
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
    status = $bindable("NOT_REGISTERED"),
    bsre = $bindable(true),
    // footer = $bindable(true),
    form = $bindable({}),
    fields = $bindable({}),
    hasSignature,
    hasDocuments = true,
    signatures = $bindable([]),
    setSignature,
    openVisual = $bindable(undefined),
    onSign,
    onAddVisual,
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
  /** Email the current `profiles` list belongs to (guards against stale loads). */
  let loadedEmail = $state("");
  /** Email already auto-seeded from BSrE data, so we only seed once. */
  let autoProfileEmail = $state("");
  let profileDialog = $state<HTMLDialogElement>();
  let profileDraft = $state<Partial<Profile>>({});
  let profileSaving = $state(false);

  const currentProfile = $derived(
    profiles.find((p) => p.id === selectedProfile),
  );

  const profileLabel = (p?: Partial<Profile>) =>
    p?.jabatan || p?.label || p?.nama || "Profil";

  const loadProfiles = async (_el?: Event) => {
    if (!form.email || type("string.email")(form.email) instanceof type.errors) {
      profiles = [];
      selectedProfile = "";
      loadedEmail = "";
      return;
    }
    const email = form.email;
    try {
      profiles = (await listProfiles({ email })) as Profile[];
      loadedEmail = email;
    } catch {
      profiles = [];
    }
    if (!profiles.some((p) => p.id === selectedProfile)) {
      const last = lastUsedProfile();
      selectedProfile =
        profiles.find((p) => p.id === last)?.id ?? profiles[0]?.id ?? "";
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

  const rememberProfile = (id: string) => {
    if (typeof localStorage === "undefined" || !id || !form.email) return;
    try {
      localStorage.setItem(`signer-profile:${form.email}`, id);
    } catch {}
  };

  const lastUsedProfile = () => {
    if (typeof localStorage === "undefined" || !form.email) return "";
    try {
      return localStorage.getItem(`signer-profile:${form.email}`) ?? "";
    } catch {
      return "";
    }
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

  /** Save the current signer identity into the selected profile, or create a
   *  new one when nothing is selected. */
  const saveCurrentProfile = async () => {
    if (!emailOk) return;
    const hasIdentity = [
      form.nama,
      form.jabatan,
      form.instansi,
      form.pangkat,
    ].some((v) => v && v !== "-");
    if (!selectedProfile && !hasIdentity) return;
    profileSaving = true;
    try {
      const saved = (await saveProfile({
        email: form.email,
        ...(selectedProfile ? { id: selectedProfile } : {}),
        ...(selectedProfile
          ? {}
          : {
              label:
                [form.nama, form.jabatan, form.instansi].find(
                  (v) => v && v !== "-",
                ) || "Profil",
            }),
        ...(form.nama ? { nama: form.nama } : {}),
        ...(form.jabatan ? { jabatan: form.jabatan } : {}),
        ...(form.pangkat ? { pangkat: form.pangkat } : {}),
        ...(form.instansi ? { instansi: form.instansi } : {}),
        ...(form.specimen ? { specimen: form.specimen } : {}),
      })) as Profile;
      await loadProfiles();
      if (saved?.id) {
        selectedProfile = saved.id;
        applyProfile(saved.id);
        rememberProfile(saved.id);
      }
    } catch (err) {
      console.error("Failed to save profile", err);
    } finally {
      profileSaving = false;
    }
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
  // Lock identity fields until the BSrE account is verified (ISSUE), and while
  // there is no document loaded. Manual signing always allows editing.
  const locked = $derived(!hasDocuments || (bsre && status !== "ISSUE"));
  const emailOk = $derived(
    !!form.email && !(type("string.email")(form.email) instanceof type.errors),
  );
  let signaturePanel = $state(true);

  /** Spesimen editor — opened from the visualisasi section header, edits the
   *  shared form.specimen used by both the QR and the signature box. */
  let specimenDialog = $state<HTMLDialogElement>();
  // Whether the "Simpan Dokumen" owner-email field is expanded.
  let ownerOpen = $state(false);
  const specimenKeys = ["jabatan", "instansi", "nama"];
  const defaultSpecimen = "jabatan\ninstansi\n\nnama";

  const resolveSpecimen = (tpl: string) =>
    tpl
      .split("\n")
      .map((line) => {
        const key = line.trim();
        return key in form ? (form[key] ?? "") : line;
      })
      .join("\n")
      .replace(/^\n+|\n+$/g, "");

  const reverseSpecimen = (value: string) =>
    value
      .split("\n")
      .map((line) =>
        line.trim() === ""
          ? line
          : (specimenKeys.find((k) => form[k] === line) ?? line),
      )
      .join("\n");

  const savedSpecimens = $derived(profiles.filter((p) => p.specimen));

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

  // Reload the signer's saved profiles whenever the email changes — this also
  // covers emails pre-filled from URL params or localStorage.
  $effect(() => {
    form.email;
    debounceLoadProfiles(new Event("init"));
  });

  // With no saved profile yet, seed one from the verified BSrE identity data so
  // the picker reflects the account by default. Later visits then select the
  // last-used profile via `loadProfiles`.
  $effect(() => {
    const email = form.email;
    const nama = form.nama;
    const jabatan = form.jabatan;
    const pangkat = form.pangkat;
    const instansi = form.instansi;
    if (!email || type("string.email")(email) instanceof type.errors) return;
    if (loadedEmail !== email) return;
    if (profiles.length > 0) return;
    if (autoProfileEmail === email) return;
    if (![nama, jabatan, pangkat, instansi].some((v) => v && v !== "-"))
      return;
    autoProfileEmail = email;
    saveCurrentProfile();
  });
  $effect(() => {
    hasSignature;
    getUserCity();
  });

  // Default the document owner to the logged-in account, otherwise the signer.
  $effect(() => {
    if (!form.owner) form.owner = data.user?.email || form.email || "";
  });

  const profileSet = $derived(
    !!(form.nama && form.nama !== "-") ||
      !!(form.instansi && form.instansi !== "-"),
  );
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
    <li class="menu-title">Informasi Dokumen</li>
    <li class="p-2">
      <label class="floating-label p-0 bg-transparent">
        <span>Keterangan Dokumen</span>
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
    <li class="px-2">
      <div class="flex items-center gap-1.5 py-0">
        <input
          type="checkbox"
          class="checkbox checkbox-xs"
          title="Simpan Dokumen"
          aria-label="Simpan Dokumen"
          bind:checked={form.save_document}
          disabled={locked}
        />
        <span class="text-xs">Simpan Dokumen</span>
        {#if form.save_document && !locked}
          <button
            type="button"
            class="ml-auto flex cursor-pointer items-center"
            title="Tampilkan email pemilik"
            aria-pressed={ownerOpen}
            onclick={() => (ownerOpen = !ownerOpen)}
          >
            <iconify-icon
              icon={ownerOpen ? "bx:chevron-down" : "bx:chevron-right"}
              class="text-base leading-none"
            ></iconify-icon>
          </button>
          <details
            class="dropdown dropdown-end"
            class:pointer-events-none={locked}
          >
          <summary
            class="flex cursor-pointer items-center"
            title="Ambil email"
          >
            <iconify-icon
              icon="bx:user-circle"
              class="text-base leading-none"
            ></iconify-icon>
          </summary>
          <ul
            class="dropdown-content menu menu-xs bg-base-100 rounded-box z-50 w-80 p-1 shadow-xl"
          >
            {#if data.user}
              <li>
                <button
                  type="button"
                  onclick={(e) => {
                    form.owner = data.user?.email ?? "";
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  <iconify-icon
                    icon="bx:user-circle"
                    class="shrink-0 text-base"
                  ></iconify-icon>
                  <span class="truncate">Akun login ({data.user.email})</span>
                </button>
              </li>
            {/if}
            <li>
              <button
                type="button"
                onclick={(e) => {
                  form.owner = form.email;
                  e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                <iconify-icon icon="bx:pen" class="shrink-0 text-base"></iconify-icon>
                <span class="truncate">Sama dengan penandatangan</span>
              </button>
            </li>
          </ul>
          </details>
        {/if}
      </div>
      {#if form.save_document && ownerOpen}
        <div class="input input-sm mt-1 w-full">
          <input
            type="email"
            bind:value={form.owner}
            placeholder="Email pemilik dokumen"
            aria-label="Email Pemilik Dokumen"
            disabled={locked}
          />
        </div>
      {/if}
    </li>
    <li class="px-2">
      <div class="flex items-center gap-1.5 py-0">
        <input
          type="checkbox"
          class="checkbox checkbox-xs"
          bind:checked={form.secret}
          disabled={locked}
          title="Dokumen Rahasia"
          aria-label="Dokumen Rahasia"
        />
        <span class="text-xs">Dokumen Rahasia</span>
      </div>
      {#if form.secret}
        <div class="input input-sm w-full">
          <input
            type="password"
            bind:value={form.password}
            placeholder="Kata sandi dokumen"
            aria-label="Kata sandi dokumen"
            disabled={locked}
          />
        </div>
      {/if}
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

    <li class="menu-title">
      <div class="relative flex flex-col">
          <span>Profil Penandatangan</span>
        <span class="text-[10px] font-normal text-base-content/50">
          {currentProfile ? profileLabel(currentProfile) : "Belum ada profil dipilih"}
        </span>
        <details
          class="dropdown dropdown-end absolute right-0 top-0"
        onfocusout={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            e.currentTarget.removeAttribute("open");
        }}
      >
        <summary
          class="btn btn-xs btn-ghost btn-square"
          title="Profil Penandatangan"
          aria-label="Profil Penandatangan"
        >
          <iconify-icon icon="bx:edit" class="text-base"></iconify-icon>
        </summary>
          <ul
            class="dropdown-content menu menu-xs bg-base-100 text-base-content rounded-box z-50 w-56 p-1 shadow-xl"
          >
            <li>
              <button
                type="button"
                class:active={!selectedProfile}
                onclick={(e) => {
                  selectedProfile = "";
                  e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                <iconify-icon
                  icon="bx:plus"
                  class="shrink-0 text-base"
                ></iconify-icon>
                <span class="truncate">Buat profil baru</span>
              </button>
            </li>
            <li></li>
            {#each profiles as p (p.id)}
              <li>
                <button
                  type="button"
                  class:active={p.id === selectedProfile}
                  onclick={(e) => {
                    selectedProfile = p.id;
                    applyProfile(p.id);
                    rememberProfile(p.id);
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  <span class="truncate">{profileLabel(p)}</span>
                  {#if p.id === selectedProfile}
                    <iconify-icon
                      icon="bx:check"
                      class="ml-auto shrink-0 text-base text-success"
                    ></iconify-icon>
                  {/if}
                </button>
              </li>
            {/each}
            <li></li>
            <li>
              <button
                type="button"
                onclick={async (e) => {
                  await saveCurrentProfile();
                  e.currentTarget.closest("details")?.removeAttribute("open");
                }}
                disabled={!emailOk || profileSaving}
              >
                {#if profileSaving}
                  <span class="loading loading-xs"></span>
                  Menyimpan…
                {:else}
                  <iconify-icon icon="bx:save" class="text-base"></iconify-icon>
                  {selectedProfile ? "Simpan perubahan" : "Simpan profil baru"}
                {/if}
              </button>
            </li>
            {#if selectedProfile}
              <li>
                <button
                  type="button"
                  onclick={async (e) => {
                    await removeProfile();
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  <iconify-icon icon="bx:trash" class="text-base"></iconify-icon>
                  Hapus profil
                </button>
              </li>
            {/if}
          </ul>
      </details>
      </div>
    </li>
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
          disabled={locked}
        />
        <div class="text-[10px] text-gray-400">Contoh: Kepala Dinas / Guru</div>
      </label>
    </li>
    <li class="p-2">
      <div class="floating-label p-0 bg-transparent">
        <span>Nomor Telepon (WhatsApp)</span>
        <div class="flex items-center gap-1.5">
          <div class="input input-sm grow flex items-center">
            <span class="mr-1 text-gray-500">+62</span>
            <input
              type="text"
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
              placeholder="Nomor Telepon"
              class="w-full bg-transparent outline-none"
              disabled={locked}
            />
          </div>
          {#if data.whatsappNotifyDocument}
            <label
              class="flex shrink-0 cursor-pointer items-center gap-1"
              title="Kirim File"
            >
              <input
                type="checkbox"
                class="checkbox checkbox-xs"
                bind:checked={form.send_file}
                disabled={locked}
              />
              <span class="text-xs">Kirim File</span>
            </label>
          {/if}
        </div>
      </div>
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
        />
      </div>
    </li>
    <li class="menu-title">
      <div class="relative flex flex-col">
        <span>Visualisasi Tanda Tangan</span>
        <span class="text-[10px] font-normal text-base-content/50">
          Klik atau seret untuk menambahkan visualisasi ke dokumen.
        </span>
        <button
          type="button"
          class="btn btn-xs btn-ghost btn-square absolute right-0 top-0"
          title="Edit spesimen tanda tangan"
          aria-label="Edit spesimen tanda tangan"
          onclick={() => specimenDialog?.showModal()}
        >
          <iconify-icon icon="bx:edit" class="text-base"></iconify-icon>
        </button>
      </div>
    </li>
    <li>
      <div class="flex flex-col gap-2 bg-transparent">
        {#if profileSet}
          <SignaturePreview
            {form}
            visual="qr"
            onAdd={onAddVisual}
            disabled={!hasDocuments}
          />
          <SignaturePreview
            {form}
            visual="box"
            onAdd={onAddVisual}
            disabled={!hasDocuments}
          />
        {:else}
          <div
            class="alert alert-warning text-xs"
          >
            <iconify-icon icon="bx:error-circle" class="text-base"></iconify-icon>
            <span>Visualisasi tidak tersedia, lengkapi profil.</span>
          </div>
        {/if}

        <div class="flex items-center justify-between pt-1">
          <span class="text-xs font-medium">Spesimen Tersimpan</span>
          <button
            type="button"
            class="btn btn-xs"
            disabled={!emailOk || profileSaving}
            onclick={saveCurrentProfile}
          >
            {#if profileSaving}
              <span class="loading loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:save" class="text-base"></iconify-icon>
            {/if}
            Simpan
          </button>
        </div>
        {#if profiles.some((p) => p.specimen)}
          <div class="flex flex-col gap-1">
            {#each profiles.filter((p) => p.specimen) as p (p.id)}
              <button
                type="button"
                class="btn btn-xs justify-start font-normal {p.id ===
                selectedProfile
                  ? 'btn-active'
                  : ''}"
                onclick={() => {
                  selectedProfile = p.id;
                  applyProfile(p.id);
                  rememberProfile(p.id);
                }}
              >
                <iconify-icon
                  icon="bx:check"
                  class="shrink-0 text-base {p.id === selectedProfile
                    ? 'text-success'
                    : 'opacity-0'}"
                ></iconify-icon>
                <span class="truncate">{profileLabel(p)}</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="text-[10px] text-gray-400">Belum ada spesimen tersimpan.</div>
        {/if}
      </div>
    </li>
  </ul>

  <dialog class="modal" bind:this={specimenDialog}>
    <div class="modal-box">
      <button
        type="button"
        class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
        aria-label="Tutup"
        onclick={() => specimenDialog?.close()}
      >
        ✕
      </button>
      <h3 class="text-lg font-bold">Spesimen Tanda Tangan</h3>
      <p class="py-2 text-xs opacity-60">
        Satu baris = satu baris teks. Tulis nama field (jabatan, instansi, nama)
        untuk diisi otomatis. Baris kosong jadi jarak.
      </p>
      <textarea
        bind:value={
          () => resolveSpecimen(form.specimen ?? defaultSpecimen),
          (value) => (form.specimen = reverseSpecimen(value))
        }
        placeholder="Spesimen tanda tangan"
        class="textarea textarea-sm h-32 w-full"
      ></textarea>
      <div class="modal-action">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          onclick={() => specimenDialog?.close()}
        >
          Selesai
        </button>
      </div>
    </div>
    <button
      type="button"
      class="modal-backdrop"
      aria-label="Tutup"
      onclick={() => specimenDialog?.close()}
    ></button>
  </dialog>

</form>


