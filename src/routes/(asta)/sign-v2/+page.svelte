<script lang="ts">
  import { env } from "$env/dynamic/public";
  import { app } from "$lib/app/index.svelte";
  import {
    type PlacementType,
    type SignaturePlacement,
    type TextPlacement,
    type CheckboxPlacement,
    normalizePlacement,
  } from "./types";
  import * as pdfLib from "$lib/utils/pdf";
  import { Modal, Tour } from "$lib/components";
  import { submitSurvey } from "$lib/remotes/survey.remote";
  import Documents from "./documents.svelte";
  import Metadata from "./metadata.svelte";
  import Preview, {
    type PreviewController,
    type PreviewState,
  } from "$lib/components/preview.svelte";
  import Upload from "./upload.svelte";
  import Visualizer from "./visualizer.svelte";
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
  let bsre = $state(true);
  let form: Record<string, any> = $state({});
  // svelte-ignore state_referenced_locally
  let useEmail = $state(true);
  let fields: Record<string, any> = $state({});
  let hasSignature = $state(true);
  let isEncrypted = $state(false);
  let previewFile: File | null = $state(null);
  let startTime = $state(0);
  let timer = $state(0);
  let elapsedTime = $state(0);
  let turnstileId = $state("");

  let activeTab = $state("metadata");

  /** Where the signing footer (QR + note) is drawn: only the active page or all. */
  let footerScope = $state<"all" | "current">("all");

  // ── editor-style chrome state ────────────────────────────────────
  let docName = $state("Tanpa Judul");
  let navOpen = $state(true);
  let pageNavOpen = $state(false);
  let openMenuId = $state<string | null>(null);

  /** Which armed placement tool is active (click-to-place on the preview). */
  let activeTool = $state<SignTool>("select");
  let selectedId = $state<string | null>(null);
  let overlayEl: HTMLDivElement | null = $state(null);
  let previewCtl: PreviewController | null = $state(null);
  let previewState: PreviewState = $state({
    zoom: 1,
    page: 1,
    pageCount: 0,
    sizes: [],
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

  const tourSteps = [
    {
      target: "#tour-upload-btn",
      title: "Unggah Dokumen",
      content:
        "Mulai dengan mengunggah file PDF yang ingin Anda tanda tangani di sini. Anda bisa menyeret file langsung ke area ini.",
      placement: "bottom" as const,
    },
    {
      target: "#tour-documents",
      title: "Daftar Dokumen",
      content:
        "Semua dokumen yang Anda unggah akan muncul di sini. Anda bisa beralih antar dokumen dengan mengkliknya.",
      onShow: () => (activeTab = "documents"),
    },
    {
      target: "#tour-metadata",
      title: "Informasi Penandatangan",
      content:
        "Lengkapi data identitas Anda. Pastikan Email atau NIK sesuai dengan sertifikat elektronik Anda.",
      onShow: () => (activeTab = "metadata"),
    },
    {
      target: "#tour-signature",
      title: "Visualisasi Tanda Tangan",
      content:
        "Pilih bagaimana tanda tangan Anda akan ditampilkan di dokumen: QR Code, Gambar, atau Nama. Jika tidak ingin menambahkan visualisasi, abaikan fitur ini.",
      onShow: () => (activeTab = "metadata"),
    },
    {
      target: "#tour-sign-button",
      title: "Proses Tanda Tangan",
      content:
        "Setelah semua siap, klik tombol ini untuk memulai proses penandatanganan secara elektronik.",
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

  /** Open the "add signature" dialog living inside the Metadata panel. */
  let openVisual: (() => void) | undefined = $state(undefined);

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
    } else if (bsre && (sign.kind ?? "signature") === "signature") {
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

  function handleOverlayClick(
    e: MouseEvent,
    scale: number,
    pageSizes: { width: number; height: number }[],
    gapPts: number,
  ) {
    if (!armed || !overlayEl) return;
    if (e.target !== overlayEl) return;

    const rect = overlayEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const yTop = (e.clientY - rect.top) / scale;

    let acc = 0;
    for (let i = 0; i < pageSizes.length; i++) {
      const h = pageSizes[i].height;
      if (yTop < acc + h) {
        addPlacementAt(activeTool, i + 1, x, yTop - acc);
        break;
      }
      acc += h + gapPts;
    }
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
  // Signing only requires an identity, a note and a location for BSrE; manual
  // signing just needs at least one signature visualisation.
  const hasMetadata = $derived(
    String(form.email).length > 0 &&
      (bsre
        ? status === "ISSUE" &&
          String(form.note).length > 0 &&
          String(form.location).length > 0
        : placements.some((p) => (p.kind ?? "signature") === "signature")),
  );
  const allowSigning = $derived(hasDocuments && hasMetadata && !isEncrypted);

  async function getDocumentDetails(file: File) {
    const buffer = await file.arrayBuffer();
    isEncrypted = await pdfLib.isEncrypted(buffer);
    if (isEncrypted) return;

    fields = await pdfLib.getAllFormFields(buffer);
    hasSignature = await pdfLib.hasSignature(buffer);

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
      send_file: data.whatsappNotifyDocument ?? false,
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
            docName = (doc.title || file.name).replace(/\.pdf$/i, "");

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
    docName = String(item.name || "Template").replace(/\.pdf$/i, "");

    bsre = item.sign_type == "bsre";
    form.note = item.description || "Tanda Tangan Elektronik";
    form.to = item.to || null;
    form.footer = true;
    activeIndex = docId;
    forms.template = undefined;
    saveDocument = form.save_document ?? true;
  }

  //@ts-ignore - debounce return type doesn't match the debounced function signature
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
      documents = Object.fromEntries(files.map((file) => [createId(10), file]));
      activeIndex = Object.keys(documents)[0];
      const first = files[0];
      if (first) docName = first.name.replace(/\.pdf$/i, "");
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

  function requestAddSignature() {
    // The dialog lives inside the Metadata panel; make sure it is mounted.
    activeTab = "metadata";
    navOpen = true;
    setTimeout(() => openVisual?.(), 0);
  }

  /** Change where the QR/note footer is drawn and refresh the preview. */
  function applyFooterScope(scope: "all" | "current") {
    footerScope = scope;
    if (documents[activeIndex]) debounceFillFormFields();
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
    if (file && !asTemplate) docName = file.name.replace(/\.pdf$/i, "");
    debounceFillFormFields();
  });

  $effect(() => {
    if (hasSignature) form.footer = false;
  });

  $effect(() => {
    if (!bsre) form.footer = true;
  });
</script>

<svelte:window
  onclick={() => (openMenuId = null)}
  onkeydown={(e) => {
    if (e.key === "Escape" && armed) activeTool = "select";
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
  class="sign-page h-[calc(100dvh-4rem)] flex flex-col overflow-hidden"
>
  <!-- ============ TOPBAR ============ -->
  <div class="topbar">
    <div class="header-row">
      <a class="header-logo" href="/sign-v2" title="Tapak Astà — Tanda Tangan">
        <iconify-icon icon="bx:file" width="20" height="20"></iconify-icon>
      </a>
      <div class="header-center">
        <input
          class="filename-input"
          type="text"
          placeholder="Tanpa Judul"
          aria-label="Nama dokumen"
          spellcheck="false"
          bind:value={docName}
        />
        <div class="menu-bar">
          <!-- File -->
          <div
            class="menubar-item"
            class:open={openMenuId === "file"}
            onmouseenter={() => (openMenuId = "file")}
            onmouseleave={() => (openMenuId = null)}
          >
            <button
              type="button"
              class="menu-button"
              aria-haspopup="true"
              aria-expanded={openMenuId === "file"}
              onclick={(e) => {
                e.stopPropagation();
                openMenuId = openMenuId === "file" ? null : "file";
              }}
            >
              File
            </button>
            <div class="menu-popup" role="menu" tabindex="-1">
              <button class="menu-item" role="menuitem" onclick={() => { openMenuId = null; fileInput?.click(); }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:upload" width="18" height="18"></iconify-icon></span>
                Unggah PDF/DOCX…
              </button>
              <button class="menu-item" role="menuitem" onclick={() => { openMenuId = null; activeTab = "documents"; navOpen = true; }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:file" width="18" height="18"></iconify-icon></span>
                Daftar Dokumen
              </button>
              <div class="menu-separator"></div>
              <a class="menu-item" role="menuitem" href="/editor">
                <span class="menu-item-icon"><iconify-icon icon="bx:plus" width="18" height="18"></iconify-icon></span>
                Buat Dokumen
                <span class="menu-shortcut">Baru</span>
              </a>
              <div class="menu-separator"></div>
              <button class="menu-item" role="menuitem" disabled={!hasDocuments} onclick={() => { openMenuId = null; downloadActive(); }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:download" width="18" height="18"></iconify-icon></span>
                Unduh Dokumen
              </button>
              <button class="menu-item" role="menuitem" disabled={!hasDocuments} onclick={() => { openMenuId = null; closeDocument(); }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:x" width="18" height="18"></iconify-icon></span>
                Tutup Dokumen
              </button>
            </div>
          </div>

          <!-- Edit -->
          <div
            class="menubar-item"
            class:open={openMenuId === "edit"}
            onmouseenter={() => (openMenuId = "edit")}
            onmouseleave={() => (openMenuId = null)}
          >
            <button
              type="button"
              class="menu-button"
              aria-haspopup="true"
              aria-expanded={openMenuId === "edit"}
              onclick={(e) => {
                e.stopPropagation();
                openMenuId = openMenuId === "edit" ? null : "edit";
              }}
            >
              Edit
            </button>
            <div class="menu-popup" role="menu" tabindex="-1">
              <button class="menu-item" role="menuitem" disabled={!canUndo} onclick={() => { openMenuId = null; undo(); }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:undo" width="18" height="18"></iconify-icon></span>
                Undo
                <span class="menu-shortcut">—</span>
              </button>
              <button class="menu-item" role="menuitem" disabled={!canRedo} onclick={() => { openMenuId = null; redo(); }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:redo" width="18" height="18"></iconify-icon></span>
                Redo
              </button>
              <div class="menu-separator"></div>
              <button class="menu-item" role="menuitem" disabled={!selectedId} onclick={() => { openMenuId = null; if (selectedId) removePlacement(selectedId); }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:trash" width="18" height="18"></iconify-icon></span>
                Hapus Item Terpilih
              </button>
              <button class="menu-item" role="menuitem" onclick={() => { openMenuId = null; snapshot(); placements = []; selectedId = null; }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:eraser" width="18" height="18"></iconify-icon></span>
                Hapus Semua Item
              </button>
              <div class="menu-separator"></div>
              <button class="menu-item" role="menuitem" onclick={() => { openMenuId = null; activeTool = "select"; }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:pointer" width="18" height="18"></iconify-icon></span>
                Pilih / Geser
              </button>
            </div>
          </div>

          <!-- Template -->
          <div
            class="menubar-item"
            class:open={openMenuId === "template"}
            onmouseenter={() => (openMenuId = "template")}
            onmouseleave={() => (openMenuId = null)}
          >
            <button
              type="button"
              class="menu-button"
              aria-haspopup="true"
              aria-expanded={openMenuId === "template"}
              onclick={(e) => {
                e.stopPropagation();
                openMenuId = openMenuId === "template" ? null : "template";
              }}
            >
              Template
            </button>
            <div class="menu-popup" role="menu" tabindex="-1">
              <button class="menu-item" role="menuitem" onclick={() => { openMenuId = null; forms.template = "open"; }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:book" width="18" height="18"></iconify-icon></span>
                Template PDF
              </button>
              <a class="menu-item" role="menuitem" href="/templates">
                <span class="menu-item-icon"><iconify-icon icon="bx:folder" width="18" height="18"></iconify-icon></span>
                Kelola Template
              </a>
            </div>
          </div>

          <!-- Metadata -->
          <div
            class="menubar-item"
            class:open={openMenuId === "metadata"}
            onmouseenter={() => (openMenuId = "metadata")}
            onmouseleave={() => (openMenuId = null)}
          >
            <button
              type="button"
              class="menu-button"
              aria-haspopup="true"
              aria-expanded={openMenuId === "metadata"}
              onclick={(e) => {
                e.stopPropagation();
                openMenuId = openMenuId === "metadata" ? null : "metadata";
              }}
            >
              Metadata
            </button>
            <div class="menu-popup" role="menu" tabindex="-1">
              <button class="menu-item" role="menuitem" onclick={() => { openMenuId = null; activeTab = "metadata"; navOpen = true; }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:list-ul" width="18" height="18"></iconify-icon></span>
                Buka Panel Metadata
              </button>
              <button class="menu-item" role="menuitem" onclick={() => { openMenuId = null; activeTab = "documents"; navOpen = true; }}>
                <span class="menu-item-icon"><iconify-icon icon="bx:file" width="18" height="18"></iconify-icon></span>
                Daftar Dokumen
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="btn btn-sm btn-ghost btn-square"
          class:btn-active={pageNavOpen}
          title="Panel navigasi halaman"
          aria-label="Panel navigasi halaman"
          aria-pressed={pageNavOpen}
          onclick={() => (pageNavOpen = !pageNavOpen)}
        >
          <iconify-icon icon="bx:sidebar"></iconify-icon>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost btn-square"
          class:btn-active={navOpen}
          title="Panel dokumen & metadata"
          aria-label="Panel dokumen & metadata"
          aria-pressed={navOpen}
          onclick={() => (navOpen = !navOpen)}
        >
          <iconify-icon icon="bx:dock-right"></iconify-icon>
        </button>
      </div>
    </div>

    <Toolbar
      {activeTool}
      onTool={(t) => (activeTool = t)}
      onAddSignature={requestAddSignature}
      {footerScope}
      onFooterScope={applyFooterScope}
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
      zoom={previewState.zoom}
      page={previewState.page}
      pageCount={previewState.pageCount}
      onZoomIn={() => previewCtl?.zoomIn()}
      onZoomOut={() => previewCtl?.zoomOut()}
      onZoomSet={(z) => previewCtl?.setZoom(z)}
      onPagePrev={() => previewCtl?.changePage(-1)}
      onPageNext={() => previewCtl?.changePage(1)}
      onPageSet={(p) => previewCtl?.goToPage(p)}
      onDownload={downloadActive}
      onSign={openSign}
      canSign={allowSigning && forms.sign == undefined}
      signing={loading}
    />
  </div>

  <!-- ============ BODY ============ -->
  <div class="sign-body">
    <PageNav controller={previewCtl} preview={previewState} open={pageNavOpen} />

    <main class="center-pane">
      {#if hasDocuments && isEncrypted}
        <div class="doc-alerts">
          <div class="alert alert-error py-1 px-4 flex-none">
            <iconify-icon icon="bx:lock-alt" class="text-xl"></iconify-icon>
            <span>
              <strong>Dokumen Diproteksi:</strong> Dokumen ini dilindungi kata
              sandi dan tidak dapat ditandatangani. Hapus proteksi terlebih
              dahulu.
            </span>
          </div>
        </div>
      {:else if hasDocuments && hasSignature}
        <div class="doc-alerts">
          <div class="alert alert-warning py-1 px-4 flex-none">
            <iconify-icon icon="bx:error" class="text-xl"></iconify-icon>
            <span>
              <strong>Peringatan:</strong> Terdapat tanda tangan elektronik pada
              dokumen ini.
            </span>
            <button
              type="button"
              class="btn btn-xs btn-primary"
              onclick={async () => {
                const file = documents[activeIndex];
                if (!file) return;
                try {
                  const blobId = await stashSignFile(file);
                  goto(
                    `/verify?blob=${blobId}&fileName=${encodeURIComponent(file.name)}`,
                  );
                } catch (err) {
                  console.error("[verify] handoff failed", err);
                  app.showToast("error", "Gagal membuka dokumen untuk verifikasi.");
                }
              }}
            >
              Verifikasi
            </button>
          </div>
        </div>
      {:else if hasDocuments && isDraft}
        <div class="doc-alerts">
          <div class="alert alert-info py-1 px-4 flex-none">
            <iconify-icon icon="bx:error" class="text-xl"></iconify-icon>
            <span>
              <strong>Peringatan:</strong> Dokumen masih dalam bentuk draft.
            </span>
          </div>
        </div>
      {/if}

      {#if hasDocuments}
        <div class="preview-host" class:armed>
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
            }}
            controls={false}
            onclose={closeDocument}
          >
            {#snippet children(scale, pageSizes, gutter)}
              {@const gapPts = gutter / scale}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                bind:this={overlayEl}
                class="absolute inset-0"
                onclick={(e) =>
                  handleOverlayClick(e, scale, pageSizes, gapPts)}
              >
                {#each placements as pl (pl.id)}
                  {@const sumPrevHeight = pageSizes
                    .slice(0, pl.page - 1)
                    .reduce((acc, cur) => acc + cur.height + gapPts, 0)}
                  <Dragresize
                    x={pl.originX}
                    y={pl.originY + sumPrevHeight}
                    width={pl.width}
                    height={pl.height}
                    {scale}
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
                      pl.originX = e.x;
                      pl.width = e.width;
                      pl.height = e.height;
                    }}
                  >
                    <button
                      type="button"
                      class="placement-delete"
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
                        class="placement-img"
                        alt="Visualisasi"
                      />
                    {:else if pl.kind === "checkbox"}
                      {@const cb = pl as CheckboxPlacement}
                      <button
                        type="button"
                        class="placement-checkbox"
                        class:checked={cb.checked}
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
                        class="placement-{tp.kind}"
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

      <div class:hidden={hasDocuments} class="preview-host p-2">
        <Upload
          bind:fileInput
          bind:files
          allowDocx
          title="Pilih File PDF atau DOCX"
        />
      </div>
    </main>

    <aside class="side-pane" class:side-pane--hidden={!navOpen}>
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
          <iconify-icon icon="bx:detail"></iconify-icon>
          Meta Data
          <span class="badge badge-sm">{bsre ? "TTE" : "Manual"}</span>
        </button>
      </div>

      <div class="nav-content">
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
            bind:signatures={placements}
            {setSignature}
            bind:openVisual
            onSign={openSign}
          >
            <Visualizer bind:signatures={placements} {selectedId} onSelect={(id) => (selectedId = id)} onDelete={removePlacement} />
          </Metadata>
        {/if}
      </div>
    </aside>
  </div>
</div>

{#if app.showTour}
  <Tour
    steps={tourSteps}
    onComplete={() => {
      app.showTour = false;
      localStorage.setItem("tour-sign-last-shown", Date.now().toString());
    }}
    onSkip={() => {
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

                // Bake text/date/checkbox always; bake signatures only when
                // signing manually (BSrE draws the signature itself).
                const toDraw = bsre
                  ? item.signatureProperties.filter(
                      (p: any) => (p.kind ?? "signature") !== "signature",
                    )
                  : item.signatureProperties;

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

                // BSrE only consumes the first signature — send signatures first.
                const sigForServer = bsre
                  ? item.signatureProperties.filter(
                      (p: any) => (p.kind ?? "signature") === "signature",
                    )
                  : item.signatureProperties;

                const props = {
                  id,
                  __manual: !bsre,
                  __asDraft: asDraft,
                  __saveDocument: saveDocument,
                  to: item.to,
                  ...(useEmail ? { email: item.email } : { nik: item.nik }),
                  owner: item.owner || undefined,
                  nama: item.nama,
                  jabatan: item.jabatan || "-",
                  pangkat: item.pangkat || "-",
                  instansi: item.instansi || "-",
                  passphrase: item.passphrase,
                  note: item.note || "-",
                  nomor_telepon: item.nomor_telepon,
                  location: item.location || "-",
                  signatureProperties: sigForServer,
                  fileName,
                  fileBase64,
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
              class="flex justify-between w-full btn btn-sm btn-ghost gap-1 p-1"
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
      <div class="alert justify-between min-h-8 text-base-content/60 text-sm">
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
          <label class="floating-label">
            <span>Passphrase</span>
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
              {#if vaultSupported && useEmail && vaultHas}
                <button
                  type="button"
                  class="btn join-item btn-outline btn-secondary"
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
                  class="join-item flex items-center gap-1.5 px-3 cursor-pointer select-none"
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
            </div>
          </label>

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
      class="btn btn-sm btn-ghost"
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
