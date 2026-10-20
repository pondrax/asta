<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { app } from "$lib/app/index.svelte";
  import { registerEditorBridge } from "$lib/app/editor-bridge.svelte";
  import {
    workspace,
    type WorkspaceMenu,
  } from "$lib/app/sign-workspace.svelte";
  import { stashSignFile } from "$lib/utils/sign-handoff";
  import WorkspaceMenuBar from "$lib/components/workspace-menubar.svelte";
  import { setupDocxEditor } from "./editor-logic";
  import "./editor.css";

  let { data } = $props();

  let rootEl = $state<HTMLDivElement | null>(null);
  let dirty = $state(false);
  let errorMessage = $state<string | null>(null);
  let handle: ReturnType<typeof setupDocxEditor> | null = null;

  // AI editing is reserved for signed-in users. The server enforces this too
  // (`/api/editor-ai` rejects anonymous callers), so this is the UI half of
  // the same rule: without it the menu would offer actions that can only
  // ever fail with a 401.
  const canUseAi = $derived(!!data?.user);

  // Bridge the app theme (data-theme on <html>) to the editor CSS which uses body.dark
  $effect(() => {
    document.body.classList.toggle("dark", app.theme === "dark");
    return () => document.body.classList.remove("dark");
  });

  /** Editor menus, rendered inline in the global navbar (like /sign). */
  function buildMenus(): WorkspaceMenu[] {
    const run = (item: { slot?: string; action?: string }) =>
      handle?.runMenu(item);
    return [
      {
        id: "file",
        label: "File",
        items: [
          {
            icon: "bx:folder-open",
            label: "Open Docx…",
            shortcut: "Ctrl+O",
            action: () => run({ action: "open" }),
          },
          {
            icon: "bx:save",
            label: "Save",
            shortcut: "Ctrl+S",
            action: () => run({ action: "save" }),
          },
          "sep",
          {
            icon: "bx:file",
            label: "Export PDF…",
            shortcut: "Ctrl+Shift+S",
            action: () => run({ action: "savePdf" }),
          },
          {
            icon: "bx:text",
            label: "Export Markdown…",
            action: () => run({ action: "exportMarkdown" }),
          },
          "sep",
          {
            icon: "bx:printer",
            label: "Print",
            shortcut: "Ctrl+P",
            action: () => run({ action: "print" }),
          },
          {
            icon: "bx:slider",
            label: "Page Setup…",
            action: () => run({ action: "pageSetup" }),
          },
        ],
      },
      {
        id: "format",
        label: "Format",
        items: [
          {
            icon: "bx:paragraph",
            label: "Paragraph…",
            action: () => run({ slot: "paragraph.dialog" }),
          },
          {
            icon: "bx:brush",
            label: "Format Painter",
            action: () => run({ slot: "format.painter" }),
          },
          {
            icon: "bx:eraser",
            label: "Clear Formatting",
            action: () => run({ slot: "format.clear" }),
          },
        ],
      },
      {
        id: "insert",
        label: "Insert",
        items: [
          {
            icon: "bx:table",
            label: "Table (3×3)",
            action: () => handle?.insertTable(3, 3),
          },
          {
            icon: "bx:image",
            label: "Picture",
            action: () => run({ slot: "image.insert" }),
          },
          "sep",
          {
            icon: "bx:minus",
            label: "Page Break",
            action: () => run({ slot: "insert.pageBreak" }),
          },
          {
            icon: "bx:minus-circle",
            label: "Section Break — Next Page",
            action: () => run({ slot: "insert.sectionBreakNextPage" }),
          },
          {
            icon: "bx:minus-circle",
            label: "Section Break — Continuous",
            action: () => run({ slot: "insert.sectionBreakContinuous" }),
          },
          "sep",
          {
            icon: "bx:note",
            label: "Footnote",
            action: () => run({ slot: "insert.footnote" }),
          },
          {
            icon: "bx:bookmark",
            label: "Endnote",
            action: () => run({ slot: "insert.endnote" }),
          },
          {
            icon: "bx:list-ul",
            label: "Table of Contents",
            action: () => run({ slot: "insert.toc" }),
          },
        ],
      },
      {
        id: "review",
        label: "Review",
        items: [
          {
            icon: "bx:show",
            label: "Show/Hide ¶",
            action: () => run({ slot: "review.paragraphMarks" }),
          },
          {
            icon: "bx:edit",
            label: "Editing Mode",
            action: () => run({ slot: "review.editingMode" }),
          },
        ],
      },
      {
        id: "ai",
        label: "AI",
        items: [
          {
            icon: "bx:edit",
            label: "Edit with AI",
            disabled: !canUseAi,
            action: () => run({ action: "ai.structure" }),
          },
          "sep",
          {
            icon: "bx:bulb",
            label: "Improve Writing",
            disabled: !canUseAi,
            action: () => run({ action: "ai.improve" }),
          },
          {
            icon: "bx:check-circle",
            label: "Fix Grammar",
            disabled: !canUseAi,
            action: () => run({ action: "ai.fix" }),
          },
          {
            icon: "bx:align-justify",
            label: "Shorten",
            disabled: !canUseAi,
            action: () => run({ action: "ai.shorten" }),
          },
          {
            icon: "bx:expand",
            label: "Expand",
            disabled: !canUseAi,
            action: () => run({ action: "ai.expand" }),
          },
          {
            icon: "bx:align-left",
            label: "Simplify",
            disabled: !canUseAi,
            action: () => run({ action: "ai.simplify" }),
          },
          {
            icon: "bx:briefcase",
            label: "Make Formal",
            disabled: !canUseAi,
            action: () => run({ action: "ai.formal" }),
          },
          "sep",
          {
            icon: "bx:list-ul",
            label: "Summarize Document",
            disabled: !canUseAi,
            action: () => run({ action: "ai.summarize" }),
          },
          {
            icon: "bx:edit-alt",
            label: "Continue Writing",
            disabled: !canUseAi,
            action: () => run({ action: "ai.continue" }),
          },
        ],
      },
    ];
  }

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
      canUseAi,
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

    // Expose the editor menus to the global navbar (rendered inline).
    workspace.menus = buildMenus();

    // The editor is ready, so let the global chatbot act on this document.
    // Registered only for signed-in users, matching the AI menu: an anonymous
    // visitor should not be offered document editing even if the server would
    // only reject it anyway.
    if (handle && canUseAi) {
      registerEditorBridge({
        readContext: handle.readContext,
        hasSelection: handle.hasSelection,
        applyText: handle.applyText,
        // Structural requests need the listing, not the flat text, and end in
        // a validated plan rather than prose. Both added for the same reason as
        // `readContext`: the chatbot is the one asking.
        readMap: handle.readMap,
        applyPlan: handle.applyPlan,
      });
    }
  });

  onDestroy(() => {
    handle?.destroy();
    handle = null;
    workspace.menus = [];
    // The chatbot reads this to decide whether it can edit, so a stale
    // handler would keep offering document actions after leaving the page.
    registerEditorBridge(null);
  });
