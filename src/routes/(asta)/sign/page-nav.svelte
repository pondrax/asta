<script lang="ts">
  import { tick } from "svelte";
  import type { TextMatch } from "@docx-editor.dev/core/editor";
  import type {
    PreviewController,
    SearchHit,
  } from "$lib/components/preview.svelte";
  import type { DocxEditorSetupHandle } from "$lib/docx-editor/editor-logic";
  import type { PlacementType } from "./types";
  import Visualizer from "./visualizer.svelte";

  let {
    controller = null,
    preview,
    open = $bindable(false),
    selected = null,
    selectedId = null,
    placements = $bindable([]),
    onEdit,
    onSelect,
    onDelete,
    tab = $bindable("halaman"),
    wordMode = false,
    wordHandle = null,
  }: {
    controller?: PreviewController | null;
    preview: { page: number; pageCount: number; sizes: unknown[] };
    open?: boolean;
    selected?: PlacementType | null;
    selectedId?: string | null;
    placements?: PlacementType[];
    /** Called once before a property field is committed, so the owner can
     *  push an undo snapshot of the pre-edit placement. */
    onEdit?: () => void;
    onSelect?: (id: string) => void;
    onDelete?: (id: string) => void;
    tab?: "halaman" | "properti";
    /** While the Word editor is open, replace page thumbnails with its outline
     *  and in-document search. */
    wordMode?: boolean;
    wordHandle?: DocxEditorSetupHandle | null;
  } = $props();

  const THUMB_WIDTH = 140;

  let listEl: HTMLOListElement | null = $state(null);
  let query = $state("");

  /** Full-text hits for the current query, one per matching page. */
  let hits = $state<SearchHit[]>([]);
  let searching = $state(false);
  let searchSeq = 0;

  const hitByPage = $derived(
    new Map(hits.map((h) => [h.page, h] as const)),
  );

  type WordOutlineItem = {
    readonly text: string;
    readonly level: number;
    readonly blockId: string;
  };

  let wordTab = $state<"judul" | "cari">("judul");
  let wordOutline = $state<WordOutlineItem[]>([]);
  let wordCurrentBlock = $state<string | null>(null);
  let wordFilter = $state("");
  let wordQuery = $state("");
  let wordMatchCase = $state(false);
  let wordWholeWord = $state(false);
  let wordMatchIndex = $state(-1);
  let wordSearchVersion = $state(0);
  let previousWordMatches: readonly TextMatch[] | null = null;

  const wordOutlineRows = $derived.by(() => {
    const needle = wordFilter.trim().toLowerCase();
    const items = needle
      ? wordOutline.filter((item) => item.text.toLowerCase().includes(needle))
      : wordOutline;
    const baseLevel =
      items.length > 0 ? Math.min(...items.map((item) => item.level)) : 0;
    return items.map((item) => ({
      ...item,
      indent: 8 + (item.level - baseLevel) * 14,
    }));
  });

  const wordMatches = $derived.by(() => {
    void wordSearchVersion;
    const editor = wordHandle?.editor;
    const q = wordQuery.trim();
    if (!editor || !q) return [] as TextMatch[];
    return editor.findMatches(q, {
      matchCase: wordMatchCase,
      wholeWord: wordWholeWord,
    }) as TextMatch[];
  });

  const wordMatchLabel = $derived.by(() => {
    if (!wordQuery.trim()) return "";
    if (wordMatches.length === 0) return "Tidak ada hasil";
    return wordMatchIndex >= 0
      ? `${wordMatchIndex + 1} / ${wordMatches.length}`
      : `${wordMatches.length} hasil`;
  });

  function refreshWordOutline() {
    const editor = wordHandle?.editor;
    if (!editor) {
      wordOutline = [];
      wordCurrentBlock = null;
      return;
    }
    wordOutline = editor.getOutline().map((item) => ({
      text: item.text,
      level: item.level,
      blockId: item.blockId,
    }));
    const from = editor.snapshot().selection?.from;
    wordCurrentBlock = from && "paraId" in from ? from.paraId : null;
  }

  $effect(() => {
    if (!wordMode) {
      wordOutline = [];
      wordCurrentBlock = null;
      return;
    }
    const editor = wordHandle?.editor;
    refreshWordOutline();
    if (!editor) return;
    const offChange = editor.on("change", () => {
      refreshWordOutline();
      wordSearchVersion += 1;
    });
    const offSelection = editor.on("selectionChange", refreshWordOutline);
    return () => {
      offChange();
      offSelection();
    };
  });

  // Opening the pane (or returning to the outline) re-reads the document, so
  // headings that arrived after the editor mounted still show up.
  $effect(() => {
    if (!wordMode || !open || wordTab !== "judul") return;
    refreshWordOutline();
  });

  $effect(() => {
    const matches = wordMatches;
    if (matches === previousWordMatches) return;
    previousWordMatches = matches;
    wordMatchIndex = -1;
  });

  function goToWordHeading(blockId: string) {
    const editor = wordHandle?.editor;
    if (!editor) return;
    editor.focus();
    editor.exec({
      type: "setSelection",
      range: {
        anchor: { paragraphId: blockId, offset: 0 },
        head: { paragraphId: blockId, offset: 0 },
      },
    });
    editor.scrollToBlock(blockId);
    wordCurrentBlock = blockId;
  }

  function goToWordMatch(index: number) {
    const editor = wordHandle?.editor;
    const match = wordMatches[index];
    if (!editor || !match) return;
    editor.focus();
    if (editor.selectMatch(match).ok) wordMatchIndex = index;
  }

  function stepWordMatch(delta: -1 | 1) {
    const count = wordMatches.length;
    if (count === 0) return;
    const from =
      wordMatchIndex < 0 ? (delta > 0 ? -1 : 0) : wordMatchIndex;
    goToWordMatch((from + delta + count) % count);
  }

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
    if (wordMode || active !== "halaman" || !ctl || q.length === 0) {
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
    if (wordMode || active !== "halaman" || !ctl || !list || pageList.length === 0)
      return;

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
  class="w-80 flex-none order-2 flex flex-col min-h-0 bg-base-100 border-l border-base-300 max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:w-[85vw] max-lg:max-w-[20rem] max-lg:shadow-xl {open
    ? ''
    : 'hidden'}"
  aria-label={wordMode ? "Panel navigasi Word" : "Panel kanan"}
