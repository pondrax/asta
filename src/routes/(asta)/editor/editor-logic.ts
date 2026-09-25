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
type RunFormatting = NonNullable<ReturnType<DocxEditorInstance["snapshot"]>["formatting"]>;

/** Commands accepted by the editor command dispatcher. */
type EditorCommand = Parameters<DocxEditorInstance["can"]>[0];
type TableCellVerticalAlignment = Extract<EditorCommand, { type: "setTableCellVerticalAlignment" }>["alignment"];
type ContextCommand = Extract<
  EditorCommand,
  { type: "cut" | "copy" | "paste" | "pasteWithoutFormatting" | "deleteText" | "selectAll" }
>["type"];

/** Effective paragraph indent at the selection, in twips. */
type IndentFormatting = NonNullable<RunFormatting["indent"]>;

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
] as const;

const HIGHLIGHT_SWATCHES = [
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
  { value: "white", css: "#ffffff" },
] as const;

const DEFAULT_THEME_HEXES = [
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
] as const;

const THEME_COLUMN_KEYS = [
  "Background 1",
  "Text 1",
  "Background 2",
  "Text 2",
  "Accent 1",
  "Accent 2",
  "Accent 3",
  "Accent 4",
  "Accent 5",
  "Accent 6",
] as const;

const ALIGNMENT_SLOTS = [
  "alignment.left",
  "alignment.center",
  "alignment.right",
  "alignment.justify",
] as const;

const ALIGNMENT_ICONS = {
  "alignment.left": "bx:align-left",
  "alignment.center": "bx:align-middle",
  "alignment.right": "bx:align-right",
  "alignment.justify": "bx:align-justify",
} as const;

const MODE_LABELS = {
  editing: "Editing",
  suggesting: "Suggesting",
  viewing: "Viewing",
} as const;

const MODE_ICONS = {
  editing:
    "M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z",
  suggesting:
    "M240-400h122l40-40H240v40Zm0-100h222l40-40H240v40Zm0-100h322l40-40H240v40ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v320h-80v-320H160v525l46-45h274v80H240L80-80Zm520-80v-123l221-220q9-9 20-13t22-4q12 0 23 4.5t20 13.5l37 37q8 9 12.5 20t4.5 22q0 11-4 22.5T943-380L723-160H600Zm300-263-37-37 37 37ZM660-220h38l121-122-19-18-18-19-122 121v38Zm140-141-18-19 37 37-19-18Z",
  viewing:
    "M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Z",
} as const;

const LINE_SPACING_PRESETS = [1, 1.15, 1.5, 2, 2.5, 3] as const;
const DEFAULT_PARAGRAPH_SPACE_PT = 10;
const REMOVED_PARAGRAPH_SPACE_PT = 0;

const TABLE_GRID_COLUMNS = 6;
const TABLE_GRID_ROWS = 6;
const LOADING_MIN_MS = 1000;

const NAV_PANE_WIDTH = 280;
const NAV_PANE_INSET = 32;
const NAV_PANE_GAP = 16;
const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_MATCH_LIMIT = 2000;

const TABLE_COMMANDS: Record<string, EditorCommand> = {
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

function twipsToMm(twips: number): number {
  return (twips / TWIPS_PER_INCH) * 25.4;
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
  return 0.299 * r + 0.587 * g + 0.114 * b > 230;
}

function isTableCellVerticalAlignment(value: string | undefined): value is TableCellVerticalAlignment {
  return value === "top" || value === "center" || value === "bottom";
}

function isContextCommand(value: string | undefined): value is ContextCommand {
  return value === "cut"
    || value === "copy"
    || value === "paste"
    || value === "pasteWithoutFormatting"
    || value === "deleteText"
    || value === "selectAll";
}

function makeSwatch(
  value: string,
  css: string,
  label: string,
  selected = false,
  apply?: (nextValue: string) => void,
): HTMLButtonElement {
  const clean = value.replace("#", "");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swatch";
  button.style.backgroundColor = css;
  button.dataset.value = clean;
  button.title = label;
  button.setAttribute("aria-label", label);
  if (selected) button.setAttribute("data-selected", "");
  if (isLightHex(css.replace("#", ""))) button.setAttribute("data-light", "");
  if (apply) {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => apply(value));
  }
  return button;
}

interface ThemeVariant {
  readonly apply: (channel: number) => number;
}

function themeVariantsFor(baseHex: string): ThemeVariant[] {
  const clean = baseHex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
  const lighter = (pct: number): ThemeVariant => ({
    apply: (channel) => channel + (255 - channel) * (pct / 100),
  });
  const darker = (pct: number): ThemeVariant => ({
    apply: (channel) => channel * (1 - pct / 100),
  });

  if (lightness === 1) return [darker(5), darker(15), darker(25), darker(35), darker(50)];
  if (lightness === 0) return [lighter(50), lighter(35), lighter(25), lighter(15), lighter(5)];
  if (lightness >= 0.8) return [darker(10), darker(25), darker(50), darker(75), darker(90)];
  return [lighter(80), lighter(60), lighter(40), darker(25), darker(50)];
}

function variantHex(themeHex: string, variant: ThemeVariant): string {
  const clean = themeHex.replace("#", "");
  const channels = [0, 2, 4].map((offset) =>
    Math.round(clamp(variant.apply(parseInt(clean.slice(offset, offset + 2), 16)), 0, 255))
      .toString(16)
      .padStart(2, "0"),
  );
  return channels.join("").toUpperCase();
}

