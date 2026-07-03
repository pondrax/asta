<script lang="ts">
  import { onMount, onDestroy, tick, type Snippet } from "svelte";

  let {
    file,
    hasSignature = true,
    children = undefined,
  }: {
    file: File | null;
    hasSignature?: boolean;
    children?: Snippet<
      [number, { width: number; height: number; ratio: number }[], number]
    >;
  } = $props();

  let pdfjsLib: typeof import("pdfjs-dist") | null = null;
  let pdfDoc: any = null;
  let containerEl: HTMLDivElement | null = null;
  let loadingTask: any = null;

  // Password-protected PDF state
  let showPasswordModal = $state(false);
  let passwordInput = $state("");
  let passwordError = $state("");
  let passwordResolve: ((pw: string | null) => void) | null = null;
  let passwordCancelled = $state(false);
  let currentFile: File | null = $state(null);

  const GAP = 10;
  const BUFFER = 3;
  const PADDING = 1; // 1rem = 16px (p-4)
  const DPI_SCALE = 1.5; // Increase for higher resolution (2x = ~150 DPI, 3x = ~225 DPI)
  let displayScale = $state(1);
  let displayVp: { width: number; height: number } = $state({
    width: 0,
    height: 0,
  });

  let pageCount = $state(0);
  let pageSizes: { width: number; height: number; ratio: number }[] = $state(
    [],
  );

  // $inspect(displayScale, pageSizes);
  let pageHeights: number[] = $state([]);
  let offsets: number[] = $state([]);
  let totalHeight = $state(0);

  const rendered = new Map<number, HTMLDivElement>();
  let rafId: number | null = null;
  let resizeObserver: ResizeObserver | null = null;

  // Initialize pdf.js
  onMount(async () => {
    if (!window.pdfjsLib) {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      window.pdfjsLib = pdfjs;
    }
    pdfjsLib = window.pdfjsLib;

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
    if (file) {
      // console.log("file", file, pdfjsLib, hasSignature);
      currentFile = file;
      passwordCancelled = false;
      openFile(file);
    }
  });

  // --- Password prompt ---
  function promptPassword(initialError = "") {
    return new Promise<string | null>((resolve) => {
      passwordInput = "";
      passwordError = initialError;
      passwordResolve = resolve;
      showPasswordModal = true;
    });
  }

  // --- Load PDF ---
  async function openFile(f: File) {
    if (!pdfjsLib) return setTimeout(() => openFile(f), 100);
    cleanup();

    console.log("hasSignature", hasSignature);
    const arrayBuffer = await f.arrayBuffer();

    // Try loading without password first
    try {
      const task = pdfjsLib.getDocument({
        data: arrayBuffer,
        useSystemFonts: true,
      });
      loadingTask = task;

      // Handle password-protected PDFs
      task.onPassword = async (
        callback: (password: string) => void,
        reason: number,
      ) => {
        // reason: 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD
        const err = reason === 2 ? "Kata sandi salah. Coba lagi." : "";

        const pw = await promptPassword(err);
        if (pw !== null) {
          callback(pw);
        } else {
          // User cancelled — show error in preview area
          task.destroy();
          loadingTask = null;
          showPasswordModal = false;
          passwordResolve = null;
          passwordCancelled = true;
        }
      };

      pdfDoc = await task.promise;
    } catch (err: any) {
      // If user cancelled password prompt, just reset silently
      if (err?.name === "PasswordException") {
        loadingTask = null;
        return;
      }
      throw err;
    } finally {
      loadingTask = null;
    }

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
    if (loadingTask) {
      try {
        loadingTask.destroy();
      } catch {}
      loadingTask = null;
    }
    if (pdfDoc) {
      pdfDoc.destroy();
      pdfDoc = null;
    }
    pageCount = 0;
    pageSizes = [];
    pageHeights = [];
    offsets = [];
    totalHeight = 0;
    showPasswordModal = false;
    passwordResolve = null;
    passwordCancelled = false;
  }

  // --- Layout calculation ---
  function recomputeLayout() {
    if (!containerEl || pageSizes.length === 0) return;
    const containerWidth = containerEl.clientWidth - PADDING * 2;
    const containerHeight = containerEl.clientHeight - PADDING * 2;

    pageHeights = pageSizes.map((s) => {
      // Calculate scale to fit both width and height
      const scaleW = containerWidth / s.width;
      const scaleH = containerHeight / s.height;
      const scale = Math.min(scaleW, scaleH);
      return Math.round(s.height * scale);
    });

    offsets = new Array(pageCount);
    let top = 0;
    for (let i = 0; i < pageCount; i++) {
      offsets[i] = top;
      top += pageHeights[i] + GAP;
    }
    totalHeight = Math.max(0, top - GAP);

    // Re-render all visible pages with new dimensions
    rendered.forEach((wrap) => wrap.remove());
    rendered.clear();
    scheduleUpdate();
  }

  // --- Scroll + Virtualization ---

  function scheduleUpdate() {
    if (typeof requestAnimationFrame === "undefined") return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      updateVisible();
      rafId = null;
    });
  }

  function findIndexByOffset(off: number) {
    if (offsets.length === 0) return 0;
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
    return Math.min(lo, offsets.length - 1);
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

  async function renderPage(num: number, top: number, displayHeight: number) {
    if (!pdfDoc || !containerEl) return;
    const page = await pdfDoc.getPage(num);

    const containerWidth = containerEl.clientWidth - PADDING * 2;
    const containerHeight = containerEl.clientHeight - PADDING * 2;
    const vp1 = page.getViewport({ scale: 1 });

    // Scale to fit both width and height (auto-fit)
    const scaleW = containerWidth / vp1.width;
    const scaleH = containerHeight / vp1.height;
    displayScale = Math.min(scaleW, scaleH);

    // High-resolution scale for canvas
    const renderScale = displayScale * DPI_SCALE;

    displayVp = page.getViewport({ scale: displayScale });
    const renderVp = page.getViewport({ scale: renderScale });

    // Wrapper div for page and overlay
    const wrap = document.createElement("div");
    wrap.className =
      "absolute left-1/2 -translate-x-1/2 inline-block rounded-lg bg-white border border-base-300 shadow overflow-hidden";
    wrap.style.top = `${top}px`;
    wrap.style.width = `${displayVp.width}px`;
    wrap.style.height = `${displayVp.height}px`;

    // Canvas for PDF page with high resolution
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    // Set canvas internal size to high resolution
    canvas.width = renderVp.width;
    canvas.height = renderVp.height;

    // Set canvas display size to match container
    canvas.style.width = `${displayVp.width}px`;
    canvas.style.height = `${displayVp.height}px`;

    // Improve canvas rendering quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Page number overlay
    const overlay = document.createElement("div");
    overlay.textContent = `Page ${num} / ${pageCount}`;
    overlay.className = "absolute top-2 right-3 badge badge-sm badge-primary";

    wrap.appendChild(canvas);
    wrap.appendChild(overlay);
    // console.log("hasSignature", hasSignature);
    if (!hasSignature) {
      // DRAFT watermark
      const watermark = document.createElement("div");
      watermark.textContent = "DRAFT";
      watermark.className =
        "absolute inset-0 flex items-center justify-center pointer-events-none -rotate-45 text-error/20 tracking-widest select-none";
      watermark.style.fontSize = `${displayVp.width * 0.15}px`;

      wrap.appendChild(watermark);
    }
    containerEl.querySelector(".pdf-layer")?.appendChild(wrap);
    rendered.set(num, wrap);

    // Render at high resolution
    await page.render({
      canvasContext: ctx,
      viewport: renderVp,
    }).promise;

    page.cleanup();
  }
</script>

<div
  bind:this={containerEl}
  class="relative w-full h-full max-w-7xl mx-auto overflow-y-auto p-4"
  onscroll={scheduleUpdate}
>
  {#if passwordCancelled}
    <div
      class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8"
    >
      <iconify-icon icon="bx:lock-alt" class="text-6xl text-error/60"
      ></iconify-icon>
      <h3 class="text-xl font-bold">Dokumen Diproteksi</h3>
      <p class="text-base-content/70 text-center max-w-sm">
        Dokumen tidak dapat dimuat karena dilindungi kata sandi.
      </p>
      <button
        type="button"
        class="btn btn-primary"
        onclick={() => {
          passwordCancelled = false;
          if (currentFile) openFile(currentFile);
        }}
      >
        <iconify-icon icon="bx:key"></iconify-icon>
        Masukkan Kata Sandi
      </button>
    </div>
  {:else}
    <div class="relative w-full" style="height: {totalHeight}px">
      <div class="pdf-layer absolute top-0 left-0 right-0 bottom-0"></div>
      <div
        class="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 z-1 overflow-clip"
        style="width: {displayVp.width}px;"
      >
        {@render children?.(displayScale, pageSizes, GAP)}
      </div>
    </div>
  {/if}
</div>

<!-- Password Modal -->
{#if showPasswordModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
  >
    <div class="bg-base-100 rounded-2xl shadow-2xl w-md max-w-[90vw] p-6">
      <h3 class="text-lg font-bold mb-1">Dokumen Terproteksi</h3>
      <p class="text-sm text-base-content/70 mb-4">
        PDF ini dilindungi kata sandi. Masukkan kata sandi untuk membuka.
      </p>

      {#if passwordError}
        <div class="alert alert-error text-sm py-2 mb-3">
          <iconify-icon icon="bx:lock-alt"></iconify-icon>
          <span>{passwordError}</span>
        </div>
      {/if}

      <form
        class="flex flex-col gap-3"
        onsubmit={(e) => {
          e.preventDefault();
          if (passwordInput && passwordResolve) {
            const resolve = passwordResolve;
            passwordResolve = null;
            showPasswordModal = false;
            resolve(passwordInput);
          }
        }}
      >
        <label class="floating-label">
          <span>Kata Sandi</span>
          <input
            type="password"
            class="input input-bordered w-full"
            bind:value={passwordInput}
            autofocus
            autocomplete="off"
          />
        </label>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => {
              if (passwordResolve) {
                passwordResolve(null);
                passwordResolve = null;
              }
              showPasswordModal = false;
              passwordCancelled = true;
              if (loadingTask) {
                try {
                  loadingTask.destroy();
                } catch {}
                loadingTask = null;
              }
            }}
          >
            Batal
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            disabled={!passwordInput}
          >
            Buka
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
