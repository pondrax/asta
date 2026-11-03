<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import {
    lookupTicket,
    createTicket,
    updateTicket,
    getTicket,
    checkIdentity,
    batchCheckBsre,
  } from "$lib/remotes/helpdesk.remote";
  import { getData } from "$lib/remotes/api.remote";
  import {
    SERVICE_LABELS,
    SERVICE_TYPE_LABELS,
    DETERMINATION_LABELS,
    DETERMINATION_COLORS,
    ticketNumber as toTicketNumber,
  } from "$lib/app/helpdesk";
  import type { BsreDetermination } from "$lib/app/helpdesk";
  import type {
    HelpdeskService,
    HelpdeskServiceType,
  } from "$lib/server/db/schema";
  import Select from "$lib/components/select.svelte";
  import Modal from "$lib/components/modal.svelte";
  import { app } from "$lib/app/index.svelte";
  import { onMount, untrack } from "svelte";
  import { fly } from "svelte/transition";

  // ---------------------------------------------------------------------------
  // Service catalog cards
  // ---------------------------------------------------------------------------
  type Card = "email" | "certificate" | "track";
  type WizardStep = 0 | 1 | 2;

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
    wizardStep = 0;
    // Satu formulir untuk pembuatan email & reset password — jenis layanan
    // ditentukan otomatis; admin dapat menyesuaikan saat proses tiket.
    if (card === "email") serviceType = "email_new";
  }

  function backToServices() {
    active = null;
    wizardStep = 0;
    navError = "";
  }

  // ---------------------------------------------------------------------------
  // Edit an already-submitted ticket (?edit=<ticketId>)
  // ---------------------------------------------------------------------------
  function initialEditPhone(): string | null {
    const urlPhone = page.url.searchParams.get("phone");
    if (urlPhone) return urlPhone;
    if (typeof localStorage === "undefined") return null;
    return readSavedRequester().requesterPhone ?? null;
  }

  let editId = $state<string | null>(page.url.searchParams.get("edit"));
  let editPhone = $state<string | null>(initialEditPhone());
  let editPhoneInput = $state(initialEditPhone() ?? "");
  let editLoaded = $state(false);
  let editTicketNumber = $state<string | null>(null);
  let isEditing = $derived(Boolean(editId));

  const editQuery = $derived(
    editId ? getTicket({ id: editId, phone: editPhone ?? undefined }) : null,
  );
  const editTicket = $derived(editQuery?.current ?? null);
  const editError = $derived(editQuery?.error ?? null);

  function exitEdit() {
    if (!editId) return backToServices();
    const phone = editPhone ? `?phone=${encodeURIComponent(editPhone)}` : "";
    goto(`/helpdesk/ticket/${editId}${phone}`);
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
  let wizardStep = $state<WizardStep>(0);
  let navError = $state("");

  let certStep = $state(0); // certificate: 0 = BSrE not checked, 1 = verified
  let serviceType = $state<HelpdeskServiceType | "">("");

  let identityNip = $state("");
  let identityNik = $state("");
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

  /** Map a BKPSDM golongan value to the ranks "Pangkat" value. "--"/"-"
   * (unknown) maps to the "-" option. */
  function golonganRank(g?: string | null): string | undefined {
    if (!g) return undefined;
    return g === "--" || g === "-" ? "-" : g;
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
      const rank = golonganRank(hit.golongan);
      if ((!r.rank || r.rank === "-") && rank) r.rank = rank;
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
        label: det === "active_issue" ? "Reset" : DETERMINATION_LABELS[det],
        color: DETERMINATION_COLORS[det],
      };
    }
    return {
      label: r.aktif ? "Aktif" : "Nonaktif",
      color: "text-base-content/60",
    };
  }

  /** Full BSrE status for the tooltip (short label + detail). */
  function bsreFullStatus(row: RequesterRow): string | null {
    const r = bsreHitFor(row);
    if (!r) return null;
    const det = (r.found ? r.determination : "not_found") as BsreDetermination;
    const parts = [DETERMINATION_LABELS[det] ?? det];
    if (r.status) parts.push(`Status akun: ${r.status}`);
    if (r.aktif != null) parts.push(r.aktif ? "Aktif" : "Nonaktif");
    if (r.certStart || r.certEnd) {
      parts.push(`Berlaku: ${fmtCert(r.certStart)} s/d ${fmtCert(r.certEnd)}`);
    }
    return parts.join(" · ");
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
    if (mode === "bulk" && certStep !== 0) certStep = 0;
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
    const rank = golonganRank(first.golongan);
    if (!item.requesterRank && rank) item.requesterRank = rank;
    if (!item.organization_id && first.organisasi)
      item.organization_id = first.organisasi;
  });

  /** CSV import modal — opens first, sample + paste/upload inside, preview tempelate. */
  let importOpen = $state(false);
  let csvText = $state("");
  let importPreview = $state<RequesterRow[] | null>(null);

  function openImport() {
    csvText = "";
    importPreview = null;
    importOpen = true;
  }

  /** Parse pasted text or CSV file content into requester rows for preview.
   * Columns are positional (no content detection): Nama, NIK, NIP, Email, Jabatan.
   * Pangkat (golongan) is auto-detected from tokens like "III/b"; defaults to "-". */
  function parseCsvText(text: string): RequesterRow[] {
    const preview: RequesterRow[] = [];
    const golonganRe = /^[iv]+[\/\\][a-e]$/i;
    for (const line of text.split(/\r?\n/)) {
      const cols = line.split(/[,;\t]/).map((p) => p.trim());
      if (cols.every((c) => !c)) continue;
      // Skip header rows like "Nama,NIK,NIP,Email"
      if (/^\"?nama\"?\s*[,;\t]/i.test(line)) continue;
      const [nama, nik, nip, email, jabatan, ...rest] = cols;

      let golongan: string | undefined;
      for (const c of [jabatan, ...rest, nik, nip, nama]) {
        if (c && golonganRe.test(c)) {
          golongan = c;
          break;
        }
      }
      const pos =
        jabatan && golongan && jabatan.toLowerCase() === golongan.toLowerCase()
          ? ""
          : (jabatan ?? "");

      const row: RequesterRow = {
        key: ++rowSeq,
        name: nama ?? "",
        nik: (nik ?? "").replace(/\D/g, ""),
        nip: (nip ?? "").replace(/\D/g, ""),
        email: (email ?? "").toLowerCase(),
        position: pos,
        rank: golongan ?? undefined,
        emailAccess: true,
      };
      if (row.name || row.nik || row.nip || row.email) preview.push(row);
    }
    return preview;
  }

  async function parseCsvFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    csvText = await file.text();
    importPreview = parseCsvText(csvText);
    input.value = "";
  }

  function previewCsv() {
    importPreview = parseCsvText(csvText);
  }

  function confirmImport() {
    if (!importPreview || importPreview.length === 0) return;
    rows = [...rows, ...importPreview];
    importOpen = false;
    csvText = "";
    importPreview = null;
  }

  let documentId = $state<string | undefined>(undefined);
  let submitting = $state(false);
  let wizardError = $state("");
  // Inline signing — the /sign workspace runs in an iframe inside a modal so
  // the requester never leaves the wizard.
  let signOpen = $state(false);
  let signSrc = $state("");
  // Set right before leaving for the ticket page, so the pagehide/beforeunload
  // handlers don't resurrect the just-cleared wizard state.
  let skipSave = false;

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

  /** Strip the automatic note appended when the requester has no email access. */
  function stripAutoNote(description?: string | null) {
    return (description ?? "")
      .replace(/\n\n\[Otomatis\][\s\S]*$/i, "")
      .trim();
  }

  /** Convert a stored metadata.requester entry into an editable table row. */
  function metaRequesterToRow(r: any): RequesterRow {
    if (typeof r === "string") {
      // Legacy string form: Nama, NIK, NIP, Jabatan, Pangkat, akses, email
      const [name, nik, nip, position, rank, emailAccess, email] = r
        .split(",")
        .map((s) => s.trim());
      return {
        key: ++rowSeq,
        name: name ?? "",
        nik: (nik ?? "").replace(/\D/g, ""),
        nip: (nip ?? "").replace(/\D/g, ""),
        email: (email ?? "").toLowerCase(),
        position: position ?? "",
        rank: rank || undefined,
        emailAccess: emailAccess !== "no",
      };
    }
    return {
      key: ++rowSeq,
      name: r?.name ?? "",
      nik: (r?.nik ?? "").replace(/\D/g, ""),
      nip: (r?.nip ?? "").replace(/\D/g, ""),
      email: (r?.email ?? "").toLowerCase(),
      position: r?.position ?? "",
      rank: r?.rank || undefined,
      emailAccess: r?.emailAccess !== false,
    };
  }

  /** Hydrate the wizard from an existing ticket opened in edit mode. */
  function hydrateFromEdit(t: any) {
    if (!t) return;
    const meta = (t.metadata as any) ?? {};
    active = (t.service as Card) ?? "email";
    wizardStep = 0;
    navError = "";
    serviceType =
      (t.serviceType as HelpdeskServiceType) ||
      (t.service === "email" ? "email_new" : "");
    // Already verified when the ticket was created; no need to force a recheck.
    certStep = t.service === "certificate" ? 1 : 0;
    bsre = null;
    identityNip = /^\d{18}$/.test(t.requesterNip ?? "") ? t.requesterNip : "";
    identityNik = /^\d{16}$/.test(t.requesterNik ?? "") ? t.requesterNik : "";
    item = {
      organization_id: t.organizationId ?? undefined,
      requesterName: t.requesterName ?? "",
      requesterNip: t.requesterNip ?? "",
      requesterNik: t.requesterNik ?? "",
      requesterPhone: t.requesterPhone ?? "",
      requesterEmail: t.requesterEmail ?? "",
      requesterPosition: meta.requesterPosition ?? "",
      requesterRank: meta.requesterRank ?? "",
      subject: t.subject ?? "",
      description: stripAutoNote(t.description),
      emailAccess: (t.description ?? "").includes(
        "Email Dinas tidak dapat diakses",
      )
        ? "no"
        : "yes",
    };
    const reqs = Array.isArray(meta.requesters) ? meta.requesters : [];
    if (reqs.length > 0) {
      mode = "bulk";
      // Mark seeded before the bulk effect runs so it doesn't add empty rows
      // or re-run the BSrE batch check on open.
      bulkSeeded = true;
      rows = reqs.map((r: any) => metaRequesterToRow(r));
      bulkBsreResults = (meta.bsreChecks as Record<string, any>) ?? {};
    } else {
      mode = "single";
      bulkSeeded = false;
      rows = [];
      bulkBsreResults = {};
    }
    documentId = undefined;
    editTicketNumber = t.ticketNumber ?? toTicketNumber(t.id);
    editLoaded = true;
  }

  $effect(() => {
    if (editTicket && !editLoaded) hydrateFromEdit(editTicket);
  });

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

  // Org name for the sign template (Select binds the id, but may briefly hold
  // the raw name before the Select resolves it — handle both).
  const signerOrganisasi = $derived(
    (() => {
      const v = (item.organization_id || "").trim();
      if (!v) return "";
      const fromId =
        getData({
          table: "organizations",
          where: { id: v },
          limit: 1,
          offset: 0,
        }).current?.data?.[0];
      if (fromId?.name) return fromId.name;
      const fromName =
        getData({
          table: "organizations",
          where: { name: v },
          limit: 1,
          offset: 0,
        }).current?.data?.[0];
      return fromName?.name ?? v;
    })(),
  );

  $effect(() => {
    const s = signerRow;
    if (!s) return;
    if (!item.requesterName && s.name) item.requesterName = s.name;
    if (!item.requesterPhone && s.phone) item.requesterPhone = s.phone;
  });

  onMount(() => {
    // Edit mode loads the ticket itself — never restore an unrelated draft.
    if (editId) return;

    const saved = localStorage.getItem("helpdesk_form_state");
    if (saved) {
      try {
        const state = JSON.parse(saved);
        active = state.active;
        certStep = state.certStep ?? 0;
        serviceType = state.serviceType;
        identityNip =
          state.identityNip ??
          (state.identity?.length === 18 ? state.identity : "");
        identityNik =
          state.identityNik ??
          (state.identity?.length === 16 ? state.identity : "");
        item = state.item;
        mode = state.mode ?? "single";
        rows = state.rows ?? [];
        rowSeq = rows.length
          ? Math.max(...rows.map((r: RequesterRow) => r.key))
          : 0;
        // Compat: older saved states only had certStep (0 = check, 1 = form).
        wizardStep = Math.min(
          2,
          Math.max(0, state.wizardStep ?? (state.certStep === 1 ? 1 : 0)),
        ) as WizardStep;
        if (state.documentId) documentId = state.documentId;
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
      wizardStep = 2;
    }

    prefillRequester();
  });

  /** Persist the current wizard state so a page reload keeps everything. */
  function saveFormState() {
    if (skipSave || editId) return;
    localStorage.setItem(
      "helpdesk_form_state",
      JSON.stringify({
        active,
        certStep,
        wizardStep,
        serviceType,
        identityNip,
        identityNik,
        item,
        mode,
        rows,
        documentId,
      }),
    );
  }

  function goToSign() {
    // Starting a new signature — the old document is no longer valid for this
    // submission; only a completed signature (via ?documentId=) re-sets it.
    documentId = undefined;
    saveFormState();
    const params = new URLSearchParams();
    params.set("template", "pengajuan-email");
    params.set("redirect", "/helpdesk");
    if (item.requesterName) params.set("nama", item.requesterName);
    if (item.requesterPhone)
      params.set("phone", item.requesterPhone.replace(/\D/g, ""));
    if (item.requesterEmail) params.set("email", item.requesterEmail);
    if (item.requesterNip) params.set("nip", item.requesterNip.replace(/\D/g, ""));
    if (item.requesterNik) params.set("nik", item.requesterNik.replace(/\D/g, ""));
    if (item.requesterPosition) params.set("jabatan", item.requesterPosition);
    if (item.requesterRank) params.set("pangkat", item.requesterRank);
    let instansi = signerOrganisasi || bsre?.organisasi || "";
    if (!instansi) {
      const raw = (item.organization_id || "").trim();
      // Select may briefly hold the raw org name before resolving to its id.
      if (raw && /^[a-z]/i.test(raw)) instansi = raw;
    }
    if (instansi) params.set("instansi", instansi);
    if (item.subject) params.set("note", item.subject);

    const cleanNip = identityNip.replace(/\D/g, "");
    const cleanNik = identityNik.replace(/\D/g, "");
    if (cleanNip && !params.get("nip")) params.set("nip", cleanNip);
    if (cleanNik && !params.get("nik")) params.set("nik", cleanNik);

    // Run the signing workspace inline (iframe) instead of navigating away.
    params.set("embed", "1");
    signSrc = `/sign?${params.toString()}`;
    signOpen = true;
  }

  // The embedded /sign page reports back here once every document is signed.
  $effect(() => {
    if (!signOpen) return;
    function onSignMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "asta:sign:complete" || !data.documentId) return;
      documentId = String(data.documentId);
      signOpen = false;
      untrack(() => saveFormState());
      app.showToast(
        "success",
        "Dokumen pengajuan berhasil ditandatangani.",
        4000,
      );
    }
    window.addEventListener("message", onSignMessage);
    return () => window.removeEventListener("message", onSignMessage);
  });

  // -----------------------------------------------------------------------
  // Step metadata & validation
  // -----------------------------------------------------------------------
  const STEPS = $derived([
    {
      id: 0,
      label: mode === "bulk" ? "Daftar Pemohon" : "Data Pemohon",
      icon: "bx:user-circle",
    },
    { id: 1, label: "Detail", icon: "bx:detail" },
    { id: 2, label: "Kirim", icon: "bx:send" },
  ]);

  const STEP_INFO = $derived.by(() => {
    if (wizardStep === 0) {
      return {
        title: mode === "bulk" ? "Daftar Pemohon" : "Data Pemohon",
        desc:
          mode === "bulk"
            ? "Tambahkan seluruh pemohon dalam satu tiket, lalu lengkapi penanggung jawab."
            : active === "certificate"
              ? "Periksa data BSrE untuk menentukan jenis layanan sertifikat Anda."
              : "Lengkapi identitas pemohon yang akan mengajukan layanan.",
        icon: "bx:user-circle",
      };
    }
    if (wizardStep === 1) {
      return {
        title: "Detail Permohonan",
        desc:
          "Jelaskan kebutuhan Anda. Data kepegawaian boleh dikosongkan bila tidak relevan.",
        icon: "bx:detail",
      };
    }
    return {
      title: "Tinjau & Kirim",
      desc:
        "Periksa kembali data Anda, lengkapi tanda tangan bila diperlukan, lalu kirim.",
      icon: "bx:send",
    };
  });

  const filledRows = $derived(
    rows.filter(
      (r) =>
        r.name.trim() ||
        r.nip.trim() ||
        r.nik.trim() ||
        r.email.trim() ||
        r.position.trim(),
    ),
  );

  const nameValid = $derived(item.requesterName.trim().length >= 2);
  const phoneValid = $derived(
    item.requesterPhone.replace(/\D/g, "").length >= 9,
  );
  const needsSignature = $derived(
    !isEditing &&
      (active === "email" ||
        (active === "certificate" &&
          mode !== "bulk" &&
          item.emailAccess === "no")),
  );

  const stepOneHint = $derived.by(() => {
    if (!active) return "Pilih layanan terlebih dahulu.";
    if (mode === "bulk") {
      if (filledRows.length === 0)
        return "Tambahkan minimal satu pemohon pada daftar.";
      const bad = filledRows.findIndex(
        (r) => !r.name.trim() || !(r.nip.trim() || r.nik.trim() || r.email.trim()),
      );
      if (bad >= 0)
        return `Lengkapi nama dan NIP/NIK/email pemohon baris ke-${bad + 1}.`;
      if (!nameValid)
        return "Nama penanggung jawab / penandatangan wajib diisi.";
      if (!phoneValid)
        return "Nomor WhatsApp penanggung jawab minimal 9 digit.";
      return "";
    }
    if (active === "certificate" && certStep !== 1)
      return "Periksa data BSrE terlebih dahulu dengan NIP atau NIK.";
    if (!nameValid) return "Nama lengkap wajib diisi (minimal 2 karakter).";
    if (!phoneValid)
      return "Nomor WhatsApp wajib diisi dengan minimal 9 digit angka.";
    return "";
  });

  const stepTwoHint = $derived.by(() => {
    const subject = item.subject.trim();
    const description = item.description.trim();
    const email = item.requesterEmail.trim();
    if (!subject) return "Subjek permohonan wajib diisi.";
    if (subject.length < 5) return "Subjek permohonan minimal 5 karakter.";
    if (!description) return "Keterangan permohonan wajib diisi.";
    if (description.length < 10)
      return "Keterangan minimal 10 karakter agar petugas dapat memahami kebutuhan Anda.";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return "Format email tidak valid.";
    return "";
  });

  const stepThreeHint = $derived(
    needsSignature && !documentId
      ? "Tanda tangan dokumen pengajuan diperlukan sebelum mengirim."
      : "",
  );

  const stepOneValid = $derived(stepOneHint === "");
  const stepTwoValid = $derived(stepTwoHint === "");
  const stepThreeValid = $derived(stepThreeHint === "");

  const canSubmit = $derived(
    Boolean(active && serviceType) &&
      stepOneValid &&
      stepTwoValid &&
      stepThreeValid,
  );

  const serviceLabel = $derived(
    active === "email"
      ? SERVICE_LABELS.email
      : active === "certificate"
        ? SERVICE_LABELS.certificate
        : "",
  );

  const serviceTypeLabel = $derived(
    serviceType
      ? (SERVICE_TYPE_LABELS[serviceType as HelpdeskServiceType] ?? serviceType)
      : "—",
  );

  const noSignatureMessage = $derived(
    active === "certificate" && mode === "bulk"
      ? "Pendaftaran kumulatif tidak memerlukan tanda tangan pada tahap ini."
      : "Email dinas Anda masih dapat diakses, sehingga tanda tangan pengajuan tidak diperlukan.",
  );

  function goNext() {
    navError = "";
    if (wizardStep === 0) {
      if (!stepOneValid) {
        navError = stepOneHint;
        return;
      }
      wizardStep = 1;
    } else if (wizardStep === 1) {
      if (!stepTwoValid) {
        navError = stepTwoHint;
        return;
      }
      wizardStep = 2;
    }
    scrollToWizard();
  }

  function goBack() {
    navError = "";
    if (wizardStep === 0) {
      if (isEditing) {
        exitEdit();
        return;
      }
      backToServices();
      return;
    }
    wizardStep = (wizardStep - 1) as WizardStep;
    scrollToWizard();
  }

  function goToStep(step: number) {
    if (step === wizardStep || step > wizardStep || step < 0 || step > 2) return;
    navError = "";
    wizardStep = step as WizardStep;
    scrollToWizard();
  }

  function scrollToWizard() {
    if (typeof document === "undefined") return;
    document
      .getElementById("helpdesk-wizard")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSubmit(e: SubmitEvent) {
    if (wizardStep !== 2) {
      e.preventDefault();
      goNext();
      return;
    }
    submit(e);
  }

  const determination = $derived<BsreDetermination | null>(
    (bsre?.determination as BsreDetermination | null) ?? null,
  );

  function resetWizard() {
    skipSave = false;
    wizardStep = 0;
    navError = "";
    certStep = 0;
    serviceType = "";
    identityNip = "";
    identityNik = "";
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

  function resetIdentityCheck() {
    certStep = 0;
    bsre = null;
    serviceType = "";
    checkError = "";
  }

  async function runIdentityCheck() {
    if (checking) return;
    checkError = "";
    const nip = identityNip.replace(/\D/g, "");
    const nik = identityNik.replace(/\D/g, "");
    let id = "";
    if (nip) {
      if (nip.length !== 18) {
        checkError = "NIP harus 18 digit.";
        return;
      }
      id = nip;
    } else if (nik) {
      if (nik.length !== 16) {
        checkError = "NIK harus 16 digit.";
        return;
      }
      id = nik;
    } else {
      checkError = "Masukkan NIP (18 digit) atau NIK (16 digit).";
      return;
    }
    checking = true;
    try {
      const res = await checkIdentity({ identity: id });
      bsre = res;
      certStep = 1;
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
      const rank = golonganRank(res.golongan);
      if (rank && !item.requesterRank) item.requesterRank = rank;
      // Auto-fill NIP/NIK from the verified identity number.
      if (id.length === 18 && !item.requesterNip) item.requesterNip = id;
      if (id.length === 16 && !item.requesterNik) item.requesterNik = id;
    } catch (err: any) {
      bsre = null;
      certStep = 0;
      checkError =
        err?.body?.message || err?.message || "Gagal memeriksa data BSrE.";
    } finally {
      checking = false;
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!canSubmit || submitting || wizardStep !== 2) return;
    wizardError = "";
    submitting = true;
    try {
      const desc =
        active === "certificate" && item.emailAccess === "no"
          ? `${item.description.trim()}\n\n[Otomatis] Pemohon menyatakan Email Dinas tidak dapat diakses — mohon siapkan tiket email prasyarat.`
          : item.description.trim();

      const requestersPayload =
        mode === "bulk" && filledRows.length > 0
          ? filledRows.map((r) =>
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
          : undefined;

      // Kumulatif: the applicant below signs the shared document on
      // behalf of every listed requester.
      const signerNamePayload =
        mode === "bulk" ? item.requesterName.trim() || undefined : undefined;

      const payload = {
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
        requesters: requestersPayload,
        signerName: signerNamePayload,
      };

      const res = isEditing
        ? await updateTicket({
            ticketId: editId!,
            phone: editPhone ?? undefined,
            ...payload,
          })
        : await createTicket({ ...payload, parentId: undefined });

      // Remember for next visit (used to prefill the form & ticket access)
      saveRequesterProfile();
      // Ticket created/updated — drop any saved wizard state so it isn't restored.
      skipSave = true;
      localStorage.removeItem("helpdesk_form_state");
      await goto(
        `/helpdesk/ticket/${res.id}?phone=${encodeURIComponent(item.requesterPhone.trim())}`,
      );
    } catch (err: any) {
      wizardError =
        err?.body?.message || err?.message || "Gagal menyimpan tiket.";
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
    soft: string;
    border: string;
    cta: string;
  }[] = [
    {
      id: "email",
      icon: "bx:envelope",
      title: "Email Pegawai",
      desc: ["Pembuatan email pegawai baru", "Reset password email"],
      accent: "text-primary",
      soft: "bg-primary/10 text-primary",
      border: "hover:border-primary/60",
      cta: "Ajukan email",
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
      soft: "bg-accent/10 text-accent",
      border: "hover:border-accent/60",
      cta: "Ajukan sertifikat",
    },
    {
      id: "track",
      icon: "bx:search-alt-2",
      title: "Lacak Tiket",
      desc: ["Cek status tiket Anda", "Masukkan nomor tiket Anda"],
      accent: "text-secondary",
      soft: "bg-secondary/10 text-secondary",
      border: "hover:border-secondary/60",
      cta: "Lacak tiket",
    },
  ];

  const HIGHLIGHTS = [
    {
      icon: "bx:shield-quarter",
      title: "Data terverifikasi",
      desc: "NIP/NIK otomatis dicocokkan dengan data BSrE dan BKPSDM.",
    },
    {
      icon: "bx:file-blank",
      title: "Satu dokumen",
      desc: "Pendaftaran kumulatif cukup satu tiket untuk banyak pemohon.",
    },
    {
      icon: "bx:message-dots",
      title: "Pantau lewat WhatsApp",
      desc: "Nomor tiket dan pembaruan status dikirim langsung ke WhatsApp.",
    },
  ];
</script>

<svelte:window onbeforeunload={saveFormState} onpagehide={saveFormState} />

<div class="max-w-5xl mx-auto px-4 sm:px-5 py-8 sm:py-10 w-full">
  {#if editId && !editLoaded}
    {#if editPhone && !editError}
      <div class="max-w-xl mx-auto mt-10">
        <div class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-6 text-center space-y-3">
            <span class="loading loading-spinner loading-md text-primary mx-auto"></span>
            <p class="text-sm">Memuat data tiket untuk diedit...</p>
          </div>
        </div>
      </div>
    {:else}
      <div class="max-w-xl mx-auto">
        <button type="button" class="btn btn-ghost btn-sm gap-1 -ml-2 mb-3" onclick={exitEdit}>
          <iconify-icon icon="bx:arrow-back"></iconify-icon>
          Kembali ke tiket
        </button>
        <div class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-6 space-y-4">
            <div class="flex items-start gap-3">
              <div class="grid place-items-center size-12 rounded-2xl bg-primary/10 text-primary shrink-0">
                <iconify-icon icon="bx:edit-alt" class="text-2xl"></iconify-icon>
              </div>
              <div>
                <h2 class="text-lg font-bold">Ubah Pengajuan</h2>
                <p class="text-sm opacity-60 mt-0.5">
                  Masukkan nomor WhatsApp yang terdaftar pada tiket untuk memuat
                  formulir pengubahan.
                </p>
              </div>
            </div>
            <label class="floating-label">
              <span>Nomor WhatsApp</span>
              <input
                type="tel"
                bind:value={editPhoneInput}
                placeholder="08xxxxxxxxxx"
                class="input input-bordered w-full"
              />
            </label>
            {#if editError}
              <div class="alert alert-error text-sm py-2.5">
                <iconify-icon icon="bx:error-circle" class="text-lg"></iconify-icon>
                {(editError as any)?.body?.message || (editError as any)?.message || "Tidak dapat memuat tiket."}
              </div>
            {/if}
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-primary gap-1.5"
                onclick={() => {
                  editPhone = editPhoneInput.trim();
                  editLoaded = false;
                }}
                disabled={!editPhoneInput.trim()}
              >
                <iconify-icon icon="bx:search"></iconify-icon>
                Muat Tiket
              </button>
              <button type="button" class="btn btn-ghost" onclick={exitEdit}>
                Batal
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {:else if !active}
    <!-- =====================================================================
         LANDING — choose a service
    ====================================================================== -->
    <header class="text-center mb-9">
      <span class="badge badge-primary badge-outline badge-sm gap-1.5 mb-3">
        <iconify-icon icon="bx:support"></iconify-icon>
        Helpdesk Layanan Digital
      </span>
      <h1 class="text-3xl sm:text-4xl font-black tracking-tight">
        Ada yang bisa kami bantu?
      </h1>
      <p class="opacity-60 mt-3 max-w-2xl mx-auto text-sm sm:text-base">
        Ajukan permohonan email pegawai dan sertifikat elektronik (BSrE), atau
        lacak tiket yang sudah Anda buat. Prosesnya terpandu dan bisa diselesaikan
        dalam beberapa langkah.
      </p>
    </header>

    <div class="grid gap-4 md:grid-cols-3">
      {#each CARDS as c (c.id)}
        <button
          type="button"
          onclick={() => select(c.id)}
          class="card group bg-base-100 border border-base-300 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-lg {c.border} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <div class="card-body p-5 h-full">
            <div class="flex items-start justify-between gap-3">
              <div class="grid place-items-center size-12 rounded-2xl {c.soft}">
                <iconify-icon icon={c.icon} class="text-2xl"></iconify-icon>
              </div>
              <iconify-icon
                icon="bx:right-arrow-alt"
                class="text-xl opacity-25 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-1 {c.accent}"
              ></iconify-icon>
            </div>
            <h2 class="card-title text-lg mt-4">{c.title}</h2>
            <ul class="text-xs opacity-60 space-y-1">
              {#each c.desc as d (d)}
                <li class="flex items-start gap-1.5">
                  <iconify-icon
                    icon="bx:check"
                    class="text-sm mt-0.5 shrink-0 {c.accent}"
                  ></iconify-icon>
                  {d}
                </li>
              {/each}
            </ul>
            <div class="mt-auto pt-4">
              <span class="btn btn-sm btn-ghost px-0 gap-1 {c.accent}">
                {c.cta}
                <iconify-icon icon="bx:right-arrow-alt"></iconify-icon>
              </span>
            </div>
          </div>
        </button>
      {/each}
    </div>

    <div class="grid sm:grid-cols-3 gap-3 mt-8">
      {#each HIGHLIGHTS as h (h.title)}
        <div class="rounded-2xl border border-base-300 bg-base-100/60 p-4">
          <div class="flex items-center gap-2 text-primary">
            <iconify-icon icon={h.icon} class="text-lg"></iconify-icon>
            <p class="font-semibold text-sm">{h.title}</p>
          </div>
          <p class="text-xs opacity-60 mt-1.5 leading-relaxed">{h.desc}</p>
        </div>
      {/each}
    </div>
  {:else if active === "track"}
    <!-- =====================================================================
         TRACK TICKET
    ====================================================================== -->
    <div class="max-w-2xl mx-auto">
      <button
        type="button"
        class="btn btn-ghost btn-sm gap-1 -ml-2 mb-3"
        onclick={backToServices}
      >
        <iconify-icon icon="bx:arrow-back"></iconify-icon>
        Layanan lain
      </button>

      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-6 sm:p-8">
          <div class="flex items-start gap-3">
            <div class="grid place-items-center size-12 rounded-2xl bg-secondary/10 text-secondary shrink-0">
              <iconify-icon icon="bx:search-alt-2" class="text-2xl"
              ></iconify-icon>
            </div>
            <div>
              <h2 class="text-xl font-bold">Lacak Tiket</h2>
              <p class="text-sm opacity-60 mt-0.5">
                Masukkan nomor tiket Anda (contoh: CMK8X7) untuk melihat status
                dan riwayat penanganan.
              </p>
            </div>
          </div>

          <form onsubmit={findTicket} class="mt-6 space-y-3">
            <label class="floating-label">
              <span>Nomor Tiket</span>
              <input
                type="text"
                bind:value={lookupQ}
                placeholder="CMK8X7"
                class="input input-bordered w-full text-lg font-mono tracking-widest uppercase"
                required
              />
            </label>
            <button
              type="submit"
              class="btn btn-secondary w-full gap-2"
              disabled={loading || !lookupQ.trim()}
            >
              {#if loading}
                <span class="loading loading-spinner loading-sm"></span>
                Mencari...
              {:else}
                <iconify-icon icon="bx:search"></iconify-icon>
                Cari Tiket
              {/if}
            </button>
          </form>

          {#if errorMsg}
            <div class="alert alert-error text-sm py-2.5 mt-3">
              <iconify-icon icon="bx:error-circle" class="text-lg"></iconify-icon>
              {errorMsg}
            </div>
          {/if}

          <div class="divider my-4 text-xs opacity-40">atau</div>
          <p class="text-xs opacity-60 text-center">
            Nomor tiket juga dikirim melalui WhatsApp saat pengajuan dibuat.
          </p>
        </div>
      </div>
    </div>
  {:else}
    <!-- =====================================================================
         APPLICATION WIZARD
    ====================================================================== -->
    <div id="helpdesk-wizard" class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between gap-2 mb-4">
        {#if isEditing}
          <button
            type="button"
            class="btn btn-ghost btn-sm gap-1 -ml-2"
            onclick={exitEdit}
          >
            <iconify-icon icon="bx:arrow-back"></iconify-icon>
            Kembali ke tiket
          </button>
        {:else}
          <button
            type="button"
            class="btn btn-ghost btn-sm gap-1 -ml-2"
            onclick={backToServices}
          >
            <iconify-icon icon="bx:arrow-back"></iconify-icon>
            Layanan lain
          </button>
        {/if}
        <div class="flex flex-wrap items-center justify-end gap-2">
          {#if isEditing}
            <span class="badge badge-warning badge-outline gap-1">
              <iconify-icon icon="bx:edit-alt"></iconify-icon>
              Edit {editTicketNumber ?? ""}
            </span>
          {/if}
          <span
            class="badge badge-outline gap-1.5 {active === 'email'
              ? 'badge-primary'
              : 'badge-accent'}"
          >
            <iconify-icon
              icon={active === "email" ? "bx:envelope" : "bx:id-card"}
            ></iconify-icon>
            {serviceLabel}
          </span>
        </div>
      </div>

      {#if isEditing}
        <div class="alert alert-info text-sm py-2 mb-4">
          <iconify-icon icon="bx:info-circle" class="text-lg shrink-0"
          ></iconify-icon>
          <span>
            Anda sedang mengubah pengajuan
            <strong>{editTicketNumber ?? ""}</strong>. Perubahan akan tercatat
            pada riwayat tiket.
          </span>
        </div>
      {/if}

      <!-- Stepper -->
      <ul
        class="steps steps-horizontal w-full text-[11px] sm:text-xs mb-4 max-sm:steps-vertical max-sm:items-start"
      >
        {#each STEPS as s, i (s.id)}
          <li class="step" class:step-primary={i <= wizardStep}>
            <button
              type="button"
              class="flex flex-col items-center gap-0.5 px-1"
              class:cursor-pointer={i < wizardStep}
              class:opacity-60={i > wizardStep}
              disabled={i > wizardStep}
              onclick={() => goToStep(i)}
              aria-current={i === wizardStep ? "step" : undefined}
            >
              <iconify-icon
                icon={i < wizardStep ? "bx:check-circle" : s.icon}
                class="text-base"
              ></iconify-icon>
              <span>{s.label}</span>
            </button>
          </li>
        {/each}
      </ul>

      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-5 sm:p-6">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3">
              <div
                class="hidden sm:grid place-items-center size-11 rounded-2xl bg-primary/10 text-primary shrink-0"
              >
                <iconify-icon
                  icon={STEP_INFO.icon}
                  class="text-2xl"
                ></iconify-icon>
              </div>
              <div>
                <h2 class="text-lg font-bold leading-tight">
                  {STEP_INFO.title}
                </h2>
                <p class="text-xs opacity-60 mt-0.5 max-w-xl">
                  {STEP_INFO.desc}
                </p>
              </div>
            </div>
            <span class="badge badge-ghost badge-sm shrink-0"
              >{wizardStep + 1} / 3</span
            >
          </div>

          <form onsubmit={handleSubmit} class="mt-5">
            {#key wizardStep}
              <div in:fly={{ y: 8, duration: 180 }}>
                {#if wizardStep === 0}
                  <!-- STEP 1 — applicant data -->
                  <div class="space-y-5">
                    <fieldset>
                      <div class="flex items-center justify-between gap-2">
                        <legend class="font-semibold text-sm">
                          Jenis Pendaftaran
                        </legend>
                        <span class="text-[11px] opacity-50"
                          >Pilih sesuai kebutuhan</span
                        >
                      </div>
                      <div class="grid sm:grid-cols-2 gap-2 mt-2">
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
                          <iconify-icon
                            icon="bx:user"
                            class="text-lg text-primary"
                          ></iconify-icon>
                          <span>
                            <span class="block text-sm font-medium"
                              >Pendaftaran Mandiri</span
                            >
                            <span class="block text-[11px] opacity-60"
                              >Satu pemohon dalam satu tiket</span
                            >
                          </span>
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
                          <iconify-icon
                            icon="bx:group"
                            class="text-lg text-primary"
                          ></iconify-icon>
                          <span>
                            <span class="block text-sm font-medium"
                              >Pendaftaran Kumulatif</span
                            >
                            <span class="block text-[11px] opacity-60"
                              >Banyak pemohon, satu tiket</span
                            >
                          </span>
                        </label>
                      </div>
                    </fieldset>

                    {#if mode === "bulk"}
                      <!-- Bulk requester table -->
                      <div class="rounded-2xl border border-base-300 overflow-hidden">
                        <div
                          class="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-base-300 bg-base-200/40"
                        >
                          <div class="flex items-center gap-2">
                            <p class="font-semibold text-sm">Daftar Pemohon</p>
                            <span class="badge badge-primary badge-sm"
                              >{filledRows.length}/{rows.length}</span
                            >
                          </div>
                          <div class="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              class="btn btn-xs btn-outline gap-1"
                              onclick={addRow}
                            >
                              <iconify-icon icon="bx:plus"></iconify-icon>
                              Tambah Baris
                            </button>
                            <button
                              type="button"
                              class="btn btn-xs btn-outline gap-1"
                              onclick={openImport}
                            >
                              <iconify-icon icon="bx:upload"></iconify-icon>
                              Impor CSV
                            </button>
                            {#if active === "certificate"}
                              <button
                                type="button"
                                class="btn btn-xs btn-outline gap-1"
                                disabled={bulkChecking || filledRows.length === 0}
                                onclick={() => autoCheckBulkBsre()}
                              >
                                <iconify-icon
                                  icon={bulkChecking
                                    ? "bx:loader-alt bx-spin"
                                    : "bx:search"}
                                ></iconify-icon>
                                Periksa BSrE
                              </button>
                            {/if}
                          </div>
                        </div>

                        <div class="overflow-x-auto">
                          <table class="table table-sm min-w-[760px]">
                            <thead>
                              <tr class="bg-base-200/50 text-xs">
                                <th class="w-8">#</th>
                                <th class="min-w-40">NIP *</th>
                                <th class="min-w-40">Nama *</th>
                                <th class="min-w-36">NIK</th>
                                <th class="min-w-48">Email</th>
                                <th class="min-w-40">Jabatan</th>
                                <th class="w-48">Pangkat</th>
                                {#if active === "certificate"}
                                  <th class="w-28">Status</th>
                                {/if}
                                <th class="w-24 text-center">Aksi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {#each rows as r (r.key)}
                                {@const s = bsreStatusFor(r)}
                                <tr class="[&>td]:py-0.5">
                                  <td class="opacity-50"
                                    >{rows.indexOf(r) + 1}</td
                                  >
                                  <td class="px-1">
                                    <label
                                      class="input input-sm input-ghost w-full min-w-40"
                                    >
                                      <input
                                        bind:value={r.nip}
                                        inputmode="numeric"
                                        maxlength={18}
                                        placeholder="18 digit"
                                        class="grow"
                                      />
                                      {#if active === "certificate"}
                                        <button
                                          type="button"
                                          class="btn btn-ghost btn-xs -mr-2"
                                          title="Periksa BSrE baris ini"
                                          disabled={bulkChecking || !r.nip}
                                          onclick={() => checkRowBsre(r)}
                                        >
                                          <iconify-icon
                                            icon="bx:search"
                                            class="text-xs"
                                          ></iconify-icon>
                                        </button>
                                      {/if}
                                    </label>
                                  </td>
                                  <td class="px-1">
                                    <input
                                      bind:value={r.name}
                                      placeholder="Nama lengkap"
                                      class="input input-sm input-ghost w-full min-w-40"
                                    />
                                  </td>
                                  <td class="px-1">
                                    <input
                                      bind:value={r.nik}
                                      inputmode="numeric"
                                      maxlength={16}
                                      placeholder="16 digit"
                                      class="input input-sm input-ghost w-full min-w-36"
                                    />
                                  </td>
                                  <td class="px-1">
                                    <input
                                      bind:value={r.email}
                                      type="email"
                                      readonly={active === "certificate"}
                                      placeholder="nama@mojokertokota.go.id"
                                      class="input input-sm input-ghost w-full min-w-48"
                                    />
                                  </td>
                                  <td class="px-1">
                                    <input
                                      bind:value={r.position}
                                      placeholder="Jabatan"
                                      class="input input-sm input-ghost w-full min-w-40"
                                    />
                                  </td>
                                  <td class="px-1 w-48">
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
                                  {#if active === "certificate"}
                                    <td class="px-1">
                                      {#if s}
                                        <span
                                          class="tooltip tooltip-bottom text-[11px] font-medium {s.color}"
                                          data-tip={bsreFullStatus(r)}
                                        >
                                          {s.label}
                                        </span>
                                      {:else if bulkChecking}
                                        <span
                                          class="loading loading-spinner loading-xs"
                                        ></span>
                                      {:else}
                                        <span class="text-[11px] opacity-30"
                                          >—</span
                                        >
                                      {/if}
                                    </td>
                                  {/if}
                                  <td class="px-1">
                                    <div
                                      class="flex items-center justify-center gap-1"
                                    >
                                      <label
                                        class="tooltip tooltip-left"
                                        data-tip={r.emailAccess
                                          ? "Email dinas dapat diakses"
                                          : "Akan dibuatkan tiket reset email"}
                                      >
                                        <input
                                          type="checkbox"
                                          class="toggle toggle-xs toggle-primary"
                                          bind:checked={r.emailAccess}
                                          aria-label="Akses email dinas"
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        class="btn btn-xs btn-ghost text-error"
                                        aria-label="Hapus baris"
                                        title="Hapus baris"
                                        onclick={() => removeRow(r.key)}
                                      >
                                        <iconify-icon
                                          icon="bx:trash"
                                          class="text-sm"
                                        ></iconify-icon>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              {:else}
                                <tr>
                                  <td
                                    colspan={active === "certificate" ? 9 : 8}
                                    class="text-center py-6 opacity-50"
                                  >
                                    Belum ada pemohon — klik
                                    <strong>Tambah Baris</strong> atau impor CSV.
                                  </td>
                                </tr>
                              {/each}
                            </tbody>
                          </table>
                        </div>
                        <p
                          class="p-3 text-[11px] opacity-50 border-t border-base-300 bg-base-200/20"
                        >
                          Wajib: nama dan salah satu dari NIP/NIK/email. Toggle
                          di kolom aksi menandai pemohon yang masih bisa
                          mengakses email dinas.
                        </p>
                      </div>
                    {:else if active === "certificate"}
                      <!-- Single certificate: BSrE verification -->
                      <div
                        class="rounded-2xl border border-accent/40 bg-accent/5 p-4 space-y-3"
                      >
                        <div class="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p
                              class="font-semibold text-sm flex items-center gap-1.5"
                            >
                              <iconify-icon
                                icon="bx:shield-quarter"
                                class="text-accent"
                              ></iconify-icon>
                              Verifikasi Data BSrE
                            </p>
                            <p class="text-[11px] opacity-60 mt-0.5">
                              Masukkan NIP (18 digit) atau NIK (16 digit) untuk
                              menentukan jenis layanan sertifikat secara
                              otomatis.
                            </p>
                          </div>
                          {#if certStep === 1}
                            <span class="badge badge-success badge-sm gap-1">
                              <iconify-icon
                                icon="bx:check-circle"
                              ></iconify-icon>
                              Terverifikasi
                            </span>
                          {/if}
                        </div>

                        <div class="grid sm:grid-cols-2 gap-3">
                          <label class="floating-label">
                            <span>NIP</span>
                            <input
                              type="text"
                              bind:value={identityNip}
                              inputmode="numeric"
                              maxlength={18}
                              placeholder="18 digit NIP"
                              disabled={certStep === 1}
                              class="input input-bordered w-full"
                            />
                          </label>
                          <label class="floating-label">
                            <span>NIK</span>
                            <input
                              type="text"
                              bind:value={identityNik}
                              inputmode="numeric"
                              maxlength={16}
                              placeholder="16 digit NIK"
                              disabled={certStep === 1}
                              class="input input-bordered w-full"
                            />
                          </label>
                        </div>

                        {#if checkError}
                          <div class="alert alert-error text-sm py-2">
                            <iconify-icon
                              icon="bx:error-circle"
                              class="text-lg"
                            ></iconify-icon>
                            {checkError}
                          </div>
                        {/if}

                        {#if certStep === 0}
                          <button
                            type="button"
                            class="btn btn-accent w-full sm:w-auto gap-2"
                            onclick={runIdentityCheck}
                            disabled={checking ||
                              (!identityNip.trim() && !identityNik.trim())}
                          >
                            {#if checking}
                              <span
                                class="loading loading-spinner loading-sm"
                              ></span>
                              Memeriksa...
                            {:else}
                              <iconify-icon
                                icon="bx:shield-quarter"
                              ></iconify-icon>
                              Periksa Data BSrE
                            {/if}
                          </button>
                        {:else if bsre}
                          {#if !bsre.found}
                            <div class="alert alert-info text-sm py-2.5">
                              <iconify-icon
                                icon="bx:info-circle"
                                class="text-lg"
                              ></iconify-icon>
                              <span>
                                Data belum terdaftar di BSrE — pengajuan Anda
                                akan diproses sebagai
                                <strong>registrasi sertifikat baru</strong>.
                              </span>
                            </div>
                          {:else}
                            <div
                              class="rounded-xl bg-base-100 border border-base-300 p-3 text-sm"
                            >
                              <div
                                class="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2"
                              >
                                <div>
                                  <p class="opacity-50 text-[11px]">Nama</p>
                                  <p class="font-medium truncate">
                                    {bsre.nama ?? "-"}
                                  </p>
                                </div>
                                <div>
                                  <p class="opacity-50 text-[11px]">Email</p>
                                  <p class="font-medium truncate">
                                    {bsre.emailAddress ?? "-"}
                                  </p>
                                </div>
                                <div>
                                  <p class="opacity-50 text-[11px]">
                                    Status Akun
                                  </p>
                                  <p class="font-medium">
                                    {bsre.status ?? "-"} ·
                                    {bsre.aktif ? "Aktif" : "Nonaktif"}
                                  </p>
                                </div>
                                <div>
                                  <p class="opacity-50 text-[11px]">
                                    Masa Berlaku
                                  </p>
                                  <p class="font-medium">
                                    {fmtCert(bsre.certStart)} s/d
                                    {fmtCert(bsre.certEnd)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          {/if}

                          {#if determination}
                            <div
                              class="alert alert-success text-sm py-2 flex-wrap"
                            >
                              <iconify-icon
                                icon="bx:check-double"
                                class="text-lg"
                              ></iconify-icon>
                              <span>
                                Jenis layanan ditentukan:
                                <strong>{DETERMINATION_LABELS[determination]}</strong>
                              </span>
                              <span class="badge badge-sm badge-outline ml-auto">
                                {serviceTypeLabel}
                              </span>
                            </div>
                          {/if}

                          <button
                            type="button"
                            class="btn btn-ghost btn-xs gap-1"
                            onclick={resetIdentityCheck}
                          >
                            <iconify-icon icon="bx:refresh"></iconify-icon>
                            Ubah data yang diperiksa
                          </button>
                        {:else}
                          <div class="alert alert-info text-sm py-2.5">
                            <iconify-icon
                              icon="bx:check-circle"
                              class="text-lg shrink-0"
                            ></iconify-icon>
                            <span>
                              Data BSrE sudah diverifikasi saat pengajuan
                              dibuat. Verifikasi ulang hanya diperlukan bila
                              NIP/NIK berubah.
                            </span>
                          </div>
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs gap-1"
                            onclick={resetIdentityCheck}
                          >
                            <iconify-icon icon="bx:refresh"></iconify-icon>
                            Verifikasi ulang
                          </button>
                        {/if}
                      </div>
                    {/if}

                    <!-- Applicant / signer identity -->
                    <div class="rounded-2xl border border-base-300 p-4 space-y-3">
                      <div>
                        <p class="text-sm font-semibold">
                          {mode === "bulk"
                            ? "Penanggung Jawab / Penandatangan"
                            : "Identitas Pemohon"}
                        </p>
                        <p class="text-[11px] opacity-50 mt-0.5">
                          {mode === "bulk"
                            ? "Pejabat ini menandatangani dokumen untuk seluruh pemohon pada daftar."
                            : "Data pemohon yang mengajukan layanan secara pribadi."}
                        </p>
                      </div>

                      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <label class="floating-label sm:col-span-2 lg:col-span-4">
                          <span>Nama Lengkap *</span>
                          <input
                            type="text"
                            bind:value={item.requesterName}
                            placeholder="Nama lengkap"
                            class="input input-bordered w-full"
                            required
                          />
                        </label>
                        <label class="floating-label">
                          <span>NIP</span>
                          <input
                            type="text"
                            bind:value={item.requesterNip}
                            inputmode="numeric"
                            maxlength={18}
                            placeholder="18 digit NIP"
                            class="input input-bordered w-full"
                          />
                        </label>
                        <label class="floating-label">
                          <span>NIK</span>
                          <input
                            type="text"
                            bind:value={item.requesterNik}
                            inputmode="numeric"
                            maxlength={16}
                            placeholder="16 digit NIK"
                            class="input input-bordered w-full"
                          />
                        </label>
                        <label class="floating-label lg:col-span-2">
                          <span>Nomor WhatsApp *</span>
                          <input
                            type="tel"
                            bind:value={item.requesterPhone}
                            placeholder="08xxxxxxxxxx"
                            class="input input-bordered w-full"
                            required
                          />
                        </label>
                      </div>
                      <p class="text-[11px] opacity-50">
                        Nomor WhatsApp dipakai untuk mengirim nomor tiket dan
                        pembaruan status.
                      </p>
                    </div>
                  </div>
                {:else if wizardStep === 1}
                  <!-- STEP 2 — request detail -->
                  <div class="space-y-5">
                    <div class="rounded-2xl border border-base-300 p-4 space-y-3">
                      <div>
                        <p class="text-sm font-semibold">Detail Permohonan</p>
                        <p class="text-[11px] opacity-50 mt-0.5">
                          Tuliskan kebutuhan Anda secara singkat dan jelas.
                        </p>
                      </div>

                      <label class="floating-label">
                        <span>Subjek Permohonan *</span>
                        <input
                          type="text"
                          bind:value={item.subject}
                          placeholder="Ringkasan permohonan"
                          class="input input-bordered w-full"
                          maxlength={120}
                          required
                        />
                      </label>

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
                        <span>Keterangan *</span>
                        <textarea
                          bind:value={item.description}
                          class="textarea textarea-bordered w-full min-h-28"
                          placeholder="Jelaskan kebutuhan Anda..."
                          maxlength={2000}
                          required
                        ></textarea>
                      </label>
                      <div class="flex justify-between text-[11px] opacity-50">
                        <span
                          >Minimal 10 karakter. Sertakan informasi yang
                          relevan.</span
                        >
                        <span>{item.description.trim().length}/2000</span>
                      </div>
                    </div>

                    <div class="rounded-2xl border border-base-300 p-4 space-y-3">
                      <div>
                        <p class="text-sm font-semibold">
                          Data Kepegawaian
                          <span class="font-normal opacity-50">(opsional)</span>
                        </p>
                        <p class="text-[11px] opacity-50 mt-0.5">
                          Membantu petugas mencocokkan data kepegawaian Anda.
                        </p>
                      </div>

                      <div class="grid sm:grid-cols-3 gap-3">
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
                    </div>

                    {#if active === "certificate" && mode !== "bulk"}
                      <fieldset
                        class="space-y-2 rounded-2xl border border-base-300 p-4"
                      >
                        <legend class="font-semibold text-sm px-1">
                          Apakah Anda masih dapat mengakses Email Dinas?
                        </legend>
                        <p class="text-[11px] opacity-50">
                          Jika tidak, proses sertifikat akan menunggu pembuatan
                          ulang email dinas Anda.
                        </p>
                        <div class="flex flex-wrap gap-4 pt-1">
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
                        {#if item.emailAccess === "no" && !documentId}
                          <div class="alert alert-warning text-sm mt-2">
                            <iconify-icon
                              icon="bx:info-circle"
                              class="text-lg shrink-0"
                            ></iconify-icon>
                            <span>
                              Anda perlu menandatangani dokumen permohonan
                              terlebih dahulu. Tanda tangan tersedia pada langkah
                              berikutnya.
                            </span>
                          </div>
                        {/if}
                      </fieldset>
                    {/if}
                  </div>
                {:else}
                  <!-- STEP 3 — review & submit -->
                  <div class="space-y-5">
                    <div
                      class="rounded-2xl border border-base-300 divide-y divide-base-300 overflow-hidden"
                    >
                      <div class="p-4 flex items-start justify-between gap-3">
                        <div>
                          <p class="text-[11px] opacity-50">Layanan</p>
                          <p class="font-semibold text-sm">
                            {serviceTypeLabel}
                          </p>
                          <p class="text-[11px] opacity-50 mt-0.5">
                            {serviceLabel}
                          </p>
                        </div>
                        <button
                          type="button"
                          class="btn btn-ghost btn-xs"
                          onclick={() => goToStep(0)}
                        >
                          Ubah
                        </button>
                      </div>

                      <div class="p-4 grid sm:grid-cols-2 gap-x-4 gap-y-3">
                        <div>
                          <p class="text-[11px] opacity-50">
                            {mode === "bulk"
                              ? "Penanggung Jawab"
                              : "Nama Pemohon"}
                          </p>
                          <p class="font-medium text-sm">
                            {item.requesterName || "—"}
                          </p>
                        </div>
                        <div>
                          <p class="text-[11px] opacity-50">WhatsApp</p>
                          <p class="font-medium text-sm">
                            {item.requesterPhone || "—"}
                          </p>
                        </div>
                        <div>
                          <p class="text-[11px] opacity-50">NIP / NIK</p>
                          <p class="font-medium text-sm">
                            {item.requesterNip || item.requesterNik || "—"}
                          </p>
                        </div>
                        <div>
                          <p class="text-[11px] opacity-50">Email</p>
                          <p class="font-medium text-sm break-all">
                            {item.requesterEmail || "—"}
                          </p>
                        </div>
                        <div>
                          <p class="text-[11px] opacity-50">Jabatan</p>
                          <p class="font-medium text-sm">
                            {item.requesterPosition || "—"}
                          </p>
                        </div>
                        <div>
                          <p class="text-[11px] opacity-50">
                            Pangkat / Organisasi
                          </p>
                          <p class="font-medium text-sm">
                            {item.requesterRank || "—"}
                            {#if signerOrganisasi}
                              · {signerOrganisasi}
                            {/if}
                          </p>
                        </div>
                      </div>

                      <div class="p-4">
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <p class="text-[11px] opacity-50">Subjek</p>
                            <p class="font-medium text-sm break-words">
                              {item.subject || "—"}
                            </p>
                          </div>
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs shrink-0"
                            onclick={() => goToStep(1)}
                          >
                            Ubah
                          </button>
                        </div>
                        <p class="text-[11px] opacity-50 mt-3">Keterangan</p>
                        <p
                          class="text-sm whitespace-pre-wrap break-words opacity-80"
                        >
                          {item.description || "—"}
                        </p>
                      </div>

                      <div class="p-4 flex items-start justify-between gap-3">
                        <div>
                          <p class="text-[11px] opacity-50">
                            Jenis Pendaftaran
                          </p>
                          <p class="font-medium text-sm">
                            {mode === "bulk"
                              ? `Kumulatif · ${filledRows.length} pemohon`
                              : "Mandiri"}
                          </p>
                          {#if mode === "bulk" && filledRows.length > 0}
                            <div class="flex flex-wrap gap-1 mt-2">
                              {#each filledRows.slice(0, 8) as r (r.key)}
                                <span class="badge badge-ghost badge-sm"
                                  >{r.name}</span
                                >
                              {/each}
                              {#if filledRows.length > 8}
                                <span class="badge badge-ghost badge-sm"
                                  >+{filledRows.length - 8} lainnya</span
                                >
                              {/if}
                            </div>
                          {/if}
                        </div>
                        <button
                          type="button"
                          class="btn btn-ghost btn-xs shrink-0"
                          onclick={() => goToStep(0)}
                        >
                          Ubah
                        </button>
                      </div>

                      {#if active === "certificate" && mode !== "bulk"}
                        <div class="p-4">
                          <p class="text-[11px] opacity-50">Akses Email Dinas</p>
                          <p class="font-medium text-sm">
                            {item.emailAccess === "yes"
                              ? "Masih dapat diakses"
                              : "Tidak dapat diakses"}
                          </p>
                        </div>
                      {/if}
                    </div>

                    {#if needsSignature}
                      {#if documentId}
                        <div
                          class="alert alert-success text-sm flex-col sm:flex-row items-start sm:items-center"
                        >
                          <iconify-icon
                            icon="bx:check-circle"
                            class="text-lg shrink-0"
                          ></iconify-icon>
                          <span>
                            Dokumen pengajuan telah ditandatangani (ID:
                            <span class="font-semibold">{documentId}</span>).
                          </span>
                        </div>
                      {:else}
                        <div
                          class="alert alert-warning text-sm flex-col sm:flex-row items-start sm:items-center gap-3"
                        >
                          <iconify-icon
                            icon="bx:pen"
                            class="text-lg shrink-0"
                          ></iconify-icon>
                          <div class="flex-1">
                            <p class="font-semibold">
                              Tanda Tangan Diperlukan
                            </p>
                            <p class="opacity-80">
                              Tanda tangani dokumen permohonan terlebih dahulu
                              sebelum mengirim tiket.
                            </p>
                          </div>
                          <button
                            type="button"
                            class="btn btn-sm btn-warning shrink-0 gap-1.5"
                            onclick={goToSign}
                          >
                            <iconify-icon icon="bx:pen"></iconify-icon>
                            Tanda Tangan Sekarang
                          </button>
                        </div>
                      {/if}
                    {:else if isEditing}
                      <div class="alert alert-info text-sm">
                        <iconify-icon
                          icon="bx:info-circle"
                          class="text-lg shrink-0"
                        ></iconify-icon>
                        <span>
                          Perubahan data tidak memerlukan tanda tangan ulang.
                          Dokumen pengajuan yang sudah Anda tandatangani tetap
                          digunakan.
                        </span>
                      </div>
                    {:else}
                      <div class="alert alert-info text-sm">
                        <iconify-icon
                          icon="bx:info-circle"
                          class="text-lg shrink-0"
                        ></iconify-icon>
                        <span>{noSignatureMessage}</span>
                      </div>
                    {/if}

                    {#if wizardError}
                      <div class="alert alert-error text-sm py-2.5">
                        <iconify-icon
                          icon="bx:error-circle"
                          class="text-lg"
                        ></iconify-icon>
                        {wizardError}
                      </div>
                    {/if}

                    <div
                      class="rounded-2xl bg-base-200/50 p-4 text-xs opacity-70 flex items-start gap-2"
                    >
                      <iconify-icon
                        icon="bx:message-dots"
                        class="text-base shrink-0"
                      ></iconify-icon>
                      <span>
                        Setelah dikirim Anda akan menerima nomor tiket. Simpan
                        nomor tersebut atau gunakan WhatsApp yang sama untuk
                        memantau progres.
                      </span>
                    </div>
                  </div>
                {/if}
              </div>
            {/key}

            {#if navError}
              <div class="alert alert-warning text-sm py-2 mt-4">
                <iconify-icon
                  icon="bx:error-circle"
                  class="text-lg shrink-0"
                ></iconify-icon>
                {navError}
              </div>
            {/if}

            <div
              class="mt-5 pt-4 border-t border-base-300 flex flex-wrap items-center justify-between gap-2"
            >
              <button
                type="button"
                class="btn btn-ghost gap-1"
                onclick={goBack}
                disabled={submitting}
              >
                <iconify-icon icon="bx:arrow-back"></iconify-icon>
                {wizardStep === 0
                  ? isEditing
                    ? "Tiket"
                    : "Layanan"
                  : "Kembali"}
              </button>

              {#if wizardStep < 2}
                <button
                  type="button"
                  class="btn btn-primary gap-1.5"
                  onclick={goNext}
                >
                  Lanjut
                  <iconify-icon icon="bx:right-arrow-alt"></iconify-icon>
                </button>
              {:else}
                <button
                  type="submit"
                  class="btn btn-primary gap-1.5"
                  disabled={!canSubmit || submitting}
                >
                  {#if submitting}
                    <span class="loading loading-spinner loading-sm"></span>
                    {isEditing ? "Menyimpan..." : "Mengirim..."}
                  {:else}
                    <iconify-icon
                      icon={isEditing ? "bx:save" : "bx:send"}
                    ></iconify-icon>
                    {isEditing ? "Simpan Perubahan" : "Kirim Pengajuan"}
                  {/if}
                </button>
              {/if}
            </div>

            {#if wizardStep === 2 && !canSubmit}
              <p class="text-[11px] text-warning text-right mt-2">
                {stepThreeHint || stepTwoHint || stepOneHint}
              </p>
            {/if}
          </form>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- CSV IMPORT MODAL -->
<Modal title="Impor Data Pemohon" size="xl" bind:data={importOpen}>
  {#snippet children(_)}
    <div class="space-y-3">
      <div class="alert alert-info text-xs flex items-start gap-2">
        <iconify-icon icon="bx:info-circle" class="shrink-0 text-lg"
        ></iconify-icon>
        <div>
          <p>
            Format per baris (urutan kolom tetap), pisahkan dengan koma / titik
            koma / tab:
          </p>
          <code class="block mt-1 px-2 py-1 rounded bg-base-200 text-xs">
            Nama, NIK, NIP, Email, Jabatan, Pangkat
          </code>
          <p class="mt-1 opacity-80">
            Contoh:
            <code class="bg-base-200 px-1 rounded break-all"
              >Budi
              Santoso,3576xxxxxxxxxxxx,1991xxxxxxxxxxxxxx,budi.santoso@mojokertokota.go.id,Kepala
              Dinas,III/b</code
            >
          </p>
          <p class="mt-1">
            Pilih berkas CSV/TXT atau tempel data pada kolom di bawah, lalu tekan
            <strong>Pratinjau</strong>.
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <label class="btn btn-sm btn-outline cursor-pointer">
          <iconify-icon icon="bx:upload"></iconify-icon>
          Pilih File
          <input
            type="file"
            accept=".csv,.txt"
            class="hidden"
            onchange={parseCsvFile}
          />
        </label>
        <button
          type="button"
          class="btn btn-sm btn-outline"
          onclick={previewCsv}
          disabled={!csvText.trim()}
        >
          <iconify-icon icon="bx:search-alt"></iconify-icon>
          Pratinjau
        </button>
      </div>

      <textarea
        bind:value={csvText}
        class="textarea textarea-bordered w-full font-mono text-xs min-h-28"
        placeholder="Tempel data di sini&#10;Budi Santoso,3576xxxxxxxxxxxx,1991xxxxxxxxxxxxxx,budi@mojokertokota.go.id,Kepala Dinas,III/b"
      ></textarea>

      {#if importPreview}
        <div>
          <p class="font-semibold text-sm mb-1">
            Pratinjau ({importPreview.length} baris)
          </p>
          <div class="rounded-xl border border-base-300">
            <table class="table table-sm">
              <thead class="sticky top-0 z-10 bg-base-200">
                <tr>
                  <th class="w-8">#</th>
                  <th>Nama</th>
                  <th>NIK</th>
                  <th>NIP</th>
                  <th>Email</th>
                  <th>Jabatan</th>
                  <th>Pangkat</th>
                </tr>
              </thead>
              <tbody>
                {#each importPreview as r, i (r.key)}
                  <tr>
                    <td class="opacity-50">{i + 1}</td>
                    <td class="min-w-36">{r.name || "—"}</td>
                    <td class="min-w-32">{r.nik || "—"}</td>
                    <td class="min-w-32">{r.nip || "—"}</td>
                    <td class="min-w-40 break-all">{r.email || "—"}</td>
                    <td class="min-w-32">{r.position || "—"}</td>
                    <td class="min-w-16">{r.rank || "—"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if importPreview.length === 0}
            <div class="alert alert-warning text-xs mt-1">
              Tidak ada baris valid pada data tersebut.
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/snippet}
  {#snippet action(_)}
    <div class="flex justify-end gap-2 w-full">
      <button
        type="button"
        class="btn btn-ghost"
        onclick={() => (importOpen = false)}
      >
        Batal
      </button>
      <button
        type="button"
        class="btn btn-primary"
        onclick={confirmImport}
        disabled={!importPreview || importPreview.length === 0}
      >
        <iconify-icon icon="bx:import"></iconify-icon>
        Impor {importPreview?.length ?? 0} baris
      </button>
    </div>
  {/snippet}
</Modal>

<!-- Inline signing workspace (iframe) -->
<Modal
  bind:data={signOpen}
  title="Tanda Tangan Dokumen Pengajuan"
  size="xl"
>
  {#snippet children(_)}
    <div
      class="w-full h-[80vh] rounded-lg overflow-hidden border border-base-300 bg-base-100"
    >
      {#if signSrc}
        <iframe
          src={signSrc}
          title="Tanda Tangan Dokumen Pengajuan"
          class="w-full h-full border-0"
          allow="clipboard-write"
        ></iframe>
      {/if}
    </div>
    <p class="text-xs opacity-60 mt-2">
      Setelah semua dokumen ditandatangani, jendela ini menutup otomatis dan
      status tanda tangan tersimpan pada pengajuan.
    </p>
  {/snippet}
</Modal>
