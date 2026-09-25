<script lang="ts">
  import { onMount, onDestroy, tick, type Snippet } from "svelte";

  let {
    file,
    hasSignature = true,
    controls = false,
    onclose = undefined,
    ondownload = undefined,
    children = undefined,
  }: {
    file: File | null;
    hasSignature?: boolean;
    controls?: boolean;
    /**
     * Called by the toolbar's close button. The `file` prop is owned by the
     * parent, so the parent has to clear it — the component only tears down its
     * own render state and leaves the decision to the caller.
     */
    onclose?: () => void;
    /**
     * Called by the toolbar's download button instead of the default
     * object-URL save. A caller may hold the document as a `File`, or — as the
     * verify page does when the document came from a server claim or a blob
     * handoff — as a URL with no `File` behind it, in which case the built-in
     * save has nothing to read and this takes over.
     */
    ondownload?: (file: File | null) => void;
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
  let loadError = $state<string | null>(null);

  const GAP = 10;
  const BUFFER = 3;
  const PADDING = 1; // 1rem = 16px (p-4)
  const DPI_SCALE = 1.5; // Increase for higher resolution (2x = ~150 DPI, 3x = ~225 DPI)
  // Zoomed pages get big fast (a 612pt page at 4x is ~3700px of canvas), so cap
  // the render scale independently of the on-screen scale.
  const MAX_RENDER_SCALE = 4;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;
  const ZOOM_STEP = 0.25;

  let zoom = $state(1);
  let currentPage = $state(0);
  // Held separately from `currentPage` so a half-typed page number ("1" on the way
  // to "12") isn't stomped by the scroll-sync effect.
  let pageDraft: string | number = $state("");
  let pageInputFocused = $state(false);
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
      // A new document starts at fit-width, first page.
      zoom = 1;
      currentPage = 0;
      pageDraft = "";
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
    loadError = null;

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
      loadError = err?.message || "File tidak valid atau rusak, gagal dimuat.";
    } finally {
      // Keep the loading task reference so cleanup() can destroy it later
      // (pdfjs-dist v4+ relies on loadingTask.destroy(), not pdfDoc.destroy()).
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
      // pdfjs-dist v4+ removed PDFDocumentProxy.destroy(); the loading
      // task is the canonical destroy entrypoint (it also destroys the
      // document). Guard anyway so teardown never throws.
      try {
        pdfDoc.destroy?.();
      } catch {}
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
    loadError = null;
  }

  /**
   * Toolbar close. Tear down our own render state first so nothing is left
   * holding canvases, then hand the decision to the owner — `file` is their
   * prop, and only they can clear it.
   */
  function closeDocument() {
    currentFile = null;
    zoom = 1;
    currentPage = 0;
    pageDraft = "";
    cleanup();
    onclose?.();
  }

  /**
   * The auto-fit scale for a page, multiplied by the user's zoom. Both the
   * layout heights and the canvas render must go through this one helper,
   * otherwise the page grows without the pixels being drawn to match.
   */
  function fitScale(
    pageWidth: number,
    pageHeight: number,
    containerWidth: number,
    containerHeight: number,
  ) {
    const fit = Math.min(
      containerWidth / pageWidth,
      containerHeight / pageHeight,
    );
    return fit * zoom;
  }

  // --- Layout calculation ---
  function recomputeLayout() {
    if (!containerEl || pageSizes.length === 0) return;
    const containerWidth = containerEl.clientWidth - PADDING * 2;
    const containerHeight = containerEl.clientHeight - PADDING * 2;

    pageHeights = pageSizes.map((s) =>
      Math.round(
        s.height * fitScale(s.width, s.height, containerWidth, containerHeight),
      ),
    );

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

  function setZoom(next: number) {
    // Anchor on the page currently in view so zooming doesn't lose the user's
    // place: remember its viewport-relative offset before relayout.
    const anchor = currentPage > 0 ? currentPage - 1 : 0;
    const before = containerEl ? (offsets[anchor] ?? 0) : 0;
    const beforeTop = containerEl ? containerEl.scrollTop : 0;
    const anchorScreen = before - beforeTop;

    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));

    recomputeLayout();
    updateVisible();
    if (!containerEl) return;
    // Put the anchored page back where it was on screen. `offsets` is only
    // correct after a layout pass, so this runs on the next frame.
    requestAnimationFrame(() => {
      if (!containerEl) return;
      containerEl.scrollTop = (offsets[anchor] ?? 0) - anchorScreen;
      scheduleUpdate();
    });
  }

  function zoomIn() {
    setZoom(zoom + ZOOM_STEP);
  }

  function zoomOut() {
    setZoom(zoom - ZOOM_STEP);
  }

  function resetZoom() {
    setZoom(1);
  }

  function goToPage(target: number) {
    if (!containerEl) return;
    const clamped = Math.min(pageCount, Math.max(1, Math.round(target)));
    const index = clamped - 1;
    if (!offsets[index] && offsets[index] !== 0) return;
    containerEl.scrollTo({
      top: offsets[index],
      behavior: "smooth",
    });
    currentPage = clamped;
    pageDraft = clamped;
  }

  function commitPageDraft() {
    const value = Number(pageDraft);
    if (Number.isFinite(value) && pageDraft !== "") goToPage(value);
    else pageDraft = currentPage;
  }

  function changePage(delta: number) {
    goToPage(currentPage + delta);
  }

  // Track the page in view so the input reflects where the user actually is.
  $effect(() => {
    if (!containerEl || pageCount === 0) return;
    const onScroll = () => {
      const index = findIndexByOffset(containerEl!.scrollTop);
      currentPage = index + 1;
      if (!pageInputFocused) pageDraft = currentPage;
    };
    containerEl.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => containerEl?.removeEventListener("scroll", onScroll);
  });

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

    // Scale to fit both width and height (auto-fit), then apply the user's zoom
    displayScale = fitScale(
      vp1.width,
      vp1.height,
      containerWidth,
      containerHeight,
    );

    // High-resolution scale for canvas, capped so a large zoom doesn't allocate
    // an enormous canvas backing store.
    const renderScale = Math.min(displayScale * DPI_SCALE, MAX_RENDER_SCALE);

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

    wrap.appendChild(canvas);
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
  class="group/preview relative w-full h-full min-h-0 max-w-7xl mx-auto flex flex-col"
