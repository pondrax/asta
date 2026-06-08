<script lang="ts">
  import { goto } from "$app/navigation";
  import { Chart, Tour } from "$lib/components";
  import { app } from "$lib/app/index.svelte";
  import { d } from "$lib/utils";
  import { getDashboard } from "$lib/remotes/stats.remote";

  const dashData = getDashboard({});
  const dash = $derived(dashData.current);

  const tourSteps = [
    {
      target: "#tour-me-stats",
      title: "Ringkasan Dokumen",
      content:
        "Lihat jumlah total dokumen, dokumen ditandatangani, dan draft Anda di sini.",
      placement: "bottom" as const,
    },
    {
      target: "#tour-me-chart",
      title: "Grafik Signed",
      content: "Grafik ini menunjukkan riwayat tanda tangan Anda setiap hari.",
      placement: "top" as const,
    },
    {
      target: "#tour-me-distribusi",
      title: "Distribusi Status",
      content:
        "Diagram donat ini memperlihatkan distribusi status seluruh dokumen Anda.",
      placement: "left" as const,
    },
    {
      target: "#tour-me-weekly",
      title: "Perbandingan Mingguan",
      content: "Bandingkan jumlah tanda tangan minggu ini dengan minggu lalu.",
      placement: "top" as const,
    },
    {
      target: "#tour-me-recent",
      title: "Dokumen Terbaru",
      content:
        "Daftar dokumen yang terakhir diperbarui. Klik 'Lihat Semua' untuk daftar lengkap.",
      placement: "top" as const,
    },
  ];

  $effect(() => {
    if (dash === null) goto("/");
  });

  function formatNumber(n: number) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString();
  }

  function statusColor(s: string | null) {
    if (s === "signed") return "success";
    if (s === "draft") return "warning";
    if (s === "failed") return "error";
    return "ghost";
  }

  function statusLabel(s: string | null) {
    if (s === "signed") return "Ditandatangani";
    if (s === "draft") return "Draft";
    if (s === "failed") return "Gagal";
    return s || "-";
  }

  let recentCollapsed = $state(false);

  let startDate = $state(d().subtract(1, "month").format("YYYY-MM-DD"));
  let endDate = $state(new Date().toISOString().split("T")[0]);

  const filteredDailyStats = $derived(
    dash?.dailyStats.filter((d) => {
      if (startDate && d.date < startDate) return false;
      if (endDate && d.date > endDate) return false;
      return true;
    }) ?? [],
  );

  function resetDateFilter() {
    startDate = "";
    endDate = "";
  }
</script>

<div class="px-5 overflow-x-clip pt-2 pb-10 space-y-6 max-w-7xl mx-auto">
  {#if dash}
    <div>
      <h3 class="text-xl font-bold">Overview</h3>
      <p class="text-xs opacity-40 font-mono">
        {d().format("dddd, DD MMMM YYYY")}
      </p>
    </div>

    <div
      id="tour-me-stats"
      class="stats stats-vertical lg:stats-horizontal shadow w-full"
    >
      <div class="stat">
        <div class="stat-figure text-primary text-3xl">
          <iconify-icon icon="bx:file"></iconify-icon>
        </div>
        <div class="stat-title">Dokumen Saya</div>
        <div class="stat-value text-4xl">
          {formatNumber(
            (dash.userDocCounts.signed || 0) +
              (dash.userDocCounts.draft || 0) +
              (dash.userDocCounts.failed || 0),
          )}
        </div>
      </div>
      <div class="stat">
        <div class="stat-figure text-success text-3xl">
          <iconify-icon icon="bx:check-circle"></iconify-icon>
        </div>
        <div class="stat-title">Ditandatangani</div>
        <div class="stat-value text-4xl text-success">
          {formatNumber(dash.userDocCounts.signed || 0)}
        </div>
      </div>
      <div class="stat">
        <div class="stat-figure text-warning text-3xl">
          <iconify-icon icon="bx:edit"></iconify-icon>
        </div>
        <div class="stat-title">Draft</div>
        <div class="stat-value text-4xl text-warning">
          {formatNumber(dash.userDocCounts.draft || 0)}
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
      {#if startDate || endDate}
        <button class="btn btn-ghost btn-xs mt-5" onclick={resetDateFilter}
          >Reset</button
        >
      {/if}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div id="tour-me-chart" class="lg:col-span-2">
        <Chart
          title="Signed"
          data={filteredDailyStats}
          height={250}
          type="area"
          categories={[
            { key: "signed", color: "var(--color-primary)", label: "Signed" },
          ]}
        />
      </div>
      <div id="tour-me-distribusi">
        <Chart
          title="Distribusi"
          data={(() => {
            const colorMap: Record<string, string> = {
              signed: "var(--color-success)",
              draft: "var(--color-warning)",
              queue: "var(--color-info)",
              failed: "var(--color-error)",
            };
            return dash.docStatuses.filter((s) => s.status !== "queue").map((s) => ({
              label: statusLabel(s.status),
              value: s.count,
              color: colorMap[s.status] || "var(--color-primary)",
            }));
          })()}
          height={200}
          type="donut"
          categories={dash.docStatuses.filter((s) => s.status !== "queue").map((s) => {
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
            {formatNumber(dash.userDocCounts.draft || 0)}
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
      id="tour-me-recent"
      class="bg-base-100/50 p-4 rounded-2xl border border-base-300 transition-all duration-500 {recentCollapsed
        ? 'max-h-[80px] overflow-hidden'
        : ''}"
    >
      <div class="flex justify-between items-center mb-3">
        <div>
          <span
            class="text-[8px] font-black uppercase tracking-[0.2em] opacity-30"
            >Riwayat</span
          >
          <div class="flex items-baseline gap-3">
            <span class="text-lg font-black font-mono tracking-tighter"
              >Dokumen Terbaru</span
            >
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a
            href="/me/documents"
            class="text-[9px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-all"
            >Lihat Semua</a
          >
          <button
            aria-label="Toggle"
            class="btn btn-circle btn-xs btn-ghost opacity-40"
            onclick={() => (recentCollapsed = !recentCollapsed)}
          >
            <iconify-icon
              icon="bx:{recentCollapsed ? 'chevron-down' : 'chevron-up'}"
            ></iconify-icon>
          </button>
        </div>
      </div>
      {#if !recentCollapsed}
        <div class="overflow-x-auto">
          <table class="table table-xs">
            <thead>
              <tr
                class="text-[9px] uppercase tracking-widest font-black opacity-40"
              >
                <th>Dokumen</th>
                <th>Status</th>
                <th>Diperbarui</th>
              </tr>
            </thead>
            <tbody>
              {#each dash.recentDocs as doc}
                <tr class="hover:bg-base-200/50">
                  <td class="font-mono text-xs max-w-48 truncate">
                    {doc.title || "-"}
                  </td>
                  <td>
                    <span
                      class="badge badge-sm badge-soft badge-{statusColor(
                        doc.status,
                      )}"
                    >
                      {statusLabel(doc.status)}
                    </span>
                  </td>
                  <td class="text-[10px] opacity-40 font-mono">
                    {doc.updated ? d(doc.updated).format("DD/MM HH:mm") : "-"}
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
  {/if}
</div>
