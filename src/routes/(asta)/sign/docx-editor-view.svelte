<script lang="ts">
  import { onMount, onDestroy, untrack, tick } from "svelte";
  import { app } from "$lib/app/index.svelte";
  import {
    setupDocxEditor,
    type DocxEditorSetupHandle,
    type DocxSelectionFormatting,
  } from "$lib/docx-editor/editor-logic";
  import "$lib/docx-editor/editor.css";

  export type DocxEditorViewHandle = {
    saveAsPdfFile: () => Promise<File>;
    saveAsDocxFile: () => Promise<File>;
    undo: () => void;
    redo: () => void;
    runCommand: (slot: string, value?: string | number) => void;
    insertImage: (file: File) => Promise<void>;
    handle?: DocxEditorSetupHandle | null;
  };

  let {
    file = null,
    initialZoom = 1,
    isNew = false,
    controller = $bindable(),
    onHistoryChange,
    onFormattingChange,
  }: {
    file?: File | null;
    /** Zoom to restore after the document finishes loading. */
    initialZoom?: number;
    isNew?: boolean;
    controller?: DocxEditorViewHandle | null;
    onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
    onFormattingChange?: (formatting: DocxSelectionFormatting | null) => void;
  } = $props();

  // Snapshot on mount: the prop is only a hand-off for this editor instance,
  // so a later owner-side change must not retroactively affect the load.
  const startupZoom = untrack(() => initialZoom);

  let rootEl: HTMLDivElement | null = $state(null);
  let handle: DocxEditorSetupHandle | null = $state(null);

  $effect(() => {
    controller = {
      saveAsPdfFile: async () => {
        if (!handle) throw new Error("Editor belum siap");
        return await handle.saveAsPdfFile();
      },
      saveAsDocxFile: async () => {
        if (!handle) throw new Error("Editor belum siap");
        return await handle.saveAsDocxFile();
      },
      undo: () => handle?.undo(),
      redo: () => handle?.redo(),
      runCommand: (slot, value) => handle?.runCommand(slot, value),
      insertImage: async (imageFile) => {
        if (!handle) throw new Error("Editor belum siap");
        await handle.insertImage(imageFile);
      },
      handle,
    };
    return () => {
      controller = null;
    };
  });

  onMount(async () => {
    if (!rootEl) return;
    handle = setupDocxEditor(rootEl, {
      onDirtyChange: () => {},
      onError: (msg) => {
        if (msg) app.showToast("error", msg);
      },
      showToast: (type, msg) => {
        app.showToast(type, msg);
      },
      onHistoryChange: (state) => onHistoryChange?.(state),
      onFormattingChange: (formatting) => onFormattingChange?.(formatting),
      getTheme: () => app.theme,
      setTheme: (t) => {
        app.theme = t;
      },
      canUseAi: false,
    });

    if (isNew) {
      try {
        handle.newDocument();
        handle.editor?.setZoom(startupZoom);
        onFormattingChange?.(handle.editor?.snapshot().formatting ?? null);
      } catch (err) {
        console.error("Failed to create new docx in editor:", err);
      }
    } else if (file) {
      try {
        await handle.loadFile(file);
        handle.editor?.setZoom(startupZoom);
        onFormattingChange?.(handle.editor?.snapshot().formatting ?? null);
      } catch (err) {
        console.error("Failed to load docx in editor:", err);
      }
    }

  });

  onDestroy(() => {
    handle?.destroy();
    handle = null;
  });
</script>

