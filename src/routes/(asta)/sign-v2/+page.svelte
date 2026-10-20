<script lang="ts">
  import { env } from "$env/dynamic/public";
  import { app } from "$lib/app/index.svelte";
  import { chat } from "$lib/app/chat.svelte";
  import { workspace } from "$lib/app/sign-workspace.svelte";
  import { getVisualDrag, setVisualDrag } from "$lib/app/visual-drag.svelte";
  import WorkspaceMenuBar from "$lib/components/workspace-menubar.svelte";
  import {
    type PlacementType,
    type SignaturePlacement,
    type TextPlacement,
    type CheckboxPlacement,
    normalizePlacement,
  } from "./types";
  import * as pdfLib from "$lib/utils/pdf";
  import { Modal, Tour, type TourStep } from "$lib/components";
  import { submitSurvey } from "$lib/remotes/survey.remote";
  import Documents from "./documents.svelte";
  import Metadata from "./metadata.svelte";
  import SignerEmail from "./signer-email.svelte";
  import Preview, {
    type PreviewController,
    type PreviewState,
  } from "$lib/components/preview.svelte";
  import Upload from "./upload.svelte";
  import Visualizer from "./visualizer.svelte";
  import Signature from "./signature.svelte";
  import Template from "../templates/template.svelte";
  import Toolbar, { type SignTool } from "./toolbar.svelte";
  import PageNav from "./page-nav.svelte";
  import {
    debounce,
    fileToBase64,
    createId,
    promisePool,
    generateQRCode,
    d,
    base64ToBlob,
  } from "$lib/utils";
  import {
    getDocument,
    signDocument,
    verifyTurnstile,
  } from "$lib/remotes/sign.remote";
  import { getData } from "$lib/remotes/api.remote";

  import { PDFDocument } from "pdf-lib";
  import { goto } from "$app/navigation";
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import Dragresize from "$lib/components/dragresize.svelte";
  import { sendMessage } from "$lib/remotes/whatsapp.remote";
  import { stashSignFile, takeSignFile } from "$lib/utils/sign-handoff";
  import { vault } from "$lib/utils/vault";
  import { createZip } from "$lib/utils/zip";
  import "./sign.css";

  const { data } = $props();
  let turnstileSuccess = $state(false);
  let loading = $state(false);
  let signForm: HTMLFormElement | null = $state(null);
  let activeIndex = $state("");
  let documents: Record<string, File> = $state({});
  let asTemplate = $state(false);
  let asDraft = $state(false);
  let isDraft = $state(false);
  let status = $state("NOT_REGISTERED");
  let emailLoading = $state(false);
  let emailOpen = $state(false);
  let bsre = $state(true);
  let form: Record<string, any> = $state({});
  // svelte-ignore state_referenced_locally
  let useEmail = $state(true);
  // Small screens hide the email field behind the envelope toggle. Keep it
  // open while it still needs attention: unverified, or empty in manual mode.
  let emailAlwaysVisible = $derived(
    status !== "ISSUE" || (!bsre && !form.email),
  );
  let fields: Record<string, any> = $state({});
  let hasSignature = $state(true);
  let signatureInfos = $state<pdfLib.SignatureInfo[]>([]);
  let isEncrypted = $state(false);
  let previewFile: File | null = $state(null);
  let startTime = $state(0);
  let timer = $state(0);
  let elapsedTime = $state(0);
  let turnstileId = $state("");

  let activeTab = $state("documents");

  /** Where the signing footer (QR + note) is drawn: only the active page or all. */
  let footerScope = $state<"all" | "current">("all");

  /** Three-state footer control for the toolbar: none | this page | all pages. */
  const footerMode = $derived<"none" | "current" | "all">(
    form.footer ? footerScope : "none",
  );

  // ── editor-style chrome state ────────────────────────────────────
  // Document name lives in the shared workspace store so the global navbar
  // can render the filename input alongside the menubar.
  let navOpen = $state(false);
  let pageNavOpen = $state(false);
  let pageNavTab = $state<"halaman" | "properti">("halaman");

  /** Zoom control floating at the bottom-right of the document. */
  let zoomMenuOpen = $state(false);
  const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  /** Visualisation picker dialog (reuses `Signature`). */
  let visualDialog: HTMLDialogElement | undefined = $state();
  let visualTab = $state<"image" | "qr" | "box" | "draw">("draw");

  /** Page-number draft for the centred document bar's pagination. */
  let pageDraft = $state<string | number>("");

  $effect(() => {
    pageDraft = previewState.page;
  });

  /** "Page X of X" overlay: flashes on page change, then fades (like the editor). */
  let pageOverlayVisible = $state(false);
  let pageOverlayTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    previewState.page;
    previewState.pageCount;
    pageOverlayVisible = true;
    if (pageOverlayTimer) clearTimeout(pageOverlayTimer);
    pageOverlayTimer = setTimeout(() => (pageOverlayVisible = false), 1200);
    return () => {
      if (pageOverlayTimer) clearTimeout(pageOverlayTimer);
    };
  });

  function commitPage() {
    const value = Number(pageDraft);
    if (
      Number.isFinite(value) &&
      pageDraft !== "" &&
      value >= 1 &&
      value <= previewState.pageCount
    ) {
      previewCtl?.goToPage(value);
    } else {
      pageDraft = previewState.page;
    }
  }

  /** Which armed placement tool is active (click-to-place on the preview). */
  let activeTool = $state<SignTool>("select");
  let selectedId = $state<string | null>(null);
  let overlayEl: HTMLDivElement | null = $state(null);
  // Live ghost showing where a dragged visual would land, in PDF points.
  let dragPreview = $state<{
    x: number;
    y: number;
    width: number;
    height: number;
    src: string;
  } | null>(null);

  // The source clears its geometry on dragend; mirror that here so the ghost
  // never lingers when a drag is cancelled.
  $effect(() => {
    if (!getVisualDrag()) dragPreview = null;
  });
  let previewCtl: PreviewController | null = $state(null);
  let previewState: PreviewState = $state({
    zoom: 1,
    page: 1,
    pageCount: 0,
    sizes: [],
    layout: { perRow: 1, boxes: [] },
  });

  /** Snapshot-based undo/redo over the placement list. */
  let undoStack: string[] = $state([]);
  let redoStack: string[] = $state([]);

  const armed = $derived(
    activeTool !== "select" && activeTool !== "signature",
  );
  const canUndo = $derived(undoStack.length > 0);
  const canRedo = $derived(redoStack.length > 0);

  $effect(() => {
    document.body.classList.toggle("dark", app.theme === "dark");
    return () => document.body.classList.remove("dark");
  });

  const tourSteps: TourStep[] = [
    {
      target: "#tour-upload-btn",
      title: "Unggah Dokumen",
      content:
        "Pilih berkas PDF atau DOCX yang ingin ditandatangani, atau seret berkas ke area ini.",
      placement: "bottom",
      onShow: () => {
        emailOpen = false;
        activeTab = "documents";
        navOpen = false;
      },
    },
    {
      target: "#tour-mode",
      title: "TTE atau Manual",
      content:
        "Pilih mode Tanda Tangan Elektronik (TTE) untuk memakai sertifikat BSrE, atau Tanda Tangan Manual untuk menempel tanda tangan tanpa sertifikat.",
      placement: "bottom",
      onShow: () => {
        emailOpen = false;
      },
    },
    {
      target: "#tour-email",
      title: "Email Penandatangan",
      content:
        "Masukkan Email Dinas Anda. Akun diverifikasi otomatis dan data identitas diambil dari profil BSrE bila tersedia.",
      placement: "bottom",
      onShow: () => {
        emailOpen = true;
        navOpen = false;
      },
    },
    {
      target: "#tour-toolbar",
      title: "Alat Tanda Tangan",
      content:
        "Atur halaman, zoom, tambahkan visualisasi (QR, kotak, gambar, coretan), dan unduh dokumen dari bilah ini.",
      placement: "bottom",
      onShow: () => {
        navOpen = false;
      },
    },
    {
      target: "#tour-documents",
      title: "Daftar Dokumen",
      content:
        "Semua berkas yang diunggah tampil di sini. Klik untuk berpindah antar dokumen.",
      placement: "right",
      onShow: () => {
        navOpen = true;
        activeTab = "documents";
      },
    },
    {
      target: "#tour-metadata",
      title: "Informasi Penandatangan",
      content:
        "Lengkapi identitas penandatangan. Data akan terisi otomatis dari profil BSrE Anda.",
      placement: "right",
      onShow: () => {
        navOpen = true;
        activeTab = "metadata";
      },
    },
    {
      target: "#tour-visual",
      title: "Visualisasi Tanda Tangan",
      content:
        "Seret QR, kotak, atau coretan ke dokumen untuk menampilkan tanda tangan. Lengkapi profil bila pratinjau belum tersedia.",
      placement: "right",
      onShow: () => {
        navOpen = true;
        activeTab = "metadata";
      },
    },
    {
      target: "#tour-sign-button",
      title: "Proses Tanda Tangan",
      content:
        "Setelah semua siap, klik tombol ini untuk memulai proses penandatanganan secara elektronik.",
      placement: "left",
      onShow: () => {
        forms.sign = undefined;
      },
    },
    {
      target: "#tour-passphrase",
      title: "Isi Passphrase",
      content:
        "Masukkan Passphrase sertifikat elektronik Anda di sini untuk membubuhkan tanda tangan pada dokumen.",
      placement: "left",
      modal: true,
      interactive: true,
      onShow: () => {
        if (forms.sign) forms.sign.completed = [];
        void openSignForTour();
      },
    },
    {
      target: "#tour-save-passkey",
      title: "Passkey (Opsional)",
      // The target is either the "Simpan Passkey" toggle or the "TTD dengan
      // Passkey" button depending on whether one is already stored, so the copy
      // has to cover both — there is no "Simpan Passphrase" control.
      content:
        "Simpan Passphrase dengan Passkey agar tanda tangan berikutnya lebih cepat, atau langsung tanda tangan dengan Passkey bila sudah tersimpan.",
      placement: "left",
      onShow: () => {
        if (forms.sign) forms.sign.completed = [];
      },
    },
    {
      target: "#tour-sign-submit",
      title: "Klik Tanda Tangan Elektronik",
      content:
        "Tekan tombol ini untuk membubuhkan tanda tangan elektronik pada dokumen.",
      placement: "top",
      onShow: () => {
        if (forms.sign) forms.sign.completed = [];
      },
    },
    {
      target: "#tour-sign-status",
      title: "Selesai",
      content:
        "Setelah berhasil, dokumen ditandatangani dan Anda dapat mengunduh atau menilainya.",
      placement: "bottom",
      onShow: () => {
        if (forms.sign) forms.sign.completed = Object.keys(forms.sign.documents);
      },
    },
  ];
  let signResults: {
    id: string;
    fileName: string;
    base64?: string;
    blob?: Blob;
  }[] = $state([]);

  /** How many signed documents are ready to be bundled into the ZIP. */
  const signedCount = $derived(signResults.filter((r) => r.blob).length);

  async function downloadAllSigned() {
    const files = signResults.filter((r) => r.blob);
    if (files.length === 0) return;

    try {
      const entries = await Promise.all(
        files.map(async (r) => ({
          name: r.fileName.replace(/\.pdf$/i, "") + ".pdf",
          data: new Uint8Array(await r.blob!.arrayBuffer()),
        })),
      );

      const url = URL.createObjectURL(createZip(entries));
      const link = document.createElement("a");
      link.href = url;
      link.download = `signed-${d().format("YYYYMMDD-HHmmss")}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[sign] download all failed", err);
      app.showToast("error", "Gagal mengunduh semua dokumen.");
    }
  }

  // ── Passphrase vault (WebAuthn PRF) ───────────────────────────────
  let vaultSupported = $state(false);
  let vaultHas = $state(false);
  let vaultBusy = $state(false);
  let vaultError = $state("");
  let vaultSavedAt = $state<number | null>(null);

  async function refreshVaultState(email: string) {
    if (!email || typeof window === "undefined") {
      vaultHas = false;
      vaultSavedAt = null;
      return;
    }
    vaultSupported = await vault.supported();
    vaultHas = await vault.has(email);
    const record = await vault.get(email);
    vaultSavedAt = record?.updatedAt ?? null;
  }

  async function saveToVault(email: string, passphrase: string) {
    if (!email || !passphrase) return;
    vaultBusy = true;
    vaultError = "";
    try {
      const tier = await vault.save(email, passphrase);
      if (tier === "unsupported") {
        vaultError =
          "Perangkat ini tidak mendukung penyimpanan aman. Passphrase tidak disimpan.";
        return;
      }
      vaultHas = true;
      vaultSavedAt = Date.now();
    } catch (err) {
      console.error("[vault] save failed", err);
      vaultError = "Gagal menyimpan passphrase.";
    } finally {
      vaultBusy = false;
    }
  }

  async function usePasskey(email: string) {
    if (!email) return;
    vaultBusy = true;
    vaultError = "";
    try {
      const passphrase = await vault.unlock(email);
      if (passphrase == null) {
        vaultError = "Autentikasi dibatalkan atau gagal. Coba lagi.";
        return;
      }
      if (forms.sign) forms.sign.passphrase = passphrase;
      await tick();
      signForm?.requestSubmit();
    } catch (err) {
      console.error("[vault] unlock failed", err);
      vaultError = "Gagal membuka passphrase tersimpan.";
    } finally {
      vaultBusy = false;
    }
  }

  async function removeFromVault(email: string) {
    if (!email) return;
    vaultBusy = true;
    vaultError = "";
    try {
      await vault.clear(email);
      vaultHas = false;
      vaultSavedAt = null;
      app.showToast("success", "Passphrase dihapus dari perangkat.");
    } catch (err) {
      console.error("[vault] remove failed", err);
      vaultError = "Gagal menghapus passphrase.";
    } finally {
      vaultBusy = false;
    }
  }

  // svelte-ignore state_referenced_locally
  let saveDocument = $state(!!data.user);

  let forms: {
    sign?: {
      nik: string;
      email: string;
      nama: string;
      jabatan: string;
      pangkat: string;
      instansi: string;
      passphrase: string;
      note: string;
      location: string;
      signatureProperties: PlacementType[];
      documents: Record<string, File>;
      nomor_telepon: string;
      send_file?: boolean;
      footer?: boolean;
      specimen?: string;
      owner?: string;
      save_document?: boolean;
      to?: string[];
      completed: string[];
      __token: string;
      __error?: string;
    };
    confirm?: boolean;
    template?: string;
    survey?: { rating: number; feedback: string };
  } = $state({});

  let fileInput: HTMLInputElement | null = $state(null);
  let files: File[] = $state([]);

  let placements: PlacementType[] = $state([]);

  /** Per-signer visualisation sets, keyed by the signer identity. */
  let placementsByEmail = $state<Record<string, PlacementType[]>>({});
  let signerKey = $state("");

  function snapshot() {
    undoStack.push(JSON.stringify(placements));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(placements));
    placements = JSON.parse(undoStack.pop()!);
    selectedId = null;
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(placements));
    placements = JSON.parse(redoStack.pop()!);
    selectedId = null;
  }

  function removePlacement(id: string) {
    snapshot();
    placements = placements.filter((p) => p.id !== id);
    if (selectedId === id) selectedId = null;
  }

  const setSignature = (sign: PlacementType) => {
    const idx = placements.findIndex((p) => p.id === sign.id);
    if (idx > -1) {
      placements[idx] = sign;
    } else if (bsre && hasSignature && (sign.kind ?? "signature") === "signature") {
      // BSrE allows a single signature; other field types are kept.
      placements = [
        ...placements.filter((p) => (p.kind ?? "signature") !== "signature"),
        sign,
      ];
    } else {
      placements = [...placements, sign];
    }
    selectedId = sign.id;
  };

  function initialsText() {
    const nama = String(form.nama || "").trim();
    if (!nama) return "TTD";
    return nama
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 4);
  }

  function addPlacementAt(
    tool: SignTool,
    pg: number,
    x: number,
    y: number,
  ) {
    const id = createId(6);
    const cx = Math.max(0, x);
    const cy = Math.max(0, y);
    let pl: PlacementType;

    if (tool === "checkbox") {
      const size = 14;
      pl = {
        id,
        kind: "checkbox",
        page: pg,
        originX: cx - size / 2,
        originY: cy - size / 2,
        width: size,
        height: size,
        checked: false,
      } as CheckboxPlacement;
    } else if (tool === "date") {
      const w = 110;
      const h = 16;
      pl = {
        id,
        kind: "date",
        page: pg,
        originX: cx - w / 2,
        originY: cy - h / 2,
        width: w,
        height: h,
        text: form.tanggal || d().format("DD MMMM YYYY"),
        size: 11,
      } as TextPlacement;
    } else if (tool === "initials") {
      const w = 44;
      const h = 18;
      pl = {
        id,
        kind: "text",
        page: pg,
        originX: cx - w / 2,
        originY: cy - h / 2,
        width: w,
        height: h,
        text: initialsText(),
        size: 14,
      } as TextPlacement;
    } else {
      const w = 120;
      const h = 18;
      pl = {
        id,
        kind: "text",
        page: pg,
        originX: cx - w / 2,
        originY: cy - h / 2,
        width: w,
        height: h,
        text: "Teks",
        size: 11,
      } as TextPlacement;
    }

    snapshot();
    placements = [...placements, pl];
    selectedId = id;
    activeTool = "select";
  }

  // Selecting a placement from the document tree shows its properties in the
  // right-hand panel.
  function selectForProps(id: string) {
    selectedId = id;
    pageNavTab = "properti";
    pageNavOpen = true;
  }

  function handleOverlayClick(
    e: MouseEvent,
    scale: number,
    pageSizes: { width: number; height: number }[],
    gapPts: number,
    layout?: PreviewState["layout"],
  ) {
    if (!armed || !overlayEl) return;
    if (e.target !== overlayEl) return;

    const rect = overlayEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const yTop = (e.clientY - rect.top) / scale;

    let acc = 0;
    for (let i = 0; i < pageSizes.length; i++) {
      const h = pageSizes[i].height;
      const rowTop = acc;
      if (yTop < acc + h) {
        const box = layout?.boxes?.[i];
        // In two-up, convert overlay (untransformed) coords to page-local coords
        const px = box ? (x - box.left) / (box.scale ?? scale) : x;
        const py = box ? (yTop - box.top) / (box.scale ?? scale) : yTop - rowTop;
        addPlacementAt(activeTool, i + 1, px, py);
        break;
      }
      acc += h + gapPts;
    }
  }

  /** Drop a visual dragged from the metadata panel onto the document, centred
   *  on the cursor. */
  function handleOverlayDrop(
    e: DragEvent,
    scale: number,
    pageSizes: { width: number; height: number }[],
    gapPts: number,
    layout?: PreviewState["layout"],
  ) {
    const raw = e.dataTransfer?.getData("application/x-asta-visual");
    if (!raw || !overlayEl) return;
    e.preventDefault();
    let payload: {
      visual: "qr" | "box";
      imageBase64: string;
      width: number;
      height: number;
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const rect = overlayEl.getBoundingClientRect();
    let cx = (e.clientX - rect.left) / scale;
    let cy = (e.clientY - rect.top) / scale;

    let page = 1;
    let px = cx;
    let py = cy;
    let acc = 0;
    for (let i = 0; i < pageSizes.length; i++) {
      const h = pageSizes[i].height;
      const rowTop = acc;
      if (cy < acc + h) {
        const box = layout?.boxes?.[i];
        page = i + 1;
        if (box) {
          px = (cx - box.left) / (box.scale ?? scale);
          py = (cy - box.top) / (box.scale ?? scale);
        } else {
          py = cy - rowTop;
        }
        break;
      }
      acc += h + gapPts;
    }

    const width = payload.visual === "qr" ? 100 : 200;
    const height = (width / payload.width) * payload.height;
    snapshot();
    setSignature({
      id: createId(6),
      kind: "signature",
      imageBase64: payload.imageBase64,
      page,
      tampilan: "VISIBLE",
      originX: Math.max(0, px - width / 2),
      originY: Math.max(0, py - height / 2),
      width,
      height,
      location: "",
      reason: "",
    });
  }

  /** Position the live ghost at the cursor while a visual is dragged over the
   *  document. */
  function updateDragPreview(e: DragEvent, scale: number, layout?: PreviewState["layout"], pageSizesParam?: { width: number; height: number }[]) {
    const sizes = (pageSizesParam ?? []) as { width: number; height: number }[];
    const drag = getVisualDrag();
    if (!drag || !overlayEl) return;
    const rect = overlayEl.getBoundingClientRect();
    let cx = (e.clientX - rect.left) / scale;
    let cy = (e.clientY - rect.top) / scale;
    const width = drag.visual === "qr" ? 100 : 200;
    const height = (width / drag.width) * drag.height;
    // Convert to page-local coordinates for ghost preview
    let px = cx;
    let py = cy;
    let acc = 0;
    for (let i = 0; i < sizes.length; i++) {
      const h = sizes[i].height;
      if (cy < acc + h) {
        const box = layout?.boxes?.[i];
        if (box) {
          px = (cx - box.left) / (box.scale ?? scale);
          py = (cy - box.top) / (box.scale ?? scale);
        } else {
          py = cy - acc;
        }
        break;
      }
      acc += h;
    }
    dragPreview = {
      x: Math.max(0, px - width / 2),
      y: Math.max(0, py - height / 2),
      width,
      height,
      src: drag.src,
    };
  }

  function isEditableTarget(t: EventTarget | null) {
    const el = t as HTMLElement | null;
    if (!el) return false;
    return (
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable
    );
  }

  const hasDocuments = $derived(Object.keys(documents).length > 0);
  // Signing only requires an identity and a valid TTE signer; note/location are
  // optional (they default server-side). Manual signing just needs at least one
  // signature visualisation.
  const hasMetadata = $derived(
    String(form.email).length > 0 &&
      (bsre
        ? status === "ISSUE"
        : placements.some((p) => (p.kind ?? "signature") === "signature")),
  );
  const allowSigning = $derived(hasDocuments && hasMetadata && !isEncrypted);

  /**
   * Which visualisation tools are available: everything for a valid TTE signer,
   * only the drawn signature in Manual mode, nothing otherwise.
   */
  const visualMode = $derived<"all" | "draw" | "none">(
    !hasDocuments ? "none" : !bsre ? "draw" : status === "ISSUE" ? "all" : "none",
  );

  // Mirror the page's menu actions into the shared workspace store so the
  // global navbar can render the editor menubar on the same row.
  $effect(() => {
    const undoOk = canUndo;
    const redoOk = canRedo;
    const hasDocs = hasDocuments;
    const hasSel = !!selectedId;
    workspace.menus = [
      {
        id: "mode",
        label: bsre ? "TTE" : "Manual",
        variant: "primary",
        width: "w-[5.5rem]",
        items: [
          {
            icon: bsre ? "bx:radio-circle-marked" : "bx:radio-circle",
            label: "Tanda Tangan Elektronik",
            action: () => (bsre = true),
          },
          {
            icon: !bsre ? "bx:radio-circle-marked" : "bx:radio-circle",
            label: "Tanda Tangan Manual",
            action: () => (bsre = false),
          },
        ],
      },
      {
        id: "file",
        label: "File",
        items: [
          {
            icon: "bx:upload",
            label: "Unggah PDF/DOCX…",
            action: () => fileInput?.click(),
          },
          {
            icon: "bx:file",
            label: "Daftar Dokumen",
            action: () => {
              activeTab = "documents";
              navOpen = true;
            },
          },
          "sep",
          {
            icon: "bx:plus",
            label: "Buat Dokumen",
            href: "/editor",
            badge: "Baru",
          },
          "sep",
          {
            icon: "bx:download",
            label: "Unduh Dokumen",
            disabled: !hasDocs,
            action: () => downloadActive(),
          },
          {
            icon: "bx:x",
            label: "Tutup Dokumen",
            disabled: !hasDocs,
            action: () => closeDocument(),
          },
        ],
      },
      {
        id: "edit",
        label: "Edit",
        items: [
          {
            icon: "bx:undo",
            label: "Undo",
            shortcut: "—",
            disabled: !undoOk,
            action: () => undo(),
          },
          {
            icon: "bx:redo",
            label: "Redo",
            disabled: !redoOk,
            action: () => redo(),
          },
          "sep",
          {
            icon: "bx:trash",
            label: "Hapus Item Terpilih",
            disabled: !hasSel,
            action: () => {
              if (selectedId) removePlacement(selectedId);
            },
          },
          {
            icon: "bx:eraser",
            label: "Hapus Semua Item",
            action: () => {
              snapshot();
              placements = [];
              selectedId = null;
            },
          },
          "sep",
          {
            icon: "bx:pointer",
            label: "Pilih / Geser",
            action: () => {
              activeTool = "select";
            },
          },
        ],
      },
      {
        id: "template",
        label: "Template",
        items: [
          {
            icon: "bx:book",
            label: "Template PDF",
            action: () => {
              forms.template = "open";
            },
          },
          { icon: "bx:folder", label: "Kelola Template", href: "/templates" },
        ],
      },
      {
        id: "metadata",
        label: "Metadata",
        items: [
          {
            icon: "bx:list-ul",
            label: "Buka Panel Metadata",
            action: () => {
              activeTab = "metadata";
              navOpen = true;
            },
          },
          {
            icon: "bx:file",
            label: "Daftar Dokumen",
            action: () => {
              activeTab = "documents";
              navOpen = true;
            },
          },
        ],
      },
      {
        id: "ai",
        label: "AI",
        items: [
          {
            icon: "bx:bot",
            label: "Buka Asisten AI",
            action: () => chat.openChat(),
          },
          "sep",
          {
            icon: "bx:list-ul",
            label: "Ringkas Dokumen",
            disabled: !hasDocs,
            action: () => askAboutDocument("summarize"),
          },
          {
            icon: "bx:check-shield",
            label: "Periksa Dokumen",
            disabled: !hasDocs,
            action: () => askAboutDocument("review"),
          },
          {
            icon: "bx:edit",
            label: "Saran Keterangan",
            disabled: !hasDocs,
            action: () => askAboutDocument("note"),
          },
        ],
      },
    ];
  });

  $effect(() => {
    workspace.active = true;
    workspace.toggleRight = () => (navOpen = !navOpen);
    workspace.sign = openSign;
    return () => {
      workspace.active = false;
    };
  });

  // Keep the navbar right-pane toggle in step with the panel.
  $effect(() => {
    workspace.right = navOpen;
  });

  // Keep the navbar sign button in step with the form.
  $effect(() => {
    workspace.canSign = allowSigning && forms.sign == undefined;
    workspace.signing = loading;
  });

  // Persist the panel layout so it is preserved across visits.
  $effect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      "sign-panes",
      JSON.stringify({ left: pageNavOpen, right: navOpen }),
    );
  });

  async function getDocumentDetails(file: File) {
    const buffer = await file.arrayBuffer();
    isEncrypted = await pdfLib.isEncrypted(buffer);
    if (isEncrypted) return;

    fields = await pdfLib.getAllFormFields(buffer);
    hasSignature = await pdfLib.hasSignature(buffer);
    signatureInfos = await pdfLib.getSignatures(buffer);

    await pdfLib.fillFormFields(buffer, form);
  }

  async function fillFormFields(
    file: File,
    signing = false,
    id?: string,
    useFooter = form.footer,
  ) {
    let buffer: ArrayBuffer = await file.arrayBuffer();

    if (!id) id = activeIndex;

    if (isEncrypted) {
      if (!signing) previewFile = file;
      return file;
    }

    const checkSignature = await pdfLib.hasSignature(buffer);
    if (checkSignature) {
      if (!signing) previewFile = file;
      return file;
    }

    if (useFooter) {
      const base64QR = await generateQRCode({
        data: `${location.origin}/d?id=${id}`,
      });

      buffer = (
        await pdfLib.drawFooter(buffer, {
          imageBase64: saveDocument ? (base64QR as string) : "",
          page: footerScope === "current" ? previewState.page : undefined,
          text: bsre
            ? `Dokumen ini ditandatangani menggunakan sertifikat elektronik yang diterbitkan BSrE - BSSN\n${saveDocument ? "#" + id : ""}`
            : `Dokumen ini ditandatangani menggunakan Aplikasi Tapak Astà\n#${id}`,
        })
      ).buffer as ArrayBuffer;
    }

    const filled = await pdfLib.fillFormFields(buffer, form);

    const filledFile = new File([new Uint8Array(filled)], file.name, {
      type: "application/pdf",
    });
    if (!signing) previewFile = filledFile;
    return filledFile;
  }

  $effect(() => {
    init();
  });
  onMount(async () => {
    // Restore the last panel layout (defaults to no panel open).
    try {
      const saved = JSON.parse(localStorage.getItem("sign-panes") || "{}");
      if (typeof saved.left === "boolean") pageNavOpen = saved.left;
      if (typeof saved.right === "boolean") navOpen = saved.right;
    } catch {
      /* ignore malformed storage */
    }

    let owner = page.url.searchParams.get("owner") || "";
    if (owner) {
      try {
        if (!owner.includes("@")) owner = atob(owner);
      } catch (e) {
        console.error("Failed to decode owner param", e);
      }
    }

    const qEmail = page.url.searchParams.get("email");
    const qNik = page.url.searchParams.get("nik");
    const qNip = page.url.searchParams.get("nip");
    const qNama = page.url.searchParams.get("nama");
    const qPhone = page.url.searchParams.get("phone");
    const qJabatan = page.url.searchParams.get("jabatan");
    const qPangkat = page.url.searchParams.get("pangkat");
    const qInstansi = page.url.searchParams.get("instansi");
    const qNote = page.url.searchParams.get("note");
    const fromHelpdesk = page.url.searchParams.get("template") !== null;
    const hasIdentity = Boolean(qNip || qNik || qNama || qPhone);

    if (qNik && !qEmail) useEmail = false;

    let formattedPhone = "";
    if (qPhone) {
      formattedPhone =
        "62" +
        qPhone
          .replace(/[^0-9]/g, "")
          .replace(/^0+/, "")
          .replace(/^62/, "");
    }

    form = {
      footer: true,
      email:
        qEmail ||
        (fromHelpdesk && hasIdentity
          ? ""
          : owner || localStorage.getItem("email") || ""),
      nik: qNik || qNip || "",
      nip: qNip || "",
      nama: qNama || (owner ? owner.split("@")[0] : ""),
      jabatan: qJabatan || "-",
      pangkat: qPangkat || "-",
      instansi: qInstansi || "-",
      phone: formattedPhone,
      nomor_telepon: formattedPhone,
      keterangan: qNote || "",
      note: qNote || "Tanda Tangan Elektronik",
      tanggal: d().format("DD MMMM YYYY"),
      location: "",
      send_file: false,
      save_document: true,
    };

    const lastShown = localStorage.getItem("tour-sign-last-shown");
    const now = Date.now();
    if (!lastShown || now - Number(lastShown) > 86400000) {
      setTimeout(() => (app.showTour = true), 1000);
    }
  });

  async function fetchFile(url: string, fileName?: string) {
    const file = await fetch(url + "?" + Date.now()).then((res) => res.blob());
    return new File([file], fileName || "default.pdf", { type: file.type });
  }

  async function init() {
    const docId = createId(10);
    const id = data.id || page.url.searchParams.get("id");
    const templateId = page.url.searchParams.get("template");
    isDraft = page.url.searchParams.get("draft") === "true";

    if (id) {
      const ids = id.split(",");
      const chunkIds = Array.from(
        { length: Math.ceil(ids.length / 100) },
        (_, i) => ids.slice(i * 100, i * 100 + 100),
      );
      let isFirst = true;
      await Promise.all(
        chunkIds.map(async (chunkId) => {
          const existing = await getDocument({ id: chunkId });
          if (!existing) return;

          for (const doc of existing) {
            const fileUrl = doc.files?.pop();
            if (!fileUrl) continue;

            const file = await fetchFile(fileUrl, doc.title || "default.pdf");
            const key = doc.id ?? docId;

            placements = ((doc.signatureProperties || []) as any[]).map(
              normalizePlacement,
            );
            documents[key] = file;
            workspace.docName = (doc.title || file.name).replace(/\.pdf$/i, "");

            if (isFirst) {
              activeIndex = key;
              form.email = doc.owner;
              isFirst = false;
            }
          }
        }),
      );
    }
    if (templateId) {
      const existing = await getData({
        table: "templates",
        limit: 1,
        offset: 0,
        where: { id: templateId, status: true },
      });
      if (existing.data.length > 0) initTemplate(existing.data[0]);
    }
  }

  async function initTemplate(item: any) {
    asTemplate = true;
    const docId = createId(10);
    const file = await fetchFile(
      item.file,
      item.name.replace(/\.pdf$/i, "") + ".pdf",
    );
    documents = { [docId]: file };
    workspace.docName = String(item.name || "Template").replace(/\.pdf$/i, "");

    bsre = item.sign_type == "bsre";
    form.note = item.description || "Tanda Tangan Elektronik";
    form.to = item.to || null;
    form.footer = true;
    activeIndex = docId;
    forms.template = undefined;
    saveDocument = form.save_document ?? true;
  }

  const debounceFillFormFields = debounce(() => {
    fillFormFields(documents[activeIndex]);
  }, 500);

  let blobClaimed = false;
  $effect(() => {
    const blobId = page.url.searchParams.get("blob");
    if (!blobId || blobClaimed) return;
    blobClaimed = true;
    void takeSignFile(blobId).then((file) => {
      if (file) files = [...files, file];
    });
  });

  $effect(() => {
    if (files.length > 0) {
      const hadDocuments = Object.keys(documents).length > 0;
      const added = Object.fromEntries(
        files.map((file) => [createId(10), file]),
      );
      // Append the picked files to the existing set rather than replacing it.
      documents = { ...documents, ...added };
      activeIndex = Object.keys(added)[0];
      const first = files[0];
      if (first && !hadDocuments) {
        workspace.docName = first.name.replace(/\.pdf$/i, "");
      }
      files = [];
      saveDocument = form.save_document ?? !!data.user;
    }
  });

  function closeDocument() {
    const closed = activeIndex;
    const keys = Object.keys(documents);

    previewFile = null;
    hasSignature = true;
    isEncrypted = false;
    isDraft = false;
    fields = {};
    selectedId = null;
    placements = [];
    undoStack = [];
    redoStack = [];

    if (!closed || !(closed in documents)) {
      documents = {};
      activeIndex = "";
      return;
    }

    const rest = keys.filter((k) => k !== closed);
    if (rest.length === 0) {
      documents = {};
      activeIndex = "";
      form = {};
      return;
    }

    const next = keys[keys.indexOf(closed) + 1] ?? rest[rest.length - 1];
    documents = Object.fromEntries(rest.map((k) => [k, documents[k]]));
    activeIndex = next;
  }

  function downloadActive() {
    const f = documents[activeIndex];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  let imageInput: HTMLInputElement | null = $state(null);

  function openVisualDialog() {
    visualTab = "draw";
    if (!visualDialog?.open) visualDialog?.showModal();
  }

  function requestAddSignature() {
    handleAddVisual(bsre ? "box" : "draw");
  }

  /** Place a visualisation from the metadata panel onto the page currently open
   *  in the preview. */
  function placePreviewVisual(payload: {
    visual: "qr" | "box";
    imageBase64: string;
    width: number;
    height: number;
  }) {
    const cfg = payload.visual === "qr" ? { width: 100 } : { width: 200 };
    const height = (cfg.width / payload.width) * payload.height;
    const margin = 48;
    const pageSize = previewState.sizes?.[previewState.page - 1] ?? {
      width: 595,
      height: 842,
    };
    setSignature({
      id: createId(6),
      kind: "signature",
      imageBase64: payload.imageBase64,
      page: previewState.page ?? 1,
      tampilan: "VISIBLE",
      originX: Math.max(0, pageSize.width - margin - cfg.width),
      originY: Math.max(0, pageSize.height - margin - height),
      width: cfg.width,
      height,
      location: "",
      reason: "",
    });
  }

  /** The signer identity needed to render a QR/box straight from the toolbar. */
  const profileSet = $derived(
    !!(form.nama && form.nama !== "-") ||
      !!(form.instansi && form.instansi !== "-"),
  );

  let _visualLogo: HTMLImageElement | null = null;
  function loadVisualLogo(): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      if (_visualLogo?.complete) return resolve(_visualLogo);
      const img = new Image();
      img.onload = () => {
        _visualLogo = img;
        resolve(img);
      };
      img.onerror = () => resolve(img);
      img.src = "/favicon.png";
    });
  }

  /** Render a QR/box visual from the current signer identity. */
  async function renderVisualImage(visual: "qr" | "box") {
    const resolveSpecimen = (tpl: string) =>
      tpl
        .split("\n")
        .map((line) => {
          const key = line.trim();
          return key in form ? (form[key] ?? "") : line;
        })
        .join("\n")
        .replace(/^\n+|\n+$/g, "");
    const specimen = resolveSpecimen(
      form.specimen ?? "jabatan\ninstansi\n\nnama",
    );

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    if (visual === "qr") {
      canvas.width = 400;
      canvas.height = 400;
      const blob = (await generateQRCode({ data: specimen }, true)) as Blob;
      const img = await createImageBitmap(blob);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas;
    }

    canvas.width = 640;
    canvas.height = 180;
    ctx.font = "20px Arial";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    const logo = await loadVisualLogo();
    if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, 20, 25, 140, 140);
    ctx.fillStyle = "#000";
    ctx.fillText("Ditandatangani secara elektronik oleh:", 180, 30);
    specimen.split("\n").forEach((line, i) => {
      const y = 60 + i * 30;
      if (y >= canvas.height) return;
      ctx.fillText(line, 180, y);
    });
    return canvas;
  }

  async function addVisualDirect(visual: "qr" | "box") {
    const canvas = await renderVisualImage(visual);
    placePreviewVisual({
      visual,
      imageBase64: canvas
        .toDataURL("image/png")
        .replace("data:image/png;base64,", ""),
      width: canvas.width,
      height: canvas.height,
    });
  }

  /** Toolbar visual buttons. Image opens a file chooser, drawing opens a
   *  drawing-only modal, and QR/box add straight away once the signer identity
   *  is set (otherwise the metadata panel opens so it can be filled in). */
  function handleAddVisual(tab: "image" | "qr" | "box" | "draw") {
    if (tab === "image") {
      imageInput?.click();
      return;
    }
    if (tab === "draw") {
      openVisualDialog();
      return;
    }
    if (profileSet) {
      void addVisualDirect(tab);
    } else {
      activeTab = "metadata";
      navOpen = true;
    }
  }

  /** Place an uploaded image file as a visualisation on the current page. */
  async function handleImageFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    const img = new Image();
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
      img.src = dataUrl;
    });
    if (!img.naturalWidth) return;

    // Re-encode to PNG so the placed placement is always a data:image/png URL.
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")?.drawImage(img, 0, 0);
    const width = 128;
    const height = (width / img.naturalWidth) * img.naturalHeight;
    const margin = 48;
    const pageSize = previewState.sizes?.[previewState.page - 1] ?? {
      width: 595,
      height: 842,
    };
    setSignature({
      id: createId(6),
      kind: "signature",
      imageBase64: canvas
        .toDataURL("image/png")
        .replace("data:image/png;base64,", ""),
      page: previewState.page ?? 1,
      tampilan: "VISIBLE",
      originX: Math.max(0, pageSize.width - margin - width),
      originY: Math.max(0, pageSize.height - margin - height),
      width,
      height,
      location: "",
      reason: "",
    });
  }

  async function verifyActive() {
    const file = documents[activeIndex];
    if (!file) return;
    try {
      const blobId = await stashSignFile(file);
      goto(`/verify?blob=${blobId}&fileName=${encodeURIComponent(file.name)}`);
    } catch (err) {
      console.error("[verify] handoff failed", err);
      app.showToast("error", "Gagal membuka dokumen untuk verifikasi.");
    }
  }

  // ── AI menu ──────────────────────────────────────────────────────
  /**
   * What each AI menu entry asks for. The document's text is handed over as
   * context rather than pasted into the question, so the transcript shows the
   * request and not twenty thousand characters of contract.
   */
  const AI_PROMPTS = {
    summarize:
      "Ringkas dokumen yang sedang saya buka. Sebutkan jenis dokumennya, pihak yang terlibat, dan hal-hal penting yang perlu saya perhatikan sebelum menandatanganinya.",
    review:
      "Periksa dokumen yang sedang saya buka. Tandai hal yang berisiko atau tidak lazim — klausul yang merugikan, bagian yang kosong, tanggal atau nominal yang tidak konsisten — dan jelaskan singkat mengapa.",
    note: "Berdasarkan dokumen yang sedang saya buka, usulkan satu kalimat pendek untuk kolom keterangan tanda tangan. Cukup satu kalimat, tanpa penjelasan tambahan.",
  } as const;

  /**
   * Opens the AI assistant with a question about the active document.
   *
   * The text is read here rather than server-side because the file only ever
   * exists in the browser. A document with no text layer (a scan) is reported
   * as such instead of being sent as an empty context, which would have the
   * model invent a document to talk about.
   */
  async function askAboutDocument(kind: keyof typeof AI_PROMPTS) {
    const file = documents[activeIndex];
    if (!file) {
      chat.openChat(AI_PROMPTS[kind]);
      return;
    }
    try {
      const text = await pdfLib.extractText(await file.arrayBuffer());
      chat.openChat(
        AI_PROMPTS[kind],
        text ||
          "(Dokumen ini tidak memiliki lapisan teks — kemungkinan hasil pindai, sehingga isinya tidak dapat dibaca.)",
      );
    } catch (err) {
      console.error("[sign] AI document read failed", err);
      app.showToast("error", "Gagal membaca teks dokumen.");
    }
  }

  /** Apply the footer to nothing, the active page only, or every page. */
  function applyFooterScope(mode: "none" | "current" | "all") {
    if (mode === "none") {
      form.footer = false;
    } else {
      form.footer = true;
      footerScope = mode;
    }
    if (documents[activeIndex]) debounceFillFormFields();
  }

  /** A throwaway document so the tour can demonstrate signing with no upload. */
  let tourDemoFile: File | null = null;

  async function createDemoDocument(): Promise<File> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    page.drawText("Contoh Dokumen", {
      x: 40,
      y: page.getHeight() - 60,
      size: 18,
    });
    const bytes = await pdf.save();
    // Copy into a fresh `Uint8Array<ArrayBuffer>`: pdf-lib hands back a
    // `Uint8Array<ArrayBufferLike>`, which the `File` constructor rejects.
    return new File(
      [new Uint8Array(bytes)],
      "contoh-dokumen.pdf",
      { type: "application/pdf" },
    );
  }

  /** Drop the throwaway document created for the tour, if any. */
  function removeTourDemo() {
    const demo = tourDemoFile;
    if (!demo) return;
    tourDemoFile = null;
    files = files.filter((f) => f !== demo);
    const key = Object.keys(documents).find((k) => documents[k] === demo);
    if (key) {
      const { [key]: _removed, ...rest } = documents;
      documents = rest;
      if (activeIndex === key) activeIndex = Object.keys(rest)[0] ?? "";
    }
  }

  /**
   * Tour helper: guarantee a document, switch to TTE mode, then open the sign
   * dialog so its Passphrase field can be highlighted.
   */
  async function openSignForTour() {
    bsre = true;
    if (Object.keys(documents).length === 0) {
      const demo = await createDemoDocument();
      tourDemoFile = demo;
      files = [...files, demo];
      await tick();
    }
    if (!forms.sign) await openSign();
  }

  async function openSign() {
    signResults = [];
    timer = 0;
    elapsedTime = 0;
    forms.sign = {
      ...form,
      passphrase: "",
      signatureProperties: placements,
      documents,
      completed: [],
    } as any;
    const vaultEmail = useEmail ? form.email : form.nik;
    vaultError = "";
    await refreshVaultState(vaultEmail);
    setTimeout(() => {
      //@ts-ignore - window.turnstile is not typed in TS
      turnstileId = window.turnstile.render("#turnstile-container", {
        sitekey: env.PUBLIC_TURNSTILE_KEY,
        callback: async function (token: string) {
          turnstileSuccess = false;
          const verify = await verifyTurnstile({ __token: token });
          if (verify.success) turnstileSuccess = true;
        },
      });
    }, 100);
  }

  $effect(() => {
    if (!documents[activeIndex]) return;
    getDocumentDetails(documents[activeIndex]);
    const file = documents[activeIndex];
    if (file && !asTemplate)
      workspace.docName = file.name.replace(/\.pdf$/i, "");
    debounceFillFormFields();
  });

  $effect(() => {
    // Swap the visualisation set when the signer identity changes.
    const key = String((useEmail ? form.email : form.nik) ?? "");
    if (key === signerKey) return;
    if (signerKey) {
      placementsByEmail[signerKey] = $state.snapshot(
        placements,
      ) as PlacementType[];
    }
    const stored = placementsByEmail[key];
    placements = stored ? ($state.snapshot(stored) as PlacementType[]) : [];
    signerKey = key;
  });

  $effect(() => {
    if (hasSignature) form.footer = false;
  });

  $effect(() => {
    if (!bsre) form.footer = true;
  });

  $effect(() => {
    // Redraw when the footer is toggled or its scope changes.
    form.footer;
    footerScope;
    if (documents[activeIndex]) debounceFillFormFields();
  });
