<script lang="ts">
  import type { Snippet } from "svelte";

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
    onAddVisual,
    onUpload,
    visualMode = "all",
    hasSignature = false,
    signatureInfos = [],
    hasDocuments = false,
    onVerify,
    pageNavOpen = false,
    rightPaneOpen = false,
    onTogglePageNav,
    onToggleRight,
    footerMode = "none",
    onFooterScope,
    onUndo,
    onRedo,
    canUndo = false,
    canRedo = false,
    hasSelection = false,
    onDeleteSelected,
    onClearAll,
    onDownload,
    onShowMetadata,
    signerEmail,
  }: {
    activeTool?: SignTool;
    onTool?: (tool: SignTool) => void;
    onAddSignature?: () => void;
    onAddVisual?: (tab: "image" | "qr" | "box" | "draw") => void;
    onUpload?: () => void;
    visualMode?: "all" | "draw" | "none";
    hasSignature?: boolean;
    signatureInfos?: {
      name: string;
      reason?: string;
      location?: string;
      date?: string;
    }[];
    hasDocuments?: boolean;
    onVerify?: () => void;
    pageNavOpen?: boolean;
    rightPaneOpen?: boolean;
    onTogglePageNav?: () => void;
    onToggleRight?: () => void;
    footerMode?: "none" | "current" | "all";
    onFooterScope?: (scope: "none" | "current" | "all") => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    hasSelection?: boolean;
    onDeleteSelected?: () => void;
    onClearAll?: () => void;
    onDownload?: () => void;
    onShowMetadata?: () => void;
    signerEmail?: Snippet;
  } = $props();

  let footerMenuOpen = $state(false);
  let statusMenuOpen = $state(false);
  let visualMenuOpen = $state(false);

  function closeMenus() {
    footerMenuOpen = false;
    statusMenuOpen = false;
    visualMenuOpen = false;
  }

  function pickFooterScope(scope: "none" | "current" | "all") {
    onFooterScope?.(scope);
    closeMenus();
  }
</script>

<svelte:window
  onclick={closeMenus}
  onkeydown={(e) => {
    if (e.key === "Escape") closeMenus();
  }}
/>

<div
  class="relative flex flex-nowrap items-center gap-0.5 h-10 min-h-10 mx-1.5 mb-1.5 px-1.5 bg-base-200 rounded-full overflow-visible select-none"
  role="toolbar"
  aria-label="Alat tanda tangan"
