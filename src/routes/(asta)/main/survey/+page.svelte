<script lang="ts">
  import { Chart } from "$lib/components";
  import { getSurveyResults } from "$lib/remotes/survey.remote";
  import { d } from "$lib/utils";

  const results = getSurveyResults({});
  const data = $derived(results.current);

  function formatDate(ts: string | null) {
    if (!ts) return "-";
    return d(ts).format("DD/MM/YYYY HH:mm");
  }
</script>

<div class="px-6 py-4 space-y-4 max-w-7xl mx-auto">
  <h1 class="text-2xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent">
    Survey Kepuasan
  </h1>

  {#if !data}
    <div class="flex items-center justify-center h-full opacity-40 py-20">
      <p>Memuat data survey...</p>
    </div>
  {:else}
    <div class="stats stats-vertical lg:stats-horizontal shadow w-full">
      <div class="stat">
        <div class="stat-figure text-primary text-3xl">
          <iconify-icon icon="bx:clipboard"></iconify-icon>
        </div>
        <div class="stat-title">Total Responden</div>
        <div class="stat-value text-4xl">{data.total}</div>
      </div>
      <div class="stat">
        <div class="stat-figure text-warning text-3xl">
          <iconify-icon icon="bx:star"></iconify-icon>
        </div>
        <div class="stat-title">Rata-rata Rating</div>
        <div class="stat-value text-4xl text-warning">{data.avgRating}</div>
        <div class="stat-desc text-xs">dari 5</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <Chart
          title="Distribusi Rating"
          data={[1, 2, 3, 4, 5].map((n) => ({
            label: `${n} Bintang`,
            value: data.ratingCounts[n] || 0,
            color:
              n <= 2
                ? "var(--color-error)"
                : n === 3
                  ? "var(--color-warning)"
                  : "var(--color-success)",
          }))}
          height={250}
          type="donut"
          categories={[1, 2, 3, 4, 5].map((n) => ({
            key: "",
            color:
              n <= 2
                ? "var(--color-error)"
                : n === 3
                  ? "var(--color-warning)"
                  : "var(--color-success)",
            label: `${n} Bintang`,
          }))}
        />
      </div>
      <div class="space-y-2">
        <span class="text-[8px] font-black uppercase tracking-[0.2em] opacity-30">Detail Rating</span>
        {#each [5, 4, 3, 2, 1] as n}
          <div class="flex items-center gap-3">
            <span class="text-xs font-mono w-16 text-right">{n} Bintang</span>
            <div class="flex-1 h-4 bg-base-200 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500 {n <= 2
                  ? 'bg-error'
                  : n === 3
                    ? 'bg-warning'
                    : 'bg-success'}"
                style="width: {data.total > 0 ? ((data.ratingCounts[n] || 0) / data.total) * 100 : 0}%"
              ></div>
            </div>
            <span class="text-xs font-mono w-8">{data.ratingCounts[n] || 0}</span>
          </div>
        {/each}
      </div>
    </div>

    {#if data.responses.length > 0}
      <div class="bg-base-100/50 p-4 rounded-2xl border border-base-300">
        <span class="text-[8px] font-black uppercase tracking-[0.2em] opacity-30 mb-3 block"
          >Feedback & Kritik</span
        >
        <div class="space-y-2">
          {#each data.responses as r}
            {#if r.feedback}
              <div class="bg-base-200/50 p-3 rounded-xl text-sm">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-warning font-mono text-xs">{r.rating}/5</span>
                  <span class="text-[10px] opacity-40 font-mono">{formatDate(r.created)}</span>
                </div>
                <p class="opacity-80">{r.feedback}</p>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
