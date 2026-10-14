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
  class="page-pane"
  class:page-pane--hidden={!open}
  aria-label="Navigasi halaman"
>
  <div class="page-pane__head">
    <span>Halaman</span>
    <span class="page-pane__count">{preview.pageCount || "-"}</span>
  </div>

  {#if preview.pageCount > 0}
    <ol class="page-list" bind:this={listEl}>
      {#each Array(preview.pageCount) as _, i (i)}
        <li>
          <button
            type="button"
            class="page-card"
            class:page-card--active={preview.page === i + 1}
            aria-label={`Ke halaman ${i + 1}`}
            aria-current={preview.page === i + 1 ? "page" : undefined}
            onclick={() => controller?.goToPage(i + 1)}
          >
            <canvas data-thumb class="page-card__canvas"></canvas>
            <span class="page-card__num">{i + 1}</span>
          </button>
        </li>
      {/each}
    </ol>
  {:else}
    <div class="page-pane__empty">
      <iconify-icon icon="bx:file-blank"></iconify-icon>
      <span>Belum ada dokumen</span>
    </div>
  {/if}
</aside>
