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
    checkIdentity,
    sendManualWhatsApp,
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
      bsreResult = null;
      prereqSignUrl = null;
      waMessage = "";
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

  // BSrE pre-check
  let bsreResult = $state<Awaited<ReturnType<typeof checkIdentity>> | null>(
    null,
  );
  let checking = $state(false);
  async function runBsreCheck() {
    if (!detail) return;
    const identity = detail.requesterNip || detail.requesterNik;
    if (!identity) return;
    checking = true;
    try {
      bsreResult = await checkIdentity({ identity });
    } finally {
      checking = false;
    }
  }

  // manual WhatsApp
  let waMessage = $state("");
  let waSending = $state(false);
  async function sendWa() {
    if (!detailQuery || !waMessage.trim()) return;
    waSending = true;
    try {
      await sendManualWhatsApp({ ticketId: detailId!, message: waMessage });
      waMessage = "";
      await detailQuery.refresh();
    } finally {
      waSending = false;
    }
  }

  // certificate flow: signature tracking + resume after email active.
  // Creating the email prerequisite is done by the requester on the public
  // ticket page.
  let prereqBusy = $state<"resume" | "sign" | null>(null);
  let prereqSignUrl = $state<string | null>(null);
  let actionMsg = $state("");

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

  // Per-user email access data: one row per requester (main applicant first,
  // then every kumulatif requester). Admin fills email/password, then sends
  // credentials via WhatsApp + public comment in one click.
  type AccountRow = { name: string; email: string; password: string };
  let accountRows = $state<AccountRow[]>([]);
  let sendingAccounts = $state(false);
  let accountsSent = $state(false);

  $effect(() => {
    const t = detail;
    if (!t) return;
    if (accountRows.length > 0) return; // keep admin's edits when refreshing
    const meta = t.metadata as any;
    const saved: AccountRow[] = Array.isArray(meta?.emailAccounts)
      ? meta.emailAccounts.map((a: any) => ({
          name: a.name ?? "",
          email: a.email ?? "",
          password: "",
        }))
      : [];
    const list: AccountRow[] = [
      {
        name: t.requesterName ?? "",
        email: saved[0]?.email ?? "",
        password: "",
      },
    ];
    for (const r of (meta?.requesters as any[]) ?? []) {
      list.push({ name: r.name ?? "", email: "", password: "" });
    }
    // merge saved emails into matching names
    for (const s of saved.slice(1)) {
      const hit = list.find((l) => l.name && s.name && l.name === s.name);
      if (hit) {
        hit.email = s.email;
      } else {
        list.push(s);
      }
    }
    accountRows = list;
    accountsSent = false;
  });

  function addAccountRow() {
    accountRows.push({ name: "", email: "", password: "" });
  }

  function removeAccountRow(i: number) {
    accountRows.splice(i, 1);
  }

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
            email: r.email.trim(),
            password: r.password.trim() || undefined,
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

  const statusBadge: Record<string, string> = {
    open: "badge-info",
    processing: "badge-primary",
    waiting_user: "badge-warning",
    completed: "badge-success",
    cancelled: "badge-ghost",
    rejected: "badge-error",
  };

  const statusIcons: Record<HelpdeskStatus, string> = {
    open: "bx:envelope",
    processing: "bx:cog",
    waiting_user: "bx:time-five",
    completed: "bx:check-circle",
    cancelled: "bx:x-circle",
    rejected: "bx:block",
  };

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
</script>