>
  <!-- history -->
  <div class="flex items-center gap-px shrink-0">
    <button
      type="button"
      class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
      title="Undo"
      aria-label="Undo"
      disabled={!canUndo}
      onclick={() => onUndo?.()}
    >
      <iconify-icon icon="bx:undo"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
      title="Redo"
      aria-label="Redo"
      disabled={!canRedo}
      onclick={() => onRedo?.()}
    >
      <iconify-icon icon="bx:redo"></iconify-icon>
    </button>
  </div>

  <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>

  {#if signerEmail}
    <div class="relative max-lg:static shrink-0 flex items-center">
      {@render signerEmail()}
    </div>
    <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>
  {/if}

  <!-- visualisasi -->
  <div class="flex items-center gap-px shrink-0">
    <button
      type="button"
      class="btn btn-sm btn-ghost hover:bg-base-300 btn-square hidden! lg:inline-flex!"
      title="Tambah Gambar"
      aria-label="Tambah Gambar"
      disabled={visualMode !== "all"}
      onclick={() => onAddVisual?.("image")}
    >
      <iconify-icon icon="bx:image"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost hover:bg-base-300 btn-square hidden! lg:inline-flex!"
      title="Tambah QR"
      aria-label="Tambah QR"
      disabled={visualMode !== "all"}
      onclick={() => onAddVisual?.("qr")}
    >
      <iconify-icon icon="bx:qr"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost hover:bg-base-300 btn-square hidden! lg:inline-flex!"
      title="Tambah Kotak"
      aria-label="Tambah Kotak"
      disabled={visualMode !== "all"}
      onclick={() => onAddVisual?.("box")}
    >
      <iconify-icon icon="bx:box"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost hover:bg-base-300 btn-square hidden! lg:inline-flex!"
      title="Tanda Tangan"
      aria-label="Tanda Tangan"
      disabled={visualMode === "none"}
      onclick={() => onAddVisual?.("draw")}
    >
      <iconify-icon icon="bx:pencil"></iconify-icon>
    </button>

    <!-- small screens: one grouped dropdown -->
    <div class="relative inline-flex lg:hidden!">
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
        title="Visualisasi"
        aria-label="Visualisasi"
        aria-haspopup="menu"
        aria-expanded={visualMenuOpen}
        disabled={visualMode === "none"}
        onclick={(e) => {
          e.stopPropagation();
          visualMenuOpen = !visualMenuOpen;
        }}
      >
        <iconify-icon icon="bx:image-add"></iconify-icon>
      </button>
      {#if visualMenuOpen}
        <ul
          class="absolute top-full left-0 mt-1 min-w-[132px] p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-40"
          role="menu"
        >
          {#if visualMode === "all"}
            <li>
              <button
                type="button"
                class="flex items-center gap-3 w-full px-2.5 py-1.5 text-left text-[13px] text-base-content rounded hover:bg-base-200"
                onclick={() => {
                  closeMenus();
                  onAddVisual?.("image");
                }}
              >
                <iconify-icon icon="bx:image"></iconify-icon>
                Gambar
              </button>
            </li>
            <li>
              <button
                type="button"
                class="flex items-center gap-3 w-full px-2.5 py-1.5 text-left text-[13px] text-base-content rounded hover:bg-base-200"
                onclick={() => {
                  closeMenus();
                  onAddVisual?.("qr");
                }}
              >
                <iconify-icon icon="bx:qr"></iconify-icon>
                QR
              </button>
            </li>
            <li>
              <button
                type="button"
                class="flex items-center gap-3 w-full px-2.5 py-1.5 text-left text-[13px] text-base-content rounded hover:bg-base-200"
                onclick={() => {
                  closeMenus();
                  onAddVisual?.("box");
                }}
              >
                <iconify-icon icon="bx:box"></iconify-icon>
                Kotak
              </button>
            </li>
          {/if}
          <li>
            <button
              type="button"
              class="flex items-center gap-3 w-full px-2.5 py-1.5 text-left text-[13px] text-base-content rounded hover:bg-base-200"
              onclick={() => {
                closeMenus();
                onAddVisual?.("draw");
              }}
            >
              <iconify-icon icon="bx:pencil"></iconify-icon>
              Tanda Tangan
            </button>
          </li>
        </ul>
      {/if}
    </div>

    <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>

    <div class="relative inline-flex">
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300"
        title="Footer"
        aria-label="Footer"
        aria-haspopup="menu"
        aria-expanded={footerMenuOpen}
        disabled={!hasDocuments}
        onclick={(e) => {
          e.stopPropagation();
          footerMenuOpen = !footerMenuOpen;
        }}
      >
        <iconify-icon icon="bx:file-blank"></iconify-icon>
        <span class="hidden lg:inline">Footer</span>
        <span class="text-[10px] text-base-content/60" aria-hidden="true"
          >▾</span
        >
      </button>
      {#if footerMenuOpen}
        <ul
          class="absolute top-full left-0 mt-1 min-w-[132px] p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-40"
          role="menu"
        >
          <li>
            <button
              type="button"
              class="flex items-center gap-3 w-full px-2.5 py-1.5 text-left text-[13px] text-base-content rounded hover:bg-base-200"
              onclick={() => pickFooterScope("none")}
            >
              Tanpa Footer
              {#if footerMode === "none"}
                <span class="ml-auto text-xs pl-4">✓</span>
              {/if}
            </button>
          </li>
          <li>
            <button
              type="button"
              class="flex items-center gap-3 w-full px-2.5 py-1.5 text-left text-[13px] text-base-content rounded hover:bg-base-200"
              onclick={() => pickFooterScope("current")}
            >
              Halaman Ini
              {#if footerMode === "current"}
                <span class="ml-auto text-xs pl-4">✓</span>
              {/if}
            </button>
          </li>
          <li>
            <button
              type="button"
              class="flex items-center gap-3 w-full px-2.5 py-1.5 text-left text-[13px] text-base-content rounded hover:bg-base-200"
              onclick={() => pickFooterScope("all")}
            >
              Semua Halaman
              {#if footerMode === "all"}
                <span class="ml-auto text-xs pl-4">✓</span>
              {/if}
            </button>
          </li>
        </ul>
      {/if}
    </div>

    <button
      type="button"
      class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
      title="Panel Metadata"
      aria-label="Panel Metadata"
      disabled={!hasDocuments}
      onclick={() => onShowMetadata?.()}
    >
      <iconify-icon icon="bx:info-circle"></iconify-icon>
    </button>
  </div>

  <div class="w-px h-6 mx-1 bg-base-300 shrink-0 hidden! lg:block!"></div>

  <!-- select -->
  <div class="flex items-center gap-px shrink-0 hidden! lg:flex!">
    <button
      type="button"
      class={activeTool === "select"
        ? "btn btn-sm btn-ghost hover:bg-base-300 btn-square bg-primary/10 text-primary"
        : "btn btn-sm btn-ghost hover:bg-base-300 btn-square"}
      title="Pilih / Geser"
      aria-label="Pilih / Geser"
      aria-pressed={activeTool === "select"}
      disabled={!hasDocuments}
      onclick={() => onTool?.("select")}
    >
      <iconify-icon icon="bx:pointer"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
      title="Hapus item terpilih"
      aria-label="Hapus item terpilih"
      disabled={!hasSelection}
      onclick={() => onDeleteSelected?.()}
    >
      <iconify-icon icon="bx:trash"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
      title="Hapus semua item"
      aria-label="Hapus semua item"
      disabled={!hasDocuments}
      onclick={() => onClearAll?.()}
    >
      <iconify-icon icon="bx:eraser"></iconify-icon>
    </button>
  </div>

  <div class="ml-auto"></div>

  <!-- document signature status -->
  <div class="flex items-center gap-px shrink-0">
    <div class="relative inline-flex">
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 gap-1"
        title={hasSignature
          ? "Dokumen sudah memiliki tanda tangan elektronik"
          : "Status tanda tangan dokumen"}
        aria-label="Status tanda tangan dokumen"
        aria-haspopup="menu"
        aria-expanded={statusMenuOpen}
        onclick={(e) => {
          e.stopPropagation();
          statusMenuOpen = !statusMenuOpen;
        }}
      >
        <iconify-icon
          icon={!hasDocuments
            ? "bx:file-find"
            : hasSignature
              ? "bx:check-shield"
              : "bx:blank"}
          class={hasSignature ? "" : "opacity-60"}
        ></iconify-icon>
        <span class="hidden lg:inline"
          >{!hasDocuments
            ? "Tidak ada dokumen"
            : hasSignature
              ? "Sudah ditandatangani"
              : "Belum ditandatangani"}</span
        >
        {#if signatureInfos.length > 0}
          <span class="badge badge-xs badge-ghost font-mono"
            >{signatureInfos.length}</span
          >
        {/if}
        <span class="text-[10px] text-base-content/60" aria-hidden="true"
          >▾</span
        >
      </button>
      {#if hasDocuments && hasSignature}
        <button
          type="button"
          class="btn btn-sm btn-primary gap-1"
          title="Verifikasi tanda tangan"
          aria-label="Verifikasi tanda tangan"
          onclick={() => onVerify?.()}
        >
          <iconify-icon icon="bx:check-shield"></iconify-icon>
          <span class="hidden lg:inline">Verifikasi</span>
        </button>
      {/if}
      {#if statusMenuOpen}
        <ul
          class="absolute top-full right-0 mt-1 min-w-[280px] p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-40"
          role="menu"
        >
          {#if !hasDocuments}
            <li>
              <div class="flex items-center px-2.5 py-1.5 text-[13px] opacity-60">
                Tidak ada dokumen
              </div>
            </li>
          {:else if signatureInfos.length === 0}
            <li>
              <div class="flex items-center px-2.5 py-1.5 text-[13px] opacity-60">
                Tidak ada tanda tangan
              </div>
            </li>
          {:else}
            {#each signatureInfos as sig (sig.name)}
              <li>
                <div
                  class="block px-2.5 py-1.5 text-left text-[13px] whitespace-normal"
                >
                  <div class="flex items-center gap-1">
                    <iconify-icon icon="bx:check-shield"></iconify-icon>
                    {sig.name}
                  </div>
                  {#if sig.reason || sig.location}
                    <div class="text-[10px] opacity-60">
                      {[sig.reason, sig.location].filter(Boolean).join(" · ")}
                    </div>
                  {/if}
                  {#if sig.date}
                    <div class="text-[10px] opacity-60">{sig.date}</div>
                  {/if}
                </div>
              </li>
            {/each}
          {/if}
        </ul>
      {/if}
    </div>
  </div>
</div>
