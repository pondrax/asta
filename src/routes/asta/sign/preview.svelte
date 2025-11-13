<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  let { file } = $props();

  let pdfjsLib: typeof import("pdfjs-dist") | null = null;
  let pdfDoc: any = null;
  let containerEl: HTMLDivElement | null = null;

  const GAP = 12;
  const BUFFER = 2;

  let pageCount = 0;
  let pageSizes: { width: number; height: number; ratio: number }[] = [];
  let pageHeights: number[] = [];
  let offsets: number[] = [];
  let totalHeight = $state(0);

  const rendered = new Map<number, HTMLDivElement>();
  let rafId: number | null = null;
  let resizeObserver: ResizeObserver | null = null;

  // Initialize pdf.js
  onMount(async () => {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    pdfjsLib = pdfjs;

    resizeObserver = new ResizeObserver(() => {
      recomputeLayout();
      scheduleUpdate();
    });
    if (containerEl) resizeObserver.observe(containerEl);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    if (typeof cancelAnimationFrame !== "undefined" && rafId)
      cancelAnimationFrame(rafId);
    cleanup();
  });

  // React when file changes
  $effect(() => {
    if (file) openFile(file);
  });

  // --- Load PDF ---
  async function openFile(f: File) {
    if (!pdfjsLib) return;
    cleanup();

    const arrayBuffer = await f.arrayBuffer();
    const task = pdfjsLib.getDocument({ data: arrayBuffer });
    pdfDoc = await task.promise;
    pageCount = pdfDoc.numPages;

    pageSizes = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfDoc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      pageSizes.push({
        width: vp.width,
        height: vp.height,
        ratio: vp.height / vp.width,
      });
    }

    recomputeLayout();
    scheduleUpdate();
  }

  // --- Cleanup ---
  function cleanup() {
    if (containerEl) containerEl.scrollTop = 0;
    rendered.forEach((el) => el.remove());
    rendered.clear();
    pdfDoc = null;
    pageCount = 0;
    pageSizes = [];
    pageHeights = [];
    offsets = [];
    totalHeight = 0;
  }

  // --- Layout calculation ---
  function recomputeLayout() {
    if (!containerEl || pageSizes.length === 0) return;
    const w = containerEl.clientWidth;
    pageHeights = pageSizes.map((s) => Math.round(w * s.ratio));
    offsets = new Array(pageCount);
    let top = 0;
    for (let i = 0; i < pageCount; i++) {
      offsets[i] = top;
      top += pageHeights[i] + GAP;
    }
    totalHeight = Math.max(0, top - GAP);
  }

  // --- Scroll + Virtualization ---
  function onScroll() {
    scheduleUpdate();
  }

  function scheduleUpdate() {
    if (typeof requestAnimationFrame === "undefined") return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      updateVisible();
      rafId = null;
    });
  }

  function findIndexByOffset(off: number) {
    let lo = 0,
      hi = offsets.length - 1;
    if (off <= 0) return 0;
    if (off >= offsets[hi]) return hi;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const top = offsets[mid];
      const bottom = top + pageHeights[mid];
      if (off >= top && off < bottom) return mid;
      if (off < top) hi = mid - 1;
      else lo = mid + 1;
    }
    return lo;
  }

  async function updateVisible() {
    if (!containerEl || pageCount === 0 || !pdfDoc) return;
    const top = containerEl.scrollTop;
    const bottom = top + containerEl.clientHeight;
    const start = Math.max(0, findIndexByOffset(top) - BUFFER);
    const end = Math.min(pageCount - 1, findIndexByOffset(bottom) + BUFFER);

    // remove offscreen
    rendered.forEach((wrap, num) => {
      const i = num - 1;
      if (i < start || i > end) {
        wrap.remove();
        rendered.delete(num);
      }
    });

    // render visible
    for (let i = start; i <= end; i++) {
      const num = i + 1;
      if (rendered.has(num)) continue;
      const wrapTop = offsets[i];
      renderPage(num, wrapTop, pageHeights[i]);
    }
  }

  async function renderPage(num: number, top: number, height: number) {
    if (!pdfDoc || !containerEl) return;
    const page = await pdfDoc.getPage(num);

    const containerWidth = containerEl.clientWidth;
    const containerHeight = containerEl.clientHeight;

    const vp1 = page.getViewport({ scale: 1 });

    // Auto-fit: if page height exceeds viewport, scale down to fit height
    const scale = Math.min(
      containerWidth / vp1.width,
      containerHeight / vp1.height,
    );

    const vp = page.getViewport({ scale });

    // Wrapper div for page and overlay
    const wrap = document.createElement("div");
    wrap.style.position = "absolute";
    wrap.style.top = `${top}px`;
    wrap.style.left = "50%";
    wrap.style.transform = "translateX(-50%)";
    wrap.style.display = "inline-block";
    wrap.style.borderRadius = "8px";
    wrap.style.background = "white";
    wrap.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
    wrap.style.overflow = "hidden";

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = vp.width;
    canvas.height = vp.height;
    canvas.style.display = "block";

    // Page number overlay
    const overlay = document.createElement("div");
    overlay.textContent = `${num} / ${pageCount}`;
    overlay.style.position = "absolute";
    overlay.style.bottom = "6px";
    overlay.style.right = "12px";
    overlay.style.fontSize = "12px";
    overlay.style.color = "#444";
    overlay.style.background = "rgba(255,255,255,0.7)";
    overlay.style.padding = "2px 6px";
    overlay.style.borderRadius = "6px";
    overlay.style.userSelect = "none";

    wrap.appendChild(canvas);
    wrap.appendChild(overlay);

    containerEl.querySelector(".pdf-layer")?.appendChild(wrap);
    rendered.set(num, wrap);

    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  }
</script>

<div bind:this={containerEl} class="viewer" onscroll={onScroll}>
  <div class="spacer" style="height: {totalHeight}px"></div>
  <div class="pdf-layer"></div>
</div>

<style>
  .viewer {
    position: relative;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background: #f8fafc;
  }

  .spacer {
    width: 100%;
    height: 100%;
  }

  .pdf-layer {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }
</style>