<div class="px-6 py-4 space-y-3 mx-auto flex flex-col h-[calc(100vh-4rem)]">
  <div class="flex items-center justify-between gap-4">
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
  </div>

  <!-- Stats -->
  {#if stats.current}
    <div
      class="stats stats-vertical sm:stats-horizontal shadow-sm w-full text-sm"
    >
      <div class="stat py-3">
        <div class="stat-figure text-primary text-2xl">
          <iconify-icon icon="bx:support"></iconify-icon>
        </div>
        <div class="stat-title text-xs">Total Tiket</div>
        <div class="stat-value text-2xl">{stats.current.total}</div>
      </div>
      <div class="stat py-3">
        <div class="stat-figure text-info text-2xl">
          <iconify-icon icon="bx:envelope-open"></iconify-icon>
        </div>
        <div class="stat-title text-xs">Baru</div>
        <div class="stat-value text-2xl">
          {stats.current.byStatus["open"] ?? 0}
        </div>
      </div>
      <div class="stat py-3">
        <div class="stat-figure text-warning text-2xl">
          <iconify-icon icon="bx:time"></iconify-icon>
        </div>
        <div class="stat-title text-xs">Diproses / Menunggu</div>
        <div class="stat-value text-2xl">
          {(stats.current.byStatus["processing"] ?? 0) +
            (stats.current.byStatus["waiting_user"] ?? 0)}
        </div>
      </div>
      <div class="stat py-3">
        <div class="stat-figure text-success text-2xl">
          <iconify-icon icon="bx:check-double"></iconify-icon>
        </div>
        <div class="stat-title text-xs">Selesai</div>
        <div class="stat-value text-2xl">
          {stats.current.byStatus["completed"] ?? 0}
        </div>
      </div>
    </div>
  {/if}

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
              <td class="font-mono font-medium whitespace-nowrap">
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
      <div class="space-y-4">
        <!-- header -->
        <div class="flex flex-wrap justify-between gap-2 items-start">
          <div>
            <p class="font-mono font-bold text-lg">{t.ticketNumber}</p>
            <p class="text-sm opacity-60">{t.subject}</p>
          </div>
          <span class={`badge ${statusBadge[t.status ?? ""] ?? "badge-ghost"}`}>
            {STATUS_LABELS[t.status as keyof typeof STATUS_LABELS] ?? t.status}
          </span>
        </div>

        <div class="grid lg:grid-cols-2 gap-4 items-start">
          <!-- left: ticket info & controls -->
          <div class="space-y-4 min-w-0">
            <!-- requester info -->
            <div
              class="grid grid-cols-2 gap-2 text-sm bg-base-200/40 rounded-xl p-3"
            >
              <div>
                <span class="opacity-50 text-xs block">Nama</span
                >{t.requesterName}
              </div>
              <div>
                <span class="opacity-50 text-xs block">Telepon</span
                >{t.requesterPhone}
              </div>
              <div>
                <span class="opacity-50 text-xs block">NIP</span
                >{t.requesterNip || "-"}
              </div>
              <div>
                <span class="opacity-50 text-xs block">NIK</span
                >{t.requesterNik || "-"}
              </div>
              <div class="col-span-2">
                <span class="opacity-50 text-xs block">Email</span
                >{t.requesterEmail || "-"}
              </div>
              <div class="col-span-2">
                <span class="opacity-50 text-xs block">Deskripsi</span>
                <p class="whitespace-pre-wrap">{t.description}</p>
              </div>
            </div>

            <!-- per-user email access data -->
            {#if t.service === "email" || accountRows.length > 0}
              <div
                class="border border-primary/40 bg-primary/5 rounded-xl p-3 space-y-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="font-bold text-sm flex items-center gap-1.5">
                    <iconify-icon icon="bx:envelope-open" class="text-primary"
                    ></iconify-icon>
                    Data Akses Email Pemohon
                  </p>
                  <button
                    type="button"
                    class="btn btn-xs btn-ghost"
                    onclick={addAccountRow}
                  >
                    <iconify-icon icon="bx:plus"></iconify-icon>
                    Baris
                  </button>
                </div>

                <div class="overflow-x-auto">
                  <table class="table table-xs">
                    <thead>
                      <tr>
                        <th>Nama</th>
                        <th class="w-56">Email</th>
                        <th class="w-40">Password</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each accountRows as row, i (i)}
                        <tr>
                          <td>
                            <input
                              type="text"
                              bind:value={row.name}
                              placeholder="-"
                              class="input input-xs input-bordered w-full min-w-28"
                            />
                          </td>
                          <td>
                            <input
                              type="email"
                              bind:value={row.email}
                              placeholder="nama@mojokertokota.go.id"
                              class="input input-xs input-bordered w-full"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              bind:value={row.password}
                              placeholder="password default"
                              class="input input-xs input-bordered w-full font-mono"
                            />
                          </td>
                          <td>
                            {#if i > 0}
                              <button
                                type="button"
                                class="btn btn-ghost btn-xs text-error"
                                onclick={() => removeAccountRow(i)}
                                aria-label="Hapus baris"
                              >
                                <iconify-icon icon="bx:trash"></iconify-icon>
                              </button>
                            {/if}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>

                <p class="text-[10px] opacity-60">
                  Pesan otomatis: url akses https://mail.mojokertokota.go.id +
                  "password default wajib diganti saat login"{#if t.service === "certificate"}
                    + "akses untuk aktivasi telah dikirimkan ke email tersebut"{/if}.
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
                  Kirim Akses via WhatsApp & Komentar
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
              </div>
            {/if}

            <!-- certificate flow controls -->
            {#if t.service === "certificate"}
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
                      <span
                        class="badge badge-outline badge-sm font-mono gap-1"
                      >
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

                {#if prereqSignUrl}
                  <a
                    href={prereqSignUrl}
                    target="_blank"
                    class="btn btn-xs btn-warning w-full"
                  >
                    <iconify-icon icon="bx:pen"></iconify-icon>
                    Buka Form Pengajuan Email (tanda tangan)
                  </a>
                {/if}

                {#if actionMsg}
                  <p class="text-xs opacity-70">{actionMsg}</p>
                {/if}
              </div>
            {/if}

            <!-- BSrE pre-check -->
            {#if t.requesterNik || t.requesterNip}
              <div class="border border-base-300 rounded-xl p-3 space-y-2">
                <button
                  type="button"
                  class="btn btn-xs btn-outline"
                  onclick={runBsreCheck}
                  disabled={checking}
                >
                  {#if checking}
                    <span class="loading loading-spinner loading-xs"></span>
                  {:else}
                    <iconify-icon icon="bx:shield-quarter"></iconify-icon>
                  {/if}
                  Cek Data BSrE
                </button>
                {#if bsreResult}
                  {#if !bsreResult.found}
                    <div class="alert alert-warning text-xs py-2">
                      <iconify-icon icon="bx:error-circle"></iconify-icon>
                      Data tidak ditemukan di BSrE.
                    </div>
                  {:else}
                    <div class="grid grid-cols-2 gap-1.5 text-xs">
                      <div>
                        <span class="opacity-50 block">Nama BSrE</span
                        >{bsreResult.nama}
                      </div>
                      <div>
                        <span class="opacity-50 block">Email</span
                        >{bsreResult.emailAddress}
                      </div>
                      <div>
                        <span class="opacity-50 block">Status Akun</span
                        >{bsreResult.status} / {bsreResult.aktif
                          ? "Aktif"
                          : "Nonaktif"}
                      </div>
                      <div>
                        <span class="opacity-50 block">Status Sertifikat</span
                        >{bsreResult.certificateStatus ?? "-"}
                      </div>
                      <div>
                        <span class="opacity-50 block">Masa Berlaku</span
                        >{bsreResult.certStart ?? "-"} s/d {bsreResult.certEnd ??
                          "-"}
                      </div>
                      <div>
                        <span class="opacity-50 block">Jumlah Sertifikat</span
                        >{bsreResult.certCount}
                      </div>
                    </div>
                  {/if}
                {/if}
              </div>
            {/if}

            <!-- workflow controls -->
            <div class="space-y-2">
              <p class="font-bold text-sm">Tahap Workflow</p>
              <div class="flex flex-wrap gap-1.5">
                {#each stageFlow(t.serviceType) as s (s)}
                  <button
                    type="button"
                    class={`btn btn-xs ${t.stage === s ? "btn-primary" : "btn-outline"}`}
                    onclick={() => setStage(s)}
                  >
                    {STAGE_LABELS[s]}
                  </button>
                {/each}
              </div>
            </div>

            <div class="space-y-2">
              <p class="font-bold text-sm">Ubah Status</p>
              <div class="flex flex-wrap gap-1.5">
                {#each ["processing", "waiting_user", "completed", "rejected", "cancelled"] as st (st)}
                  {#if st !== t.status}
                    <button
                      type="button"
                      class="btn btn-xs btn-outline"
                      onclick={() => setStatus(st as HelpdeskStatus)}
                    >
                      <iconify-icon icon={statusIcons[st as HelpdeskStatus]}
                      ></iconify-icon>
                      {STATUS_LABELS[st as HelpdeskStatus]}
                    </button>
                  {/if}
                {/each}
              </div>
            </div>

            <!-- manual WA -->
            <div class="space-y-2">
              <p class="font-bold text-sm">Kirim WhatsApp ke Pemohon</p>
              <textarea
                bind:value={waMessage}
                class="textarea textarea-bordered w-full min-h-16 text-sm"
                placeholder="Pesan yang akan dikirim..."
              ></textarea>
              <button
                type="button"
                class="btn btn-xs btn-success"
                onclick={sendWa}
                disabled={waSending || !waMessage.trim()}
              >
                {#if waSending}
                  <span class="loading loading-spinner loading-xs"></span>
                {:else}
                  <iconify-icon icon="bx:message"></iconify-icon>
                {/if}
                Kirim
              </button>
            </div>

            <!-- survey -->
            {#if t.survey}
              <div
                class="bg-success/10 border border-success/30 rounded-xl p-3 text-sm"
              >
                <p class="font-bold mb-1">
                  <iconify-icon icon="bx:star" class="text-warning"
                  ></iconify-icon>
                  Survey Kepuasan
                </p>
                <p>
                  Rating: {t.survey.rating}/5 · Kemudahan: {t.survey.ease}/5
                </p>
                {#if t.survey.comment}<p class="opacity-70 italic">
                    "{t.survey.comment}"
                  </p>{/if}
              </div>
            {/if}
          </div>

          <!-- right: activity history & admin reply -->
          <div class="space-y-3 min-w-0">
            <div class="space-y-2">
              <p class="font-bold text-sm flex items-center gap-1.5">
                <iconify-icon icon="bx:comment-detail" class="text-primary"
                ></iconify-icon>
                Balas sebagai Petugas
              </p>
              <textarea
                bind:value={adminReply}
                class="textarea textarea-bordered w-full min-h-20 text-sm"
                placeholder="Tulis balasan untuk pemohon..."
              ></textarea>
              <div class="flex justify-end">
                <button
                  type="button"
                  class="btn btn-xs btn-primary"
                  onclick={sendAdminReply}
                  disabled={replying || !adminReply.trim()}
                >
                  {#if replying}
                    <span class="loading loading-spinner loading-xs"></span>
                  {:else}
                    <iconify-icon icon="bx:send"></iconify-icon>
                  {/if}
                  Kirim Balasan
                </button>
              </div>
            </div>

            <div class="space-y-2">
              <p class="font-bold text-sm">Riwayat Aktivitas</p>
              <ul class="space-y-1 max-h-96 overflow-y-auto text-xs">
                {#each [...t.events, ...t.comments.map( (c: any) => ({ ...c, __isComment: true }), )] as ev, i (ev.__isComment ? `c-${ev.id}` : `e-${ev.id}`)}
                  <li
                    class="flex gap-2 items-baseline border-l-2 border-base-300 pl-2 py-0.5"
                  >
                    <span class="opacity-50 whitespace-nowrap"
                      >{fmtDate(ev.created)}</span
                    >
                    <span>
                      {#if ev.__isComment}
                        <strong
                          >{ev.authorType === "admin"
                            ? "Petugas"
                            : "Pemohon"}:</strong
                        >
                        {ev.message}
                        {#if ev.isInternal}<span
                            class="badge badge-warning badge-xs ml-1"
                            >internal</span
                          >{/if}
                      {:else}
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
                      {/if}
                    </span>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-2 border-t border-base-200">
          <a
            href={`/helpdesk/ticket/${id}`}
            target="_blank"
            class="btn btn-sm btn-ghost"
          >
            <iconify-icon icon="bx:external-link"></iconify-icon>
            Buka Halaman Publik
          </a>
        </div>
      </div>
    {/if}
  {/snippet}
</Modal>
