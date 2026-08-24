<script lang="ts">
  import { Modal, Toolbar } from "$lib/components";
  import { d } from "$lib/utils";
  import { getData, type GetParams } from "$lib/remotes/api.remote";
  import {
    addComment,
    getAdminStats,
    getTicket,
    updateTicketStatus,
    updateTicketStage,
    completeEmailPrerequisite,
    markSignatureDone,
    sendAccountNotification,
  } from "$lib/remotes/helpdesk.remote";
  import {
    STATUS_LABELS,
    STAGE_LABELS,
    SERVICE_TYPE_LABELS,
    SERVICE_LABELS,
    stageFlow,
    ticketNumber as toTicketNumber,
  } from "$lib/app/helpdesk";
  import type { HelpdeskStage, HelpdeskStatus } from "$lib/server/db/schema";

  const stats = getAdminStats({});

  let query: GetParams<"helpdesk"> = $state({
    table: "helpdesk",
    limit: 20,
    offset: 0,
    orderBy: { created: "desc" },
    search: "",
    where: {},
  });

  // Strip empty filter values before sending to the server
  const activeWhere = $derived(
    Object.fromEntries(
      Object.entries(query.where ?? {}).filter(
        ([, v]) => v !== "" && v !== null && v !== undefined,
      ),
    ),
  );

  const records = $derived(getData({ ...query, where: activeWhere }));

  const items = $derived(records.current ?? { data: [], count: 0 });

  // detail modal
  let detailId = $state<string | null>(null);
  const detailQuery = $derived(detailId ? getTicket({ id: detailId }) : null);
  const detail = $derived(detailQuery?.current ?? null);

  function openDetail(id: string) {
    if (detailId !== id) {
      actionMsg = "";
      adminReply = "";
      accountRows = [];
      accountsSent = false;
    }
    detailId = id;
  }

  // admin reply (posted from modal → authorType "admin")
  let adminReply = $state("");
  let replying = $state(false);
  async function sendAdminReply() {
    if (!detailQuery || !detailId || !adminReply.trim() || replying) return;
    replying = true;
    try {
      await addComment({
        ticketId: detailId,
        message: adminReply,
        context: "admin",
        phone: undefined,
      });
      adminReply = "";
      await Promise.all([detailQuery.refresh(), records.refresh()]);
    } finally {
      replying = false;
    }
  }

  function closeDetail() {
    detailId = null;
  }

  async function setStatus(status: HelpdeskStatus, note?: string) {
    if (!detailQuery) return;
    await updateTicketStatus({ ticketId: detailId!, status, note });
    await Promise.all([detailQuery.refresh(), records.refresh()]);
  }

  async function setStage(stage: HelpdeskStage) {
    if (!detailQuery) return;
    await updateTicketStage({ ticketId: detailId!, stage });
    await detailQuery.refresh();
  }

  // certificate flow: signature tracking + resume after email active.
  // Creating the email prerequisite is done by the requester on the public
  // ticket page.
  let prereqBusy = $state<"resume" | "sign" | null>(null);
  let actionMsg = $state("");
  let showPasswords = $state(false);

  async function resumeAfterEmailActive() {
    if (!detailQuery || !detailId || prereqBusy) return;
    prereqBusy = "resume";
    actionMsg = "";
    try {
      await completeEmailPrerequisite({ ticketId: detailId });
      actionMsg = "Proses sertifikat dilanjutkan.";
      await Promise.all([detailQuery.refresh(), records.refresh()]);
    } catch (err: any) {
      actionMsg =
        err?.body?.message || err?.message || "Gagal melanjutkan proses.";
    } finally {
      prereqBusy = null;
    }
  }

  async function markSignatureComplete() {
    if (!detailQuery || !detailId || prereqBusy) return;
    prereqBusy = "sign";
    actionMsg = "";
    try {
      await markSignatureDone({ ticketId: detailId });
      actionMsg = "Tanda tangan tercatat. Tiket masuk tahap review akhir.";
      await detailQuery.refresh();
    } catch (err: any) {
      actionMsg =
        err?.body?.message || err?.message || "Gagal mencatat tanda tangan.";
    } finally {
      prereqBusy = null;
    }
  }

  // Per-user email access data. Kumulatif: rows come ONLY from the requester
  // table submitted with the ticket (the pengaju/penandatangan is excluded).
  // Mandiri: a single row for the applicant. Admin fills email/password,
  // then sends credentials via WhatsApp + public comment in one click.
  type AccountRow = {
    name: string;
    nip: string;
    nik: string;
    email: string;
    password: string;
    keterangan: string;
  };
  let accountRows = $state<AccountRow[]>([]);
  let sendingAccounts = $state(false);
  let accountsSent = $state(false);

  $effect(() => {
    const t = detail;
    if (!t) return;
    if (accountRows.length > 0) return; // keep admin's edits when refreshing
    const meta = t.metadata as any;
    // previously sent emails, keyed by name
    const saved: Record<string, string> = {};
    let savedFirstEmail = "";
    if (Array.isArray(meta?.emailAccounts)) {
      for (const a of meta.emailAccounts) {
        if (a.name) saved[a.name] = a.email ?? "";
        else if (!savedFirstEmail) savedFirstEmail = a.email ?? "";
      }
    }
    const reqs: any[] = Array.isArray(meta?.requesters) ? meta.requesters : [];
    const list: AccountRow[] = reqs.map((r) => ({
      name: r.name ?? "",
      nip: r.nip ?? "",
      nik: r.nik ?? "",
      email: saved[r.name ?? ""] ?? "",
      password: "",
      keterangan: "",
    }));
    // Single (mandiri): just the applicant themself.
    if (reqs.length === 0) {
      list.push({
        name: t.requesterName ?? "",
        nip: t.requesterNip ?? "",
        nik: t.requesterNik ?? "",
        email: saved[t.requesterName ?? ""] || savedFirstEmail || "",
        password: "",
        keterangan: "",
      });
    }
    accountRows = list;
    accountsSent = false;
  });

  async function sendAccountData() {
    if (!detailQuery || !detailId || sendingAccounts) return;
    sendingAccounts = true;
    actionMsg = "";
    try {
      await sendAccountNotification({
        ticketId: detailId,
        // sendAccountData guards against an empty list upstream
        accounts: accountRows
          .map((r) => ({
            name: r.name.trim() || undefined,
            nip: r.nip.trim() || undefined,
            nik: r.nik.trim() || undefined,
            email: r.email.trim(),
            password: r.password.trim() || undefined,
            keterangan: r.keterangan.trim() || undefined,
          }))
          .filter((a) => a.email) as unknown as [{ email: string }],
      });
      accountsSent = true;
      actionMsg = "Akses email terkirim via WhatsApp & dicatat di tiket.";
      await Promise.all([detailQuery.refresh(), records.refresh()]);
    } catch (err: any) {
      actionMsg =
        err?.body?.message || err?.message || "Gagal mengirim data akses.";
    } finally {
      sendingAccounts = false;
    }
  }

  // Stats tabs double as quick status filters.
  const STAT_FILTERS = {
    open: { status: "open" },
    processing: { status: { in: ["processing", "waiting_user"] } },
    completed: { status: "completed" },
  } as const;

  const activeStatTab = $derived.by<keyof typeof STAT_FILTERS | "total" | null>(
    () => {
      const s = (query.where as Record<string, any>)?.status;
      if (s === undefined || s === null || s === "") return "total";
      if (s === "open") return "open";
      if (s === "completed") return "completed";
      if (
        Array.isArray(s?.in) &&
        s.in.length === 2 &&
        s.in.includes("processing") &&
        s.in.includes("waiting_user")
      )
        return "processing";
      return null;
    },
  );

  function applyStatFilter(key: keyof typeof STAT_FILTERS | "total") {
    const w = (query.where ?? {}) as Record<string, any>;
    if (key === "total" || activeStatTab === key) {
      // clear only the status part, keep other filters (e.g. layanan)
      const next = { ...w };
      delete next.status;
      query.where = next as typeof query.where;
      return;
    }
    query.where = { ...w, ...STAT_FILTERS[key] } as typeof query.where;
  }

  const statusBadge: Record<string, string> = {
    open: "badge-info",
    processing: "badge-primary",
    waiting_user: "badge-warning",
    completed: "badge-success",
    cancelled: "badge-ghost",
    rejected: "badge-error",
  };

  // Whether the workflow step at `index` has been reached (current or done).
  function isStageReached(
    serviceType: string | null | undefined,
    stage: HelpdeskStage,
    index: number,
  ) {
    const flow = stageFlow(serviceType);
    return index <= flow.indexOf(stage);
  }

  // Attachment preview modal
  let previewFile = $state<{ url: string; name: string } | null>(null);

  // Mask "password = xxx" lines in comment text unless revealed.
  function maskPasswords(text: string, show: boolean) {
    if (show) return text;
    return text.replace(
      /^(\s*password\s*=\s*)(.+)$/gim,
      (_m, label: string) => `${label}••••••••`,
    );
  }

  const eventLabels: Record<string, string> = {
    ticket_created: "Tiket dibuat",
    comment_created: "Komentar ditambahkan",
    status_changed: "Status diubah",
    stage_changed: "Tahap diperbarui",
    attachment_uploaded: "Lampiran diunggah",
    survey_submitted: "Survey diisi",
    whatsapp_sent: "WhatsApp terkirim",
  };

  function fmtDate(v?: string | null) {
    return v ? d(v).format("DD/MM/YYYY HH:mm") : "-";
  }

  // Older tickets had the requester list / signer appended to the
  // description — strip those blocks for display (they are rendered from
  // metadata elsewhere).
  function cleanDescription(desc?: string | null) {
    if (!desc) return "";
    return desc
      .replace(/\n*Penandatangan Dokumen:[^\n]*/g, "")
      .replace(/\n*Daftar Pemohon \(\d+ orang\):[\s\S]*$/, "")
      .trim();
  }

  // Merged events + comments sorted chronologically for the chat UI.
  function timeline(t: any) {
    return [
      ...t.events,
      ...t.comments.map((c: any) => ({ ...c, __isComment: true })),
    ].sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
    );
  }
