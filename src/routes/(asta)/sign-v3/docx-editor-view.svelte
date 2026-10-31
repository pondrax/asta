<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { app } from "$lib/app/index.svelte";
  import { setupDocxEditor, type DocxEditorSetupHandle } from "../editor/editor-logic";
  import "../editor/editor.css";

  export type DocxEditorViewHandle = {
    saveAsPdfFile: () => Promise<File>;
    saveAsDocxFile: () => Promise<File>;
  };

  let {
    file,
    controller = $bindable(),
  }: {
    file: File;
    controller?: DocxEditorViewHandle | null;
  } = $props();

  let rootEl: HTMLDivElement | null = $state(null);
  let handle: DocxEditorSetupHandle | null = null;

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
      getTheme: () => app.theme,
      setTheme: (t) => {
        app.theme = t;
      },
      canUseAi: false,
    });

    if (file) {
      try {
        await handle.loadFile(file);
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
</div>