>
  <!--
    View controls. The component owns `pageCount`, the scroller and the scale, so
    the bar lives here rather than in each caller: it stays correct for both the
    signing preview (with draggable signature boxes) and the read-only verify
    preview, and callers just opt in with `controls`.

    The bar floats over the document instead of sitting in flow, so it no longer
    eats scroll height — only the scroller below grows, and the bar overlays the
    top of the pages. It is revealed on hover of the whole preview (so the
    pointer only has to reach the scroller, not the bar itself, to summon it) and
    on `focus-within`, which keeps it reachable by keyboard; both also restore
    pointer events, since a hidden bar must not swallow clicks meant for the page.

    The bar is a single centred pill, not a full-width strip. Bumping
    `--radius-field` on it rounds every control inside: DaisyUI's `.btn`/`.input`
    take their radius from that variable and it inherits, so the children pick up
    the pill shape with no per-child overrides. Within the bar, goto and zoom are
    each a `join` group — they fuse into one control, which is what `join` is
    for, and each group still picks up the bar's rounding.
  -->
  {#if controls && pageCount > 0 && !loadError && !passwordCancelled}
    <div
      class="absolute top-2 inset-x-0 mx-auto z-10 flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-full bg-base-100 px-2 py-1.5 border border-base-300 shadow-lg opacity-0 pointer-events-none transition-opacity [--radius-field:9999px] group-hover/preview:opacity-100 group-hover/preview:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto"
    >
      <div class="join">
        <button
          type="button"
          class="btn btn-xs btn-ghost join-item"
          aria-label="Halaman sebelumnya"
          title="Halaman sebelumnya"
          disabled={currentPage <= 1}
          onclick={() => changePage(-1)}
        >
          <iconify-icon icon="bx:chevron-left" class="text-base"></iconify-icon>
        </button>
        <label
          class="input input-xs join-item flex basis-24 items-center gap-1 px-1"
          class:opacity-50={pageCount === 0}
        >
          <span class="sr-only">Nomor halaman</span>
          <input
            type="text"
            inputmode="numeric"
            class="w-full min-w-0 text-center text-xs"
            aria-label="Nomor halaman"
            bind:value={pageDraft}
            onfocus={() => (pageInputFocused = true)}
            onblur={() => {
              pageInputFocused = false;
              commitPageDraft();
            }}
            onkeydown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitPageDraft();
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
          />
          <span class="shrink-0 text-xs whitespace-nowrap">/ {pageCount}</span>
        </label>
        <button
          type="button"
          class="btn btn-xs btn-ghost join-item"
          aria-label="Halaman berikutnya"
          title="Halaman berikutnya"
          disabled={currentPage >= pageCount}
          onclick={() => changePage(1)}
        >
          <iconify-icon icon="bx:chevron-right" class="text-base"
          ></iconify-icon>
        </button>
      </div>

      <div class="join">
        <button
          type="button"
          class="btn btn-xs btn-ghost join-item"
          aria-label="Perkecil"
          title="Perkecil"
          disabled={zoom <= ZOOM_MIN}
          onclick={zoomOut}
        >
          <iconify-icon icon="bx:minus" class="text-base"></iconify-icon>
        </button>
        <button
          type="button"
          class="btn btn-xs btn-ghost join-item w-14 font-mono text-xs tabular-nums"
          title="Reset zoom ke 100%"
          aria-label="Reset zoom ke 100%"
          onclick={resetZoom}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          class="btn btn-xs btn-ghost join-item"
          aria-label="Perbesar"
          title="Perbesar"
          disabled={zoom >= ZOOM_MAX}
          onclick={zoomIn}
        >
          <iconify-icon icon="bx:plus" class="text-base"></iconify-icon>
        </button>
      </div>

      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Unduh PDF"
        aria-label="Unduh PDF"
        onclick={() => {
          // Hand off when asked to, otherwise save the File we rendered.
          if (ondownload) return ondownload(currentFile);
          if (!currentFile) return;
          const url = URL.createObjectURL(currentFile);
          const a = document.createElement("a");
          a.href = url;
          a.download = currentFile.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }}
      >
        <iconify-icon icon="bx:download" class="text-base"></iconify-icon>
        Unduh
      </button>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        title="Tutup dokumen"
        aria-label="Tutup dokumen"
        onclick={closeDocument}
      >
        <iconify-icon icon="bx:x" class="text-base"></iconify-icon>
        Tutup
      </button>
    </div>
  {/if}

  <div
    bind:this={containerEl}
    class="relative w-full min-h-0 grow overflow-y-auto rounded-2xl bg-base-200 p-4"
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
    {:else if loadError}
      <div
        class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8"
      >
        <iconify-icon icon="bx:error-circle" class="text-6xl text-error/60"
        ></iconify-icon>
        <h3 class="text-xl font-bold">Gagal Memuat Dokumen</h3>
        <p class="text-base-content/70 text-center max-w-sm">{loadError}</p>
        <button
          type="button"
          class="btn btn-primary"
          onclick={() => currentFile && openFile(currentFile)}
        >
          <iconify-icon icon="bx:refresh"></iconify-icon>
          Coba Lagi
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
