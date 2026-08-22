<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import {
    lookupTicket,
    createTicket,
    checkIdentity,
  } from "$lib/remotes/helpdesk.remote";
  import { SERVICE_TYPE_LABELS, DETERMINATION_LABELS } from "$lib/app/helpdesk";
  import type { BsreDetermination } from "$lib/app/helpdesk";
  import type {
    HelpdeskService,
    HelpdeskServiceType,
  } from "$lib/server/db/schema";
  import Select from "$lib/components/select.svelte";
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";

  // ---------------------------------------------------------------------------
  // Service catalog cards
  // ---------------------------------------------------------------------------
  type Card = "email" | "certificate" | "track";

  let active = $state<Card | null>(
    page.url.searchParams.get("service") === "email" ||
      page.url.searchParams.get("service") === "certificate"
      ? (page.url.searchParams.get("service") as HelpdeskService)
      : page.url.searchParams.get("track")
        ? "track"
        : null,
  );

  function select(card: Card) {
    if (active === card && card !== "track") return;
    resetWizard();
    active = card;
  }

  // ---------------------------------------------------------------------------
  // Ticket lookup
  // ---------------------------------------------------------------------------
  let lookupQ = $state("");
  let loading = $state(false);
  let errorMsg = $state("");

  async function findTicket(e: SubmitEvent) {
    e.preventDefault();
    if (loading || !lookupQ.trim()) return;
    errorMsg = "";
    loading = true;
    try {
      const res = await lookupTicket({ q: lookupQ.trim() });
      if (res.success) {
        await goto(`/helpdesk/ticket/${res.id}`);
      } else {
        errorMsg = res.message;
      }
    } catch (err: any) {
      errorMsg = err?.body?.message || err?.message || "Terjadi kesalahan.";
    } finally {
      loading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Application wizard
  // ---------------------------------------------------------------------------
  const EMAIL_TYPES: HelpdeskServiceType[] = [
    "email_new",
    "email_password_reset",
  ];

  let certStep = $state(0); // certificate wizard: 0 = BSrE check, 1 = form
  let serviceType = $state<HelpdeskServiceType | "">("");

  let identity = $state("");
  let checking = $state(false);
  let checkError = $state("");
  let bsre = $state<Awaited<ReturnType<typeof checkIdentity>> | null>(null);

  let item = $state({
    organization_id: undefined as string | undefined,
    requesterName: "",
    requesterPhone: "",
    requesterEmail: "",
    subject: "",
    description: "",
    emailAccess: "yes" as "yes" | "no",
  });
  let documentId = $state<string | undefined>(undefined);
  let submitting = $state(false);
  let wizardError = $state("");

  onMount(() => {
    const saved = localStorage.getItem("helpdesk_form_state");
    if (saved) {
      try {
        const state = JSON.parse(saved);
        active = state.active;
        certStep = state.certStep;
        serviceType = state.serviceType;
        identity = state.identity;
        item = state.item;
      } catch (e) {
        console.error(e);
      }
      localStorage.removeItem("helpdesk_form_state");
    }

    const docId = page.url.searchParams.get("documentId");
    if (docId) {
      documentId = docId;
    }
  });

  function goToSign() {
    localStorage.setItem(
      "helpdesk_form_state",
      JSON.stringify({
        active,
        certStep,
        serviceType,
        identity,
        item,
      }),
    );
    const params = new URLSearchParams();
    params.set("template", "pengajuan-email");
    params.set("redirect", "/helpdesk");
    if (item.requesterName) params.set("nama", item.requesterName);
    if (item.requesterPhone) params.set("phone", item.requesterPhone);
    if (item.requesterEmail) params.set("email", item.requesterEmail);

    const cleanId = identity.replace(/\D/g, "");
    if (cleanId) {
      params.set("nik", cleanId);
    }

    goto(`/sign?${params.toString()}`);
  }

  const determination = $derived<BsreDetermination | null>(
    (bsre?.determination as BsreDetermination | null) ?? null,
  );

  const canSubmit = $derived(
    Boolean(
      active &&
        serviceType &&
        item.requesterName.trim() &&
        item.requesterPhone.trim() &&
        item.subject.trim() &&
        item.description.trim(),
    ) &&
      (active !== "certificate" || certStep === 1) &&
      (active === "email"
        ? Boolean(documentId)
        : item.emailAccess !== "no" || documentId),
  );

  function resetWizard() {
    certStep = 0;
    serviceType = "";
    identity = "";
    checking = false;
    checkError = "";
    bsre = null;
    item.organization_id = undefined;
    item.requesterName = "";
    item.requesterPhone = "";
    item.requesterEmail = "";
    item.subject = "";
    item.description = "";
    item.emailAccess = "yes";
    documentId = undefined;
    submitting = false;
    wizardError = "";
    errorMsg = "";
  }

  async function runIdentityCheck() {
    if (checking) return;
    checkError = "";
    const id = identity.replace(/\D/g, "");
    if (id.length !== 16 && id.length !== 18) {
      checkError = "Masukkan NIK (16 digit) atau NIP (18 digit).";
      return;
    }
    checking = true;
    try {
      const res = await checkIdentity({ identity: id });
      bsre = res;
      if (res.suggestedServiceType) {
        serviceType = res.suggestedServiceType as HelpdeskServiceType;
        if (!item.subject) {
          item.subject =
            SERVICE_TYPE_LABELS[
              res.suggestedServiceType as HelpdeskServiceType
            ] + (res.nama ? ` — ${res.nama}` : "");
        }
      }
      if (res.nama && !item.requesterName) item.requesterName = res.nama;
      if (res.emailAddress && !item.requesterEmail)
        item.requesterEmail = res.emailAddress;
    } catch (err: any) {
      bsre = null;
      checkError =
        err?.body?.message || err?.message || "Gagal memeriksa data BSrE.";
    } finally {
      checking = false;
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    wizardError = "";
    submitting = true;
    try {
      const desc =
        active === "certificate" && item.emailAccess === "no"
          ? `${item.description.trim()}\n\n[Otomatis] Pemohon menyatakan Email Dinas tidak dapat diakses — mohon siapkan tiket email prasyarat.`
          : item.description.trim();

      const res = await createTicket({
        service: active as HelpdeskService,
        serviceType: serviceType as HelpdeskServiceType,
        subject: item.subject.trim(),
        description: desc,
        requesterName: item.requesterName.trim(),
        requesterPhone: item.requesterPhone.trim(),
        requesterNip:
          identity.replace(/\D/g, "").length === 18
            ? identity.replace(/\D/g, "")
            : undefined,
        requesterNik:
          identity.replace(/\D/g, "").length === 16
            ? identity.replace(/\D/g, "")
            : undefined,
        requesterEmail: item.requesterEmail.trim() || undefined,
        organizationId: item.organization_id || undefined,
        documentId: documentId || undefined,
        parentId: undefined,
      });
      await goto(`/helpdesk/ticket/${res.id}`);
    } catch (err: any) {
      wizardError =
        err?.body?.message || err?.message || "Gagal membuat tiket.";
    } finally {
      submitting = false;
    }
  }

  function fmtCert(v?: string | null) {
    if (!v) return "-";
    const dt = new Date(v);
    return Number.isNaN(dt.getTime())
      ? v
      : dt.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  }

  const CARDS: {
    id: Card;
    icon: string;
    title: string;
    desc: string[];
    accent: string;
  }[] = [
    {
      id: "email",
      icon: "bx:envelope",
      title: "Email Pegawai",
      desc: ["Pembuatan email pegawai baru", "Reset password email"],
      accent: "text-primary",
    },
    {
      id: "certificate",
      icon: "bx:id-card",
      title: "Sertifikat Elektronik",
      desc: [
        "Registrasi & perpanjangan sertifikat BSrE",
        "Pencabutan & reset passphrase",
      ],
      accent: "text-accent",
    },
    {
      id: "track",
      icon: "bx:search-alt-2",
      title: "Lacak Tiket",
      desc: ["Cek status tiket Anda", "Masukkan nomor tiket Anda"],
      accent: "text-secondary",
    },
  ];
</script>

<div
  class="max-w-7xl mx-auto px-5 py-10 min-h-[calc(100vh-4rem)] flex flex-col w-full"
>
  <div class="text-center mb-10 shrink-0">
    <h1 class="text-3xl font-black">Helpdesk Layanan Digital</h1>
    <p class="opacity-60 mt-2 max-w-7xl mx-auto">
      Ajukan permohonan layanan email pegawai dan sertifikat elektronik (BSrE),
      atau lacak tiket yang sudah Anda buat.
    </p>
  </div>

  <div
    class="flex-1 flex flex-col w-full transition-all duration-500 ease-in-out"
    style="padding-top: {active ? '0px' : '20px'};"
  >
    <!-- SERVICE CARDS -->
    <div class="grid sm:grid-cols-3 gap-4 mb-8">
      {#each CARDS as c (c.id)}
        <button
          type="button"
          onclick={() => select(c.id)}
          class="card bg-base-100 border text-left transition-all hover:-translate-y-0.5 {active ===
          c.id
            ? `${c.id === 'email' ? 'border-primary' : c.id === 'certificate' ? 'border-accent' : 'border-secondary'} shadow-md`
            : 'border-base-300 hover:border-base-400'}"
        >
          <div class="card-body p-5">
            <div class="text-4xl {c.accent}">
              <iconify-icon icon={c.icon}></iconify-icon>
            </div>
            <h2 class="card-title text-base">{c.title}</h2>
            <ul class="text-xs opacity-70 space-y-1">
              {#each c.desc as d (d)}
                <li>• {d}</li>
              {/each}
            </ul>
          </div>
        </button>
      {/each}
    </div>

    <!-- TRACK TICKET -->
    {#if active === "track"}
      <div
        transition:slide={{ duration: 300 }}
        class="card bg-base-100 border border-base-300 shadow-sm w-full max-w-7xl mx-auto"
      >
        <div class="card-body">
          <div class="flex items-start justify-between gap-2">
            <h2 class="card-title text-lg">
              <iconify-icon icon="bx:search-alt-2"></iconify-icon>
              Lacak Tiket
            </h2>
            <button
              type="button"
              class="btn btn-circle btn-ghost btn-xs"
              onclick={() => (active = null)}
              aria-label="Tutup formulir"
            >
              <iconify-icon icon="bx:x" class="text-lg"></iconify-icon>
            </button>
          </div>
          <p class="text-sm opacity-60">
            Masukkan nomor tiket Anda (contoh: CMK8X7).
          </p>
          <form onsubmit={findTicket} class="mt-2 flex gap-2">
            <label class="floating-label flex-1">
              <span>Nomor Tiket</span>
              <input
                type="text"
                bind:value={lookupQ}
                placeholder="CMK8X7"
                class="input input-bordered w-full uppercase"
                required
              />
            </label>
            <button
              type="submit"
              class="btn btn-primary shrink-0"
              disabled={loading}
            >
              {#if loading}
                <span class="loading loading-spinner loading-sm"></span>
              {:else}
                <iconify-icon icon="bx:search"></iconify-icon>
              {/if}
              Cari
            </button>
          </form>
          {#if errorMsg}
            <div class="alert alert-error text-sm py-2 mt-2">
              <iconify-icon icon="bx:error-circle"></iconify-icon>
              {errorMsg}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- APPLICATION FORM -->
    {#if active === "email" || active === "certificate"}
      <div
        transition:slide={{ duration: 300 }}
        class="card bg-base-100 border border-base-300 shadow-sm w-full max-w-7xl mx-auto"
      >
        <div class="card-body p-6">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h2 class="card-title text-lg">
                <iconify-icon
                  icon={active === "email" ? "bx:envelope" : "bx:id-card"}
                  class={active === "email" ? "text-primary" : "text-accent"}
                ></iconify-icon>
                {active === "email"
                  ? "Pengajuan Email Pegawai"
                  : "Pengajuan Sertifikat Elektronik"}
              </h2>
              <p class="text-xs opacity-60 mt-0.5">
                {active === "certificate"
                  ? "Data BSrE diperiksa otomatis untuk menentukan jenis layanan."
                  : "Isi formulir untuk pengajuan layanan email pegawai."}
              </p>
            </div>
            <button
              type="button"
              class="btn btn-circle btn-ghost btn-xs"
              onclick={() => (active = null)}
              aria-label="Tutup formulir"
            >
              <iconify-icon icon="bx:x" class="text-lg"></iconify-icon>
            </button>
          </div>

          <form onsubmit={submit} class="mt-3 space-y-4">
            <!-- CERTIFICATE: identity / BSrE check -->
            {#if active === "certificate"}
              <div class="space-y-3">
                <label class="floating-label">
                  <span class="">NIK / NIP</span>
                  <input
                    type="text"
                    bind:value={identity}
                    inputmode="numeric"
                    maxlength={18}
                    placeholder="16 digit NIK atau 18 digit NIP"
                    disabled={certStep > 0}
                    class="input input-bordered w-full"
                  />
                </label>

                {#if checkError}
                  <div class="alert alert-error text-sm py-2">
                    <iconify-icon icon="bx:error-circle"></iconify-icon>
                    {checkError}
                  </div>
                {/if}

                {#if certStep === 0}
                  <button
                    type="button"
                    class="btn btn-accent w-full"
                    onclick={runIdentityCheck}
                    disabled={checking || !identity.trim()}
                  >
                    {#if checking}
                      <span class="loading loading-spinner loading-sm"></span>
                      Memeriksa...
                    {:else}
                      <iconify-icon icon="bx:shield-quarter"></iconify-icon>
                      Periksa Data BSrE
                    {/if}
                  </button>

                  {#if bsre}
                    {#if !bsre.found}
                      <div class="alert alert-info text-sm py-2.5">
                        <iconify-icon icon="bx:info-circle"></iconify-icon>
                        <span>
                          Data belum terdaftar di BSrE — pengajuan Anda akan
                          diproses sebagai
                          <strong>registrasi sertifikat baru</strong>.
                        </span>
                      </div>
                    {:else}
                      <div
                        class="border border-base-300 rounded-xl p-3 space-y-2 text-sm"
                      >
                        <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                          <div>
                            <p class="opacity-50 text-xs">Nama BSrE</p>
                            <p class="font-medium">{bsre.nama}</p>
                          </div>
                          <div>
                            <p class="opacity-50 text-xs">Email</p>
                            <p class="font-medium truncate">
                              {bsre.emailAddress ?? "-"}
                            </p>
                          </div>
                          <div>
                            <p class="opacity-50 text-xs">Status Akun</p>
                            <p class="font-medium">
                              {bsre.status ?? "-"} ·
                              {bsre.aktif ? "Aktif" : "Nonaktif"}
                            </p>
                          </div>
                          <div>
                            <p class="opacity-50 text-xs">Masa Berlaku</p>
                            <p class="font-medium">
                              {fmtCert(bsre.certStart)} s/d
                              {fmtCert(bsre.certEnd)}
                            </p>
                          </div>
                        </div>
                        {#if determination}
                          <div class="alert alert-success text-sm py-2">
                            <iconify-icon icon="bx:check-double"></iconify-icon>
                            <span>
                              Jenis layanan ditentukan:
                              <strong
                                >{DETERMINATION_LABELS[determination]}</strong
                              >
                            </span>
                          </div>
                        {/if}
                      </div>
                    {/if}

                    <button
                      type="button"
                      class="btn btn-accent w-full"
                      onclick={() => (certStep = 1)}
                      disabled={!serviceType}
                    >
                      Lanjut Isi Formulir
                      <iconify-icon icon="bx:right-arrow-alt"></iconify-icon>
                    </button>
                  {/if}
                {/if}
              </div>
            {/if}

            <!-- EMAIL: service type picker -->
            {#if active === "email"}
              <fieldset class="space-y-2">
                <legend class="font-semibold text-sm mb-1">Jenis Layanan</legend
                >
                {#each EMAIL_TYPES as t (t)}
                  <label
                    class={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${serviceType === t ? "border-primary bg-primary/5" : "border-base-300 hover:border-base-400"}`}
                  >
                    <input
                      type="radio"
                      class="radio radio-primary radio-sm"
                      name="email-service-type"
                      value={t}
                      bind:group={serviceType}
                    />
                    <span class="text-sm font-medium">
                      {SERVICE_TYPE_LABELS[t]}
                    </span>
                  </label>
                {/each}
              </fieldset>
            {/if}

            <!-- SHARED FORM (certificate: shown at step 1) -->
            {#if active !== "certificate" || certStep === 1}
              {#if active === "certificate" && determination}
                <div class="alert alert-success text-sm py-2">
                  <iconify-icon icon="bx:check-double"></iconify-icon>
                  <span>
                    Layanan: <strong
                      >{DETERMINATION_LABELS[determination]}</strong
                    >
                  </span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs ml-auto"
                    onclick={() => (certStep = 0)}
                  >
                    Ubah Data
                  </button>
                </div>
              {/if}

              <div class="space-y-3">
                <div class="grid sm:grid-cols-2 gap-3">
                  <label class="floating-label">
                    <span>Nama Lengkap *</span>
                    <input
                      type="text"
                      bind:value={item.requesterName}
                      placeholder="Nama Lengkap"
                      class="input input-bordered w-full"
                      required
                    />
                  </label>
                  <label class="floating-label">
                    <span>Nomor Telepon / WhatsApp *</span>
                    <input
                      type="tel"
                      bind:value={item.requesterPhone}
                      placeholder="08xxxxxxxxxx"
                      class="input input-bordered w-full"
                      required
                    />
                  </label>
                </div>

                <label class="floating-label">
                  <span>Email (opsional)</span>
                  <input
                    type="email"
                    bind:value={item.requesterEmail}
                    placeholder="nama@mojokertokota.go.id"
                    class="input input-bordered w-full"
                  />
                </label>

                <label class="floating-label">
                  <span>Subjek Permohonan *</span>
                  <input
                    type="text"
                    bind:value={item.subject}
                    placeholder="Ringkasan permohonan"
                    class="input input-bordered w-full"
                    required
                  />
                </label>

                <label class="floating-label">
                  <span>Deskripsi *</span>
                  <textarea
                    bind:value={item.description}
                    class="textarea textarea-bordered w-full min-h-24"
                    placeholder="Jelaskan kebutuhan Anda..."
                    required
                  ></textarea>
                </label>

                <Select
                  table="organizations"
                  params={{ limit: 100, offset: 0 }}
                  labelKey="name"
                  valueKey="id"
                  bind:value={item.organization_id}
                  name="organization_id"
                  label="Organisasi"
                  placeholder="Pilih organisasi..."
                  mapOptions={(opts) =>
                    opts.map((opt) =>
                      opt.name === "-"
                        ? { ...opt, name: "Semua Perangkat Daerah" }
                        : opt,
                    )}
                />

                {#if active === "certificate"}
                  <fieldset
                    class="space-y-2 rounded-xl border border-base-300 p-3"
                  >
                    <legend class="font-semibold text-sm px-1">
                      Apakah Anda masih dapat mengakses Email Dinas?
                    </legend>
                    <div class="flex gap-4">
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          class="radio radio-sm radio-primary"
                          name="email-access"
                          value="yes"
                          bind:group={item.emailAccess}
                        />
                        <span class="text-sm">Ya, masih bisa</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          class="radio radio-sm radio-warning"
                          name="email-access"
                          value="no"
                          bind:group={item.emailAccess}
                        />
                        <span class="text-sm">Tidak bisa diakses</span>
                      </label>
                    </div>
                    {#if item.emailAccess === "no"}
                      <div
                        class="alert alert-warning text-sm mt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                      >
                        <div class="flex items-start gap-2">
                          <iconify-icon
                            icon="bx:info-circle"
                            class="shrink-0 mt-0.5 text-lg"
                          ></iconify-icon>
                          <div>
                            <p class="font-semibold">
                              Tanda Tangan Pengajuan Email Diperlukan
                            </p>
                            <p class="opacity-80">
                              Pembuatan/pemulihan email dinas akan menjadi
                              prasyarat sebelum proses sertifikat dilanjutkan.
                              Anda harus menandatangani dokumen permohonan
                              terlebih dahulu.
                            </p>
                          </div>
                        </div>
                        {#if !documentId}
                          <button
                            type="button"
                            class="btn btn-sm btn-warning shrink-0"
                            onclick={goToSign}
                          >
                            <iconify-icon icon="bx:pen"></iconify-icon>
                            Tanda Tangan Sekarang
                          </button>
                        {/if}
                      </div>
                    {/if}
                  </fieldset>
                {:else if active === "email" && !documentId}
                  <div
                    class="alert alert-warning text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div class="flex items-start gap-2">
                      <iconify-icon
                        icon="bx:info-circle"
                        class="shrink-0 mt-0.5 text-lg"
                      ></iconify-icon>
                      <div>
                        <p class="font-semibold">
                          Tanda Tangan Pengajuan Email Diperlukan
                        </p>
                        <p class="opacity-80">
                          Anda harus menandatangani dokumen permohonan terlebih
                          dahulu sebelum mengirim pengajuan.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="btn btn-sm btn-warning shrink-0"
                      onclick={goToSign}
                    >
                      <iconify-icon icon="bx:pen"></iconify-icon>
                      Tanda Tangan Sekarang
                    </button>
                  </div>
                {/if}

                {#if documentId}
                  <div class="alert alert-success text-sm py-2">
                    <iconify-icon icon="bx:check-circle" class="text-lg"
                    ></iconify-icon>
                    <span>
                      Dokumen pengajuan email dinas telah ditandatangani (ID: <span
                        class="font-mono font-semibold">{documentId}</span
                      >).
                    </span>
                  </div>
                {/if}
              </div>
            {/if}

            {#if wizardError}
              <div class="alert alert-error text-sm py-2">
                <iconify-icon icon="bx:error-circle"></iconify-icon>
                {wizardError}
              </div>
            {/if}

            {#if active !== "certificate" || certStep === 1}
              <button
                type="submit"
                class="btn btn-primary w-full"
                disabled={!canSubmit || submitting}
              >
                {#if submitting}
                  <span class="loading loading-spinner loading-sm"></span>
                  Mengirim...
                {:else}
                  <iconify-icon icon="bx:send"></iconify-icon>
                  Kirim Pengajuan
                {/if}
              </button>
            {/if}
          </form>
        </div>
      </div>
    {/if}
  </div>
</div>