</script>

<svelte:window
  onclick={() => (zoomMenuOpen = false)}
  onkeydown={(e) => {
    if (e.key === "Escape") {
      zoomMenuOpen = false;
      if (armed) activeTool = "select";
    }
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      selectedId &&
      !isEditableTarget(e.target)
    ) {
      e.preventDefault();
      removePlacement(selectedId);
    }
  }}
/>

<div
  class="sign-page h-[calc(100dvh-3rem)] flex flex-col overflow-hidden"
>
  <!-- ============ TOPBAR ============ -->
  <div
    class="flex-none relative z-100 bg-base-100 border-b border-base-300 select-none [&_iconify-icon]:text-[17px] [&_iconify-icon]:pointer-events-none [&_.btn]:font-normal"
  >
    <!-- On small screens the navbar can't host the menubar, so keep it here. -->
    <div class="lg:hidden px-2 pt-1">
      <WorkspaceMenuBar />
    </div>

    {#snippet signerEmail()}
      <div class="flex items-center gap-1 min-w-0">
        <button
          type="button"
          class="btn btn-sm btn-ghost hover:bg-base-300 btn-square relative shrink-0 lg:hidden!"
          title="Tampilkan email penandatangan"
          aria-label="Tampilkan email penandatangan"
          aria-pressed={emailOpen}
          onclick={() => (emailOpen = !emailOpen)}
        >
          <iconify-icon icon="bx:envelope"></iconify-icon>
    {#if status === "ISSUE"}
      <iconify-icon
        icon="bx:check"
        class="absolute -top-0.5 -right-0.5 text-success text-[10px]"
      ></iconify-icon>
    {/if}
        </button>
        <div
          id="tour-email"
          class="min-w-0 flex items-center max-lg:absolute max-lg:top-full max-lg:left-1.5 max-lg:right-1.5 max-lg:mt-1.5 max-lg:p-2 max-lg:bg-base-100 max-lg:border max-lg:border-base-300 max-lg:rounded-lg max-lg:shadow-xl max-lg:z-60 max-lg:[&_.tooltip]:w-full max-lg:[&_.input]:w-full! max-lg:[&_.input]:max-w-none! max-lg:[&_.input]:flex-auto {emailOpen ||
          emailAlwaysVisible
            ? ''
            : 'max-lg:hidden'}"
        >
          <SignerEmail
            bind:form
            bind:status
            bind:loading={emailLoading}
            bind:useEmail
            placement="bottom"
            verify={bsre}
          />
        </div>
      </div>
    {/snippet}

    <Toolbar
      {activeTool}
      onTool={(t) => (activeTool = t)}
      onAddSignature={requestAddSignature}
      onAddVisual={handleAddVisual}
      {visualMode}
      {hasDocuments}
      {hasSignature}
      {signatureInfos}
      onVerify={verifyActive}
      pageNavOpen={pageNavOpen}
      rightPaneOpen={navOpen}
      onTogglePageNav={() => (pageNavOpen = !pageNavOpen)}
      onToggleRight={() => (navOpen = !navOpen)}
      onUpload={() => fileInput?.click()}
      footerMode={footerMode}
      onFooterScope={applyFooterScope}
      {signerEmail}
      onUndo={undo}
      onRedo={redo}
      {canUndo}
      {canRedo}
      hasSelection={!!selectedId}
      onDeleteSelected={() => selectedId && removePlacement(selectedId)}
      onClearAll={() => {
        snapshot();
        placements = [];
        selectedId = null;
      }}
      onDownload={downloadActive}
    />
  </div>

  <!-- ============ BODY ============ -->
  <div class="flex-1 min-h-0 flex bg-base-200 max-lg:overflow-hidden">
    <PageNav
      controller={previewCtl}
      preview={previewState}
      open={pageNavOpen}
      placements={placements}
      selected={placements.find((p) => p.id === selectedId) ?? null}
      onEdit={() => snapshot()}
      bind:tab={pageNavTab}
    />

    <main
      class="flex-1 min-w-0 min-h-0 order-1 flex flex-col relative p-0 gap-2 max-lg:min-w-72"
    >
      <button
        type="button"
        class="absolute top-2 left-2 z-20 w-7.5 h-7.5 inline-flex items-center justify-center border rounded-full shadow cursor-pointer {navOpen
          ? 'bg-primary border-primary text-primary-content'
          : 'bg-base-100 border-base-300 text-base-content hover:bg-base-200'}"
        title="Panel dokumen & metadata"
        aria-label="Panel dokumen & metadata"
        aria-pressed={navOpen}
        onclick={() => (navOpen = !navOpen)}
      >
        <iconify-icon icon="bx:info-circle"></iconify-icon>
        {#if Object.keys(documents).length > 0}
          <span class="badge badge-xs badge-primary absolute -top-1 -right-1 leading-none">{Object.keys(documents).length}</span>
        {/if}
      </button>
      <button
        type="button"
        class="absolute top-2 right-2 z-20 w-7.5 h-7.5 inline-flex items-center justify-center border rounded-full shadow cursor-pointer {pageNavOpen
          ? 'bg-primary border-primary text-primary-content'
          : 'bg-base-100 border-base-300 text-base-content hover:bg-base-200'}"
        title="Panel navigasi halaman"
        aria-label="Panel navigasi halaman"
        aria-pressed={pageNavOpen}
        onclick={() => (pageNavOpen = !pageNavOpen)}
      >
        <iconify-icon icon="bx:dock-right"></iconify-icon>
      </button>

      {#if hasDocuments}
      <div
        class="absolute top-2 right-12 z-10 rounded-md bg-neutral/85 px-3 py-1.5 text-xs leading-none text-neutral-content pointer-events-none select-none tabular-nums transition-opacity duration-300 {pageOverlayVisible
          ? 'opacity-100'
          : 'opacity-0'}"
      >
        Page {previewState.page} of {previewState.pageCount}
      </div>
      <div
        class="absolute left-1/2 top-2 lg:top-auto lg:bottom-4 -translate-x-1/2 z-20 flex items-center gap-0.5 h-8 px-2 bg-base-100 border border-base-300 rounded-full shadow-lg"
      >
        <input
          class="w-48 h-6 px-2.5 border-0 rounded-full bg-transparent text-xs text-center text-base-content hover:bg-base-200 focus:outline-none focus:bg-base-200 max-lg:hidden"
          type="text"
          placeholder="Tanpa Judul"
          aria-label="Nama dokumen"
          spellcheck="false"
          bind:value={workspace.docName}
        />
        <span
          class="w-px h-4 flex-none bg-base-300 hidden! lg:block!"
          aria-hidden="true"
        ></span>
        <div
          class="relative inline-flex items-center flex-none h-6.5 bg-transparent"
        >
          <button
            type="button"
            class="w-5 h-6 inline-flex items-center justify-center bg-transparent border-0 rounded text-[13px] leading-none p-0 cursor-pointer text-base-content hover:bg-base-200 disabled:opacity-35 disabled:cursor-default"
            title="Perkecil"
            aria-label="Perkecil"
            disabled={previewState.zoom <= 0.25}
            onclick={() => previewCtl?.zoomOut()}>−</button
          >
          <button
            type="button"
            class="min-w-11 h-6 inline-flex items-center justify-center gap-0.5 px-1 bg-transparent border-0 rounded text-xs tabular-nums whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200"
            title="Zoom"
            aria-label="Zoom"
            aria-haspopup="menu"
            aria-expanded={zoomMenuOpen}
            onclick={(e) => {
              e.stopPropagation();
              zoomMenuOpen = !zoomMenuOpen;
            }}
          >
            {Math.round(previewState.zoom * 100)}%
            <span class="text-[10px] text-base-content/60" aria-hidden="true"
              >▾</span
            >
          </button>
          <button
            type="button"
            class="w-5 h-6 inline-flex items-center justify-center bg-transparent border-0 rounded text-[13px] leading-none p-0 cursor-pointer text-base-content hover:bg-base-200 disabled:opacity-35 disabled:cursor-default"
            title="Perbesar"
            aria-label="Perbesar"
            disabled={previewState.zoom >= 4}
            onclick={() => previewCtl?.zoomIn()}>+</button
          >

          {#if zoomMenuOpen}
            <ul
              class="absolute top-full left-0 mt-1.5 min-w-33 p-1 bg-base-100 border border-base-300 rounded-lg shadow-xl z-40"
              role="menu"
            >
              <li>
                <button
                  type="button"
                  class="w-full flex items-center gap-2 px-2.5 py-1.75 bg-transparent border-0 rounded text-[13px] leading-4.5 text-left whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200 {Math.abs(
                    previewState.zoom - 1,
                  ) < 0.001
                    ? 'bg-primary/10 text-primary'
                    : ''}"
                  onclick={() => {
                    previewCtl?.setZoom(1);
                    zoomMenuOpen = false;
                  }}
                >
                  Sesuai Jendela
                  {#if Math.abs(previewState.zoom - 1) < 0.001}
                    <span class="ml-auto text-xs pl-4">✓</span>
                  {/if}
                </button>
              </li>
              {#each ZOOM_PRESETS as preset (preset)}
                <li>
                  <button
                    type="button"
                    class="w-full flex items-center gap-2 px-2.5 py-1.75 bg-transparent border-0 rounded text-[13px] leading-4.5 text-left whitespace-nowrap cursor-pointer text-base-content hover:bg-base-200 {Math.abs(
                      previewState.zoom - preset,
                    ) < 0.001
                      ? 'bg-primary/10 text-primary'
                      : ''}"
                    onclick={() => {
                      previewCtl?.setZoom(preset);
                      zoomMenuOpen = false;
                    }}
                  >
                    {Math.round(preset * 100)}%
                    {#if Math.abs(previewState.zoom - preset) < 0.001}
                      <span class="ml-auto text-xs pl-4">✓</span>
                    {/if}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        <span class="w-px h-4 flex-none bg-base-300" aria-hidden="true"
        ></span>
        <div
          class="relative inline-flex items-center flex-none h-6.5 bg-transparent"
        >
          <button
            type="button"
            class="w-5 h-6 inline-flex items-center justify-center bg-transparent border-0 rounded text-[13px] leading-none p-0 cursor-pointer text-base-content hover:bg-base-200 disabled:opacity-35 disabled:cursor-default"
            title="Halaman sebelumnya"
            aria-label="Halaman sebelumnya"
            disabled={previewState.page <= 1}
            onclick={() => previewCtl?.changePage(-1)}
          >
            <iconify-icon icon="bx:chevron-left"></iconify-icon>
          </button>
          <span
            class="min-w-11 h-6 inline-flex items-center justify-center gap-0.5 px-1 bg-transparent border-0 rounded text-xs tabular-nums whitespace-nowrap text-base-content"
          >
            <input
              class="w-5 p-0 bg-transparent border-0 text-inherit text-center tabular-nums focus:outline-none"
              type="text"
              inputmode="numeric"
              aria-label="Nomor halaman"
              bind:value={pageDraft}
              onkeydown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPage();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              onblur={commitPage}
            />
            <span class="text-[10px] text-base-content/60"
              >/ {previewState.pageCount}</span
            >
          </span>
          <button
            type="button"
            class="w-5 h-6 inline-flex items-center justify-center bg-transparent border-0 rounded text-[13px] leading-none p-0 cursor-pointer text-base-content hover:bg-base-200 disabled:opacity-35 disabled:cursor-default"
            title="Halaman berikutnya"
            aria-label="Halaman berikutnya"
            disabled={previewState.pageCount === 0 ||
              previewState.page >= previewState.pageCount}
            onclick={() => previewCtl?.changePage(1)}
          >
            <iconify-icon icon="bx:chevron-right"></iconify-icon>
          </button>
        </div>
        <span class="w-px h-4 flex-none bg-base-300" aria-hidden="true"
        ></span>
        <button
          type="button"
          class="h-6 inline-flex items-center gap-1 px-2 flex-none border-0 rounded bg-transparent text-[13px] text-base-content cursor-pointer hover:bg-base-200 {previewCtl?.isSpread?.()
            ? 'bg-primary/10 text-primary'
            : ''}"
          title={previewCtl?.isSpread?.()
            ? "Tampilkan satu halaman"
            : "Tampilkan dua halaman berdampingan"}
          aria-label="Tampilan berdampingan"
          aria-pressed={previewCtl?.isSpread?.()}
          onclick={() => previewCtl?.toggleSpread()}
        >
          <iconify-icon
            icon={previewCtl?.isSpread?.() ? "bx:grid-vertical" : "bx:grid-horizontal"}
          ></iconify-icon>
          <span class="hidden lg:inline">{previewCtl?.isSpread?.() ? "2-up" : "1-up"}</span>
        </button>
        <span class="w-px h-4 flex-none bg-base-300" aria-hidden="true"
        ></span>
        <button
          type="button"
          class="h-6 inline-flex items-center gap-1 px-2 flex-none border-0 rounded bg-transparent text-[13px] text-base-content cursor-pointer hover:bg-base-200"
          title="Unduh dokumen"
          aria-label="Unduh dokumen"
          onclick={() => downloadActive()}
        >
          <iconify-icon icon="bx:download"></iconify-icon>
          <span class="hidden lg:inline">Unduh</span>
        </button>
      </div>
      {/if}

      {#if hasDocuments && isEncrypted}
        <div class="flex flex-col gap-1.5 flex-none px-2">
          <div class="alert alert-error py-1 px-4 flex-none">
            <iconify-icon icon="bx:lock-alt" class="text-xl"></iconify-icon>
            <span>
              <strong>Dokumen Diproteksi:</strong> Dokumen ini dilindungi kata
              sandi dan tidak dapat ditandatangani. Hapus proteksi terlebih
              dahulu.
            </span>
          </div>
        </div>
      {:else if hasDocuments && isDraft}
        <div class="flex flex-col gap-1.5 flex-none px-2">
          <div class="alert alert-info py-1 px-4 flex-none">
            <iconify-icon icon="bx:error" class="text-xl"></iconify-icon>
            <span>
              <strong>Peringatan:</strong> Dokumen masih dalam bentuk draft.
            </span>
          </div>
        </div>
      {/if}

      {#if hasDocuments}
        <div class="flex-1 min-h-0 relative {armed ? 'cursor-crosshair' : ''}">
          <Preview
            file={previewFile}
            {hasSignature}
            bare
            bind:controller={previewCtl}
            onstate={(s) => {
              previewState.zoom = s.zoom;
              previewState.page = s.page;
              previewState.pageCount = s.pageCount;
              previewState.sizes = s.sizes;
              previewState.layout = s.layout;
            }}
            controls={false}
            onclose={closeDocument}
          >
            {#snippet children(scale, pageSizes, gutter)}
              {@const gapPts = gutter / scale}
              {@const layout = previewState.layout}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                bind:this={overlayEl}
                class="absolute inset-0"
                onclick={(e) =>
                  handleOverlayClick(e, scale, pageSizes, gapPts, layout)}
                ondragover={(e) => {
                  if (
                    !e.dataTransfer?.types.includes("application/x-asta-visual")
                  )
                    return;
                  e.preventDefault();
                  updateDragPreview(e, scale, layout, pageSizes);
                }}
                ondrop={(e) => handleOverlayDrop(e, scale, pageSizes, gapPts, layout)}
              >
                {#if dragPreview}
                  <img
                    src={dragPreview.src}
                    alt=""
                    class="pointer-events-none absolute z-1 rounded-sm object-fill opacity-90 outline-2 outline-dashed outline-primary"
                    style="left: {(dragPreview.x + (layout?.boxes?.[previewState.page - 1] ? layout.boxes[previewState.page - 1].left / (layout.boxes[previewState.page - 1].scale ?? scale) : 0)) * (layout?.boxes?.[previewState.page - 1]?.scale ?? scale)}px; top: {(dragPreview.y + (layout?.boxes?.[previewState.page - 1] ? layout.boxes[previewState.page - 1].top / (layout.boxes[previewState.page - 1].scale ?? scale) : 0)) * (layout?.boxes?.[previewState.page - 1]?.scale ?? scale)}px; width: {dragPreview.width * (layout?.boxes?.[previewState.page - 1]?.scale ?? scale)}px; height: {dragPreview.height * (layout?.boxes?.[previewState.page - 1]?.scale ?? scale)}px;"
                  />
                {/if}
                {#each placements as pl (pl.id)}
                  {@const box = layout?.boxes?.[pl.page - 1]}
                  {@const pScale = box?.scale ?? scale}
                  <Dragresize
                    x={(box ? box.left / pScale : 0) + pl.originX}
                    y={(box ? box.top / pScale : 0) + pl.originY}
                    width={pl.width}
                    height={pl.height}
                    scale={pScale}
                    selected={selectedId === pl.id}
                    resizable={(pl.kind ?? "signature") !== "checkbox"}
                    onselect={() => {
                      selectedId = pl.id;
                      snapshot();
                    }}
                    onchange={(e) => {
                      let acc = 0;
                      for (let i = 0; i < pageSizes.length; i++) {
                        const h = pageSizes[i].height;
                        if (e.y < acc + h) {
                          pl.page = i + 1;
                          pl.originY = e.y - acc;
                          break;
                        }
                        acc += h + gapPts;
                      }
                      const b = layout?.boxes?.[pl.page - 1];
                      const s2 = b?.scale ?? scale;
                      if (b) {
                        pl.originX = e.x - b.left / s2;
                        pl.originY = e.y - b.top / s2;
                      } else {
                        pl.originX = e.x;
                        pl.originY = e.y - acc;
                      }
                      pl.width = e.width;
                      pl.height = e.height;
                    }}
                  >
                    <button
                      type="button"
                      class="absolute -top-4.5 left-1/2 -translate-x-1/2 w-4.5 h-4.5 inline-flex items-center justify-center border-0 rounded-full bg-error text-error-content text-[11px] leading-none z-2 cursor-pointer [&_iconify-icon]:text-[12px]"
                      aria-label="Hapus item"
                      onclick={() => removePlacement(pl.id)}
                    >
                      <iconify-icon icon="bx:x"></iconify-icon>
                    </button>

                    {#if (pl.kind ?? "signature") === "signature"}
                      {@const sig = pl as SignaturePlacement}
                      <img
                        id={`sign-${sig.id}`}
                        src={`data:image/png;base64,${sig.imageBase64}`}
                        class="w-full h-full pointer-events-none object-fill"
                        alt="Visualisasi"
                      />
                    {:else if pl.kind === "checkbox"}
                      {@const cb = pl as CheckboxPlacement}
                      <button
                        type="button"
                        class="w-full h-full flex items-center justify-center border border-base-content rounded-sm bg-base-100 text-base-content text-sm leading-none cursor-pointer {cb.checked
                          ? `after:content-['✓'] after:font-bold`
                          : ''}"
                        aria-label="Centang"
                        onclick={() => {
                          snapshot();
                          cb.checked = !cb.checked;
                        }}
                      ></button>
                    {:else}
                      {@const tp = pl as TextPlacement}
                      <input
                        id={`sign-${tp.id}`}
                        class="w-full h-full flex items-center px-0.5 border border-dashed border-transparent rounded-sm bg-primary/5 text-[#111827] font-[Helvetica,Arial,sans-serif] leading-[1.1] overflow-hidden cursor-text outline-none whitespace-nowrap hover:border-primary hover:bg-primary/10 focus:border-primary focus:bg-primary/10"
                        type="text"
                        style="font-size:{(tp.size ?? 11) * scale}px"
                        bind:value={tp.text}
                        onfocus={() => snapshot()}
                        aria-label={tp.kind === "date" ? "Tanggal" : "Teks"}
                      />
                    {/if}
                  </Dragresize>
                {/each}
              </div>
            {/snippet}
          </Preview>
        </div>
      {/if}

      <div class="flex-1 min-h-0 relative p-2 {hasDocuments ? 'hidden' : ''}">
        <Upload
          bind:fileInput
          bind:files
          allowDocx
          title="Pilih File PDF atau DOCX"
        />
      </div>
    </main>

    <input
      type="file"
      accept="image/*"
      class="hidden"
      bind:this={imageInput}
      onchange={handleImageFile}
    />

    <dialog class="modal" bind:this={visualDialog}>
      <div class="modal-box w-11/12 max-w-3xl">
        <button
          type="button"
          class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          aria-label="Tutup"
          onclick={() => visualDialog?.close()}
        >
          ✕
        </button>
        <h3 class="text-lg font-bold">Gambar Tanda Tangan</h3>
        <Signature
          {form}
          setSignature={(p) => {
            setSignature(p);
            visualDialog?.close();
          }}
          {hasSignature}
          bind:visual={visualTab}
          availableVisual={["draw"]}
        />
      </div>
      <button
        type="button"
        class="modal-backdrop"
        aria-label="Tutup"
        onclick={() => visualDialog?.close()}
      ></button>
    </dialog>

    <aside
      class="w-90 flex-none order-0 flex flex-col min-h-0 bg-base-100 border-r border-base-300 {navOpen
        ? ''
        : 'hidden'}"
    >
      <div class="tabs tabs-border tabs-sm m-2">
        <button
          type="button"
          class={activeTab === "documents" ? "tab tab-active gap-1" : "tab gap-1"}
          aria-pressed={activeTab === "documents"}
          onclick={() => (activeTab = "documents")}
        >
          <iconify-icon icon="bx:file"></iconify-icon>
          Dokumen
          <span class="badge badge-sm">{Object.keys(documents).length}</span>
        </button>
        <button
          type="button"
          class={activeTab === "metadata" ? "tab tab-active gap-1" : "tab gap-1"}
          aria-pressed={activeTab === "metadata"}
          onclick={() => (activeTab = "metadata")}
        >
          <iconify-icon icon="bx:info-circle"></iconify-icon>
          Metadata
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {#if activeTab === "documents"}
          <Documents bind:documents bind:activeIndex {fileInput} />
        {:else}
          <Metadata
            {data}
            {bsre}
            bind:status
            bind:form
            bind:useEmail
            {fields}
            {hasSignature}
            {hasDocuments}
            bind:signatures={placements}
            {setSignature}
            onAddVisual={placePreviewVisual}
            onSign={openSign}
          >
            <Visualizer bind:signatures={placements} {selectedId} onSelect={(id) => selectForProps(id)} onDelete={removePlacement} />
          </Metadata>
        {/if}
      </div>
    </aside>
  </div>

  <div class="fab right-24">
    <button
      type="button"
      id="tour-sign-button"
      class="btn btn-secondary tooltip rounded-full font-normal {allowSigning &&
      forms.sign == undefined
        ? 'animate-bounce'
        : 'bg-base-300'}"
      aria-label="Tanda Tangan Dokumen"
      data-tip="Tanda Tangan"
      disabled={!(allowSigning && forms.sign == undefined)}
      onclick={openSign}
    >
      {#if loading}
        <span class="loading loading-spinner"></span>
      {:else}
        <iconify-icon icon="bx:pen" class="text-lg"></iconify-icon>
      {/if}
      Tanda Tangan
    </button>
  </div>
</div>

{#if app.showTour}
  <Tour
    steps={tourSteps}
    onComplete={() => {
      forms.sign = undefined;
      removeTourDemo();
      app.showTour = false;
      localStorage.setItem("tour-sign-last-shown", Date.now().toString());
    }}
    onSkip={() => {
      forms.sign = undefined;
      removeTourDemo();
      app.showTour = false;
      localStorage.setItem("tour-sign-last-shown", Date.now().toString());
    }}
  />
{/if}

<Modal
  bind:data={forms.sign}
  title={`Tanda Tangan Dokumen (${Object.keys(forms.sign?.documents || {}).length})`}
  size="lg"
  closeable={!forms.sign?.completed?.length}
>
  {#snippet children(item)}
    {@const total = Object.keys(item.documents).length}
    {@const completed = item.completed.length}
    <form
      bind:this={signForm}
      class="flex flex-col gap-4 px-1"
      autocomplete="off"
      onsubmit={async (e) => {
        e.preventDefault();
        if (!turnstileSuccess) {
          forms.sign!.__error = "Please verify the captcha";
          return;
        }
        forms.sign!.__error = "";
        elapsedTime = 0;

        startTime = performance.now() - timer;

        let interval = setInterval(() => {
          timer = Math.floor(performance.now() - startTime);
        }, 1000);

        loading = true;
        let results: any[] = [];
        const docsx = Object.entries(item.documents);
        try {
          let abortSigning = false;

          let index = -1;
          results = await promisePool(
            docsx,
            Number(env.PUBLIC_MAX_CONCURRENT_REQUESTS) || 1,
            async ([id, file]) => {
              index++;
              await new Promise((resolve) =>
                setTimeout(
                  resolve,
                  (500 * index) % Number(env.PUBLIC_MAX_CONCURRENT_REQUESTS) || 1,
                ),
              );
              if (abortSigning) return null;

              if (item.completed.includes(id)) return null;

              let attempt = 0;

              while (attempt < (Number(env.PUBLIC_MAX_RETRIES) || 1)) {
                if (abortSigning) return null;

                attempt++;

                const fileSign = await fillFormFields(file, true, id, item.footer);

                // Signature visuals: with more than one (or in Manual mode) the
                // visuals are burned into the PDF and BSrE applies an invisible
                // signature; a single visual is left for BSrE to place.
                const signatureProps = item.signatureProperties.filter(
                  (p: any) => (p.kind ?? "signature") === "signature",
                );
                const burnSignatures = !bsre || signatureProps.length > 1;
                const toDraw = burnSignatures
                  ? item.signatureProperties
                  : item.signatureProperties.filter(
                      (p: any) => (p.kind ?? "signature") !== "signature",
                    );

                let fileBase64 = await fileToBase64(fileSign);
                if (toDraw.length > 0) {
                  const drawn = (
                    await pdfLib.drawPlacements(
                      await fileSign.arrayBuffer(),
                      toDraw,
                    )
                  ).buffer as ArrayBuffer;

                  fileBase64 = await fileToBase64(
                    new Blob([drawn], { type: "application/pdf" }),
                  );
                }

                const fileName = asTemplate
                  ? file.name.replace(/\.pdf$/i, "") +
                    "_" +
                    String(item.nama).replace(/\W/g, "_") +
                    ".pdf"
                  : file.name.replace(/\.pdf$/i, "") + ".pdf";

                // When the signature is burned into the PDF, the remote request
                // carries no signature properties so BSrE signs invisibly.
                const sigForServer = bsre
                  ? burnSignatures
                    ? []
                    : signatureProps
                  : item.signatureProperties;

                const props = {
                  id,
                  __manual: !bsre,
                  __asDraft: asDraft,
                  __saveDocument: saveDocument,
                  to: item.to,
                  ...(useEmail ? { email: item.email } : { nik: item.nik }),
                  ...(item.owner ? { owner: item.owner } : {}),
                  ...(item.nama ? { nama: item.nama } : {}),
                  jabatan: item.jabatan || "-",
                  pangkat: item.pangkat || "-",
                  instansi: item.instansi || "-",
                  passphrase: item.passphrase,
                  note: item.note || "-",
                  ...(item.nomor_telepon
                    ? { nomor_telepon: item.nomor_telepon }
                    : {}),
                  location: item.location || "-",
                  signatureProperties: sigForServer,
                  fileName,
                  fileBase64,
                  ...(form.secret && form.password
                    ? { passcode: form.password }
                    : {}),
                };
                const signing = await signDocument(props);

                if (signing?.retry) {
                  forms.sign!.__error = signing.message;
                  continue;
                }
                if (signing?.error) {
                  forms.sign!.__error = signing.error;
                  abortSigning = true;
                  return null;
                }

                if (signing?.file?.at(0)) {
                  forms.sign!.__error = "";
                  item.completed.push(id);
                  signResults.push({
                    id,
                    fileName,
                    base64: signing.file.at(0),
                    blob: base64ToBlob(signing.file[0]),
                  });
                  return signing;
                }
              }
            },
          );
        } catch (err: any) {
          if (err?.body) {
            const { message, issues } = err.body;
            forms.sign!.__error = `[${message}] ${issues}`;
          }
          console.error(err);
        } finally {
          timer = Math.floor(performance.now() - startTime);
          elapsedTime = timer;
          clearInterval(interval);
          loading = false;
          asTemplate = false;
          //@ts-ignore - window.turnstile is not typed in TS
          window.turnstile.reset(turnstileId);
          turnstileSuccess = false;
        }

        if (signResults.length > 0) {
          const notifyText = signResults
            .map((r, i) => {
              if (!saveDocument) {
                return `${i + 1}. *${r?.fileName}*\n`;
              }
              if (isDraft) {
                return `${i + 1}. *${r?.fileName}*\n${location.origin}/sign-v2?draft=true&id=${r?.id}`;
              }
              return `${i + 1}. *${r?.fileName}*\n${location.origin}/d?id=${r?.id}&owner=${btoa(item.email)}`;
            })
            .join("\n\n");

          try {
            await sendMessage({
              recipient: item.nomor_telepon,
              payload: {
                text: asDraft
                  ? `*Dokumen berhasil disimpan sebagai draft*\n\n${notifyText}\n\n\nTerima kasih telah menggunakan layanan *Tapak Astà*.\nBeri penilaian penggunaan layanan ini: ${location.origin}/survey?email=${btoa(item.email || "")}`
                  : `*Dokumen berhasil ditandatangani*\n\n${notifyText}\n\n\nTerima kasih telah menggunakan layanan *Tapak Astà*.\nBeri penilaian penggunaan layanan ini: ${location.origin}/survey?email=${btoa(item.email || "")}`,
              },
            });
            if (asDraft) return;
            if (item.send_file !== false) {
              for (const r of signResults) {
                const payload = {
                  document: { base64: r.base64 },
                  mimetype: "application/pdf",
                  fileName: "signed_" + r.fileName,
                };

                await sendMessage({
                  recipient: item.nomor_telepon,
                  payload,
                });
              }
            }
          } catch {}
        }
      }}
    >
      <ul
        class=" w-full min-h-30 max-h-100 overflow-y-auto p-0 list-decimal pl-12"
      >
        {#each Object.entries(item.documents) as [id, file] (id)}
          {@const result = signResults.find((r) => r.id === id)}
          <li>
            <div
              class="flex justify-between w-full btn btn-sm btn-ghost hover:bg-base-300 gap-1 p-1"
            >
              <div class="text-sm text-base-content/80 truncate mr-auto">
                {file.name}
              </div>

              <span class="badge badge-sm badge-secondary text-nowrap">
                {(file.size / 1024).toFixed(2)} KB
                {#if result?.blob}
                  &rarr;
                  {(result.blob.size / 1024).toFixed(2)} KB
                {/if}
              </span>
              {#if result?.blob}
                <button
                  type="button"
                  class="badge badge-sm badge-info tooltip tooltip-left cursor-pointer"
                  data-tip="Verifikasi"
                  aria-label="Verifikasi"
                  onclick={async () => {
                    if (!result?.blob) return;
                    const tab = window.open("", "_blank");
                    try {
                      const signed = new File([result.blob], file.name, {
                        type: "application/pdf",
                      });
                      const blobId = await stashSignFile(signed);
                      const url = `/verify?blob=${blobId}&fileName=${encodeURIComponent(file.name)}`;
                      if (tab && !tab.closed) tab.location.href = url;
                      else window.open(url, "_blank", "noopener");
                    } catch (err) {
                      console.error("[verify] handoff failed", err);
                      tab?.close();
                      app.showToast(
                        "error",
                        "Gagal membuka dokumen untuk verifikasi.",
                      );
                    }
                  }}
                >
                  <iconify-icon icon="bx:search"></iconify-icon>
                </button>
                <a
                  href={URL.createObjectURL(result?.blob)}
                  target="_blank"
                  download={file.name.replace(/\.pdf$/i, "") + ".pdf"}
                  class="badge badge-sm badge-primary tooltip tooltip-left"
                  data-tip="Download"
                  aria-label="Download"
                >
                  <iconify-icon icon="bx:download"></iconify-icon>
                </a>
              {/if}
              <div>
                {#if item.completed.includes(id)}
                  <iconify-icon icon="bx:check" class="text-success text-2xl"
                  ></iconify-icon>
                {:else}
                  <iconify-icon
                    icon="bx:loader-circle"
                    class="text-2xl {loading ? 'animate-spin' : 'text-warning'}"
                  ></iconify-icon>
                {/if}
              </div>
            </div>
          </li>
        {/each}
      </ul>
      <div
        id="tour-sign-status"
        class="alert justify-between min-h-8 text-base-content/60 text-sm"
      >
        {#if loading}
          Proses Penandatangan... ( {completed} / {total} )
          <span>
            ({timer > 60000 ? Math.floor(timer / 1000 / 60) + " menit" : ""}
            {Math.floor((timer / 1000) % 60)} detik )
          </span>
        {:else if item.__error}
          <span class="text-error">{item.__error}</span>
        {:else if completed === total}
          <iconify-icon icon="bx:check-circle" class="text-5xl text-success"
          ></iconify-icon>
          <div>
            <div>
              {completed}
              {asDraft
                ? "Dokumen disimpan sebagai draft"
                : "Dokumen berhasil ditandatangani"}
            </div>
            <div class="text-sm text-base-content/80">
              ({elapsedTime > 60000
                ? Math.floor(elapsedTime / 1000 / 60) + " menit"
                : ""}
              {Math.floor((elapsedTime / 1000) % 60)} detik )
            </div>
          </div>

          <div>
            {#if page.url.searchParams.get("redirect")}
              <a
                href={`${page.url.searchParams.get("redirect")}?documentId=${item.completed.join(",")}`}
                class="btn btn-sm btn-primary"
              >
                <iconify-icon icon="bx:left-arrow-alt"></iconify-icon>
                Kembali ke Helpdesk
              </a>
            {/if}
            {#if asDraft}
              <a
                href={`/sign-v2?draft=true&id=${item.completed.join(",")}`}
                target="_blank"
                class="btn btn-sm btn-primary"
              >
                Tandatangani
              </a>
            {/if}
            {#if signedCount > 0}
              <button
                type="button"
                class="btn btn-sm btn-secondary"
                onclick={downloadAllSigned}
              >
                <iconify-icon icon="bx:download"></iconify-icon>
                Unduh Semua ({signedCount}) ZIP
              </button>
            {/if}
            {#if saveDocument}
              <a
                href={`/verify?id=${item.completed.join(",")}`}
                target="_blank"
                class="btn btn-sm btn-success"
              >
                Lihat Dokumen
              </a>
            {/if}
            {#if !asDraft}
              <button
                type="button"
                class="tooltip tooltip-open btn btn-sm btn-primary animate-pulse"
                data-tip="Beri penilaian Layanan Ini"
                onclick={() => (forms.survey = { rating: 0, feedback: "" })}
              >
                <iconify-icon icon="bx:clipboard"></iconify-icon>
                Survey
              </button>
              <button
                type="button"
                class="btn btn-sm btn-error"
                onclick={() => {
                  forms.confirm = true;
                }}
              >
                Tutup
              </button>
            {/if}
          </div>
        {:else if item.completed.length == 0}
          {#if bsre}
            <span>
              Masukkan Passphrase untuk menandatangani dokumen ({total})
            </span>
          {:else}
            <span>
              Klik tombol tanda tangan untuk menandatangani dokumen ({total})
            </span>
          {/if}
        {:else}
          <div>
            {completed} / {total}
            Dokumen berhasil ditandatangani.
            <span>
              ({timer > 60000 ? Math.floor(timer / 1000 / 60) + " menit" : ""}
              {Math.floor((timer / 1000) % 60)} detik )
            </span>
            <br />
            Klik tombol <kbd class="kbd kbd-sm">Tanda Tangan</kbd> untuk melanjutkan
            proses tanda tangan.
          </div>
        {/if}
      </div>

      {#if completed < total}
        <label class="floating-label">
          <span>{useEmail ? "Email" : "NIK"} Penandatangan</span>
          <input
            type="text"
            value={useEmail ? item.email : item.nik}
            class="input"
            readonly
          />
        </label>

        {#if bsre}
          <label class="floating-label" id="tour-passphrase">
            <span>Passphrase</span>
            <!-- Only the input and its show/hide toggle share the join row: with
                 the passkey controls in here the input shrank to a sliver on
                 narrow screens, where this modal is already tight. -->
            <div class="join w-full">
              <input
                type="text"
                bind:value={item.passphrase}
                autocomplete="off"
                placeholder="Masukkan Passphrase"
                class="input input-bordered join-item grow
                {!app.showPassphrase ? 'text-password' : ''}"
              />
              <button
                type="button"
                class="btn join-item"
                onclick={() => {
                  app.showPassphrase = !app.showPassphrase;
                }}
                aria-label="Show/Hide Passphrase"
                disabled={item.completed.length > 0}
              >
                <iconify-icon
                  icon={app.showPassphrase ? "bx:show" : "bx:hide"}
                  class="text-2xl"
                ></iconify-icon>
              </button>
            </div>
          </label>

          {#if vaultSupported && useEmail && vaultHas}
            <!-- Same id as the "Simpan Passkey" branch below: the two are
                 mutually exclusive, so exactly one #tour-save-passkey is ever
                 in the DOM. Without this the tour step lost its target — and
                 with it, any highlight to show — once a passkey already
                 existed. -->
            <button
              type="button"
              id="tour-save-passkey"
              class="btn btn-sm btn-outline btn-secondary w-full"
              disabled={vaultBusy || item.completed.length > 0}
              onclick={async () => {
                await usePasskey(item.email);
              }}
            >
              <iconify-icon icon="bx:key" class="text-xl"></iconify-icon>
              TTD dengan Passkey
            </button>
          {:else if vaultSupported && useEmail}
            <label
              id="tour-save-passkey"
              class="flex items-center gap-1.5 px-1 cursor-pointer select-none"
              title="Simpan Passphrase dengan Passkey"
            >
              <input
                type="checkbox"
                class="toggle toggle-secondary toggle-sm"
                disabled={vaultBusy || !item.passphrase}
                onchange={async (e) => {
                  if (!e.currentTarget.checked) return;
                  await saveToVault(item.email, item.passphrase);
                  if (!vaultError) {
                    app.showToast(
                      "success",
                      "Passphrase tersimpan. Gunakan Passkey untuk tanda tangan berikutnya.",
                    );
                  }
                }}
              />
              <span class="text-xs text-base-content/80"
                >Simpan Passkey</span
              >
            </label>
          {/if}

          {#if vaultSupported && useEmail && vaultHas && vaultSavedAt}
            <div
              class="flex items-center gap-1.5 text-xs text-base-content/50 -mt-3 -mb-1"
            >
              <span
                >Passphrase tersimpan diperangkat anda pada
                {d(vaultSavedAt).format("DD MMM YYYY, HH:mm")}</span
              >
              <button
                type="button"
                class="btn btn-xs btn-ghost btn-secondary px-2"
                disabled={vaultBusy || !item.passphrase}
                onclick={async () => {
                  await saveToVault(item.email, item.passphrase);
                  if (!vaultError) app.showToast("success", "Passphrase diperbarui.");
                }}
              >
                <iconify-icon icon="bx:refresh" class="text-sm"></iconify-icon>
                Perbarui
              </button>
              <button
                type="button"
                class="btn btn-xs btn-ghost btn-error px-2"
                disabled={vaultBusy}
                onclick={async () => {
                  await removeFromVault(item.email);
                }}
              >
                <iconify-icon icon="bx:trash" class="text-sm"></iconify-icon>
                Hapus
              </button>
            </div>
          {/if}
          {#if vaultError}
            <div class="alert alert-error text-xs py-1.5 px-3">
              <iconify-icon icon="bx:error" class="text-xl"></iconify-icon>
              <span>{vaultError}</span>
            </div>
          {/if}

          {#if !hasSignature}
            <label class="label cursor-pointer justify-between -my-1 p-0">
              <span class="label-text text-sm"
                >Visualisasi Footer BSrE - BSSN</span
              >
              <input
                type="checkbox"
                class="toggle toggle-primary toggle-sm shrink-0"
                bind:checked={item.footer}
                onchange={() => (form.footer = item.footer)}
              />
            </label>
          {/if}

          {#if !hasSignature && !item.footer}
            <div
              class="alert alert-warning text-xs py-1.5 px-3 flex gap-2 items-start justify-between -mt-2"
            >
              <div class="flex gap-2 items-start grow min-w-0">
                <iconify-icon icon="bx:error" class="text-2xl shrink-0 mt-0.5"
                ></iconify-icon>
                <div class="leading-normal grow min-w-0">
                  Pastikan dokumen memiliki footer <br />
                  <span class="opacity-80 italic text-xs block mt-0.5"
                    >"Dokumen ini ditandatangani menggunakan sertifikat
                    elektronik yang diterbitkan BSrE - BSSN"</span
                  >
                </div>
              </div>
            </div>
          {/if}
        {/if}
        <div id="turnstile-container"></div>

        <button
          id="tour-sign-submit"
          type="submit"
          class="btn {bsre ? 'btn-secondary' : 'btn-primary'}"
          disabled={loading || !turnstileSuccess || (bsre && !item.passphrase)}
        >
          <iconify-icon icon="bx:pen" class="text-2xl"></iconify-icon>
          Tanda Tangan {bsre ? "Elektronik" : "Non-Elektronik (Manual)"}
        </button>

        {#if data.user}
          <button
            type="submit"
            class="btn"
            disabled={loading || !turnstileSuccess}
            onclick={() => {
              asDraft = true;
            }}
          >
            <iconify-icon icon="bx:save" class="text-2xl"></iconify-icon>
            Simpan Draft
          </button>
        {/if}
      {/if}
      {#if !saveDocument}
        <div class="alert alert-warning alert-sm">
          Pengguna tidak login, dokumen tidak akan disimpan pada aplikasi
        </div>
      {/if}
    </form>
  {/snippet}
</Modal>

<Modal
  bind:data={forms.confirm}
  title="Anda yakin ingin menutup menu ini?"
  closeable={false}
>
  <div class="my-5">
    {#if data.user}
      <p>Dokumen berhasil disimpan</p>
    {:else}
      <p>Semua data sesi ini yang belum disimpan akan hilang.</p>
      {#if saveDocument}
        <p>
          Anda dapat mengakses semua dokumen yang sudah ditandatangani di
          halaman dashboard setelah login.
        </p>
      {/if}
    {/if}
  </div>
  <div class="flex justify-center gap-2">
    <button
      type="button"
      class="btn btn-sm"
      onclick={() => (forms.confirm = false)}
    >
      Batal
    </button>
    <button
      type="button"
      class="btn btn-sm btn-error"
      onclick={() => {
        forms.confirm = false;
        forms.sign = undefined;
        app.showPassphrase = false;
        documents = {};
      }}
    >
      Tutup
    </button>
  </div>
</Modal>

<Modal
  bind:data={forms.template}
  title="Pilih Template dokumen untuk tanda tangan"
  size="xl"
>
  <Template onSelect={initTemplate} />
</Modal>

<Modal bind:data={forms.survey} title="Survey Kepuasan" size="sm">
  <div class="space-y-4 my-2">
    <p class="text-sm opacity-70">
      Bantu kami meningkatkan kualitas layanan Tapak Astà.
    </p>
    <div>
      <div class="font-semibold text-sm">Seberapa puas Anda?</div>
      <div class="rating rating-lg mt-2">
        <input type="radio" name="survey-rating" class="rating-hidden" />
        {#each [1, 2, 3, 4, 5] as n (n)}
          <input
            type="radio"
            name="survey-rating"
            class="mask mask-star-2 bg-warning"
            aria-label="{n} star"
            checked={forms.survey?.rating === n}
            onchange={() => {
              if (forms.survey) forms.survey.rating = n;
            }}
          />
        {/each}
      </div>
    </div>
    <div>
      <label class="font-semibold text-sm" for="survey-feedback"
        >Kritik & Saran</label
      >
      <textarea
        id="survey-feedback"
        class="textarea textarea-bordered w-full mt-1"
        rows="3"
        placeholder="Tulis masukan Anda..."
        bind:value={forms.survey!.feedback}
      ></textarea>
    </div>
  </div>
  <div class="flex justify-end gap-2">
    <button
      class="btn btn-sm btn-ghost hover:bg-base-300"
      onclick={() => (forms.survey = undefined)}
    >
      Lewati
    </button>
    <button
      class="btn btn-sm btn-primary"
      disabled={!forms.survey?.rating}
      onclick={async () => {
        if (!forms.survey?.rating) return;
        await submitSurvey({
          email: data.user?.email || "",
          rating: forms.survey.rating,
          feedback: forms.survey.feedback || "",
        });
        forms.survey = undefined;
      }}
    >
      Kirim
    </button>
  </div>
</Modal>
