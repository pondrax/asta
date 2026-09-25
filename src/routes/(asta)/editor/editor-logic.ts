import {
  createDocxEditor,
  runToolbarCommand,
  toolbarCommandState,
  runSave,
  executeImageCommand,
  generateRulerTicks,
  rulerPageBox,
  dragIndent,
  handlePosition,
  snapTwips,
  TWIPS_PER_INCH,
  TWIPS_PER_CM,
  AUTO_ZOOM_MODE,
  FIT_WIDTH_ZOOM_MODE,
  sameZoomMode,
  inchesToTwips,
  twipsToInches,
  formatInches,
  ZOOM_MIN,
  ZOOM_MAX,
} from "@docx-editor.dev/core/editor";
import type {
  DocxEditorInstance,
  ChromeSlotId,
  ToolbarCommandState,
  ParagraphFlags,
  ParagraphFormatUpdate,
  RulerIndentHandle,
  RulerPageMetrics,
  SupportedImageMime,
} from "@docx-editor.dev/core/editor";

/** Selection formatting snapshot returned by `query({ type: "selectionFormatting" })`. */
interface RunFormatting {
  readonly alignment?: "left" | "center" | "right" | "both";
  readonly spaceBeforePt?: number;
  readonly spaceAfterPt?: number;
  readonly lineSpacing?: {
    readonly rule: "multiple" | "exact" | "atLeast";
    readonly value: number;
  };
  readonly indent?: IndentFormatting;
  readonly paragraphFlags?: ParagraphFlags;
}

/** Effective paragraph indent at the selection, in twips. */
interface IndentFormatting {
  readonly left: number;
  readonly right: number;
  readonly firstLine: number;
  readonly mixed: {
    readonly left: boolean;
    readonly right: boolean;
    readonly firstLine: boolean;
  };
}

interface RulerPageState extends RulerPageMetrics {
  readonly pageHeight: number;
  readonly topMargin: number;
  readonly bottomMargin: number;
}

type EditorTextMatch = ReturnType<DocxEditorInstance["findMatches"]>[number];
type RulerMarginSide = "left" | "right" | "top" | "bottom";

interface RulerDragState {
  marker: RulerMarginSide | RulerIndentHandle | null;
  startSetup: RulerPageState | null;
  startIndent: IndentFormatting | null;
  startPage: RulerPageMetrics | null;
}

function createRulerDragState(): RulerDragState {
  return {
    marker: null,
    startSetup: null,
    startIndent: null,
    startPage: null,
  };
}

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const STANDARD_COLOR_SWATCHES = [
  "000000",
  "434343",
  "666666",
  "999999",
  "CCCCCC",
  "FFFFFF",
  "FF0000",
  "FF9900",
  "FFFF00",
  "00FF00",
  "00FFFF",
  "0000FF",
  "9900FF",
  "FF00FF",
  "800000",
  "FF6600",
  "808000",
  "008000",
  "008080",
  "000080",
  "800080",
  "808080",
  "C0C0C0",
  "FFA07A",
  "FFD700",
  "90EE90",
  "87CEFA",
  "DDA0DD",
  "A0522D",
];

const HIGHLIGHT_SWATCHES = [
  "yellow",
  "lightgreen",
  "cyan",
  "pink",
  "orange",
  "lightblue",
  "plum",
  "wheat",
  "lime",
  "turquoise",
  "hotpink",
  "gold",
  "aquamarine",
  "violet",
  "coral",
  "lightyellow",
];

const DEFAULT_THEME_HEXES = [
  "1A73E8",
  "D32F2F",
  "2E7D32",
  "F57C00",
  "7B1FA2",
  "00897B",
  "C2185B",
  "5D4037",
  "455A64",
  "1565C0",
];

const THEME_COLUMN_KEYS = [
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
  "dk1",
  "lt1",
];

const ALIGNMENT_SLOTS = [
  { slot: "alignment.left", align: "left" as const, icon: "bx:align-left" },
  { slot: "alignment.center", align: "center" as const, icon: "bx:align-middle" },
  { slot: "alignment.right", align: "right" as const, icon: "bx:align-right" },
  { slot: "alignment.justify", align: "justify" as const, icon: "bx:align-justify" },
];

const MODE_LABELS = {
  editing: "Editing",
  suggesting: "Suggesting",
  viewing: "Viewing",
} as const;

const MODE_ICONS = {
  editing:
    '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path>',
  suggesting:
    '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z"></path>',
  viewing:
    '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"></path>',
} as const;

const LINE_SPACING_PRESETS = [1, 1.15, 1.5, 2, 2.5, 3] as const;
const DEFAULT_PARAGRAPH_SPACE_PT = 10;
const REMOVED_PARAGRAPH_SPACE_PT = 0;

const TABLE_GRID_COLUMNS = 6;
const TABLE_GRID_ROWS = 6;

const NAV_PANE_WIDTH = 280;
const NAV_PANE_INSET = 32;
const NAV_PANE_GAP = 16;
const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_MATCH_LIMIT = 2000;

const TABLE_COMMANDS: Record<string, any> = {
  insertRowAbove: { type: "insertRow", where: "above" },
  insertRowBelow: { type: "insertRow", where: "below" },
  insertColumnLeft: { type: "insertColumn", where: "left" },
  insertColumnRight: { type: "insertColumn", where: "right" },
  deleteRow: { type: "deleteRow" },
  deleteColumn: { type: "deleteColumn" },
  deleteTable: { type: "deleteTable" },
};

function mmToTwips(mm: number): number {
  return Math.round((mm / 25.4) * TWIPS_PER_INCH);
}

function twipsToPixels(twips: number, zoom: number): number {
  return ((twips / TWIPS_PER_INCH) * 96) * zoom;
}

function pixelsToTwips(px: number, zoom: number): number {
  return Math.round(((px / zoom) / 96) * TWIPS_PER_INCH);
}

