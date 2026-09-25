<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { app } from "$lib/app/index.svelte";
  import { stashSignFile } from "$lib/utils/sign-handoff";
  import { setupDocxEditor } from "./editor-logic";
  import "./editor.css";

  let rootEl = $state<HTMLDivElement | null>(null);
  let dirty = $state(false);
  let errorMessage = $state<string | null>(null);
  let handle: ReturnType<typeof setupDocxEditor> | null = null;

  // Bridge the app theme (data-theme on <html>) to the editor CSS which uses body.dark
  $effect(() => {
    document.body.classList.toggle("dark", app.theme === "dark");
    return () => document.body.classList.remove("dark");
  });

  onMount(() => {
    if (!rootEl) return;
    handle = setupDocxEditor(rootEl, {
      onDirtyChange: (d) => {
        dirty = d;
      },
      onError: (msg) => {
        errorMessage = msg;
      },
      showToast: (type, msg) => {
        app.showToast(type, msg);
      },
      getTheme: () => app.theme,
      setTheme: (t) => {
        app.theme = t;
      },
      onSignPdf: async (file, tab) => {
        // Park the PDF in IndexedDB first — a new tab can't see this tab's
        // memory, so the key in the URL is what carries the document across.
        const blobId = await stashSignFile(file);
        const url = `/sign?blob=${blobId}`;
        if (tab && !tab.closed) {
          tab.location.href = url;
        } else {
          window.open(url, "_blank", "noopener");
        }
      },
    });
  });

  onDestroy(() => {
    handle?.destroy();
    handle = null;
  });
</script>

<svelte:head>
  <title>Document Editor</title>
</svelte:head>

<div
  class="docx-editor-page h-[calc(100dvh-4rem)] flex flex-col overflow-hidden"
  bind:this={rootEl}
