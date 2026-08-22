<script lang="ts">
  import { page } from "$app/state";
  import {
    getTicket,
    addComment,
    uploadAttachment,
  } from "$lib/remotes/helpdesk.remote";
  import {
    STATUS_LABELS,
    STAGE_LABELS,
    SERVICE_TYPE_LABELS,
    stageFlow,
  } from "$lib/app/helpdesk";
  import { Modal, Preview } from "$lib/components";

  const id = page.params.id as string;

  const ticketQuery = getTicket({ id });
  const data = $derived(ticketQuery.current);

  let message = $state("");
  let sending = $state(false);

  const statusBadge: Record<string, string> = {
    open: "badge-info",
    processing: "badge-primary",
    waiting_user: "badge-warning",
    completed: "badge-success",
    cancelled: "badge-ghost",
    rejected: "badge-error",
  };

  const flow = $derived(data ? stageFlow(data.serviceType) : []);
  const currentStep = $derived(
    data ? Math.max(0, flow.indexOf(data.stage as any)) : 0,
  );

  const isClosed = $derived(
    data
      ? ["completed", "cancelled", "rejected"].includes(data.status ?? "")
      : false,
  );

  const cantAccessEmail = $derived(
    data?.service === "certificate" &&
      data.description?.includes("Email Dinas tidak dapat diakses"),
  );

  async function send() {
    if (!message.trim() || sending) return;
    sending = true;
    try {
      await addComment({ ticketId: id, message });
      message = "";
      await ticketQuery.refresh();
    } finally {
      sending = false;
    }
  }

  // attachment upload
  let uploading = $state(false);
  let uploadError = $state("");
  let fileInput: HTMLInputElement | null = $state(null);

  async function onFileChosen(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || uploading) return;

    uploadError = "";
    uploading = true;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      await uploadAttachment({
        ticketId: id,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileBase64: btoa(binary),
      });
      await ticketQuery.refresh();
    } catch (err: any) {
      uploadError =
        err?.body?.message || err?.message || "Gagal mengunggah lampiran.";
    } finally {
      uploading = false;
    }
  }

  function fmtDate(v?: string | null) {
    if (!v) return "-";
    return new Date(v).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const eventIcons: Record<string, string> = {
    ticket_created: "bx:plus-circle",
    comment_created: "bx:comment-detail",
    status_changed: "bx:refresh",
    stage_changed: "bx:git-commit",
    attachment_uploaded: "bx:paperclip",
    survey_submitted: "bx:star",
    whatsapp_sent: "bx:message",
  };

  // Preview Modal
  const forms: Record<string, any> = $state({});
  let previewFile = $state<File | null>(null);
  let previewLoading = $state(false);
  let previewFileName = $state("");
  let previewDownloadUrl = $state("");
  let previewUrl = $state("");
  let previewError = $state("");

  async function openPreview(url?: string) {
    forms.preview = true;
    previewLoading = true;
    previewFile = null;
    previewDownloadUrl = "";
    previewError = "";

    try {
      if (!url) throw new Error("Lampiran tidak memiliki berkas.");
      previewUrl = url;

      const cleanName =
        url
          .split("/")
          .pop()
          ?.replace(/\.[a-z0-9]{4}\.enc$/, "")
          .replace(/\.enc$/, "") || "dokumen.pdf";
      previewFileName = cleanName;

      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Gagal mengambil file (${response.status})`);
      const blob = await response.blob();

      const blobUrl = URL.createObjectURL(blob);
      previewDownloadUrl = blobUrl;

      previewFile = new File([blob], cleanName, { type: "application/pdf" });
    } catch (e: any) {
      console.error(e);
      previewError =
        e?.message || "Gagal memuat pratinjau dokumen.";
    } finally {
      previewLoading = false;
    }
  }

  $effect(() => {
    if (!forms.preview && previewDownloadUrl) {
      URL.revokeObjectURL(previewDownloadUrl);
      previewDownloadUrl = "";
      previewFile = null;
      previewError = "";
      previewUrl = "";
    }
  });

</script>

<div class="max-w-7xl mx-auto px-5 py-10">
  {#if !data}
    <div class="flex justify-center py-20">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
  {:else}
    <div class="breadcrumbs text-sm mb-4">
      <ul>
        <li><a href="/helpdesk">Helpdesk</a></li>
        <li>{data.ticketNumber}</li>
      </ul>
    </div>

    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 class="text-2xl font-black">{data.subject}</h1>
        <p class="text-sm opacity-60 mt-1">
          {SERVICE_TYPE_LABELS[
            data.serviceType as keyof typeof SERVICE_TYPE_LABELS
          ]}
          · Nomor Tiket
          <span class="font-mono font-semibold">{data.ticketNumber}</span>
        </p>
      </div>
      <span
        class={`badge ${statusBadge[data.status ?? ""] ?? "badge-ghost"} badge-lg`}
      >
        {STATUS_LABELS[data.status as keyof typeof STATUS_LABELS] ??
          data.status}
      </span>
    </div>

    <!-- Progress stepper -->
    {#if !["cancelled", "rejected"].includes(data.status ?? "")}
      <ul
        class="steps steps-horizontal w-full text-xs mb-8 max-sm:steps-vertical max-sm:items-start"
      >
        {#each flow as s (s)}
          <li class="step" class:step-primary={flow.indexOf(s) <= currentStep}>
            {STAGE_LABELS[s]}
          </li>
        {/each}
      </ul>
    {:else}
      <div class="alert mb-8 text-sm">
        <iconify-icon icon="bx:info-circle"></iconify-icon>
        Tiket ini telah
        {data.status === "rejected" ? "ditolak" : "dibatalkan"}.
      </div>
    {/if}

    <div class="grid gap-6">
      <!-- Description -->
      <div class="card bg-base-100/50 border border-base-300">
        <div class="card-body p-5">
          <h2 class="card-title text-base">Deskripsi Permohonan</h2>
          <p class="text-sm whitespace-pre-wrap opacity-80">
            {data.description}
          </p>
          <div class="divider my-1"></div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p class="opacity-50 text-xs">Pemohon</p>
              <p class="font-medium">{data.requesterName}</p>
            </div>
            <div>
              <p class="opacity-50 text-xs">Dibuat</p>
              <p class="font-medium">{fmtDate(data.created)}</p>
            </div>
            <div>
              <p class="opacity-50 text-xs">Diperbarui</p>
              <p class="font-medium">{fmtDate(data.updated)}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Attachments -->
      {#if data.attachments?.length}
        <div class="card bg-base-100/50 border border-base-300">
          <div class="card-body p-5">
            <h2 class="card-title text-base">Lampiran</h2>
            <div class="flex flex-wrap gap-2 mt-1">
              {#each data.attachments as a (a.id)}
                {@const file = a.files?.at(-1)}
                {@const name =
                  a.title ||
                  file
                    ?.split("/")
                    .pop()
                    ?.replace(/\.[a-z0-9]{4}\.enc$/, "")
                    .replace(/\.enc$/, "") ||
                  "berkas"}
                <div class="join">
                  <button
                    type="button"
                    onclick={() => openPreview(file)}
                    class="btn btn-sm btn-outline justify-start gap-1.5 join-item"
                  >
                    <iconify-icon icon="bx:file"></iconify-icon>
                    <span class="truncate max-w-48">{name}</span>
                  </button>
                  <a
                    href={file}
                    download={name}
                    class="btn btn-sm btn-outline join-item px-2"
                    title="Unduh"
                  >
                    <iconify-icon icon="bx:download"></iconify-icon>
                  </a>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Timeline -->
      <div class="card bg-base-100/50 border border-base-300">
        <div class="card-body p-5">
          <h2 class="card-title text-base">Aktivitas & Percakapan</h2>

          <div class="space-y-4 mt-2">
            {#each data.comments as c (c.id)}
              <div
                class={`chat ${c.authorType === "admin" ? "chat-end" : "chat-start"}`}
              >
                <div class="chat-image avatar placeholder">
                  <div
                    class={`w-9 rounded-full ${c.authorType === "admin" ? "bg-primary text-primary-content" : "bg-neutral text-neutral-content"}`}
                  >
                    <span class="text-xs uppercase">
                      {(c.authorName || "?").slice(0, 2)}
                    </span>
                  </div>
                </div>
                <div class="chat-header text-xs">
                  {c.authorType === "admin"
                    ? "Petugas"
                    : c.authorName || "Anda"}
                  <time class="text-xs opacity-50 ml-1"
                    >{fmtDate(c.created)}</time
                  >
                </div>
                <div
                  class={`chat-bubble text-sm ${c.authorType === "admin" ? "chat-bubble-primary" : ""}`}
                >
                  {c.message}
                </div>
              </div>
            {/each}

            {#each data.events as ev (ev.id)}
              {#if ev.event !== "comment_created"}
                <div class="flex items-center gap-2 text-xs opacity-60 pl-2">
                  <iconify-icon
                    icon={eventIcons[ev.event ?? ""] ??
                      "bx:dots-horizontal-rounded"}
                  ></iconify-icon>
                  <span>
                    {fmtDate(ev.created)} —
                    {ev.event === "status_changed"
                      ? `Status diubah (${STATUS_LABELS[ev.metadata?.from as keyof typeof STATUS_LABELS] ?? ev.metadata?.from} → ${STATUS_LABELS[ev.metadata?.to as keyof typeof STATUS_LABELS] ?? ev.metadata?.to})`
                      : ev.event === "stage_changed"
                        ? `Tahap diperbarui (${STAGE_LABELS[ev.metadata?.to as keyof typeof STAGE_LABELS] ?? ev.metadata?.to})`
                        : ev.event === "ticket_created"
                          ? "Tiket dibuat"
                          : ev.event === "survey_submitted"
                            ? "Survey diisi"
                            : ev.event}
                  </span>
                </div>
              {/if}
            {/each}
          </div>
        </div>
      </div>

      <!-- Comment box -->
      {#if !isClosed}
        {#if cantAccessEmail}
          <div
            class="alert alert-warning text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div class="flex items-start gap-2">
              <iconify-icon
                icon="bx:info-circle"
                class="text-xl shrink-0 mt-0.5"
              ></iconify-icon>
              <div>
                <p class="font-semibold">Tanda Tangan Elektronik Diperlukan</p>
                <p class="opacity-80">
                  Anda menyatakan tidak dapat mengakses Email Dinas. Silakan
                  lakukan tanda tangan elektronik terlebih dahulu untuk
                  pengajuan email dinas baru.
                </p>
              </div>
            </div>
            <a
              href="http://localhost:5173/sign?template=pengajuan-email"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-sm btn-warning shrink-0"
            >
              <iconify-icon icon="bx:pen"></iconify-icon>
              Tanda Tangan Sekarang
            </a>
          </div>
        {/if}

        <form
          onsubmit={(e) => {
            e.preventDefault();
            send();
          }}
          class="space-y-2"
        >
          <textarea
            bind:value={message}
            class="textarea textarea-bordered w-full min-h-24"
            placeholder="Tulis pesan untuk petugas..."
          ></textarea>
          <div class="flex items-center justify-between gap-2">
            <input
              type="file"
              class="sr-only"
              aria-label="Unggah lampiran"
              bind:this={fileInput}
              onchange={onFileChosen}
            />
            {#if !cantAccessEmail}
              <button
                type="button"
                class="btn btn-ghost btn-sm text-primary"
                disabled={uploading}
                onclick={() => fileInput?.click()}
              >
                {#if uploading}
                  <span class="loading loading-spinner loading-xs"></span>
                  Mengunggah...
                {:else}
                  <iconify-icon icon="bx:paperclip"></iconify-icon>
                  Unggah Lampiran
                {/if}
              </button>
            {:else}
              <div></div>
            {/if}
            <button
              type="submit"
              class="btn btn-primary btn-sm"
              disabled={sending || !message.trim()}
            >
              {#if sending}
                <span class="loading loading-spinner loading-xs"></span>
              {:else}
                <iconify-icon icon="bx:send"></iconify-icon>
              {/if}
              Kirim Pesan
            </button>
          </div>
        </form>
      {/if}

      {#if uploadError}
        <div class="alert alert-error text-sm py-2">
          <iconify-icon icon="bx:error-circle"></iconify-icon>
          {uploadError}
        </div>
      {/if}

      <!-- Survey prompt -->
      {#if data.status === "completed"}
        {#if data.survey}
          <div class="alert alert-success text-sm">
            <iconify-icon icon="bx:check-circle"></iconify-icon>
            Terima kasih! Survey Anda sudah tercatat.
          </div>
        {:else}
          <a
            href={`/helpdesk/ticket/${id}/survey`}
            class="btn btn-success w-full"
          >
            <iconify-icon icon="bx:star"></iconify-icon>
            Berikan Penilaian Layanan
          </a>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<Modal bind:data={forms.preview} title="Pratinjau Dokumen" size="xl">
  {#if previewLoading}
    <div class="flex flex-col items-center justify-center gap-2 h-96">
      <span class="loading loading-spinner loading-md text-primary"></span>
      <span class="text-sm opacity-55 font-medium"
        >Memuat pratinjau dokumen...</span
      >
    </div>
  {:else if previewError}
    <div class="flex flex-col items-center justify-center gap-3 h-96">
      <iconify-icon
        icon="bx:error-circle"
        class="text-5xl text-error/60"
      ></iconify-icon>
      <p class="font-semibold">Gagal Memuat Pratinjau</p>
      <p class="text-sm opacity-60 text-center max-w-sm">{previewError}</p>
      <div class="flex gap-2 mt-2">
        {#if previewUrl}
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onclick={() => openPreview(previewUrl)}
          >
            <iconify-icon icon="bx:refresh" class="text-sm"></iconify-icon>
            Coba Lagi
          </button>
          <a
            href={previewUrl}
            download={previewFileName}
            class="btn btn-sm btn-outline"
          >
            <iconify-icon icon="bx:download" class="text-sm"></iconify-icon>
            Unduh Saja
          </a>
        {/if}
      </div>
    </div>
  {:else if previewFile}
    <div class="h-[70vh] overflow-hidden flex flex-col">
      <div class="flex justify-between items-center mb-3">
        <span class="text-xs opacity-60 font-mono truncate mr-4"
          >{previewFileName}</span
        >
        <a
          href={previewDownloadUrl}
          download={previewFileName}
          class="btn btn-sm btn-secondary gap-1.5 shrink-0 shadow-sm"
        >
          <iconify-icon icon="bx:download" class="text-sm"></iconify-icon>
          Unduh PDF
        </a>
      </div>
      <div
        class="flex-1 overflow-hidden bg-base-200/50 rounded-xl border border-base-300"
      >
        <Preview file={previewFile} />
      </div>
    </div>
  {/if}
</Modal>