</script>

<div
  class="docx-editor-page h-[calc(100dvh-3rem)] flex flex-col overflow-hidden"
  bind:this={rootEl}
>
  <!-- ============ TOPBAR ============ -->
  <!-- The visible topbar (border/logo/title) is gone; this stays in the DOM
       (hidden) so the editor's hidden menubar — the data-slot/data-action
       targets and the table grid — remains available to the engine. -->
  <div class="topbar flex-none bg-base-100">
    <div class="header-row" style="display:none">
      <div class="header-center">
        <!-- ============ MENU BAR ============ -->
        <!-- The menubar is rendered inline in the global navbar (see
             buildMenus); this copy stays in the DOM (hidden) so the editor's
             data-slot/data-action event delegation and table grid keep working. -->
        <div class="menu-bar" style="display:none">
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
                      <iconify-icon icon="bx:file" width="18" height="18"
                      ></iconify-icon>
                    </span>
                    PDF… <span class="menu-shortcut">Ctrl+Shift+S</span>
                  </button>
                  <button class="menu-item" data-action="exportMarkdown">
                    <span class="menu-item-icon">
                      <iconify-icon icon="bx:text" width="18" height="18"
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

          <!-- ============ AI ============ -->
          <!-- The actions split by what they read: the rewrite group needs a
               selection and replaces it, the generate group reads the whole
               document and inserts new text at the cursor.

               The menu stays visible whether or not anyone is signed in —
               hiding it left visitors no way to learn the feature exists. When
               signed out the trigger is inert and carries the reason, which
               beats a dead button with no explanation or a popup full of
               actions that could only ever fail. The server enforces the same
               rule independently; this is only the affordance.

               Locked with `aria-disabled` rather than the native `disabled`
               attribute on purpose: a disabled button drops out of the tab
               order, so keyboard and screen reader users would never reach it
               and the reason would go unheard — exactly the visitors this is
               meant to inform. `aria-disabled` keeps it focusable and
               announced while inert. The popup is additionally blocked in
               `openMenu`, so the hover path cannot slip it open. -->
          <div class="menu" id="aiMenu">
            <button
              class="menu-button"
              class:menu-button--locked={!canUseAi}
              type="button"
              id="aiMenuButton"
              aria-haspopup="true"
              aria-expanded="false"
              aria-disabled={!canUseAi}
              aria-controls="aiMenuPopup"
              >AI{#if !canUseAi}<span class="menu-locked-note"
                  >(must be logged in)</span
                >{/if}</button
            >
            <div
              class="menu-popup"
              id="aiMenuPopup"
              role="menu"
              aria-labelledby="aiMenuButton"
            >
              <!--
                First, and separated from the rest, because it is not a
                rewrite. Everything below this divider hands the model some text
                and puts text back; this one hands it the document and gets back
                a list of operations it replays against the engine — tables,
                images, lists, alignment, styles. A user looking for "improve
                this paragraph" should not have to read past it, and one looking
                for "add a table" should not have to hunt for it.
              -->
              <button
                class="menu-item"
                type="button"
                data-action="ai.structure"
              >
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:edit" width="18" height="18"
                  ></iconify-icon>
                </span>
                Edit with AI
              </button>
              <div class="menu-separator"></div>
              <button class="menu-item" type="button" data-action="ai.improve">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:bulb" width="18" height="18"
                  ></iconify-icon>
                </span>
                Improve Writing
              </button>
              <button class="menu-item" type="button" data-action="ai.fix">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:check-circle" width="18" height="18"
                  ></iconify-icon>
                </span>
                Fix Grammar
              </button>
              <button class="menu-item" type="button" data-action="ai.shorten">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:align-justify" width="18" height="18"
                  ></iconify-icon>
                </span>
                Shorten
              </button>
              <button class="menu-item" type="button" data-action="ai.expand">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:expand" width="18" height="18"
                  ></iconify-icon>
                </span>
                Expand
              </button>
              <button class="menu-item" type="button" data-action="ai.simplify">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:align-left" width="18" height="18"
                  ></iconify-icon>
                </span>
                Simplify
              </button>
              <button class="menu-item" type="button" data-action="ai.formal">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:briefcase" width="18" height="18"
                  ></iconify-icon>
                </span>
                Make Formal
              </button>
              <div class="menu-separator"></div>
              <button
                class="menu-item"
                type="button"
                data-action="ai.summarize"
              >
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:list-ul" width="18" height="18"
                  ></iconify-icon>
                </span>
                Summarize Document
              </button>
              <button class="menu-item" type="button" data-action="ai.continue">
                <span class="menu-item-icon">
                  <iconify-icon icon="bx:edit-alt" width="18" height="18"
                  ></iconify-icon>
                </span>
                Continue Writing
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

    <!-- Small screens: the shared menubar can't fit in the navbar, show it here. -->
    <div class="lg:hidden px-2 py-1">
      <WorkspaceMenuBar />
    </div>

    <!-- ============ TOOLBAR ============ -->
    <div
      class="toolbar flex flex-nowrap items-center gap-0.5 h-10 min-h-10 mx-1.5 mb-1.5 px-1.5 bg-base-200 rounded-full overflow-visible select-none"
    >
      <!-- HISTORY -->
      <div class="toolbar-group flex items-center gap-px shrink-0 toolbar-group--history">
        <button class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command" data-slot="history.undo" title="Undo"
          ><iconify-icon icon="bx:undo"></iconify-icon></button
        >
        <button class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command" data-slot="history.redo" title="Redo"
          ><iconify-icon icon="bx:redo"></iconify-icon></button
        >
        <button class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px]" id="printButton" title="Print"
          ><iconify-icon icon="bx:printer"></iconify-icon></button
        >
      </div>

      <div class="toolbar-separator w-px h-6 mx-1 bg-base-300 shrink-0 toolbar-sep--style"></div>

      <!-- STYLE -->
      <div class="toolbar-group flex items-center gap-px shrink-0 toolbar-group--style">
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
      <div class="toolbar-group flex items-center gap-px shrink-0 toolbar-group--font">
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

      <div class="toolbar-separator w-px h-6 mx-1 bg-base-300 shrink-0 toolbar-sep--text"></div>

      <!-- TEXT -->
      <div class="toolbar-group flex items-center gap-px shrink-0 toolbar-group--text">
        <button class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command" data-slot="text.bold" title="Bold"
          ><iconify-icon icon="bx:bold"></iconify-icon></button
        >
        <button class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command" data-slot="text.italic" title="Italic"
          ><iconify-icon icon="bx:italic"></iconify-icon></button
        >
        <button
          class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command"
          data-slot="text.underline"
          title="Underline"
          ><iconify-icon icon="bx:underline"></iconify-icon></button
        >
        <button
          class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command"
          data-slot="text.strike"
          title="Strikethrough"
          ><iconify-icon icon="bx:strikethrough"></iconify-icon></button
        >
      </div>

      <div class="toolbar-separator w-px h-6 mx-1 bg-base-300 shrink-0 toolbar-sep--script"></div>

      <!-- SCRIPT (sub/sup) -->
      <div class="toolbar-group flex items-center gap-px shrink-0 toolbar-group--script">
        <button
          class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command"
          data-slot="script.super"
          title="Superscript">x²</button
        >
        <button class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command" data-slot="script.sub" title="Subscript"
          >x₂</button
        >
      </div>

      <div class="toolbar-separator w-px h-6 mx-1 bg-base-300 shrink-0 toolbar-sep--colors"></div>

      <!-- COLORS -->
      <div class="toolbar-group flex items-center gap-px shrink-0 toolbar-group--colors">
        <div class="colorsplit" id="fontColorSplit" data-slot="text.color">
          <button
            class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] colorsplit__main"
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
            class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] colorsplit__main"
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

      <div class="toolbar-separator w-px h-6 mx-1 bg-base-300 shrink-0 toolbar-sep--alignment"></div>

      <!-- ALIGNMENT -->
      <div class="toolbar-group flex items-center gap-px shrink-0 toolbar-group--alignment">
        <div class="alignment" id="alignment">
          <button
            class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] alignment__trigger"
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
              class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] alignment__option"
              data-slot="alignment.left"
              title="Align Left"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-left"></iconify-icon></button
            >
            <button
              type="button"
              class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] alignment__option"
              data-slot="alignment.center"
              title="Center"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-middle"></iconify-icon></button
            >
            <button
              type="button"
              class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] alignment__option"
              data-slot="alignment.right"
              title="Align Right"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-right"></iconify-icon></button
            >
            <button
              type="button"
              class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] alignment__option"
              data-slot="alignment.justify"
              title="Justify"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-justify"></iconify-icon></button
            >
          </div>
        </div>
      </div>

      <div class="toolbar-separator w-px h-6 mx-1 bg-base-300 shrink-0 toolbar-sep--list"></div>

      <!-- LIST -->
      <div class="toolbar-group flex items-center gap-px shrink-0 toolbar-group--list">
        <button class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command" data-slot="list.bullet" title="Bullets"
          ><iconify-icon icon="bx:list-ul"></iconify-icon></button
        >
        <button class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command" data-slot="list.numbered" title="Numbering"
          ><iconify-icon icon="bx:list-ol"></iconify-icon></button
        >
        <button
          class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command"
          data-slot="list.outdent"
          title="Decrease Indent"
          ><iconify-icon icon="bx:left-indent"></iconify-icon></button
        >
        <button
          class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command"
          data-slot="list.indent"
          title="Increase Indent"
          ><iconify-icon icon="bx:right-indent"></iconify-icon></button
        >
        <div class="line-spacing" id="lineSpacing">
          <button
            class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] line-spacing__trigger"
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

      <div class="toolbar-separator w-px h-6 mx-1 bg-base-300 shrink-0 toolbar-sep--format"></div>

      <!-- FORMAT -->
      <div class="toolbar-group flex items-center gap-px shrink-0 toolbar-group--format">
        <button
          class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command"
          data-slot="format.painter"
          title="Format Painter"
          ><iconify-icon icon="bx:brush"></iconify-icon></button
        >
        <button
          class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command"
          data-slot="format.clear"
          title="Clear Formatting"
          ><iconify-icon icon="bx:eraser"></iconify-icon></button
        >
        <button
          class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command"
          data-slot="paragraph.dialog"
          title="Paragraph"
          ><iconify-icon icon="bx:paragraph"></iconify-icon></button
        >
      </div>

      <div class="toolbar-separator w-px h-6 mx-1 bg-base-300 shrink-0 toolbar-sep--insert"></div>

      <!-- INSERT -->
      <div class="toolbar-group flex items-center gap-px shrink-0 toolbar-group--insert">
        <button
          class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command"
          data-slot="table.insert"
          title="Insert Table"
          ><iconify-icon icon="bx:table"></iconify-icon></button
        >
        <button
          class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command"
          data-slot="image.insert"
          title="Insert Image"
          ><iconify-icon icon="bx:image"></iconify-icon></button
        >
        <button
          class="tool h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-[13px] whitespace-nowrap text-base-content enabled:hover:bg-base-300 disabled:opacity-40 disabled:cursor-default [&.active]:bg-primary/10 [&.active]:border-primary/20 [&.active]:text-primary [&_iconify-icon]:text-[17px] command"
          data-slot="insert.pageBreak"
          title="Page Break"
          ><iconify-icon icon="bx:file-blank"></iconify-icon></button
        >
      </div>


      <!-- MORE -->
      <div class="toolbar-more relative flex-none ml-auto" id="toolbarMore">
        <button
          class="toolbar-more__button h-[30px] min-w-[30px] inline-flex items-center justify-center px-1.5 border border-transparent rounded-md bg-transparent text-base-content cursor-pointer hover:bg-base-300"
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

    <!-- Floating document bar: zoom | page | close (large screens). -->
    <div
      class="hidden lg:absolute lg:bottom-4 lg:left-1/2 lg:z-40 lg:-translate-x-1/2 lg:flex lg:items-center lg:gap-0.5 lg:h-8 lg:px-2 lg:bg-base-100 lg:border lg:border-base-300 lg:rounded-full lg:shadow-md"
    >
      <div
        class="flex items-center gap-px shrink-0"
      >
        <span
          class="relative inline-flex items-center flex-none h-[26px] bg-transparent"
          id="zoomStepper"
        >
          <button
            class="w-5 h-6 inline-flex items-center justify-center bg-transparent border-0 rounded text-[13px] leading-none p-0 cursor-pointer text-base-content hover:bg-base-200 disabled:opacity-35 disabled:cursor-default"
            id="zoomOut"
            aria-label="Zoom out"
            title="Zoom out">−</button
          >
          <button
            class="min-w-11 h-6 inline-flex items-center justify-center gap-0.5 px-1 bg-transparent border-0 rounded text-xs tabular-nums cursor-pointer text-base-content hover:bg-base-200"
            id="zoomValue"
            aria-haspopup="listbox"
            aria-expanded="false"
            aria-label="Zoom level: 100%"
            title="Zoom level"
            >100%<span
              class="text-[10px] text-base-content/60"
              aria-hidden="true">▾</span
            ></button
          >
          <button
            class="w-5 h-6 inline-flex items-center justify-center bg-transparent border-0 rounded text-[13px] leading-none p-0 cursor-pointer text-base-content hover:bg-base-200 disabled:opacity-35 disabled:cursor-default"
            id="zoomIn"
            aria-label="Zoom in"
            title="Zoom in">+</button
          >
          <div
            class="absolute top-full left-0 mt-1 min-w-[132px] p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-50"
            id="zoomMenu"
            role="listbox"
            aria-label="Zoom level"
            hidden
          >
            <button
              class="zoom-menu__item w-full flex items-center gap-2 px-2.5 py-[7px] bg-transparent border-0 rounded text-[13px] leading-[18px] text-left whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200 [&[data-selected]]:bg-primary/10 [&[data-selected]]:font-semibold [&[data-selected]]:text-primary"
              role="option"
              aria-selected="false"
              data-zoom-mode="auto"
              >Automatic<span class="zoom-menu__check ml-auto text-xs pl-4"
                >✓</span
              ></button
            >
            <button
              class="zoom-menu__item w-full flex items-center gap-2 px-2.5 py-[7px] bg-transparent border-0 rounded text-[13px] leading-[18px] text-left whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200 [&[data-selected]]:bg-primary/10 [&[data-selected]]:font-semibold [&[data-selected]]:text-primary"
              role="option"
              aria-selected="false"
              data-zoom-mode="fit-width"
              >Fit width<span class="zoom-menu__check ml-auto text-xs pl-4"
                >✓</span
              ></button
            >
            <hr
              class="h-px my-1 border-0 bg-base-300"
              role="presentation"
            />
            <button
              class="zoom-menu__item w-full flex items-center gap-2 px-2.5 py-[7px] bg-transparent border-0 rounded text-[13px] leading-[18px] text-left whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200 [&[data-selected]]:bg-primary/10 [&[data-selected]]:font-semibold [&[data-selected]]:text-primary"
              role="option"
              aria-selected="false"
              data-zoom-level="0.25">25%</button
            >
            <button
              class="zoom-menu__item w-full flex items-center gap-2 px-2.5 py-[7px] bg-transparent border-0 rounded text-[13px] leading-[18px] text-left whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200 [&[data-selected]]:bg-primary/10 [&[data-selected]]:font-semibold [&[data-selected]]:text-primary"
              role="option"
              aria-selected="false"
              data-zoom-level="0.5">50%</button
            >
            <button
              class="zoom-menu__item w-full flex items-center gap-2 px-2.5 py-[7px] bg-transparent border-0 rounded text-[13px] leading-[18px] text-left whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200 [&[data-selected]]:bg-primary/10 [&[data-selected]]:font-semibold [&[data-selected]]:text-primary"
              role="option"
              aria-selected="false"
              data-zoom-level="0.75">75%</button
            >
            <button
              class="zoom-menu__item w-full flex items-center gap-2 px-2.5 py-[7px] bg-transparent border-0 rounded text-[13px] leading-[18px] text-left whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200 [&[data-selected]]:bg-primary/10 [&[data-selected]]:font-semibold [&[data-selected]]:text-primary"
              role="option"
              aria-selected="false"
              data-zoom-level="1">100%</button
            >
            <button
              class="zoom-menu__item w-full flex items-center gap-2 px-2.5 py-[7px] bg-transparent border-0 rounded text-[13px] leading-[18px] text-left whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200 [&[data-selected]]:bg-primary/10 [&[data-selected]]:font-semibold [&[data-selected]]:text-primary"
              role="option"
              aria-selected="false"
              data-zoom-level="1.25">125%</button
            >
            <button
              class="zoom-menu__item w-full flex items-center gap-2 px-2.5 py-[7px] bg-transparent border-0 rounded text-[13px] leading-[18px] text-left whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200 [&[data-selected]]:bg-primary/10 [&[data-selected]]:font-semibold [&[data-selected]]:text-primary"
              role="option"
              aria-selected="false"
              data-zoom-level="1.5">150%</button
            >
            <button
              class="zoom-menu__item w-full flex items-center gap-2 px-2.5 py-[7px] bg-transparent border-0 rounded text-[13px] leading-[18px] text-left whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200 [&[data-selected]]:bg-primary/10 [&[data-selected]]:font-semibold [&[data-selected]]:text-primary"
              role="option"
              aria-selected="false"
              data-zoom-level="2">200%</button
            >
          </div>
        </span>
      </div>

      <span
        class="w-px h-4 flex-none bg-base-300"
        aria-hidden="true"
      ></span>

      <div
        class="relative inline-flex items-center flex-none h-[26px] bg-transparent"
      >
        <button
          type="button"
          id="pagePrev"
          class="w-5 h-6 inline-flex items-center justify-center bg-transparent border-0 rounded text-base-content cursor-pointer hover:bg-base-200 disabled:opacity-35 disabled:cursor-default"
          title="Halaman sebelumnya"
          aria-label="Halaman sebelumnya"
        >
          <iconify-icon icon="bx:chevron-left"></iconify-icon>
        </button>
        <span
          class="min-w-11 h-6 inline-flex items-center justify-center gap-0.5 px-1 bg-transparent border-0 rounded text-xs tabular-nums whitespace-nowrap text-base-content"
        >
          <input
            id="pageInput"
            class="w-5 p-0 bg-transparent border-0 text-inherit text-center tabular-nums focus:outline-none"
            type="text"
            inputmode="numeric"
            aria-label="Nomor halaman"
            value="1"
          />
          <span class="text-[10px] text-base-content/60"
            >/ <span id="pageTotal">1</span></span
          >
        </span>
        <button
          type="button"
          id="pageNext"
          class="w-5 h-6 inline-flex items-center justify-center bg-transparent border-0 rounded text-base-content cursor-pointer hover:bg-base-200 disabled:opacity-35 disabled:cursor-default"
          title="Halaman berikutnya"
          aria-label="Halaman berikutnya"
        >
          <iconify-icon icon="bx:chevron-right"></iconify-icon>
        </button>
      </div>
    </div>

    <!-- Page X of X overlay (top-right of the editor area). -->
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
  <dialog id="pageSetupDialog" class="modal">
    <div class="modal-box">
      <h3 class="text-lg font-bold">Page Setup</h3>
      <div class="flex flex-col gap-3 py-2">
        <div class="grid grid-cols-[150px_1fr] items-center gap-3">
          <label for="paperSize" class="text-sm">Paper Size</label>
          <select id="paperSize" class="select select-sm">
            <option value="a4">A4 (210 × 297 mm)</option>
            <option value="letter">Letter (8.5 × 11 in)</option>
            <option value="legal">Legal (8.5 × 14 in)</option>
          </select>
        </div>
        <div class="grid grid-cols-[150px_1fr] items-center gap-3">
          <label for="orientation" class="text-sm">Orientation</label>
          <select id="orientation" class="select select-sm">
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>
        <div class="grid grid-cols-[150px_1fr] items-center gap-3">
          <label for="marginTop" class="text-sm">Top (mm)</label>
          <input
            id="marginTop"
            class="input input-sm"
            type="number"
            step="0.1"
            min="0"
            value="25.4"
          />
        </div>
        <div class="grid grid-cols-[150px_1fr] items-center gap-3">
          <label for="marginBottom" class="text-sm">Bottom (mm)</label>
          <input
            id="marginBottom"
            class="input input-sm"
            type="number"
            step="0.1"
            min="0"
            value="25.4"
          />
        </div>
        <div class="grid grid-cols-[150px_1fr] items-center gap-3">
          <label for="marginLeft" class="text-sm">Left (mm)</label>
          <input
            id="marginLeft"
            class="input input-sm"
            type="number"
            step="0.1"
            min="0"
            value="31.8"
          />
        </div>
        <div class="grid grid-cols-[150px_1fr] items-center gap-3">
          <label for="marginRight" class="text-sm">Right (mm)</label>
          <input
            id="marginRight"
            class="input input-sm"
            type="number"
            step="0.1"
            min="0"
            value="31.8"
          />
        </div>
        <div class="grid grid-cols-[150px_1fr] items-center gap-3">
          <label for="pageSetupScope" class="text-sm">Apply to</label>
          <select id="pageSetupScope" class="select select-sm">
            <option value="document">Whole document</option>
            <option value="section">This section</option>
          </select>
        </div>
      </div>
      <div class="modal-action">
        <button class="btn btn-sm" id="pageSetupCancel">Cancel</button>
        <button class="btn btn-sm btn-primary" id="pageSetupApply">
          Apply
        </button>
      </div>
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

  <!-- ============ AI DIALOG ============ -->
  <!-- Shown for the generate and structural actions, which need a target and a
       bit of steer. The rewrite actions run straight from the menu, no dialog,
       because the selection already says what to act on. The label and
       placeholder are rewritten per action — "optional" would be a lie for the
       structural one, where the instruction is the entire request. -->
  <div class="docx-dialog-overlay" id="aiOverlay" hidden>
    <div
      class="docx-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aiDialogTitle"
      id="aiDialog"
    >
      <div class="docx-dialog__header">
        <span class="docx-dialog__title" id="aiDialogTitle"
          >Continue Writing</span
        >
      </div>
      <div class="docx-dialog__body">
        <p class="docx-dialog__message" id="aiDialogHint">
          The document is used as context. The result is inserted at the cursor.
        </p>
        <div class="docx-dialog__row">
          <label
            class="docx-dialog__label"
            for="aiInstruction"
            id="aiInstructionLabel">Instruction</label
          >
          <input
            type="text"
            class="docx-dialog__input"
            id="aiInstruction"
            maxlength="400"
            placeholder="Optional — e.g. write in a formal tone"
          />
        </div>
      </div>
      <div class="docx-dialog__footer">
        <span class="docx-dialog__error" id="aiError" role="alert"></span>
        <button type="button" class="docx-dialog__button" id="aiCancel"
          >Cancel</button
        >
        <button
          type="button"
          class="docx-dialog__button docx-dialog__button--primary"
          id="aiRun">Run</button
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
       discarding unsaved changes.

       The tooltip is `tooltip-top` on purpose. These two FABs are pinned to
       the same bottom edge and the sign button is 185px wide, so a
       `tooltip-left` bubble had nowhere to go: it rendered at x=686..875
       directly on top of the sign button at x=687..872. Since both `.fab`
       wrappers are `position: fixed` at the same z-index, the later-in-DOM
       sign FAB painted over the bubble and the label was sliced in half by
       the button edge. `tooltip-top` lifts the bubble into empty space
       above the FAB, so it never collides with anything.

       `z-1000` keeps the bubble above the sign FAB's `z-999` for the same
       reason: a tooltip that paints behind its neighbours is unreadable
       regardless of which side it is on. -->
  <div class="fab right-24 z-1000">
    <button
      id="newDocFab"
      class="btn btn-lg btn-circle btn-primary tooltip tooltip-top shadow-lg"
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