export interface DocxEditorSetupOptions {
  onDirtyChange: (dirty: boolean) => void;
  onError: (msg: string | null) => void;
  showToast: (type: "success" | "error", msg: string) => void;
  getTheme: () => string;
  setTheme: (t: string) => void;
  onSignPdf?: (file: File) => void | Promise<void>;
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
  let tableInsertTrigger: HTMLElement | null = null;
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
  let clipboardRefusal: string | null = null;
  let navFindTimer: ReturnType<typeof setTimeout> | null = null;
  let navFindIndex = 0;
  let navSelectedBlockId: string | null = null;
  let findQuery = "";
  let findMatchCase = false;
  let findWholeWord = false;
  let isSearching = false;
  let searchError: string | null = null;
  let tableInsertAnchor: DOMRect | null = null;
  let toolbarMoreHasVisibleItems = false;
  let loadingShownAt = 0;
  let loadingHideTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingDiscardAction: (() => void) | null = null;
  let suppressDirty = false;
  let styleMenuOpen = false;
  let fontMenuOpen = false;
  let moreZoomOpen = false;
  let contextMenuAnchor: { x: number; y: number } | null = null;
  let contextMenuPlacement: { x: number; y: number } | null = null;
  const eventController = new AbortController();
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
  const docIcon = root.querySelector(".header-logo") as HTMLElement | null;
  const newButton = root.querySelector("#newButton") as HTMLButtonElement | null;
  const pdfButton = root.querySelector("#pdfButton") as HTMLButtonElement | null;
  const signButton = root.querySelector("#signButton") as HTMLButtonElement | null;
  const printButton = root.querySelector("#printButton") as HTMLButtonElement | null;
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
  const styleDropdown = root.querySelector("#styleDropdown") as HTMLElement | null;
  const fontDropdown = root.querySelector("#fontDropdown") as HTMLElement | null;
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
  const alignment = root.querySelector("#alignment") as HTMLElement | null;
  const alignmentTrigger = root.querySelector("#alignmentTrigger") as HTMLButtonElement | null;
  const alignmentIcon = root.querySelector("#alignmentIcon") as HTMLElement | null;
  const alignmentPopup = root.querySelector("#alignmentPopup") as HTMLElement | null;
  const lineSpacing = root.querySelector("#lineSpacing") as HTMLElement | null;
  const lineSpacingTrigger = root.querySelector("#lineSpacingTrigger") as HTMLButtonElement | null;
  const lineSpacingMenu = root.querySelector("#lineSpacingMenu") as HTMLElement | null;
  const lineSpacingOptions = root.querySelector("#lineSpacingOptions") as HTMLButtonElement | null;
  const mode = root.querySelector("#mode") as HTMLElement | null;
  const modeTrigger = root.querySelector("#modeTrigger") as HTMLButtonElement | null;
  const spaceBeforeRow = root.querySelector("#spaceBeforeRow") as HTMLButtonElement | null;
  const spaceAfterRow = root.querySelector("#spaceAfterRow") as HTMLButtonElement | null;
  const modeValue = root.querySelector("#modeValue") as HTMLElement | null;
  const modeMenu = root.querySelector("#modeMenu") as HTMLElement | null;
  const commentsButton = root.querySelector("#commentsButton") as HTMLButtonElement | null;
  const toolbarMore = root.querySelector("#toolbarMore") as HTMLElement | null;
  const toolbarMoreButton = root.querySelector("#toolbarMoreButton") as HTMLButtonElement | null;
  const toolbarMorePanel = root.querySelector("#toolbarMorePanel") as HTMLElement | null;
  const moreZoomSubmenu = root.querySelector("#moreZoomSubmenu") as HTMLElement | null;
  const moreZoomPanel = root.querySelector("#moreZoomPanel") as HTMLElement | null;
  const moreZoomValueText = root.querySelector("#moreZoomValueText") as HTMLElement | null;
  const moreStyleSubmenu = root.querySelector("#moreStyleSubmenu") as HTMLElement | null;
  const moreStylePanel = root.querySelector("#moreStylePanel") as HTMLElement | null;
  const moreStyleSearch = root.querySelector("#moreStyleSearch") as HTMLInputElement | null;
  const moreStyleTriggerLabel = root.querySelector("#moreStyleTriggerLabel") as HTMLElement | null;
  const moreFontSubmenu = root.querySelector("#moreFontSubmenu") as HTMLElement | null;
  const moreFontPanel = root.querySelector("#moreFontPanel") as HTMLElement | null;
  const moreFontSearch = root.querySelector("#moreFontSearch") as HTMLInputElement | null;
  const moreFontTriggerLabel = root.querySelector("#moreFontTriggerLabel") as HTMLElement | null;
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
  const contextMenuItems = Array.from(root.querySelectorAll<HTMLButtonElement>("#contextMenu .contextmenu__item"));
  const contextMenuTableSection = root.querySelector("#contextMenuTableSection") as HTMLElement | null;
  const pageSetupDialog = root.querySelector("#pageSetupDialog") as HTMLDialogElement | null;
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
  const discardOverlay = root.querySelector("#discardOverlay") as HTMLElement | null;
  const discardDialog = root.querySelector("#discardDialog") as HTMLElement | null;
  const discardCancel = root.querySelector("#discardCancel") as HTMLButtonElement | null;
  const discardConfirm = root.querySelector("#discardConfirm") as HTMLButtonElement | null;
  const loadingOverlay = root.querySelector("#loadingOverlay") as HTMLElement | null;
  const loadingLabel = root.querySelector("#loadingLabel") as HTMLElement | null;
  const commandButtons = root.querySelectorAll<HTMLButtonElement>(".command[data-slot]");
  const menuItems = root.querySelectorAll<HTMLElement>(".menu-item[data-slot], .menu-item[data-action]");
  const menus = root.querySelectorAll<HTMLElement>(".menu");
  const zoomMenuItems = Array.from(root.querySelectorAll<HTMLButtonElement>("#zoomMenu .zoom-menu__item"));
  const moreZoomItems = Array.from(
    root.querySelectorAll<HTMLButtonElement>("#moreZoomPanel .toolbar-more__submenu-item"),
  );
  const fontMenuItems = Array.from(
    root.querySelectorAll<HTMLButtonElement>("#fontMenu .font-dropdown__item"),
  );
  const moreFontItems = Array.from(
    root.querySelectorAll<HTMLButtonElement>("#moreFontPanel .toolbar-more__submenu-item"),
  );
  const styleMenuItems = Array.from(
    root.querySelectorAll<HTMLButtonElement>("#styleMenu .style-dropdown__item"),
  );
  const moreStyleItems = Array.from(
    root.querySelectorAll<HTMLButtonElement>("#moreStylePanel .toolbar-more__submenu-item"),
  );
  const tableAlignButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("#contextMenuTableSection .contextmenu__align-btn"),
  );

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

  function showLoading(label: string) {
    if (loadingLabel) loadingLabel.textContent = label;
    if (loadingOverlay) loadingOverlay.hidden = false;
    loadingShownAt = performance.now();
    if (loadingHideTimer) clearTimeout(loadingHideTimer);
    loadingHideTimer = null;
  }

  function hideLoading() {
    if (loadingShownAt === 0) {
      if (loadingOverlay) loadingOverlay.hidden = true;
      return;
    }
    const elapsed = performance.now() - loadingShownAt;
    if (elapsed >= LOADING_MIN_MS) {
      if (loadingOverlay) loadingOverlay.hidden = true;
      loadingShownAt = 0;
      return;
    }
    if (loadingHideTimer) clearTimeout(loadingHideTimer);
    loadingHideTimer = setTimeout(() => {
      if (loadingOverlay) loadingOverlay.hidden = true;
      loadingHideTimer = null;
      loadingShownAt = 0;
    }, LOADING_MIN_MS - elapsed);
  }

  function confirmDiscard(action: () => void) {
    if (!dirty || eventController.signal.aborted) {
      action();
      return;
    }
    pendingDiscardAction = action;
    if (discardOverlay) discardOverlay.hidden = false;
    discardConfirm?.focus();
  }

  function closeDiscardDialog() {
    if (discardOverlay) discardOverlay.hidden = true;
    pendingDiscardAction = null;
  }

  function stepZoomLevel(current: number, direction: "in" | "out"): number | null {
    if (!Number.isFinite(current) || current <= 0) return null;
    const epsilon = 0.001;
    const nextPreset = direction === "in"
      ? ZOOM_LEVELS.find((level) => level > current + epsilon)
      : [...ZOOM_LEVELS].reverse().find((level) => level < current - epsilon);
    if (nextPreset !== undefined) return nextPreset;
    return null;
  }

  function setZoomMenuOpen(open: boolean) {
    zoomMenuOpen = open;
    if (zoomMenu) zoomMenu.hidden = !open;
    zoomValue?.setAttribute("aria-expanded", String(open));
  }

  function setMoreZoomMenuOpen(open: boolean) {
    moreZoomOpen = open;
    moreZoomSubmenu?.classList.toggle("is-open", open);
    moreZoomValue?.setAttribute("aria-expanded", String(open));
  }

  function setToolbarMoreOpen(open: boolean) {
    toolbarMoreOpen = open;
    if (toolbarMorePanel) {
      toolbarMorePanel.hidden = !open;
      toolbarMorePanel.classList.toggle("open", open);
    }
    toolbarMoreButton?.setAttribute("aria-expanded", String(open));
    if (!open) setMoreZoomMenuOpen(false);
  }

  function toolbarMoreHasVisibleSections(): boolean {
    if (!toolbarMorePanel) return false;
    return Array.from(toolbarMorePanel.querySelectorAll<HTMLElement>(".toolbar-more__section"))
      .some((section) => !section.hidden && getComputedStyle(section).display !== "none");
  }

  function updateToolbarMoreVisibility() {
    toolbarMoreHasVisibleItems = toolbarMoreHasVisibleSections();
    if (toolbarMore) toolbarMore.hidden = !toolbarMoreHasVisibleItems;
  }

  function setStyleMenuOpen(open: boolean) {
    styleMenuOpen = open;
    if (styleMenu) styleMenu.hidden = !open;
    styleTrigger?.setAttribute("aria-expanded", String(open));
  }

  function setFontMenuOpen(open: boolean) {
    fontMenuOpen = open;
    if (fontMenu) fontMenu.hidden = !open;
    fontTrigger?.setAttribute("aria-expanded", String(open));
    if (open && fontSearch) {
      fontSearch.value = "";
      filterFontItems("");
      fontSearch.focus();
    }
  }

  function setFontColorOpen(open: boolean) {
    fontColorOpen = open;
    if (fontColorPopup) fontColorPopup.hidden = !open;
    fontColorCaret?.setAttribute("aria-expanded", String(open));
  }

  function setHighlightOpen(open: boolean) {
    highlightOpen = open;
    if (highlightPopup) highlightPopup.hidden = !open;
    highlightCaret?.setAttribute("aria-expanded", String(open));
  }

  function setAlignmentOpen(open: boolean) {
    alignmentOpen = open;
    if (alignmentPopup) alignmentPopup.hidden = !open;
    alignmentTrigger?.setAttribute("aria-expanded", String(open));
  }

  function setModeOpen(open: boolean) {
    modeOpen = open;
    if (modeMenu) modeMenu.hidden = !open;
    modeTrigger?.setAttribute("aria-expanded", String(open));
  }

  function setLineSpacingOpen(open: boolean) {
    lineSpacingOpen = open;
    if (lineSpacingMenu) lineSpacingMenu.hidden = !open;
    lineSpacingTrigger?.setAttribute("aria-expanded", String(open));
  }

  function filterFontItems(query: string) {
    const needle = query.trim().toLowerCase();
    root.querySelectorAll<HTMLElement>("#fontMenu .font-dropdown__item").forEach((item) => {
      item.hidden = needle.length > 0 && !(item.textContent || "").trim().toLowerCase().includes(needle);
    });
  }

  function filterMoreFontItems(query: string) {
    const needle = query.trim().toLowerCase();
    root.querySelectorAll<HTMLElement>("#moreFontPanel .toolbar-more__submenu-item").forEach((item) => {
      item.hidden = needle.length > 0 && !(item.textContent || "").trim().toLowerCase().includes(needle);
    });
  }

  function filterStyleItems(query: string) {
    const needle = query.trim().toLowerCase();
    root.querySelectorAll<HTMLElement>("#styleMenu .style-dropdown__item").forEach((item) => {
      item.hidden = needle.length > 0 && !(item.textContent || "").trim().toLowerCase().includes(needle);
    });
  }

  function filterMoreStyleItems(query: string) {
    const needle = query.trim().toLowerCase();
    root.querySelectorAll<HTMLElement>("#moreStylePanel .toolbar-more__submenu-item").forEach((item) => {
      item.hidden = needle.length > 0 && !(item.textContent || "").trim().toLowerCase().includes(needle);
    });
  }

  function applyFontSize(points: number) {
    if (!editor || !Number.isFinite(points) || points <= 0) return;
    const halfPoints = Math.round(points * 2);
    try {
      runToolbarCommand(editor, "font.size", halfPoints);
      if (fontSizeInput) fontSizeInput.value = String(points);
      if (moreFontSizeValue) {
        moreFontSizeValue.textContent = String(points);
        moreFontSizeValue.setAttribute("aria-label", `Font size: ${points}`);
      }
      updateAll();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
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

  function openPageSetup() {
    const instance = editor;
    if (!instance || !pageSetupDialog) return;
    const setup = instance.getPageSetup();
    if (!setup) return;
    if (orientation) orientation.value = setup.orientation;
    if (marginTop) marginTop.value = twipsToMm(setup.marginsTwips.top).toFixed(1);
    if (marginBottom) marginBottom.value = twipsToMm(setup.marginsTwips.bottom).toFixed(1);
    if (marginLeft) marginLeft.value = twipsToMm(setup.marginsTwips.left).toFixed(1);
    if (marginRight) marginRight.value = twipsToMm(setup.marginsTwips.right).toFixed(1);
    const width = Math.min(setup.pageWidthTwips, setup.pageHeightTwips);
    const height = Math.max(setup.pageWidthTwips, setup.pageHeightTwips);
    if (paperSize) {
      if (Math.abs(width - mmToTwips(210)) < 100 && Math.abs(height - mmToTwips(297)) < 100) {
        paperSize.value = "a4";
      } else if (Math.abs(width - mmToTwips(215.9)) < 100 && Math.abs(height - mmToTwips(279.4)) < 100) {
        paperSize.value = "letter";
      } else {
        paperSize.value = "legal";
      }
    }
    pageSetupDialog.showModal();
  }

  function applyPageSetup() {
    const instance = editor;
    if (!instance) return;
    let width: number;
    let height: number;
    switch (paperSize?.value) {
      case "a4":
        width = mmToTwips(210);
        height = mmToTwips(297);
        break;
      case "legal":
        width = mmToTwips(215.9);
        height = mmToTwips(355.6);
        break;
      default:
        width = mmToTwips(215.9);
        height = mmToTwips(279.4);
        break;
    }
    const nextOrientation = orientation?.value === "landscape" ? "landscape" : "portrait";
    if (nextOrientation === "landscape") [width, height] = [height, width];
    const result = instance.exec({
      type: "setPageSetup",
      pageWidth: Math.round(width),
      pageHeight: Math.round(height),
      marginTop: Math.round(mmToTwips(Number(marginTop?.value))),
      marginRight: Math.round(mmToTwips(Number(marginRight?.value))),
      marginBottom: Math.round(mmToTwips(Number(marginBottom?.value))),
      marginLeft: Math.round(mmToTwips(Number(marginLeft?.value))),
      orientation: nextOrientation,
      scope: pageSetupScope?.value === "section" ? "section" : "document",
    });
    if (!result.ok) {
      showError(result.reason);
      return;
    }
    pageSetupDialog?.close();
    updateAll();
  }

  async function newDocument() {
    const instance = editor;
    if (!instance) return;
    showLoading("Creating new document…");
    try {
      suppressDirty = true;
      await instance.load("blank");
      applyA4Default();
      setDirty(false);
      if (documentViewport) documentViewport.scrollTo({ top: 0, left: 0 });
      if (filenameInput) {
        filenameInput.value = "Untitled";
        filenameInput.blur();
      }
      hideError();
      updateAll();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    } finally {
      suppressDirty = false;
      hideLoading();
    }
  }

  async function saveDocument() {
    if (!editor) return;
    try {
      const buffer = await runSave(editor);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const name = filenameInput?.value.trim() || "Untitled";
      anchor.href = url;
      anchor.download = name.endsWith(".docx") ? name : `${name}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDirty(false);
      opts.showToast("success", "Document downloaded.");
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  }

  async function exportMarkdown() {
    const instance = editor;
    if (!instance) return;
    showLoading("Exporting Markdown…");
    try {
      const docxBuffer = await runSave(instance);
      const { exportMarkdown: convertToMarkdown } = await import(
        "@docx-editor.dev/docx-to-markdown"
      );
      const result = await convertToMarkdown(new Uint8Array(docxBuffer), {
        displayMode: "proposed",
      });
      if (typeof result.markdown !== "string") {
        throw new Error("The Markdown converter returned no Markdown.");
      }

      const blob = new Blob([result.markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const name = filenameInput?.value.trim() || "Untitled";
      anchor.href = url;
      anchor.download = name.endsWith(".md") ? name : `${name}.md`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      hideError();
      opts.showToast("success", "Markdown downloaded.");
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    } finally {
      hideLoading();
    }
  }

  async function createPdfFile(): Promise<File> {
    if (!editor) throw new Error("The document editor is not ready.");
    const name = filenameInput?.value.trim() || "Untitled";
    const docxBuffer = await runSave(editor);
    const response = await fetch("/api/docx-to-pdf", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      body: docxBuffer,
    });
    if (!response.ok) {
      let detail = `PDF conversion failed (${response.status}).`;
      try {
        const body = await response.json();
        if (body?.message) detail = body.message;
      } catch {
        // Ignore a non-JSON server error body.
      }
      throw new Error(detail);
    }

    const pdfBlob = await response.blob();
    return new File([pdfBlob], name.endsWith(".pdf") ? name : `${name}.pdf`, {
      type: "application/pdf",
    });
  }

  async function saveAsPdf() {
    if (!editor) return;
    showLoading("Exporting PDF…");
    try {
      const pdfFile = await createPdfFile();
      const url = URL.createObjectURL(pdfFile);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = pdfFile.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      opts.showToast("success", "PDF downloaded.");
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    } finally {
      hideLoading();
    }
  }

  async function openSignPage() {
    if (!editor || !opts.onSignPdf) return;
    showLoading("Preparing document for signing…");
    try {
      const pdfFile = await createPdfFile();
      await opts.onSignPdf(pdfFile);
      hideError();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    } finally {
      hideLoading();
    }
  }

  function printDocument() {
    try {
      window.print();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
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
    if (tableInsertOpen && (anchor === null || anchor === tableInsertTrigger)) {
      setTableInsertOpen(false);
      return;
    }
    setTableInsertOpen(true, anchor);
  }

  function setTableInsertOpen(open: boolean, anchor?: HTMLElement | null) {
    if (!tableInsertPopup) return;
    tableInsertOpen = open;
    tableInsertPopup.hidden = !open;
    tableInsertPopup.classList.toggle("open", open);
    if (!open) {
      tableInsertAnchor = null;
      tableInsertTrigger = null;
      return;
    }

    tableInsertTrigger = anchor ?? null;
    tableInsertAnchor = anchor?.getBoundingClientRect() ?? null;
    positionTableInsertPopup();
    fillTableGrid(toolbarTableGrid, toolbarTableGridCaption, 1, 1);
  }

  function positionTableInsertPopup() {
    if (!tableInsertPopup || !tableInsertAnchor) return;
    const rect = tableInsertAnchor;
    const maxLeft = Math.max(8, window.innerWidth - tableInsertPopup.offsetWidth - 8);
    tableInsertPopup.style.left = `${clamp(rect.left, 8, maxLeft)}px`;
    tableInsertPopup.style.top = `${rect.bottom + 4}px`;
  }

  function fillTableGrid(
    gridEl: HTMLElement | null,
    captionEl: HTMLElement | null,
    rows: number,
    cols: number,
  ) {
    if (!gridEl) return;
    gridEl.querySelectorAll<HTMLElement>(".table-grid__cell").forEach((cell) => {
      const [row, col] = (cell.dataset.cell || "").split("x").map(Number);
      cell.toggleAttribute("data-filled", row <= rows && col <= cols);
    });
    if (captionEl) captionEl.textContent = `${cols} × ${rows}`;
  }

  function buildTableGrid(
    gridEl: HTMLElement | null,
    captionEl: HTMLElement | null,
    onInsert: (rows: number, cols: number) => void,
    signal: AbortSignal,
  ) {
    if (!gridEl) return;
    gridEl.innerHTML = "";
    for (let row = 1; row <= TABLE_GRID_ROWS; row++) {
      const rowEl = document.createElement("div");
      rowEl.className = "table-grid__row";
      for (let col = 1; col <= TABLE_GRID_COLUMNS; col++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "table-grid__cell";
        cell.dataset.cell = `${row}x${col}`;
        cell.setAttribute("aria-label", `${col} × ${row}`);
        cell.addEventListener("mousedown", (event) => event.preventDefault(), { signal });
        const fill = () => fillTableGrid(gridEl, captionEl, row, col);
        cell.addEventListener("mouseenter", fill, { signal });
        cell.addEventListener("focus", fill, { signal });
        cell.addEventListener("click", () => onInsert(row, col), { signal });
        rowEl.appendChild(cell);
      }
      gridEl.appendChild(rowEl);
    }
    fillTableGrid(gridEl, captionEl, 1, 1);
  }

  function insertTableFromGrid(rows: number, cols: number) {
    const instance = editor;
    if (!instance) return;
    const command = { type: "insertTable" as const, rows, cols };
    const availability = instance.can(command);
    if (!availability.ok) {
      showError(availability.reason);
      return;
    }

    try {
      const result = instance.exec(command);
      if (!result.ok) {
        showError(result.reason);
        return;
      }
      if (!result.changed) {
        showError("The table could not be inserted at the current selection.");
        return;
      }

      instance.focus();
      updateAll();
      menus.forEach((menu) => menu.classList.remove("open"));
      tableSubmenu?.classList.remove("open");
      setTableInsertOpen(false);
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  }

  function openParagraphDialog() {
    if (!editor || !paragraphDialogOverlay || !paragraphDialog) return;
    const format = editor.snapshot().formatting ?? {};
    const indent = format.indent ?? ({ left: 0, right: 0, firstLine: 0, mixed: { left: false, right: false, firstLine: false } } as IndentFormatting);
    const paragraphFlags = format.paragraphFlags || ({ contextualSpacing: false, keepNext: false, keepLines: false, widowControl: true, pageBreakBefore: false } as ParagraphFlags);
    pdSeed = {
      alignment: format.alignment === "both" ? "justify" : format.alignment || "left",
      indentLeftTwips: indent.left ?? 0,
      indentRightTwips: indent.right ?? 0,
      indentFirstLineTwips: indent.firstLine ?? null,
      spaceBeforePt: format.spaceBeforePt ?? 0,
      spaceAfterPt: format.spaceAfterPt ?? 0,
      lineSpacing: format.lineSpacing || { rule: "multiple" as const, value: 1.08 },
      contextualSpacing: paragraphFlags.contextualSpacing ?? false,
      keepNext: paragraphFlags.keepNext ?? false,
      keepLines: paragraphFlags.keepLines ?? false,
      widowControl: paragraphFlags.widowControl ?? true,
      pageBreakBefore: paragraphFlags.pageBreakBefore ?? false,
    };
    if (pdAlignment) pdAlignment.value = pdSeed.alignment;
    if (pdIndentLeft) pdIndentLeft.value = twipsToMm(pdSeed.indentLeftTwips).toFixed(1);
    if (pdIndentRight) pdIndentRight.value = twipsToMm(pdSeed.indentRightTwips).toFixed(1);
    const special = pdSeed.indentFirstLineTwips === null ? "none" : pdSeed.indentFirstLineTwips < 0 ? "hanging" : "firstLine";
    if (pdSpecial) pdSpecial.value = special;
    if (pdSpecialBy) {
      const v = pdSeed.indentFirstLineTwips === null ? 0 : Math.abs(pdSeed.indentFirstLineTwips);
      pdSpecialBy.value = twipsToMm(v).toFixed(1);
    }
    if (pdSpecialByRow) pdSpecialByRow.hidden = special === "none";
    if (pdSpaceBefore) pdSpaceBefore.value = pdSeed.spaceBeforePt === null ? "" : String(pdSeed.spaceBeforePt);
    if (pdSpaceAfter) pdSpaceAfter.value = pdSeed.spaceAfterPt === null ? "" : String(pdSeed.spaceAfterPt);
    if (pdLineRule) pdLineRule.value = pdSeed.lineSpacing.rule;
    if (pdLineValue) pdLineValue.value = String(pdSeed.lineSpacing.value);
    if (pdLineUnit) pdLineUnit.textContent = pdSeed.lineSpacing.rule === "multiple" ? "" : "pt";
    if (pdContextualSpacing) pdContextualSpacing.checked = !!pdSeed.contextualSpacing;
    if (pdKeepNext) pdKeepNext.checked = !!pdSeed.keepNext;
    if (pdWidowControl) pdWidowControl.checked = !!pdSeed.widowControl;
    if (pdKeepLines) pdKeepLines.checked = !!pdSeed.keepLines;
    if (pdPageBreakBefore) pdPageBreakBefore.checked = !!pdSeed.pageBreakBefore;
    if (pdError) pdError.textContent = "";
    paragraphDialogOpen = true;
    paragraphDialogOverlay.hidden = false;
    paragraphDialog.focus();
  }

  function closeParagraphDialog() {
    if (!paragraphDialogOverlay) return;
    paragraphDialogOpen = false;
    paragraphDialogOverlay.hidden = true;
  }

  function resetParagraphSpecial() {
    if (pdSpecialByRow) pdSpecialByRow.hidden = pdSpecial?.value === "none";
  }

  function resetParagraphLineRule() {
    if (!pdSeed) return;
    const multiple = pdLineRule?.value === "multiple";
    if (pdLineUnit) pdLineUnit.textContent = multiple ? "" : "pt";
    if (pdLineValue) pdLineValue.step = multiple ? "0.01" : "1";
    if (pdLineRule?.value !== pdSeed.lineSpacing.rule) {
      if (pdLineValue) pdLineValue.value = String(multiple ? 1.08 : 12);
    }
  }

  function applyParagraphDialog() {
    if (!editor || !pdSeed) return;
    const update: Record<string, unknown> = {};
    const align = pdAlignment?.value as any;
    if (align && align !== pdSeed.alignment) update.alignment = align;
    const leftMm = parseFloat(pdIndentLeft?.value || "0");
    const rightMm = parseFloat(pdIndentRight?.value || "0");
    const leftT = mmToTwips(isNaN(leftMm) ? 0 : leftMm);
    const rightT = mmToTwips(isNaN(rightMm) ? 0 : rightMm);
    if (leftT !== pdSeed.indentLeftTwips) update.indentLeftTwips = leftT;
    if (rightT !== pdSeed.indentRightTwips) update.indentRightTwips = rightT;
    const special = pdSpecial?.value || "none";
    let firstLineT: number | null = null;
    if (special === "firstLine") {
      const v = parseFloat(pdSpecialBy?.value || "0");
      firstLineT = mmToTwips(isNaN(v) ? 0 : v);
    } else if (special === "hanging") {
      const v = parseFloat(pdSpecialBy?.value || "0");
      firstLineT = -mmToTwips(isNaN(v) ? 0 : v);
    } else {
      firstLineT = null;
    }
    if (firstLineT !== pdSeed.indentFirstLineTwips) update.indentFirstLineTwips = firstLineT;
    const sb = pdSpaceBefore?.value;
    const sa = pdSpaceAfter?.value;
    const sbPt = sb === undefined || sb === "" || Number.isNaN(Number(sb)) ? 0 : Number(sb);
    const saPt = sa === undefined || sa === "" || Number.isNaN(Number(sa)) ? 0 : Number(sa);
    if (sbPt !== pdSeed.spaceBeforePt) update.spaceBeforePt = sbPt;
    if (saPt !== pdSeed.spaceAfterPt) update.spaceAfterPt = saPt;
    const rule = (pdLineRule?.value || "multiple") as "multiple" | "exact" | "atLeast";
    const lval = Number(pdLineValue?.value) || 0;
    const lspacing = { rule, value: lval };
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
    const command = { type: "setParagraphFormat" as const, ...(update as ParagraphFormatUpdate) };
    if (!editor.can(command).ok) {
      if (pdError) pdError.textContent = "The document refused this paragraph change.";
      return;
    }
    editor.exec(command);
    closeParagraphDialog();
    editor.focus();
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

  function updateZoom() {
    if (!editor) return;
    const snapshot = editor.snapshot();
    const zoom = snapshot.zoom;
    const mode = snapshot.zoomMode;
    const isFit = !!mode && mode.type === "fit";
    const display = `${Math.round(zoom * 100)}%`;
    if (zoomValue) {
      zoomValue.textContent = display;
      zoomValue.setAttribute("aria-label", `Zoom level: ${display}`);
    }
    if (moreZoomValueText) moreZoomValueText.textContent = display;
    moreZoomValue?.setAttribute("aria-label", `Zoom level: ${display}`);

    const autoSelected = mode ? sameZoomMode(mode, AUTO_ZOOM_MODE) : false;
    const fitWidthSelected = mode ? sameZoomMode(mode, FIT_WIDTH_ZOOM_MODE) : false;
    const isSelected = (item: HTMLButtonElement): boolean => {
      if (item.dataset.zoomMode === "auto") return autoSelected;
      if (item.dataset.zoomMode === "fit-width") return fitWidthSelected;
      if (item.dataset.zoomLevel) {
        return !isFit && Math.abs(Number(item.dataset.zoomLevel) - zoom) < 0.001;
      }
      return false;
    };

    for (const item of zoomMenuItems) {
      const selected = isSelected(item);
      item.toggleAttribute("data-selected", selected);
      item.setAttribute("aria-selected", String(selected));
      const check = item.querySelector<HTMLElement>(".zoom-menu__check");
      if (check) check.style.visibility = selected ? "visible" : "hidden";
    }
    for (const item of moreZoomItems) {
      const selected = isSelected(item);
      item.toggleAttribute("data-selected", selected);
      item.setAttribute("aria-checked", String(selected));
      const check = item.querySelector<HTMLElement>(".toolbar-more__zoom-check");
      if (check) check.style.visibility = selected ? "visible" : "hidden";
    }

    const zoomInDisabled = stepZoomLevel(zoom, "in") === null;
    const zoomOutDisabled = stepZoomLevel(zoom, "out") === null;
    if (zoomInBtn) zoomInBtn.disabled = zoomInDisabled;
    if (zoomOutBtn) zoomOutBtn.disabled = zoomOutDisabled;
    if (moreZoomIn) moreZoomIn.disabled = zoomInDisabled;
    if (moreZoomOut) moreZoomOut.disabled = zoomOutDisabled;
  }

  function updateStatus() {
    if (!editor) return;
    updateActivePage();
    const formatting = editor.snapshot().formatting;
    if (!formatting) return;

    if (formatting.fontFamily) {
      const label = formatting.fontFamily;
      if (fontTriggerLabel) fontTriggerLabel.textContent = label;
      if (moreFontTriggerLabel) moreFontTriggerLabel.textContent = label;
      for (const item of fontMenuItems) {
        const selected = item.dataset.fontValue === label;
        item.toggleAttribute("data-selected", selected);
        item.setAttribute("aria-selected", String(selected));
      }
      for (const item of moreFontItems) {
        const selected = item.dataset.fontValue === label;
        item.toggleAttribute("data-selected", selected);
        item.setAttribute("aria-selected", String(selected));
      }
    }

    if (formatting.fontSizePt) {
      const points = formatting.fontSizePt;
      if (fontSizeInput) fontSizeInput.value = String(points);
      if (moreFontSizeValue) {
        moreFontSizeValue.textContent = String(points);
        moreFontSizeValue.setAttribute("aria-label", `Font size: ${points}`);
      }
    }

    if (formatting.styleId) {
      const styleId = formatting.styleId;
      const matchingStyleItem = styleMenuItems.find((item) => item.dataset.styleValue === styleId);
      const displayLabel = matchingStyleItem
        ?.querySelector(".style-dropdown__label")
        ?.textContent?.trim() || styleId;
      if (styleTriggerLabel) styleTriggerLabel.textContent = displayLabel;
      if (moreStyleTriggerLabel) moreStyleTriggerLabel.textContent = displayLabel;
      for (const item of styleMenuItems) {
        const selected = item.dataset.styleValue === styleId;
        item.toggleAttribute("data-selected", selected);
        item.setAttribute("aria-selected", String(selected));
      }
      for (const item of moreStyleItems) {
        const selected = item.dataset.styleValue === styleId;
        item.toggleAttribute("data-selected", selected);
        item.setAttribute("aria-selected", String(selected));
      }
    } else {
      if (styleTriggerLabel) styleTriggerLabel.textContent = "Normal";
      if (moreStyleTriggerLabel) moreStyleTriggerLabel.textContent = "Normal";
    }
  }

  function currentColorValue(): string | null {
    if (!editor) return null;
    const color = editor.snapshot().formatting?.color;
    return color?.kind === "hex" ? color.value.toUpperCase() : null;
  }

  function currentHighlightValue(): string | null {
    return editor?.snapshot().formatting?.highlight ?? null;
  }

  function applyColorValue(slot: "text.color" | "text.highlight", value: string, clearValue: string) {
    if (!editor) return;
    const mark = slot === "text.color" ? "color" : "highlight";
    const command = { type: "setMarkAttr" as const, mark, attr: "val", value };
    if (editor.can(command).ok) {
      editor.exec(command);
      if (value !== clearValue) {
        if (slot === "text.color") lastFontColor = value;
        else lastHighlight = value;
      }
    }
    setFontColorOpen(false);
    setHighlightOpen(false);
    editor.focus();
    updateAll();
  }

  function buildThemeMatrix() {
    if (!editor || !fontColorTheme) return;
    fontColorTheme.replaceChildren();
    const themeEntries = editor.getDocumentThemeColors();
    const themeHexes = themeEntries.length === THEME_COLUMN_KEYS.length
      ? themeEntries.map((entry) => entry.hex)
      : [...DEFAULT_THEME_HEXES];
    const ladders = themeHexes.map(themeVariantsFor);
    const current = currentColorValue();

    themeHexes.forEach((hex, column) => {
      if (!fontColorTheme) return;
      fontColorTheme.appendChild(makeSwatch(
        hex,
        `#${hex.toLowerCase()}`,
        THEME_COLUMN_KEYS[column],
        current === hex,
        (value) => applyColorValue("text.color", value, "auto"),
      ));
    });
    for (let row = 0; row < 5; row++) {
      themeHexes.forEach((base, column) => {
        if (!fontColorTheme) return;
        const hex = variantHex(base, ladders[column][row]);
        fontColorTheme.appendChild(makeSwatch(
          hex,
          `#${hex.toLowerCase()}`,
          `${THEME_COLUMN_KEYS[column]} variant`,
          current === hex,
          (value) => applyColorValue("text.color", value, "auto"),
        ));
      });
    }
  }

  function buildStandardColors() {
    if (!fontColorStandard) return;
    fontColorStandard.replaceChildren();
    const current = currentColorValue();
    for (const swatch of STANDARD_COLOR_SWATCHES) {
      fontColorStandard.appendChild(makeSwatch(
        swatch.value,
        swatch.css,
        swatch.value,
        current === swatch.value,
        (value) => applyColorValue("text.color", value, "auto"),
      ));
    }
  }

  function buildHighlightGrid() {
    if (!highlightGrid) return;
    highlightGrid.replaceChildren();
    const current = currentHighlightValue();
    for (const swatch of HIGHLIGHT_SWATCHES.filter((item) => item.value !== "white")) {
      highlightGrid.appendChild(makeSwatch(
        swatch.value,
        swatch.css,
        swatch.value,
        current === swatch.value,
        (value) => applyColorValue("text.highlight", value, "none"),
      ));
    }
  }

  function updateColorSplit() {
    if (!editor) return;
    if (fontColorBar) {
      fontColorBar.style.backgroundColor = lastFontColor === "auto"
        ? "#000000"
        : `#${lastFontColor}`;
    }
    if (highlightBar) {
      highlightBar.style.backgroundColor = HIGHLIGHT_SWATCHES.find(
        (swatch) => swatch.value === lastHighlight,
      )?.css ?? "#ffff00";
    }

    buildThemeMatrix();
    buildStandardColors();
    buildHighlightGrid();

    const colorEnabled = editor.can({
      type: "setMarkAttr",
      mark: "color",
      attr: "val",
      value: "000000",
    }).ok;
    const highlightEnabled = editor.can({
      type: "setMarkAttr",
      mark: "highlight",
      attr: "val",
      value: "yellow",
    }).ok;
    if (fontColorMain) fontColorMain.disabled = !colorEnabled;
    if (fontColorCaret) fontColorCaret.disabled = !colorEnabled;
    if (highlightMain) highlightMain.disabled = !highlightEnabled;
    if (highlightCaret) highlightCaret.disabled = !highlightEnabled;
  }

  function updateAlignment() {
    const instance = editor;
    if (!instance) return;
    const states = ALIGNMENT_SLOTS.map((slot) => {
      const align = slot.slice("alignment.".length) as "left" | "center" | "right" | "justify";
      const command = { type: "setAlignment" as const, align };
      return {
        slot,
        isActive: instance.isActive(command),
        isEnabled: instance.can(command).ok,
      };
    });
    const current = states.find((state) => state.isActive) ?? states[0];
    alignmentIcon?.setAttribute("icon", ALIGNMENT_ICONS[current.slot]);
    if (alignmentTrigger) {
      const name = current.slot.slice("alignment.".length);
      alignmentTrigger.title = name.charAt(0).toUpperCase() + name.slice(1);
      alignmentTrigger.disabled = !states.some((state) => state.isEnabled);
    }
    alignmentPopup?.querySelectorAll<HTMLButtonElement>("[data-slot]").forEach((button) => {
      const state = states.find((candidate) => candidate.slot === button.dataset.slot);
      if (!state) return;
      button.disabled = !state.isEnabled;
      button.setAttribute("aria-pressed", String(state.isActive));
      button.toggleAttribute("data-active", state.isActive);
    });
  }

  function updateMode() {
    const instance = editor;
    if (!instance) return;
    const current = (instance.snapshot().editingMode ?? "editing") as keyof typeof MODE_LABELS;
    if (modeTrigger) modeTrigger.dataset.mode = current;
    if (modeValue) modeValue.textContent = MODE_LABELS[current] ?? "Editing";
    modeMenu?.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((item) => {
      const mode = item.dataset.mode as keyof typeof MODE_LABELS;
      const checked = mode === current;
      item.setAttribute("aria-checked", String(checked));
      const check = item.querySelector<HTMLElement>(".mode__check");
      if (check) check.textContent = checked ? "✓" : "";
      const can = instance.can({ type: "setEditingMode", mode });
      item.disabled = !can.ok;
      item.title = can.ok ? "" : (can.reason ?? "");
    });
  }

  function applyLines(lines: number) {
    if (!editor) return;
    setLineSpacingOpen(false);
    const command = { type: "setLineSpacing" as const, rule: "multiple" as const, value: lines };
    if (editor.can(command).ok) editor.exec(command);
    editor.focus();
    updateAll();
  }

  function applySpace(field: "beforePt" | "afterPt", points: number) {
    if (!editor) return;
    setLineSpacingOpen(false);
    const command = { type: "setParagraphSpacing" as const, [field]: points };
    if (editor.can(command).ok) editor.exec(command);
    editor.focus();
    updateAll();
  }

  function updateLineSpacing() {
    if (!editor) return;
    const spacing = editor.snapshot().formatting;
    const ticked = spacing?.lineSpacing?.rule === "multiple"
      ? spacing.lineSpacing.value
      : null;
    lineSpacingMenu?.querySelectorAll<HTMLButtonElement>("[data-lines]").forEach((button) => {
      const selected = ticked === Number(button.dataset.lines);
      button.setAttribute("aria-checked", String(selected));
      button.toggleAttribute("data-selected", selected);
      const check = button.querySelector<HTMLElement>(".toolbar-menu__check");
      if (check) check.textContent = selected ? "✓" : "";
    });
    if (spaceBeforeRow) {
      spaceBeforeRow.textContent = (spacing?.spaceBeforePt ?? 0) > 0
        ? "Remove Space Before Paragraph"
        : "Add Space Before Paragraph";
    }
    if (spaceAfterRow) {
      spaceAfterRow.textContent = (spacing?.spaceAfterPt ?? 0) > 0
        ? "Remove Space After Paragraph"
        : "Add Space After Paragraph";
    }
    if (lineSpacingTrigger) {
      lineSpacingTrigger.disabled = !editor.can({
        type: "setLineSpacing",
        rule: "multiple",
        value: 1,
      }).ok;
    }
  }

  function contextMenuEnabled(command: EditorCommand): boolean {
    const instance = editor;
    if (!instance) return false;
    try {
      return instance.can(command).ok;
    } catch {
      return false;
    }
  }

  function closeContextMenu(restoreFocus = false) {
    contextMenuAnchor = null;
    contextMenuPlacement = null;
    contextMenuOpen = false;
    contextMenu?.classList.remove("contextmenu--open");
    if (contextMenu) contextMenu.style.visibility = "hidden";
    if (restoreFocus) editor?.focus();
  }

  function openContextMenu(event: MouseEvent) {
    const instance = editor;
    if (!instance || !contextMenu || !documentViewport) return;
    event.preventDefault();
    const keyboard = event.button === -1 || (event.clientX === 0 && event.clientY === 0);
    const box = documentViewport.getBoundingClientRect();
    contextMenuAnchor = keyboard
      ? { x: box.left + 16, y: box.top + 16 }
      : { x: event.clientX, y: event.clientY };
    contextMenuPlacement = null;
    contextMenuOpen = true;
    contextMenu.classList.add("contextmenu--open");
    contextMenu.style.left = `${contextMenuAnchor.x}px`;
    contextMenu.style.top = `${contextMenuAnchor.y}px`;
    contextMenu.style.visibility = "hidden";
    updateContextMenu();
    requestAnimationFrame(() => {
      const anchor = contextMenuAnchor;
      if (!anchor || !contextMenuOpen) return;
      const rect = contextMenu.getBoundingClientRect();
      const inset = 8;
      const maxX = window.innerWidth - rect.width - inset;
      const maxY = window.innerHeight - rect.height - inset;
      const x = Math.max(
        inset,
        anchor.x > maxX ? anchor.x - rect.width : anchor.x,
      );
      const y = Math.max(
        inset,
        anchor.y > maxY ? anchor.y - rect.height : anchor.y,
      );
      contextMenuPlacement = { x, y };
      contextMenu.style.left = `${x}px`;
      contextMenu.style.top = `${y}px`;
      contextMenu.style.visibility = "visible";
      contextMenu.focus({ preventScroll: true });
    });
  }

  async function readClipboardPayload(): Promise<{ text: string; html: string | null }> {
    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.read === "function" && typeof ClipboardItem !== "undefined") {
      try {
        const items = await clipboard.read();
        let text = "";
        let html: string | null = null;
        for (const item of items) {
          if (item.types.includes("text/plain")) {
            text = await (await item.getType("text/plain")).text();
          }
          if (item.types.includes("text/html")) {
            html = await (await item.getType("text/html")).text();
          }
        }
        if (text || html) return { text, html };
      } catch {
        // Fall back to the plain-text clipboard API.
      }
    }
    return {
      text: clipboard ? await clipboard.readText() : "",
      html: null,
    };
  }

  function updateContextMenu() {
    const instance = editor;
    if (!instance) return;
    const states: Record<string, boolean> = {
      cut: contextMenuEnabled({ type: "cut" }),
      copy: contextMenuEnabled({ type: "copy" }),
      paste: contextMenuEnabled({ type: "paste", text: " " }),
      pasteWithoutFormatting: contextMenuEnabled({ type: "pasteWithoutFormatting", text: " " }),
      deleteText: false,
      selectAll: contextMenuEnabled({ type: "selectAll" }),
    };
    for (const item of contextMenuItems) {
      const command = item.dataset.cmd;
      if (command && command in states) {
        item.disabled = !states[command];
        item.removeAttribute("title");
      }
    }
    if (clipboardRefusal) {
      for (const item of contextMenuItems) {
        if (item.dataset.cmd === "paste" || item.dataset.cmd === "pasteWithoutFormatting") {
          item.disabled = true;
          item.title = clipboardRefusal;
        }
      }
    }

    let tableContext: unknown = null;
    try {
      tableContext = instance.snapshot().table ?? instance.query({ type: "tableContext" });
    } catch {
      tableContext = instance.snapshot().table ?? null;
    }
    if (contextMenuTableSection) {
      contextMenuTableSection.hidden = !tableContext;
      if (tableContext) {
        contextMenuTableSection.querySelectorAll<HTMLButtonElement>(".contextmenu__item").forEach((item) => {
          const command = item.dataset.tableCmd;
          if (command && command in TABLE_COMMANDS) {
            item.disabled = !contextMenuEnabled(TABLE_COMMANDS[command]);
          }
        });
        for (const button of tableAlignButtons) {
          const alignment = button.dataset.align;
          button.disabled = !isTableCellVerticalAlignment(alignment)
            || !contextMenuEnabled({ type: "setTableCellVerticalAlignment", alignment });
        }
      }
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
    zoom: number,
  ) {
    // Generate ticks at zoom 1, then scale their positions. A ruler is a
    // screen-space projection of the page: at 200% both the page and every
    // labelled interval must be twice as wide, rather than fitting the same
    // number of ticks into a larger page.
    const trailingSizePx = Math.max(0, pageSizePx - contentOffsetPx - contentSizePx);
    const marginTicks = generateRulerTicks(contentOffsetPx / zoom, "cm");
    const contentTicks = generateRulerTicks(contentSizePx / zoom, "cm");
    const trailingTicks = generateRulerTicks(trailingSizePx / zoom, "cm");

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
      const positionPx = tick.position * zoom;
      if (positionPx < contentOffsetPx - 0.5) appendTick(positionPx, tick, false);
    }
    for (const tick of contentTicks) {
      appendTick(contentOffsetPx + tick.position * zoom, tick, true);
    }
    for (const tick of trailingTicks) {
      appendTick(contentOffsetPx + contentSizePx + tick.position * zoom, tick, false);
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
    renderRulerAxis(horizontalRulerInner, widthPx, offsetX, contentWidthPx, true, zoom);
    renderRulerAxis(verticalRulerInner, heightPx, offsetY, contentHeightPx, false, zoom);

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
    if (current !== null) pageStatus.textContent = `Page ${current} of ${total}`;
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
    rafId = requestAnimationFrame(() => {
      updateToolbar();
      updateStatus();
      updateZoom();
      updateColorSplit();
      updateAlignment();
      updateLineSpacing();
      updateMode();
      updateNavShift();
      renderHeadings();
      updateContextMenu();
      requestAnimationFrame(() => updateRulers());
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
    unsubscribeChange = editor.on("change", (change) => {
      if (!suppressDirty && change.source !== "load") setDirty(true);
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
    const eventSignal = eventController.signal;
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
      btn.addEventListener("mousedown", (e) => e.preventDefault(), { signal: eventSignal });
      btn.addEventListener("click", () => {
        const slot = btn.dataset.slot;
        if (slot) handleSlot(slot, btn);
        if (toolbarMoreOpen) setToolbarMoreOpen(false);
      }, { signal: eventSignal });
    });

    menuItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const slot = item.dataset.slot;
        const action = item.dataset.action;
        if (slot) {
          try {
            handleSlot(slot, item);
          } catch (error) {
            showError(error instanceof Error ? error.message : String(error));
          }
          updateAll();
        }
        if (action === "new") confirmDiscard(newDocument);
        if (action === "open") confirmDiscard(() => fileInput?.click());
        if (action === "save") void saveDocument();
        if (action === "exportMarkdown") void exportMarkdown();
        if (action === "savePdf") void saveAsPdf();
        if (action === "print") printDocument();
        if (action === "pageSetup") openPageSetup();
        menus.forEach((m) => m.classList.remove("open"));
      }, { signal: eventSignal });
    });

    menus.forEach((menu) => {
      const btn = menu.querySelector<HTMLElement>(".menu-button");
      btn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains("open");
        menus.forEach((m) => m.classList.remove("open"));
        if (!isOpen) menu.classList.add("open");
      }, { signal: eventSignal });
    });

    document.addEventListener("click", () => {
      menus.forEach((m) => m.classList.remove("open"));
    }, { signal: eventSignal });

    buildTableGrid(toolbarTableGrid, toolbarTableGridCaption, insertTableFromGrid, eventSignal);
    buildTableGrid(tableGrid, tableGridCaption, insertTableFromGrid, eventSignal);
    const resetMenuTableGrid = () => fillTableGrid(tableGrid, tableGridCaption, 1, 1);
    tableSubmenu?.addEventListener("mouseenter", resetMenuTableGrid, { signal: eventSignal });
    tableSubmenu?.addEventListener("focusin", resetMenuTableGrid, { signal: eventSignal });
    document.addEventListener("mousedown", (event) => {
      if (!tableInsertOpen) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || (!tableInsertPopup?.contains(target) && !target.closest('[data-slot="table.insert"]'))) {
        setTableInsertOpen(false);
      }
    }, { signal: eventSignal });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && tableInsertOpen) setTableInsertOpen(false);
    }, { signal: eventSignal });
    window.addEventListener("scroll", (event) => {
      if (tableInsertOpen && (event.target === document || event.target === window)) {
        setTableInsertOpen(false);
      }
    }, { capture: true, signal: eventSignal });

    fontSearch?.addEventListener("input", () => filterFontItems(fontSearch.value), { signal: eventSignal });
    fontSearch?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setFontMenuOpen(false);
      fontTrigger?.focus();
    }, { signal: eventSignal });
    fontTrigger?.addEventListener("click", () => setFontMenuOpen(!fontMenuOpen), { signal: eventSignal });
    document.addEventListener("mousedown", (event) => {
      if (fontMenuOpen && !fontDropdown?.contains(event.target as Node)) setFontMenuOpen(false);
    }, { signal: eventSignal });
    for (const item of fontMenuItems) {
      item.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
      item.addEventListener("click", () => {
        const value = item.dataset.fontValue;
        if (!value) return;
        try {
          if (editor) runToolbarCommand(editor, "font.family", value);
          updateAll();
        } catch (error) {
          showError(error instanceof Error ? error.message : String(error));
        }
        setFontMenuOpen(false);
      }, { signal: eventSignal });
    }

    fontSizeMinus?.addEventListener("click", () => {
      const current = Number(fontSizeInput?.value) || 11;
      applyFontSize(Math.max(1, current - 1));
    }, { signal: eventSignal });
    fontSizePlus?.addEventListener("click", () => {
      const current = Number(fontSizeInput?.value) || 11;
      applyFontSize(Math.min(1638, current + 1));
    }, { signal: eventSignal });
    fontSizeInput?.addEventListener("change", () => {
      const value = Number(fontSizeInput.value);
      if (!value || value < 1) {
        fontSizeInput.value = "11";
        return;
      }
      applyFontSize(Math.min(1638, Math.round(value)));
    }, { signal: eventSignal });
    fontSizeInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      fontSizeInput.blur();
    }, { signal: eventSignal });

    styleTrigger?.addEventListener("click", () => setStyleMenuOpen(!styleMenuOpen), { signal: eventSignal });
    document.addEventListener("mousedown", (event) => {
      if (styleMenuOpen && !styleDropdown?.contains(event.target as Node)) setStyleMenuOpen(false);
    }, { signal: eventSignal });
    for (const item of styleMenuItems) {
      item.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
      item.addEventListener("click", () => {
        const value = item.dataset.styleValue;
        if (!value) return;
        try {
          if (editor) runToolbarCommand(editor, "styles.style", value);
          updateAll();
        } catch (error) {
          showError(error instanceof Error ? error.message : String(error));
        }
        setStyleMenuOpen(false);
      }, { signal: eventSignal });
    }

    zoomValue?.addEventListener("click", () => setZoomMenuOpen(!zoomMenuOpen), { signal: eventSignal });
    document.addEventListener("mousedown", (event) => {
      if (zoomMenuOpen && !zoomTrigger?.contains(event.target as Node)) setZoomMenuOpen(false);
    }, { signal: eventSignal });
    const applyZoomStep = (direction: "in" | "out") => {
      if (!editor) return;
      const next = stepZoomLevel(editor.getZoom(), direction);
      if (next !== null) editor.setZoom(next);
      updateAll();
    };
    zoomInBtn?.addEventListener("click", () => applyZoomStep("in"), { signal: eventSignal });
    zoomOutBtn?.addEventListener("click", () => applyZoomStep("out"), { signal: eventSignal });
    for (const item of zoomMenuItems) {
      item.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
      item.addEventListener("click", () => {
        if (!editor) return;
        const mode = item.dataset.zoomMode;
        const level = item.dataset.zoomLevel;
        if (mode === "auto") editor.setZoomMode(AUTO_ZOOM_MODE);
        else if (mode === "fit-width") editor.setZoomMode(FIT_WIDTH_ZOOM_MODE);
        else if (level) editor.setZoom(Number(level));
        setZoomMenuOpen(false);
        updateAll();
      }, { signal: eventSignal });
    }

    fontColorMain?.addEventListener("click", () => {
      applyColorValue("text.color", lastFontColor, "auto");
    }, { signal: eventSignal });
    highlightMain?.addEventListener("click", () => {
      applyColorValue("text.highlight", lastHighlight, "none");
    }, { signal: eventSignal });
    fontColorCaret?.addEventListener("click", () => {
      setHighlightOpen(false);
      setFontColorOpen(!fontColorOpen);
    }, { signal: eventSignal });
    highlightCaret?.addEventListener("click", () => {
      setFontColorOpen(false);
      setHighlightOpen(!highlightOpen);
    }, { signal: eventSignal });
    document.addEventListener("mousedown", (event) => {
      if (fontColorOpen && !fontColorSplit?.contains(event.target as Node)) setFontColorOpen(false);
      if (highlightOpen && !highlightSplit?.contains(event.target as Node)) setHighlightOpen(false);
    }, { signal: eventSignal });
    fontColorPopup
      ?.querySelector<HTMLButtonElement>(".swatch-clear")
      ?.addEventListener("click", () => {
        applyColorValue("text.color", "auto", "auto");
      }, { signal: eventSignal });
    highlightPopup
      ?.querySelector<HTMLButtonElement>(".swatch-clear")
      ?.addEventListener("click", () => {
        applyColorValue("text.highlight", "none", "none");
      }, { signal: eventSignal });
    fontColorHex?.addEventListener("input", () => {
      fontColorHex.value = fontColorHex.value.replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
      if (fontColorApply) {
        fontColorApply.disabled = !/^[0-9A-Fa-f]{6}$/.test(fontColorHex.value);
      }
    }, { signal: eventSignal });
    fontColorHex?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || fontColorApply?.disabled) return;
      event.preventDefault();
      applyColorValue("text.color", fontColorHex.value.toUpperCase(), "auto");
    }, { signal: eventSignal });
    fontColorApply?.addEventListener("click", () => {
      applyColorValue("text.color", fontColorHex?.value.toUpperCase() ?? "", "auto");
    }, { signal: eventSignal });

    alignmentTrigger?.addEventListener("click", () => {
      setAlignmentOpen(!alignmentOpen);
    }, { signal: eventSignal });
    document.addEventListener("mousedown", (event) => {
      if (alignmentOpen && !alignment?.contains(event.target as Node)) setAlignmentOpen(false);
    }, { signal: eventSignal });
    alignmentPopup?.querySelectorAll<HTMLButtonElement>("[data-slot]").forEach((button) => {
      button.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
      button.addEventListener("click", () => {
        if (!editor) return;
        const slot = button.dataset.slot;
        if (!slot) return;
        const align = slot.slice("alignment.".length) as "left" | "center" | "right" | "justify";
        const command = { type: "setAlignment" as const, align };
        if (editor.can(command).ok) editor.exec(command);
        setAlignmentOpen(false);
        editor.focus();
        updateAll();
      }, { signal: eventSignal });
    });

    modeTrigger?.addEventListener("click", () => setModeOpen(!modeOpen), { signal: eventSignal });
    document.addEventListener("mousedown", (event) => {
      if (modeOpen && !mode?.contains(event.target as Node)) setModeOpen(false);
    }, { signal: eventSignal });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modeOpen) setModeOpen(false);
    }, { signal: eventSignal });
    modeMenu?.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((item) => {
      item.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
      item.addEventListener("click", () => {
        if (!editor) return;
        const nextMode = item.dataset.mode as keyof typeof MODE_LABELS | undefined;
        if (!nextMode) return;
        const command = { type: "setEditingMode" as const, mode: nextMode };
        if (editor.can(command).ok) editor.exec(command);
        setModeOpen(false);
        editor.focus();
        updateAll();
      }, { signal: eventSignal });
    });

    commentsButton?.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
    commentsButton?.addEventListener("click", () => {
      if (!editor) return;
      try {
        const command = { type: "toggleReviewPane" as const };
        if (editor.can(command).ok) editor.exec(command);
        updateAll();
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    }, { signal: eventSignal });

    lineSpacingTrigger?.addEventListener("click", () => {
      setLineSpacingOpen(!lineSpacingOpen);
    }, { signal: eventSignal });
    document.addEventListener("mousedown", (event) => {
      if (lineSpacingOpen && !lineSpacing?.contains(event.target as Node)) setLineSpacingOpen(false);
    }, { signal: eventSignal });
    lineSpacingMenu?.querySelectorAll<HTMLButtonElement>("[data-lines]").forEach((button) => {
      button.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
      button.addEventListener("click", () => {
        const lines = Number(button.dataset.lines);
        if (Number.isFinite(lines)) applyLines(lines);
      }, { signal: eventSignal });
    });
    lineSpacingOptions?.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
    lineSpacingOptions?.addEventListener("click", () => {
      setLineSpacingOpen(false);
      openParagraphDialog();
    }, { signal: eventSignal });
    spaceBeforeRow?.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
    spaceBeforeRow?.addEventListener("click", () => {
      const hasBefore = (editor?.snapshot().formatting?.spaceBeforePt ?? 0) > 0;
      applySpace("beforePt", hasBefore ? REMOVED_PARAGRAPH_SPACE_PT : DEFAULT_PARAGRAPH_SPACE_PT);
    }, { signal: eventSignal });
    spaceAfterRow?.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
    spaceAfterRow?.addEventListener("click", () => {
      const hasAfter = (editor?.snapshot().formatting?.spaceAfterPt ?? 0) > 0;
      applySpace("afterPt", hasAfter ? REMOVED_PARAGRAPH_SPACE_PT : DEFAULT_PARAGRAPH_SPACE_PT);
    }, { signal: eventSignal });

    toolbarMoreButton?.addEventListener("click", () => {
      if (!toolbarMoreOpen && !toolbarMoreHasVisibleSections()) return;
      setToolbarMoreOpen(!toolbarMoreOpen);
    }, { signal: eventSignal });
    document.addEventListener("pointerdown", (event) => {
      if (toolbarMoreOpen && !toolbarMore?.contains(event.target as Node)) setToolbarMoreOpen(false);
    }, { capture: true, signal: eventSignal });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toolbarMoreOpen) setToolbarMoreOpen(false);
    }, { signal: eventSignal });
    window.addEventListener("resize", () => {
      if (toolbarMoreOpen && !toolbarMoreHasVisibleSections()) setToolbarMoreOpen(false);
      updateToolbarMoreVisibility();
    }, { signal: eventSignal });
    updateToolbarMoreVisibility();

    moreZoomSubmenu?.addEventListener("focusout", (event) => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !moreZoomSubmenu.contains(nextTarget)) {
        setMoreZoomMenuOpen(false);
      }
    }, { signal: eventSignal });
    moreZoomValue?.addEventListener("click", (event) => {
      event.stopPropagation();
      setMoreZoomMenuOpen(!moreZoomOpen);
    }, { signal: eventSignal });
    moreZoomOut?.addEventListener("click", () => applyZoomStep("out"), { signal: eventSignal });
    moreZoomIn?.addEventListener("click", () => applyZoomStep("in"), { signal: eventSignal });
    for (const item of moreZoomItems) {
      item.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
      item.addEventListener("click", () => {
        if (!editor) return;
        const mode = item.dataset.zoomMode;
        const level = item.dataset.zoomLevel;
        if (mode === "auto") editor.setZoomMode(AUTO_ZOOM_MODE);
        else if (mode === "fit-width") editor.setZoomMode(FIT_WIDTH_ZOOM_MODE);
        else if (level) editor.setZoom(Number(level));
        setMoreZoomMenuOpen(false);
        updateAll();
      }, { signal: eventSignal });
    }

    const resetMoreStyleSearch = () => {
      if (!moreStyleSearch) return;
      moreStyleSearch.value = "";
      filterMoreStyleItems("");
    };
    moreStyleSubmenu?.addEventListener("mouseenter", resetMoreStyleSearch, { signal: eventSignal });
    moreStyleTrigger?.addEventListener("focus", resetMoreStyleSearch, { signal: eventSignal });
    moreStyleSearch?.addEventListener("input", () => {
      filterMoreStyleItems(moreStyleSearch.value);
    }, { signal: eventSignal });
    moreStyleSearch?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      resetMoreStyleSearch();
      moreStyleTrigger?.focus();
    }, { signal: eventSignal });
    for (const item of moreStyleItems) {
      item.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
      item.addEventListener("click", () => {
        const value = item.dataset.styleValue;
        if (!value || !editor) return;
        try {
          runToolbarCommand(editor, "styles.style", value);
          updateAll();
        } catch (error) {
          showError(error instanceof Error ? error.message : String(error));
        }
      }, { signal: eventSignal });
    }

    const resetMoreFontSearch = () => {
      if (!moreFontSearch) return;
      moreFontSearch.value = "";
      filterMoreFontItems("");
    };
    moreFontSubmenu?.addEventListener("mouseenter", resetMoreFontSearch, { signal: eventSignal });
    moreFontTrigger?.addEventListener("focus", resetMoreFontSearch, { signal: eventSignal });
    moreFontSearch?.addEventListener("input", () => {
      filterMoreFontItems(moreFontSearch.value);
    }, { signal: eventSignal });
    moreFontSearch?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      resetMoreFontSearch();
      moreFontTrigger?.focus();
    }, { signal: eventSignal });
    for (const item of moreFontItems) {
      item.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
      item.addEventListener("click", () => {
        const value = item.dataset.fontValue;
        if (!value || !editor) return;
        try {
          runToolbarCommand(editor, "font.family", value);
          updateAll();
        } catch (error) {
          showError(error instanceof Error ? error.message : String(error));
        }
      }, { signal: eventSignal });
    }
    moreFontSizeMinus?.addEventListener("click", () => {
      const current = Number(fontSizeInput?.value) || 11;
      applyFontSize(Math.max(1, current - 1));
    }, { signal: eventSignal });
    moreFontSizePlus?.addEventListener("click", () => {
      const current = Number(fontSizeInput?.value) || 11;
      applyFontSize(Math.min(1638, current + 1));
    }, { signal: eventSignal });

    const newDocumentFromHeader = () => confirmDiscard(newDocument);
    newButton?.addEventListener("click", newDocumentFromHeader, { signal: eventSignal });
    pdfButton?.addEventListener("click", () => void saveAsPdf(), { signal: eventSignal });
    signButton?.addEventListener("click", () => void openSignPage(), { signal: eventSignal });
    printButton?.addEventListener("click", printDocument, { signal: eventSignal });
    fileInput?.addEventListener("change", async (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const instance = editor;
      if (!instance) return;
      showLoading("Opening document…");
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        suppressDirty = true;
        await instance.load(bytes);
        setDirty(false);
        if (filenameInput) filenameInput.value = file.name;
        if (documentViewport) documentViewport.scrollTo({ top: 0, left: 0 });
        hideError();
        updateAll();
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      } finally {
        suppressDirty = false;
        hideLoading();
        input.value = "";
      }
    }, { signal: eventSignal });
    imageInput?.addEventListener("change", async (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const instance = editor;
      if (!instance) {
        input.value = "";
        return;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const mime = (file.type || "image/png") as SupportedImageMime;
        await executeImageCommand(instance, {
          type: "insertImage",
          data: bytes,
          mime,
          widthPoints: 300,
          heightPoints: 200,
        });
        updateAll();
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      } finally {
        input.value = "";
      }
    }, { signal: eventSignal });

    filenameInput?.addEventListener("change", () => {
      const name = filenameInput.value.trim();
      if (!name) filenameInput.value = "Untitled";
    }, { signal: eventSignal });
    const updateDocIconTitle = () => {
      if (docIcon) docIcon.title = filenameInput?.value.trim() || "Untitled";
    };
    updateDocIconTitle();
    filenameInput?.addEventListener("input", updateDocIconTitle, { signal: eventSignal });
    docIcon?.addEventListener("click", (event) => {
      if (!window.matchMedia("(max-width: 640px)").matches || !filenameWrap) return;
      event.preventDefault();
      const open = filenameWrap.classList.toggle("open");
      if (open) filenameInput?.focus();
    }, { signal: eventSignal });
    document.addEventListener("pointerdown", (event) => {
      if (filenameWrap?.classList.contains("open")
        && !filenameWrap.contains(event.target as Node)
        && !docIcon?.contains(event.target as Node)) {
        filenameWrap.classList.remove("open");
      }
    }, { capture: true, signal: eventSignal });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && filenameWrap?.classList.contains("open")) {
        filenameWrap.classList.remove("open");
        docIcon?.focus();
      }
    }, { signal: eventSignal });

    pageSetupCancel?.addEventListener("click", () => pageSetupDialog?.close(), { signal: eventSignal });
    pageSetupApply?.addEventListener("click", applyPageSetup, { signal: eventSignal });

    pdCancel?.addEventListener("click", closeParagraphDialog, { signal: eventSignal });
    pdOk?.addEventListener("click", applyParagraphDialog, { signal: eventSignal });
    pdSpecial?.addEventListener("change", resetParagraphSpecial, { signal: eventSignal });
    pdLineRule?.addEventListener("change", resetParagraphLineRule, { signal: eventSignal });
    paragraphDialogOverlay?.addEventListener("mousedown", (e) => {
      if (e.target === paragraphDialogOverlay) closeParagraphDialog();
    }, { signal: eventSignal });
    discardCancel?.addEventListener("click", closeDiscardDialog, { signal: eventSignal });
    discardConfirm?.addEventListener("click", () => {
      const action = pendingDiscardAction;
      closeDiscardDialog();
      if (action) action();
    }, { signal: eventSignal });
    discardOverlay?.addEventListener("mousedown", (e) => {
      if (e.target === discardOverlay) closeDiscardDialog();
    }, { signal: eventSignal });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (paragraphDialogOpen) closeParagraphDialog();
      else if (discardOverlay && !discardOverlay.hidden) closeDiscardDialog();
    }, { signal: eventSignal });

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

    documentViewport?.addEventListener(
      "contextmenu",
      openContextMenu,
      { signal: eventSignal },
    );
    document.addEventListener(
      "pointerdown",
      () => {
        if (contextMenuAnchor) closeContextMenu();
      },
      { capture: true, signal: eventSignal },
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (!contextMenuAnchor) return;
        if (event.key === "Escape") {
          event.preventDefault();
          closeContextMenu(true);
        } else if (event.key === "Tab") {
          closeContextMenu();
        }
      },
      { signal: eventSignal },
    );
    document.addEventListener(
      "scroll",
      () => closeContextMenu(),
      { capture: true, passive: true, signal: eventSignal },
    );
    window.addEventListener("blur", () => closeContextMenu(), { signal: eventSignal });
    window.addEventListener("resize", () => closeContextMenu(), { signal: eventSignal });
    contextMenu?.addEventListener(
      "keydown",
      (event) => {
        const items = contextMenuItems.filter(
          (item) => !item.disabled && !item.closest("[hidden]"),
        );
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown") {
          event.preventDefault();
          items[(index + 1) % items.length]?.focus();
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          items[(index - 1 + items.length) % items.length]?.focus();
        } else if (event.key === "Home") {
          event.preventDefault();
          items[0]?.focus();
        } else if (event.key === "End") {
          event.preventDefault();
          items[items.length - 1]?.focus();
        }
      },
      { signal: eventSignal },
    );
    for (const item of contextMenuItems) {
      item.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
      item.addEventListener("click", async () => {
        const instance = editor;
        if (!instance) {
          closeContextMenu();
          return;
        }
        const command = item.dataset.cmd;
        const slot = item.dataset.slot;
        try {
          if (command === "deleteText") {
            closeContextMenu(true);
            return;
          }
          if (command === "paste" || command === "pasteWithoutFormatting") {
            const { text, html } = await readClipboardPayload();
            if (text || html) {
              instance.exec(command === "paste"
                ? { type: "paste", text, ...(html ? { html } : {}) }
                : { type: "pasteWithoutFormatting", text });
              clipboardRefusal = null;
            }
          } else if (isContextCommand(command)) {
            if (command === "cut") instance.exec({ type: "cut" });
            else if (command === "copy") instance.exec({ type: "copy" });
            else if (command === "selectAll") instance.exec({ type: "selectAll" });
          } else if (item.dataset.tableCmd) {
            const tableCommand = TABLE_COMMANDS[item.dataset.tableCmd];
            if (tableCommand) instance.exec(tableCommand);
          } else if (slot) {
            handleSlot(slot);
          }
          updateAll();
        } catch (error) {
          if (command === "paste" || command === "pasteWithoutFormatting") {
            clipboardRefusal = error instanceof Error
              ? error.message
              : "The clipboard is not readable.";
          } else {
            showError(error instanceof Error ? error.message : String(error));
          }
          updateContextMenu();
        }
        closeContextMenu(true);
      }, { signal: eventSignal });
    }
    for (const button of tableAlignButtons) {
      button.addEventListener("mousedown", (event) => event.preventDefault(), { signal: eventSignal });
      button.addEventListener("click", () => {
        const instance = editor;
        const alignment = button.dataset.align;
        if (!instance) {
          closeContextMenu();
          return;
        }
        try {
          if (isTableCellVerticalAlignment(alignment)) {
            instance.exec({ type: "setTableCellVerticalAlignment", alignment });
          }
          updateAll();
        } catch (error) {
          showError(error instanceof Error ? error.message : String(error));
        }
        closeContextMenu(true);
      }, { signal: eventSignal });
    }

    document.addEventListener("keydown", (event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      switch (event.key.toLowerCase()) {
        case "s":
          event.preventDefault();
          if (event.shiftKey) void saveAsPdf();
          else void saveDocument();
          break;
        case "o":
          event.preventDefault();
          confirmDiscard(() => fileInput?.click());
          break;
        case "n":
          event.preventDefault();
          confirmDiscard(newDocument);
          break;
        case "p":
          event.preventDefault();
          printDocument();
          break;
      }
    }, { signal: eventSignal });
  }

  function init() {
    try {
      editor = createDocxEditor({
        container: editorContainer ?? undefined,
        document: "blank",
        locale: "en-US",
      }) as DocxEditorInstance;
      applyA4Default();
      registerEditorSubscriptions();
      observeEditorLayout();
      if (filenameInput) filenameInput.value = "Untitled";
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
      if (navFindTimer) clearTimeout(navFindTimer);
      if (loadingHideTimer) clearTimeout(loadingHideTimer);
      loadingHideTimer = null;
      unsubscribeChange?.();
      unsubscribeSelectionChange?.();
      unsubscribeChange = null;
      unsubscribeSelectionChange = null;
      eventController.abort();
      editor?.destroy();
      editor = null;
    },
  };
}
