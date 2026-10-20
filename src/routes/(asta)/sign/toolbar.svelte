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
    capSignature = false,
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
    /** The signer is capped at one signature visual (BSrE / signed document),
     *  so adding another replaces the existing signature. */
    capSignature?: boolean;
    signatureInfos?: {
      name: string;
      filter?: string;
      subFilter?: string;
      reason?: string;
      location?: string;
      date?: string;
      contactInfo?: string;
      signerCommonName?: string;
      signerOrg?: string;
      signerCountry?: string;
      signerEmail?: string;
      subjectName?: string;
      issuerName?: string;
      issuerCommonName?: string;
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

  /** Visual tools stay usable; a signed document just warns that placing one
   *  replaces the existing signature. */
  const visualsLocked = $derived(visualMode === "none");
  const lockTip = $derived(
    capSignature ? "akan mengganti tanda tangan lama" : null,
  );

  /** Tooltip for a visual tool: its own name, with the cap/replace warning
   *  appended in parentheses. */
  function visualTip(normal: string) {
    return lockTip ? `${normal} (${lockTip})` : normal;
  }

  const visualDisabled = $derived(visualsLocked);
</script>

<svelte:window
  onclick={closeMenus}
  onkeydown={(e) => {
    if (e.key === "Escape") closeMenus();
  }}
/>

<div
  id="tour-toolbar"
  class="relative flex flex-nowrap items-center gap-0.5 h-10 min-h-10 mx-1.5 mb-1.5 px-1.5 bg-base-200 rounded-full overflow-visible select-none"
  role="toolbar"
  aria-label="Alat tanda tangan"
>
  <!-- history -->
  <div class="flex items-center gap-px shrink-0">
    <!-- daisyUI's tooltip is a CSS :hover/:focus rule, and a disabled button
         gets neither — so the tip lives on a wrapper that stays hoverable. -->
    <div class="tooltip tooltip-bottom" data-tip="Urungkan">
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
        aria-label="Undo"
        disabled={!canUndo}
        onclick={() => onUndo?.()}
      >
        <iconify-icon icon="bx:undo"></iconify-icon>
      </button>
    </div>
    <div class="tooltip tooltip-bottom" data-tip="Ulangi">
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
        aria-label="Redo"
        disabled={!canRedo}
        onclick={() => onRedo?.()}
      >
        <iconify-icon icon="bx:redo"></iconify-icon>
      </button>
    </div>
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
    <div
      class="tooltip tooltip-bottom hidden! lg:inline-flex!"
      data-tip={visualTip("Tambah Gambar")}
    >
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
        aria-label="Tambah Gambar"
        disabled={visualDisabled}
        onclick={() => onAddVisual?.("image")}
      >
        <iconify-icon icon="bx:image"></iconify-icon>
      </button>
    </div>
    <div
      class="tooltip tooltip-bottom hidden! lg:inline-flex!"
      data-tip={visualTip("Tambah QR")}
    >
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
        aria-label="Tambah QR"
        disabled={visualDisabled}
        onclick={() => onAddVisual?.("qr")}
      >
        <iconify-icon icon="bx:qr"></iconify-icon>
      </button>
    </div>
    <div
      class="tooltip tooltip-bottom hidden! lg:inline-flex!"
      data-tip={visualTip("Tambah Kotak")}
    >
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
        aria-label="Tambah Kotak"
        disabled={visualDisabled}
        onclick={() => onAddVisual?.("box")}
      >
        <iconify-icon icon="bx:box"></iconify-icon>
      </button>
    </div>
    <div
      class="tooltip tooltip-bottom hidden! lg:inline-flex!"
      data-tip={visualTip("Gambar Tanda Tangan")}
    >
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
        aria-label="Tanda Tangan"
        disabled={visualDisabled}
        onclick={() => onAddVisual?.("draw")}
      >
        <iconify-icon icon="bx:pencil"></iconify-icon>
      </button>
    </div>

    <!-- small screens: one grouped dropdown -->
    <div
      class="relative inline-flex lg:hidden! tooltip tooltip-bottom"
      data-tip={visualTip("Visualisasi")}
    >
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
        aria-label="Visualisasi"
        aria-haspopup="menu"
        aria-expanded={visualMenuOpen}
        disabled={visualDisabled}
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

    <div
      class="relative inline-flex tooltip tooltip-bottom"
      data-tip={hasSignature ? "Footer (terkunci)" : "Footer"}
    >
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300"
        aria-label="Footer"
        aria-haspopup="menu"
        aria-expanded={footerMenuOpen}
        disabled={!hasDocuments || hasSignature}
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
          {#if hasSignature}
            <li>
              <div
                class="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-base-content/60"
              >
                <iconify-icon icon="bx:lock-alt"></iconify-icon>
                Footer terkunci — dibakar ke dokumen
              </div>
            </li>
          {:else}
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
          {/if}
        </ul>
      {/if}
    </div>
  </div>

  <div class="w-px h-6 mx-1 bg-base-300 shrink-0 hidden! lg:block!"></div>

  <!-- select -->
  <div class="flex items-center gap-px shrink-0 hidden! lg:flex!">
    <div class="tooltip tooltip-bottom" data-tip="Pilih / Geser">
      <button
        type="button"
        class={activeTool === "select"
          ? "btn btn-sm btn-ghost hover:bg-base-300 btn-square bg-primary/10 text-primary"
          : "btn btn-sm btn-ghost hover:bg-base-300 btn-square"}
        aria-label="Pilih / Geser"
        aria-pressed={activeTool === "select"}
        disabled={!hasDocuments}
        onclick={() => onTool?.("select")}
      >
        <iconify-icon icon="bx:pointer"></iconify-icon>
      </button>
    </div>
    <div class="tooltip tooltip-bottom" data-tip="Hapus item terpilih">
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
        aria-label="Hapus item terpilih"
        disabled={!hasSelection}
        onclick={() => onDeleteSelected?.()}
      >
        <iconify-icon icon="bx:trash"></iconify-icon>
      </button>
    </div>
    <div class="tooltip tooltip-bottom" data-tip="Hapus semua item">
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
        aria-label="Hapus semua item"
        disabled={!hasDocuments}
        onclick={() => onClearAll?.()}
      >
        <iconify-icon icon="bx:eraser"></iconify-icon>
      </button>
    </div>
  </div>

  <div class="ml-auto"></div>

  <!-- document signature status -->
  <div class="flex items-center gap-px shrink-0">
    <div
      class="relative inline-flex tooltip tooltip-bottom"
      data-tip="Status tanda tangan dokumen"
    >
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 gap-1"
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
        <div class="tooltip tooltip-bottom" data-tip="Verifikasi tanda tangan">
          <button
            type="button"
            class="btn btn-sm btn-primary gap-1"
            aria-label="Verifikasi tanda tangan"
            onclick={() => onVerify?.()}
          >
            <iconify-icon icon="bx:check-shield"></iconify-icon>
            <span class="hidden lg:inline">Verifikasi</span>
          </button>
        </div>
      {/if}
      {#if statusMenuOpen}
        <ul
          class="absolute top-full right-0 mt-1 min-w-[280px] max-h-[320px] overflow-y-auto p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-40"
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
            <li>
              <div
                class="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-success border-b border-base-300"
              >
                <iconify-icon icon="bx:check-circle"></iconify-icon>
                <div>
                  <div class="font-medium">Dokumen valid</div>
                  <div class="text-[10px] opacity-70">
                    Dokumen belum diubah, tanda tangan terintegritas
                  </div>
                  <div class="mt-0.5 inline-flex items-center gap-1 text-[9px]">
                    <span class="badge badge-xs badge-accent">LTV</span>
                  </div>
                </div>
              </div>
            </li>
            {#if capSignature}
              <li>
                <div
                  class="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-warning border-b border-base-300"
                >
                  <iconify-icon icon="bx:error"></iconify-icon>
                  Menambah visual akan mengganti tanda tangan lama
                </div>
              </li>
            {/if}
            {#each signatureInfos as sig, i (i)}
              <li>
                <div
                  class="block px-2.5 py-1.5 text-left text-[13px] whitespace-normal border-b border-base-200 last:border-b-0"
                >
                  <div class="flex items-center gap-1">
                    <iconify-icon icon="bx:check-shield"></iconify-icon>
                    <span class="font-medium">{sig.name}</span>
                  </div>
                  <dl class="mt-1 flex flex-col gap-0.5 text-[10px]">
                    {#if sig.subjectName}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Subject</dt>
                        <dd class="opacity-80 break-all">{sig.subjectName}</dd>
                      </div>
                    {:else if sig.signerCommonName && sig.signerCommonName !== sig.name}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Nama (CN)</dt>
                        <dd class="opacity-80">{sig.signerCommonName}</dd>
                      </div>
                    {/if}
                    {#if !sig.subjectName && sig.signerOrg}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Instansi</dt>
                        <dd class="opacity-80">{sig.signerOrg}</dd>
                      </div>
                    {/if}
                    {#if sig.signerEmail}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Email</dt>
                        <dd class="opacity-80 break-all">{sig.signerEmail}</dd>
                      </div>
                    {/if}
                    {#if sig.date}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Waktu</dt>
                        <dd class="opacity-80">{sig.date}</dd>
                      </div>
                    {/if}
                    {#if sig.reason}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Alasan</dt>
                        <dd class="opacity-80">{sig.reason}</dd>
                      </div>
                    {/if}
                    {#if sig.location}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Lokasi</dt>
                        <dd class="opacity-80">{sig.location}</dd>
                      </div>
                    {/if}
                    {#if sig.contactInfo}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Kontak</dt>
                        <dd class="opacity-80 break-all">{sig.contactInfo}</dd>
                      </div>
                    {/if}
                    {#if sig.issuerName || sig.issuerCommonName}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Penerbit</dt>
                        <dd class="opacity-80 break-all">
                          {sig.issuerName ?? sig.issuerCommonName}
                        </dd>
                      </div>
                    {/if}
                    {#if sig.subFilter}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Metode</dt>
                        <dd class="opacity-80 break-all">
                          {sig.filter ? `${sig.filter} · ` : ""}{sig.subFilter}
                        </dd>
                      </div>
                    {/if}
                  </dl>
                </div>
              </li>
            {/each}
          {/if}
        </ul>
      {/if}
    </div>
  </div>
</div>