<div class="docx-editor-page absolute inset-0 w-full h-full flex flex-col bg-base-200 overflow-hidden" bind:this={rootEl}>
  <!-- Topbar placeholders required by setupDocxEditor -->
  <div class="topbar flex-none bg-base-100" style="display:none">
    <div class="header-row">
      <div class="header-center">
        <div class="menu-bar"></div>
      </div>
      <input id="filenameInput" type="text" value={file?.name ?? "document.docx"} />
    </div>
  </div>

  <!-- The docx layout & canvas -->
  <div class="editor-layout flex-1 min-h-0 relative">
    <div class="page-indicator" id="pageStatus" aria-live="polite">Page 1 of 1</div>
    <div class="ruler-corner"></div>
    <div class="horizontal-ruler" id="horizontalRuler">
      <div class="horizontal-ruler-inner" id="horizontalRulerInner"></div>
      <div class="ruler-margin-zone left" id="hLeftMarginZone"></div>
      <div class="ruler-margin-zone right" id="hRightMarginZone"></div>
      <div class="ruler-indent-handle" id="hFirstLineHandle"><div class="triangle down"></div></div>
      <div class="ruler-indent-handle" id="hHangingHandle"><div class="triangle up"></div></div>
      <div class="ruler-indent-handle" id="hLeftHandle"><div class="triangle up"></div></div>
      <div class="ruler-indent-handle" id="hRightHandle"><div class="triangle down"></div></div>
    </div>
    <div class="vertical-ruler" id="verticalRuler">
      <div class="vertical-ruler-inner" id="verticalRulerInner"></div>
      <div class="ruler-margin-zone top" id="vTopMarginZone"></div>
      <div class="ruler-margin-zone bottom" id="vBottomMarginZone"></div>
    </div>

    <div class="document-viewport docx-editor__scroll-container overflow-y-auto overflow-x-auto" id="documentViewport">
      <div class="document-stage" id="documentStage">
        <div class="docx-editor-surface docx-editor docx-paginated-surface" id="editor"></div>
      </div>
      <div class="drag-guide drag-guide--vertical" id="hDragGuide" hidden></div>
      <div class="drag-guide drag-guide--horizontal" id="vDragGuide" hidden></div>
    </div>
  </div>

  <!-- Loading & Error -->
  <div class="loading-overlay" id="loadingOverlay" hidden>
    <div class="loading-overlay__card" role="status" aria-live="polite">
      <div class="loading-overlay__spinner"></div>
      <span class="loading-overlay__label" id="loadingLabel">Membuka dokumen…</span>
    </div>
  </div>
  <div id="error" class="error hidden">
    <pre id="errorText"></pre>
  </div>

  <div
    class="contextmenu"
    id="contextMenu"
    role="menu"
    aria-label="Context menu"
    tabindex="-1"
  >
    <button class="contextmenu__item" data-cmd="cut" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:cut" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Cut</span>
      <span class="contextmenu__item-shortcut">Ctrl+X</span>
    </button>
    <button class="contextmenu__item" data-cmd="copy" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:copy" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Copy</span>
      <span class="contextmenu__item-shortcut">Ctrl+C</span>
    </button>
    <button class="contextmenu__item" data-cmd="paste" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:paste" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Paste</span>
      <span class="contextmenu__item-shortcut">Ctrl+V</span>
    </button>
    <button
      class="contextmenu__item"
      data-cmd="pasteWithoutFormatting"
      role="menuitem"
    >
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:paste" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Paste without formatting</span>
      <span class="contextmenu__item-shortcut">Ctrl+Shift+V</span>
    </button>
    <div class="contextmenu__separator" role="separator"></div>
    <button class="contextmenu__item" data-cmd="deleteText" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:trash" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Delete</span>
      <span class="contextmenu__item-shortcut">Del</span>
    </button>
    <button class="contextmenu__item" data-cmd="selectAll" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:select-multiple" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Select all</span>
      <span class="contextmenu__item-shortcut">Ctrl+A</span>
    </button>
    <div class="contextmenu__separator" role="separator"></div>
    <button class="contextmenu__item" data-slot="text.link" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:link" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Insert link</span>
    </button>
    <button class="contextmenu__item" data-slot="format.clear" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:eraser" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Clear formatting</span>
    </button>
    <button
      class="contextmenu__item"
      data-slot="paragraph.dialog"
      role="menuitem"
    >
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:paragraph" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Paragraph…</span>
    </button>
    <div class="contextmenu__table-section" id="contextMenuTableSection" hidden>
      <div class="contextmenu__separator" role="separator"></div>
      <button
        class="contextmenu__item"
        data-table-cmd="insertRowAbove"
        role="menuitem"
      >
        <span class="contextmenu__item-icon"
          ><iconify-icon icon="bx:grid-horizontal" width="18" height="18"
          ></iconify-icon></span
        >
        <span class="contextmenu__item-label">Insert row above</span>
      </button>
      <button
        class="contextmenu__item"
        data-table-cmd="insertRowBelow"
        role="menuitem"
      >
        <span class="contextmenu__item-icon"
          ><iconify-icon icon="bx:grid-horizontal" width="18" height="18"
          ></iconify-icon></span
        >
        <span class="contextmenu__item-label">Insert row below</span>
      </button>
      <div class="contextmenu__separator" role="separator"></div>
      <button
        class="contextmenu__item"
        data-table-cmd="insertColumnLeft"
        role="menuitem"
      >
        <span class="contextmenu__item-icon"
          ><iconify-icon icon="bx:grid-vertical" width="18" height="18"
          ></iconify-icon></span
        >
        <span class="contextmenu__item-label">Insert column left</span>
      </button>
      <button
        class="contextmenu__item"
        data-table-cmd="insertColumnRight"
        role="menuitem"
      >
        <span class="contextmenu__item-icon"
          ><iconify-icon icon="bx:grid-vertical" width="18" height="18"
          ></iconify-icon></span
        >
        <span class="contextmenu__item-label">Insert column right</span>
      </button>
      <div class="contextmenu__separator" role="separator"></div>
      <button
        class="contextmenu__item contextmenu__item--danger"
        data-table-cmd="deleteRow"
        role="menuitem"
      >
        <span class="contextmenu__item-icon"
          ><iconify-icon icon="bx:trash" width="18" height="18"
          ></iconify-icon></span
        >
        <span class="contextmenu__item-label">Delete row</span>
      </button>
      <button
        class="contextmenu__item contextmenu__item--danger"
        data-table-cmd="deleteColumn"
        role="menuitem"
      >
        <span class="contextmenu__item-icon"
          ><iconify-icon icon="bx:trash" width="18" height="18"
          ></iconify-icon></span
        >
        <span class="contextmenu__item-label">Delete column</span>
      </button>
      <button
        class="contextmenu__item contextmenu__item--danger"
        data-table-cmd="deleteTable"
        role="menuitem"
      >
        <span class="contextmenu__item-icon"
          ><iconify-icon icon="bx:trash" width="18" height="18"
          ></iconify-icon></span
        >
        <span class="contextmenu__item-label">Delete table</span>
      </button>
      <div class="contextmenu__separator" role="separator"></div>
      <div class="contextmenu__table-align">
        <span class="contextmenu__table-align-label"
          >Cell vertical alignment</span
        >
        <div
          class="contextmenu__table-align-buttons"
          role="group"
          aria-label="Cell vertical alignment"
        >
          <button class="contextmenu__align-btn" data-align="top" title="Top"
            >Top</button
          >
          <button
            class="contextmenu__align-btn"
            data-align="center"
            title="Center">Center</button
          >
          <button
            class="contextmenu__align-btn"
            data-align="bottom"
            title="Bottom">Bottom</button
          >
        </div>
      </div>
    </div>
  </div>

  <div class="docx-dialog-overlay" id="paragraphDialogOverlay" hidden>
    <div
      class="docx-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Paragraph"
      id="paragraphDialog"
    >
      <div class="docx-dialog__header">
        <span class="docx-dialog__title">Paragraph</span>
      </div>
      <div class="docx-dialog__body">
        <div class="docx-dialog__columns">
          <div class="docx-dialog__column">
            <div class="docx-dialog__section-label">General</div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdAlignment"
                >Alignment</label
              >
              <select class="docx-dialog__select" id="pdAlignment">
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
                <option value="both">Justified</option>
              </select>
            </div>
            <div class="docx-dialog__section-label">Indentation</div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdIndentLeft"
                >Before text</label
              >
              <input
                type="number"
                class="docx-dialog__input"
                id="pdIndentLeft"
                min="0"
                step="0.1"
                value="0"
              />
              <span class="docx-dialog__unit">mm</span>
            </div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdIndentRight"
                >After text</label
              >
              <input
                type="number"
                class="docx-dialog__input"
                id="pdIndentRight"
                min="0"
                step="0.1"
                value="0"
              />
              <span class="docx-dialog__unit">mm</span>
            </div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdSpecial">Special</label>
              <select class="docx-dialog__select" id="pdSpecial">
                <option value="none">(none)</option>
                <option value="firstLine">First line</option>
                <option value="hanging">Hanging</option>
              </select>
            </div>
            <div class="docx-dialog__row" id="pdSpecialByRow">
              <label class="docx-dialog__label" for="pdSpecialBy">By</label>
              <input
                type="number"
                class="docx-dialog__input"
                id="pdSpecialBy"
                min="0"
                step="0.1"
                value="0"
              />
              <span class="docx-dialog__unit">mm</span>
            </div>
          </div>
          <div class="docx-dialog__column">
            <div class="docx-dialog__section-label">Spacing</div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdSpaceBefore"
                >Before</label
              >
              <input
                type="number"
                class="docx-dialog__input"
                id="pdSpaceBefore"
                min="0"
                step="1"
                value="0"
              />
              <span class="docx-dialog__unit">pt</span>
            </div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdSpaceAfter">After</label>
              <input
                type="number"
                class="docx-dialog__input"
                id="pdSpaceAfter"
                min="0"
                step="1"
                value="0"
              />
              <span class="docx-dialog__unit">pt</span>
            </div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdLineRule"
                >Line spacing</label
              >
              <select class="docx-dialog__select" id="pdLineRule">
                <option value="multiple">Multiple</option>
                <option value="atLeast">At least</option>
                <option value="exact">Exactly</option>
              </select>
            </div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdLineValue">At</label>
              <input
                type="number"
                class="docx-dialog__input"
                id="pdLineValue"
                min="0.01"
                step="0.01"
                value="1.08"
              />
              <span class="docx-dialog__unit" id="pdLineUnit"></span>
            </div>
            <label class="docx-dialog__checkbox-row">
              <input type="checkbox" id="pdContextualSpacing" />Don't add space
              between paragraphs of the same style
            </label>
            <div class="docx-dialog__section-label">Pagination</div>
            <label class="docx-dialog__checkbox-row">
              <input type="checkbox" id="pdKeepNext" />Keep with next
            </label>
            <label class="docx-dialog__checkbox-row">
              <input type="checkbox" id="pdWidowControl" checked />Widow control
            </label>
            <label class="docx-dialog__checkbox-row">
              <input type="checkbox" id="pdKeepLines" />Keep lines together
            </label>
            <label class="docx-dialog__checkbox-row">
              <input type="checkbox" id="pdPageBreakBefore" />Page break before
            </label>
          </div>
        </div>
      </div>
      <div class="docx-dialog__footer">
        <span class="docx-dialog__error" id="pdError" role="alert"></span>
        <button type="button" class="docx-dialog__button" id="pdCancel"
          >Cancel</button
        >
        <button
          type="button"
          class="docx-dialog__button docx-dialog__button--primary"
          id="pdOk">OK</button
        >
      </div>
    </div>
  </div>
</div>