</script>

<div class="px-6 py-4 space-y-3 mx-auto flex flex-col h-[calc(100vh-4rem)]">
  <div class="flex items-center justify-between gap-4 flex-wrap">
    <div>
      <h1
        class="text-2xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent"
      >
        Helpdesk
      </h1>
      <p class="text-sm opacity-60">
        Kelola tiket layanan email & sertifikat elektronik
      </p>
    </div>
    <!-- Stats (click to filter by status) -->
    {#if stats.current}
      <div role="tablist" class="tabs tabs-box tabs-sm p-0">
        <button
          role="tab"
          class="tab gap-1.5 {activeStatTab === 'total' ? 'tab-active' : ''}"
          aria-label="Semua"
          onclick={() => applyStatFilter("total")}
        >
          <iconify-icon icon="bx:support" class="text-primary"></iconify-icon>
          <span>Semua</span>
          <span class="badge badge-xs badge-primary">{stats.current.total}</span
          >
        </button>
        <button
          role="tab"
          class="tab gap-1.5 {activeStatTab === 'open' ? 'tab-active' : ''}"
          aria-label="Baru"
          onclick={() => applyStatFilter("open")}
        >
          <iconify-icon icon="bx:envelope-open" class="text-info"
          ></iconify-icon>
          <span>Baru</span>
          <span class="badge badge-xs badge-info"
            >{stats.current.byStatus["open"] ?? 0}</span
          >
        </button>
        <button
          role="tab"
          class="tab gap-1.5 {activeStatTab === 'processing'
            ? 'tab-active'
            : ''}"
          aria-label="Diproses / Menunggu"
          onclick={() => applyStatFilter("processing")}
        >
          <iconify-icon icon="bx:time" class="text-warning"></iconify-icon>
          <span>Diproses / Menunggu</span>
          <span class="badge badge-xs badge-warning"
            >{(stats.current.byStatus["processing"] ?? 0) +
              (stats.current.byStatus["waiting_user"] ?? 0)}</span
          >
        </button>
        <button
          role="tab"
          class="tab gap-1.5 {activeStatTab === 'completed'
            ? 'tab-active'
            : ''}"
          aria-label="Selesai"
          onclick={() => applyStatFilter("completed")}
        >
          <iconify-icon icon="bx:check-double" class="text-success"
          ></iconify-icon>
          <span>Selesai</span>
          <span class="badge badge-xs badge-success"
            >{stats.current.byStatus["completed"] ?? 0}</span
          >
        </button>
      </div>
    {/if}
  </div>

  <Toolbar bind:query {records}>
    {#snippet filter(where)}
      <div class="space-y-2">
        <div class="form-control w-full max-w-xs">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="label py-1">
            <span class="label-text font-bold text-xs opacity-75">Layanan</span>
          </label>
          <select
            class="select select-sm select-bordered w-full"
            bind:value={where.service}
          >
            <option value="">Semua Layanan</option>
            {#each Object.entries(SERVICE_LABELS) as [value, label] (value)}
              <option {value}>{label}</option>
            {/each}
          </select>
        </div>
        <div class="form-control w-full max-w-xs">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="label py-1">
            <span class="label-text font-bold text-xs opacity-75">Status</span>
          </label>
          <select
            class="select select-sm select-bordered w-full"
            bind:value={where.status}
          >
            <option value="">Semua Status</option>
            {#each Object.entries(STATUS_LABELS) as [value, label] (value)}
              <option {value}>{label}</option>
            {/each}
          </select>
        </div>
      </div>
    {/snippet}
  </Toolbar>

  <!-- Table -->
  <div
    class="overflow-x-auto border border-base-300/60 rounded-xl bg-base-100/50 backdrop-blur-md flex-1 min-h-0 relative shadow-inner"
  >
    <table class="table table-xs table-pin-rows table-pin-cols">
      <thead class="z-30">
        <tr
          class="bg-base-200 text-base-content/80 font-bold border-b border-base-300"
        >
          <th class="min-w-36 bg-base-200 py-2">Nomor Tiket</th>
          <th class="min-w-48 bg-base-200">Pemohon</th>
          <th class="w-44 bg-base-200">Layanan</th>
          <th class="w-32 bg-base-200">Status</th>
          <th class="w-40 bg-base-200">Dibuat</th>
          <th class="w-20 text-center bg-base-200 z-20 sticky right-0 left-auto"
          ></th>
        </tr>
      </thead>
      <tbody>
        {#if records.loading && !items.data.length}
          <tr>
            <td colspan="6" class="py-12 text-center">
              <span class="loading loading-spinner loading-md text-primary"
              ></span>
            </td>
          </tr>
        {:else if !items.data.length}
          <tr>
            <td colspan="6" class="py-12 text-center opacity-40">
              <iconify-icon icon="bx:inbox" class="text-3xl block mb-1"
              ></iconify-icon>
              Tidak ada tiket
            </td>
          </tr>
        {:else}
          {#each items.data as item (item.id)}
            <tr class="hover:bg-base-200/30 transition-colors">
              <td class="font-medium whitespace-nowrap">
                {toTicketNumber(item.id)}
                <div class="text-[10px] opacity-50 font-sans max-w-52 truncate">
                  {item.subject}
                </div>
              </td>
              <td>
                <div class="font-medium">{item.requesterName}</div>
                <div class="text-[10px] opacity-50">{item.requesterPhone}</div>
              </td>
              <td class="text-xs">
                {SERVICE_TYPE_LABELS[
                  item.serviceType as keyof typeof SERVICE_TYPE_LABELS
                ] ?? item.serviceType}
              </td>
              <td>
                <span
                  class={`badge badge-sm ${statusBadge[item.status ?? ""] ?? "badge-ghost"}`}
                >
                  {STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] ??
                    item.status}
                </span>
              </td>
              <td class="text-xs opacity-60 whitespace-nowrap"
                >{fmtDate(item.created)}</td
              >
              <td class="text-center sticky right-0 left-auto bg-base-100 z-10">
                <button
                  class="btn btn-sm btn-circle btn-ghost text-primary hover:bg-primary/10 tooltip tooltip-left"
                  onclick={() => openDetail(item.id)}
                  aria-label="Detail tiket"
                  data-tip="Detail Tiket"
                >
                  <iconify-icon icon="bx:right-arrow-alt" class="text-base"
                  ></iconify-icon>
                </button>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>

<!-- Detail modal -->
<Modal bind:data={detailId} title="Detail Tiket" size="xl">
  {#snippet children(id)}
    {@const t = detailId === id ? detail : null}
    {#if !t}
      <div class="flex justify-center py-10">
        <span class="loading loading-spinner loading-md text-primary"></span>
      </div>
    {:else}
      <div class="space-y-3 flex flex-col h-[90vh]">
        <!-- header: id/title left · status dropdown + public link right -->
        <div class="flex flex-wrap justify-between gap-2 items-start">
          <div>
            <span class="font-bold">{t.ticketNumber}</span>
            <span class="text-xs opacity-60">{t.subject}</span>
          </div>
          <div class="join">
            <select
              class="select select-sm select-bordered join-item"
              aria-label="Ubah Status"
              value={t.status ?? ""}
              onchange={(e) =>
                setStatus(e.currentTarget.value as HelpdeskStatus)}
            >
              {#each Object.entries(STATUS_LABELS) as [value, label] (value)}
                <option {value}>{label}</option>
              {/each}
            </select>
            <a
              href={`/helpdesk/ticket/${id}`}
              target="_blank"
              class="btn btn-sm join-item"
            >
              <iconify-icon icon="bx:link-external"></iconify-icon>
              Lihat Tiket
            </a>
          </div>
        </div>

        <!-- tahap workflow steps -->
        <ul class="steps steps-horizontal w-full text-[10px] overflow-x-auto">
          {#each stageFlow(t.serviceType) as s, i (s)}
            <li
              class={`step ${
                isStageReached(t.serviceType, t.stage as HelpdeskStage, i)
                  ? "step-primary"
                  : ""
              }`}
            >
              <button
                type="button"
                class="cursor-pointer hover:text-primary"
                onclick={() => setStage(s)}
              >
                {STAGE_LABELS[s]}
              </button>
            </li>
          {/each}
        </ul>

        <div
          class="grid lg:grid-cols-3 lg:grid-rows-[auto_minmax(0,1fr)] gap-3 flex-1 min-h-0"
        >
          <!-- penandatangan, detail & lampiran -->
          <section
            class="border border-base-300 rounded-xl p-3 space-y-2 min-w-0 max-h-80 overflow-y-auto lg:col-span-2"
          >
            <h3 class="font-bold text-sm flex items-center gap-1.5">
              <iconify-icon icon="bx:detail"></iconify-icon>
              Detail Pengajuan
            </h3>
            <div class="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span class="opacity-50 text-xs block">Nama</span
                >{t.requesterName}
              </div>
              <div>
                <span class="opacity-50 text-xs block">Telepon</span
                >{t.requesterPhone}
              </div>
              <div>
                <span class="opacity-50 text-xs block">Email</span
                >{t.requesterEmail || "-"}
              </div>
              <div>
                <span class="opacity-50 text-xs block">NIP</span
                >{t.requesterNip || "-"}
              </div>
              <div>
                <span class="opacity-50 text-xs block">NIK</span
                >{t.requesterNik || "-"}
              </div>
              <div>
                <span class="opacity-50 text-xs block">Lampiran</span>
                {#if t.attachments?.length}
                  <div class="flex flex-wrap gap-1.5">
                    {#each t.attachments as att (att.id)}
                      {#each att.files ?? [] as file, fi (fi)}
                        {@const fileName =
                          file
                            ?.split("/")
                            ?.pop()
                            ?.replace(/\.[a-z0-9]{4}\.enc$/, "")
                            ?.replace(/\.enc$/, "") ||
                          att.title ||
                          "Lampiran"}
                        <button
                          type="button"
                          class="btn btn-xs btn-outline gap-1.5"
                          onclick={() =>
                            (previewFile = { url: file, name: fileName })}
                        >
                          <iconify-icon icon="bx:paperclip"></iconify-icon>
                          <span class="max-w-24 truncate">{fileName}</span>
                        </button>
                      {/each}
                    {/each}
                  </div>
                {:else}
                  <span class="opacity-40">-</span>
                {/if}
              </div>
              <div class="col-span-3">
                <span class="opacity-50 text-xs block">Deskripsi</span>
                <p class="whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {cleanDescription(t.description)}
                </p>
              </div>
            </div>

            <!-- certificate flow controls -->
            {#if t.service === "certificate" && t.attachments?.length}
              <div
                class="border border-accent/40 bg-accent/5 rounded-xl p-3 space-y-2"
              >
                <p class="font-bold text-sm flex items-center gap-1.5">
                  <iconify-icon icon="bx:id-card" class="text-accent"
                  ></iconify-icon>
                  Alur Sertifikat
                </p>

                {#if (t.metadata as any)?.signature}
                  <div class="badge badge-success badge-sm gap-1">
                    <iconify-icon icon="bx:check-circle"></iconify-icon>
                    TTE tercatat
                  </div>
                {/if}

                {#if t.linked?.length}
                  <div class="flex flex-wrap gap-1">
                    {#each t.linked as l (l.id)}
                      <span class="badge badge-outline badge-sm gap-1">
                        {toTicketNumber(l.id)}
                        <span class="font-sans">
                          {SERVICE_TYPE_LABELS[
                            l.serviceType as keyof typeof SERVICE_TYPE_LABELS
                          ] ?? l.serviceType}
                          · {STATUS_LABELS[
                            l.status as keyof typeof STATUS_LABELS
                          ] ?? l.status}
                        </span>
                      </span>
                    {/each}
                  </div>
                {/if}

                <div class="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    class="btn btn-xs btn-outline"
                    onclick={resumeAfterEmailActive}
                    disabled={prereqBusy !== null ||
                      t.status !== "waiting_user"}
                  >
                    {#if prereqBusy === "resume"}
                      <span class="loading loading-spinner loading-xs"></span>
                    {:else}
                      <iconify-icon icon="bx:play"></iconify-icon>
                    {/if}
                    Lanjut Proses
                  </button>
                  <button
                    type="button"
                    class="btn btn-xs btn-outline"
                    onclick={markSignatureComplete}
                    disabled={prereqBusy !== null}
                  >
                    {#if prereqBusy === "sign"}
                      <span class="loading loading-spinner loading-xs"></span>
                    {:else}
                      <iconify-icon icon="bx:pen"></iconify-icon>
                    {/if}
                    TTE Selesai
                  </button>
                </div>

                {#if actionMsg}
                  <p class="text-xs opacity-70">{actionMsg}</p>
                {/if}
              </div>
            {/if}
          </section>

          <!-- aktivitas & komentar -->
          <section
            class="border border-base-300 rounded-xl p-3 space-y-2 min-w-0 flex flex-col min-h-0 lg:col-start-3 lg:row-span-2"
          >
            <div>
              <h3 class="font-bold text-sm flex items-center gap-1.5">
                <iconify-icon icon="bx:comment-detail" class="text-primary"
                ></iconify-icon>
                Aktivitas & Komentar
              </h3>

              <div class="w-full mt-2">
                <textarea
                  bind:value={adminReply}
                  rows="2"
                  class="textarea textarea-bordered w-full min-h-0 resize-y"
                  placeholder="Tulis balasan untuk pemohon..."
                ></textarea>
                <div class="flex justify-end mt-1">
                  <button
                    type="button"
                    class="btn btn-sm btn-primary"
                    onclick={sendAdminReply}
                    disabled={replying || !adminReply.trim()}
                  >
                    {#if replying}
                      <span class="loading loading-spinner loading-xs"></span>
                    {:else}
                      <iconify-icon icon="bx:send"></iconify-icon>
                    {/if}
                    Kirim
                  </button>
                </div>
              </div>
            </div>

            <div class="flex-1 min-h-0 flex flex-col">
              <!-- <p class="font-bold text-sm">Riwayat Aktivitas</p> -->
              <div
                class="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 max-h-72 lg:max-h-none"
              >
                {#each timeline(t) as ev (ev.__isComment ? `c-${ev.id}` : `e-${ev.id}`)}
                  {#if ev.__isComment}
                    <div
                      class={`chat ${
                        ev.authorType === "admin" ? "chat-end" : "chat-start"
                      }`}
                    >
                      <div class="chat-image avatar avatar-placeholder">
                        <div
                          class={`w-8 rounded-full text-xs ${
                            ev.authorType === "admin"
                              ? "bg-primary text-primary-content"
                              : "bg-neutral text-neutral-content"
                          }`}
                        >
                          <span>
                            {ev.authorType === "admin" ? "P" : "A"}
                          </span>
                        </div>
                      </div>
                      <div class="chat-header text-xs">
                        {ev.authorType === "admin" ? "Petugas" : "Pemohon"}
                        <time class="text-[10px] opacity-50 ml-1">
                          {fmtDate(ev.created)}
                        </time>
                      </div>
                      <div
                        class={`chat-bubble text-xs whitespace-pre-wrap ${
                          ev.authorType === "admin" ? "chat-bubble-primary" : ""
                        }`}
                      >
                        {maskPasswords(ev.message, showPasswords)}
                      </div>
                      {#if ev.isInternal}
                        <div class="chat-footer">
                          <span class="badge badge-warning badge-xs"
                            >internal</span
                          >
                        </div>
                      {/if}
                    </div>
                  {:else}
                    <div
                      class="flex items-center gap-2 text-[10px] opacity-60 py-0.5"
                    >
                      <span class="h-px flex-1 bg-base-300"></span>
                      <span class="whitespace-nowrap">
                        {eventLabels[ev.event] ?? ev.event}
                        {#if ev.event === "status_changed"}
                          ({STATUS_LABELS[
                            ev.metadata?.from as keyof typeof STATUS_LABELS
                          ] ?? ev.metadata?.from}
                          →
                          {STATUS_LABELS[
                            ev.metadata?.to as keyof typeof STATUS_LABELS
                          ] ?? ev.metadata?.to})
                        {/if}
                        · {fmtDate(ev.created)}
                      </span>
                      <span class="h-px flex-1 bg-base-300"></span>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          </section>

          <!-- update data pengguna -->
          {#if t.service === "email" || accountRows.length > 0}
            <section
              class="border border-primary/40 bg-primary/5 rounded-xl p-3 space-y-2 flex flex-col flex-1 min-h-0 lg:col-span-2"
            >
              <h3 class="font-bold text-sm flex items-center gap-1.5">
                <iconify-icon icon="bx:envelope-open" class="text-primary"
                ></iconify-icon>
                Update Data Pengguna
                <span class="badge badge-sm badge-outline badge-primary"
                  >{accountRows.length}</span
                >
              </h3>

              <div class="overflow-auto flex-1 min-h-0">
                <table class="table table-xs">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th class="min-w-40">Nama Lengkap</th>
                      <th class="min-w-32">NIP</th>
                      <th class="min-w-32">NIK</th>
                      <th class="w-56">Email</th>
                      <th class="w-36">
                        <button
                          type="button"
                          class="flex items-center gap-1"
                          onclick={() => (showPasswords = !showPasswords)}
                        >
                          <iconify-icon
                            icon={showPasswords ? "bx:hide" : "bx:show"}
                          ></iconify-icon>
                          Password
                        </button>
                      </th>
                      <th class="w-44">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each accountRows as row, i (i)}
                      <tr class="[&>td]:p-1">
                        <td class="opacity-50">{i + 1}</td>
                        <td>
                          <input
                            type="text"
                            bind:value={row.name}
                            placeholder="nama"
                            class="input input-sm input-bordered w-full"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            bind:value={row.nip}
                            placeholder="nip"
                            class="input input-sm input-bordered w-full"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            bind:value={row.nik}
                            placeholder="nik"
                            class="input input-sm input-bordered w-full"
                          />
                        </td>
                        <td>
                          <input
                            type="email"
                            bind:value={row.email}
                            placeholder="nama@mojokertokota.go.id"
                            class="input input-sm input-bordered w-full"
                          />
                        </td>
                        <td>
                          <input
                            type={showPasswords ? "text" : "password"}
                            bind:value={row.password}
                            placeholder="password"
                            class="input input-sm input-bordered w-full"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            bind:value={row.keterangan}
                            placeholder="keterangan"
                            class="input input-sm input-bordered w-full"
                          />
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>

              <p class="text-[10px] opacity-60">
                Kredensial dikirim via WhatsApp. Komentar tiket hanya berisi:
                "Akses email telah dikirimkan ke WhatsApp Anda."
              </p>

              <button
                type="button"
                class="btn btn-sm btn-success w-full"
                onclick={sendAccountData}
                disabled={sendingAccounts ||
                  !accountRows.some((r) => r.email.trim())}
              >
                {#if sendingAccounts}
                  <span class="loading loading-spinner loading-xs"></span>
                {:else}
                  <iconify-icon icon="bx:send"></iconify-icon>
                {/if}
                Kirim Akses via WhatsApp
              </button>

              {#if accountsSent}
                <div class="badge badge-success badge-sm gap-1">
                  <iconify-icon icon="bx:check-circle"></iconify-icon>
                  Terkirim
                </div>
              {/if}
              {#if actionMsg}
                <p class="text-xs opacity-70">{actionMsg}</p>
              {/if}
            </section>
          {/if}
        </div>
      </div>
    {/if}
  {/snippet}
</Modal>

<!-- Attachment preview -->
<Modal
  bind:data={previewFile}
  title={previewFile?.name ?? "Lampiran"}
  size="lg"
>
  {#snippet children(f)}
    {#if f}
      <iframe
        src={f.url}
        title={f.name}
        class="w-full h-[70vh] rounded-lg border border-base-300 bg-base-100"
      ></iframe>
      <div class="flex justify-end pt-2">
        <a href={f.url} target="_blank" class="btn btn-sm btn-outline">
          <iconify-icon icon="bx:download"></iconify-icon>
          Unduh
        </a>
      </div>
    {/if}
  {/snippet}
</Modal>
