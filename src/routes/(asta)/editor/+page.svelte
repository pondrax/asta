<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { app } from "$lib/app/index.svelte";
  import { setupDocxEditor } from "./editor-logic";
  import "@docx-editor.dev/core/styles/editor.css";
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
    });
  });

  onDestroy(() => {
    handle?.destroy();
    handle = null;
  });
</script>

<svelte:head>
  <title>Editor Dokumen</title>
</svelte:head>

<div
  class="docx-editor-page h-[calc(100dvh-4rem)] flex flex-col overflow-hidden"
  bind:this={rootEl}
>
  <!-- ============ TOPBAR ============ -->
  <div class="topbar">
    <div class="header-row">
      <a class="header-logo" href="/editor" title="Editor Dokumen">
        <iconify-icon icon="bx:file" width="20" height="20"></iconify-icon>
      </a>
      <div class="header-center">
        <span class="filename-wrap" id="filenameWrap">
          <input
            class="filename-input"
            id="filenameInput"
            type="text"
            placeholder="Tanpa Judul"
            aria-label="Nama dokumen"
            spellcheck="false"
          />
        </span>
        <!-- ============ MENU BAR ============ -->
        <div class="menu-bar">
          <div class="menu">
            <button class="menu-button">Berkas</button>
            <div class="menu-popup">
              <button class="menu-item" data-action="new"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:file-blank" width="18" height="18"
                  ></iconify-icon></span
                >Dokumen baru <span class="menu-shortcut">Ctrl+N</span></button
              >
              <button class="menu-item" data-action="open"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:folder-open" width="18" height="18"
                  ></iconify-icon></span
                >Buka…<span class="menu-shortcut">Ctrl+O</span></button
              >
              <button class="menu-item" data-action="save"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:save" width="18" height="18"
                  ></iconify-icon></span
                >Simpan<span class="menu-shortcut">Ctrl+S</span></button
              >
              <button class="menu-item" data-action="savePdf"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:export" width="18" height="18"
                  ></iconify-icon></span
                >Simpan sebagai PDF…<span class="menu-shortcut"
                  >Ctrl+Shift+S</span
                ></button
              >
              <div class="menu-separator"></div>
              <button class="menu-item" data-action="pageSetup"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:slider" width="18" height="18"
                  ></iconify-icon></span
                >Pengaturan Halaman…</button
              >
            </div>
          </div>

          <div class="menu">
            <button class="menu-button">Format</button>
            <div class="menu-popup">
              <button class="menu-item" data-slot="paragraph.dialog"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:paragraph" width="18" height="18"
                  ></iconify-icon></span
                >Paragraf…</button
              >
              <button class="menu-item" data-slot="format.painter"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:brush" width="18" height="18"
                  ></iconify-icon></span
                >Salin Format</button
              >
              <button class="menu-item" data-slot="format.clear"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:eraser" width="18" height="18"
                  ></iconify-icon></span
                >Hapus Format</button
              >
            </div>
          </div>

          <div class="menu">
            <button class="menu-button">Sisipkan</button>
            <div class="menu-popup">
              <div class="menu-item menu-submenu" id="tableSubmenu">
                <span class="menu-item-icon"
                  ><iconify-icon icon="bx:table" width="18" height="18"
                  ></iconify-icon></span
                >
                <span>Tabel</span>
                <span class="menu-submenu__caret">›</span>
                <div class="menu-submenu__panel">
                  <div
                    class="table-grid"
                    id="tableGrid"
                    role="grid"
                    aria-label="Sisipkan tabel"
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
                >Gambar</button
              >
              <div class="menu-separator"></div>
              <button class="menu-item" data-slot="insert.pageBreak"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:minus" width="18" height="18"
                  ></iconify-icon></span
                >Pindah Halaman</button
              >
              <button class="menu-item" data-slot="insert.sectionBreakNextPage"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:minus-circle" width="18" height="18"
                  ></iconify-icon></span
                >Pindah Bagian — Halaman Berikutnya</button
              >
              <button
                class="menu-item"
                data-slot="insert.sectionBreakContinuous"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:minus-circle" width="18" height="18"
                  ></iconify-icon></span
                >Pindah Bagian — Lanjutan</button
              >
              <div class="menu-separator"></div>
              <button class="menu-item" data-slot="insert.footnote"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:note" width="18" height="18"
                  ></iconify-icon></span
                >Catatan Kaki</button
              >
              <button class="menu-item" data-slot="insert.endnote"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:bookmark" width="18" height="18"
                  ></iconify-icon></span
                >Catatan Akhir</button
              >
              <button class="menu-item" data-slot="insert.toc"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:list-ul" width="18" height="18"
                  ></iconify-icon></span
                >Daftar Isi</button
              >
            </div>
          </div>

          <div class="menu">
            <button class="menu-button">Tinjau</button>
            <div class="menu-popup">
              <button class="menu-item" data-slot="review.paragraphMarks"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:show" width="18" height="18"
                  ></iconify-icon></span
                >Tampilkan/Sembunyikan ¶</button
              >
              <button class="menu-item" data-slot="review.editingMode"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:edit" width="18" height="18"
                  ></iconify-icon></span
                >Mode Penyuntingan</button
              >
            </div>
          </div>

          <div class="menu">
            <button class="menu-button">Bantuan</button>
            <div class="menu-popup">
              <button class="menu-item" id="aboutButton"
                ><span class="menu-item-icon"
                  ><iconify-icon icon="bx:info-circle" width="18" height="18"
                  ></iconify-icon></span
                >Tentang Editor Dokumen</button
              >
            </div>
          </div>
        </div>
      </div>

      <!-- ============ HEADER RIGHT CONTROLS ============ -->
      <div class="header-right">
        {#if dirty}
          <span class="dirty-badge" title="Belum disimpan">Belum disimpan</span>
        {/if}
        <button
          class="header-btn"
          id="newButton"
          title="Mulai dokumen kosong baru"
        >
          <iconify-icon icon="bx:file-blank" width="14" height="14"
          ></iconify-icon>Baru
        </button>
        <button class="header-btn" id="pdfButton" title="Simpan sebagai PDF">
          <iconify-icon icon="bx:file" width="14" height="14"></iconify-icon>PDF
        </button>
        <button
          class="header-btn header-btn--icon"
          id="themeToggle"
          role="switch"
          aria-checked={app.theme === "dark"}
          title="Ganti mode gelap"
          aria-label="Ganti mode gelap"
        >
          <iconify-icon class="icon-sun" icon="bx:sun" width="15" height="15"
          ></iconify-icon>
          <iconify-icon class="icon-moon" icon="bx:moon" width="15" height="15"
          ></iconify-icon>
        </button>
      </div>
    </div>

    <!-- ============ TOOLBAR ============ -->
    <div class="toolbar">
      <!-- HISTORY -->
      <div class="toolbar-group toolbar-group--history">
        <button class="tool command" data-slot="history.undo" title="Urungkan"
          ><iconify-icon icon="bx:undo"></iconify-icon></button
        >
        <button class="tool command" data-slot="history.redo" title="Ulangi"
          ><iconify-icon icon="bx:redo"></iconify-icon></button
        >
        <button class="tool" id="printButton" title="Cetak"
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
            aria-label="Perkecil"
            title="Perkecil">−</button
          >
          <button
            class="zoom-stepper__value"
            id="zoomValue"
            aria-haspopup="listbox"
            aria-expanded="false"
            aria-label="Tingkat zoom: 100%"
            title="Tingkat zoom"
            >100%<span class="zoom-stepper__caret" aria-hidden="true">▾</span
            ></button
          >
          <button
            class="zoom-stepper__button"
            id="zoomIn"
            aria-label="Perbesar"
            title="Perbesar">+</button
          >
          <div
            class="zoom-menu"
            id="zoomMenu"
            role="listbox"
            aria-label="Tingkat zoom"
            hidden
          >
            <button
              class="zoom-menu__item"
              role="option"
              aria-selected="false"
              data-zoom-mode="auto"
              >Otomatis<span class="zoom-menu__check">✓</span></button
            >
            <button
              class="zoom-menu__item"
              role="option"
              aria-selected="false"
              data-zoom-mode="fit-width"
              >Lebar halaman<span class="zoom-menu__check">✓</span></button
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
            title="Gaya"
            ><span class="style-dropdown__label" id="styleTriggerLabel"
              >Normal</span
            ><span class="style-dropdown__caret" aria-hidden="true">▾</span
            ></button
          >
          <div
            class="style-dropdown__menu"
            id="styleMenu"
            role="listbox"
            aria-label="Gaya"
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
              ><span class="style-dropdown__label">Judul</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Subtitle"
              ><span class="style-dropdown__label">Subjudul</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading1"
              ><span class="style-dropdown__label">Judul 1</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading2"
              ><span class="style-dropdown__label">Judul 2</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading3"
              ><span class="style-dropdown__label">Judul 3</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading4"
              ><span class="style-dropdown__label">Judul 4</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading5"
              ><span class="style-dropdown__label">Judul 5</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Heading6"
              ><span class="style-dropdown__label">Judul 6</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="Strong"
              ><span class="style-dropdown__label">Tebal</span></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="ListParagraph"
              ><span class="style-dropdown__label">Paragraf Daftar</span
              ></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="footnote text"
              ><span class="style-dropdown__label">Teks catatan kaki</span
              ></button
            >
            <button
              class="style-dropdown__item"
              role="option"
              aria-selected="false"
              data-style-value="endnote text"
              ><span class="style-dropdown__label">Teks catatan akhir</span
              ></button
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
            title="Huruf"
            ><span class="font-dropdown__label" id="fontTriggerLabel"
              >Arial</span
            ><span class="font-dropdown__caret" aria-hidden="true">▾</span
            ></button
          >
          <div
            class="font-dropdown__menu"
            id="fontMenu"
            role="listbox"
            aria-label="Jenis huruf"
            hidden
          >
            <input
              type="search"
              class="font-dropdown__search"
              id="fontSearch"
              aria-label="Cari huruf"
              placeholder="Cari huruf"
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
            aria-label="Perkecil ukuran huruf"
            title="Perkecil ukuran huruf">−</button
          >
          <input
            type="number"
            class="font-size-stepper__input"
            id="fontSizeInput"
            min="1"
            max="1638"
            step="1"
            value="11"
            aria-label="Ukuran huruf dalam poin"
            title="Ukuran huruf"
          />
          <button
            class="font-size-stepper__button"
            id="fontSizePlus"
            aria-label="Perbesar ukuran huruf"
            title="Perbesar ukuran huruf">+</button
          >
        </span>
      </div>

      <div class="toolbar-separator toolbar-sep--text"></div>

      <!-- TEXT -->
      <div class="toolbar-group toolbar-group--text">
        <button class="tool command" data-slot="text.bold" title="Tebal"
          ><iconify-icon icon="bx:bold"></iconify-icon></button
        >
        <button class="tool command" data-slot="text.italic" title="Miring"
          ><iconify-icon icon="bx:italic"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="text.underline"
          title="Garis bawah"
          ><iconify-icon icon="bx:underline"></iconify-icon></button
        >
        <button class="tool command" data-slot="text.strike" title="Coret"
          ><iconify-icon icon="bx:strikethrough"></iconify-icon></button
        >
      </div>

      <div class="toolbar-separator toolbar-sep--script"></div>

      <!-- SCRIPT (sub/sup) -->
      <div class="toolbar-group toolbar-group--script">
        <button class="tool command" data-slot="script.super" title="Superskrip"
          >x²</button
        >
        <button class="tool command" data-slot="script.sub" title="Subskrip"
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
            title="Warna huruf"
            aria-label="Warna huruf"
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
            aria-label="Warna huruf"
            title="Warna huruf">▾</button
          >
          <div
            class="swatch-popup"
            id="fontColorPopup"
            role="dialog"
            aria-label="Warna huruf"
            hidden
          >
            <button class="swatch-clear" data-value="auto">
              <span class="swatch-clear-chip" aria-hidden="true"></span>Otomatis
            </button>
            <div class="swatch-section">
              <div class="swatch-heading">Warna Tema</div>
              <div
                class="swatch-grid swatch-grid--theme"
                id="fontColorTheme"
                role="group"
              ></div>
            </div>
            <div class="swatch-section">
              <div class="swatch-heading">Warna Standar</div>
              <div
                class="swatch-grid"
                id="fontColorStandard"
                role="group"
              ></div>
            </div>
            <div class="swatch-section">
              <div class="swatch-heading">Warna Kustom</div>
              <div class="swatch-custom">
                <span class="swatch-hash" aria-hidden="true">#</span>
                <input
                  type="text"
                  class="swatch-hex"
                  id="fontColorHex"
                  maxlength="6"
                  spellcheck="false"
                  aria-label="Warna kustom"
                  placeholder="FF0000"
                />
                <button class="swatch-apply" id="fontColorApply" disabled
                  >Terapkan</button
                >
              </div>
            </div>
          </div>
        </div>
        <div class="colorsplit" id="highlightSplit" data-slot="text.highlight">
          <button
            class="tool colorsplit__main"
            id="highlightMain"
            title="Sorotan teks"
            aria-label="Sorotan teks"
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
            aria-label="Sorotan teks"
            title="Sorotan teks">▾</button
          >
          <div
            class="swatch-popup"
            id="highlightPopup"
            role="dialog"
            aria-label="Sorotan teks"
            hidden
          >
            <button class="swatch-clear" data-value="none">
              <span
                class="swatch-clear-chip swatch-clear-chip--none"
                aria-hidden="true"
              ></span>Tanpa Warna
            </button>
            <div class="swatch-section">
              <div class="swatch-heading">Warna Sorotan</div>
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
            title="Rata kiri"
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
              title="Rata kiri"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-left"></iconify-icon></button
            >
            <button
              type="button"
              class="tool alignment__option"
              data-slot="alignment.center"
              title="Rata tengah"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-middle"></iconify-icon></button
            >
            <button
              type="button"
              class="tool alignment__option"
              data-slot="alignment.right"
              title="Rata kanan"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-right"></iconify-icon></button
            >
            <button
              type="button"
              class="tool alignment__option"
              data-slot="alignment.justify"
              title="Rata kanan-kiri"
              aria-pressed="false"
              ><iconify-icon icon="bx:align-justify"></iconify-icon></button
            >
          </div>
        </div>
      </div>

      <div class="toolbar-separator toolbar-sep--list"></div>

      <!-- LIST -->
      <div class="toolbar-group toolbar-group--list">
        <button
          class="tool command"
          data-slot="list.bullet"
          title="Daftar berpoin"
          ><iconify-icon icon="bx:list-ul"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="list.numbered"
          title="Daftar bernomor"
          ><iconify-icon icon="bx:list-ol"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="list.outdent"
          title="Kurangi indent"
          ><iconify-icon icon="bx:left-indent"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="list.indent"
          title="Tambah indent"
          ><iconify-icon icon="bx:right-indent"></iconify-icon></button
        >
        <div class="line-spacing" id="lineSpacing">
          <button
            class="tool line-spacing__trigger"
            id="lineSpacingTrigger"
            title="Spasi baris"
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
              id="lineSpacingOptions">Opsi Spasi Baris…</button
            >
            <div class="toolbar-menu__separator" role="separator"></div>
            <button
              type="button"
              role="menuitem"
              class="toolbar-menu__item"
              id="spaceBeforeRow">Tambah Spasi Sebelum Paragraf</button
            >
            <button
              type="button"
              role="menuitem"
              class="toolbar-menu__item"
              id="spaceAfterRow">Tambah Spasi Setelah Paragraf</button
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
          title="Salin format"
          ><iconify-icon icon="bx:brush"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="format.clear"
          title="Hapus format"
          ><iconify-icon icon="bx:eraser"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="paragraph.dialog"
          title="Paragraf"
          ><iconify-icon icon="bx:paragraph"></iconify-icon></button
        >
      </div>

      <div class="toolbar-separator toolbar-sep--insert"></div>

      <!-- INSERT -->
      <div class="toolbar-group toolbar-group--insert">
        <button
          class="tool command"
          data-slot="table.insert"
          title="Sisipkan tabel"
          ><iconify-icon icon="bx:table"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="image.insert"
          title="Sisipkan gambar"
          ><iconify-icon icon="bx:image"></iconify-icon></button
        >
        <button
          class="tool command"
          data-slot="insert.pageBreak"
          title="Pindah halaman"
          ><iconify-icon icon="bx:file-blank"></iconify-icon></button
        >
      </div>

      <!-- MODE -->
      <div class="toolbar-group toolbar-group--mode">
        <button
          class="tool"
          id="commentsButton"
          data-slot="review.comments"
          title="Komentar & Perubahan"
          aria-label="Komentar & Perubahan"
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
            aria-label="Mode penyuntingan"
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
            <span class="mode__value" id="modeValue">Menyunting</span>
            <span class="picker-caret" aria-hidden="true">▾</span>
          </button>
          <div
            class="mode__menu"
            id="modeMenu"
            role="menu"
            aria-label="Mode penyuntingan"
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
                <span class="mode__label">Menyunting</span>
                <span class="mode__hint"
                  >Perubahan diterapkan langsung ke dokumen.</span
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
                <span class="mode__label">Menyarankan</span>
                <span class="mode__hint"
                  >Perubahan menjadi usulan untuk ditinjau orang lain.</span
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
                <span class="mode__label">Melihat</span>
                <span class="mode__hint"
                  >Hanya baca — tidak ada pengeditan yang diizinkan.</span
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
          aria-label="Lainnya"
          title="Lainnya"
          ><iconify-icon icon="bx:dots-horizontal-rounded"
          ></iconify-icon></button
        >
        <div
          class="toolbar-more__panel"
          id="toolbarMorePanel"
          role="dialog"
          aria-label="Lainnya"
          hidden
        >
          <div class="toolbar-more__section toolbar-more__section--zoom">
            <div class="toolbar-more__heading">Zoom</div>
            <div class="toolbar-more__zoom">
              <button
                class="toolbar-more__item"
                id="moreZoomOut"
                title="Perkecil"
                ><iconify-icon icon="bx:minus"></iconify-icon></button
              >
              <button
                class="toolbar-more__item"
                id="moreZoomValue"
                title="Tingkat zoom">100%</button
              >
              <button
                class="toolbar-more__item"
                id="moreZoomIn"
                title="Perbesar"
                ><iconify-icon icon="bx:plus"></iconify-icon></button
              >
            </div>
          </div>
          <div class="toolbar-more__section toolbar-more__section--style">
            <div class="toolbar-more__heading">Gaya</div>
            <div class="toolbar-more__submenu" id="moreStyleSubmenu">
              <button
                class="toolbar-more__item toolbar-more__item--submenu"
                id="moreStyleTrigger"
                title="Pilih gaya paragraf"
                aria-haspopup="menu"
                aria-expanded="false"
                ><span id="moreStyleTriggerLabel">Normal</span><span
                  class="toolbar-more__caret"
                  aria-hidden="true">›</span
                ></button
              >
              <div
                class="toolbar-more__submenu-panel"
                id="moreStylePanel"
                role="menu"
                aria-label="Pilih gaya paragraf"
              >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Normal">Normal</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Title">Judul</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Subtitle">Subjudul</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading1">Judul 1</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading2">Judul 2</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading3">Judul 3</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading4">Judul 4</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading5">Judul 5</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Heading6">Judul 6</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="Strong">Tebal</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="ListParagraph">Paragraf Daftar</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="footnote text">Teks catatan kaki</button
                >
                <button
                  class="toolbar-more__submenu-item"
                  role="menuitem"
                  data-style-value="endnote text">Teks catatan akhir</button
                >
              </div>
            </div>
          </div>
          <div class="toolbar-more__section toolbar-more__section--font">
            <div class="toolbar-more__heading">Huruf</div>
            <div class="toolbar-more__submenu" id="moreFontSubmenu">
              <button
                class="toolbar-more__item toolbar-more__item--submenu"
                id="moreFontTrigger"
                title="Pilih jenis huruf"
                aria-haspopup="menu"
                aria-expanded="false"
                ><span id="moreFontTriggerLabel">Arial</span><span
                  class="toolbar-more__caret"
                  aria-hidden="true">›</span
                ></button
              >
              <div
                class="toolbar-more__submenu-panel"
                id="moreFontPanel"
                role="menu"
                aria-label="Pilih jenis huruf"
              >
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
            <div class="toolbar-more__zoom">
              <button
                class="toolbar-more__item"
                id="moreFontSizeMinus"
                title="Perkecil ukuran huruf"
                ><iconify-icon icon="bx:minus"></iconify-icon>Ukuran huruf</button
              >
              <button
                class="toolbar-more__item"
                id="moreFontSizeValue"
                title="Ukuran huruf">11</button
              >
              <button
                class="toolbar-more__item"
                id="moreFontSizePlus"
                title="Perbesar ukuran huruf"
                ><iconify-icon icon="bx:plus"></iconify-icon>Ukuran huruf</button
              >
            </div>
          </div>
          <div class="toolbar-more__section toolbar-more__section--script">
            <div class="toolbar-more__heading">Skrip</div>
            <button
              class="toolbar-more__item command"
              data-slot="script.super"
              title="Superskrip">x² Superskrip</button
            >
            <button
              class="toolbar-more__item command"
              data-slot="script.sub"
              title="Subskrip">x₂ Subskrip</button
            >
          </div>
          <div class="toolbar-more__section toolbar-more__section--list">
            <div class="toolbar-more__heading">Daftar</div>
            <button
              class="toolbar-more__item command"
              data-slot="list.bullet"
              title="Daftar berpoin"
              ><iconify-icon icon="bx:list-ul"></iconify-icon>Daftar Berpoin</button
            >
            <button
              class="toolbar-more__item command"
              data-slot="list.numbered"
              title="Daftar bernomor"
              ><iconify-icon icon="bx:list-ol"></iconify-icon>Daftar Bernomor</button
            >
            <button
              class="toolbar-more__item command"
              data-slot="list.outdent"
              title="Kurangi indent"
              ><iconify-icon icon="bx:left-indent"></iconify-icon>Kurangi Indent</button
            >
            <button
              class="toolbar-more__item command"
              data-slot="list.indent"
              title="Tambah indent"
              ><iconify-icon icon="bx:right-indent"></iconify-icon>Tambah Indent</button
            >
          </div>
          <div class="toolbar-more__section toolbar-more__section--format">
            <div class="toolbar-more__heading">Format</div>
            <button
              class="toolbar-more__item command"
              data-slot="format.painter"
              title="Salin format"
              ><iconify-icon icon="bx:brush"></iconify-icon>Salin Format</button
            >
            <button
              class="toolbar-more__item command"
              data-slot="format.clear"
              title="Hapus format"
              ><iconify-icon icon="bx:eraser"></iconify-icon>Hapus Format</button
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
    aria-label="Sisipkan tabel"
    hidden
  >
    <div
      class="table-grid"
      id="toolbarTableGrid"
      role="grid"
      aria-label="Sisipkan tabel"
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
        title="Margin kiri"
      ></div>
      <div
        class="ruler-margin-zone right"
        id="hRightMarginZone"
        title="Margin kanan"
      ></div>
      <div
        class="ruler-indent-handle"
        id="hFirstLineHandle"
        role="slider"
        aria-label="Indent baris pertama"
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
        aria-label="Indent gantung"
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
        aria-label="Indent kiri"
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
        aria-label="Indent kanan"
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
        title="Margin atas"
      ></div>
      <div
        class="ruler-margin-zone vertical bottom"
        id="vBottomMarginZone"
        title="Margin bawah"
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
      Halaman 1 dari 1
    </div>

    <!-- ============ NAVIGATION PANE ============ -->
    <div class="nav" id="nav" data-open="false">
      <button
        class="nav__toggle"
        id="navToggle"
        aria-label="Buka navigasi"
        aria-expanded="false"
        title="Buka navigasi"
      >
        <iconify-icon icon="bx:menu" width="20" height="20"></iconify-icon>
      </button>
      <aside class="nav__panel-shell" id="navPanel" aria-label="Navigasi" inert>
        <div class="nav__header">
          <button
            class="nav__close"
            id="navClose"
            aria-label="Tutup navigasi"
            title="Tutup navigasi"
          >
            <iconify-icon icon="bx:arrow-back" width="20" height="20"
            ></iconify-icon>
          </button>
          <h2 class="nav__title">Navigasi</h2>
        </div>
        <div class="nav__tabs" role="tablist" aria-label="Navigasi">
          <button
            class="nav__tab nav__tab--selected"
            role="tab"
            id="navTabHeadings"
            aria-selected="true"
            aria-controls="navPanelHeadings">Judul</button
          >
          <button
            class="nav__tab"
            role="tab"
            id="navTabFind"
            aria-selected="false"
            aria-controls="navPanelFind"
            tabindex="-1">Temukan</button
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
              placeholder="Saring judul"
              aria-label="Saring judul"
            />
            <button
              class="nav__search-clear"
              id="navHeadingClear"
              aria-label="Bersihkan saringan"
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
              placeholder="Cari di dokumen"
              aria-label="Cari di dokumen"
            />
            <button
              class="nav__search-clear"
              id="navFindClear"
              aria-label="Bersihkan pencarian"
              hidden
            >
              <iconify-icon icon="bx:x" width="16" height="16"></iconify-icon>
            </button>
          </div>
          <div class="nav__options" role="group" aria-label="Opsi pencarian">
            <label class="nav__option">
              <input type="checkbox" id="navMatchCase" /> Cocokkan huruf besar/kecil
            </label>
            <label class="nav__option">
              <input type="checkbox" id="navWholeWord" /> Seluruh kata
            </label>
          </div>
          <div class="nav__resultbar">
            <span class="nav__count" id="navCount" aria-live="polite"></span>
            <span class="nav__steppers">
              <button
                class="nav__stepper"
                id="navPrev"
                aria-label="Hasil sebelumnya"
                disabled
              >
                <iconify-icon icon="bx:chevron-up" width="18" height="18"
                ></iconify-icon>
              </button>
              <button
                class="nav__stepper"
                id="navNext"
                aria-label="Hasil berikutnya"
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
    <div class="dialog-title">Pengaturan Halaman</div>
    <div class="dialog-body">
      <div class="dialog-row">
        <label for="paperSize">Ukuran Kertas</label>
        <select id="paperSize" class="dialog-input">
          <option value="a4">A4 (210 × 297 mm)</option>
          <option value="letter">Letter (8.5 × 11 in)</option>
          <option value="legal">Legal (8.5 × 14 in)</option>
        </select>
      </div>
      <div class="dialog-row">
        <label for="orientation">Orientasi</label>
        <select id="orientation" class="dialog-input">
          <option value="portrait">Potret</option>
          <option value="landscape">Lanskap</option>
        </select>
      </div>
      <div class="dialog-row">
        <label for="marginTop">Atas (mm)</label>
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
        <label for="marginBottom">Bawah (mm)</label>
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
        <label for="marginLeft">Kiri (mm)</label>
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
        <label for="marginRight">Kanan (mm)</label>
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
        <label for="pageSetupScope">Terapkan ke</label>
        <select id="pageSetupScope" class="dialog-input">
          <option value="document">Seluruh dokumen</option>
          <option value="section">Bagian ini</option>
        </select>
      </div>
    </div>
    <div class="dialog-footer">
      <button class="dialog-button" id="pageSetupCancel">Batal</button>
      <button class="dialog-button primary" id="pageSetupApply">Terapkan</button
      >
    </div>
  </dialog>

  <!-- ============ CONTEXT MENU ============ -->
  <div
    class="contextmenu"
    id="contextMenu"
    role="menu"
    aria-label="Menu konteks"
    tabindex="-1"
  >
    <button class="contextmenu__item" data-cmd="cut" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:cut" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Potong</span>
      <span class="contextmenu__item-shortcut">Ctrl+X</span>
    </button>
    <button class="contextmenu__item" data-cmd="copy" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:copy" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Salin</span>
      <span class="contextmenu__item-shortcut">Ctrl+C</span>
    </button>
    <button class="contextmenu__item" data-cmd="paste" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:paste" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Tempel</span>
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
      <span class="contextmenu__item-label">Tempel tanpa format</span>
      <span class="contextmenu__item-shortcut">Ctrl+Shift+V</span>
    </button>
    <div class="contextmenu__separator" role="separator"></div>
    <button class="contextmenu__item" data-cmd="deleteText" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:trash" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Hapus</span>
      <span class="contextmenu__item-shortcut">Del</span>
    </button>
    <button class="contextmenu__item" data-cmd="selectAll" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:select-multiple" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Pilih semua</span>
      <span class="contextmenu__item-shortcut">Ctrl+A</span>
    </button>
    <div class="contextmenu__separator" role="separator"></div>
    <button class="contextmenu__item" data-slot="text.link" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:link" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Sisipkan tautan</span>
    </button>
    <button class="contextmenu__item" data-slot="format.clear" role="menuitem">
      <span class="contextmenu__item-icon"
        ><iconify-icon icon="bx:eraser" width="18" height="18"
        ></iconify-icon></span
      >
      <span class="contextmenu__item-label">Hapus format</span>
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
      <span class="contextmenu__item-label">Paragraf…</span>
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
        <span class="contextmenu__item-label">Sisipkan baris di atas</span>
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
        <span class="contextmenu__item-label">Sisipkan baris di bawah</span>
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
        <span class="contextmenu__item-label">Sisipkan kolom di kiri</span>
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
        <span class="contextmenu__item-label">Sisipkan kolom di kanan</span>
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
        <span class="contextmenu__item-label">Hapus baris</span>
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
        <span class="contextmenu__item-label">Hapus kolom</span>
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
        <span class="contextmenu__item-label">Hapus tabel</span>
      </button>
      <div class="contextmenu__separator" role="separator"></div>
      <div class="contextmenu__table-align">
        <span class="contextmenu__table-align-label">Perataan vertikal sel</span
        >
        <div
          class="contextmenu__table-align-buttons"
          role="group"
          aria-label="Perataan vertikal sel"
        >
          <button class="contextmenu__align-btn" data-align="top" title="Atas"
            >Atas</button
          >
          <button
            class="contextmenu__align-btn"
            data-align="center"
            title="Tengah">Tengah</button
          >
          <button
            class="contextmenu__align-btn"
            data-align="bottom"
            title="Bawah">Bawah</button
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
      aria-label="Paragraf"
      id="paragraphDialog"
    >
      <div class="docx-dialog__header">
        <span class="docx-dialog__title">Paragraf</span>
      </div>
      <div class="docx-dialog__body">
        <div class="docx-dialog__columns">
          <div class="docx-dialog__column">
            <div class="docx-dialog__section-label">Umum</div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdAlignment"
                >Perataan</label
              >
              <select class="docx-dialog__select" id="pdAlignment">
                <option value="left">Kiri</option>
                <option value="center">Tengah</option>
                <option value="right">Kanan</option>
                <option value="both">Rata kanan-kiri</option>
              </select>
            </div>
            <div class="docx-dialog__section-label">Indentasi</div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdIndentLeft"
                >Sebelum teks</label
              >
              <input
                type="number"
                class="docx-dialog__input"
                id="pdIndentLeft"
                min="0"
                step="0.1"
                value="0"
              />
              <span class="docx-dialog__unit">in</span>
            </div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdIndentRight"
                >Setelah teks</label
              >
              <input
                type="number"
                class="docx-dialog__input"
                id="pdIndentRight"
                min="0"
                step="0.1"
                value="0"
              />
              <span class="docx-dialog__unit">in</span>
            </div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdSpecial">Khusus</label>
              <select class="docx-dialog__select" id="pdSpecial">
                <option value="none">(tidak ada)</option>
                <option value="firstLine">Baris pertama</option>
                <option value="hanging">Gantung</option>
              </select>
            </div>
            <div class="docx-dialog__row" id="pdSpecialByRow">
              <label class="docx-dialog__label" for="pdSpecialBy">Sebesar</label
              >
              <input
                type="number"
                class="docx-dialog__input"
                id="pdSpecialBy"
                min="0"
                step="0.1"
                value="0"
              />
              <span class="docx-dialog__unit">in</span>
            </div>
          </div>
          <div class="docx-dialog__column">
            <div class="docx-dialog__section-label">Spasi</div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdSpaceBefore"
                >Sebelum</label
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
              <label class="docx-dialog__label" for="pdSpaceAfter"
                >Setelah</label
              >
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
                >Spasi baris</label
              >
              <select class="docx-dialog__select" id="pdLineRule">
                <option value="multiple">Kelipatan</option>
                <option value="atLeast">Minimal</option>
                <option value="exact">Tepat</option>
              </select>
            </div>
            <div class="docx-dialog__row">
              <label class="docx-dialog__label" for="pdLineValue">Pada</label>
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
              <input type="checkbox" id="pdContextualSpacing" />Jangan tambah
              spasi antar paragraf dengan gaya yang sama
            </label>
            <div class="docx-dialog__section-label">Paginasi</div>
            <label class="docx-dialog__checkbox-row">
              <input type="checkbox" id="pdKeepNext" />Pertahankan dengan
              berikutnya
            </label>
            <label class="docx-dialog__checkbox-row">
              <input type="checkbox" id="pdWidowControl" checked />Kontrol
              janda/yatim
            </label>
            <label class="docx-dialog__checkbox-row">
              <input type="checkbox" id="pdKeepLines" />Pertahankan baris
              bersama
            </label>
            <label class="docx-dialog__checkbox-row">
              <input type="checkbox" id="pdPageBreakBefore" />Pindah halaman
              sebelum
            </label>
          </div>
        </div>
      </div>
      <div class="docx-dialog__footer">
        <span class="docx-dialog__error" id="pdError" role="alert"></span>
        <button type="button" class="docx-dialog__button" id="pdCancel"
          >Batal</button
        >
        <button
          type="button"
          class="docx-dialog__button docx-dialog__button--primary"
          id="pdOk">OK</button
        >
      </div>
    </div>
  </div>

  <!-- ============ ERROR ============ -->
  <div id="error" class="error hidden">
    <h3>Kesalahan</h3>
    <pre id="errorText"></pre>
  </div>
</div>
