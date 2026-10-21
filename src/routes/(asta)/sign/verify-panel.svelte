<script lang="ts">
  import { onMount } from "svelte";
  import {
    getSignatures,
    verifySignatures,
    type SignatureInfo,
    type SignatureVerification,
  } from "$lib/utils/pdf";
  import { createId, fileToBase64 } from "$lib/utils";
  import { createZip } from "$lib/utils/zip";
  import { createXlsx, type CellValue } from "$lib/utils/xlsx";
  import Preview from "$lib/components/preview.svelte";
  import { verifyDocument } from "$lib/remotes/sign.remote";
  import type {
    SignatureInformation,
    SignatureVerificationResponse,
    VerifyDate,
  } from "../verify/types";

  let {
    seed = [],
    auto = true,
    hideUpload = false,
    onOnline,
    onBusy,
  }: {
    seed?: File[];
    /** Run the server check automatically for a single document. Off when the
     *  panel was opened just to read the details. */
    auto?: boolean;
    /** Opened from the sign result — the set is fixed, so no upload affordance. */
    hideUpload?: boolean;
    /** Reports a completed server check so the parent can surface it in the
     *  document status dropdown. */
    onOnline?: (file: File, result: SignatureVerificationResponse) => void;
    /** Reports whether any file is still being checked. */
    onBusy?: (busy: boolean) => void;
  } = $props();

  type Item = {
    id: string;
    file: File;
    localLoading: boolean;
    onlineLoading: boolean;
    signatures?: SignatureInfo[];
    verifications?: SignatureVerification[];
    online?: SignatureVerificationResponse;
    localError?: string;
    onlineError?: string;
  };

  /** One row per signature, combining the local parse with the server check. */
  type Merged = {
    key: string;
    local?: SignatureInfo;
    verif?: SignatureVerification;
    online?: SignatureInformation;
  };

  function toItem(file: File): Item {
    return {
      id: createId(10),
      file,
      localLoading: false,
      onlineLoading: false,
    };
  }

  let items = $state<Item[]>(seed.map(toItem));
  let selected = $state<Record<string, boolean>>(
    Object.fromEntries(items.map((item) => [item.id, true])),
  );
  let fileInput: HTMLInputElement | null = $state(null);
  let activeId = $state(items[0]?.id ?? "");

  const activeFile = $derived(
    items.find((item) => item.id === activeId)?.file ?? null,
  );

  const selectedItems = $derived(items.filter((item) => selected[item.id]));
  const allSelected = $derived(
    items.length > 0 && items.every((item) => selected[item.id]),
  );
  const verifyingAll = $derived(items.some((item) => item.onlineLoading));

  const norm = (value?: string) => (value ?? "").trim().toLowerCase();

  function views(item: Item): Merged[] {
    const list: Merged[] = (item.signatures ?? []).map((signature, i) => ({
      key: `local-${signature.fieldName ?? signature.name}-${i}`,
      local: signature,
      verif: item.verifications?.find(
        (v) => norm(v.fieldName) === norm(signature.fieldName),
      ),
    }));
    for (const verif of item.verifications ?? []) {
      if (!list.some((entry) => entry.verif === verif)) {
        list.push({ key: `verif-${verif.fieldName}`, verif });
      }
    }
    for (const online of item.online?.signatureInformations ?? []) {
      const match = list.find(
        (entry) =>
          norm(entry.local?.fieldName) === norm(online.fieldName) ||
          (!entry.local?.fieldName &&
            norm(entry.local?.name) === norm(online.signerName)),
      );
      if (match) match.online = online;
      else list.push({ key: `online-${online.id || online.fieldName}`, online });
    }
    return list;
  }

  const isPdf = (file: File) =>
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  /** Offline read: pull the signature dictionaries out of the PDF itself. */
  async function readLocal(item: Item) {
    item.localLoading = true;
    item.localError = undefined;
    try {
      const bytes = await item.file.arrayBuffer();
      const [signatures, verifications] = await Promise.all([
        getSignatures(bytes),
        verifySignatures(bytes),
      ]);
      item.signatures = signatures;
      item.verifications = verifications;
    } catch (err) {
      item.localError =
        err instanceof Error ? err.message : "Gagal membaca tanda tangan.";
    } finally {
      item.localLoading = false;
    }
  }

  /** Online read: hand the PDF to the BSrE/BSSN verification service. */
  async function readOnline(item: Item) {
    item.onlineLoading = true;
    item.onlineError = undefined;
    try {
      const base64 = await fileToBase64(item.file);
      const raw: unknown = await verifyDocument({
        file: base64.replace("data:application/pdf;base64,", ""),
      });
      const response = raw as
        | (Partial<SignatureVerificationResponse> & { error?: string })
        | undefined;
      if (!response || typeof response.conclusion !== "string") {
        item.onlineError =
          response?.error || "Verifikasi tidak dapat dijalankan.";
        return;
      }
      item.online = response as SignatureVerificationResponse;
      onOnline?.(item.file, item.online);
    } catch (err) {
      item.onlineError =
        err instanceof Error ? err.message : "Verifikasi tidak dapat dijalankan.";
    } finally {
      item.onlineLoading = false;
    }
  }

  /** Local read always runs; the server check is automatic for a lone file. */
  async function runChecks(list: Item[], withServer: boolean) {
    await Promise.all(
      list.flatMap((item) => [
        readLocal(item),
        ...(withServer ? [readOnline(item)] : []),
      ]),
    );
  }

  async function addFiles(list: FileList | File[]) {
    const picked = [...list].filter(isPdf);
    if (picked.length === 0) return;
    const added = picked.map(toItem);
    items = [...items, ...added];
    for (const item of added) selected[item.id] = true;
    if (!items.some((item) => item.id === activeId)) activeId = added[0].id;
    // A batch stays local so adding ten files is instant; a single document is
    // also worth the round-trip to the verification service right away.
    await runChecks(added, auto && items.length === 1);
  }

  function onChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const picked = target.files ? [...target.files] : [];
    target.value = "";
    if (picked.length > 0) void addFiles(picked);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer?.files) void addFiles(event.dataTransfer.files);
  }

  function removeItem(item: Item) {
    items = items.filter((it) => it.id !== item.id);
    const next = { ...selected };
    delete next[item.id];
    selected = next;
    if (activeId === item.id) activeId = items[0]?.id ?? "";
  }

  function toggleAll() {
    const value = !allSelected;
    const next: Record<string, boolean> = {};
    for (const item of items) next[item.id] = value;
    selected = next;
  }

  async function verifyAll() {
    await Promise.all(
      selectedItems
        .filter((item) => !item.onlineLoading)
        .map((item) => readOnline(item)),
    );
  }

  function saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadItem(item: Item) {
    saveBlob(item.file, item.file.name);
  }

  async function downloadSelected() {
    const chosen = selectedItems;
    if (chosen.length === 0) return;
    if (chosen.length === 1) {
      downloadItem(chosen[0]);
      return;
    }
    try {
      const used = new Set<string>();
      const entries = [];
      for (const item of chosen) {
        const base = item.file.name.replace(/\.pdf$/i, "");
        let name = `${base}.pdf`;
        let n = 2;
        while (used.has(name.toLowerCase())) name = `${base} (${n++}).pdf`;
        used.add(name.toLowerCase());
        entries.push({
          name,
          data: new Uint8Array(await item.file.arrayBuffer()),
        });
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      saveBlob(createZip(entries), `verifikasi-${stamp}.zip`);
    } catch (err) {
      console.error("[verify] zip failed", err);
    }
  }

  /** Export the verification metadata (one row per signature) as .xlsx. */
  function exportMetadata() {
    const chosen = selectedItems;
    if (chosen.length === 0) return;

    const header: CellValue[] = [
      "File",
      "Sumber",
      "Field",
      "Penandatangan",
      "Penerbit",
      "Berlaku Dari",
      "Berlaku Sampai",
      "Waktu Tanda Tangan",
      "Alasan",
      "Lokasi",
      "Integritas",
      "Rantai Sertifikat",
      "Terpercaya",
      "LTV",
      "Timestamp",
      "Otoritas Timestamp",
      "Format",
      "Algoritma Digest",
      "Algoritma Tanda Tangan",
      "Diubah Setelah Ditandatangani",
      "Level Sertifikat",
      "Kesimpulan BSrE",
      "Keterangan BSrE",
      "Catatan",
    ];
    const rows: CellValue[][] = [header];

    for (const item of chosen) {
      const online = item.online;
      const list = views(item);
      const base = {
        file: item.file.name,
        conclusion: online?.conclusion,
        description: online?.description,
      };

      if (list.length === 0) {
        rows.push([
          base.file,
          online ? "BSrE" : "Lokal",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          base.conclusion,
          base.description,
          item.localError ?? item.onlineError ?? "",
        ]);
        continue;
      }

      for (const view of list) {
        const source =
          view.verif && view.online
            ? "Lokal + BSrE"
            : view.online
              ? "BSrE"
              : "Lokal";
        const integrity =
          view.verif?.integrityValid ?? view.online?.integrityValid;
        const trusted =
          view.verif?.certificateTrusted ?? view.online?.certificateTrusted;
        const ltv = view.verif?.ltv ?? view.online?.ltv;
        const timestamped =
          view.verif?.timestamped ?? !!view.online?.timestampInfomation?.id;
        const authority = view.online?.timestampInfomation
          ? `${view.online.timestampInfomation.signerName} · ${formatDate(
              view.online.timestampInfomation.timestampDate,
            )}`
          : (view.verif?.signingTime ?? "");

        rows.push([
          base.file,
          source,
          view.online?.fieldName ?? view.local?.fieldName ?? "",
          signerName(view),
          view.local?.issuerName ??
            view.online?.certificateDetails?.[0]?.issuerName ??
            "",
          startDate(view),
          endDate(view),
          view.local?.date ?? formatDate(view.online?.signatureDate),
          view.local?.reason ?? view.online?.reason ?? "",
          view.local?.location ?? view.online?.location ?? "",
          integrity === undefined ? "" : integrity ? "Valid" : "Invalid",
          view.verif ? (view.verif.chainValid ? "Lengkap" : "Terputus") : "",
          trusted === undefined ? "" : trusted ? "Ya" : "Tidak",
          ltv === undefined ? "" : ltv ? "Ya" : "Tidak",
          timestamped ? "Ya" : "Tidak",
          authority,
          view.online?.signatureFormat ?? view.local?.subFilter ?? "",
          view.verif?.digestAlgorithm ?? view.online?.digestAlgorithm ?? "",
          view.verif?.signatureAlgorithm ??
            view.online?.signatureAlgorithm ??
            "",
          view.online?.modified === undefined
            ? ""
            : view.online.modified
              ? "Ya"
              : "Tidak",
          view.online?.certLevelCode ?? "",
          base.conclusion ?? "",
          base.description ?? "",
          view.verif?.error ?? "",
        ]);
      }
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    saveBlob(
      createXlsx(rows, "Hasil Verifikasi"),
      `hasil-verifikasi-${stamp}.xlsx`,
    );
  }

  function formatDate(value?: VerifyDate | null) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("id-ID");
  }

  function startDate(view: Merged) {
    const cert = view.online?.certificateDetails?.[0];
    return view.local?.signerValidFrom ?? (cert ? formatDate(cert.notBeforeDate) : "-");
  }

  function endDate(view: Merged) {
    const cert = view.online?.certificateDetails?.[0];
    return view.local?.signerValidTo ?? (cert ? formatDate(cert.notAfterDate) : "-");
  }

  function signerName(view: Merged) {
    return view.online?.signerName || view.local?.name || "Tanda tangan";
  }

  function method(view: Merged) {
    if (view.local?.subFilter) {
      return `${view.local.filter ? `${view.local.filter} · ` : ""}${view.local.subFilter}`;
    }
    return view.online?.signatureFormat;
  }

  $effect(() => {
    onBusy?.(items.some((item) => item.localLoading || item.onlineLoading));
  });

  onMount(() => {
    if (items.length === 0) return;
    void runChecks([...items], auto && items.length === 1);
  });
</script>

<div class="flex flex-col gap-3">
  <input
    type="file"
    accept="application/pdf"
    multiple
    hidden
    bind:this={fileInput}
    onchange={onChange}
  />

  {#if !hideUpload}
    <button
      type="button"
      class="flex items-center justify-center gap-2 border-2 border-dashed border-base-300 rounded-xl py-4 cursor-pointer hover:border-primary hover:bg-base-200 transition-colors"
      ondragover={(e) => e.preventDefault()}
      ondrop={onDrop}
      onclick={() => fileInput?.click()}
    >
      <iconify-icon icon="bx:upload" class="text-xl text-primary"></iconify-icon>
      <span class="text-sm">Geser atau klik untuk menambah PDF</span>
    </button>
  {/if}

  {#if items.length === 0}
    <p class="text-sm opacity-60 text-center py-6">
      Belum ada dokumen untuk diverifikasi.
    </p>
  {:else}
    <div class="flex items-center gap-2 flex-wrap px-1">
      <label class="flex items-center gap-1.5 text-xs cursor-pointer">
        <input
          type="checkbox"
          class="checkbox checkbox-xs"
          checked={allSelected}
          onchange={toggleAll}
        />
        Pilih semua
      </label>
      <span class="text-xs opacity-60">{items.length} dokumen</span>
      <div class="ml-auto flex items-center gap-1">
        <button
          type="button"
          class="btn btn-xs btn-primary"
          disabled={verifyingAll || selectedItems.length === 0}
          onclick={verifyAll}
        >
          {#if verifyingAll}
            <span class="loading loading-spinner loading-xs"></span>
          {:else}
            <iconify-icon icon="bx:check-shield"></iconify-icon>
          {/if}
          Verifikasi BSrE ({selectedItems.length})
        </button>
        <button
          type="button"
          class="btn btn-xs btn-info"
          disabled={selectedItems.length === 0}
          title="Ekspor metadata hasil verifikasi ke Excel"
          onclick={exportMetadata}
        >
          <iconify-icon icon="bx:spreadsheet"></iconify-icon>
          Excel
        </button>
        <button
          type="button"
          class="btn btn-xs btn-secondary"
          disabled={selectedItems.length === 0}
          title="Unduh terpilih (ZIP bila lebih dari satu)"
          onclick={downloadSelected}
        >
          <iconify-icon icon="bx:download"></iconify-icon>
          Unduh ({selectedItems.length})
        </button>
      </div>
    </div>

    <div class="grid gap-3 lg:grid-cols-2 items-start">
      <div class="flex flex-col gap-2 max-h-[45vh] lg:max-h-[60vh] overflow-y-auto pr-1 order-2 lg:order-1">
      {#each items as item (item.id)}
        {@const list = views(item)}
        {@const conclusion = item.online?.conclusion}
        {@const invalid = conclusion != null && conclusion !== "VALID"}
        {@const verifs = item.verifications ?? []}
        {@const localInvalid = verifs.some((v) => !v.integrityValid)}
        {@const localUntrusted = verifs.some((v) => !v.certificateTrusted)}
        {@const summary = item.online?.description
          ? item.online.description
          : verifs.length === 0
            ? undefined
            : localInvalid
              ? "Dokumen tidak valid, tanda tangan tidak terintegritas"
              : localUntrusted
                ? "Dokumen valid, Sertifikat yang digunakan tidak terpercaya"
                : "Dokumen valid, Sertifikat yang digunakan terpercaya"}
        <div
          class="card card-border bg-base-100 cursor-pointer {activeId === item.id
            ? 'ring-1 ring-primary'
            : ''}"
          onclick={() => (activeId = item.id)}
        >
          <div class="card-body p-3 gap-2">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  class="checkbox checkbox-xs shrink-0"
                  aria-label={`Pilih ${item.file.name}`}
                  bind:checked={selected[item.id]}
                />
                <iconify-icon
                  icon="bx:file"
                  class="text-lg shrink-0 opacity-60"
                ></iconify-icon>
                <div class="min-w-0">
                  <div
                    class="text-sm font-medium truncate"
                    title={item.file.name}
                  >
                    {item.file.name}
                  </div>
                  <div class="text-[11px] opacity-60">
                    {Math.round(item.file.size / 1024)} KB
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                {#if item.signatures}
                  <span class="badge badge-sm badge-ghost font-mono">
                    {item.signatures.length}
                  </span>
                {/if}
                {#if conclusion}
                  <span
                    class="badge badge-sm {invalid
                      ? 'badge-error'
                      : 'badge-success'}"
                    title={item.online?.description}
                  >
                    {conclusion}
                  </span>
                {/if}
                <button
                  type="button"
                  class="btn btn-xs btn-ghost btn-circle"
                  title="Unduh dokumen"
                  onclick={() => downloadItem(item)}
                >
                  <iconify-icon icon="bx:download"></iconify-icon>
                </button>
                <button
                  type="button"
                  class="btn btn-xs btn-ghost btn-circle"
                  title="Hapus dari daftar"
                  onclick={() => removeItem(item)}
                >
                  <iconify-icon icon="bx:x"></iconify-icon>
                </button>
              </div>
            </div>

            {#if summary}
              <p class="text-[11px] opacity-70 -mt-1">{summary}</p>
            {/if}

            {#if item.localError}
              <div class="alert alert-error alert-sm">
                <span class="text-xs">{item.localError}</span>
              </div>
            {/if}
            {#if item.onlineError}
              <div class="alert alert-error alert-sm">
                <span class="text-xs">{item.onlineError}</span>
              </div>
            {/if}
            {#each item.verifications ?? [] as verif (verif.fieldName)}
              {#if verif.error}
                <div class="alert alert-warning alert-sm">
                  <span class="text-xs">{verif.fieldName}: {verif.error}</span>
                </div>
              {/if}
            {/each}

            {#if item.localLoading && list.length === 0}
              <div class="flex items-center gap-2 text-xs opacity-70 py-2">
                <span class="loading loading-spinner loading-xs"></span>
                Membaca tanda tangan…
              </div>
            {:else if list.length === 0}
              <p class="text-xs opacity-60">
                Tidak ada tanda tangan yang terdeteksi pada dokumen ini.
              </p>
            {:else}
              <ul class="flex flex-col gap-1">
                {#each list as view (view.key)}
                  <li class="collapse collapse-arrow rounded-lg bg-base-200">
                    <input type="checkbox" />
                    <div
                      class="collapse-title flex items-center gap-1 flex-wrap p-2 pr-9 min-h-0"
                    >
                      <iconify-icon
                        icon="bx:check-shield"
                        class="text-base-content/70"
                      ></iconify-icon>
                      <span class="text-xs font-medium">{signerName(view)}</span>
                      {#if view.online}
                        <span class="badge badge-xs badge-info">BSrE</span>
                      {/if}
                      {#if view.verif}
                        <span
                          class="badge badge-xs {view.verif.integrityValid
                            ? 'badge-success'
                            : 'badge-error'}"
                          title="Verifikasi lokal (CMS)"
                        >
                          {view.verif.integrityValid ? "Valid" : "Invalid"}
                        </span>
                        <span
                          class="badge badge-xs {view.verif.certificateTrusted
                            ? 'badge-success'
                            : 'badge-warning'}"
                          title="Rantai sertifikat"
                        >
                          {view.verif.certificateTrusted
                            ? "Terpercaya"
                            : "Tidak Terpercaya"}
                        </span>
                        {#if !view.verif.chainValid}
                          <span class="badge badge-xs badge-warning">
                            Rantai Terputus
                          </span>
                        {/if}
                      {:else if view.online}
                        <span
                          class="badge badge-xs {view.online.integrityValid
                            ? 'badge-success'
                            : 'badge-error'}"
                        >
                          {view.online.integrityValid ? "Valid" : "Invalid"}
                        </span>
                      {:else}
                        <span class="badge badge-xs badge-ghost">Lokal</span>
                      {/if}
                      {#if view.verif?.ltv || view.online?.ltv}
                        <span
                          class="badge badge-xs badge-accent"
                          title="Data validasi jangka panjang (DSS/VRI) tersedia"
                        >
                          LTV
                        </span>
                      {/if}
                      {#if view.verif?.timestamped ||
                        view.online?.timestampInfomation?.id}
                        <span
                          class="badge badge-xs badge-info"
                          title="Tanda tangan memiliki timestamp"
                        >
                          Timestamp
                        </span>
                      {/if}
                      {#if view.online?.modified}
                        <span class="badge badge-xs badge-warning">Diubah</span>
                      {/if}
                    </div>

                    <div class="collapse-content px-2 pb-2 pt-0">
                    <dl class="flex flex-col gap-0.5 text-[11px]">
                      {#if view.online?.fieldName || view.local?.fieldName}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Field</dt>
                          <dd class="opacity-80 break-all">
                            {view.online?.fieldName ?? view.local?.fieldName}
                          </dd>
                        </div>
                      {/if}
                      {#if view.local?.subjectName}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Subject</dt>
                          <dd class="opacity-80 break-all">
                            {view.local.subjectName}
                          </dd>
                        </div>
                      {/if}
                      {#if view.local?.signerOrg}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Instansi</dt>
                          <dd class="opacity-80 break-all">
                            {view.local.signerOrg}
                          </dd>
                        </div>
                      {/if}
                      {#if view.local?.signerEmail}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Email</dt>
                          <dd class="opacity-80 break-all">
                            {view.local.signerEmail}
                          </dd>
                        </div>
                      {/if}
                      {#if view.local?.date || view.online?.signatureDate}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Waktu</dt>
                          <dd class="opacity-80">
                            {view.local?.date ??
                              formatDate(view.online?.signatureDate)}
                          </dd>
                        </div>
                      {/if}
                      {#if view.local?.reason || view.online?.reason}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Alasan</dt>
                          <dd class="opacity-80">
                            {view.local?.reason ?? view.online?.reason}
                          </dd>
                        </div>
                      {/if}
                      {#if view.local?.location || view.online?.location}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Lokasi</dt>
                          <dd class="opacity-80">
                            {view.local?.location ?? view.online?.location}
                          </dd>
                        </div>
                      {/if}
                      {#if view.local?.contactInfo}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Kontak</dt>
                          <dd class="opacity-80 break-all">
                            {view.local.contactInfo}
                          </dd>
                        </div>
                      {/if}
                      {#if view.local?.issuerName || view.online?.certificateDetails?.[0]?.issuerName}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Penerbit</dt>
                          <dd class="opacity-80 break-all">
                            {view.local?.issuerName ??
                              view.online?.certificateDetails?.[0]?.issuerName}
                          </dd>
                        </div>
                      {/if}
                      {#if view.local?.signerValidFrom || view.online?.certificateDetails?.[0]}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Berlaku</dt>
                          <dd class="opacity-80 break-all">
                            {startDate(view)} — {endDate(view)}
                          </dd>
                        </div>
                      {/if}
                      {#if method(view)}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Metode</dt>
                          <dd class="opacity-80 break-all">{method(view)}</dd>
                        </div>
                      {/if}
                      {#if view.online?.timestampInfomation}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Timestamp</dt>
                          <dd class="opacity-80 break-all">
                            {view.online.timestampInfomation.signerName} · {formatDate(
                              view.online.timestampInfomation.timestampDate,
                            )}
                          </dd>
                        </div>
                      {/if}
                      {#if view.online?.digestAlgorithm || view.online?.signatureAlgorithm}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">Algoritma</dt>
                          <dd class="opacity-80 break-all">
                            {view.online.signatureAlgorithm ?? "-"} · {view.online
                              .digestAlgorithm ?? "-"}
                          </dd>
                        </div>
                      {/if}
                      {#each view.online?.certificateDetails ?? [] as cert, ci (cert.id)}
                        <div class="flex gap-1">
                          <dt class="opacity-50 w-16 shrink-0">
                            {ci === 0 ? "Sertifikat" : "CA"}
                          </dt>
                          <dd class="opacity-80 break-all">
                            {cert.commonName} · {formatDate(cert.notBeforeDate)} —
                            {formatDate(cert.notAfterDate)}
                          </dd>
                        </div>
                      {/each}
                    </dl>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      {/each}
      </div>

      <div
        class="order-1 lg:order-2 lg:sticky lg:top-0 h-[32vh] lg:h-[60vh] rounded-xl border border-base-300 overflow-hidden bg-base-200"
      >
        {#if activeFile}
          <Preview file={activeFile} controls={false} bare />
        {:else}
          <div class="h-full flex items-center justify-center text-xs opacity-60">
            Pilih dokumen untuk melihat pratinjau.
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
