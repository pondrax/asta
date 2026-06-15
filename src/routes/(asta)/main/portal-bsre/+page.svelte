<script lang="ts">
  import { page } from "$app/state";
  import { Toolbar, Chart } from "$lib/components";
  import {
    closeBsre,
    fetchBsreUsers,
    getSessionStatus,
    launchBsre,
    navigateBsre,
    debugBsreSession,
    getBsreStats,
  } from "$lib/remotes/bsre.remote";
  import { getData, type GetParams } from "$lib/remotes/api.remote";
  import { d } from "$lib/utils";
  import { app } from "$lib/app/index.svelte";

  const userId = $derived(page.data.user?.id ?? page.data.user?.email ?? "");

  // Track token availability independently so Sync enables immediately after launch
  let tokenReady = $state(false);
  const status = $derived(getSessionStatus({ userId }));
  // Sync status's hasToken into our local state too
  $effect(() => {
    if (status.current?.hasToken) tokenReady = true;
  });

  let customUrl = $state("https://portal-bsre.bssn.go.id/");

  // Toolbar query state
  let query: GetParams<"bsreUsers"> = $state({
    table: "bsreUsers",
    limit: 10,
    offset: 0,
    search: "",
    where: {},
  });

  // Reactive records from local DB
  const records = $derived(getData({ ...query }));
  const items = $derived(records.current ?? { data: [], count: 0 });

  // Sync state
  let syncing = $state(false);
  let selectedUser = $state<any>(null);

  // PII masking
  let showPii = $state(false);

  // Chart state
  let chartStartDate = $state("");
  let chartEndDate = $state("");
  let chartCollapsed = $state(false);
  let sessionCollapsed = $state(true);

  const ALL_USER_STATUSES = ["VERIFIED", "NEW", "UPDATE"];
  const ALL_CERT_STATUSES = ["ISSUE", "NEW", "REVOKE", "EXPIRED"];

  const stats = $derived(
    getBsreStats({
      ...((query.where as any)?.status
        ? { status: (query.where as any).status }
        : {}),
      ...((query.where as any)?.certificateStatus
        ? { certificateStatus: (query.where as any).certificateStatus }
        : {}),
      ...(chartStartDate ? { chartStartDate } : {}),
      ...(chartEndDate ? { chartEndDate } : {}),
    }),
  );
  const statsData = $derived(stats.current);

  const totalUsers = $derived(statsData?.total ?? 0);
  const chartData = $derived(statsData?.chartData ?? []);

  const userStatusChartData = $derived.by(() => {
    const counts = { ...((statsData as any)?.userStatusCounts ?? {}) };
    for (const s of ALL_USER_STATUSES) {
      if (!(s in counts)) counts[s] = 0;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([label, value]) => ({ label, value }));
  });

  const certStatusChartData = $derived.by(() => {
    const counts = { ...((statsData as any)?.certStatusCounts ?? {}) };
    for (const s of ALL_CERT_STATUSES) {
      if (!(s in counts)) counts[s] = 0;
    }
    return ALL_CERT_STATUSES.map((label) => ({ label, value: counts[label] }));
  });

  function statusBg(label: string) {
    const map: Record<string, string> = {
      Total: "bg-primary/10",
      VERIFIED: "bg-success/10",
      ACTIVE: "bg-info/10",
      INACTIVE: "bg-neutral/10",
      PENDING: "bg-warning/10",
      ISSUE: "bg-success/10",
      REVOKE: "bg-error/10",
      NEW: "bg-info/10",
      EXPIRED: "bg-warning/10",
    };
    return map[label] ?? "bg-base-200/50";
  }

  function resetChartDate() {
    chartStartDate = "";
    chartEndDate = "";
  }

  function selectFilter(field: string, value: string) {
    const w = query.where as Record<string, any>;
    if (field === "reset") {
      query.where = {};
    } else if (w[field] === value) {
      const next = { ...w };
      delete next[field];
      query.where = next;
    } else {
      query.where = { ...w, [field]: value };
    }
  }

  function latestCert(user: any) {
    const certs: any[] = user?.details?.data?.sertifikat ?? [];
    if (!certs.length) return null;
    return [...certs].sort(
      (a, b) =>
        new Date(b.notAfterDate).getTime() - new Date(a.notAfterDate).getTime(),
    )[0];
  }

  function maskPii(
    value: string | null | undefined,
    type: "nik" | "nip" | "username" | "phone",
  ): string {
    if (!value) return "-";
    if (showPii) return value;
    if (type === "nik" || type === "nip") {
      const clean = value.replace(/\s/g, "");
      if (clean.length <= 4) return clean;
      return "••••••" + clean.slice(-4);
    }
    if (type === "phone") {
      const clean = value.replace(/\s/g, "");
      if (clean.length <= 4) return clean;
      return "••••••" + clean.slice(-4);
    }
    if (type === "username") {
      if (value.length <= 1) return value;
      return value[0] + "••••";
    }
    return value;
  }

  // Debug state
  let debugData = $state<any>(null);
  let debugLoading = $state(false);

  // Reset offset when count changes (like users page)
  let lastCount = $state(0);
  $effect(() => {
    if (records.current && lastCount !== items.count) {
      query.offset = 0;
      lastCount = items.count;
    }
  });

  async function syncFromBsre() {
    if (syncing) return;
    syncing = true;
    try {
      const res = await fetchBsreUsers({ userId });
      if (res?.success) {
        app.showToast(
          "success",
          `Data BSrE tersinkronisasi (${res.total} pengguna).`,
        );
        records.refresh();
      } else {
        app.showToast("error", res?.message ?? "Gagal sinkronisasi.");
      }
    } catch (e: any) {
      app.showToast("error", e?.message ?? "Gagal sinkronisasi.");
    } finally {
      syncing = false;
    }
  }

  async function runDebug() {
    debugLoading = true;
    try {
      const res = await debugBsreSession({ userId });
      if (res?.success) {
        debugData = res;
        app.showToast("success", "Data debug berhasil diambil.");
      } else {
        app.showToast("error", res?.message ?? "Gagal mengambil data debug.");
      }
    } catch (e: any) {
      app.showToast("error", e?.message ?? "Gagal.");
    } finally {
      debugLoading = false;
    }
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  async function launch() {
    const res = await launchBsre({ userId });
    if (res?.hasToken) tokenReady = true;
    if (res?.success)
      app.showToast("success", res.message ?? "Browser dibuka.");
    else app.showToast("error", "Gagal membuka browser.");
    status.refresh();
  }

  async function close() {
    const res = await closeBsre({ userId });
    if (res?.success) tokenReady = false;
    app.showToast("success", res?.message ?? "Sesi ditutup.");
    status.refresh();
  }

  async function navigate() {
    const res = await navigateBsre({ userId, url: customUrl });
    if (res?.success)
      app.showToast("success", res.message ?? "Navigasi berhasil.");
    else app.showToast("error", res?.message ?? "Gagal navigasi.");
    status.refresh();
  }
</script>

<div class="px-6 py-4 space-y-4 max-w-7xl mx-auto">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h1
        class="text-2xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent"
      >
        Portal BSrE
      </h1>
      <p class="text-sm opacity-60">
        Buka Portal BSrE BSSN — login otomatis via BeID + TOTP
      </p>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <a
        href="https://portal-bsre.bssn.go.id/"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-sm btn-ghost gap-1"
      >
        <iconify-icon icon="bx:link-external" class="text-sm"></iconify-icon>
        Buka Portal
      </a>

      <button
        aria-label={chartCollapsed ? "Expand" : "Collapse"}
        class="btn btn-sm btn-ghost gap-1"
        onclick={() => (chartCollapsed = !chartCollapsed)}
      >
        <iconify-icon icon="bx:chart"></iconify-icon>
        Grafik
      </button>

      <button
        aria-label={sessionCollapsed ? "Expand" : "Collapse"}
        class="btn btn-sm btn-ghost gap-1"
        onclick={() => (sessionCollapsed = !sessionCollapsed)}
      >
        <iconify-icon icon="bx:cog"></iconify-icon>
        Konfig
      </button>
    </div>
  </div>

  <!-- Charts -->
  {#if !chartCollapsed}
    <div
      class="bg-base-100/40 border border-base-200/60 rounded-2xl shadow-sm backdrop-blur transition-all duration-500 {chartCollapsed
        ? 'max-h-0 overflow-hidden p-0'
        : 'p-4'}"
    >
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2">
          <Chart
            title="Status Sertifikat"
            subtitle=""
            data={chartData}
            height={250}
            type="line"
            categories={[
              {
                key: "start",
                color: "var(--color-success)",
                label: "Sertifikat Mulai",
              },
              {
                key: "end",
                color: "var(--color-error)",
                label: "Sertifikat Berakhir",
              },
            ]}
          />
          {#if status.current?.lastSync}
            <div
              class="flex gap-1 items-center mt-1 text-[10px] font-bold opacity-40"
            >
              <iconify-icon icon="bx:time-five"></iconify-icon>
              Sync: {d(status.current.lastSync).format("DD MMM YYYY, HH:mm")}
            </div>
          {/if}
        </div>
        <div class="flex flex-col gap-3">
          <div>
            <div class="flex flex-wrap items-end gap-2 mb-2">
              <label class="form-control">
                <span
                  class="label-text text-[10px] uppercase tracking-widest opacity-40 font-black"
                  >Dari</span
                >
                <input
                  type="date"
                  class="input input-bordered input-xs w-28"
                  bind:value={chartStartDate}
                />
              </label>
              <label class="form-control">
                <span
                  class="label-text text-[10px] uppercase tracking-widest opacity-40 font-black"
                  >Sampai</span
                >
                <input
                  type="date"
                  class="input input-bordered input-xs w-28"
                  bind:value={chartEndDate}
                />
              </label>
              <button class="btn btn-ghost btn-xs" onclick={resetChartDate}
                >Reset</button
              >
            </div>
            <span
              class="label-text text-[10px] uppercase tracking-widest opacity-40 font-black block mb-1"
              >Status User</span
            >
            <div class="grid grid-cols-2 gap-1.5">
              <div
                class="rounded-lg px-2 py-1 text-center cursor-pointer hover:ring-2 hover:ring-base-content/30 transition-all {statusBg(
                  'Total',
                )} {!query.where?.status && !query.where?.certificateStatus
                  ? 'ring-2 ring-primary/60'
                  : ''}"
                onclick={() => selectFilter("reset", "")}
                onkeydown={(e) =>
                  e.key === "Enter" && selectFilter("reset", "")}
                role="button"
                tabindex="0"
              >
                <div class="text-sm font-black font-mono tracking-tighter">
                  {totalUsers}
                </div>
                <div
                  class="text-[9px] font-bold opacity-50 uppercase tracking-wider"
                >
                  Total
                </div>
              </div>
              {#each userStatusChartData as d}
                <div
                  class="rounded-lg px-2 py-1 text-center cursor-pointer hover:ring-2 hover:ring-base-content/30 transition-all {statusBg(
                    d.label,
                  )} {query.where?.status === d.label
                    ? 'ring-2 ring-primary/60'
                    : ''}"
                  onclick={() => selectFilter("status", d.label)}
                  onkeydown={(e) =>
                    e.key === "Enter" && selectFilter("status", d.label)}
                  role="button"
                  tabindex="0"
                >
                  <div class="text-sm font-black font-mono tracking-tighter">
                    {d.value}
                  </div>
                  <div
                    class="text-[9px] font-bold opacity-50 uppercase tracking-wider truncate"
                  >
                    {d.label}
                  </div>
                </div>
              {/each}
            </div>
          </div>
          <div>
            <span
              class="label-text text-[10px] uppercase tracking-widest opacity-40 font-black block mb-1"
              >Status Sertifikat</span
            >
            <div class="grid grid-cols-2 gap-1.5">
              {#each certStatusChartData as d}
                <div
                  class="rounded-lg px-2 py-1 text-center cursor-pointer hover:ring-2 hover:ring-base-content/30 transition-all {statusBg(
                    d.label,
                  )} {query.where?.certificateStatus === d.label
                    ? 'ring-2 ring-primary/60'
                    : ''}"
                  onclick={() => selectFilter("certificateStatus", d.label)}
                  onkeydown={(e) =>
                    e.key === "Enter" &&
                    selectFilter("certificateStatus", d.label)}
                  role="button"
                  tabindex="0"
                >
                  <div class="text-sm font-black font-mono tracking-tighter">
                    {d.value}
                  </div>
                  <div
                    class="text-[9px] font-bold opacity-50 uppercase tracking-wider truncate"
                  >
                    {d.label}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Session Status -->
  {#if !sessionCollapsed}
    <div
      class="bg-base-100/40 border border-base-200/60 rounded-2xl py-1 px-4 shadow-sm backdrop-blur transition-all duration-500"
    >
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 ml-2">
          <div
            class="badge badge-sm {status.current?.active
              ? 'badge-success'
              : 'badge-neutral'} gap-1"
          >
            <iconify-icon
              icon={status.current?.active
                ? "bx:radio-circle-marked"
                : "bx:radio-circle"}
            ></iconify-icon>
            {status.current?.active ? "Sesi Aktif" : "Sesi Tidak Aktif"}
          </div>
          <div
            class="badge badge-sm {status.current?.hasToken
              ? 'badge-info'
              : 'badge-ghost'} gap-1"
          >
            <iconify-icon icon={status.current?.hasToken ? "bx:key" : "bx:lock"}
            ></iconify-icon>
            {status.current?.hasToken ? "Token OK" : "No Token"}
          </div>
          {#if status.current?.active && status.current.mode?.startsWith("remote")}
            <span class="text-xs opacity-60">🌐 Remote</span>
          {/if}
        </div>
        <div class="flex gap-2 ml-auto">
          <button
            class="btn btn-sm btn-primary gap-1"
            onclick={syncFromBsre}
            disabled={(!status.current?.active &&
              !status.current?.hasToken &&
              !tokenReady) ||
              syncing}
          >
            {#if syncing}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:sync"></iconify-icon>
            {/if}
            Sync
          </button>
          <button class="btn btn-primary btn-sm gap-1" onclick={launch}>
            {#if launchBsre.pending}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:key"></iconify-icon>
            {/if}
            Update Token
          </button>
          <button
            class="btn btn-warning btn-sm gap-1"
            onclick={runDebug}
            disabled={!status.current?.active}
          >
            {#if debugLoading}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:bug"></iconify-icon>
            {/if}
            Debug
          </button>
          <button
            class="btn btn-error btn-outline btn-sm gap-1"
            onclick={close}
            disabled={!status.current?.active}
          >
            {#if closeBsre.pending}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:stop"></iconify-icon>
            {/if}
            Tutup
          </button>
        </div>
      </div>

      {#if debugData}
        <div class="border-t border-base-content/10 mt-2 pt-2">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[11px] font-semibold opacity-60"
              >Info Debug Sesi</span
            >
            <button
              class="btn btn-ghost btn-xs"
              onclick={() => (debugData = null)}>Tutup</button
            >
          </div>
          <pre
            class="bg-base-200/80 p-2 rounded text-[10px] overflow-auto max-h-40">{JSON.stringify(
              debugData,
              null,
              2,
            )}</pre>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Users Table -->
  <div
    class="bg-base-100/40 border border-base-200/60 rounded-2xl p-4 shadow-sm backdrop-blur space-y-4"
  >
    <Toolbar bind:query {records}>
      {#snippet filter(where)}
        <div class="form-control w-full max-w-xs">
          <label class="label py-1" for="filter-cert-status">
            <span class="label-text font-bold text-xs opacity-75"
              >Status Sertifikat</span
            >
          </label>
          <input
            id="filter-cert-status"
            bind:value={where.certificateStatus}
            class="input input-sm input-bordered"
            placeholder="ISSUE, REVOKED..."
          />
        </div>
        <div class="form-control w-full max-w-xs">
          <label class="label py-1" for="filter-nik">
            <span class="label-text font-bold text-xs opacity-75">NIK</span>
          </label>
          <input
            id="filter-nik"
            bind:value={where.nik}
            class="input input-sm input-bordered"
            placeholder="Cari NIK..."
          />
        </div>
      {/snippet}
      {#snippet actions()}
        <li>
          <button onclick={() => (showPii = !showPii)}>
            <iconify-icon icon={showPii ? "bx:show" : "bx:hide"}></iconify-icon>
            {showPii ? "Tampilkan PII" : "Masking PII"}
          </button>
        </li>
      {/snippet}
    </Toolbar>

    <div
      class="overflow-x-auto border border-base-300/60 rounded-xl bg-base-100/50 backdrop-blur-md h-[calc(100vh-20rem)] relative shadow-inner"
    >
      <table class="table table-md table-pin-rows table-pin-cols">
        <thead>
          <tr
            class="bg-base-200/50 text-base-content/80 font-bold border-b border-base-300"
          >
            <th class="w-10 text-center bg-base-200/50 sticky left-0 z-2">#</th>
            <th class="min-w-[180px] bg-base-200/50 sticky left-10 z-2">Nama</th
            >
            <th class="w-56">Email</th>
            <th class="w-36">NIK</th>
            <th class="w-36">NIP</th>
            <th class="w-24 text-center">Sertifikat</th>
            <th class="w-28">Mulai</th>
            <th class="w-28">Berakhir</th>
            <th class="w-48">Jabatan</th>
            <th class="w-28 text-center">Status</th>
            <th class="w-20 text-center bg-base-200/50">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {#if records.loading && !items.data.length}
            <tr>
              <td colspan="11" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-2">
                  <span class="loading loading-spinner loading-md text-primary"
                  ></span>
                  <span class="text-sm opacity-55 font-medium"
                    >Memuat data pengguna BSrE...</span
                  >
                </div>
              </td>
            </tr>
          {:else if !status.current?.active && !status.current?.hasToken && !items.data.length}
            <tr>
              <td colspan="11" class="py-12 text-center">
                <div
                  class="flex flex-col items-center justify-center gap-2 opacity-50"
                >
                  <iconify-icon icon="bx:globe" class="text-3xl"></iconify-icon>
                  <p class="text-sm font-medium">
                    Buka sesi BSrE terlebih dahulu
                  </p>
                  <p class="text-xs">
                    Pastikan token tersimpan untuk memuat data pengguna.
                  </p>
                </div>
              </td>
            </tr>
          {:else if records.error}
            <tr>
              <td colspan="11" class="py-12 text-center">
                <div
                  class="flex flex-col items-center justify-center gap-3 text-error"
                >
                  <iconify-icon icon="bx:error-circle" class="text-3xl"
                  ></iconify-icon>
                  <div class="text-sm font-semibold">
                    {records.error.message}
                  </div>
                  <button
                    class="btn btn-sm btn-error btn-outline"
                    onclick={() => records.refresh()}
                  >
                    Coba Lagi
                  </button>
                </div>
              </td>
            </tr>
          {:else if !items.data.length}
            <tr>
              <td colspan="11" class="py-12 text-center">
                <div
                  class="flex flex-col items-center justify-center gap-2 opacity-40"
                >
                  <iconify-icon icon="bx:group" class="text-3xl"></iconify-icon>
                  <span class="text-sm font-medium"
                    >Belum ada data. Klik "Sync" untuk mengambil data dari BSrE.</span
                  >
                </div>
              </td>
            </tr>
          {:else}
            {#each items.data as user, i}
              {#if user}
                <tr class="hover:bg-base-200/30 transition-colors">
                  <td
                    class="text-center text-xs opacity-60 bg-base-100 sticky left-0 z-1"
                    >{query.offset + i + 1}</td
                  >
                  <td class="font-semibold bg-base-100 sticky left-10 z-1"
                    >{user?.nama ?? "-"}</td
                  >
                  <td class="text-xs">{user?.emailAddress ?? "-"}</td>
                  <td class="text-xs font-mono"
                    >{maskPii(user?.nik ?? "-", "nik")}</td
                  >
                  <td class="text-xs font-mono"
                    >{maskPii(user?.nip ?? "-", "nip")}</td
                  >
                  <td class="text-center">
                    <span
                      class="badge badge-sm {latestCert(user)?.status ===
                      'ISSUE'
                        ? 'badge-success'
                        : latestCert(user)?.status === 'REVOKE'
                          ? 'badge-error'
                          : 'badge-ghost'} font-semibold"
                    >
                      {latestCert(user)?.status ?? "-"}
                    </span>
                  </td>
                  <td class="text-xs"
                    >{latestCert(user)?.notBeforeDate?.split(" ")[0] ?? "-"}</td
                  >
                  <td class="text-xs"
                    >{latestCert(user)?.notAfterDate?.split(" ")[0] ?? "-"}</td
                  >
                  <td class="text-xs">{user?.jabatanOrganisasi ?? "-"}</td>
                  <td class="text-center">
                    <span
                      class="badge badge-sm {user?.status === 'VERIFIED' ||
                      user?.status === 'ACTIVE' ||
                      user?.aktif
                        ? 'badge-success'
                        : 'badge-ghost'} font-semibold"
                    >
                      {user?.status ||
                        (user?.aktif ? "Aktif" : "Nonaktif") ||
                        "-"}
                    </span>
                  </td>
                  <td class="text-center sticky right-0 z-1 bg-base-100">
                    <div class="flex items-center justify-center gap-1">
                      <button
                        class="btn btn-ghost btn-xs text-primary tooltip tooltip-left"
                        data-tip="Lihat Detail"
                        aria-label="Lihat Detail"
                        onclick={(e) => {
                          e.stopPropagation();
                          selectedUser = user;
                        }}
                      >
                        <iconify-icon icon="bx:show" class="text-sm"
                        ></iconify-icon>
                      </button>
                      {#if user?.id}
                        <a
                          href="https://portal-bsre.bssn.go.id/app/users/{user.id}"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="btn btn-ghost btn-xs text-accent tooltip tooltip-left"
                          data-tip="Buka Profil BSrE"
                          aria-label="Buka Profil BSrE"
                          onclick={(e) => e.stopPropagation()}
                        >
                          <iconify-icon icon="bx:link-external" class="text-sm"
                          ></iconify-icon>
                        </a>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- User Detail Modal -->
  {#if selectedUser}
    <div use:portal>
      <dialog class="modal modal-open">
        <div
          class="modal-box max-w-2xl bg-base-100 border border-base-content/10 shadow-2xl rounded-2xl"
        >
          <div
            class="flex items-center justify-between border-b border-base-content/10 pb-3 mb-4"
          >
            <div class="flex items-center gap-3">
              <div class="avatar placeholder">
                <div class="bg-primary text-primary-content rounded-full w-10">
                  <span class="text-sm font-semibold"
                    >{selectedUser.nama?.charAt(0) || "U"}</span
                  >
                </div>
              </div>
              <div>
                <h3 class="font-bold text-lg">{selectedUser.nama ?? "-"}</h3>
                <p class="text-xs opacity-60 font-mono">
                  {selectedUser.id ?? "-"}
                </p>
              </div>
            </div>
            <button
              class="btn btn-ghost btn-circle btn-sm"
              onclick={() => (selectedUser = null)}>✕</button
            >
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <!-- Personal Info Card -->
            <div
              class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5"
            >
              <h4
                class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1"
              >
                <iconify-icon icon="bx:user"></iconify-icon> Informasi Personal
              </h4>
              <div class="space-y-2">
                <div>
                  <span class="text-xs opacity-60">NIK</span>
                  <p class="font-semibold font-mono">
                    {maskPii(selectedUser.nik ?? "-", "nik")}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">NIP</span>
                  <p class="font-semibold font-mono">
                    {maskPii(selectedUser.nip ?? "-", "nip")}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Email</span>
                  <p class="font-semibold select-all">
                    {selectedUser.emailAddress ?? "-"}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Nomor HP</span>
                  <p class="font-semibold">
                    {maskPii(
                      selectedUser.phone || selectedUser.no_wa || "-",
                      "phone",
                    )}
                  </p>
                </div>
              </div>
            </div>

            <!-- Job Info Card -->
            <div
              class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5"
            >
              <h4
                class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1"
              >
                <iconify-icon icon="bx:briefcase"></iconify-icon> Jabatan & Organisasi
              </h4>
              <div class="space-y-2">
                <div>
                  <span class="text-xs opacity-60">Jabatan</span>
                  <p class="font-semibold">
                    {selectedUser.jabatanOrganisasi ?? "-"}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Unit Kerja</span>
                  <p class="font-semibold">
                    {selectedUser.organisasiUnit ?? "-"}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Organisasi</span>
                  <p class="font-semibold">{selectedUser.organisasi ?? "-"}</p>
                </div>
              </div>
            </div>

            <!-- Certificate & Products -->
            <div
              class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5 md:col-span-2"
            >
              <h4
                class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1"
              >
                <iconify-icon icon="bx:certification"></iconify-icon> Sertifikat
                & Layanan
              </h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <span class="text-xs opacity-60">Status Sertifikat</span>
                  <div>
                    <span
                      class="badge {selectedUser.certificateStatus === 'ISSUE'
                        ? 'badge-success'
                        : 'badge-warning'} font-semibold badge-sm mt-1"
                    >
                      {selectedUser.certificateStatus ?? "-"}
                    </span>
                  </div>
                </div>
                <div>
                  <span class="text-xs opacity-60">Layanan Produk</span>
                  <p class="font-semibold text-xs mt-1">
                    {selectedUser.products ?? "-"}
                  </p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Tanggal Pendaftaran</span>
                  <p class="font-semibold">{selectedUser.createdDate ?? "-"}</p>
                </div>
                <div>
                  <span class="text-xs opacity-60">Asal Registrasi</span>
                  <p class="font-semibold font-mono">
                    {selectedUser.registeredOrigin ?? "-"}
                  </p>
                </div>
              </div>

              {#if selectedUser.details?.data?.sertifikat?.length}
                <div class="border-t border-base-content/10 pt-3">
                  <span
                    class="text-xs opacity-60 uppercase font-bold block mb-2"
                    >Riwayat Sertifikat</span
                  >
                  <div class="space-y-2">
                    {#each [...selectedUser.details.data.sertifikat].sort((a, b) => new Date(b.notAfterDate).getTime() - new Date(a.notAfterDate).getTime()) as cert, ci}
                      <div
                        class="bg-base-100 p-3 rounded-lg border border-base-content/5"
                      >
                        <div
                          class="flex items-center justify-between gap-2 mb-1"
                        >
                          <div class="flex items-center gap-2">
                            <span
                              class="badge badge-sm {cert.status === 'ISSUE'
                                ? 'badge-success'
                                : cert.status === 'REVOKE'
                                  ? 'badge-error'
                                  : 'badge-warning'}"
                            >
                              {cert.status}
                            </span>
                            <span class="text-xs font-semibold"
                              >{cert.product ?? "-"}</span
                            >
                          </div>
                          <span class="text-[10px] opacity-50 font-mono"
                            >{cert.serialNumber?.slice(-8) ?? ""}</span
                          >
                        </div>
                        <div
                          class="flex items-center gap-3 text-[11px] opacity-70"
                        >
                          <span
                            >Berlaku: {cert.notBeforeDate?.split(" ")[0] ?? "?"}
                            — {cert.notAfterDate?.split(" ")[0] ?? "?"}</span
                          >
                          <span class="badge badge-ghost badge-xs"
                            >{cert.jenisSertifikat ?? "-"}</span
                          >
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

            <!-- Status Verifikasi -->
            <div
              class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5 md:col-span-2"
            >
              <h4
                class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1"
              >
                <iconify-icon icon="bx:check-shield"></iconify-icon> Status Verifikasi
              </h4>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div
                  class="bg-base-100 p-2 rounded-lg border border-base-content/5"
                >
                  <span class="text-[10px] opacity-60 block">Dukcapil</span>
                  <span
                    class="badge badge-sm {selectedUser.verifiedDukcapil
                      ? 'badge-success'
                      : 'badge-neutral'} mt-1"
                  >
                    {selectedUser.verifiedDukcapil
                      ? "✓ Terverifikasi"
                      : "✗ Belum"}
                  </span>
                </div>
                <div
                  class="bg-base-100 p-2 rounded-lg border border-base-content/5"
                >
                  <span class="text-[10px] opacity-60 block">Liveness</span>
                  <span
                    class="badge badge-sm {selectedUser.verfifiedLiveness
                      ? 'badge-success'
                      : 'badge-neutral'} mt-1"
                  >
                    {selectedUser.verfifiedLiveness
                      ? "✓ Terverifikasi"
                      : "✗ Belum"}
                  </span>
                </div>
                <div
                  class="bg-base-100 p-2 rounded-lg border border-base-content/5"
                >
                  <span class="text-[10px] opacity-60 block">WhatsApp</span>
                  <span
                    class="badge badge-sm {selectedUser.phoneVerified
                      ? 'badge-success'
                      : 'badge-neutral'} mt-1"
                  >
                    {selectedUser.phoneVerified ? "✓ Terverifikasi" : "✗ Belum"}
                  </span>
                </div>
                <div
                  class="bg-base-100 p-2 rounded-lg border border-base-content/5"
                >
                  <span class="text-[10px] opacity-60 block">Verifikator</span>
                  <span
                    class="badge badge-sm {selectedUser.verifiedVerifikator
                      ? 'badge-success'
                      : 'badge-neutral'} mt-1"
                  >
                    {selectedUser.verifiedVerifikator
                      ? "✓ Terverifikasi"
                      : "✗ Belum"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-action mt-6">
            <button
              class="btn btn-neutral btn-sm"
              onclick={() => (selectedUser = null)}>Tutup</button
            >
          </div>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="modal-backdrop bg-black/40 backdrop-blur-xs"
          role="button"
          tabindex="0"
          onclick={() => (selectedUser = null)}
          onkeydown={(e) => e.key === "Enter" && (selectedUser = null)}
        ></div>
      </dialog>
    </div>
  {/if}
</div>
