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

  {#if signerEmail}
    <div class="toolbar-signer">{@render signerEmail()}</div>
  {/if}

  <div class="toolbar-separator"></div>

  <!-- visualisasi -->
  <div class="toolbar-group">
    <button
      type="button"
      class="btn btn-sm btn-ghost btn-square hidden! lg:inline-flex!"
      title="Tambah Gambar"
      aria-label="Tambah Gambar"
      disabled={visualMode !== "all"}
      onclick={() => onAddVisual?.("image")}
    >
      <iconify-icon icon="bx:image"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost btn-square hidden! lg:inline-flex!"
      title="Tambah QR"
      aria-label="Tambah QR"
      disabled={visualMode !== "all"}
      onclick={() => onAddVisual?.("qr")}
    >
      <iconify-icon icon="bx:qr"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost btn-square hidden! lg:inline-flex!"
      title="Tambah Kotak"
      aria-label="Tambah Kotak"
      disabled={visualMode !== "all"}
      onclick={() => onAddVisual?.("box")}
    >
      <iconify-icon icon="bx:box"></iconify-icon>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost btn-square hidden! lg:inline-flex!"
      title="Tanda Tangan"
      aria-label="Tanda Tangan"
      disabled={visualMode === "none"}
      onclick={() => onAddVisual?.("draw")}
    >
      <iconify-icon icon="bx:pencil"></iconify-icon>
    </button>

    <!-- small screens: one grouped dropdown -->
    <div class="tool-dropdown lg:hidden!">
      <button
        type="button"
        class="btn btn-sm btn-ghost btn-square"
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
        <ul class="stepper-menu" role="menu">
          {#if visualMode === "all"}
            <li>
              <button
                type="button"
                class="stepper-menu__item"
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
                class="stepper-menu__item"
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
                class="stepper-menu__item"
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
              class="stepper-menu__item"
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

    <div class="toolbar-separator"></div>

    <div class="tool-dropdown">
      <button
        type="button"
        class="btn btn-sm btn-ghost"
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
        <span class="stepper__caret" aria-hidden="true">▾</span>
      </button>
      {#if footerMenuOpen}
        <ul class="stepper-menu" role="menu">
          <li>
            <button
              type="button"
              class="stepper-menu__item"
              onclick={() => pickFooterScope("none")}
            >
              Tanpa Footer
              {#if footerMode === "none"}
                <span class="stepper-menu__check">✓</span>
              {/if}
            </button>
          </li>
          <li>
            <button
              type="button"
              class="stepper-menu__item"
              onclick={() => pickFooterScope("current")}
            >
              Halaman Ini
              {#if footerMode === "current"}
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
              {#if footerMode === "all"}
                <span class="stepper-menu__check">✓</span>
              {/if}
            </button>
          </li>
        </ul>
      {/if}
    </div>
    </div>

  <div class="toolbar-separator hidden! lg:block!"></div>

  <!-- select -->
  <div class="toolbar-group hidden! lg:flex!">
    <button
      type="button"
      class={activeTool === "select"
        ? "btn btn-sm btn-ghost btn-square btn-active"
        : "btn btn-sm btn-ghost btn-square"}
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
      disabled={!hasDocuments}
      onclick={() => onClearAll?.()}
    >
      <iconify-icon icon="bx:eraser"></iconify-icon>
    </button>
  </div>

  <div class="ml-auto"></div>

  <!-- document signature status -->
  <div class="toolbar-group">
    <div class="tool-dropdown tool-dropdown--end">
      <button
        type="button"
        class="btn btn-sm btn-ghost gap-1"
        title={hasSignature
          ? "Peringatan: Terdapat tanda tangan elektronik pada dokumen ini"
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
              ? "Peringatan: Terdapat TTD"
              : "Belum ditandatangani"}</span
        >
        {#if signatureInfos.length > 0}
          <span class="badge badge-xs badge-ghost font-mono"
            >{signatureInfos.length}</span
          >
        {/if}
        <span class="stepper__caret" aria-hidden="true">▾</span>
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
        <ul class="stepper-menu stepper-menu--wide" role="menu">
          {#if !hasDocuments}
            <li>
              <div class="stepper-menu__item opacity-60">
                Tidak ada dokumen
              </div>
            </li>
          {:else if signatureInfos.length === 0}
            <li>
              <div class="stepper-menu__item opacity-60">
                Tidak ada tanda tangan
              </div>
            </li>
          {:else}
            {#each signatureInfos as sig (sig.name)}
              <li>
                <div
                  class="stepper-menu__item"
                  style="display:block;text-align:left;white-space:normal"
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
