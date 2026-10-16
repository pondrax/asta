<script lang="ts">
  import { tick } from "svelte";
  import type {
    PreviewController,
    PreviewState,
  } from "$lib/components/preview.svelte";

  let {
    controller = null,
    preview,
    open = true,
  }: {
    controller?: PreviewController | null;
    preview: PreviewState;
    open?: boolean;
  } = $props();

  const THUMB_WIDTH = 88;

  let listEl: HTMLOListElement | null = $state(null);

  // Re-render every thumbnail whenever the document handle or page count
  // changes. Serialised on purpose: pdf.js renders one page at a time and a
  // burst of parallel renders is much slower than a simple queue.
  $effect(() => {
    // Depend on `sizes` (a fresh array per loaded document) rather than the
    // whole state object, so scrolling/zooming — which also republishes state —
    // doesn't re-render every thumbnail.
    const count = preview.sizes.length;
    const ctl = controller;
    const list = listEl;
    if (!ctl || !list || count === 0) return;

    let cancelled = false;
    (async () => {
      await tick();
      const canvases =
        list.querySelectorAll<HTMLCanvasElement>("canvas[data-thumb]");
      for (let i = 0; i < count && !cancelled; i++) {
        const canvas = canvases[i];
        if (!canvas) continue;
        try {
          await ctl.renderThumbnail(i + 1, canvas, THUMB_WIDTH);
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
  aria-label="Navigasi halaman"
>
  <div
    class="flex-none flex items-center justify-between gap-1 px-2.5 py-2 border-b border-base-300 text-[10px] font-bold tracking-[0.06em] uppercase text-base-content/60"
  >
    <span>Halaman</span>
    <span class="tabular-nums">{preview.pageCount || "-"}</span>
  </div>

  {#if preview.pageCount > 0}
    <ol
      class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-2 m-0 p-2.5 list-none"
      bind:this={listEl}
    >
      {#each Array(preview.pageCount) as _, i (i)}
        <li>
          <button
            type="button"
            class="relative block w-full p-0 border-0 bg-transparent cursor-pointer"
            aria-label={`Ke halaman ${i + 1}`}
            aria-current={preview.page === i + 1 ? "page" : undefined}
            onclick={() => controller?.goToPage(i + 1)}
          >
            <canvas
              data-thumb
              class="block w-full h-auto bg-base-100 border rounded shadow-sm transition-[border-color,box-shadow] duration-150 {preview.page ===
              i + 1
                ? 'border-primary ring-2 ring-primary'
                : 'border-base-300'}"
            ></canvas>
            <span
              class="absolute right-1 bottom-1 px-1.5 rounded-full text-[10px] leading-4 tabular-nums {preview.page ===
              i + 1
                ? 'bg-primary text-primary-content'
                : 'bg-neutral/70 text-neutral-content'}">{i + 1}</span
            >
          </button>
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
</aside>