>
  <div class="tabs tabs-border tabs-sm m-2 flex-none" role="tablist">
    {#if wordMode}
      <button
        type="button"
        role="tab"
        class={wordTab === "judul" ? "tab tab-active gap-1" : "tab gap-1"}
        aria-selected={wordTab === "judul"}
        onclick={() => (wordTab = "judul")}
      >
        <iconify-icon icon="bx:list-ul"></iconify-icon>
        Judul
      </button>
      <button
        type="button"
        role="tab"
        class={wordTab === "cari" ? "tab tab-active gap-1" : "tab gap-1"}
        aria-selected={wordTab === "cari"}
        onclick={() => (wordTab = "cari")}
      >
        <iconify-icon icon="bx:search"></iconify-icon>
        Cari
      </button>
    {:else}
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
    {/if}
    <button
      type="button"
      class="btn btn-sm btn-circle btn-ghost ml-auto lg:hidden"
      aria-label={wordMode ? "Tutup panel navigasi Word" : "Tutup panel navigasi halaman"}
      onclick={() => (open = false)}
    >
      ✕
    </button>
  </div>

  {#if wordMode}
    {#if wordTab === "judul"}
      <div class="flex-none px-2 pb-1.5">
        <label class="input input-xs w-full flex items-center gap-1.5">
          <iconify-icon
            icon="bx:search"
            class="text-base text-base-content/50 shrink-0"
          ></iconify-icon>
          <input
            type="text"
            class="grow min-w-0 text-xs"
            placeholder="Filter judul"
            aria-label="Filter judul"
            bind:value={wordFilter}
          />
          {#if wordFilter}
            <button
              type="button"
              class="shrink-0 text-base-content/50 hover:text-base-content"
              aria-label="Bersihkan filter judul"
              onclick={() => (wordFilter = "")}
            >
              <iconify-icon icon="bx:x" class="text-base"></iconify-icon>
            </button>
          {/if}
        </label>
      </div>

      {#if wordOutline.length === 0}
        <div
          class="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-base-content/60 text-[11px]"
        >
          <iconify-icon icon="bx:list-ul" class="text-[22px]"></iconify-icon>
          <span>Belum ada judul</span>
        </div>
      {:else if wordOutlineRows.length === 0}
        <div
          class="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-base-content/60 text-[11px]"
        >
          <iconify-icon icon="bx:search" class="text-[22px]"></iconify-icon>
          <span>Tidak ada judul untuk "{wordFilter}"</span>
        </div>
      {:else}
        <ul
          class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5 m-0 p-2 list-none"
          aria-label="Daftar judul dokumen"
        >
          {#each wordOutlineRows as item (item.blockId)}
            <li>
              <button
                type="button"
                class="block w-full text-left rounded py-1 pe-2 text-xs truncate transition-colors {wordCurrentBlock ===
                item.blockId
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-base-200'}"
                style="padding-inline-start: {item.indent}px"
                title={item.text || "Tanpa judul"}
                onclick={() => goToWordHeading(item.blockId)}
              >
                {item.text || "(Tanpa judul)"}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
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
            bind:value={wordQuery}
          />
          {#if wordQuery}
            <button
              type="button"
              class="shrink-0 text-base-content/50 hover:text-base-content"
              aria-label="Bersihkan pencarian"
              onclick={() => (wordQuery = "")}
            >
              <iconify-icon icon="bx:x" class="text-base"></iconify-icon>
            </button>
          {/if}
        </label>
      </div>

      <div class="flex-none flex items-center gap-3 px-2.5 pb-1.5 text-[11px]">
        <label class="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            class="checkbox checkbox-xs"
            bind:checked={wordMatchCase}
          />
          Samakan huruf
        </label>
        <label class="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            class="checkbox checkbox-xs"
            bind:checked={wordWholeWord}
          />
          Kata utuh
        </label>
      </div>

      {#if wordQuery.trim()}
        <div
          class="flex-none flex items-center justify-between px-2.5 pb-1 text-[10px] text-base-content/60"
        >
          <span aria-live="polite">{wordMatchLabel}</span>
          <span class="join">
            <button
              type="button"
              class="btn btn-xs btn-ghost join-item"
              aria-label="Hasil sebelumnya"
              disabled={wordMatches.length === 0}
              onclick={() => stepWordMatch(-1)}
            >
              <iconify-icon icon="bx:chevron-up"></iconify-icon>
            </button>
            <button
              type="button"
              class="btn btn-xs btn-ghost join-item"
              aria-label="Hasil berikutnya"
              disabled={wordMatches.length === 0}
              onclick={() => stepWordMatch(1)}
            >
              <iconify-icon icon="bx:chevron-down"></iconify-icon>
            </button>
          </span>
        </div>
      {/if}

      {#if !wordQuery.trim()}
        <div
          class="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-base-content/60 text-[11px]"
        >
          <iconify-icon icon="bx:search" class="text-[22px]"></iconify-icon>
          <span>Ketik untuk mencari di dokumen</span>
        </div>
      {:else if wordMatches.length === 0}
        <div
          class="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-base-content/60 text-[11px]"
        >
          <iconify-icon icon="bx:search" class="text-[22px]"></iconify-icon>
          <span>Tidak ada hasil untuk "{wordQuery}"</span>
        </div>
      {:else}
        <ul
          class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5 m-0 p-2 list-none"
          aria-label="Hasil pencarian dokumen"
        >
          {#each wordMatches as match, index}
            <li>
              <button
                type="button"
                class="block w-full text-left rounded px-2 py-1 text-[11px] leading-snug break-words transition-colors {index ===
                wordMatchIndex
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-base-200'}"
                aria-current={index === wordMatchIndex ? "true" : undefined}
                onclick={() => goToWordMatch(index)}
              >
                {#if match.contextBefore}<span class="opacity-60"
                    >{match.contextBefore}</span
                  >{/if}<mark
                  class="bg-warning text-warning-content rounded-[2px] px-0.5"
                  >{match.text}</mark
                >{#if match.contextAfter}<span class="opacity-60"
                    >{match.contextAfter}</span
                  >{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {:else}
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
                class="relative flex flex-col items-center w-full p-0 border-0 bg-transparent cursor-pointer"
                aria-label={`Ke halaman ${p}`}
                aria-current={preview.page === p ? "page" : undefined}
                onclick={() => controller?.goToPage(p)}
              >
                <div class="relative inline-block mx-auto">
                  <canvas
                    data-thumb
                    class="block w-[140px] h-auto bg-base-100 border rounded shadow-sm transition-[border-color,box-shadow] duration-150 {preview.page ===
                    p
                      ? 'border-primary ring-2 ring-primary'
                      : 'border-base-300'}"
                  ></canvas>
                  {#if placementsOn(p).length > 0}
                    <span
                      class="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] leading-3 bg-secondary text-secondary-content shadow-sm pointer-events-none"
                      title={`${placementsOn(p).length} visual di halaman ${p}`}
                    >
                      <iconify-icon icon="bx:pen"></iconify-icon>
                      {#if placementsOn(p).length > 1}
                        {placementsOn(p).length}
                      {/if}
                    </span>
                  {/if}
                </div>
                <span
                  class="mt-1 inline-block px-1.5 rounded-full text-[10px] leading-4 tabular-nums whitespace-nowrap {preview.page ===
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
    {:else if tab === "properti"}
      {#if selected}
        <div class="flex-1 min-h-0 overflow-y-auto p-2.5 border-b border-base-300">
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
                      class="input input-xs input-ghost w-full text-right !border-0 !outline-none focus:ring-0 focus:bg-base-200/50"
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
                      class="input input-xs input-ghost w-full text-right !border-0 !outline-none focus:ring-0 focus:bg-base-200/50"
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

        <div class="p-2 flex-1 flex flex-col min-h-0 bg-base-100">
          <div class="text-[11px] font-semibold mb-1 px-1 text-base-content/70 flex-none">Semua Visualisasi</div>
          <div class="flex-1 overflow-auto">
            <Visualizer bind:signatures={placements} {selectedId} {onSelect} {onDelete} />
          </div>
        </div>
      {:else}
        <div
          class="flex-1 flex flex-col items-center justify-center gap-1.5 p-4 text-center text-base-content/60 text-[11px]"
        >
          <iconify-icon icon="bx:pointer" class="text-[22px]"></iconify-icon>
          <span>Pilih tanda tangan untuk melihat propertinya</span>
        </div>
      {/if}
    {/if}
  {/if}
</aside>
