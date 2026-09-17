<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import {
    lookupTicket,
    createTicket,
    checkIdentity,
    batchCheckBsre,
  } from "$lib/remotes/helpdesk.remote";
  import { getData } from "$lib/remotes/api.remote";
  import {
    SERVICE_TYPE_LABELS,
    DETERMINATION_LABELS,
    DETERMINATION_COLORS,
  } from "$lib/app/helpdesk";
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
    // Satu formulir untuk pembuatan email & reset password — jenis layanan
    // ditentukan otomatis; admin dapat menyesuaikan saat proses tiket.
    if (card === "email") serviceType = "email_new";
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
  let certStep = $state(0); // certificate wizard: 0 = BSrE check, 1 = form
  let serviceType = $state<HelpdeskServiceType | "">("");

  let identity = $state("");
  let checking = $state(false);
  let checkError = $state("");
  let bsre = $state<Awaited<ReturnType<typeof checkIdentity>> | null>(null);

  let item = $state({
    organization_id: undefined as string | undefined,
    requesterName: "",
    requesterNip: "",
    requesterNik: "",
    requesterPhone: "",
    requesterEmail: "",
    requesterPosition: "",
    requesterRank: "",
    subject: "",
    description: "",
    emailAccess: "yes" as "yes" | "no",
  });

  // Request mode: "single" = one applicant (mandiri), "bulk" = cumulative
  // request — many requesters share ONE ticket & ONE signed document.
  type RequesterRow = {
    key: number;
    name: string;
    nik: string;
    nip: string;
    email: string;
    position: string;
    rank: string | undefined;
    emailAccess: boolean;
  };
  let mode = $state<"single" | "bulk">("single");
  let rowSeq = 0;
  let rows = $state<RequesterRow[]>([]);

  function makeRow(): RequesterRow {
    return {
      key: ++rowSeq,
      name: "",
      nik: "",
      nip: "",
      email: "",
      position: "",
      rank: undefined,
      emailAccess: true,
    };
  }

  function addRow() {
    rows.push(makeRow());
  }

  function removeRow(key: number) {
    rows = rows.filter((r) => r.key !== key);
  }

  // Kumulatif table starts with two empty rows for quicker entry.
  let bulkSeeded = false;
  let bulkBsreResults = $state<Record<string, any>>({});
  let bulkChecking = $state(false);

  /** Auto-check BSrE for all NIP/NIK in bulk rows (certificate mode only). */
  async function autoCheckBulkBsre() {
    if (active !== "certificate") return;
    const ids = rows
      .flatMap((r) => [r.nip.trim(), r.nik.trim(), r.email.trim()])
      .filter(Boolean);
    if (ids.length === 0) return;
    bulkChecking = true;
    try {
      const results = await batchCheckBsre({ identities: ids });
      bulkBsreResults = results ?? {};
      fillRowsFromBsre();
    } catch {
      bulkBsreResults = {};
    } finally {
      bulkChecking = false;
    }
  }

  /** Check BSrE for a single row (NIP first, then NIK, then email). */
  async function checkRowBsre(row: RequesterRow) {
    if (active !== "certificate") return;
    const id = row.nip.trim() || row.nik.trim() || row.email.trim();
    if (!id) return;
    bulkChecking = true;
    try {
      const results = await batchCheckBsre({
        identities: [row.nip.trim(), row.nik.trim(), row.email.trim()].filter(
          Boolean,
        ),
      });
      bulkBsreResults = { ...bulkBsreResults, ...results };
      fillRowsFromBsre();
    } catch {
      /* ignore */
    } finally {
      bulkChecking = false;
    }
  }

  /** Best BSrE hit for a row — prefers NIP, then NIK, then email; a "found"
   * hit always wins over a "not_found" result. */
  function bsreHitFor(row: RequesterRow): any | null {
    const nip = row.nip.trim().replace(/\D/g, "");
    const nik = row.nik.trim().replace(/\D/g, "");
    const email = row.email.trim().toLowerCase();
    const candidates = [
      nip && bulkBsreResults[nip],
      nik && bulkBsreResults[nik],
      email && bulkBsreResults[email],
    ].filter(Boolean);
    return candidates.find((r) => r.found) ?? candidates[0] ?? null;
  }

  /** Fill row fields from BSrE/BKPSDM results where still empty. */
  function fillRowsFromBsre() {
    for (const r of rows) {
      const hit = bsreHitFor(r);
      if (!hit) continue;
      if (!r.name && hit.nama) r.name = hit.nama;
      if (!r.nik && hit.nik) r.nik = hit.nik;
      if (!r.email && hit.emailAddress) r.email = hit.emailAddress;
      if (!r.rank && hit.golongan) r.rank = hit.golongan;
      if (!r.position && (hit.jabatan || hit.jabatanOrganisasi))
        r.position = hit.jabatan || hit.jabatanOrganisasi;
    }
  }

  function bsreStatusFor(
    row: RequesterRow,
  ): { label: string; color: string } | null {
    const r = bsreHitFor(row);
    if (!r) return null;
    const det = (r.found ? r.determination : "not_found") as BsreDetermination;
    if (det && det in DETERMINATION_LABELS) {
      return {
        label: DETERMINATION_LABELS[det],
        color: DETERMINATION_COLORS[det],
      };
    }
    return {
      label: r.aktif ? "Aktif" : "Nonaktif",
      color: "text-base-content/60",
    };
  }

  $effect(() => {
    if (mode === "bulk" && !bulkSeeded) {
      bulkSeeded = true;
      if (rows.length === 0) rows.push(makeRow(), makeRow());
      // Auto-check BSrE for certificate kumulatif.
      if (active === "certificate") autoCheckBulkBsre();
    }
    // Bulk+cert skips the identity-check step; default serviceType so canSubmit works.
    if (mode === "bulk" && active === "certificate" && !serviceType) {
      serviceType = "certificate_registration";
    }
    // Clear stale single BSrE state when switching to bulk.
    if (mode === "bulk" && bsre) bsre = null;
  });

  // Auto-fill penandatangan fields from the first BSrE hit after bulk check.
  $effect(() => {
    if (mode !== "bulk" || active !== "certificate") return;
    const hits = Object.values(bulkBsreResults).filter(
      (r: any) => r.found && r.aktif,
    );
    if (hits.length === 0) return;
    const first = hits[0] as any;
    if (!item.requesterName && first.nama) item.requesterName = first.nama;
    if (!item.requesterEmail && first.emailAddress)
      item.requesterEmail = first.emailAddress;
    if (!item.requesterRank && first.golongan)
      item.requesterRank = first.golongan;
    if (!item.organization_id && first.organisasi)
      item.organization_id = first.organisasi;
  });

  /** Import a text/CSV file: one requester per line, comma/semicolon/tab separated. */
  async function importCsv(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      for (const line of text.split(/\r?\n/)) {
        const parts = line
          .split(/[,;\t]/)
          .map((p) => p.trim())
          .filter(Boolean);
        if (!parts.length) continue;
        // Skip header rows like "Nama,NIK,Email"
        if (/^\"?nama\"?\s*[,;\t]/i.test(line)) continue;
        const row: RequesterRow = {
          key: ++rowSeq,
          name: "",
          nik: "",
          nip: "",
          email: "",
          position: "",
          rank: "",
          emailAccess: true,
        };
        for (const p of parts) {
          const digits = p.replace(/\D/g, "");
          if (!row.nip && /^\d{18}$/.test(digits)) {
            row.nip = digits;
          } else if (!row.nik && /^\d{16}$/.test(digits)) {
            row.nik = digits;
          } else if (!row.name) row.name = p;
        }
        if (row.name || row.nip) rows.push(row);
      }
    } finally {
      input.value = "";
    }
  }

  let documentId = $state<string | undefined>(undefined);
  let submitting = $state(false);
  let wizardError = $state("{}");

  // -----------------------------------------------------------------------
  // Requester prefill — logged-in profile first, else last saved submission
  // -----------------------------------------------------------------------
  function readSavedRequester(): {
    requesterName?: string;
    requesterPhone?: string;
    requesterEmail?: string;
    requesterPosition?: string;
    requesterRank?: string;
    organization_id?: string;
  } {
    try {
      return JSON.parse(localStorage.getItem("helpdesk_requester") || "{}");
    } catch {
      return {};
    }
  }

  function saveRequesterProfile() {
    localStorage.setItem(
      "helpdesk_requester",
      JSON.stringify({
        requesterName: item.requesterName.trim(),
        requesterPhone: item.requesterPhone.trim(),
        requesterEmail: item.requesterEmail.trim(),
        requesterPosition: item.requesterPosition.trim(),
        requesterRank: item.requesterRank.trim(),
        organization_id: item.organization_id,
      }),
    );
  }

  /** Fill only still-empty fields — never overwrite restored/user input. */
  function prefillRequester() {
    const saved = readSavedRequester();
    const u = page.data.user;
    if (u) {
      if (!item.requesterEmail && u.email) item.requesterEmail = u.email;
      if (!item.organization_id && u.organization_id)
        item.organization_id = u.organization_id;
    }
    if (!item.requesterName && saved.requesterName)
      item.requesterName = saved.requesterName;
    if (!item.requesterPhone && saved.requesterPhone)
      item.requesterPhone = saved.requesterPhone;
    if (!item.requesterEmail && saved.requesterEmail)
      item.requesterEmail = saved.requesterEmail;
    if (!item.organization_id && saved.organization_id)
      item.organization_id = saved.organization_id;
    if (!item.requesterPosition && saved.requesterPosition)
      item.requesterPosition = saved.requesterPosition;
    if (!item.requesterRank && saved.requesterRank)
      item.requesterRank = saved.requesterRank;
  }

  // Signers row for the logged-in account (has name/phone; users table doesn't)
  const signerRow = $derived(
    page.data.user
      ? getData({
          table: "signers",
          where: { email: page.data.user.email },
          limit: 1,
          offset: 0,
        }).current?.data?.[0]
      : null,
  );

  $effect(() => {
    const s = signerRow;
    if (!s) return;
    if (!item.requesterName && s.name) item.requesterName = s.name;
    if (!item.requesterPhone && s.phone) item.requesterPhone = s.phone;
  });

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
        mode = state.mode ?? "single";
        rows = state.rows ?? [];
        if (active === "email" && !serviceType) serviceType = "email_new";
      } catch (e) {
        console.error(e);
      }
      localStorage.removeItem("helpdesk_form_state");
    }

    // Direct link with ?service=email — same single form, type auto-set.
    if (active === "email" && !serviceType) serviceType = "email_new";

    const docId = page.url.searchParams.get("documentId");
    if (docId) {
      documentId = docId;
    }

    prefillRequester();
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
        mode,
        rows,
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
      (active !== "certificate" || certStep === 1 || mode === "bulk") &&
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
    item.requesterNip = "";
    item.requesterNik = "";
    item.requesterPhone = "";
    item.requesterEmail = "";
    item.requesterPosition = "";
    item.requesterRank = "";
    item.subject = "";
    item.description = "";
    item.emailAccess = "yes";
    mode = "single";
    bulkSeeded = false;
    bulkBsreResults = {};
    rows = [];
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
      // BSrE data → prefill organisasi (resolved to org id by the Select).
      if (res.organisasi && !item.organization_id)
        item.organization_id = res.organisasi;
      // BKPSDM ASN data → prefill jabatan & golongan (pangkat).
      if (res.jabatan && !item.requesterPosition)
        item.requesterPosition = res.jabatan;
      if (res.golongan && !item.requesterRank)
        item.requesterRank = res.golongan;
      // Auto-fill NIP/NIK from the verified identity number.
      if (id.length === 18 && !item.requesterNip) item.requesterNip = id;
      if (id.length === 16 && !item.requesterNik) item.requesterNik = id;
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
        requesterNip: item.requesterNip.trim() || undefined,
        requesterNik: item.requesterNik.trim() || undefined,
        requesterEmail: item.requesterEmail.trim() || undefined,
        organizationId: item.organization_id || undefined,
        requesterPosition: item.requesterPosition.trim() || undefined,
        requesterRank: item.requesterRank.trim() || undefined,
        documentId: documentId || undefined,
        parentId: undefined,
        requesters:
          mode === "bulk" && rows.length > 0
            ? rows.map((r) =>
                [
                  r.name.trim(),
                  r.nik.trim(),
                  r.nip.trim(),
                  r.position.trim(),
                  r.rank?.trim(),
                  r.emailAccess ? "yes" : "no",
                ]
                  .filter((v) => v !== undefined && v !== "")
                  .join(", "),
              )
            : undefined,
        // Kumulatif: the applicant below signs the shared document on
        // behalf of every listed requester.
        signerName:
          mode === "bulk" ? item.requesterName.trim() || undefined : undefined,
      });
      // Remember for next visit (used to prefill the form & ticket access)
      saveRequesterProfile();
      await goto(
        `/helpdesk/ticket/${res.id}?phone=${encodeURIComponent(item.requesterPhone.trim())}`,
      );
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
                  : "Formulir untuk pengajuan email baru maupun reset password email."}
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
            <!-- Request mode: mandiri (single) vs kumulatif (multiple) -->
            <fieldset class="space-y-2">
              <legend class="font-semibold text-sm mb-1">
                Jenis Pendaftaran
              </legend>
              <div class="grid sm:grid-cols-2 gap-2">
                <label
                  class={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${mode === "single" ? "border-primary bg-primary/5" : "border-base-300 hover:border-base-400"}`}
                >
                  <input
                    type="radio"
                    class="radio radio-primary radio-sm"
                    name="request-mode"
                    value="single"
                    bind:group={mode}
                  />
                  <iconify-icon icon="bx:user" class="text-lg"></iconify-icon>
                  <span class="text-sm font-medium">Pendaftaran Mandiri</span>
                </label>
                <label
                  class={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${mode === "bulk" ? "border-primary bg-primary/5" : "border-base-300 hover:border-base-400"}`}
                >
                  <input
                    type="radio"
                    class="radio radio-primary radio-sm"
                    name="request-mode"
                    value="bulk"
                    bind:group={mode}
                  />
                  <iconify-icon icon="bx:group" class="text-lg"></iconify-icon>
                  <span class="text-sm font-medium">Pendaftaran Kumulatif</span>
                </label>
              </div>
            </fieldset>

            {#if mode === "bulk"}
              <!-- Kumulatif: editable requester table, one ticket for all -->
              <div class="space-y-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="font-semibold text-sm">
                    Daftar Pemohon
                    {#if rows.length}
                      <span class="badge badge-primary badge-sm ml-1"
                        >{rows.length}</span
                      >
                    {/if}
                  </p>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      class="btn btn-xs btn-outline"
                      onclick={addRow}
                    >
                      <iconify-icon icon="bx:plus"></iconify-icon>
                      Tambah Baris
                    </button>
                    <label class="btn btn-xs btn-outline cursor-pointer">
                      <iconify-icon icon="bx:upload"></iconify-icon>
                      Impor CSV
                      <input
                        type="file"
                        accept=".csv,.txt"
                        class="hidden"
                        onchange={importCsv}
                      />
                    </label>
                    {#if active === "certificate"}
                      <button
                        type="button"
                        class="btn btn-xs btn-outline"
                        disabled={bulkChecking || rows.length === 0}
                        onclick={() => autoCheckBulkBsre()}
                      >
                        <iconify-icon
                          icon={bulkChecking
                            ? "bx:loader-alt bx-spin"
                            : "bx:search"}
                          class="text-xs"
                        ></iconify-icon>
                        Periksa Semua Data BSrE
                      </button>
                    {/if}
                  </div>
                </div>
                <div class="rounded-xl border border-base-300">
                  <table class="table table-sm">
                    <thead>
                      <tr class="bg-base-200/50">
                        <th class="w-10">#</th>
                        <th>Nama *</th>
                        <th>NIP *</th>
                        <th>NIK</th>
                        <th>Email</th>
                        <th>Jabatan</th>
                        <th>Pangkat</th>
                        {#if active === "certificate"}
                          <th class="w-40">Layanan BSrE</th>
                        {/if}
                        <th
                          class="w-20 text-center tooltip tooltip-bottom"
                          data-tip="Centang untuk mereset akses email"
                          >Reset Email</th
                        >
                        <th class="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each rows as r (r.key)}
                        <tr class="[&>td]:py-0">
                          <td class="opacity-50">{rows.indexOf(r) + 1}</td>
                          <td class="px-1">
                            <input
                              bind:value={r.name}
                              placeholder="Nama lengkap"
                              class="input input-sm input-ghost w-full min-w-36"
                            />
                          </td>
                          <td class="px-1">
                            <label class="input input-sm input-ghost w-full min-w-40">
                              <input
                                bind:value={r.nip}
                                inputmode="numeric"
                                maxlength={18}
                                placeholder="NIP (18 digit)"
                                class="grow"
                              />
                              {#if active === "certificate"}
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-xs -mr-2"
                                  title="Periksa BSrE"
                                  disabled={bulkChecking || !r.nip}
                                  onclick={() => checkRowBsre(r)}
                                >
                                  <iconify-icon icon="bx:search" class="text-xs"
                                  ></iconify-icon>
                                </button>
                              {/if}
                            </label>
                          </td>
                          <td class="px-1">
                            <input
                              bind:value={r.nik}
                              inputmode="numeric"
                              maxlength={16}
                              placeholder="NIK (16 digit)"
                              class="input input-sm input-ghost w-full min-w-32"
                            />
                          </td>
                          <td class="px-1">
                            <input
                              value={r.email}
                              readonly
                              placeholder="nama@mojokertokota.go.id"
                              class="input input-sm input-ghost w-full min-w-36"
                            />
                          </td>
                          <td class="px-1">
                            <input
                              bind:value={r.position}
                              placeholder="Jabatan"
                              class="input input-sm input-ghost w-full min-w-36"
                            />
                          </td>
                          <td class="px-1 w-56">
                            <Select
                              table="ranks"
                              params={{ limit: 100, offset: 0 }}
                              orderBy={{ id: "asc" }}
                              labelKey={(prop: any) =>
                                `${prop.grade} ${prop.rank != "-" ? "(" + prop.rank + ")" : ""}`}
                              valueKey={(prop: any) =>
                                `${prop.grade} ${prop.rank != "-" ? "(" + prop.rank + ")" : ""}`}
                              lookupKey="rank"
                              bind:value={r.rank}
                              placeholder="Pangkat..."
                              inputClass="input-sm input-ghost"
                            />
                          </td>
                          <td class="px-1">
                            {#if active === "certificate"}
                              {@const s = bsreStatusFor(r)}
                              {#if s}
                                <span class="text-xs font-medium {s.color}"
                                  >{s.label}</span
                                >
                              {:else if bulkChecking}
                                <span class="loading loading-spinner loading-xs"
                                ></span>
                              {/if}
                            {/if}
                          </td>
                          <td class="px-1 text-center">
                            <span
                              class="tooltip tooltip-bottom"
                              data-tip="Centang untuk mereset akses email"
                            >
                              <input
                                type="checkbox"
                                class="checkbox checkbox-xs"
                                bind:checked={r.emailAccess}
                              />
                            </span>
                          </td>
                          <td class="px-1">
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs text-error"
                              aria-label="Hapus baris"
                              onclick={() => removeRow(r.key)}
                            >
                              <iconify-icon icon="bx:trash" class="text-base"
                              ></iconify-icon>
                            </button>
                          </td>
                        </tr>
                      {:else}
                        <tr>
                          <td
                            colspan={active === "certificate" ? 10 : 9}
                            class="text-center py-4 opacity-50"
                          >
                            Belum ada pemohon tambahan — klik
                            <strong>Tambah Baris</strong> atau impor CSV.
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            {/if}

            <!-- CERTIFICATE: identity / BSrE check (single mode only — bulk checks per-row) -->
            {#if active === "certificate" && mode !== "bulk"}
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

            <!-- SHARED FORM (certificate single: step 1; bulk/email: always) -->
            {#if active !== "certificate" || certStep === 1 || mode === "bulk"}
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
                <!-- Penandatangan dokumen pengajuan: identified by the
                     applicant data below (nama/NIP/NIK). -->

                <h3 class="font-semibold text-sm mb-0">
                  Penandatangan Pengajuan
                </h3>

                {#if mode === "bulk"}
                  <p class="text-[10px] opacity-50">
                    Data di bawah adalah pejabat yang menandatangani dokumen
                    untuk seluruh pemohon pada daftar.
                  </p>
                {:else}
                  <p class="text-[10px] opacity-50">
                    Data di bawah ini adalah pemohon yang mengajukan email
                    secara pribadi.
                  </p>
                {/if}
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
                  <Select
                    table="organizations"
                    params={{ limit: 100, offset: 0 }}
                    labelKey="name"
                    valueKey="id"
                    lookupKey="name"
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
                </div>

                <div class="grid sm:grid-cols-2 gap-3">
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

                <div class="grid sm:grid-cols-2 gap-3">
                  <label class="floating-label">
                    <span>Jabatan</span>
                    <input
                      type="text"
                      bind:value={item.requesterPosition}
                      placeholder="Contoh: Kepala Dinas / Guru"
                      class="input input-bordered w-full"
                    />
                  </label>
                  <Select
                    table="ranks"
                    params={{ limit: 100, offset: 0 }}
                    orderBy={{ id: "asc" }}
                    labelKey={(prop) =>
                      `${prop.grade} ${prop.rank != "-" ? "(" + prop.rank + ")" : ""}`}
                    valueKey={(prop) =>
                      `${prop.grade} ${prop.rank != "-" ? "(" + prop.rank + ")" : ""}`}
                    lookupKey="rank"
                    bind:value={item.requesterRank}
                    name="requester_rank"
                    label="Pangkat / Golongan"
                    placeholder="Pilih pangkat..."
                  />
                </div>

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

                {#if active === "certificate" && mode !== "bulk"}
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
                        class="font-semibold">{documentId}</span
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

            {#if active !== "certificate" || certStep === 1 || mode === "bulk"}
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
