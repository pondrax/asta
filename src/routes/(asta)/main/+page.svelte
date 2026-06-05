<script lang="ts">
  import { Chart, Tour } from "$lib/components";
  import { app } from "$lib/app/index.svelte";
  import { d } from "$lib/utils";
  import { getAdminDashboard } from "$lib/remotes/stats.remote";

  const dashData = getAdminDashboard({});
  const dash = $derived(dashData.current);

  const tourSteps = [
    {
      target: "#tour-main-stats",
      title: "Statistik Sistem",
      content: "Ringkasan seluruh dokumen, pengguna, dan signer dalam sistem.",
      placement: "bottom" as const,
    },
    {
      target: "#tour-main-chart",
      title: "Grafik Signed & Verified",
      content: "Grafik tanda tangan dan verifikasi harian seluruh pengguna.",
      placement: "top" as const,
    },
    {
      target: "#tour-main-distribusi",
      title: "Distribusi Status",
      content: "Distribusi status dokumen seluruh pengguna.",
      placement: "left" as const,
    },
    {
      target: "#tour-main-weekly",
      title: "Perbandingan Mingguan",
      content: "Bandingkan jumlah tanda tangan minggu ini dengan minggu lalu.",
      placement: "top" as const,
    },
    {
      target: "#tour-main-signers",
      title: "Top Signers",
      content: "Pengguna dengan tanda tangan terbanyak.",
      placement: "top" as const,
    },
    {
      target: "#tour-main-logs",
      title: "Log Aktivitas",
      content: "Catatan aktivitas sistem secara real-time.",
      placement: "top" as const,
    },
  ];

  function formatNumber(n: number) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString();
  }

  function statusColor(s: string | null) {
    if (s === "signed") return "success";
    if (s === "draft") return "warning";
    if (s === "queue") return "info";
    if (s === "failed") return "error";
    return "ghost";
  }

  function statusLabel(s: string | null) {
    if (s === "signed") return "Ditandatangani";
    if (s === "draft") return "Draft";
    if (s === "queue") return "Antrean";
    if (s === "failed") return "Gagal";
    return s || "-";
  }

  function logLevel(l: string | null) {
    if (l === "error") return "text-error bg-error/10";
    if (l === "warn") return "text-warning bg-warning/10";
    return "text-info bg-info/10";
  }

  let logsCollapsed = $state(false);

  let startDate = $state(d().subtract(1, "month").format("YYYY-MM-DD"));
  let endDate = $state(new Date().toISOString().split("T")[0]);

  const filteredDailyStats = $derived(
    dash?.dailyStats.filter((d: any) => {
      if (startDate && d.date < startDate) return false;
      if (endDate && d.date > endDate) return false;
      return true;
    }) ?? [],
  );

  function resetDateFilter() {
    startDate = d().subtract(1, "month").format("YYYY-MM-DD");
    endDate = new Date().toISOString().split("T")[0];
  }
</script>

