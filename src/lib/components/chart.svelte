<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { ApexOptions } from "apexcharts";
  import { browser } from "$app/environment";

  let {
    data = [],
    height = 200,
    title = "",
    subtitle = "",
    loading = false,
    collapsible = true,
    isCollapsed = $bindable(false),
    type = "area",
    card = true,
    categories = [
      { key: "info", color: "var(--color-primary)", label: "Info" },
      { key: "warn", color: "var(--color-warning)", label: "Warning" },
      { key: "error", color: "var(--color-error)", label: "Error" },
    ],
  } = $props();

  let chartInstance: any = null;
  let chartElement = $state<HTMLElement>();
  let isReady = $state(false);

  const getOptions = (chartData: any[]): ApexOptions => {
    if (!Array.isArray(chartData)) chartData = [];

    if (type === "donut") {
      const vals = chartData.map((d) => d.value ?? 0);
      const lbls = chartData.map((d) => d.label || "");
      return {
        series: vals,
        labels: lbls,
        chart: { type: "donut", height: height || 200 },
        colors: categories.length ? categories.map((c) => c.color) : undefined,
        dataLabels: { enabled: true, style: { fontSize: "10px", fontWeight: 800 } },
        legend: { show: true, position: "bottom", fontSize: "10px", fontWeight: 800 },
        plotOptions: { pie: { donut: { size: "60%" } } },
        tooltip: { theme: "light", style: { fontSize: "12px" } },
      };
    }

    const series = categories.map((cat) => ({
      name: cat.label,
      data: chartData.map((s) => {
        const val = s[cat.key] ?? (cat.key === "count" ? s.count : 0);
        return typeof val === "number" ? val : 0;
      }),
    }));

    const labels = chartData.map((s) => s.label || s.date || "");

    return {
      series,
      chart: {
        type: type as any,
        height: height || 200,
        toolbar: { show: false },
        animations: { enabled: true, speed: 400 },
        sparkline: { enabled: false },
        background: "transparent",
        fontFamily: "inherit",
      },
      colors: categories.map((cat) => cat.color),
      fill: type === "bar" ? {} : {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.4,
          opacityTo: 0.0,
          stops: [0, 100],
        },
      },
      stroke: type === "bar" ? { show: true, width: 0, colors: categories.map((c) => c.color) } : {
        curve: "smooth",
        width: 3,
      },
      grid: {
        show: true,
        borderColor: "rgba(128,128,128,0.1)",
        strokeDashArray: 4,
        padding: { left: 10, right: 10, top: 0, bottom: 0 },
      },
      dataLabels: { enabled: false },
      plotOptions: type === "bar" ? {
        bar: {
          columnWidth: "60%",
          borderRadius: 4,
          borderRadiusApplication: "end",
        },
      } : {},
      xaxis: {
        categories: labels,
        tickAmount: 8,
        labels: {
          show: true,
          style: {
            colors: "rgba(128,128,128,0.4)",
            fontSize: "9px",
            fontWeight: 800,
          },
          offsetY: -5,
          rotate: 0,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
      },
      yaxis: {
        show: false,
      },
      tooltip: {
        theme: "light",
        x: { show: true },
        y: {
          formatter: (val) => (val ?? 0).toString(),
          title: {
            formatter: (seriesName) => seriesName + ": ",
          },
        },
        style: {
          fontSize: "12px",
        },
      },
      legend: {
        show: false,
      },
    };
  };

  async function initChart() {
    if (!browser || chartInstance || isCollapsed) return;

    try {
      const ApexCharts = (await import("apexcharts")).default;
      if (chartElement) {
        chartInstance = new ApexCharts(chartElement, getOptions(data));
        await chartInstance.render();
        isReady = true;
      }
    } catch (e) {
      console.error("Failed to initialize ApexCharts:", e);
    }
  }

  onDestroy(() => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  });

  $effect(() => {
    if (
      browser &&
      !chartInstance &&
      !isCollapsed &&
      (data.length || !loading)
    ) {
      initChart();
    }

    if (chartInstance && (data.length || !loading)) {
      if (isCollapsed) {
        chartInstance.destroy();
        chartInstance = null;
        isReady = false;
      } else if (isReady) {
        const opts = getOptions(data);
        untrack(() => {
          chartInstance.updateOptions(opts);
        });
      }
    }
  });
</script>

<div
  class="w-full bg-base-100/50 p-3 rounded-2xl border border-base-300 relative group/chart overflow-hidden transition-all duration-500 {isCollapsed
    ? 'max-h-[80px]!'
    : 'max-h-[1000px]'}"
>
  <div class="flex justify-between items-center mb-3">
    <div>
      {#if subtitle}
        <span class="text-[8px] font-black uppercase tracking-[0.2em] opacity-30"
          >{subtitle}</span
        >
      {/if}
      {#if title}
        <div class="flex items-baseline gap-3">
          <span class="text-lg font-black font-mono tracking-tighter"
            >{title}</span
          >
        </div>
      {/if}
    </div>
    {#if collapsible}
      <button
        aria-label={isCollapsed ? "Expand Chart" : "Collapse Chart"}
        class="btn btn-circle btn-xs btn-ghost opacity-40"
        onclick={() => (isCollapsed = !isCollapsed)}
      >
        <iconify-icon icon="bx:{isCollapsed ? 'chevron-down' : 'chevron-up'}"
        ></iconify-icon>
      </button>
    {/if}
  </div>

  <div
    class="relative w-full transition-opacity duration-500 {isCollapsed
      ? 'opacity-0 h-0 pointer-events-none'
      : 'opacity-100'}"
  >
    {#if !isReady && !isCollapsed}
      <div
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 py-10"
      >
        <span class="loading loading-ring loading-lg text-primary opacity-20"
        ></span>
        <span class="text-[9px] font-black tracking-widest uppercase opacity-20"
          >Initializing Engine</span
        >
      </div>
    {/if}
    {#if !isCollapsed}
      <div
        bind:this={chartElement}
        class="w-full -my-8"
        style="min-height: {height || 200}px"
      ></div>
    {/if}
  </div>
</div>

<style>
  :global(.apexcharts-tooltip) {
    background: var(--color-base-100) !important;
    border: 1px solid var(--color-base-300) !important;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1) !important;
    border-radius: 12px !important;
    color: var(--color-base-content) !important;
  }
  :global(.apexcharts-tooltip-title) {
    background: var(--color-base-200) !important;
    border-bottom: 1px solid var(--color-base-300) !important;
    color: var(--color-base-content) !important;
    font-weight: 800 !important;
  }
  :global(.apexcharts-tooltip-text-label),
  :global(.apexcharts-tooltip-text-value) {
    color: var(--color-base-content) !important;
  }
</style>