function formatTwipsForTooltip(twips: number): string {
  return `${((twips / TWIPS_PER_CM) * 10).toFixed(1)} mm`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isLightHex(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return true;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

function makeSwatch(hex: string, label: string): string {
  const clean = hex.replace("#", "");
  const bg = `#${clean}`;
  const text = isLightHex(clean) ? "#111111" : "#ffffff";
  return `<button type="button" class="color-swatch" data-color="${clean}" title="${label}" style="background:${bg}; color:${text}"></button>`;
}

function themeVariantsFor(hex: string): string[] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const variants: string[] = [];
  for (let i = 0; i < 5; i++) {
    const factor = 0.85 - i * 0.15;
    const nr = Math.round(clamp(r * factor, 0, 255));
    const ng = Math.round(clamp(g * factor, 0, 255));
    const nb = Math.round(clamp(b * factor, 0, 255));
    variants.push(
      `${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb
        .toString(16)
        .padStart(2, "0")}`,
    );
  }
  for (let i = 1; i <= 5; i++) {
    const factor = 1 + i * 0.15;
    const nr = Math.round(clamp(r * factor, 0, 255));
    const ng = Math.round(clamp(g * factor, 0, 255));
    const nb = Math.round(clamp(b * factor, 0, 255));
    variants.push(
      `${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb
        .toString(16)
        .padStart(2, "0")}`,
    );
  }
  return variants;
}

function lighter(hex: string, pct: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const nr = Math.round(clamp(r + (255 - r) * pct, 0, 255));
  const ng = Math.round(clamp(g + (255 - g) * pct, 0, 255));
  const nb = Math.round(clamp(b + (255 - b) * pct, 0, 255));
  return `${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb
    .toString(16)
    .padStart(2, "0")}`;
}

function darker(hex: string, pct: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const nr = Math.round(clamp(r * (1 - pct), 0, 255));
  const ng = Math.round(clamp(g * (1 - pct), 0, 255));
  const nb = Math.round(clamp(b * (1 - pct), 0, 255));
  return `${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb
    .toString(16)
    .padStart(2, "0")}`;
}

function variantHex(themeHex: string, key: string): string {
  const clean = themeHex.replace("#", "");
  const variants = themeVariantsFor(clean);
  const idx = THEME_COLUMN_KEYS.indexOf(key);
  if (idx < 0) return clean;
  return variants[idx] ?? clean;
}

export interface DocxEditorSetupOptions {
  onDirtyChange: (dirty: boolean) => void;
  onError: (msg: string | null) => void;
  showToast: (type: "success" | "error", msg: string) => void;
  getTheme: () => string;
  setTheme: (t: string) => void;
}

export interface DocxEditorSetupHandle {
  editor: DocxEditorInstance | null;
  destroy: () => void;
}

export function setupDocxEditor(root: HTMLElement, opts: DocxEditorSetupOptions): DocxEditorSetupHandle {
  const editorContainer = root.querySelector("#editor") as HTMLElement | null;
  if (!editorContainer) {
    throw new Error("#editor element not found in root");
  }

  let editor: DocxEditorInstance | null = null;
  let dirty = false;
  let lastFontColor = "FF0000";
  let lastHighlight = "yellow";
  let fontColorOpen = false;
  let highlightOpen = false;
  let alignmentOpen = false;
  let modeOpen = false;
  let lineSpacingOpen = false;
  let tableInsertOpen = false;
  let toolbarMoreOpen = false;
  let navOpen = false;
  let navTab: "headings" | "find" = "headings";
  let navShift = 0;
  let currentRulerPage: RulerPageState | null = null;
  let pageStatusTimer: ReturnType<typeof setTimeout> | null = null;
  let rulerScrollFrame: number | null = null;
  let hDrag = createRulerDragState();
  let vDrag = createRulerDragState();
  let navQuery = "";
  let navRunQuery = "";
  let navMatches: readonly EditorTextMatch[] = [];
  let navActiveIndex = -1;
  let navDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let zoomMenuOpen = false;
  let paragraphDialogOpen = false;
  let pdSeed: any = null;
  let contextMenuOpen = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let clipboardRefusal = false;
  let navFindTimer: ReturnType<typeof setTimeout> | null = null;
  let navFindIndex = 0;
  let navSelectedBlockId: string | null = null;
  let findQuery = "";
  let findMatchCase = false;
  let findWholeWord = false;
  let isSearching = false;
  let searchError: string | null = null;
  let tableInsertAnchor: DOMRect | null = null;
  let tableGridCols = TABLE_GRID_COLUMNS;
  let tableGridRows = TABLE_GRID_ROWS;
  let tableGridHoverCols = 0;
  let tableGridHoverRows = 0;
  let tableGridBuilt = false;
  let toolbarMoreHasVisibleItems = false;
  let resizeObserver: ResizeObserver | null = null;
  let editorResizeObserver: ResizeObserver | null = null;
  let layoutObserver: MutationObserver | null = null;
  let rafId = 0;
  let rulerRefreshFrame: number | null = null;
  let rulerRefreshAttempts = 0;
  let unsubscribeChange: (() => void) | null = null;
  let unsubscribeSelectionChange: (() => void) | null = null;

  const fileInput = root.querySelector("#fileInput") as HTMLInputElement | null;
  const imageInput = root.querySelector("#imageInput") as HTMLInputElement | null;
  const filenameInput = root.querySelector("#filenameInput") as HTMLInputElement | null;
  const filenameWrap = root.querySelector("#filenameWrap") as HTMLElement | null;
  const docIcon = root.querySelector(".doc-icon") as HTMLElement | null;
  const newButton = root.querySelector("#newButton") as HTMLButtonElement | null;
  const pdfButton = root.querySelector("#pdfButton") as HTMLButtonElement | null;
  const themeToggle = root.querySelector("#themeToggle") as HTMLButtonElement | null;
  const errorEl = root.querySelector("#error") as HTMLElement | null;
  const errorText = root.querySelector("#errorText") as HTMLElement | null;
  const documentViewport = root.querySelector("#documentViewport") as HTMLElement | null;
  const documentStage = root.querySelector("#documentStage") as HTMLElement | null;
  const horizontalRuler = root.querySelector("#horizontalRuler") as HTMLElement | null;
  const horizontalRulerInner = root.querySelector("#horizontalRulerInner") as HTMLElement | null;
  const verticalRuler = root.querySelector("#verticalRuler") as HTMLElement | null;
  const verticalRulerInner = root.querySelector("#verticalRulerInner") as HTMLElement | null;
  const hLeftMarginZone = root.querySelector("#hLeftMarginZone") as HTMLElement | null;
  const hRightMarginZone = root.querySelector("#hRightMarginZone") as HTMLElement | null;
  const hFirstLineHandle = root.querySelector("#hFirstLineHandle") as HTMLElement | null;
  const hHangingHandle = root.querySelector("#hHangingHandle") as HTMLElement | null;
  const hLeftHandle = root.querySelector("#hLeftHandle") as HTMLElement | null;
  const hRightHandle = root.querySelector("#hRightHandle") as HTMLElement | null;
  const hDragTooltip = root.querySelector("#hDragTooltip") as HTMLElement | null;
  const vTopMarginZone = root.querySelector("#vTopMarginZone") as HTMLElement | null;
  const vBottomMarginZone = root.querySelector("#vBottomMarginZone") as HTMLElement | null;
  const vDragTooltip = root.querySelector("#vDragTooltip") as HTMLElement | null;
  const hDragGuide = root.querySelector("#hDragGuide") as HTMLElement | null;
  const vDragGuide = root.querySelector("#vDragGuide") as HTMLElement | null;
  const pageStatus = root.querySelector("#pageStatus") as HTMLElement | null;
  const zoomOutBtn = root.querySelector("#zoomOut") as HTMLButtonElement | null;
  const zoomInBtn = root.querySelector("#zoomIn") as HTMLButtonElement | null;
  const zoomValue = root.querySelector("#zoomValue") as HTMLElement | null;
  const zoomMenu = root.querySelector("#zoomMenu") as HTMLElement | null;
  const zoomTrigger = root.querySelector("#zoomStepper") as HTMLElement | null;
  const styleTrigger = root.querySelector("#styleTrigger") as HTMLButtonElement | null;
  const styleTriggerLabel = root.querySelector("#styleTriggerLabel") as HTMLElement | null;
  const styleMenu = root.querySelector("#styleMenu") as HTMLElement | null;
  const fontTrigger = root.querySelector("#fontTrigger") as HTMLButtonElement | null;
  const fontTriggerLabel = root.querySelector("#fontTriggerLabel") as HTMLElement | null;
  const fontMenu = root.querySelector("#fontMenu") as HTMLElement | null;
  const fontSearch = root.querySelector("#fontSearch") as HTMLInputElement | null;
  const fontOptions = root.querySelector("#fontOptions") as HTMLElement | null;
  const fontSizeMinus = root.querySelector("#fontSizeMinus") as HTMLButtonElement | null;
  const fontSizePlus = root.querySelector("#fontSizePlus") as HTMLButtonElement | null;
  const fontSizeInput = root.querySelector("#fontSizeInput") as HTMLInputElement | null;
  const fontColorSplit = root.querySelector("#fontColorSplit") as HTMLElement | null;
  const fontColorMain = root.querySelector("#fontColorMain") as HTMLButtonElement | null;
  const fontColorBar = root.querySelector("#fontColorBar") as HTMLElement | null;
  const fontColorCaret = root.querySelector("#fontColorCaret") as HTMLButtonElement | null;
  const fontColorPopup = root.querySelector("#fontColorPopup") as HTMLElement | null;
  const fontColorTheme = root.querySelector("#fontColorTheme") as HTMLElement | null;
  const fontColorStandard = root.querySelector("#fontColorStandard") as HTMLElement | null;
  const fontColorHex = root.querySelector("#fontColorHex") as HTMLInputElement | null;
  const fontColorApply = root.querySelector("#fontColorApply") as HTMLButtonElement | null;
  const highlightSplit = root.querySelector("#highlightSplit") as HTMLElement | null;
  const highlightMain = root.querySelector("#highlightMain") as HTMLButtonElement | null;
  const highlightBar = root.querySelector("#highlightBar") as HTMLElement | null;
  const highlightCaret = root.querySelector("#highlightCaret") as HTMLButtonElement | null;
  const highlightPopup = root.querySelector("#highlightPopup") as HTMLElement | null;
  const highlightGrid = root.querySelector("#highlightGrid") as HTMLElement | null;
  const alignmentTrigger = root.querySelector("#alignmentTrigger") as HTMLButtonElement | null;
  const alignmentIcon = root.querySelector("#alignmentIcon") as HTMLElement | null;
  const alignmentPopup = root.querySelector("#alignmentPopup") as HTMLElement | null;
  const lineSpacingTrigger = root.querySelector("#lineSpacingTrigger") as HTMLButtonElement | null;
  const lineSpacingMenu = root.querySelector("#lineSpacingMenu") as HTMLElement | null;
  const spaceBeforeRow = root.querySelector("#spaceBeforeRow") as HTMLButtonElement | null;
  const spaceAfterRow = root.querySelector("#spaceAfterRow") as HTMLButtonElement | null;
  const modeTrigger = root.querySelector("#modeTrigger") as HTMLButtonElement | null;
  const modeValue = root.querySelector("#modeValue") as HTMLElement | null;
  const modeMenu = root.querySelector("#modeMenu") as HTMLElement | null;
  const commentsButton = root.querySelector("#commentsButton") as HTMLButtonElement | null;
  const toolbarMoreButton = root.querySelector("#toolbarMoreButton") as HTMLButtonElement | null;
  const toolbarMorePanel = root.querySelector("#toolbarMorePanel") as HTMLElement | null;
  const moreZoomOut = root.querySelector("#moreZoomOut") as HTMLButtonElement | null;
  const moreZoomIn = root.querySelector("#moreZoomIn") as HTMLButtonElement | null;
  const moreZoomValue = root.querySelector("#moreZoomValue") as HTMLElement | null;
  const moreStyleTrigger = root.querySelector("#moreStyleTrigger") as HTMLButtonElement | null;
  const moreFontTrigger = root.querySelector("#moreFontTrigger") as HTMLButtonElement | null;
  const moreFontSizeMinus = root.querySelector("#moreFontSizeMinus") as HTMLButtonElement | null;
  const moreFontSizePlus = root.querySelector("#moreFontSizePlus") as HTMLButtonElement | null;
  const moreFontSizeValue = root.querySelector("#moreFontSizeValue") as HTMLElement | null;
  const tableInsertPopup = root.querySelector("#tableInsertPopup") as HTMLElement | null;
  const toolbarTableGrid = root.querySelector("#toolbarTableGrid") as HTMLElement | null;
  const toolbarTableGridCaption = root.querySelector("#toolbarTableGridCaption") as HTMLElement | null;
  const tableSubmenu = root.querySelector("#tableSubmenu") as HTMLElement | null;
  const tableGrid = root.querySelector("#tableGrid") as HTMLElement | null;
  const tableGridCaption = root.querySelector("#tableGridCaption") as HTMLElement | null;
  const nav = root.querySelector("#nav") as HTMLElement | null;
  const navToggle = root.querySelector("#navToggle") as HTMLButtonElement | null;
  const navClose = root.querySelector("#navClose") as HTMLButtonElement | null;
  const navPanel = root.querySelector("#navPanel") as HTMLElement | null;
  const navTabBar = root.querySelector(".nav__tabs") as HTMLElement | null;
  const navTabHeadings = root.querySelector("#navTabHeadings") as HTMLButtonElement | null;
  const navTabFind = root.querySelector("#navTabFind") as HTMLButtonElement | null;
  const navPanelHeadings = root.querySelector("#navPanelHeadings") as HTMLElement | null;
  const navPanelFind = root.querySelector("#navPanelFind") as HTMLElement | null;
  const navHeadingFilter = root.querySelector("#navHeadingFilter") as HTMLInputElement | null;
  const navHeadingClear = root.querySelector("#navHeadingClear") as HTMLButtonElement | null;
  const navHeadingList = root.querySelector("#navHeadingList") as HTMLElement | null;
  const navFindInput = root.querySelector("#navFindInput") as HTMLInputElement | null;
  const navFindClear = root.querySelector("#navFindClear") as HTMLButtonElement | null;
  const navMatchCase = root.querySelector("#navMatchCase") as HTMLInputElement | null;
  const navWholeWord = root.querySelector("#navWholeWord") as HTMLInputElement | null;
  const navCount = root.querySelector("#navCount") as HTMLElement | null;
  const navPrev = root.querySelector("#navPrev") as HTMLButtonElement | null;
  const navNext = root.querySelector("#navNext") as HTMLButtonElement | null;
  const navFindList = root.querySelector("#navFindList") as HTMLElement | null;
  const contextMenu = root.querySelector("#contextMenu") as HTMLElement | null;
  const contextMenuTableSection = root.querySelector("#contextMenuTableSection") as HTMLElement | null;
  const pageSetupDialog = root.querySelector("#pageSetupDialog") as HTMLElement | null;
  const pageSetupOverlay = root.querySelector("#pageSetupOverlay") as HTMLElement | null;
  const pageSetupCancel = root.querySelector("#pageSetupCancel") as HTMLButtonElement | null;
  const pageSetupApply = root.querySelector("#pageSetupApply") as HTMLButtonElement | null;
  const paperSize = root.querySelector("#paperSize") as HTMLSelectElement | null;
  const orientation = root.querySelector("#orientation") as HTMLSelectElement | null;
  const marginTop = root.querySelector("#marginTop") as HTMLInputElement | null;
  const marginBottom = root.querySelector("#marginBottom") as HTMLInputElement | null;
  const marginLeft = root.querySelector("#marginLeft") as HTMLInputElement | null;
  const marginRight = root.querySelector("#marginRight") as HTMLInputElement | null;
  const pageSetupScope = root.querySelector("#pageSetupScope") as HTMLSelectElement | null;
  const paragraphDialogOverlay = root.querySelector("#paragraphDialogOverlay") as HTMLElement | null;
  const paragraphDialog = root.querySelector("#paragraphDialog") as HTMLElement | null;
  const pdCancel = root.querySelector("#pdCancel") as HTMLButtonElement | null;
  const pdOk = root.querySelector("#pdOk") as HTMLButtonElement | null;
  const pdAlignment = root.querySelector("#pdAlignment") as HTMLSelectElement | null;
  const pdIndentLeft = root.querySelector("#pdIndentLeft") as HTMLInputElement | null;
  const pdIndentRight = root.querySelector("#pdIndentRight") as HTMLInputElement | null;
  const pdSpecial = root.querySelector("#pdSpecial") as HTMLSelectElement | null;
  const pdSpecialBy = root.querySelector("#pdSpecialBy") as HTMLInputElement | null;
  const pdSpecialByRow = root.querySelector("#pdSpecialByRow") as HTMLElement | null;
  const pdSpaceBefore = root.querySelector("#pdSpaceBefore") as HTMLInputElement | null;
  const pdSpaceAfter = root.querySelector("#pdSpaceAfter") as HTMLInputElement | null;
  const pdLineRule = root.querySelector("#pdLineRule") as HTMLSelectElement | null;
  const pdLineValue = root.querySelector("#pdLineValue") as HTMLInputElement | null;
  const pdLineUnit = root.querySelector("#pdLineUnit") as HTMLElement | null;
  const pdContextualSpacing = root.querySelector("#pdContextualSpacing") as HTMLInputElement | null;
  const pdKeepNext = root.querySelector("#pdKeepNext") as HTMLInputElement | null;
  const pdWidowControl = root.querySelector("#pdWidowControl") as HTMLInputElement | null;
  const pdKeepLines = root.querySelector("#pdKeepLines") as HTMLInputElement | null;
  const pdPageBreakBefore = root.querySelector("#pdPageBreakBefore") as HTMLInputElement | null;
  const pdError = root.querySelector("#pdError") as HTMLElement | null;
  const commandButtons = root.querySelectorAll<HTMLButtonElement>(".command[data-slot]");
  const menuItems = root.querySelectorAll<HTMLElement>(".menu-item[data-slot], .menu-item[data-action]");
  const menus = root.querySelectorAll<HTMLElement>(".menu");

  function showError(msg: string) {
    if (errorText) errorText.textContent = msg;
    if (errorEl) errorEl.classList.remove("hidden");
    opts.onError(msg);
  }

  function hideError() {
    if (errorEl) errorEl.classList.add("hidden");
    opts.onError(null);
  }

  function setDirty(value: boolean) {
    if (dirty === value) return;
    dirty = value;
    opts.onDirtyChange(dirty);
  }

  function applyA4Default() {
    if (!editor) return;
    editor.exec({
      type: "setPageSetup",
      marginTop: 1440,
      marginRight: 1440,
      marginBottom: 1440,
      marginLeft: 1440,
      pageWidth: mmToTwips(210),
      pageHeight: mmToTwips(297),
      orientation: "portrait",
      scope: "document",
    });
  }

  function newDocument() {
    if (!editor) return;
    editor.load("blank");
    applyA4Default();
    if (documentViewport) documentViewport.scrollTop = 0;
    if (filenameInput) {
      filenameInput.value = "";
      filenameInput.blur();
    }
    setDirty(false);
    hideError();
    updateAll();
  }

  function saveDocument() {
    if (!editor) return;
    runSave(editor)
      .then((buf) => {
        const blob = new Blob([buf], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const name = (filenameInput?.value || "").trim() || "document";
        a.download = name.endsWith(".docx") ? name : `${name}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDirty(false);
        opts.showToast("success", "Dokumen berhasil diunduh.");
      })
      .catch((e) => {
        showError(e instanceof Error ? e.message : String(e));
      });
  }

  async function saveAsPdf() {
    if (!editor) return;
    const name = (filenameInput?.value || "").trim() || "document";
    try {
      const docxBuf = await runSave(editor);
      const res = await fetch("/api/docx-to-pdf", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        body: docxBuf,
      });
      if (!res.ok) {
        let detail = `Konversi PDF gagal (${res.status}).`;
        try {
          const body = await res.json();
          if (body?.message) detail = body.message;
        } catch {
          /* ignore non-JSON error body */
        }
        throw new Error(detail);
      }
      const pdfBlob = await res.blob();
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name.endsWith(".pdf") ? name : `${name}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      opts.showToast("success", "PDF berhasil diunduh.");
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleSlot(slot: string, anchor?: HTMLElement | null) {
    if (!editor) return;
    if (slot === "paragraph.dialog") {
      openParagraphDialog();
      return;
    }
    if (slot === "table.insert") {
      toggleTableInsertPopup(anchor ?? null);
      return;
    }
    if (slot === "image.insert") {
      imageInput?.click();
      return;
    }
    runToolbarCommand(editor, slot as ChromeSlotId);
    updateAll();
  }

  function toggleTableInsertPopup(anchor: HTMLElement | null) {
    if (!tableInsertPopup) return;
    if (tableInsertOpen && anchor === null) {
      tableInsertOpen = false;
      tableInsertPopup.classList.remove("open");
      tableInsertAnchor = null;
      return;
    }
    tableInsertAnchor = anchor?.getBoundingClientRect() ?? null;
    tableInsertOpen = true;
    tableInsertPopup.classList.add("open");
    positionTableInsertPopup();
    buildTableGrid(toolbarTableGrid, toolbarTableGridCaption, (r, c) => {
      if (editor?.surface) {
        if (editor.surface.canInsertTable(r, c)) {
          editor.surface.insertTable(r, c);
        }
      }
      tableInsertOpen = false;
      tableInsertPopup.classList.remove("open");
    });
    buildTableGrid(tableGrid, tableGridCaption, (r, c) => {
      if (editor?.surface) {
        if (editor.surface.canInsertTable(r, c)) {
          editor.surface.insertTable(r, c);
        }
      }
      const submenu = root.querySelector<HTMLElement>("#tableSubmenu");
      if (submenu) submenu.classList.remove("open");
    });
  }

  function positionTableInsertPopup() {
    if (!tableInsertPopup || !tableInsertAnchor) return;
    const rect = tableInsertAnchor;
    tableInsertPopup.style.left = `${rect.left}px`;
    tableInsertPopup.style.top = `${rect.bottom + 4}px`;
  }

  function buildTableGrid(
    gridEl: HTMLElement | null,
    captionEl: HTMLElement | null,
    onInsert: (rows: number, cols: number) => void,
  ) {
    if (!gridEl) return;
    gridEl.innerHTML = "";
    for (let r = 0; r < TABLE_GRID_ROWS; r++) {
      const row = document.createElement("div");
      row.className = "table-grid__row";
      for (let c = 0; c < TABLE_GRID_COLUMNS; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "table-grid__cell";
        cell.dataset.row = String(r + 1);
        cell.dataset.col = String(c + 1);
        cell.addEventListener("mouseenter", () => {
          tableGridHoverRows = r + 1;
          tableGridHoverCols = c + 1;
          updateTableGridHover(gridEl);
          if (captionEl) captionEl.textContent = `${r + 1} × ${c + 1}`;
        });
        cell.addEventListener("click", () => onInsert(r + 1, c + 1));
        row.appendChild(cell);
      }
      gridEl.appendChild(row);
    }
    tableGridHoverRows = 1;
    tableGridHoverCols = 1;
    updateTableGridHover(gridEl);
    if (captionEl) captionEl.textContent = "1 × 1";
  }

  function updateTableGridHover(gridEl: HTMLElement | null) {
    if (!gridEl) return;
    gridEl.querySelectorAll<HTMLElement>(".table-grid__cell").forEach((cell) => {
      const r = parseInt(cell.dataset.row || "0");
      const c = parseInt(cell.dataset.col || "0");
      cell.classList.toggle("active", r <= tableGridHoverRows && c <= tableGridHoverCols);
    });
  }

  function openParagraphDialog() {
    if (!editor || !paragraphDialogOverlay || !paragraphDialog) return;
    const snap = editor.query({ type: "selectionFormatting" }) as RunFormatting | null;
    const fmt = snap || ({} as RunFormatting);
    const indent = fmt.indent || ({ left: 0, right: 0, firstLine: 0, mixed: { left: false, right: false, firstLine: false } } as IndentFormatting);
    const pf = fmt.paragraphFlags || ({ contextualSpacing: false, keepNext: false, keepLines: false, widowControl: true, pageBreakBefore: false } as ParagraphFlags);
    pdSeed = {
      alignment: fmt.alignment || "left",
      indentLeftTwips: indent.left ?? 0,
      indentRightTwips: indent.right ?? 0,
      indentFirstLineTwips: indent.firstLine ?? null,
      spaceBeforePt: fmt.spaceBeforePt ?? null,
      spaceAfterPt: fmt.spaceAfterPt ?? null,
      lineSpacing: fmt.lineSpacing || { rule: "multiple" as const, value: 1 },
      contextualSpacing: pf.contextualSpacing ?? false,
      keepNext: pf.keepNext ?? false,
      keepLines: pf.keepLines ?? false,
      widowControl: pf.widowControl ?? true,
      pageBreakBefore: pf.pageBreakBefore ?? false,
    };
    if (pdAlignment) pdAlignment.value = pdSeed.alignment;
    if (pdIndentLeft) pdIndentLeft.value = String(twipsToInches(pdSeed.indentLeftTwips));
    if (pdIndentRight) pdIndentRight.value = String(twipsToInches(pdSeed.indentRightTwips));
    const special = pdSeed.indentFirstLineTwips === null ? "none" : pdSeed.indentFirstLineTwips < 0 ? "hanging" : "firstLine";
    if (pdSpecial) pdSpecial.value = special;
    if (pdSpecialBy) {
      const v = pdSeed.indentFirstLineTwips === null ? 0 : Math.abs(pdSeed.indentFirstLineTwips);
      pdSpecialBy.value = String(twipsToInches(v));
    }
    if (pdSpecialByRow) pdSpecialByRow.hidden = special === "none";
    if (pdSpaceBefore) pdSpaceBefore.value = pdSeed.spaceBeforePt === null ? "" : String(pdSeed.spaceBeforePt);
    if (pdSpaceAfter) pdSpaceAfter.value = pdSeed.spaceAfterPt === null ? "" : String(pdSeed.spaceAfterPt);
    if (pdLineRule) pdLineRule.value = pdSeed.lineSpacing.rule;
    if (pdLineValue) pdLineValue.value = String(pdSeed.lineSpacing.value);
    if (pdLineUnit) pdLineUnit.textContent = pdSeed.lineSpacing.rule === "multiple" ? "lines" : "pt";
    if (pdContextualSpacing) pdContextualSpacing.checked = !!pdSeed.contextualSpacing;
    if (pdKeepNext) pdKeepNext.checked = !!pdSeed.keepNext;
    if (pdWidowControl) pdWidowControl.checked = !!pdSeed.widowControl;
    if (pdKeepLines) pdKeepLines.checked = !!pdSeed.keepLines;
    if (pdPageBreakBefore) pdPageBreakBefore.checked = !!pdSeed.pageBreakBefore;
    if (pdError) pdError.textContent = "";
    paragraphDialogOpen = true;
    paragraphDialogOverlay.classList.remove("hidden");
    paragraphDialog.focus();
  }

  function closeParagraphDialog() {
    if (!paragraphDialogOverlay) return;
    paragraphDialogOpen = false;
    paragraphDialogOverlay.classList.add("hidden");
  }

  function applyParagraphDialog() {
    if (!editor || !pdSeed) return;
    const update: Record<string, unknown> = {};
    const align = pdAlignment?.value as any;
    if (align && align !== pdSeed.alignment) update.alignment = align;
    const leftIn = parseFloat(pdIndentLeft?.value || "0");
    const rightIn = parseFloat(pdIndentRight?.value || "0");
    const leftT = Math.round(inchesToTwips(isNaN(leftIn) ? 0 : leftIn));
    const rightT = Math.round(inchesToTwips(isNaN(rightIn) ? 0 : rightIn));
    if (leftT !== pdSeed.indentLeftTwips) update.indentLeftTwips = leftT;
    if (rightT !== pdSeed.indentRightTwips) update.indentRightTwips = rightT;
    const special = pdSpecial?.value || "none";
    let firstLineT: number | null = null;
    if (special === "firstLine") {
      const v = parseFloat(pdSpecialBy?.value || "0");
      firstLineT = Math.round(inchesToTwips(isNaN(v) ? 0 : v));
    } else if (special === "hanging") {
      const v = parseFloat(pdSpecialBy?.value || "0");
      firstLineT = -Math.round(inchesToTwips(isNaN(v) ? 0 : v));
    } else {
      firstLineT = null;
    }
    if (firstLineT !== pdSeed.indentFirstLineTwips) update.indentFirstLineTwips = firstLineT;
    const sb = pdSpaceBefore?.value;
    const sa = pdSpaceAfter?.value;
    const sbPt = sb === undefined || sb === "" ? null : parseFloat(sb);
    const saPt = sa === undefined || sa === "" ? null : parseFloat(sa);
    if ((sbPt ?? null) !== pdSeed.spaceBeforePt) update.spaceBeforePt = sbPt ?? null;
    if ((saPt ?? null) !== pdSeed.spaceAfterPt) update.spaceAfterPt = saPt ?? null;
    const rule = (pdLineRule?.value || "multiple") as any;
    const lval = parseFloat(pdLineValue?.value || "1");
    const lspacing = { rule, value: isNaN(lval) ? 1 : lval };
    if (JSON.stringify(lspacing) !== JSON.stringify(pdSeed.lineSpacing)) {
      update.lineSpacing = lspacing;
    }
    const cs = !!pdContextualSpacing?.checked;
    const kn = !!pdKeepNext?.checked;
    const wc = !!pdWidowControl?.checked;
    const kl = !!pdKeepLines?.checked;
    const pbb = !!pdPageBreakBefore?.checked;
    if (cs !== pdSeed.contextualSpacing) update.contextualSpacing = cs;
    if (kn !== pdSeed.keepNext) update.keepNext = kn;
    if (wc !== pdSeed.widowControl) update.widowControl = wc;
    if (kl !== pdSeed.keepLines) update.keepLines = kl;
    if (pbb !== pdSeed.pageBreakBefore) update.pageBreakBefore = pbb;
    if (Object.keys(update).length === 0) {
      closeParagraphDialog();
      return;
    }
    const res = editor.exec({ type: "setParagraphFormat", ...(update as ParagraphFormatUpdate) });
    if (!res.ok) {
      if (pdError) pdError.textContent = res.reason || "The document refused this paragraph change.";
      return;
    }
    closeParagraphDialog();
    updateAll();
  }

  function updateToolbar() {
    if (!editor) return;
    commandButtons.forEach((btn) => {
      const slot = btn.dataset.slot as ChromeSlotId | undefined;
      if (!slot) return;
      const st = toolbarCommandState(editor, slot);
      btn.disabled = st.enabled === false;
      btn.classList.toggle("active", !!st.active);
      btn.setAttribute("aria-disabled", st.enabled === false ? "true" : "false");
      btn.setAttribute("aria-pressed", st.active ? "true" : "false");
      const title = btn.getAttribute("title") || "";
      if (st.disabledReason && st.enabled === false) {
        btn.setAttribute("title", st.disabledReason);
      } else {
        btn.setAttribute("title", title);
      }
    });
    if (toolbarMorePanel) {
      toolbarMorePanel.querySelectorAll<HTMLButtonElement>(".command[data-slot]").forEach((btn) => {
        const slot = btn.dataset.slot as ChromeSlotId | undefined;
        if (!slot) return;
        const st = toolbarCommandState(editor, slot);
        btn.disabled = st.enabled === false;
        btn.classList.toggle("active", !!st.active);
      });
    }
    if (commentsButton) {
      const st = toolbarCommandState(editor, "review.comments" as ChromeSlotId);
      commentsButton.disabled = st.enabled === false;
      commentsButton.classList.toggle("active", !!st.active);
    }
  }

  function getCurrentRulerPage(): RulerPageState | null {
    if (!editor) return null;
    const setup = editor.getPageSetup();
    if (!setup) {
      currentRulerPage = null;
      return null;
    }
    currentRulerPage = {
      pageWidth: setup.pageWidthTwips,
      pageHeight: setup.pageHeightTwips,
      leftMargin: setup.marginsTwips.left,
      rightMargin: setup.marginsTwips.right,
      topMargin: setup.marginsTwips.top,
      bottomMargin: setup.marginsTwips.bottom,
    };
    return currentRulerPage;
  }

  function getCurrentIndent(): IndentFormatting | null {
    return editor?.snapshot().formatting?.indent ?? null;
  }

  function rulerTickClass(tick: { readonly label?: string; readonly height: number }): string {
    if (tick.label) return "major";
    return tick.height >= 9 ? "medium" : "minor";
  }

  function renderRulerAxis(
    inner: HTMLElement,
    pageSizePx: number,
    contentOffsetPx: number,
    contentSizePx: number,
    horizontal: boolean,
  ) {
    const trailingSizePx = Math.max(0, pageSizePx - contentOffsetPx - contentSizePx);
    const marginTicks = generateRulerTicks(contentOffsetPx, "cm");
    const contentTicks = generateRulerTicks(contentSizePx, "cm");
    const trailingTicks = generateRulerTicks(trailingSizePx, "cm");

    const appendTick = (positionPx: number, tick: { readonly label?: string; readonly height: number }, labelled: boolean) => {
      const tickElement = document.createElement("div");
      tickElement.className = `ruler-tick-${horizontal ? "horizontal" : "vertical"} ${rulerTickClass(tick)}`;
      if (horizontal) tickElement.style.left = `${positionPx}px`;
      else tickElement.style.top = `${positionPx}px`;
      inner.appendChild(tickElement);

      if (labelled && tick.label) {
        const label = document.createElement("span");
        label.className = `ruler-label-${horizontal ? "horizontal" : "vertical"}`;
        label.textContent = tick.label;
        if (horizontal) label.style.left = `${positionPx}px`;
        else label.style.top = `${positionPx}px`;
        inner.appendChild(label);
      }
    };

    for (const tick of marginTicks) {
      if (tick.position < contentOffsetPx - 0.5) appendTick(tick.position, tick, false);
    }
    for (const tick of contentTicks) {
      appendTick(contentOffsetPx + tick.position, tick, true);
    }
    for (const tick of trailingTicks) {
      appendTick(contentOffsetPx + contentSizePx + tick.position, tick, false);
    }

    const zeroLabel = document.createElement("span");
    zeroLabel.className = `ruler-label-${horizontal ? "horizontal" : "vertical"}`;
    zeroLabel.textContent = "0";
    if (horizontal) zeroLabel.style.left = `${contentOffsetPx}px`;
    else zeroLabel.style.top = `${contentOffsetPx}px`;
    inner.appendChild(zeroLabel);
  }

  function updateRulers(): boolean {
    if (!editor || !horizontalRulerInner || !verticalRulerInner) return false;
    const geometry = editor.getPageGeometry();
    const page = rulerPageBox(geometry);
    if (!page) {
      horizontalRulerInner.innerHTML = "";
      verticalRulerInner.innerHTML = "";
      horizontalRulerInner.style.width = "0px";
      verticalRulerInner.style.height = "0px";
      return false;
    }

    const zoom = editor.getZoom();
    const widthPx = page.width * zoom;
    const heightPx = page.height * zoom;
    const contentBox = geometry[0]?.contentBox;
    const offsetX = (contentBox?.x ?? 0) * zoom;
    const offsetY = (contentBox?.y ?? 0) * zoom;
    const contentWidthPx = (contentBox?.width ?? widthPx / zoom) * zoom;
    const contentHeightPx = (contentBox?.height ?? heightPx / zoom) * zoom;

    horizontalRulerInner.innerHTML = "";
    verticalRulerInner.innerHTML = "";
    horizontalRulerInner.style.width = `${widthPx}px`;
    verticalRulerInner.style.height = `${heightPx}px`;
    renderRulerAxis(horizontalRulerInner, widthPx, offsetX, contentWidthPx, true);
    renderRulerAxis(verticalRulerInner, heightPx, offsetY, contentHeightPx, false);

    getCurrentRulerPage();
    syncRulers();
    return true;
  }

  function scheduleRulerRefresh() {
    if (rulerRefreshFrame !== null) return;
    rulerRefreshFrame = requestAnimationFrame(() => {
      rulerRefreshFrame = null;
      if (updateRulers()) {
        rulerRefreshAttempts = 0;
        return;
      }
      // The editor publishes page geometry after its first asynchronous paint.
      // Retry briefly while that happens; the layout observers below handle
      // later page insertion/resize without relying on a fixed delay.
      if (rulerRefreshAttempts < 30) {
        rulerRefreshAttempts += 1;
        scheduleRulerRefresh();
      }
    });
  }

  function syncRulers() {
    if (!documentViewport) return;
    const pageElement = editorContainer?.querySelector<HTMLElement>(".docx-page");
    if (!pageElement) return;
    const viewportRect = documentViewport.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    if (horizontalRulerInner) {
      horizontalRulerInner.style.left = `${pageRect.left - viewportRect.left}px`;
    }
    if (verticalRulerInner) {
      verticalRulerInner.style.top = `${pageRect.top - viewportRect.top}px`;
    }
    positionRulerHandles();
  }

  function positionRulerHandles() {
    if (!editor || !documentViewport) return;
    const page = getCurrentRulerPage();
    const indent = getCurrentIndent();
    const pageElement = editorContainer?.querySelector<HTMLElement>(".docx-page");
    if (!page || !pageElement) return;

    const zoom = editor.getZoom();
    const viewportRect = documentViewport.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    const originX = pageRect.left - viewportRect.left;
    const originY = pageRect.top - viewportRect.top;
    const leftMarginPx = twipsToPixels(page.leftMargin, zoom);
    const rightMarginPx = twipsToPixels(page.rightMargin, zoom);
    const topMarginPx = twipsToPixels(page.topMargin, zoom);
    const bottomMarginPx = twipsToPixels(page.bottomMargin, zoom);
    const pageWidthPx = twipsToPixels(page.pageWidth, zoom);
    const pageHeightPx = twipsToPixels(page.pageHeight, zoom);

    if (hLeftMarginZone) {
      hLeftMarginZone.style.left = `${originX}px`;
      hLeftMarginZone.style.width = `${leftMarginPx}px`;
    }
    if (hRightMarginZone) {
      hRightMarginZone.style.left = `${originX + pageWidthPx - rightMarginPx}px`;
      hRightMarginZone.style.width = `${rightMarginPx}px`;
    }
    if (vTopMarginZone) {
      vTopMarginZone.style.top = `${originY}px`;
      vTopMarginZone.style.height = `${topMarginPx}px`;
    }
    if (vBottomMarginZone) {
      vBottomMarginZone.style.top = `${originY + pageHeightPx - bottomMarginPx}px`;
      vBottomMarginZone.style.height = `${bottomMarginPx}px`;
    }

    const indentEditable = editor.snapshot().editable && editor.can({ type: "setIndent", left: 0 }).ok;
    const placeHandle = (
      element: HTMLElement | null,
      handle: RulerIndentHandle,
      verticalPosition: "top" | "strip" | "box",
    ) => {
      if (!element) return;
      if (!indent) {
        element.style.display = "none";
        return;
      }
      element.style.display = "";
      const positionTwips = handlePosition(handle, indent, page);
      const positionPx = originX + twipsToPixels(positionTwips, zoom);
      element.style.left = `${positionPx - 5}px`;
      element.style.top = verticalPosition === "top" ? "0px" : verticalPosition === "box" ? "21px" : "13px";
      element.style.width = "10px";
      element.style.height = verticalPosition === "top" ? "8px" : verticalPosition === "box" ? "6px" : "7px";
      element.classList.toggle("disabled", !indentEditable);
      element.setAttribute("aria-disabled", String(!indentEditable));
      element.tabIndex = indentEditable ? 0 : -1;
      element.setAttribute("aria-valuenow", String(handle === "hanging" ? indent.left : indent[handle]));
      element.setAttribute("aria-valuemin", String(-page.pageWidth));
      element.setAttribute("aria-valuemax", String(page.pageWidth));
    };

    placeHandle(hFirstLineHandle, "firstLine", "top");
    placeHandle(hHangingHandle, "hanging", "strip");
    placeHandle(hLeftHandle, "left", "box");
    placeHandle(hRightHandle, "right", "strip");
  }

  function showDragTooltip(element: HTMLElement | null, value: string, positionPx: number) {
    if (!element) return;
    element.textContent = value;
    element.style.left = `${positionPx}px`;
    element.hidden = false;
  }

  function showDragGuide(element: HTMLElement | null, vertical: boolean, positionPx: number) {
    if (!element) return;
    if (vertical) element.style.left = `${positionPx}px`;
    else element.style.top = `${positionPx}px`;
    element.hidden = false;
  }

  function beginMarginDrag(
    state: RulerDragState,
    side: RulerMarginSide,
    event: PointerEvent,
  ) {
    if (!editor) return;
    const setup = getCurrentRulerPage();
    if (!setup || !editor.snapshot().editable) return;
    if (!editor.can({ type: "setPageSetup", marginLeft: setup.leftMargin }).ok) return;
    event.preventDefault();
    state.marker = side;
    state.startSetup = setup;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveMarginDrag(state: RulerDragState, side: RulerMarginSide, event: PointerEvent) {
    if (!editor || state.marker !== side) return;
    const setup = state.startSetup;
    const pageElement = editorContainer?.querySelector<HTMLElement>(".docx-page");
    if (!setup || !pageElement || !documentViewport) return;

    const zoom = editor.getZoom();
    const viewportRect = documentViewport.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    const originX = pageRect.left - viewportRect.left;
    const originY = pageRect.top - viewportRect.top;
    const pageWidthPx = twipsToPixels(setup.pageWidth, zoom);
    const pageHeightPx = twipsToPixels(setup.pageHeight, zoom);
    const vertical = side === "top" || side === "bottom";
    let value: number;

    if (vertical) {
      const positionTwips = pixelsToTwips(event.clientY - viewportRect.top - originY, zoom);
      if (side === "top") {
        const maximum = setup.pageHeight - setup.bottomMargin - 720;
        value = Math.round(clamp(positionTwips, 0, maximum));
      } else {
        const fromBottom = setup.pageHeight - positionTwips;
        const maximum = setup.pageHeight - setup.topMargin - 720;
        value = Math.round(clamp(fromBottom, 0, maximum));
      }
      showDragTooltip(vDragTooltip, formatTwipsForTooltip(value), event.clientX - viewportRect.left);
    } else {
      const positionTwips = pixelsToTwips(event.clientX - viewportRect.left - originX, zoom);
      if (side === "left") {
        const maximum = setup.pageWidth - setup.rightMargin - 720;
        value = Math.round(clamp(positionTwips, 0, maximum));
      } else {
        const fromRight = setup.pageWidth - positionTwips;
        const maximum = setup.pageWidth - setup.leftMargin - 720;
        value = Math.round(clamp(fromRight, 0, maximum));
      }
      showDragTooltip(hDragTooltip, formatTwipsForTooltip(value), event.clientX - viewportRect.left);
    }

    const update = side === "left"
      ? { marginLeft: value }
      : side === "right"
        ? { marginRight: value }
        : side === "top"
          ? { marginTop: value }
          : { marginBottom: value };
    editor.exec({ type: "setPageSetup", ...update });

    const guidePosition = side === "top"
      ? originY + twipsToPixels(value, zoom)
      : side === "bottom"
        ? originY + pageHeightPx - twipsToPixels(value, zoom)
        : side === "left"
          ? originX + twipsToPixels(value, zoom)
          : originX + pageWidthPx - twipsToPixels(value, zoom);
    showDragGuide(vertical ? vDragGuide : hDragGuide, !vertical, guidePosition);
    positionRulerHandles();
  }

  function endMarginDrag(state: RulerDragState, side: RulerMarginSide, event: PointerEvent) {
    if (state.marker !== side) return;
    const vertical = side === "top" || side === "bottom";
    if (vertical) {
      if (vDragTooltip) vDragTooltip.hidden = true;
      if (vDragGuide) vDragGuide.hidden = true;
    } else {
      if (hDragTooltip) hDragTooltip.hidden = true;
      if (hDragGuide) hDragGuide.hidden = true;
    }
    state.marker = null;
    state.startSetup = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    updateAll();
  }

  function beginIndentDrag(handle: RulerIndentHandle, event: PointerEvent) {
    if (!editor) return;
    const indent = getCurrentIndent();
    const page = getCurrentRulerPage();
    if (!indent || !page || !editor.snapshot().editable) return;
    if (!editor.can({ type: "setIndent", left: 0 }).ok) return;
    event.preventDefault();
    event.stopPropagation();
    hDrag.marker = handle;
    hDrag.startIndent = indent;
    hDrag.startPage = page;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveIndentDrag(handle: RulerIndentHandle, event: PointerEvent) {
    if (!editor || hDrag.marker !== handle) return;
    const indent = hDrag.startIndent;
    const page = hDrag.startPage;
    const pageElement = editorContainer?.querySelector<HTMLElement>(".docx-page");
    if (!indent || !page || !pageElement || !documentViewport) return;

    const zoom = editor.getZoom();
    const viewportRect = documentViewport.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    const originX = pageRect.left - viewportRect.left;
    const positionTwips = pixelsToTwips(event.clientX - viewportRect.left - originX, zoom);
    const origin = handle === "right" ? page.pageWidth - page.rightMargin : page.leftMargin;
    const snapTwipsPerMillimetre = TWIPS_PER_CM / 10;
    const snapped = event.altKey
      ? positionTwips
      : origin + Math.round(Math.round((positionTwips - origin) / snapTwipsPerMillimetre) * snapTwipsPerMillimetre);
    const next = dragIndent(handle, snapped, indent, page, { unit: "cm", precise: true });
    const value = handle === "right"
      ? next.right
      : handle === "firstLine"
        ? next.firstLine
        : next.left;

    showDragTooltip(hDragTooltip, formatTwipsForTooltip(value), event.clientX - viewportRect.left);
    const guidePosition = handle === "right"
      ? originX + twipsToPixels(page.pageWidth - page.rightMargin - next.right, zoom)
      : originX + twipsToPixels(page.leftMargin + next.left + (handle === "firstLine" ? next.firstLine : 0), zoom);
    showDragGuide(hDragGuide, true, guidePosition);
    editor.exec({ type: "setIndent", left: next.left, right: next.right, firstLine: next.firstLine });
    positionRulerHandles();
  }

  function endIndentDrag(handle: RulerIndentHandle, event: PointerEvent) {
    if (hDrag.marker !== handle) return;
    if (hDragTooltip) hDragTooltip.hidden = true;
    if (hDragGuide) hDragGuide.hidden = true;
    hDrag.marker = null;
    hDrag.startIndent = null;
    hDrag.startPage = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    updateAll();
  }

  function nudgeIndent(handle: RulerIndentHandle, direction: -1 | 1, fine: boolean) {
    if (!editor) return;
    const indent = getCurrentIndent();
    const page = getCurrentRulerPage();
    if (!indent || !page) return;
    const snapTwipsPerMillimetre = TWIPS_PER_CM / 10;
    const step = fine ? 1 : snapTwipsPerMillimetre;
    const current = handlePosition(handle, indent, page);
    const origin = handle === "right" ? page.pageWidth - page.rightMargin : page.leftMargin;
    const snapped = fine
      ? current
      : origin + Math.round(Math.round((current - origin) / snapTwipsPerMillimetre) * snapTwipsPerMillimetre);
    const next = dragIndent(handle, snapped + direction * step, indent, page, { unit: "cm", precise: true });
    editor.exec({ type: "setIndent", left: next.left, right: next.right, firstLine: next.firstLine });
    updateAll();
  }

  function updateActivePage() {
    if (!editor || !pageStatus) return;
    const total = editor.getTotalPages();
    if (!Number.isFinite(total)) return;
    const pages = editorContainer?.querySelectorAll<HTMLElement>(".docx-page");
    let current: number | null = null;
    if (pages?.length && documentViewport) {
      const viewportRect = documentViewport.getBoundingClientRect();
      const probeY = viewportRect.top + 1;
      let best: { rect: DOMRect; element: HTMLElement } | null = null;
      for (const pageElement of pages) {
        const rect = pageElement.getBoundingClientRect();
        if (rect.bottom <= probeY) continue;
        if (!best || rect.top < best.rect.top) best = { rect, element: pageElement };
      }
      if (best) {
        const index = Array.from(pages).indexOf(best.element);
        if (index >= 0) current = index + 1;
      }
    }
    if (current === null) {
      const editorPage = editor.getCurrentPage("viewport");
      if (Number.isFinite(editorPage)) current = editorPage;
    }
    if (current !== null) pageStatus.textContent = `Halaman ${current} dari ${total}`;
  }

  function flashPageStatus() {
    if (!pageStatus) return;
    pageStatus.classList.add("page-indicator--visible");
    if (pageStatusTimer) clearTimeout(pageStatusTimer);
    pageStatusTimer = setTimeout(() => {
      pageStatus.classList.remove("page-indicator--visible");
    }, 1200);
  }

  function updateAll() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      // Rulers depend on the editor's asynchronously published page geometry,
      // so schedule them before refreshing unrelated toolbar state. A toolbar
      // or navigation refresh must not be able to suppress the first ruler
      // layout pass.
      rulerRefreshAttempts = 0;
      scheduleRulerRefresh();

      updateToolbar();
      updateActivePage();
      updateNavShift();
    });
  }

  function navigationPaneReservation(paneWidth = NAV_PANE_WIDTH): number {
    return NAV_PANE_INSET + paneWidth + NAV_PANE_GAP;
  }

  function navigationShift({
    viewportWidth,
    pageWidthPx,
    reservation,
    inlineEndReservation = 0,
    inlineStartReservation = 0,
    docked = false,
  }: {
    viewportWidth: number;
    pageWidthPx: number;
    reservation: number;
    inlineEndReservation?: number;
    inlineStartReservation?: number;
    docked?: boolean;
  }): number {
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0;
    if (!Number.isFinite(pageWidthPx) || pageWidthPx <= 0) return 0;
    if (!Number.isFinite(reservation) || reservation <= 0) return 0;
    if (!Number.isFinite(inlineEndReservation) || inlineEndReservation < 0) return 0;
    if (!Number.isFinite(inlineStartReservation) || inlineStartReservation < 0) return 0;
    const gutter = (viewportWidth - inlineEndReservation - pageWidthPx) / 2;
    const total = gutter >= reservation
      ? 0
      : !docked && reservation <= 2 * gutter
        ? 2 * (reservation - gutter)
        : reservation;
    return Math.ceil(Math.max(0, total - inlineStartReservation));
  }

  function updateNavShift() {
    if (!documentViewport) {
      navShift = 0;
      return;
    }
    if (!editor || !navOpen) {
      navShift = 0;
      documentViewport.style.setProperty("--docx-nav-shift", "0px");
      return;
    }
    const pageSetup = editor.getPageSetup();
    if (!pageSetup) {
      navShift = 0;
      documentViewport.style.setProperty("--docx-nav-shift", "0px");
      return;
    }
    const snapshot = editor.snapshot();
    const zoom = snapshot.zoom;
    const mode = snapshot.zoomMode;
    const fitting = !!mode
      && mode.type === "fit"
      && zoom < (mode.maxZoom ?? 5)
      && zoom > (mode.minZoom ?? 0.1);
    const style = getComputedStyle(documentViewport);
    const inlineEndReservation = Number.parseFloat(style.paddingInlineEnd) || 0;
    const inlineStartReservation = Number.parseFloat(style.getPropertyValue("--docx-review-gutter-start")) || 0;
    navShift = navigationShift({
      viewportWidth: documentViewport.clientWidth,
      pageWidthPx: twipsToPixels(pageSetup.pageWidthTwips, zoom),
      reservation: navigationPaneReservation(NAV_PANE_WIDTH),
      inlineEndReservation,
      inlineStartReservation,
      docked: fitting,
    });
    documentViewport.style.setProperty("--docx-nav-shift", `${navShift}px`);
  }

  function setNavOpen(open: boolean) {
    navOpen = open;
    if (nav) {
      nav.dataset.open = open ? "true" : "false";
      nav.classList.toggle("nav--open", open);
    }
    if (navToggle) {
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.title = open ? "Tutup navigasi" : "Buka navigasi";
    }
    if (navPanel) {
      if (open) navPanel.removeAttribute("inert");
      else navPanel.setAttribute("inert", "");
    }
    if (open && navTab === "find") navFindInput?.focus();
    updateNavShift();
  }

  function setNavTab(tab: "headings" | "find") {
    navTab = tab;
    const headings = tab === "headings";
    navTabHeadings?.classList.toggle("nav__tab--selected", headings);
    navTabFind?.classList.toggle("nav__tab--selected", !headings);
    navTabHeadings?.setAttribute("aria-selected", String(headings));
    navTabFind?.setAttribute("aria-selected", String(!headings));
    if (navTabHeadings) navTabHeadings.tabIndex = headings ? 0 : -1;
    if (navTabFind) navTabFind.tabIndex = headings ? -1 : 0;
    if (navPanelHeadings) navPanelHeadings.hidden = !headings;
    if (navPanelFind) navPanelFind.hidden = headings;
    if (navOpen && !headings) navFindInput?.focus();
  }

  function renderHeadings() {
    if (!editor || !navHeadingList) return;
    const headings = editor.getOutline();
    const needle = navHeadingFilter?.value.trim().toLowerCase() ?? "";
    const items = needle
      ? headings.filter((item) => item.text.toLowerCase().includes(needle))
      : headings;
    let minLevel = Number.POSITIVE_INFINITY;
    for (const item of items) minLevel = Math.min(minLevel, item.level);
    const baseLevel = items.length > 0 ? minLevel : 0;
    navHeadingList.replaceChildren();

    if (items.length === 0) {
      const empty = document.createElement("li");
      const message = document.createElement("p");
      message.className = "nav__empty";
      message.textContent = headings.length === 0 ? "Tidak ada judul" : "Tidak ada hasil";
      empty.appendChild(message);
      navHeadingList.appendChild(empty);
      return;
    }

    for (const item of items) {
      const listItem = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nav__heading";
      button.classList.toggle("nav__heading--current", navSelectedBlockId === item.blockId);
      button.style.paddingInlineStart = `${8 + (item.level - baseLevel) * 14}px`;
      button.title = item.text;
      button.textContent = item.text;
      button.addEventListener("click", () => {
        if (!editor) return;
        editor.focus();
        editor.exec({
          type: "setSelection",
          range: {
            anchor: { paragraphId: item.blockId, offset: 0 },
            head: { paragraphId: item.blockId, offset: 0 },
          },
        });
        editor.scrollToBlock(item.blockId);
        navSelectedBlockId = item.blockId;
        renderHeadings();
      });
      listItem.appendChild(button);
      navHeadingList.appendChild(listItem);
    }
  }

  function renderFind() {
    if (!navCount || !navFindList) return;
    const hasQuery = navQuery.trim().length > 0;
    const truncated = navMatches.length >= SEARCH_MATCH_LIMIT;
    let counter = "";
    if (hasQuery) {
      if (navQuery !== navRunQuery) counter = "Mencari…";
      else if (navMatches.length === 0) counter = "Tidak ada hasil";
      else if (navActiveIndex < 0) {
        counter = truncated ? `${navMatches.length}+ hasil` : `${navMatches.length} hasil`;
      } else {
        counter = truncated
          ? `${navActiveIndex + 1} / ${navMatches.length}+`
          : `${navActiveIndex + 1} / ${navMatches.length}`;
      }
    }
    navCount.textContent = counter;
    if (navPrev) navPrev.disabled = navMatches.length === 0;
    if (navNext) navNext.disabled = navMatches.length === 0;
    navFindList.replaceChildren();

    for (const [index, match] of navMatches.entries()) {
      const listItem = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nav__result";
      button.classList.toggle("nav__result--active", index === navActiveIndex);
      if (index === navActiveIndex) button.setAttribute("aria-current", "true");
      const text = document.createElement("span");
      text.className = "nav__result-text";
      if (match.contextBefore) text.append(document.createTextNode(match.contextBefore));
      const hit = document.createElement("mark");
      hit.className = "nav__result-hit";
      hit.textContent = match.text;
      text.appendChild(hit);
      if (match.contextAfter) text.append(document.createTextNode(match.contextAfter));
      button.appendChild(text);
      button.addEventListener("click", () => navGoTo(index));
      listItem.appendChild(button);
      navFindList.appendChild(listItem);
    }
  }

  function runFind() {
    if (!editor) return;
    if (navRunQuery.length === 0) {
      navMatches = [];
      navActiveIndex = -1;
      renderFind();
      return;
    }
    navMatches = editor.findMatches(navRunQuery, {
      matchCase: navMatchCase?.checked ?? false,
      wholeWord: navWholeWord?.checked ?? false,
    });
    if (navActiveIndex >= navMatches.length) navActiveIndex = -1;
    renderFind();
  }

  function navGoTo(index: number) {
    if (!editor) return;
    const match = navMatches[index];
    if (!match) return;
    editor.focus();
    if (editor.selectMatch(match).ok) {
      navActiveIndex = index;
      renderFind();
    }
  }

  function navStep(delta: -1 | 1) {
    if (navMatches.length === 0) return;
    const from = navActiveIndex < 0 ? (delta > 0 ? -1 : 0) : navActiveIndex;
    const next = (from + delta + navMatches.length) % navMatches.length;
    navGoTo(next);
  }

  function refreshEditorChrome() {
    updateAll();
    renderHeadings();
    rulerRefreshAttempts = 0;
    scheduleRulerRefresh();
  }

  function registerEditorSubscriptions() {
    if (!editor) return;
    unsubscribeChange = editor.on("change", () => {
      refreshEditorChrome();
    });
    unsubscribeSelectionChange = editor.on("selectionChange", () => {
      refreshEditorChrome();
    });
  }

  function observeEditorLayout() {
    if (!editorContainer) return;
    layoutObserver = new MutationObserver(() => {
      renderHeadings();
      updateActivePage();
      rulerRefreshAttempts = 0;
      scheduleRulerRefresh();
    });
    layoutObserver.observe(editorContainer, { childList: true, subtree: true });

    editorResizeObserver = new ResizeObserver(() => {
      rulerRefreshAttempts = 0;
      scheduleRulerRefresh();
      syncRulers();
    });
    editorResizeObserver.observe(editorContainer);
  }

  function setupEventListeners() {
    if (nav) {
      nav.style.setProperty("--docx-nav-width", `${NAV_PANE_WIDTH}px`);
      nav.style.setProperty("--docx-nav-inset", `${NAV_PANE_INSET}px`);
      nav.style.setProperty("--docx-nav-reservation", `${navigationPaneReservation(NAV_PANE_WIDTH)}px`);
    }
    if (documentViewport) {
      documentViewport.style.paddingInlineStart = "calc(var(--docx-nav-shift, 0px) + var(--docx-review-gutter-start, 0px))";
      documentViewport.style.transition = "padding-inline-start .2s ease";
    }
    setNavOpen(false);
    setNavTab("headings");
    renderHeadings();
    renderFind();

    commandButtons.forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        const slot = btn.dataset.slot;
        if (slot) handleSlot(slot, btn);
        if (toolbarMoreOpen) {
          toolbarMoreOpen = false;
          toolbarMorePanel?.classList.remove("open");
        }
      });
    });

    menuItems.forEach((item) => {
      item.addEventListener("click", () => {
        const slot = item.dataset.slot;
        const action = item.dataset.action;
        if (slot) {
          handleSlot(slot, item as HTMLElement);
        }
        if (action === "new") newDocument();
        if (action === "open") fileInput?.click();
        if (action === "save") saveDocument();
        if (action === "savePdf") saveAsPdf();
        if (action === "pageSetup") {
          // open page setup if needed
        }
        menus.forEach((m) => m.classList.remove("open"));
      });
    });

    menus.forEach((menu) => {
      const btn = menu.querySelector<HTMLElement>(".menu-button");
      btn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains("open");
        menus.forEach((m) => m.classList.remove("open"));
        if (!isOpen) menu.classList.add("open");
      });
    });

    document.addEventListener("click", () => {
      menus.forEach((m) => m.classList.remove("open"));
      if (fontColorOpen) {
        fontColorOpen = false;
        fontColorPopup?.classList.remove("open");
      }
      if (highlightOpen) {
        highlightOpen = false;
        highlightPopup?.classList.remove("open");
      }
      if (alignmentOpen) {
        alignmentOpen = false;
        alignmentPopup?.classList.remove("open");
      }
      if (modeOpen) {
        modeOpen = false;
        modeMenu?.classList.remove("open");
      }
      if (lineSpacingOpen) {
        lineSpacingOpen = false;
        lineSpacingMenu?.classList.remove("open");
      }
      if (zoomMenuOpen) {
        zoomMenuOpen = false;
        zoomMenu?.classList.remove("open");
      }
      if (toolbarMoreOpen) {
        toolbarMoreOpen = false;
        toolbarMorePanel?.classList.remove("open");
      }
      if (tableInsertOpen) {
        tableInsertOpen = false;
        tableInsertPopup?.classList.remove("open");
      }
    });

    newButton?.addEventListener("click", newDocument);
    pdfButton?.addEventListener("click", saveAsPdf);
    fileInput?.addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file && editor) {
        file.arrayBuffer().then((buf) => {
          editor?.load(buf);
          if (filenameInput) filenameInput.value = file.name;
          setDirty(false);
          hideError();
          updateAll();
        });
      }
      input.value = "";
    });
    imageInput?.addEventListener("change", async (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file && editor) {
        const buf = await file.arrayBuffer();
        const mime = (file.type || "image/png") as SupportedImageMime;
        await executeImageCommand(editor, {
          type: "insertImage",
          data: new Uint8Array(buf),
          mime,
          widthPoints: 300,
          heightPoints: 200,
        });
      }
      input.value = "";
    });

    themeToggle?.addEventListener("click", () => {
      const t = opts.getTheme() === "dark" ? "light" : "dark";
      opts.setTheme(t);
    });

    pdCancel?.addEventListener("click", closeParagraphDialog);
    pdOk?.addEventListener("click", applyParagraphDialog);
    paragraphDialogOverlay?.addEventListener("mousedown", (e) => {
      if (e.target === paragraphDialogOverlay) closeParagraphDialog();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && paragraphDialogOpen) {
        closeParagraphDialog();
      }
    });

    if (documentViewport) {
      documentViewport.addEventListener("scroll", () => {
        if (rulerScrollFrame !== null) return;
        rulerScrollFrame = requestAnimationFrame(() => {
          rulerScrollFrame = null;
          syncRulers();
          updateActivePage();
          flashPageStatus();
        });
      }, { passive: true });
      resizeObserver = new ResizeObserver(() => {
        updateAll();
        updateNavShift();
      });
      resizeObserver.observe(documentViewport);
    }

    const bindMarginDrag = (
      element: HTMLElement | null,
      state: RulerDragState,
      side: RulerMarginSide,
    ) => {
      if (!element) return;
      element.addEventListener("pointerdown", (event) => beginMarginDrag(state, side, event));
      element.addEventListener("pointermove", (event) => moveMarginDrag(state, side, event));
      element.addEventListener("pointerup", (event) => endMarginDrag(state, side, event));
      element.addEventListener("pointercancel", (event) => endMarginDrag(state, side, event));
    };
    bindMarginDrag(hLeftMarginZone, hDrag, "left");
    bindMarginDrag(hRightMarginZone, hDrag, "right");
    bindMarginDrag(vTopMarginZone, vDrag, "top");
    bindMarginDrag(vBottomMarginZone, vDrag, "bottom");

    const indentHandles: ReadonlyArray<{
      element: HTMLElement | null;
      handle: RulerIndentHandle;
    }> = [
      { element: hFirstLineHandle, handle: "firstLine" },
      { element: hHangingHandle, handle: "hanging" },
      { element: hLeftHandle, handle: "left" },
      { element: hRightHandle, handle: "right" },
    ];
    for (const { element, handle } of indentHandles) {
      if (!element) continue;
      element.addEventListener("pointerdown", (event) => beginIndentDrag(handle, event));
      element.addEventListener("pointermove", (event) => moveIndentDrag(handle, event));
      element.addEventListener("pointerup", (event) => endIndentDrag(handle, event));
      element.addEventListener("pointercancel", (event) => endIndentDrag(handle, event));
      element.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        nudgeIndent(handle, event.key === "ArrowLeft" ? -1 : 1, event.shiftKey);
      });
    }

    navToggle?.addEventListener("click", () => setNavOpen(!navOpen));
    navClose?.addEventListener("click", () => setNavOpen(false));
    navTabHeadings?.addEventListener("click", () => setNavTab("headings"));
    navTabFind?.addEventListener("click", () => setNavTab("find"));
    navTabBar?.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setNavTab(navTab === "headings" ? "find" : "headings");
      (navTab === "headings" ? navTabHeadings : navTabFind)?.focus();
    });

    navHeadingFilter?.addEventListener("input", () => {
      if (navHeadingClear) navHeadingClear.hidden = navHeadingFilter.value.length === 0;
      renderHeadings();
    });
    navHeadingClear?.addEventListener("click", () => {
      if (!navHeadingFilter) return;
      navHeadingFilter.value = "";
      navHeadingClear.hidden = true;
      renderHeadings();
      navHeadingFilter.focus();
    });

    navFindInput?.addEventListener("input", () => {
      navQuery = navFindInput.value;
      if (navFindClear) navFindClear.hidden = navQuery.length === 0;
      if (navDebounceTimer) clearTimeout(navDebounceTimer);
      navDebounceTimer = setTimeout(() => {
        navRunQuery = navQuery;
        runFind();
      }, SEARCH_DEBOUNCE_MS);
      renderFind();
    });
    navFindClear?.addEventListener("click", () => {
      navQuery = "";
      navRunQuery = "";
      if (navFindInput) navFindInput.value = "";
      if (navFindClear) navFindClear.hidden = true;
      navMatches = [];
      navActiveIndex = -1;
      renderFind();
      navFindInput?.focus();
    });
    navMatchCase?.addEventListener("change", runFind);
    navWholeWord?.addEventListener("change", runFind);
    navPrev?.addEventListener("click", () => navStep(-1));
    navNext?.addEventListener("click", () => navStep(1));
  }

  function init() {
    try {
      editor = createDocxEditor({
        container: editorContainer ?? undefined,
        document: "blank",
        locale: "en-US",
      }) as DocxEditorInstance;
      registerEditorSubscriptions();
      observeEditorLayout();
      applyA4Default();
      if (filenameInput) filenameInput.value = "";
      setDirty(false);
      hideError();
      setupEventListeners();
      updateAll();
      requestAnimationFrame(() => {
        updateAll();
        renderHeadings();
        requestAnimationFrame(flashPageStatus);
      });
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  }

  init();

  return {
    editor,
    destroy: () => {
      resizeObserver?.disconnect();
      editorResizeObserver?.disconnect();
      layoutObserver?.disconnect();
      cancelAnimationFrame(rafId);
      if (rulerRefreshFrame !== null) cancelAnimationFrame(rulerRefreshFrame);
      if (rulerScrollFrame !== null) cancelAnimationFrame(rulerScrollFrame);
      if (pageStatusTimer) clearTimeout(pageStatusTimer);
      if (navDebounceTimer) clearTimeout(navDebounceTimer);
      unsubscribeChange?.();
      unsubscribeSelectionChange?.();
      unsubscribeChange = null;
      unsubscribeSelectionChange = null;
      editor?.destroy();
      editor = null;
    },
  };
}