>
  <!-- ============ TOPBAR ============ -->
  <div class="topbar border-t border-t-base-content/5">
    <div class="header-row">
      <a class="header-logo" href="/editor" title="DOCX Editor">
        <iconify-icon icon="bx:file" width="20" height="20"></iconify-icon>
      </a>
      <div class="header-center">
        <span class="filename-wrap" id="filenameWrap">
          <input
            class="filename-input"
            id="filenameInput"
            type="text"
            placeholder="Untitled"
            aria-label="Document name"
            spellcheck="false"
          />
        </span>
        <!-- ============ MENU BAR ============ -->
        <div class="menu-bar">
          <div class="menu h-fit">
            <button
              class="menu-button"
              type="button"
              id="fileMenuButton"
              aria-haspopup="true"
              aria-expanded="false"
              aria-controls="fileMenuPopup">File</button
            >
            <div
              class="menu-popup"
              id="fileMenuPopup"
              role="menu"
              aria-labelledby="fileMenuButton"
            >
              <button class="menu-item" data-action="open">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:folder-open" width="18" height="18"
                  ></iconify-icon>
                </span>
                Open Docx… <span class="menu-shortcut">Ctrl+O</span>
              </button>
              <button class="menu-item" data-action="save">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:save" width="18" height="18"
                  ></iconify-icon>
                </span>
                Save <span class="menu-shortcut">Ctrl+S</span>
              </button>
              <div class="menu-separator"></div>
              <div class="menu-item menu-submenu" id="fileExportSubmenu">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:export" width="18" height="18"
                  ></iconify-icon>
                </span>
                <span>Export</span>
                <span class="menu-submenu__caret">›</span>
                <div
                  class="menu-submenu__panel"
                  role="menu"
                  aria-label="Export"
                >
                  <button class="menu-item" data-action="savePdf">
                    <span class="menu-item-icon">
                      <iconify-icon icon="bx:file-pdf" width="18" height="18"
                      ></iconify-icon>
                    </span>
                    PDF… <span class="menu-shortcut">Ctrl+Shift+S</span>
                  </button>
                  <button class="menu-item" data-action="exportMarkdown">
                    <span class="menu-item-icon">
                      <iconify-icon icon="bx:file-text" width="18" height="18"
                      ></iconify-icon>
                    </span>
                    Markdown…
                  </button>
                </div>
              </div>
              <div class="menu-separator"></div>
              <button class="menu-item" data-action="print">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:printer" width="18" height="18"
                  ></iconify-icon>
                </span>
                Print <span class="menu-shortcut">Ctrl+P</span>
              </button>
              <button class="menu-item" data-action="pageSetup">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:slider" width="18" height="18"
                  ></iconify-icon>
                </span>
                Page Setup…
              </button>
            </div>
          </div>

          <div class="menu">
            <button
              class="menu-button"
              type="button"
              id="formatMenuButton"
              aria-haspopup="true"
              aria-expanded="false"
              aria-controls="formatMenuPopup">Format</button
            >
            <div
              class="menu-popup"
              id="formatMenuPopup"
              role="menu"
              aria-labelledby="formatMenuButton"
            >
              <button class="menu-item" data-slot="paragraph.dialog">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:paragraph" width="18" height="18"
                  ></iconify-icon>
                </span>
                Paragraph…
              </button>
              <button class="menu-item" data-slot="format.painter">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:brush" width="18" height="18"
                  ></iconify-icon>
                </span>
                Format Painter
              </button>
              <button class="menu-item" data-slot="format.clear">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:eraser" width="18" height="18"
                  ></iconify-icon>
                </span>
                Clear Formatting
              </button>
            </div>
          </div>

          <div class="menu">
            <button
              class="menu-button"
              type="button"
              id="insertMenuButton"
              aria-haspopup="true"
              aria-expanded="false"
              aria-controls="insertMenuPopup">Insert</button
            >
            <div
              class="menu-popup"
              id="insertMenuPopup"
              role="menu"
              aria-labelledby="insertMenuButton"
            >
              <div class="menu-item menu-submenu" id="tableSubmenu">
                <span class="menu-item-icon"
                  ><iconify-icon icon="bx:table" width="18" height="18"
                  ></iconify-icon></span
                >
                <span>Table</span>
                <span class="menu-submenu__caret">›</span>
                <div class="menu-submenu__panel">
                  <div
                    class="table-grid"
                    id="tableGrid"
                    role="grid"
                    aria-label="Insert table"
                  ></div>
                  <div class="table-grid__caption" id="tableGridCaption">
                    1 × 1
                  </div>
                </div>
              </div>
              <button class="menu-item" data-slot="image.insert"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:image" width="18" height="18"
                  ></iconify-icon></span
                >Picture</button
              >
              <div class="menu-separator"></div>
              <button class="menu-item" data-slot="insert.pageBreak">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:minus" width="18" height="18"
                  ></iconify-icon>
                </span>
                Page Break
              </button>
              <button class="menu-item" data-slot="insert.sectionBreakNextPage">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:minus-circle" width="18" height="18"
                  ></iconify-icon>
                </span>
                Section Break — Next Page
              </button>
              <button
                class="menu-item"
                data-slot="insert.sectionBreakContinuous"
              >
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:minus-circle" width="18" height="18"
                  ></iconify-icon>
                </span>
                Section Break — Continuous
              </button>
              <div class="menu-separator"></div>
              <button class="menu-item" data-slot="insert.footnote">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:note" width="18" height="18"
                  ></iconify-icon>
                </span>
                Footnote
              </button>
              <button class="menu-item" data-slot="insert.endnote">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:bookmark" width="18" height="18"
                  ></iconify-icon>
                </span>
                Endnote
              </button>
              <button class="menu-item" data-slot="insert.toc">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:list-ul" width="18" height="18"
                  ></iconify-icon>
                </span>
                Table of Contents
              </button>
            </div>
          </div>

          <div class="menu">
            <button
              class="menu-button"
              type="button"
              id="reviewMenuButton"
              aria-haspopup="true"
              aria-expanded="false"
              aria-controls="reviewMenuPopup">Review</button
            >
            <div
              class="menu-popup"
              id="reviewMenuPopup"
              role="menu"
              aria-labelledby="reviewMenuButton"
            >
              <button class="menu-item" data-slot="review.paragraphMarks">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:show" width="18" height="18"
                  ></iconify-icon>
                </span>
                Show/Hide ¶
              </button>
              <button class="menu-item" data-slot="review.editingMode">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:edit" width="18" height="18"
                  ></iconify-icon>
                </span>
                Editing Mode
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ HEADER RIGHT CONTROLS ============ -->
      <!-- New / PDF / Sign used to live here. They now live elsewhere:
           New and PDF stay reachable from the File menu, and Sign is the
           floating action button at the bottom right (see the end of this
           template). Keeping only the sign path on a dedicated button means
           the primary handoff is always one click away. -->
    </div>

    <!-- ============ TOOLBAR ============ -->
    <div class="toolbar">
      <!-- HISTORY -->
      <div class="toolbar-group toolbar-group--history">
        <button class="tool command" data-slot="history.undo" title="Undo"
          ><iconify-icon icon="bx:undo"></iconify-icon></button
        >
        <button class="tool command" data-slot="history.redo" title="Redo"
          ><iconify-icon icon="bx:redo"></iconify-icon></button
        >
        <button class="tool" id="printButton" title="Print"
          ><iconify-icon icon="bx:printer"></iconify-icon></button
        >
      </div>

      <div class="toolbar-separator toolbar-sep--zoom"></div>

      <!-- ZOOM -->
      <div class="toolbar-group toolbar-group--zoom">
        <span class="zoom-stepper" id="zoomStepper">
          <button
            class="zoom-stepper__button"
            id="zoomOut"
            aria-label="Zoom out"
            title="Zoom out">−</button
          >
          <button
            class="zoom-stepper__value"
            id="zoomValue"
            aria-haspopup="listbox"
            aria-expanded="false"
            aria-label="Zoom level: 100%"
            title="Zoom level"
            >100%<span class="zoom-stepper__caret" aria-hidden="true">▾</span
            ></button
          >
          <button
            class="zoom-stepper__button"
            id="zoomIn"
            aria-label="Zoom in"
            title="Zoom in">+</button
          >
          <div
            class="zoom-menu"
            id="zoomMenu"
            role="listbox"
            aria-label="Zoom level"
            hidden
          >
            <button
              class="zoom-menu__item"
              role="option"
              aria-selected="false"
              data-zoom-mode="auto"
              >Automatic<span class="zoom-menu__check">✓</span></button
            >
            <button
              class="zoom-menu__item"
              role="option"
              aria-selected="false"
              data-zoom-mode="fit-width"
              >Fit width<span class="zoom-menu__check">✓</span></button
            >
            <hr class="zoom-menu__separator" role="presentation" />
            <button
              class="zoom-menu__item"
              role="option"
              aria-selected="false"
              data-zoom-level="0.25">25%</button
            >
            <button
              class="zoom-menu__item"
              role="option"
              aria-selected="false"
              data-zoom-level="0.5">50%</button
            >
            <button
              class="zoom-menu__item"
              role="option"
              aria-selected="false"
              data-zoom-level="0.75">75%</button
            >
            <button
              class="zoom-menu__item"
              role="option"
              aria-selected="false"
              data-zoom-level="1">100%</button
            >
            <button
              class="zoom-menu__item"
              role="option"
              aria-selected="false"
              data-zoom-level="1.25">125%</button
            >
            <button
              class="zoom-menu__item"
              role="option"
              aria-selected="false"
              data-zoom-level="1.5">150%</button
            >
            <button
              class="zoom-menu__item"
              role="option"
              aria-selected="false"
              data-zoom-level="2">200%</button
            >
          </div>
        </span>
      </div>

      <div class="toolbar-separator toolbar-sep--style"></div>

      <!-- STYLE -->
      <div class="toolbar-group toolbar-group--style">
        <span class="style-dropdown" id="styleDropdown">
          <button
            class="style-dropdown__trigger"
            id="styleTrigger"
            aria-haspopup="listbox"
            aria-expanded="false"
            title="Styles"
            ><span class="style-dropdown__label" id="styleTriggerLabel"
              >Normal</span
            ><span class="style-dropdown__caret" aria-hidden="true">▾</span
            ></button
          >
          <div
            class="style-dropdown__menu"
            id="styleMenu"
            role="listbox"
            aria-label="Styles"
            hidden
          >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Normal"
              ><span class="style-dropdown__label">Normal</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Title"
              ><span class="style-dropdown__label">Title</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Subtitle"
              ><span class="style-dropdown__label">Subtitle</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading1"
              ><span class="style-dropdown__label">Heading 1</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading2"
              ><span class="style-dropdown__label">Heading 2</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading3"
              ><span class="style-dropdown__label">Heading 3</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading4"
              ><span class="style-dropdown__label">Heading 4</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading5"
              ><span class="style-dropdown__label">Heading 5</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading6"
              ><span class="style-dropdown__label">Heading 6</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Strong"
              ><span class="style-dropdown__label">Strong</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="ListParagraph"
              ><span class="style-dropdown__label">List Paragraph</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="footnote text"
              ><span class="style-dropdown__label">footnote text</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="endnote text"
              ><span class="style-dropdown__label">endnote text</span></button
            >
          </div>
        </span>
      </div>

      <!-- FONT -->
      <div class="toolbar-group toolbar-group--font">
        <span class="font-dropdown" id="fontDropdown">
          <button
            class="font-dropdown__trigger"
            id="fontTrigger"
            aria-haspopup="listbox"
            aria-expanded="false"
            title="Font"
            ><span class="font-dropdown__label" id="fontTriggerLabel"
              >Arial</span
            ><span class="font-dropdown__caret" aria-hidden="true">▾</span
            ></button
          >
          <div
            class="font-dropdown__menu"
            id="fontMenu"
            role="listbox"
            aria-label="Font family"
            hidden
          >
            <input
              type="search"
              class="font-dropdown__search"
              id="fontSearch"
              aria-label="Search fonts"
              placeholder="Search fonts"
              autocomplete="off"
            />
            <div class="font-dropdown__options" id="fontOptions">
              <button
                class="font-dropdown__item"
                role="option"
                aria-selected="false"
                data-font-value="Arial"
                ><span class="font-dropdown__label">Arial</span></button
              >
              <button
                class="font-dropdown__item"
                role="option"
                aria-selected="false"
                data-font-value="Calibri"
                ><span class="font-dropdown__label">Calibri</span></button
              >
              <button
                class="font-dropdown__item"
                role="option"
                aria-selected="false"
                data-font-value="Cambria"
                ><span class="font-dropdown__label">Cambria</span></button
              >
              <button
                class="font-dropdown__item"
                role="option"
                aria-selected="false"
                data-font-value="Courier New"
                ><span class="font-dropdown__label">Courier New</span></button
              >
              <button
                class="font-dropdown__item"
                role="option"
                aria-selected="false"
                data-font-value="Georgia"
                ><span class="font-dropdown__label">Georgia</span></button
              >
              <button
                class="font-dropdown__item"
                role="option"
                aria-selected="false"
                data-font-value="Times New Roman"
                ><span class="font-dropdown__label">Times New Roman</span
                ></button
              >
              <button
                class="font-dropdown__item"
                role="option"
                aria-selected="false"
                data-font-value="Verdana"
                ><span class="font-dropdown__label">Verdana</span></button
              >
              <button
                class="font-dropdown__item"
                role="option"
                aria-selected="false"
                data-font-value="Tahoma"
                ><span class="font-dropdown__label">Tahoma</span></button
              >
            </div>
          </div>
        </span>

        <span class="font-size-stepper" id="fontSizeStepper">
          <button
            class="font-size-stepper__button"
            id="fontSizeMinus"
            aria-label="Decrease font size"
            title="Decrease font size">−</button
          >
          <input
            type="number"
            class="font-size-stepper__input"
            id="fontSizeInput"
            min="1"
            max="1638"
            step="1"
            value="11"
            aria-label="Font size in points"
            title="Font size"
          />
          <button
            class="font-size-stepper__button"
            id="fontSizePlus"
            aria-label="Increase font size"
            title="Increase font size">+</button
          >
        </span>
      </div>

      <div class="toolbar-separator toolbar-sep--text"></div>

      <!-- TEXT -->
      <div class="toolbar-group toolbar-group--text">
        <button class="tool command" data-slot="text.bold" title="Bold"
          ><iconify-icon icon="bx:bold"></iconify-icon></button
        >
        <button class="tool command" data-slot="text.italic" title="Italic"
          ><iconify-icon icon="bx:italic"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="text.underline"
          title="Underline"
          ><iconify-icon icon="bx:underline"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="text.strike"
          title="Strikethrough"
          ><iconify-icon icon="bx:strikethrough"></iconify-icon></button
        >
      </div>

      <div class="toolbar-separator toolbar-sep--script"></div>

      <!-- SCRIPT (sub/sup) -->
      <div class="toolbar-group toolbar-group--script">
        <button
          class="tool command"
          data-slot="script.super"
          title="Superscript">x²</button
        >
        <button class="tool command" data-slot="script.sub" title="Subscript"
          >x₂</button
        >
      </div>

      <div class="toolbar-separator toolbar-sep--colors"></div>

      <!-- COLORS -->
      <div class="toolbar-group toolbar-group--colors">
        <div class="colorsplit" id="fontColorSplit" data-slot="text.color">
          <button
            class="tool colorsplit__main"
            id="fontColorMain"
            title="Font Color"
            aria-label="Font Color"
          >
            <iconify-icon icon="bx:font-color"></iconify-icon>
            <span
              class="colorsplit__bar"
              id="fontColorBar"
              style="background-color:#ff0000"
              aria-hidden="true"
            ></span>
          </button>
          <button
            class="colorsplit__caret"
            id="fontColorCaret"
            aria-haspopup="dialog"
            aria-expanded="false"
            aria-label="Font Color"
            title="Font Color">▾</button
          >
          <div
            class="swatch-popup"
            id="fontColorPopup"
            role="dialog"
            aria-label="Font Color"
            hidden
          >
            <button class="swatch-clear" data-value="auto">
              <span class="swatch-clear-chip" aria-hidden="true"
              ></span>Automatic
            </button>
            <div class="swatch-section">
              <div class="swatch-heading">Theme Colors</div>
              <div
                class="swatch-grid swatch-grid--theme"
                id="fontColorTheme"
                role="group"
              ></div>
            </div>
            <div class="swatch-section">
              <div class="swatch-heading">Standard Colors</div>
              <div
                class="swatch-grid"
                id="fontColorStandard"
                role="group"
              ></div>
            </div>
            <div class="swatch-section">
              <div class="swatch-heading">Custom Color</div>
              <div class="swatch-custom">
                <span class="swatch-hash" aria-hidden="true">#</span>
                <input
                  type="text"
                  class="swatch-hex"
                  id="fontColorHex"
                  maxlength="6"
                  spellcheck="false"
                  aria-label="Custom Color"
                  placeholder="FF0000"
                />
                <button class="swatch-apply" id="fontColorApply" disabled
                  >Apply</button
                >
              </div>
            </div>
          </div>
        </div>
        <div class="colorsplit" id="highlightSplit" data-slot="text.highlight">
          <button
            class="tool colorsplit__main"
            id="highlightMain"
            title="Text Highlight"
            aria-label="Text Highlight"
          >
            <iconify-icon icon="bx:highlight"></iconify-icon>
            <span
              class="colorsplit__bar"
              id="highlightBar"
              style="background-color:#ffff00"
              aria-hidden="true"
            ></span>
          </button>
          <button
            class="colorsplit__caret"
            id="highlightCaret"
            aria-haspopup="dialog"
            aria-expanded="false"
            aria-label="Text Highlight"
            title="Text Highlight">▾</button
          >
          <div
            class="swatch-popup"
            id="highlightPopup"
            role="dialog"
            aria-label="Text Highlight"
            hidden
          >
            <button class="swatch-clear" data-value="none">
              <span
                class="swatch-clear-chip swatch-clear-chip--none"
                aria-hidden="true"
              ></span>No Color
            </button>
            <div class="swatch-section">
              <div class="swatch-heading">Highlight Colors</div>
              <div
                class="swatch-grid swatch-grid--highlight"
                id="highlightGrid"
                role="group"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div class="toolbar-separator toolbar-sep--alignment"></div>

      <!-- ALIGNMENT -->
      <div class="toolbar-group toolbar-group--alignment">
        <div class="alignment" id="alignment">
          <button
            class="tool alignment__trigger"
            id="alignmentTrigger"
            title="Align Left"
            aria-haspopup="true"
            aria-expanded="false"
          >
            <iconify-icon icon="bx:align-left" id="alignmentIcon"
            ></iconify-icon>
            <span class="picker-caret" aria-hidden="true">▾</span>
          </button>
          <div
            class="toolbar-menu alignment__popup"
            id="alignmentPopup"
            role="menu"
            hidden
          >
            <button
              type="button"
              class="tool alignment__option"
              data-slot="alignment.left"
              title="Align Left"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-left"></iconify-icon></button
            >
            <button
              type="button"
              class="tool alignment__option"
              data-slot="alignment.center"
              title="Center"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-middle"></iconify-icon></button
            >
            <button
              type="button"
              class="tool alignment__option"
              data-slot="alignment.right"
              title="Align Right"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-right"></iconify-icon></button
            >
            <button
              type="button"
              class="tool alignment__option"
              data-slot="alignment.justify"
              title="Justify"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-justify"></iconify-icon></button
            >
          </div>
        </div>
      </div>

      <div class="toolbar-separator toolbar-sep--list"></div>

      <!-- LIST -->
      <div class="toolbar-group toolbar-group--list">
        <button class="tool command" data-slot="list.bullet" title="Bullets"
          ><iconify-icon icon="bx:list-ul"></iconify-icon></button
        >
        <button class="tool command" data-slot="list.numbered" title="Numbering"
          ><iconify-icon icon="bx:list-ol"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="list.outdent"
          title="Decrease Indent"
          ><iconify-icon icon="bx:left-indent"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="list.indent"
          title="Increase Indent"
          ><iconify-icon icon="bx:right-indent"></iconify-icon></button
        >
        <div class="line-spacing" id="lineSpacing">
          <button
            class="tool line-spacing__trigger"
            id="lineSpacingTrigger"
            title="Line Spacing"
            aria-haspopup="menu"
            aria-expanded="false"
          >
            <iconify-icon icon="bx:vertical-center"></iconify-icon>
            <span class="picker-caret" aria-hidden="true">▾</span>
          </button>
          <div
            class="toolbar-menu line-spacing__menu"
            id="lineSpacingMenu"
            role="menu"
            hidden
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked="false"
              class="toolbar-menu__item"
              data-lines="1">1.0</button
            >
            <button
              type="button"
              role="menuitemradio"
              aria-checked="false"
              class="toolbar-menu__item"
              data-lines="1.15">1.15</button
            >
            <button
              type="button"
              role="menuitemradio"
              aria-checked="false"
              class="toolbar-menu__item"
              data-lines="1.5">1.5</button
            >
            <button
              type="button"
              role="menuitemradio"
              aria-checked="false"
              class="toolbar-menu__item"
              data-lines="2">2.0</button
            >
            <button
              type="button"
              role="menuitemradio"
              aria-checked="false"
              class="toolbar-menu__item"
              data-lines="2.5">2.5</button
            >
            <button
              type="button"
              role="menuitemradio"
              aria-checked="false"
              class="toolbar-menu__item"
              data-lines="3">3.0</button
            >
            <div class="toolbar-menu__separator" role="separator"></div>
            <button
              type="button"
              role="menuitem"
              class="toolbar-menu__item"
              id="lineSpacingOptions">Line Spacing Options…</button
            >
            <div class="toolbar-menu__separator" role="separator"></div>
            <button
              type="button"
              role="menuitem"
              class="toolbar-menu__item"
              id="spaceBeforeRow">Add Space Before Paragraph</button
            >
            <button
              type="button"
              role="menuitem"
              class="toolbar-menu__item"
              id="spaceAfterRow">Add Space After Paragraph</button
            >
          </div>
        </div>
      </div>

      <div class="toolbar-separator toolbar-sep--format"></div>

      <!-- FORMAT -->
      <div class="toolbar-group toolbar-group--format">
        <button
          class="tool command"
          data-slot="format.painter"
          title="Format Painter"
          ><iconify-icon icon="bx:brush"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="format.clear"
          title="Clear Formatting"
          ><iconify-icon icon="bx:eraser"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="paragraph.dialog"
          title="Paragraph"
          ><iconify-icon icon="bx:paragraph"></iconify-icon></button
        >
      </div>

      <div class="toolbar-separator toolbar-sep--insert"></div>

      <!-- INSERT -->
      <div class="toolbar-group toolbar-group--insert">
        <button
          class="tool command"
          data-slot="table.insert"
          title="Insert Table"
          ><iconify-icon icon="bx:table"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="image.insert"
          title="Insert Image"
          ><iconify-icon icon="bx:image"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="insert.pageBreak"
          title="Page Break"
          ><iconify-icon icon="bx:file-blank"></iconify-icon></button
        >
      </div>

      <!-- MODE -->
      <div class="toolbar-group toolbar-group--mode">
        <button
          class="tool"
          id="commentsButton"
          data-slot="review.comments"
          title="Comments & Changes"
          aria-label="Comments & Changes"
        >
          <svg
            viewBox="0 -960 960 960"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="currentColor"
              d="M240-400h480v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z"
            />
          </svg>
        </button>
        <div class="mode" id="mode">
          <button
            class="mode__trigger"
            id="modeTrigger"
            data-mode="editing"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-label="Editing mode"
          >
            <svg
              viewBox="0 -960 960 960"
              width="14"
              height="14"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill="currentColor"
                d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"
              />
            </svg>
            <span class="mode__value" id="modeValue">Editing</span>
            <span class="picker-caret" aria-hidden="true">▾</span>
          </button>
          <div
            class="mode__menu"
            id="modeMenu"
            role="menu"
            aria-label="Editing mode"
            hidden
          >
            <button
              type="button"
              class="mode__item"
              role="menuitemradio"
              data-mode="editing"
              aria-checked="true"
            >
              <svg
                viewBox="0 -960 960 960"
                width="18"
                height="18"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fill="currentColor"
                  d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"
                />
              </svg>
              <span class="mode__text">
                <span class="mode__label">Editing</span>
                <span class="mode__hint"
                  >Changes are applied directly to the document.</span
                >
              </span>
              <span class="mode__check" aria-hidden="true">✓</span>
            </button>
            <button
              type="button"
              class="mode__item"
              role="menuitemradio"
              data-mode="suggesting"
              aria-checked="false"
            >
              <svg
                viewBox="0 -960 960 960"
                width="18"
                height="18"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fill="currentColor"
                  d="M240-400h122l40-40H240v40Zm0-100h222l40-40H240v40Zm0-100h322l40-40H240v40ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v320h-80v-320H160v525l46-45h274v80H240L80-80Zm520-80v-123l221-220q9-9 20-13t22-4q12 0 23 4.5t20 13.5l37 37q8 9 12.5 20t4.5 22q0 11-4 22.5T943-380L723-160H600Zm300-263-37-37 37 37ZM660-220h38l121-122-19-18-18-19-122 121v38Zm140-141-18-19 37 37-19-18Z"
                />
              </svg>
              <span class="mode__text">
                <span class="mode__label">Suggesting</span>
                <span class="mode__hint"
                  >Changes become proposals for others to review.</span
                >
              </span>
              <span class="mode__check" aria-hidden="true"></span>
            </button>
            <button
              type="button"
              class="mode__item"
              role="menuitemradio"
              data-mode="viewing"
              aria-checked="false"
            >
              <svg
                viewBox="0 -960 960 960"
                width="18"
                height="18"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fill="currentColor"
                  d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Z"
                />
              </svg>
              <span class="mode__text">
                <span class="mode__label">Viewing</span>
                <span class="mode__hint">Read-only — no edits are allowed.</span
                >
              </span>
              <span class="mode__check" aria-hidden="true"></span>
            </button>
          </div>
        </div>
      </div>

      <!-- MORE -->
      <div class="toolbar-more" id="toolbarMore">
        <button
          class="toolbar-more__button"
          id="toolbarMoreButton"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-label="More"
          title="More"
        >
          <iconify-icon icon="bx:dots-horizontal-rounded"></iconify-icon>
        </button>
        <div
          class="toolbar-more__panel"
          id="toolbarMorePanel"
          role="dialog"
          aria-label="More"
          hidden
        >
          <div class="toolbar-more__section toolbar-more__section--zoom">
            <div class="toolbar-more__heading">Zoom</div>
            <div class="toolbar-more__zoom">
              <span class="toolbar-more__zoom-label">Zoom</span>
              <div class="toolbar-more__zoom-controls">
                <button
                  class="toolbar-more__item"
                  id="moreZoomOut"
                  title="Zoom out"
                  aria-label="Zoom out">−</button
                >
                <div
                  class="toolbar-more__submenu toolbar-more__zoom-submenu"
                  id="moreZoomSubmenu"
                >
                  <button
                    class="toolbar-more__item"
                    id="moreZoomValue"
                    title="Zoom level"
                    aria-haspopup="menu"
                    aria-expanded="false"
                    aria-label="Zoom level: 100%"
                  >
                    <span id="moreZoomValueText">100%</span>
                    <span class="toolbar-more__caret" aria-hidden="true">▾</span
                    >
                  </button>
                  <div
                    class="toolbar-more__submenu-panel"
                    id="moreZoomPanel"
                    role="menu"
                    aria-label="Zoom level"
                  >
                    <button
                      class="toolbar-more__submenu-item"
                      role="menuitemradio"
                      data-zoom-mode="auto"
                      aria-checked="false"
                      >Automatic<span class="toolbar-more__zoom-check">✓</span
                      ></button
                    >
                    <button
                      class="toolbar-more__submenu-item"
                      role="menuitemradio"
                      data-zoom-mode="fit-width"
                      aria-checked="false"
                      >Fit width<span class="toolbar-more__zoom-check">✓</span
                      ></button
                    >
                    <hr class="zoom-menu__separator" role="presentation" />
                    {#each [{ level: "0.25", label: "25%" }, { level: "0.5", label: "50%" }, { level: "0.75", label: "75%" }, { level: "1", label: "100%" }, { level: "1.25", label: "125%" }, { level: "1.5", label: "150%" }, { level: "2", label: "200%" }] as option (option.level)}
                      <button
                        class="toolbar-more__submenu-item"
                        role="menuitemradio"
                        data-zoom-level={option.level}
                        aria-checked="false"
                        >{option.label}<span class="toolbar-more__zoom-check"
                          >✓</span
                        ></button
                      >
                    {/each}
                  </div>
                </div>
                <button
                  class="toolbar-more__item"
                  id="moreZoomIn"
                  title="Zoom in"
                  aria-label="Zoom in">+</button
                >
              </div>
            </div>
          </div>

          <div class="toolbar-more__section toolbar-more__section--style">
            <div class="toolbar-more__heading">Styles</div>
            <div class="toolbar-more__submenu" id="moreStyleSubmenu">
              <button
                class="toolbar-more__item toolbar-more__item--submenu"
                id="moreStyleTrigger"
                title="Select paragraph style"
                aria-haspopup="menu"
                aria-expanded="false"
              >
                <span id="moreStyleTriggerLabel">Normal</span>
                <span class="toolbar-more__caret" aria-hidden="true">›</span>
              </button>
              <div
                class="toolbar-more__submenu-panel"
                id="moreStylePanel"
                role="menu"
                aria-label="Select paragraph style"
              >
                <input
                  type="search"
                  class="toolbar-more__search"
                  id="moreStyleSearch"
                  aria-label="Search styles"
                  placeholder="Search styles"
                  autocomplete="off"
                />
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Normal">Normal</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Title">Title</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Subtitle">Subtitle</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading1">Heading 1</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading2">Heading 2</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading3">Heading 3</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading4">Heading 4</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading5">Heading 5</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading6">Heading 6</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Strong">Strong</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="ListParagraph">List Paragraph</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="footnote text">footnote text</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="endnote text">endnote text</button
                >
              </div>
            </div>
          </div>

          <div class="toolbar-more__section toolbar-more__section--font">
            <div class="toolbar-more__heading">Font</div>
            <div class="toolbar-more__submenu" id="moreFontSubmenu">
              <button
                class="toolbar-more__item toolbar-more__item--submenu"
                id="moreFontTrigger"
                title="Select font family"
                aria-haspopup="menu"
                aria-expanded="false"
              >
                <span id="moreFontTriggerLabel">Arial</span>
                <span class="toolbar-more__caret" aria-hidden="true">›</span>
              </button>
              <div
                class="toolbar-more__submenu-panel"
                id="moreFontPanel"
                role="menu"
                aria-label="Select font family"
              >
                <input
                  type="search"
                  class="toolbar-more__search"
                  id="moreFontSearch"
                  aria-label="Search fonts"
                  placeholder="Search fonts"
                  autocomplete="off"
                />
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-font-value="Arial">Arial</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-font-value="Calibri">Calibri</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-font-value="Cambria">Cambria</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-font-value="Courier New">Courier New</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-font-value="Georgia">Georgia</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-font-value="Times New Roman">Times New Roman</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-font-value="Verdana">Verdana</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-font-value="Tahoma">Tahoma</button
                >
              </div>
            </div>
            <div class="toolbar-more__font-size">
              <span class="toolbar-more__font-size-label">Font size</span>
              <div class="toolbar-more__font-size-controls">
                <button
                  class="toolbar-more__item"
                  id="moreFontSizeMinus"
                  title="Decrease font size"
                  aria-label="Decrease font size">−</button
                >
                <button
                  class="toolbar-more__item"
                  id="moreFontSizeValue"
                  title="Font size"
                  aria-label="Font size: 11">11</button
                >
                <button
                  class="toolbar-more__item"
                  id="moreFontSizePlus"
                  title="Increase font size"
                  aria-label="Increase font size">+</button
                >
              </div>
            </div>
          </div>

          <div class="toolbar-more__section toolbar-more__section--script">
            <div class="toolbar-more__heading">Script</div>
            <button
              class="toolbar-more__item command"
              data-slot="script.super"
              title="Superscript">x² Superscript</button
            >
            <button
              class="toolbar-more__item command"
              data-slot="script.sub"
              title="Subscript">x₂ Subscript</button
            >
          </div>
          <div class="toolbar-more__section toolbar-more__section--list">
            <div class="toolbar-more__heading">List</div>
            <button
              class="toolbar-more__item command"
              data-slot="list.bullet"
              title="Bullet List"
              ><iconify-icon icon="bx:list-ul"></iconify-icon>Bullet List</button
            >
            <button
              class="toolbar-more__item command"
              data-slot="list.numbered"
              title="Numbered List"
              ><iconify-icon icon="bx:list-ol"></iconify-icon>Numbered List</button
            >
            <button
              class="toolbar-more__item command"
              data-slot="list.outdent"
              title="Decrease Indent"
              ><iconify-icon icon="bx:left-indent"></iconify-icon>Decrease
              Indent</button
            >
            <button
              class="toolbar-more__item command"
              data-slot="list.indent"
              title="Increase Indent"
              ><iconify-icon icon="bx:right-indent"></iconify-icon>Increase
              Indent</button
            >
          </div>
          <div class="toolbar-more__section toolbar-more__section--format">
            <div class="toolbar-more__heading">Format</div>
            <button
              class="toolbar-more__item command"
              data-slot="format.painter"
              title="Format Painter"
              ><iconify-icon icon="bx:brush"></iconify-icon>Format Painter</button
            >
            <button
              class="toolbar-more__item command"
              data-slot="format.clear"
              title="Clear Formatting"
              ><iconify-icon icon="bx:eraser"></iconify-icon>Clear Formatting</button
            >
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ============ TABLE INSERT POPUP ============ -->
  <div
    class="toolbar-menu table-insert__popup"
    id="tableInsertPopup"
    role="dialog"
    aria-label="Insert table"
    hidden
  >
    <div
      class="table-grid"
      id="toolbarTableGrid"
      role="grid"
      aria-label="Insert table"
    ></div>
    <div class="table-grid__caption" id="toolbarTableGridCaption">1 × 1</div>
  </div>

  <input
    id="fileInput"
    type="file"
    hidden
    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  />
  <input
    id="imageInput"
    type="file"
    hidden
    accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
  />

  <!-- ============ EDITOR ============ -->
  <div class="editor-layout">
    <div class="ruler-corner"></div>
    <div class="horizontal-ruler" id="horizontalRuler">
      <div class="horizontal-ruler-inner" id="horizontalRulerInner"></div>
      <div
        class="ruler-margin-zone left"
        id="hLeftMarginZone"
        title="Left margin"
      ></div>
      <div
        class="ruler-margin-zone right"
        id="hRightMarginZone"
        title="Right margin"
      ></div>
      <div
        class="ruler-indent-handle"
        id="hFirstLineHandle"
        role="slider"
        aria-label="First line indent"
        aria-orientation="horizontal"
        aria-valuenow="0"
        aria-valuemin="0"
        aria-valuemax="100"
        tabindex="-1"
        aria-disabled="true"
      >
        <div class="triangle down"></div>
      </div>
      <div
        class="ruler-indent-handle"
        id="hHangingHandle"
        role="slider"
        aria-label="Hanging indent"
        aria-orientation="horizontal"
        aria-valuenow="0"
        aria-valuemin="0"
        aria-valuemax="100"
        tabindex="-1"
        aria-disabled="true"
      >
        <div class="triangle up"></div>
      </div>
      <div
        class="ruler-indent-handle"
        id="hLeftHandle"
        role="slider"
        aria-label="Left indent"
        aria-orientation="horizontal"
        aria-valuenow="0"
        aria-valuemin="0"
        aria-valuemax="100"
        tabindex="-1"
        aria-disabled="true"
      >
        <div class="box"></div>
      </div>
      <div
        class="ruler-indent-handle"
        id="hRightHandle"
        role="slider"
        aria-label="Right indent"
        aria-orientation="horizontal"
        aria-valuenow="0"
        aria-valuemin="0"
        aria-valuemax="100"
        tabindex="-1"
        aria-disabled="true"
      >
        <div class="triangle up"></div>
      </div>
      <div class="ruler-drag-tooltip" id="hDragTooltip" hidden></div>
    </div>
    <div class="vertical-ruler" id="verticalRuler">
      <div class="vertical-ruler-inner" id="verticalRulerInner"></div>
      <div
        class="ruler-margin-zone vertical top"
        id="vTopMarginZone"
        title="Top margin"
      ></div>
      <div
        class="ruler-margin-zone vertical bottom"
        id="vBottomMarginZone"
        title="Bottom margin"
      ></div>
      <div class="ruler-drag-tooltip" id="vDragTooltip" hidden></div>
    </div>
    <div
      class="document-viewport docx-editor__scroll-container"
      id="documentViewport"
    >
      <div class="document-stage" id="documentStage">
        <!-- Core owns this subtree. Do not insert page elements here. -->
        <div id="editor" class="docx-editor docx-paginated-surface"></div>
      </div>
      <!-- Vertical dashed guide shown while dragging ruler indents/margins -->
      <div class="drag-guide drag-guide--vertical" id="hDragGuide" hidden></div>
      <div
        class="drag-guide drag-guide--horizontal"
        id="vDragGuide"
        hidden
      ></div>
    </div>

    <!-- Floating page indicator -->
    <div class="page-indicator" id="pageStatus" aria-live="polite">
      Page 1 of 1
    </div>

    <!-- ============ NAVIGATION PANE ============ -->
    <div class="nav" id="nav" data-open="false">
      <button
        class="nav__toggle"
        id="navToggle"
        aria-label="Open navigation"
        aria-expanded="false"
        title="Open navigation"
      >
        <iconify-icon icon="bx:menu" width="20" height="20"></iconify-icon>
      </button>
      <aside
        class="nav__panel-shell"
        id="navPanel"
        aria-label="Navigation"
        inert
      >
        <div class="nav__header">
          <button
            class="nav__close"
            id="navClose"
            aria-label="Close navigation"
            title="Close navigation"
          >
            <iconify-icon icon="bx:arrow-back" width="20" height="20"
            ></iconify-icon>
          </button>
          <h2 class="nav__title">Navigation</h2>
        </div>
        <div class="nav__tabs" role="tablist" aria-label="Navigation">
          <button
            class="nav__tab nav__tab--selected"
            role="tab"
            id="navTabHeadings"
            aria-selected="true"
            aria-controls="navPanelHeadings">Headings</button
          >
          <button
            class="nav__tab"
            role="tab"
            id="navTabFind"
            aria-selected="false"
            aria-controls="navPanelFind"
            tabindex="-1">Find</button
          >
        </div>
        <div
          class="nav__panel"
          role="tabpanel"
          id="navPanelHeadings"
          aria-labelledby="navTabHeadings"
        >
          <div class="nav__searchbox">
            <iconify-icon
              icon="bx:search"
              width="18"
              height="18"
              class="nav__search-icon"
            ></iconify-icon>
            <input
              type="search"
              class="nav__search-input"
              id="navHeadingFilter"
              placeholder="Filter headings"
              aria-label="Filter headings"
            />
            <button
              class="nav__search-clear"
              id="navHeadingClear"
              aria-label="Clear filter"
              hidden
            >
              <iconify-icon icon="bx:x" width="16" height="16"></iconify-icon>
            </button>
          </div>
          <ul class="nav__list" id="navHeadingList"></ul>
        </div>
        <div
          class="nav__panel"
          role="tabpanel"
          id="navPanelFind"
          aria-labelledby="navTabFind"
          hidden
        >
          <div class="nav__searchbox">
            <iconify-icon
              icon="bx:search"
              width="18"
              height="18"
              class="nav__search-icon"
            ></iconify-icon>
            <input
              type="search"
              class="nav__search-input"
              id="navFindInput"
              placeholder="Find in document"
              aria-label="Find in document"
            />
            <button
              class="nav__search-clear"
              id="navFindClear"
              aria-label="Clear search"
              hidden
            >
              <iconify-icon icon="bx:x" width="16" height="16"></iconify-icon>
            </button>
          </div>
          <div class="nav__options" role="group" aria-label="Find options">
            <label class="nav__option">
              <input type="checkbox" id="navMatchCase" /> Match case
            </label>
            <label class="nav__option">
              <input type="checkbox" id="navWholeWord" /> Whole word
            </label>
          </div>
          <div class="nav__resultbar">
            <span class="nav__count" id="navCount" aria-live="polite"></span>
            <span class="nav__steppers">
              <button
                class="nav__stepper"
                id="navPrev"
                aria-label="Previous match"
                disabled
              >
                <iconify-icon icon="bx:chevron-up" width="18" height="18"
                ></iconify-icon>
              </button>
              <button
                class="nav__stepper"
                id="navNext"
                aria-label="Next match"
                disabled
              >
                <iconify-icon icon="bx:chevron-down" width="18" height="18"
                ></iconify-icon>
              </button>
            </span>
          </div>
          <ul class="nav__list" id="navFindList"></ul>
        </div>
      </aside>
    </div>
  </div>

  <!-- ============ PAGE SETUP DIALOG ============ -->
  <dialog id="pageSetupDialog">
    <div class="dialog-title">Page Setup</div>
    <div class="dialog-body">
      <div class="dialog-row">
        <label for="paperSize">Paper Size</label>
        <select id="paperSize" class="dialog-input">
          <option value="a4">A4 (210 × 297 mm)</option>
          <option value="letter">Letter (8.5 × 11 in)</option>
          <option value="legal">Legal (8.5 × 14 in)</option>
        </select>
      </div>
      <div class="dialog-row">
        <label for="orientation">Orientation</label>
        <select id="orientation" class="dialog-input">
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </div>
      <div class="dialog-row">
        <label for="marginTop">Top (mm)</label>
        <input
          id="marginTop"
          class="dialog-input"
          type="number"
          step="0.1"
          min="0"
          value="25.4"
        />
      </div>
      <div class="dialog-row">
        <label for="marginBottom">Bottom (mm)</label>
        <input
          id="marginBottom"
          class="dialog-input"
          type="number"
          step="0.1"
          min="0"
          value="25.4"
        />
      </div>
      <div class="dialog-row">
        <label for="marginLeft">Left (mm)</label>
        <input
          id="marginLeft"
          class="dialog-input"
          type="number"
          step="0.1"
          min="0"
          value="31.8"
        />
      </div>
      <div class="dialog-row">
        <label for="marginRight">Right (mm)</label>
        <input
          id="marginRight"
          class="dialog-input"
          type="number"
          step="0.1"
          min="0"
          value="31.8"
        />
      </div>
      <div class="dialog-row">
        <label for="pageSetupScope">Apply to</label>
        <select id="pageSetupScope" class="dialog-input">
          <option value="document">Whole document</option>
          <option value="section">This section</option>
        </select>
      </div>
    </div>
    <div class="dialog-footer">
      <button class="dialog-button" id="pageSetupCancel">Cancel</button>
      <button class="dialog-button primary" id="pageSetupApply">Apply</button>
    </div>
  </dialog>

  <!-- ============ CONTEXT MENU ============ -->
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

  <!-- ============ PARAGRAPH DIALOG ============ -->
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

  <!-- ============ DISCARD CONFIRM DIALOG ============ -->
  <div class="docx-dialog-overlay" id="discardOverlay" hidden>
    <div
      class="docx-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Discard changes"
      id="discardDialog"
    >
      <div class="docx-dialog__header">
        <span class="docx-dialog__title">Discard unsaved changes?</span>
      </div>
      <div class="docx-dialog__body">
        <p class="docx-dialog__message">
          Your current document has unsaved changes. Opening or creating a new
          document will discard them.
        </p>
      </div>
      <div class="docx-dialog__footer">
        <button type="button" class="docx-dialog__button" id="discardCancel"
          >Cancel</button
        >
        <button
          type="button"
          class="docx-dialog__button docx-dialog__button--primary"
          id="discardConfirm">Discard</button
        >
      </div>
    </div>
  </div>

  <!-- ============ LOADING OVERLAY ============ -->
  <div class="loading-overlay" id="loadingOverlay" hidden>
    <div class="loading-overlay__card" role="status" aria-live="polite">
      <div class="loading-overlay__spinner"></div>
      <span class="loading-overlay__label" id="loadingLabel"
        >Opening document…</span
      >
    </div>
  </div>

  <!-- ============ ERROR ============ -->
  <div id="error" class="error hidden">
    <h3>Error</h3>
    <pre id="errorText"></pre>
  </div>

  <!-- ============ NEW DOCUMENT FAB ============ -->
  <!-- Takes over the "New" action from the removed header button. Mirrors the
       sign page's Unggah FAB (`fab right-24` + `btn-circle btn-primary`): a
       compact icon-only affordance that sits just above the wider
       `right-38` Tanda Tangan FAB, so the two never overlap. Clicking goes
       through the handle's `newDocument`, which still prompts before
       discarding unsaved changes. -->
  <div class="fab right-24">
    <button
      id="newDocFab"
      class="btn btn-lg btn-circle btn-primary tooltip tooltip-left shadow-lg"
      aria-label="Buat Dokumen Baru"
      data-tip="Buat Dokumen Baru"
      title="Buat dokumen baru"
      onclick={() => handle?.newDocument()}
    >
      <iconify-icon icon="bx:plus" class="text-2xl"></iconify-icon>
    </button>
  </div>

  <!-- ============ SIGN FAB ============ -->
  <!-- Takes over the "Sign" action from the removed header button. Reuses the
       sign page's own FAB classes (`fab right-38` + `btn-secondary
       rounded-full`) so the affordance is identical across both steps of the
       flow. `right-38` is deliberate: the chatbot occupies the bottom-right
       corner at `right-2`, and this is the same offset the sign page uses to
       keep its Tanda Tangan FAB clear of it. -->
  <div class="fab right-38">
    <button
      id="signFab"
      class="btn btn-lg btn-secondary rounded-full font-normal shadow-lg"
      aria-label="Tanda Tangan"
      data-tip="Tanda Tangan"
      title="Tanda Tangan dokumen ini"
      onclick={() => void handle?.openSignPage()}
    >
      <iconify-icon icon="bx:pen" class="text-xl"></iconify-icon>
      Tanda Tangan
    </button>
  </div>
</div>