{#if !dash}
  <div class="flex items-center justify-center h-full opacity-40">
    <p>Memuat data dashboard...</p>
  </div>
{:else}
  <div class="px-6 py-4 space-y-4 max-w-7xl mx-auto">
    <div>
      <h1
        class="text-2xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent"
      >
        Dashboard Admin
      </h1>
      <p class="text-xs opacity-40 font-mono">
        {d().format("dddd, DD MMMM YYYY")}
      </p>
    </div>

    <div
      id="tour-main-stats"
      class="stats stats-vertical lg:stats-horizontal shadow w-full"
    >
      <div class="stat">
        <div class="stat-figure text-primary text-3xl">
          <iconify-icon icon="bx:file"></iconify-icon>
        </div>
        <div class="stat-title">Total Dokumen</div>
        <div class="stat-value text-4xl">
          {formatNumber(dash.totalDocs || 0)}
        </div>
      </div>
      <div class="stat">
        <div class="stat-figure text-success text-3xl">
          <iconify-icon icon="bx:check-circle"></iconify-icon>
        </div>
        <div class="stat-title">Ditandatangani</div>
        <div class="stat-value text-4xl text-success">
          {formatNumber(dash.totalCounts.signed || 0)}
        </div>
      </div>
      <div class="stat">
        <div class="stat-figure text-warning text-3xl">
          <iconify-icon icon="bx:edit"></iconify-icon>
        </div>
        <div class="stat-title">Draft</div>
        <div class="stat-value text-4xl text-warning">
          {formatNumber(dash.totalCounts.draft || 0)}
        </div>
      </div>
      <div class="stat">
        <div class="stat-figure text-info text-3xl">
          <iconify-icon icon="bx:time"></iconify-icon>
        </div>
        <div class="stat-title">Antrean</div>
        <div class="stat-value text-4xl text-info">
          {formatNumber(dash.totalCounts.queue || 0)}
        </div>
      </div>
      <div class="stat">
        <div class="stat-figure text-secondary text-3xl">
          <iconify-icon icon="bx:user"></iconify-icon>
        </div>
        <div class="stat-title">Total Pengguna</div>
        <div class="stat-value text-4xl">
          {formatNumber(dash.totalUsers)}
        </div>
      </div>
      <div class="stat">
        <div class="stat-figure text-accent text-3xl">
          <iconify-icon icon="bx:id-card"></iconify-icon>
        </div>
        <div class="stat-title">Total Signers</div>
        <div class="stat-value text-4xl">
          {formatNumber(dash.totalSigners)}
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <label class="form-control">
        <span
          class="label-text text-[10px] uppercase tracking-widest opacity-40 font-black"
          >Dari</span
        >
        <input
          type="date"
          class="input input-bordered input-xs w-36"
          bind:value={startDate}
        />
      </label>
      <label class="form-control">
        <span
          class="label-text text-[10px] uppercase tracking-widest opacity-40 font-black"
          >Sampai</span
        >
        <input
          type="date"
          class="input input-bordered input-xs w-36"
          bind:value={endDate}
        />
      </label>
      <button class="btn btn-ghost btn-xs mt-5" onclick={resetDateFilter}
        >Reset</button
      >
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div id="tour-main-chart" class="lg:col-span-2">
        <Chart
          title="Signed &amp; Verified"
          data={filteredDailyStats}
          height={250}
          type="area"
          categories={[
            { key: "signed", color: "var(--color-primary)", label: "Signed" },
            {
              key: "verified",
              color: "var(--color-accent)",
              label: "Verified",
            },
          ]}
        />
      </div>
      <div id="tour-main-distribusi">
        <Chart
          title="Distribusi"
          data={(() => {
            const colorMap: Record<string, string> = {
              signed: "var(--color-success)",
              draft: "var(--color-warning)",
              queue: "var(--color-info)",
              failed: "var(--color-error)",
            };
            return dash.docStatuses.map((s: any) => ({
              label: statusLabel(s.status),
              value: s.count,
              color: colorMap[s.status] || "var(--color-primary)",
            }));
          })()}
          height={200}
          type="donut"
          categories={dash.docStatuses.map((s: any) => {
            const cm: Record<string, string> = {
              signed: "var(--color-success)",
              draft: "var(--color-warning)",
              queue: "var(--color-info)",
              failed: "var(--color-error)",
            };
            return {
              key: "",
              color: cm[s.status] || "var(--color-primary)",
              label: statusLabel(s.status),
            };
          })}
        />
      </div>
      <div class="flex flex-col gap-4">
        <div class="bg-base-100/50 p-3 rounded-2xl border border-base-300">
          <div class="flex items-center gap-3">
            <div class="w-1.5 h-1.5 rounded-full bg-warning"></div>
            <span
              class="text-[8px] font-black uppercase tracking-[0.2em] opacity-40"
              >Draft</span
            >
          </div>
          <div class="text-2xl font-black font-mono tracking-tighter mt-1">
            {formatNumber(dash.totalCounts.draft || 0)}
          </div>
        </div>
        <div class="bg-base-100/50 p-3 rounded-2xl border border-base-300">
          <div class="flex items-center gap-3">
            <div class="w-1.5 h-1.5 rounded-full bg-info"></div>
            <span
              class="text-[8px] font-black uppercase tracking-[0.2em] opacity-40"
              >Antrean</span
            >
          </div>
          <div class="text-2xl font-black font-mono tracking-tighter mt-1">
            {formatNumber(dash.totalCounts.queue || 0)}
          </div>
        </div>
      </div>
    </div>

    <div
      id="tour-me-weekly"
      class="stats stats-vertical lg:stats-horizontal shadow w-full"
    >
      <div class="stat">
        <div class="stat-figure text-primary text-3xl">
          <iconify-icon icon="bx:line-chart"></iconify-icon>
        </div>
        <div class="stat-title">Signed Minggu Ini</div>
        <div class="stat-value text-4xl">
          {formatNumber(dash.weeklyComparison.thisWeek)}
        </div>
        <div class="stat-desc text-xs">
          <iconify-icon
            icon={dash.weeklyComparison.thisWeek >=
            dash.weeklyComparison.lastWeek
              ? "bx:trending-up"
              : "bx:trending-down"}
          ></iconify-icon>
          {dash.weeklyComparison.thisWeek - dash.weeklyComparison.lastWeek} dari
          minggu lalu ({dash.weeklyComparison.lastWeek})
        </div>
      </div>
      <div class="stat">
        <div class="stat-figure text-accent text-3xl">
          <iconify-icon icon="bx:calendar-week"></iconify-icon>
        </div>
        <div class="stat-title">Signed Minggu Lalu</div>
        <div class="stat-value text-4xl">
          {formatNumber(dash.weeklyComparison.lastWeek)}
        </div>
        <div class="stat-desc text-xs">
          {dash.weeklyComparison.lastWeek > 0
            ? (
                (dash.weeklyComparison.thisWeek /
                  dash.weeklyComparison.lastWeek -
                  1) *
                100
              ).toFixed(0) + "% change"
            : "No data"}
        </div>
      </div>
    </div>
    <div
      id="tour-main-signers"
      class="bg-base-100/50 p-4 rounded-2xl border border-base-300"
    >
      <div class="flex justify-between items-center mb-3">
        <div>
          <span
            class="text-[8px] font-black uppercase tracking-[0.2em] opacity-30"
            >Peringkat</span
          >
          <div class="flex items-baseline gap-3">
            <span class="text-lg font-black font-mono tracking-tighter"
              >Top Signers</span
            >
          </div>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="table table-xs">
          <thead>
            <tr
              class="text-[9px] uppercase tracking-widest font-black opacity-40"
            >
              <th>#</th>
              <th>Nama / Email</th>
              <th class="text-right">Signed</th>
            </tr>
          </thead>
          <tbody>
            {#each dash.topSigners as signer, i}
              <tr class="hover:bg-base-200/50">
                <td class="text-xs font-mono opacity-40 w-8">{i + 1}</td>
                <td class="font-mono text-xs max-w-48 truncate"
                  >{signer.name || signer.email}</td
                >
                <td class="text-right font-mono text-xs font-bold"
                  >{signer.count}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <div
      id="tour-main-logs"
      class="bg-base-100/50 p-4 rounded-2xl border border-base-300 transition-all duration-500 {logsCollapsed
        ? 'max-h-[80px] overflow-hidden'
        : ''}"
    >
      <div class="flex justify-between items-center mb-3">
        <div>
          <span
            class="text-[8px] font-black uppercase tracking-[0.2em] opacity-30"
            >Sistem</span
          >
          <div class="flex items-baseline gap-3">
            <span class="text-lg font-black font-mono tracking-tighter"
              >Log Aktivitas</span
            >
          </div>
        </div>
        <button
          aria-label="Toggle"
          class="btn btn-circle btn-xs btn-ghost opacity-40"
          onclick={() => (logsCollapsed = !logsCollapsed)}
        >
          <iconify-icon
            icon="bx:{logsCollapsed ? 'chevron-down' : 'chevron-up'}"
          ></iconify-icon>
        </button>
      </div>
      {#if !logsCollapsed}
        <div class="overflow-x-auto">
          <table class="table table-xs">
            <thead>
              <tr
                class="text-[9px] uppercase tracking-widest font-black opacity-40"
              >
                <th>Level</th>
                <th>Pesan</th>
                <th>URL</th>
                <th>Waktu</th>
              </tr>
            </thead>
            <tbody>
              {#each dash.recentLogs as log}
                <tr class="hover:bg-base-200/50">
                  <td>
                    <span
                      class="badge badge-xs font-black uppercase border-none {logLevel(
                        log.level,
                      )}"
                    >
                      {log.level}
                    </span>
                  </td>
                  <td class="font-mono text-[10px] max-w-md truncate"
                    >{log.message || "-"}</td
                  >
                  <td class="text-[10px] font-mono opacity-40 max-w-32 truncate"
                    >{log.url || "-"}</td
                  >
                  <td class="text-[10px] font-mono opacity-40">
                    {log.created ? d(log.created).format("DD/MM HH:mm") : "-"}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <a
        href="/sign"
        class="bg-base-100/50 p-4 rounded-2xl border border-base-300 hover:bg-base-200/50 transition-all flex flex-col gap-1.5"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"
          >
            <iconify-icon icon="bx:pen" class="text-lg text-primary"
            ></iconify-icon>
          </div>
          <span class="font-bold text-sm">Tanda Tangan</span>
        </div>
        <span class="text-[10px] opacity-40 leading-tight"
          >Upload & tanda tangan dokumen secara elektronik</span
        >
      </a>
      <a
        href="/verify"
        class="bg-base-100/50 p-4 rounded-2xl border border-base-300 hover:bg-base-200/50 transition-all flex flex-col gap-1.5"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0"
          >
            <iconify-icon icon="bx:check-shield" class="text-lg text-success"
            ></iconify-icon>
          </div>
          <span class="font-bold text-sm">Verifikasi</span>
        </div>
        <span class="text-[10px] opacity-40 leading-tight"
          >Verifikasi keaslian tanda tangan dokumen</span
        >
      </a>
      <a
        href="/templates"
        class="bg-base-100/50 p-4 rounded-2xl border border-base-300 hover:bg-base-200/50 transition-all flex flex-col gap-1.5"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"
          >
            <iconify-icon icon="bx:file-blank" class="text-lg text-accent"
            ></iconify-icon>
          </div>
          <span class="font-bold text-sm">Templates</span>
        </div>
        <span class="text-[10px] opacity-40 leading-tight"
          >Gunakan template dokumen siap pakai</span
        >
      </a>
      <a
        href="/profile"
        class="bg-base-100/50 p-4 rounded-2xl border border-base-300 hover:bg-base-200/50 transition-all flex flex-col gap-1.5"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center shrink-0"
          >
            <iconify-icon icon="bx:user" class="text-lg text-info"
            ></iconify-icon>
          </div>
          <span class="font-bold text-sm">Profil</span>
        </div>
        <span class="text-[10px] opacity-40 leading-tight"
          >Kelola informasi akun dan preferensi</span
        >
      </a>
    </div>

    {#if app.showTour}
      <Tour
        steps={tourSteps}
        onComplete={() => {
          app.showTour = false;
        }}
        onSkip={() => {
          app.showTour = false;
        }}
      />
    {/if}
  </div>
{/if}
