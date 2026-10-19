<script lang="ts">
  import { tick } from "svelte";
  import type {
    PreviewController,
    SearchHit,
  } from "$lib/components/preview.svelte";
  import type { PlacementType } from "./types";

  let {
    controller = null,
    preview,
    open = false,
    selected = null,
    placements = [],
    onEdit,
    tab = $bindable("halaman"),
  }: {
    controller?: PreviewController | null;
    preview: { page: number; pageCount: number; sizes: unknown[] };
    open?: boolean;
    selected?: PlacementType | null;
    placements?: PlacementType[];
    /** Called once before a property field is committed, so the owner can
     *  push an undo snapshot of the pre-edit placement. */
    onEdit?: () => void;
    tab?: "halaman" | "properti";
  } = $props();

  const THUMB_WIDTH = 120;

  let listEl: HTMLOListElement | null = $state(null);
  let query = $state("");

  /** Full-text hits for the current query, one per matching page. */
  let hits = $state<SearchHit[]>([]);
  let searching = $state(false);
  let searchSeq = 0;

  const hitByPage = $derived(
    new Map(hits.map((h) => [h.page, h] as const)),
  );

  const kindLabel = (p: PlacementType | null) => {
    if (!p) return "-";
    if (p.kind === "checkbox") return "Kotak centang";
    if (p.kind === "date") return "Tanggal";
    if (p.kind === "text") return "Teks";
    return "Tanda tangan";
  };

  const round = (n: number) => Math.round((n ?? 0) * 10) / 10;

  const rows = $derived(
    selected
      ? [
          ["Tipe", null, kindLabel(selected)],
          ["Halaman", "number", "page"],
          ["Posisi X", "number", "originX"],
          ["Posisi Y", "number", "originY"],
          ["Lebar", "number", "width"],
          ["Tinggi", "number", "height"],
          ...(selected.kind === "text" || selected.kind === "date"
            ? [
                ["Ukuran font", "number", "size"],
                ["Teks", "text", "text"],
              ]
            : []),
          ...(selected.kind === "checkbox"
            ? [["Tercentang", "toggle", "checked"]]
            : []),
          ...(selected.kind === "signature"
            ? [
                ["Alasan", "text", "reason"],
                ["Lokasi", "text", "location"],
              ]
            : []),
        ]
      : [],
  );

  const placementsOn = (page: number) =>
    placements.filter((p) => (p.page ?? 1) === page);

  const pages = $derived(
    Array.from({ length: preview.pageCount }, (_, i) => i + 1).filter((n) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      if (String(n).includes(q)) return true;
      if (hitByPage.has(n)) return true;
      return placementsOn(n).some((p) =>
        kindLabel(p).toLowerCase().includes(q),
      );
    }),
  );

  // Full-text search across the document. Debounced and cancellable — pdf.js
  // text extraction is the expensive half, so only the latest query wins.
  $effect(() => {
    const q = query.trim();
    const ctl = controller;
    const active = tab;
    if (active !== "halaman" || !ctl || q.length === 0) {
      hits = [];
      searching = false;
      return;
    }
    const seq = ++searchSeq;
    searching = true;
    const t = setTimeout(async () => {
      let result: SearchHit[] = [];
      try {
        result = await ctl.searchDocument(q);
      } catch {
        result = [];
      }
      if (seq !== searchSeq) return;
      hits = result;
      searching = false;
    }, 220);
    return () => clearTimeout(t);
  });

  // Render page thumbnails only while the "Halaman" tab is showing.
  $effect(() => {
    const pageList = pages;
    const ctl = controller;
    const list = listEl;
    const active = tab;
    if (active !== "halaman" || !ctl || !list || pageList.length === 0) return;

    let cancelled = false;
    (async () => {
      await tick();
      const canvases =
        list.querySelectorAll<HTMLCanvasElement>("canvas[data-thumb]");
      for (let i = 0; i < pageList.length && !cancelled; i++) {
        const canvas = canvases[i];
        if (!canvas) continue;
        try {
          await ctl.renderThumbnail(pageList[i], canvas, THUMB_WIDTH);
        } catch {
          /* render cancelled or page torn down */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  });
</script>

<aside
  class="w-60 max-lg:w-36 flex-none order-2 flex flex-col min-h-0 bg-base-100 border-l border-base-300 {open
    ? ''
    : 'hidden'}"
  aria-label="Panel kanan"
>
  <div class="tabs tabs-border tabs-sm m-2 flex-none" role="tablist">
    <button
      type="button"
      role="tab"
      class={tab === "halaman" ? "tab tab-active gap-1" : "tab gap-1"}
      aria-selected={tab === "halaman"}
      onclick={() => (tab = "halaman")}
    >
      <iconify-icon icon="bx:file"></iconify-icon>
      Halaman
      {#if preview.pageCount > 0}
        <span class="badge badge-sm">{preview.pageCount}</span>
      {/if}
    </button>
    <button
      type="button"
      role="tab"
      class={tab === "properti" ? "tab tab-active gap-1" : "tab gap-1"}
      aria-selected={tab === "properti"}
      onclick={() => (tab = "properti")}
    >
      <iconify-icon icon="bx:list-ul"></iconify-icon>
      Properti
    </button>
  </div>

  {#if tab === "halaman"}
    <div class="flex-none px-2 pb-1.5">
      <label class="input input-xs w-full flex items-center gap-1.5">
        <iconify-icon
          icon="bx:search"
          class="text-base text-base-content/50 shrink-0"
        ></iconify-icon>
        <input
          type="text"
          class="grow min-w-0 text-xs"
          placeholder="Cari di dokumen"
          aria-label="Cari di dokumen"
          bind:value={query}
        />
        {#if searching}
          <span
            class="loading loading-spinner loading-xs shrink-0"
            aria-label="Mencari"
          ></span>
        {/if}
        {#if query}
          <button
            type="button"
            class="shrink-0 text-base-content/50 hover:text-base-content"
            aria-label="Bersihkan pencarian"
            onclick={() => (query = "")}
          >
            <iconify-icon icon="bx:x" class="text-base"></iconify-icon>
          </button>
        {/if}
      </label>
    </div>
  {/if}

  {#if tab === "halaman"}
    {#if preview.pageCount > 0 && pages.length === 0 && searching}
      <div
        class="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-base-content/60 text-[11px]"
      >
        <span class="loading loading-spinner loading-sm"></span>
        <span>Mencari di dokumen…</span>
      </div>
    {:else if preview.pageCount > 0 && pages.length === 0}
      <div
        class="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-base-content/60 text-[11px]"
      >
        <iconify-icon icon="bx:search" class="text-[22px]"></iconify-icon>
        <span>Tidak ada hasil untuk "{query}"</span>
      </div>
    {:else if preview.pageCount > 0}
      <ol
        class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-2 m-0 p-2.5 list-none"
        bind:this={listEl}
      >
        {#each pages as p (p)}
          {@const hit = hitByPage.get(p)}
          <li>
            <button
              type="button"
              class="relative block w-full p-0 border-0 bg-transparent cursor-pointer"
              aria-label={`Ke halaman ${p}`}
              aria-current={preview.page === p ? "page" : undefined}
              onclick={() => controller?.goToPage(p)}
            >
              <canvas
                data-thumb
                class="block w-full h-auto bg-base-100 border rounded shadow-sm transition-[border-color,box-shadow] duration-150 {preview.page ===
                p
                  ? 'border-primary ring-2 ring-primary'
                  : 'border-base-300'}"
              ></canvas>
              {#if placementsOn(p).length > 0}
                <span
                  class="absolute left-1 bottom-1 inline-flex items-center gap-0.5 px-1.5 rounded-full text-[10px] leading-4 bg-secondary text-secondary-content"
                  title={`${placementsOn(p).length} visual di halaman ${p}`}
                >
                  <iconify-icon icon="bx:pen"></iconify-icon>
                  {placementsOn(p).length}
                </span>
              {/if}
              <span
                class="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 rounded-full text-[10px] leading-4 tabular-nums whitespace-nowrap {preview.page ===
                p
                  ? 'bg-primary text-primary-content'
                  : 'bg-neutral/70 text-neutral-content'}">{p}</span
              >
            </button>
            {#if hit}
              <p
                class="mt-1 text-[10px] leading-snug text-base-content/60 break-words"
              >
                {#if hit.pre}<span class="opacity-60">{hit.pre}</span>{/if}<mark
                  class="bg-warning text-warning-content rounded-[2px] px-0.5"
                  >{hit.match}</mark
                >{#if hit.post}<span class="opacity-60">{hit.post}</span
                  >{/if}
              </p>
              {#if hit.count > 1}
                <span class="mt-0.5 block text-[9px] text-base-content/40"
                  >{hit.count} hasil di halaman ini</span
                >
              {/if}
            {/if}
          </li>
        {/each}
      </ol>
    {:else}
      <div
        class="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-base-content/60 text-[11px]"
      >
        <iconify-icon icon="bx:file-blank" class="text-[22px]"></iconify-icon>
        <span>Belum ada dokumen</span>
      </div>
    {/if}
  {:else if selected}
    <div class="flex-1 min-h-0 overflow-y-auto p-2.5">
      <div class="text-[10px] font-bold tracking-[0.06em] uppercase text-base-content/60 mb-2">
        {kindLabel(selected)}
      </div>
      <dl class="flex flex-col gap-0">
        {#each rows as [label, field, value] (label)}
          <div
            class="flex items-start justify-between gap-2 py-1.5 border-b border-base-200 last:border-b-0"
          >
            <dt class="text-[11px] text-base-content/50 shrink-0">{label}</dt>
            <dd class="text-[11px] text-right break-words tabular-nums w-full">
              {#if field === "text"}
                <input
                  type="text"
                  class="input input-xs w-full text-right"
                  value={String((selected as any)?.[value as any] ?? "")}
                  onchange={(e) => {
                    if (!selected) return;
                    const next = e.currentTarget.value;
                    if (String((selected as any)[value as any] ?? "") === next)
                      return;
                    onEdit?.();
                    (selected as any)[value as any] = next;
                  }}
                />
              {:else if field === "number"}
                <input
                  type="number"
                  class="input input-xs w-full text-right"
                  value={Number((selected as any)?.[value as any]) || 0}
                  onchange={(e) => {
                    if (!selected) return;
                    const next = parseFloat(e.currentTarget.value) || 0;
                    if ((Number((selected as any)[value as any]) || 0) === next)
                      return;
                    onEdit?.();
                    (selected as any)[value as any] = next;
                  }}
                />
              {:else if field === "toggle"}
                <label class="swap swap-flip justify-end w-full">
                  <input
                    type="checkbox"
                    checked={!!(selected as any)?.[value as any]}
                    onchange={(e) => {
                      if (!selected) return;
                      onEdit?.();
                      (selected as any)[value as any] = e.currentTarget.checked;
                    }}
                  />
                  <span class="swap-on text-[11px]">Ya</span>
                  <span class="swap-off text-[11px]">Tidak</span>
                </label>
              {:else}
                {value}
              {/if}
            </dd>
          </div>
        {/each}
      </dl>
    </div>
  {:else}
    <div
      class="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-base-content/60 text-[11px]"
    >
      <iconify-icon icon="bx:pointer" class="text-[22px]"></iconify-icon>
      <span>Pilih tanda tangan untuk melihat propertinya</span>
    </div>
  {/if}
</aside>
