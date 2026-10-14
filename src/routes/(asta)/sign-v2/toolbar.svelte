<script lang="ts">
  export type SignTool =
    | "select"
    | "signature"
    | "initials"
    | "text"
    | "date"
    | "checkbox";

  let {
    activeTool = "select",
    onTool,
    onAddSignature,
    footerScope = "all",
    onFooterScope,
    onUndo,
    onRedo,
    canUndo = false,
    canRedo = false,
    hasSelection = false,
    onDeleteSelected,
    onClearAll,
    zoom = 1,
    page = 1,
    pageCount = 0,
    onZoomIn,
    onZoomOut,
    onZoomSet,
    onPagePrev,
    onPageNext,
    onPageSet,
    onDownload,
    onSign,
    canSign = false,
    signing = false,
  }: {
    activeTool?: SignTool;
    onTool?: (tool: SignTool) => void;
    onAddSignature?: () => void;
    footerScope?: "all" | "current";
    onFooterScope?: (scope: "all" | "current") => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    hasSelection?: boolean;
    onDeleteSelected?: () => void;
    onClearAll?: () => void;
    zoom?: number;
    page?: number;
    pageCount?: number;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onZoomSet?: (z: number) => void;
    onPagePrev?: () => void;
    onPageNext?: () => void;
    onPageSet?: (p: number) => void;
    onDownload?: () => void;
    onSign?: () => void;
    canSign?: boolean;
    signing?: boolean;
  } = $props();

  const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  let zoomMenuOpen = $state(false);
  let footerMenuOpen = $state(false);
  let pageDraft = $state<string | number>("");

  // Keep the page input in step with the scroller unless the user is mid-edit.
  $effect(() => {
    pageDraft = page;
  });

  function closeMenus() {
    zoomMenuOpen = false;
    footerMenuOpen = false;
  }

  function pickFooterScope(scope: "all" | "current") {
    onFooterScope?.(scope);
    closeMenus();
  }

  function commitPage() {
    const value = Number(pageDraft);
    if (Number.isFinite(value) && pageDraft !== "") onPageSet?.(value);
    else pageDraft = page;
  }
</script>

<svelte:window
  onclick={closeMenus}
  onkeydown={(e) => {
    if (e.key === "Escape") closeMenus();
  }}
/>

