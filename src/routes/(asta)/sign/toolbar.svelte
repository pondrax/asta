<script lang="ts">
  import type { Snippet } from "svelte";
  import type {
    SignatureVerificationResponse,
    VerifyDate,
  } from "$lib/types/verify";
  import type { SignatureVerification } from "$lib/utils/pdf";
  import type { DocxSelectionFormatting } from "$lib/docx-editor/editor-logic";

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
    selfSigned = false,
    hasSignature = false,
    hasPlacedSignature = false,
    capSignature = false,
    signatureInfos = [],
    localVerifications = [],
    bsreStatus = null,
    hasDocuments = false,
    verifyLoading = false,
    onVerify,
    onOpenPanel,
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
    mobileZoomOpen = false,
    onToggleMobileZoom,
    signerEmail,
    docxEditing = false,
    docxFormatting = null,
    onDocxCommand,
    onDocxInsertTable,
  }: {
    activeTool?: SignTool;
    onTool?: (tool: SignTool) => void;
    onAddSignature?: () => void;
    onAddVisual?: (tab: "image" | "qr" | "box" | "draw") => void;
    onUpload?: () => void;
    visualMode?: "all" | "draw" | "none";
    selfSigned?: boolean;
    hasSignature?: boolean;
    /** Whether at least one signature visual has been placed on the document. */
    hasPlacedSignature?: boolean;
    /** The signer is capped at one signature visual (BSrE / signed document),
     *  so adding another replaces the existing signature. */
    capSignature?: boolean;
    signatureInfos?: {
      name: string;
      fieldName?: string;
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
      signerValidFrom?: string;
      signerValidTo?: string;
    }[];
    /** Offline CMS checks for the active document. */
    localVerifications?: SignatureVerification[];
    /** Result of the last BSrE/BSSN check for the active document. */
    bsreStatus?: SignatureVerificationResponse | null;
    hasDocuments?: boolean;
    /** A server check is in flight; the button shows a spinner instead. */
    verifyLoading?: boolean;
    onVerify?: () => void;
    /** Opens the full verification panel. */
    onOpenPanel?: () => void;
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
    mobileZoomOpen?: boolean;
    onToggleMobileZoom?: () => void;
    signerEmail?: Snippet;
    /** Swap the signing tools for Word formatting controls. */
    docxEditing?: boolean;
    /** Formatting at the current DOCX selection, for toolbar state. */
    docxFormatting?: DocxSelectionFormatting | null;
    onDocxCommand?: (slot: string, value?: string | number) => void;
    onDocxInsertTable?: (rows: number, cols: number) => void;
  } = $props();

  let footerMenuOpen = $state(false);
  let statusMenuOpen = $state(false);
  let visualMenuOpen = $state(false);
  let wordMenu = $state<string | null>(null);
  let wordStyle = $state("Normal");
  let wordFont = $state("Arial");
  let wordFontSize = $state(11);
  let wordBold = $state(false);
  let wordItalic = $state(false);
  let wordUnderline = $state(false);
  let wordStrike = $state(false);
  let wordSuper = $state(false);
  let wordSub = $state(false);
  let wordColor = $state("FF0000");
  let wordHighlight = $state("yellow");
  let wordColorHex = $state("");
  const wordColorCss = $derived(
    wordColor === "auto" ? "#000000" : `#${wordColor.replace(/^#/, "")}`,
  );
  const wordColorHexValid = $derived(/^[0-9A-Fa-f]{6}$/.test(wordColorHex));
  let wordAlign = $state("left");
  let wordLineSpacing = $state(1);

  const wordStyles = [
    "Normal",
    "Title",
    "Subtitle",
    "Heading 1",
    "Heading 2",
    "Heading 3",
    "Heading 4",
    "Heading 5",
    "Heading 6",
    "Strong",
    "List Paragraph",
    "footnote text",
    "endnote text",
  ];
  const wordStyleValues: Record<string, string> = {
    Normal: "Normal",
    Title: "Title",
    Subtitle: "Subtitle",
    "Heading 1": "Heading1",
    "Heading 2": "Heading2",
    "Heading 3": "Heading3",
    "Heading 4": "Heading4",
    "Heading 5": "Heading5",
    "Heading 6": "Heading6",
    Strong: "Strong",
    "List Paragraph": "ListParagraph",
    "footnote text": "footnote text",
    "endnote text": "endnote text",
  };

  $effect(() => {
    const formatting = docxFormatting;
    if (!formatting) return;
    if (typeof formatting.bold === "boolean") wordBold = formatting.bold;
    if (typeof formatting.italic === "boolean") wordItalic = formatting.italic;
    if (typeof formatting.underline === "boolean")
      wordUnderline = formatting.underline;
    if (typeof formatting.strike === "boolean") wordStrike = formatting.strike;
    if (typeof formatting.superscript === "boolean")
      wordSuper = formatting.superscript;
    if (typeof formatting.subscript === "boolean")
      wordSub = formatting.subscript;
    if (formatting.fontFamily) wordFont = formatting.fontFamily;
    if (typeof formatting.fontSizePt === "number")
      wordFontSize = formatting.fontSizePt;
    if (formatting.alignment) {
      wordAlign =
        formatting.alignment === "both" ? "justify" : formatting.alignment;
    }
    if (formatting.styleId) {
      const style = Object.entries(wordStyleValues).find(
        ([, value]) => value === formatting.styleId,
      );
      wordStyle = style?.[0] ?? formatting.styleId;
    }
    if (formatting.colorHex) {
      wordColor = formatting.colorHex;
    } else if (formatting.color?.kind === "auto") {
      wordColor = "auto";
    }
    if (formatting.highlight !== undefined) {
      wordHighlight = formatting.highlight || "none";
    }
    if (
      formatting.lineSpacing?.rule === "multiple" &&
      typeof formatting.lineSpacing.value === "number"
    ) {
      wordLineSpacing = formatting.lineSpacing.value;
    }
  });

  const wordFonts = [
    "Arial",
    "Calibri",
    "Cambria",
    "Courier New",
    "Georgia",
    "Times New Roman",
    "Verdana",
    "Tahoma",
  ];
  const wordThemeBases = [
    "FFFFFF",
    "000000",
    "E7E6E6",
    "44546A",
    "4472C4",
    "ED7D31",
    "A5A5A5",
    "FFC000",
    "5B9BD5",
    "70AD47",
  ];

  function mixHex(base: string, target: number, amount: number) {
    const hex = base.replace(/^#/, "");
    const channels = [0, 2, 4].map((offset) =>
      Number.parseInt(hex.slice(offset, offset + 2), 16),
    );
    const value = channels
      .map((channel) =>
        Math.round(channel + (target - channel) * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase();
    return { value, css: `#${value.toLowerCase()}` };
  }

  const wordThemeColumns = wordThemeBases.map((base) => [
    { value: base, css: `#${base.toLowerCase()}` },
    mixHex(base, 255, 0.8),
    mixHex(base, 255, 0.6),
    mixHex(base, 255, 0.4),
    mixHex(base, 0, 0.25),
    mixHex(base, 0, 0.5),
  ]);

  const wordColors = [
    { value: "000000", css: "#000000" },
    { value: "434343", css: "#434343" },
    { value: "666666", css: "#666666" },
    { value: "999999", css: "#999999" },
    { value: "B7B7B7", css: "#b7b7b7" },
    { value: "D9D9D9", css: "#d9d9d9" },
    { value: "EFEFEF", css: "#efefef" },
    { value: "FFFFFF", css: "#ffffff" },
    { value: "C00000", css: "#c00000" },
    { value: "FF0000", css: "#ff0000" },
    { value: "FFC000", css: "#ffc000" },
    { value: "FFFF00", css: "#ffff00" },
    { value: "92D050", css: "#92d050" },
    { value: "00B050", css: "#00b050" },
    { value: "00B0F0", css: "#00b0f0" },
    { value: "0070C0", css: "#0070c0" },
    { value: "002060", css: "#002060" },
    { value: "7030A0", css: "#7030a0" },
  ];
  const wordHighlights = [
    { value: "yellow", css: "#ffff00" },
    { value: "green", css: "#00ff00" },
    { value: "cyan", css: "#00ffff" },
    { value: "magenta", css: "#ff00ff" },
    { value: "blue", css: "#0000ff" },
    { value: "red", css: "#ff0000" },
    { value: "darkBlue", css: "#000080" },
    { value: "darkCyan", css: "#008080" },
    { value: "darkGreen", css: "#008000" },
    { value: "darkMagenta", css: "#800080" },
    { value: "darkRed", css: "#800000" },
    { value: "darkYellow", css: "#808000" },
    { value: "darkGray", css: "#808080" },
    { value: "lightGray", css: "#c0c0c0" },
    { value: "black", css: "#000000" },
  ];
  const wordHighlightCss = $derived(
    wordHighlight === "none"
      ? "transparent"
      : wordHighlights.find((item) => item.value === wordHighlight)?.css ??
          "#ffff00",
  );
  const wordAlignments = [
    { value: "left", icon: "bx:align-left", label: "Rata kiri" },
    { value: "center", icon: "bx:align-middle", label: "Rata tengah" },
    { value: "right", icon: "bx:align-right", label: "Rata kanan" },
    { value: "justify", icon: "bx:align-justify", label: "Rata penuh" },
  ] as const;
  const wordLineSpacings = [1, 1.15, 1.5, 2, 2.5, 3];
  const wordTableSizes = [2, 3, 4, 5, 6];

  function closeMenus() {
    footerMenuOpen = false;
    statusMenuOpen = false;
    visualMenuOpen = false;
    wordMenu = null;
  }

  function toggleWordMenu(name: string, e: Event) {
    e.stopPropagation();
    footerMenuOpen = false;
    statusMenuOpen = false;
    visualMenuOpen = false;
    wordMenu = wordMenu === name ? null : name;
  }

  let lastMenuPress = 0;

  function menuPress(
    node: HTMLElement,
    toggle: (event: Event) => void,
  ) {
    let current = toggle;
    function pointerdown(event: Event) {
      if ((event as PointerEvent).button !== 0) return;
      event.stopPropagation();
      lastMenuPress = Date.now();
      current(event);
    }
    function click(event: Event) {
      event.stopPropagation();
      if (Date.now() - lastMenuPress < 500) {
        lastMenuPress = 0;
        return;
      }
      current(event);
    }
    function keydown(event: Event) {
      const keyboard = event as KeyboardEvent;
      if (keyboard.repeat) return;
      if (keyboard.key !== "Enter" && keyboard.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      lastMenuPress = Date.now();
      current(event);
    }
    node.addEventListener("pointerdown", pointerdown);
    node.addEventListener("click", click);
    node.addEventListener("keydown", keydown);
    return {
      update(next: (event: Event) => void) {
        current = next;
      },
      destroy() {
        node.removeEventListener("pointerdown", pointerdown);
        node.removeEventListener("click", click);
        node.removeEventListener("keydown", keydown);
      },
    };
  }

  function docxCommand(slot: string, value?: string | number) {
    onDocxCommand?.(slot, value);
    wordMenu = null;
  }

  function pickStyle(style: string) {
    wordStyle = style;
    docxCommand("styles.style", wordStyleValues[style] ?? style);
  }

  function pickFont(font: string) {
    wordFont = font;
    docxCommand("font.family", font);
  }

  function applyFontSize(value: number) {
    if (!Number.isFinite(value)) return;
    const next = Math.min(1638, Math.max(1, Math.round(value)));
    wordFontSize = next;
    docxCommand("font.size", next);
  }

  function pickColor(value: string) {
    wordColor = value;
    docxCommand("text.color", value);
  }

  function applyCustomColor() {
    if (!wordColorHexValid) return;
    pickColor(wordColorHex.toUpperCase());
    wordColorHex = "";
  }

  function pickHighlight(value: string) {
    wordHighlight = value;
    docxCommand("text.highlight", value);
  }

  function pickAlignment(value: string) {
    wordAlign = value;
    docxCommand(`alignment.${value}`);
  }

  function insertWordTable(size: number) {
    onDocxInsertTable?.(size, size);
    wordMenu = null;
  }

  function pickFooterScope(scope: "none" | "current" | "all") {
    onFooterScope?.(scope);
    closeMenus();
  }

  /** Visual tools stay usable; a signed document just warns that placing one
   *  replaces the existing signature. */
  const visualsLocked = $derived(visualMode === "none");
  const isSelfSigned = $derived(selfSigned || visualMode === "draw");
  const footerMandatory = $derived(isSelfSigned && !hasPlacedSignature);
  const footerLocked = $derived(hasSignature || footerMandatory);
  const lockTip = $derived(
    capSignature ? "akan mengganti tanda tangan lama" : null,
  );

  /** Tooltip for a visual tool: its own name, with the cap/replace warning
   *  appended in parentheses. */
  function visualTip(normal: string) {
    return lockTip ? `${normal} (${lockTip})` : normal;
  }

  const bsreInvalid = $derived(
    bsreStatus?.conclusion != null && bsreStatus.conclusion !== "VALID",
  );
  const localInvalid = $derived(
    localVerifications.some((item) => !item.integrityValid),
  );
  const hasLocalCheck = $derived(localVerifications.length > 0);
  /** Local verdict first; the server verdict wins once it exists. */
  const invalid = $derived(bsreStatus ? bsreInvalid : hasLocalCheck && localInvalid);
  const checked = $derived(!!bsreStatus || hasLocalCheck);

  /** Same wording the BSrE service uses, derived from the local CMS check. */
  const localDescription = $derived.by(() => {
    if (!hasLocalCheck) return undefined;
    if (localInvalid) {
      return "Dokumen tidak valid, tanda tangan tidak terintegritas";
    }
    if (localVerifications.some((item) => !item.certificateTrusted)) {
      return "Dokumen valid, Sertifikat yang digunakan tidak terpercaya";
    }
    if (localVerifications.some((item) => !item.chainValid)) {
      return "Dokumen valid, rantai sertifikat tidak lengkap";
    }
    return "Dokumen valid, Sertifikat yang digunakan terpercaya";
  });

  function localVerif(fieldName?: string) {
    return localVerifications.find(
      (item) => normField(item.fieldName) === normField(fieldName),
    );
  }

  const normField = (value?: string) => (value ?? "").trim().toLowerCase();

  /** Signatures the server found that the local parser did not (e.g. ones
   *  hidden from the AcroForm), so the dropdown can show them too. */
  const bsreExtras = $derived(
    (bsreStatus?.signatureInformations ?? []).filter(
      (bsre) =>
        !signatureInfos.some(
          (local) =>
            normField(local.fieldName) === normField(bsre.fieldName) ||
            (!local.fieldName && normField(local.name) === normField(bsre.signerName)),
        ),
    ),
  );

  function formatStamp(value?: VerifyDate | null) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("id-ID");
  }

  const visualDisabled = $derived(!docxEditing && visualsLocked);
</script>

<svelte:window
  onclick={closeMenus}
  onkeydown={(e) => {
    if (e.key === "Escape") closeMenus();
  }}
/>

<div
  id="tour-toolbar"
  class="relative flex flex-nowrap items-center gap-0.5 h-10 min-h-10 mx-1.5 mb-1.5 px-1.5 bg-base-200 rounded-full overflow-visible select-none [&_.btn]:font-normal"
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

    <!-- mobile zoom toggle (<lg) -->
    {#if hasDocuments}
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square inline-flex lg:hidden! {mobileZoomOpen ? 'bg-primary/20 text-primary' : ''}"
        aria-label="Toggle zoom bar"
        aria-pressed={mobileZoomOpen}
        onclick={() => onToggleMobileZoom?.()}
      >
        <iconify-icon icon="bx:search-alt"></iconify-icon>
      </button>
    {/if}
  </div>

  <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>

  {#if docxEditing}
    {#if signerEmail}
      <div class="relative max-lg:static shrink-0 flex items-center">
        {@render signerEmail()}
      </div>
      <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>
    {/if}

    {#if isSelfSigned}
      <div class="tooltip tooltip-bottom" data-tip={visualTip("Gambar Tanda Tangan")}>
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
    {:else}
      <div class="relative shrink-0">
        <button
          type="button"
          class="btn btn-sm btn-ghost gap-1 px-1.5"
          aria-label="Visualisasi"
          aria-haspopup="menu"
          aria-expanded={visualMenuOpen}
          disabled={visualDisabled}
          use:menuPress={() => {
            footerMenuOpen = false;
            statusMenuOpen = false;
            wordMenu = null;
            visualMenuOpen = !visualMenuOpen;
          }}
        >
          <iconify-icon icon="bx:image-add"></iconify-icon>
          <iconify-icon icon="bx:chevron-down" class="text-xs"></iconify-icon>
        </button>
        {#if visualMenuOpen}
          <div
            class="absolute top-full left-0 mt-1 p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-50 flex items-center"
            role="menu"
            aria-label="Visualisasi"
          >
            <button
              type="button"
              class="btn btn-sm btn-ghost btn-square"
              title="Tambah Gambar"
              aria-label="Tambah Gambar"
              role="menuitem"
              onclick={() => {
                closeMenus();
                onAddVisual?.("image");
              }}
            >
              <iconify-icon icon="bx:image"></iconify-icon>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-ghost btn-square"
              title="Tambah QR"
              aria-label="Tambah QR"
              role="menuitem"
              onclick={() => {
                closeMenus();
                onAddVisual?.("qr");
              }}
            >
              <iconify-icon icon="bx:qr"></iconify-icon>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-ghost btn-square"
              title="Tambah Kotak"
              aria-label="Tambah Kotak"
              role="menuitem"
              onclick={() => {
                closeMenus();
                onAddVisual?.("box");
              }}
            >
              <iconify-icon icon="bx:box"></iconify-icon>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-ghost btn-square"
              title="Gambar Tanda Tangan"
              aria-label="Tanda Tangan"
              role="menuitem"
              onclick={() => {
                closeMenus();
                onAddVisual?.("draw");
              }}
            >
              <iconify-icon icon="bx:pencil"></iconify-icon>
            </button>
          </div>
        {/if}
      </div>
    {/if}

    <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>

    <div class="relative shrink-0">
      <button
        type="button"
        class="btn btn-sm btn-ghost gap-1 px-2 normal-case w-32 justify-between"
        aria-label="Gaya paragraf"
        aria-haspopup="listbox"
        aria-expanded={wordMenu === "style"}
        use:menuPress={(e) => toggleWordMenu("style", e)}
      >
        <span class="text-xs truncate">{wordStyle}</span>
        <iconify-icon icon="bx:chevron-down" class="text-xs"></iconify-icon>
      </button>
      {#if wordMenu === "style"}
        <ul
          class="absolute top-full left-0 mt-1 min-w-[160px] max-h-64 overflow-y-auto p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-50"
          role="listbox"
          aria-label="Gaya paragraf"
        >
          {#each wordStyles as style (style)}
            <li>
              <button
                type="button"
                class="flex w-full items-center px-2.5 py-1.5 text-left text-[13px] rounded hover:bg-base-200 {style ===
                wordStyle
                  ? 'bg-primary/10 text-primary'
                  : ''}"
                role="option"
                aria-selected={style === wordStyle}
                onclick={() => pickStyle(style)}
              >
                {style}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="relative shrink-0">
      <button
        type="button"
        class="btn btn-sm btn-ghost gap-1 px-2 normal-case w-40 justify-between"
        aria-label="Jenis huruf"
        aria-haspopup="listbox"
        aria-expanded={wordMenu === "font"}
        use:menuPress={(e) => toggleWordMenu("font", e)}
      >
        <span class="text-xs truncate">{wordFont}</span>
        <iconify-icon icon="bx:chevron-down" class="text-xs"></iconify-icon>
      </button>
      {#if wordMenu === "font"}
        <ul
          class="absolute top-full left-0 mt-1 min-w-[180px] max-h-64 overflow-y-auto p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-50"
          role="listbox"
          aria-label="Jenis huruf"
        >
          {#each wordFonts as font (font)}
            <li>
              <button
                type="button"
                class="flex w-full items-center px-2.5 py-1.5 text-left text-[13px] rounded hover:bg-base-200 {font ===
                wordFont
                  ? 'bg-primary/10 text-primary'
                  : ''}"
                role="option"
                aria-selected={font === wordFont}
                onclick={() => pickFont(font)}
              >
                {font}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div
      class="flex items-center justify-between gap-px shrink-0 w-[88px] h-[30px] px-1 border border-base-300 rounded-md"
    >
      <button
        type="button"
        class="btn btn-xs btn-ghost btn-square shrink-0"
        aria-label="Perkecil ukuran huruf"
        onclick={() => applyFontSize(wordFontSize - 1)}
      >
        −
      </button>
      <input
        type="number"
        class="w-full min-w-0 bg-transparent text-center text-xs outline-none"
        aria-label="Ukuran huruf"
        min="1"
        max="1638"
        bind:value={wordFontSize}
        onchange={() => applyFontSize(Number(wordFontSize))}
      />
      <button
        type="button"
        class="btn btn-xs btn-ghost btn-square shrink-0"
        aria-label="Perbesar ukuran huruf"
        onclick={() => applyFontSize(wordFontSize + 1)}
      >
        +
      </button>
    </div>

    <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>

    <div class="flex items-center gap-px shrink-0">
      <div class="tooltip tooltip-bottom" data-tip="Tebal">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square {wordBold
            ? 'bg-primary/15 text-primary'
            : ''}"
          aria-label="Tebal"
          aria-pressed={wordBold}
          onclick={() => docxCommand("text.bold")}
        >
          <iconify-icon icon="bx:bold"></iconify-icon>
        </button>
      </div>
      <div class="tooltip tooltip-bottom" data-tip="Miring">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square {wordItalic
            ? 'bg-primary/15 text-primary'
            : ''}"
          aria-label="Miring"
          aria-pressed={wordItalic}
          onclick={() => docxCommand("text.italic")}
        >
          <iconify-icon icon="bx:italic"></iconify-icon>
        </button>
      </div>
      <div class="tooltip tooltip-bottom" data-tip="Garis bawah">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square {wordUnderline
            ? 'bg-primary/15 text-primary'
            : ''}"
          aria-label="Garis bawah"
          aria-pressed={wordUnderline}
          onclick={() => docxCommand("text.underline")}
        >
          <iconify-icon icon="bx:underline"></iconify-icon>
        </button>
      </div>
      <div class="tooltip tooltip-bottom" data-tip="Coret">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square {wordStrike
            ? 'bg-primary/15 text-primary'
            : ''}"
          aria-label="Coret"
          aria-pressed={wordStrike}
          onclick={() => docxCommand("text.strike")}
        >
          <iconify-icon icon="bx:strikethrough"></iconify-icon>
        </button>
      </div>
    </div>

    <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>

    <div class="flex items-center gap-px shrink-0">
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square text-xs {wordSuper
          ? 'bg-primary/15 text-primary'
          : ''}"
        aria-label="Pangkat atas"
        aria-pressed={wordSuper}
        onclick={() => docxCommand("script.super")}
      >
        x²
      </button>
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300 btn-square text-xs {wordSub
          ? 'bg-primary/15 text-primary'
          : ''}"
        aria-label="Pangkat bawah"
        aria-pressed={wordSub}
        onclick={() => docxCommand("script.sub")}
      >
        x₂
      </button>
    </div>

    <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>

    <div class="flex items-center gap-px shrink-0">
      <div class="relative flex items-center">
        <button
          type="button"
          class="btn btn-sm btn-ghost gap-1 px-1.5"
          aria-label="Warna huruf"
          aria-haspopup="menu"
          aria-expanded={wordMenu === "color"}
          use:menuPress={(e) => toggleWordMenu("color", e)}
        >
          <span class="relative inline-flex">
            <iconify-icon icon="bx:font-color"></iconify-icon>
            <span
              class="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
              style:background-color={wordColorCss}
              aria-hidden="true"
            ></span>
          </span>
          <iconify-icon icon="bx:chevron-down" class="text-xs"></iconify-icon>
        </button>
        {#if wordMenu === "color"}
          <div
            class="absolute top-full left-0 mt-1 w-[288px] p-2.5 bg-base-100 border border-base-300 rounded-lg shadow-xl z-50"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-base-200"
              onclick={() => pickColor("auto")}
            >
              <span
                class="h-4 w-4 rounded-sm border border-base-300 bg-base-100"
                aria-hidden="true"
              ></span>
              Otomatis
            </button>
            <div class="mt-2">
              <div
                class="px-1 text-[11px] font-medium uppercase tracking-wide text-base-content/60"
              >
                Warna tema
              </div>
              <div class="mt-1 flex gap-1">
                {#each wordThemeColumns as column, columnIndex (columnIndex)}
                  <div class="flex flex-col gap-1">
                    {#each column as color, colorIndex (colorIndex)}
                      <button
                        type="button"
                        class="h-5 w-5 rounded-sm border border-base-300"
                        style:background-color={color.css}
                        aria-label={`Warna ${color.value}`}
                        onclick={() => pickColor(color.value)}
                      ></button>
                    {/each}
                  </div>
                {/each}
              </div>
            </div>
            <div class="mt-2">
              <div
                class="px-1 text-[11px] font-medium uppercase tracking-wide text-base-content/60"
              >
                Warna standar
              </div>
              <div class="mt-1 grid grid-cols-10 gap-1">
                {#each wordColors as color (color.value)}
                  <button
                    type="button"
                    class="h-5 w-5 rounded-sm border border-base-300"
                    style:background-color={color.css}
                    aria-label={`Warna ${color.value}`}
                    onclick={() => pickColor(color.value)}
                  ></button>
                {/each}
              </div>
            </div>
            <div class="mt-2">
              <div
                class="px-1 text-[11px] font-medium uppercase tracking-wide text-base-content/60"
              >
                Warna kustom
              </div>
              <div class="mt-1 flex items-center gap-1">
                <span class="text-xs text-base-content/60">#</span>
                <input
                  type="text"
                  class="input input-xs input-bordered w-24 font-mono uppercase"
                  maxlength="6"
                  spellcheck="false"
                  aria-label="Warna kustom"
                  placeholder="FF0000"
                  bind:value={wordColorHex}
                  oninput={() =>
                    (wordColorHex = wordColorHex
                      .replace(/[^0-9A-Fa-f]/g, "")
                      .toUpperCase().slice(0, 6))}
                />
                <button
                  type="button"
                  class="btn btn-xs"
                  disabled={!wordColorHexValid}
                  onclick={applyCustomColor}
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="relative flex items-center">
        <button
          type="button"
          class="btn btn-sm btn-ghost gap-1 px-1.5"
          aria-label="Sorotan teks"
          aria-haspopup="menu"
          aria-expanded={wordMenu === "highlight"}
          use:menuPress={(e) => toggleWordMenu("highlight", e)}
        >
          <span class="relative inline-flex">
            <iconify-icon icon="bx:highlight"></iconify-icon>
            <span
              class="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
              style:background-color={wordHighlightCss}
              aria-hidden="true"
            ></span>
          </span>
          <iconify-icon icon="bx:chevron-down" class="text-xs"></iconify-icon>
        </button>
        {#if wordMenu === "highlight"}
          <div
            class="absolute top-full left-0 mt-1 w-[288px] p-2.5 bg-base-100 border border-base-300 rounded-lg shadow-xl z-50"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-base-200"
              onclick={() => pickHighlight("none")}
            >
              <span
                class="h-4 w-4 rounded-sm border border-base-300 bg-base-100"
                aria-hidden="true"
              ></span>
              Tanpa warna
            </button>
            <div class="mt-2">
              <div
                class="px-1 text-[11px] font-medium uppercase tracking-wide text-base-content/60"
              >
                Warna sorotan
              </div>
              <div class="mt-1 grid grid-cols-10 gap-1">
                {#each wordHighlights as color (color.value)}
                  <button
                    type="button"
                    class="h-5 w-5 rounded-sm border border-base-300"
                    style:background-color={color.css}
                    aria-label={`Sorotan ${color.value}`}
                    onclick={() => pickHighlight(color.value)}
                  ></button>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>

    <div class="relative shrink-0">
      <button
        type="button"
        class="btn btn-sm btn-ghost gap-1 px-1.5"
        aria-label={wordAlignments.find((item) => item.value === wordAlign)?.label}
        aria-haspopup="menu"
        aria-expanded={wordMenu === "alignment"}
        use:menuPress={(e) => toggleWordMenu("alignment", e)}
      >
        <iconify-icon
          icon={wordAlignments.find((item) => item.value === wordAlign)?.icon}
        ></iconify-icon>
        <iconify-icon icon="bx:chevron-down" class="text-xs"></iconify-icon>
      </button>
      {#if wordMenu === "alignment"}
        <div
          class="absolute top-full left-0 mt-1 p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-50 flex items-center"
          role="menu"
        >
          {#each wordAlignments as item (item.value)}
            <button
              type="button"
              class="btn btn-sm btn-ghost btn-square {item.value === wordAlign
                ? 'bg-primary/10 text-primary'
                : ''}"
              aria-label={item.label}
              aria-pressed={item.value === wordAlign}
              role="menuitemradio"
              onclick={() => pickAlignment(item.value)}
            >
              <iconify-icon icon={item.icon}></iconify-icon>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="flex items-center gap-px shrink-0">
      <div class="tooltip tooltip-bottom" data-tip="Daftar butir">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
          aria-label="Daftar butir"
          onclick={() => docxCommand("list.bullet")}
        >
          <iconify-icon icon="bx:list-ul"></iconify-icon>
        </button>
      </div>
      <div class="tooltip tooltip-bottom" data-tip="Daftar bernomor">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
          aria-label="Daftar bernomor"
          onclick={() => docxCommand("list.numbered")}
        >
          <iconify-icon icon="bx:list-ol"></iconify-icon>
        </button>
      </div>
      <div class="tooltip tooltip-bottom" data-tip="Kurangi indentasi">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
          aria-label="Kurangi indentasi"
          onclick={() => docxCommand("list.outdent")}
        >
          <iconify-icon icon="bx:left-indent"></iconify-icon>
        </button>
      </div>
      <div class="tooltip tooltip-bottom" data-tip="Tambah indentasi">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
          aria-label="Tambah indentasi"
          onclick={() => docxCommand("list.indent")}
        >
          <iconify-icon icon="bx:right-indent"></iconify-icon>
        </button>
      </div>
      <div class="relative">
        <button
          type="button"
          class="btn btn-sm btn-ghost gap-1 px-1.5"
          aria-label="Spasi baris"
          aria-haspopup="menu"
          aria-expanded={wordMenu === "spacing"}
          use:menuPress={(e) => toggleWordMenu("spacing", e)}
        >
          <iconify-icon icon="bx:vertical-center"></iconify-icon>
          <iconify-icon icon="bx:chevron-down" class="text-xs"></iconify-icon>
        </button>
        {#if wordMenu === "spacing"}
          <div
            class="absolute top-full left-0 mt-1 min-w-[120px] p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-50"
            role="menu"
          >
            {#each wordLineSpacings as spacing (spacing)}
              <button
                type="button"
                class="flex w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-base-200 {spacing ===
                wordLineSpacing
                  ? 'bg-primary/10 text-primary'
                  : ''}"
                role="menuitemradio"
                aria-checked={spacing === wordLineSpacing}
                onclick={() => docxCommand("list.lineSpacing", spacing)}
              >
                {spacing.toFixed(spacing % 1 === 0 ? 1 : 2)}
              </button>
            {/each}
            <div class="my-1 h-px bg-base-300"></div>
            <button
              type="button"
              class="flex w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-base-200"
              onclick={() => docxCommand("paragraph.dialog")}
            >
              Opsi spasi baris…
            </button>
          </div>
        {/if}
      </div>
    </div>

    <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>

    <div class="flex items-center gap-px shrink-0">
      <div class="tooltip tooltip-bottom" data-tip="Format Painter">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
          aria-label="Format Painter"
          onclick={() => docxCommand("format.painter")}
        >
          <iconify-icon icon="bx:brush"></iconify-icon>
        </button>
      </div>
      <div class="tooltip tooltip-bottom" data-tip="Hapus format">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
          aria-label="Hapus format"
          onclick={() => docxCommand("format.clear")}
        >
          <iconify-icon icon="bx:eraser"></iconify-icon>
        </button>
      </div>
      <div class="tooltip tooltip-bottom" data-tip="Paragraf">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
          aria-label="Paragraf"
          onclick={() => docxCommand("paragraph.dialog")}
        >
          <iconify-icon icon="bx:paragraph"></iconify-icon>
        </button>
      </div>
    </div>

    <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>

    <div class="flex items-center gap-px shrink-0">
      <div class="relative">
        <button
          type="button"
          class="btn btn-sm btn-ghost btn-square"
          aria-label="Sisipkan tabel"
          aria-haspopup="menu"
          aria-expanded={wordMenu === "table"}
          use:menuPress={(e) => toggleWordMenu("table", e)}
        >
          <iconify-icon icon="bx:table"></iconify-icon>
        </button>
        {#if wordMenu === "table"}
          <div
            class="absolute top-full right-0 mt-1 min-w-[110px] p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-50"
            role="menu"
          >
            {#each wordTableSizes as size (size)}
              <button
                type="button"
                class="flex w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-base-200"
                onclick={() => insertWordTable(size)}
              >
                {size} × {size}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <div class="tooltip tooltip-bottom" data-tip="Sisipkan gambar">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
          aria-label="Sisipkan gambar"
          onclick={() => onAddVisual?.("image")}
        >
          <iconify-icon icon="bx:image"></iconify-icon>
        </button>
      </div>
      <div class="tooltip tooltip-bottom" data-tip="Pemisah halaman">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square"
          aria-label="Pemisah halaman"
          onclick={() => docxCommand("insert.pageBreak")}
        >
          <iconify-icon icon="bx:file-blank"></iconify-icon>
        </button>
      </div>
    </div>

    <div class="ml-auto"></div>
  {:else}
  {#if signerEmail}
    <div class="relative max-lg:static shrink-0 flex items-center">
      {@render signerEmail()}
    </div>
    <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>
  {/if}

  <!-- visualisasi -->
  <div class="flex items-center gap-px shrink-0">
    {#if !isSelfSigned}
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
    {/if}
    <div
      class="tooltip tooltip-bottom {isSelfSigned ? 'inline-flex' : 'hidden! lg:inline-flex!'}"
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
    {#if !isSelfSigned}
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
          use:menuPress={() => {
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
    {/if}

    <div class="w-px h-6 mx-1 bg-base-300 shrink-0"></div>

    <div
      class="relative inline-flex tooltip tooltip-bottom"
      data-tip={footerMandatory
        ? "Footer wajib untuk Self-Signed tanpa tanda tangan"
        : hasSignature
          ? "Footer (terkunci)"
          : "Footer"}
    >
      <button
        type="button"
        class="btn btn-sm btn-ghost hover:bg-base-300"
        aria-label="Footer"
        aria-haspopup="menu"
        aria-expanded={footerMenuOpen}
        disabled={!hasDocuments || footerLocked}
        use:menuPress={() => {
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
          {#if footerMandatory}
            <li>
              <div
                class="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-base-content/60"
              >
                <iconify-icon icon="bx:lock-alt"></iconify-icon>
                Footer wajib untuk Self-Signed
              </div>
            </li>
          {:else if hasSignature}
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
        id="tour-status"
        class="btn btn-sm btn-ghost hover:bg-base-300 gap-1"
        aria-label="Status tanda tangan dokumen"
        aria-haspopup="menu"
        aria-expanded={statusMenuOpen}
        use:menuPress={() => {
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
        {#if hasDocuments && hasSignature && checked}
          <span
            class="badge badge-xs {invalid ? 'badge-error' : 'badge-success'}"
            title={bsreStatus?.description ??
              localDescription ??
              "Verifikasi lokal (CMS) pada perangkat ini"}
          >
            {invalid ? "Tidak Valid" : "Valid"}
          </span>
        {/if}
        {#if signatureInfos.length + bsreExtras.length > 0}
          <span class="badge badge-xs badge-ghost font-mono"
            >{signatureInfos.length + bsreExtras.length}</span
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
            disabled={verifyLoading}
            onclick={() => onVerify?.()}
          >
            {#if verifyLoading}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:check-shield"></iconify-icon>
            {/if}
            <span class="hidden lg:inline">Verifikasi</span>
          </button>
        </div>
      {/if}
      {#if statusMenuOpen}
        <ul
          class="absolute top-full right-0 mt-1 min-w-[300px] max-h-[320px] overflow-y-auto p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-40"
          role="menu"
        >
          {#if !hasDocuments}
            <li>
              <div class="flex items-center px-2.5 py-1.5 text-[13px] opacity-60">
                Tidak ada dokumen
              </div>
            </li>
          {:else if signatureInfos.length === 0 && bsreExtras.length === 0 && !bsreStatus}
            <li>
              <div class="flex items-center px-2.5 py-1.5 text-[13px] opacity-60">
                Tidak ada tanda tangan
              </div>
            </li>
          {:else}
            <li>
              <div
                class="flex items-center gap-2 px-2.5 py-1.5 text-[13px] border-b border-base-300 {invalid
                  ? 'text-error'
                  : 'text-success'}"
              >
                <iconify-icon
                  icon={invalid ? "bx:x-circle" : "bx:check-circle"}
                ></iconify-icon>
                <div>
                  <div class="flex items-center gap-1 font-medium">
                    {invalid ? "Dokumen tidak valid" : "Dokumen valid"}
                    <span
                      class="badge badge-xs {bsreStatus
                        ? 'badge-info'
                        : 'badge-ghost'}"
                      title={bsreStatus
                        ? "Diverifikasi server BSrE/BSSN"
                        : "Diverifikasi lokal di perangkat ini"}
                    >
                      {bsreStatus ? "BSrE" : "Lokal"}
                    </span>
                  </div>
                  <div class="text-[10px] opacity-70">
                    {bsreStatus?.description ??
                      localDescription ??
                      "Dokumen belum diubah, tanda tangan terintegritas"}
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
              {@const verif = localVerif(sig.fieldName)}
              <li>
                <div
                  class="block px-2.5 py-1.5 text-left text-[13px] whitespace-normal border-b border-base-200 last:border-b-0"
                >
                  <div class="flex items-center gap-1 flex-wrap">
                    <iconify-icon icon="bx:check-shield"></iconify-icon>
                    <span class="font-medium">{sig.name}</span>
                    {#if verif}
                      <span
                        class="badge badge-xs {verif.integrityValid
                          ? 'badge-success'
                          : 'badge-error'}"
                      >
                        {verif.integrityValid ? "Valid" : "Invalid"}
                      </span>
                      {#if !verif.certificateTrusted}
                        <span class="badge badge-xs badge-warning">
                          Tidak Terpercaya
                        </span>
                      {/if}
                      {#if verif.ltv}
                        <span class="badge badge-xs badge-accent">LTV</span>
                      {/if}
                      {#if verif.timestamped}
                        <span class="badge badge-xs badge-info">Timestamp</span>
                      {/if}
                    {/if}
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
                    {#if sig.signerValidFrom || sig.signerValidTo}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Berlaku</dt>
                        <dd class="opacity-80 break-all">
                          {sig.signerValidFrom ?? "?"} — {sig.signerValidTo ??
                            "?"}
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
            {#each bsreExtras as sig, i (`bsre-${i}`)}
              <li>
                <div
                  class="block px-2.5 py-1.5 text-left text-[13px] whitespace-normal border-b border-base-200 last:border-b-0"
                >
                  <div class="flex items-center gap-1">
                    <iconify-icon icon="bx:check-shield"></iconify-icon>
                    <span class="font-medium">{sig.signerName || sig.fieldName}</span>
                    <span class="badge badge-xs badge-info">BSrE</span>
                    <span
                      class="badge badge-xs {sig.integrityValid
                        ? 'badge-success'
                        : 'badge-error'}"
                    >
                      {sig.integrityValid ? "Valid" : "Invalid"}
                    </span>
                    {#if !sig.certificateTrusted}
                      <span class="badge badge-xs badge-warning">Tidak Terpercaya</span>
                    {/if}
                  </div>
                  <dl class="mt-1 flex flex-col gap-0.5 text-[10px]">
                    <div class="flex gap-1">
                      <dt class="opacity-50 w-16 shrink-0">Field</dt>
                      <dd class="opacity-80 break-all">{sig.fieldName}</dd>
                    </div>
                    {#if sig.certificateDetails?.[0]?.issuerName}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Penerbit</dt>
                        <dd class="opacity-80 break-all">
                          {sig.certificateDetails[0].issuerName}
                        </dd>
                      </div>
                    {/if}
                    <div class="flex gap-1">
                      <dt class="opacity-50 w-16 shrink-0">Waktu</dt>
                      <dd class="opacity-80">{formatStamp(sig.signatureDate)}</dd>
                    </div>
                    {#if sig.certificateDetails?.[0]?.notAfterDate}
                      <div class="flex gap-1">
                        <dt class="opacity-50 w-16 shrink-0">Berlaku</dt>
                        <dd class="opacity-80">
                          s/d {formatStamp(sig.certificateDetails[0].notAfterDate)}
                        </dd>
                      </div>
                    {/if}
                  </dl>
                </div>
              </li>
            {/each}
            <li>
              <button
                type="button"
                class="btn btn-sm btn-ghost w-full justify-start gap-2 mt-1"
                onclick={() => {
                  statusMenuOpen = false;
                  onOpenPanel?.();
                }}
              >
                <iconify-icon icon="bx:list-ul"></iconify-icon>
                Lihat lebih lengkap
              </button>
            </li>
            <li class="border-t border-base-200 mt-1 pt-1">
              <div class="px-2.5 py-1 text-[11px] flex flex-col gap-1">
                <span class="opacity-60 text-[10px] uppercase font-semibold tracking-wider">
                  Unduh Sertifikat Root CA
                </span>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <a
                    href="/rootmojokerto.crt"
                    download="rootmojokerto.crt"
                    class="btn btn-xs btn-outline btn-primary gap-1"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <iconify-icon icon="bx:download"></iconify-icon>
                    Root CA Pemkot
                  </a>
                  <a
                    href="/rootid.crt"
                    download="rootid.crt"
                    class="btn btn-xs btn-ghost border border-base-300 gap-1 opacity-80 hover:opacity-100"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <iconify-icon icon="bx:download"></iconify-icon>
                    Root CA Indonesia
                  </a>
                </div>
              </div>
            </li>
          {/if}
        </ul>
      {/if}
    </div>
  </div>
  {/if}
</div>