<div class="toolbar" role="toolbar" aria-label="Alat tanda tangan">
  <!-- history -->
  <div class="toolbar-group">
    <button
      type="button"
      class="btn btn-sm btn-ghost btn-square"
      title="Undo"
      aria-label="Undo"
      disabled={!canUndo}
      onclick={() => onUndo?.()}
    >
      <iconify-icon icon="bx:undo"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost btn-square"
      title="Redo"
      aria-label="Redo"
      disabled={!canRedo}
      onclick={() => onRedo?.()}
    >
      <iconify-icon icon="bx:redo"></iconify-icon>
    </button>
  </div>

  <div class="toolbar-separator"></div>

  <!-- select -->
  <div class="toolbar-group">
    <button
      type="button"
      class={activeTool === "select"
        ? "btn btn-sm btn-ghost btn-square btn-active"
        : "btn btn-sm btn-ghost btn-square"}
      title="Pilih / Geser"
      aria-label="Pilih / Geser"
      aria-pressed={activeTool === "select"}
      onclick={() => onTool?.("select")}
    >
      <iconify-icon icon="bx:pointer"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost btn-square"
      title="Hapus item terpilih"
      aria-label="Hapus item terpilih"
      disabled={!hasSelection}
      onclick={() => onDeleteSelected?.()}
    >
      <iconify-icon icon="bx:trash"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost btn-square"
      title="Hapus semua item"
      aria-label="Hapus semua item"
      onclick={() => onClearAll?.()}
    >
      <iconify-icon icon="bx:eraser"></iconify-icon>
    </button>
  </div>

  <div class="toolbar-separator"></div>

  <!-- insert tools -->
  <div class="toolbar-group">
    <button
      type="button"
      class="btn btn-sm btn-ghost"
      title="Tambahkan tanda tangan"
      aria-label="Tambahkan tanda tangan"
      onclick={() => onAddSignature?.()}
    >
      <iconify-icon icon="bx:image-add"></iconify-icon>
      <span>Visualisasi</span>
    </button>
    <div class="tool-dropdown">
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        title="Footer"
        aria-label="Footer"
        aria-haspopup="menu"
        aria-expanded={footerMenuOpen}
        onclick={(e) => {
          e.stopPropagation();
          footerMenuOpen = !footerMenuOpen;
        }}
      >
        <iconify-icon icon="bx:file-blank"></iconify-icon>
        <span>Footer</span>
        <span class="stepper__caret" aria-hidden="true">▾</span>
      </button>
      {#if footerMenuOpen}
        <ul class="stepper-menu" role="menu">
          <li>
            <button
              type="button"
              class="stepper-menu__item"
              onclick={() => pickFooterScope("current")}
            >
              Halaman Ini
              {#if footerScope === "current"}
                <span class="stepper-menu__check">✓</span>
              {/if}
            </button>
          </li>
          <li>
            <button
              type="button"
              class="stepper-menu__item"
              onclick={() => pickFooterScope("all")}
            >
              Semua Halaman
              {#if footerScope === "all"}
                <span class="stepper-menu__check">✓</span>
              {/if}
            </button>
          </li>
        </ul>
      {/if}
    </div>
    <button
      type="button"
      class={activeTool === "initials"
        ? "btn btn-sm btn-ghost btn-square btn-active"
        : "btn btn-sm btn-ghost btn-square"}
      title="Inisial"
      aria-label="Inisial"
      aria-pressed={activeTool === "initials"}
      onclick={() => onTool?.("initials")}
    >
      <iconify-icon icon="bx:text"></iconify-icon>
    </button>
    <button
      type="button"
      class={activeTool === "text"
        ? "btn btn-sm btn-ghost btn-square btn-active"
        : "btn btn-sm btn-ghost btn-square"}
      title="Teks"
      aria-label="Teks"
      aria-pressed={activeTool === "text"}
      onclick={() => onTool?.("text")}
    >
      <iconify-icon icon="bx:pencil"></iconify-icon>
    </button>
    <button
      type="button"
      class={activeTool === "date"
        ? "btn btn-sm btn-ghost btn-square btn-active"
        : "btn btn-sm btn-ghost btn-square"}
      title="Tanggal"
      aria-label="Tanggal"
      aria-pressed={activeTool === "date"}
      onclick={() => onTool?.("date")}
    >
      <iconify-icon icon="bx:calendar"></iconify-icon>
    </button>
    <button
      type="button"
      class={activeTool === "checkbox"
        ? "btn btn-sm btn-ghost btn-square btn-active"
        : "btn btn-sm btn-ghost btn-square"}
      title="Kotak centang"
      aria-label="Kotak centang"
      aria-pressed={activeTool === "checkbox"}
      onclick={() => onTool?.("checkbox")}
    >
      <iconify-icon icon="bx:checkbox"></iconify-icon>
    </button>
  </div>

  <div class="toolbar-separator"></div>

  <!-- zoom -->
  <div class="toolbar-group">
    <div class="stepper">
      <button
        type="button"
        class="stepper__button"
        title="Perkecil"
        aria-label="Perkecil"
        disabled={zoom <= 0.25}
        onclick={() => onZoomOut?.()}>−</button
      >
      <button
        type="button"
        class="stepper__value"
        title="Zoom"
        aria-label="Zoom"
        aria-haspopup="menu"
        aria-expanded={zoomMenuOpen}
        onclick={(e) => {
          e.stopPropagation();
          zoomMenuOpen = !zoomMenuOpen;
        }}
      >
        {Math.round(zoom * 100)}%
        <span class="stepper__caret" aria-hidden="true">▾</span>
      </button>
      <button
        type="button"
        class="stepper__button"
        title="Perbesar"
        aria-label="Perbesar"
        disabled={zoom >= 4}
        onclick={() => onZoomIn?.()}>+</button
      >

      {#if zoomMenuOpen}
        <ul class="stepper-menu" role="menu">
          <li>
            <button
              type="button"
              class="stepper-menu__item"
              onclick={() => {
                onZoomSet?.(1);
                closeMenus();
              }}
            >
              Sesuai Jendela
              {#if Math.abs(zoom - 1) < 0.001}
                <span class="stepper-menu__check">✓</span>
              {/if}
            </button>
          </li>
          {#each ZOOM_PRESETS as preset (preset)}
            <li>
              <button
                type="button"
                class="stepper-menu__item"
                onclick={() => {
                  onZoomSet?.(preset);
                  closeMenus();
                }}
              >
                {Math.round(preset * 100)}%
                {#if Math.abs(zoom - preset) < 0.001}
                  <span class="stepper-menu__check">✓</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <div class="toolbar-separator"></div>

  <!-- page navigation -->
  <div class="toolbar-group">
    <div class="stepper">
      <button
        type="button"
        class="stepper__button"
        title="Halaman sebelumnya"
        aria-label="Halaman sebelumnya"
        disabled={page <= 1}
        onclick={() => onPagePrev?.()}
      >
        <iconify-icon icon="bx:chevron-left"></iconify-icon>
      </button>
      <span class="stepper__value">
        <input
          class="stepper__input"
          type="text"
          inputmode="numeric"
          aria-label="Nomor halaman"
          bind:value={pageDraft}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitPage();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          onblur={commitPage}
        />
        <span class="stepper__caret">/ {pageCount}</span>
      </span>
      <button
        type="button"
        class="stepper__button"
        title="Halaman berikutnya"
        aria-label="Halaman berikutnya"
        disabled={pageCount === 0 || page >= pageCount}
        onclick={() => onPageNext?.()}
      >
        <iconify-icon icon="bx:chevron-right"></iconify-icon>
      </button>
    </div>
  </div>

  <div class="toolbar-separator"></div>

  <!-- download -->
  <div class="toolbar-group">
    <button
      type="button"
      class="btn btn-sm btn-ghost btn-square"
      title="Unduh dokumen"
      aria-label="Unduh dokumen"
      onclick={() => onDownload?.()}
    >
      <iconify-icon icon="bx:download"></iconify-icon>
    </button>
  </div>

  <div class="ml-auto"></div>

  <button
    type="button"
    id="tour-sign-button"
    class="btn btn-sm btn-primary"
    aria-label="Tanda Tangan Dokumen"
    disabled={!canSign}
    onclick={() => onSign?.()}
  >
    {#if signing}
      <span class="loading loading-spinner loading-xs"></span>
    {:else}
      <iconify-icon icon="bx:pen"></iconify-icon>
    {/if}
    Tanda Tangan
  </button>
</div>
