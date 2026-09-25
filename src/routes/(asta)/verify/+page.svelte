<script lang="ts">
  import { page } from "$app/state";
  import { onDestroy, onMount } from "svelte";
  import Preview from "$lib/components/preview.svelte";
  import { getDocument, verifyDocument } from "$lib/remotes/sign.remote";
  import { calculateFileChecksum, createId, fileToBase64 } from "$lib/utils";
  import { isPdf } from "$lib/utils/docx";
  import Status from "./status.svelte";
  import Upload from "../sign/upload.svelte";
  import type { SignatureVerificationResponse } from "./types";
  import { Tour } from "$lib/components";
  import { app } from "$lib/app/index.svelte";
  import { takeSignFile } from "$lib/utils/sign-handoff";

  let { data } = $props();

  let guestEmail = $state("");
  let tempEmail = $state("");
  let emailError = $state("");

  const MODES = ["upload", "id", "scan"] as const;
  type Mode = (typeof MODES)[number];

  function parseModeHash(hash: string): Mode | null {
    const key = hash.replace(/^#!?\/?/, "");
    return MODES.includes(key as Mode) ? (key as Mode) : null;
  }

  const mode = $derived(parseModeHash(page.url.hash) ?? ("upload" as Mode));
  let previewFile: File | null = $state(null);
  // Covers the window between picking a document and its bytes arriving: the
  // server claim URL is a real network fetch, and the preview pane would
  // otherwise sit blank the whole time. `previewError` holds the failure so it
  // can be shown and retried instead of only reaching the console.
  let previewLoading = $state(false);
  let previewError = $state<string | null>(null);
  let fileURL: string | undefined = $state();
  let idDocument = $state("");

  let fileName = $state("");
  let uploaderFiles: File[] = $state([]);
  let uploaderInput: HTMLInputElement | null = $state(null);

  /**
   * Uploaded documents, keyed by id, with `activeId` naming the one on screen.
   * Verification results live per document rather than in a single value:
   * several files are checked at once, and one shared status would show the
   * previous file's verdict the moment you switch.
   */
  let uploaded = $state<Record<string, File>>({});
  let results = $state<
    Record<string, { status?: SignatureVerificationResponse; loading: boolean }>
  >({});
  let checksums = $state<Record<string, string>>({});
  let activeId = $state("");

  // Documents fetched from the server (Cari by ID, or handed over from the
  // sign page) are shown one at a time and aren't part of the uploaded set,
  // so they keep their own result instead of a slot in it.
  let remoteResult = $state<{
    status?: SignatureVerificationResponse;
    loading: boolean;
  }>({ loading: false });

  const uploadedIds = $derived(Object.keys(uploaded));
  const activeResult = $derived(activeId ? results[activeId] : remoteResult);
  const verifyStatus = $derived(activeResult?.status);
  const loading = $derived(!!activeResult?.loading);

  // Set when the page was opened with `?blob=`, meaning the PDF is parked in
  // IndexedDB by the tab that handed it over. The claim is one-shot: it deletes
  // the entry as it reads it, so a refresh can't restore the document twice.
  let handoffPending = $state(false);
  let handoffClaimed = false;

  let qrScanner: any;
  let videoEl: HTMLVideoElement | null = $state(null);
  let isScanning = $state(false);

  $effect(() => {
    if (mode !== "scan") {
      stopScan();
    }
  });

  async function startScan() {
    if (!videoEl) return;
    const QrScanner = (await import("qr-scanner")).default;
    qrScanner = new QrScanner(
      videoEl,
      (result) => {
        const data = result.data;
        if (data) {
          stopScan();
          if (data.startsWith("http://") || data.startsWith("https://")) {
            location.href = data;
          } else {
            location.href = `/verify?id=${data}`;
          }
        }
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
      },
    );
    try {
      await qrScanner.start();
      isScanning = true;
    } catch (err) {
      console.error(err);
      alert("Gagal mengakses kamera. Pastikan izin kamera telah diberikan.");
    }
  }

  function stopScan() {
    if (qrScanner) {
      qrScanner.destroy();
      qrScanner = null;
    }
    isScanning = false;
  }

  $effect(() => {
    if (uploaderFiles.length === 0) return;
    // Drain the binding first. Otherwise the writes below re-trigger this same
    // effect, and a second drop would be swallowed instead of added.
    const picked = uploaderFiles;
    uploaderFiles = [];
    void addFiles(picked);
  });

  /**
   * Add documents to the set and verify each one.
   *
   * Every file gets its own slot so results can't bleed between documents, and
   * each is verified in the background — a batch of ten doesn't have to finish
   * the first one before the last one is readable.
   */
  async function addFiles(list: FileList | File[]) {
    const picked = [...list].filter(isPdf);
    if (picked.length === 0) return;

    const added: string[] = [];
    for (const file of picked) {
      const id = createId(10);
      uploaded[id] = file;
      results[id] = { loading: true };
      checksums[id] = await calculateFileChecksum(file);
      added.push(id);
    }

    if (!activeId) selectDocument(added[0]);
    void Promise.all(added.map((id) => verifyOne(id)));
  }

  /** Verify a single uploaded document into its own slot. */
  async function verifyOne(id: string) {
    const file = uploaded[id];
    if (!file) return;
    results[id] = { ...results[id], loading: true };
    results[id] = { loading: false, status: await callVerify(file) };
  }

  /** Show a document from the uploaded set. */
  function selectDocument(id: string) {
    const file = uploaded[id];
    if (!file) return;
    activeId = id;
    previewFile = file;
    fileURL = undefined;
    fileName = file.name;
    // Cleared so a later server fetch of the same URL isn't skipped as done.
    lastFetchedURL = "";
  }

  /** Drop a document from the set, then fall back to whatever is left. */
  function removeDocument(id: string) {
    delete uploaded[id];
    delete results[id];
    delete checksums[id];
    if (activeId !== id) return;

    const next = uploadedIds[0];
    activeId = "";
    if (next) {
      selectDocument(next);
    } else {
      previewFile = null;
      fileURL = undefined;
      fileName = "";
      remoteResult = { loading: false };
      previewError = null;
    }
  }
  const tourSteps = [
    {
      target: "#tour-verify-mode",
      title: "Metode Verifikasi",
      content:
        "Pilih cara Anda memverifikasi dokumen: Unggah File, Cari berdasarkan ID, atau Scan QR Code.",
    },
    {
      target: "#tour-verify-input",
      title: "Input Verifikasi",
      content:
        "Unggah dokumen PDF Anda di sini untuk memulai proses pemeriksaan keaslian secara otomatis.",
      placement: "bottom" as const,
    },
    {
      target: "#tour-verify-preview",
      title: "Pratinjau Dokumen",
      content:
        "Anda dapat melihat isi dokumen yang diunggah di area pratinjau ini sebelum atau sesudah diverifikasi.",
    },
    {
      target: "#tour-verify-status",
      title: "Status Keaslian",
      content:
        "Hasil verifikasi akan muncul di sini, menunjukkan apakah tanda tangan elektronik pada dokumen tersebut valid.",
    },
  ];
  let queryParams = $state({
    id: page.url.searchParams.get("id") || "",
    checksum: "",
  });

  $effect(() => {
    queryParams.id = page.url.searchParams.get("id") || "";
    // The remote query keys off a single checksum, so it follows whichever
    // document is on screen. Uploaded documents are local — the server has
    // never seen them — so they contribute no checksum to look up.
    queryParams.checksum =
      activeId && uploaded[activeId] ? "" : (checksums[activeId] ?? "");
  });

  const documents = getDocument(queryParams);

  const docsData = $derived(documents.current || []);

  /**
   * A server document carrying no e-sign stamp is reported as valid-but-unsigned
   * without calling the verification service. Derived rather than stored so the
   * flag can't outlive the document it was set for and leak onto an uploaded
   * file, which is always verified for real.
   */
  const verifyUnsign = $derived(
    !activeId && !!docsData[0] && !docsData[0].esign,
  );

  const docOwner = $derived(docsData[0]?.owner);
  const isAuthorized = $derived.by(() => {
    if (data.user) return true;
    if (!guestEmail) return false;
    if (docsData.length === 0) return false;
    if (docOwner && guestEmail !== docOwner) return false;
    return true;
  });

  onMount(async () => {
    const urlMode = parseModeHash(page.url.hash);
    if (urlMode === "scan") {
      setTimeout(() => startScan(), 500);
    }

    let urlOwner = page.url.searchParams.get("owner");
    if (urlOwner) {
      try {
        if (!urlOwner.includes("@")) {
          urlOwner = atob(urlOwner);
        }
      } catch (e) {
        console.error("Failed to decode owner param", e);
      }
      guestEmail = urlOwner;
      tempEmail = urlOwner.split("@")[0];
    }

    let localFileName = "";

    if (page.url.searchParams.get("blob")) {
      localFileName = page.url.searchParams.get("fileName") || "default.pdf";
      handoffPending = true;
    }

    const doc = (await documents)[0];
    if (doc) {
      localFileName = doc.title || "default.pdf";
      fileURL = doc.files?.[0] || "";
    }

    fileName = localFileName; // Sync to state

    if (fileURL) {
      await previewURL(fileURL, localFileName);
    }

    const lastShown = localStorage.getItem("tour-verify-last-shown");
    const now = Date.now();
    if (!lastShown || now - Number(lastShown) > 86400000) {
      setTimeout(() => (app.showTour = true), 1000);
    }
  });

  onDestroy(() => {
    stopScan();
    // Only revoke URLs this tab created. A `blob:` handoff URL is owned by the
    // tab that made it, so revoking it here is a no-op at best and can
    // invalidate the source tab's own object URL.
    if (fileURL?.startsWith("blob:")) {
      URL.revokeObjectURL(fileURL);

      if (page.url.searchParams.get("blob")) {
        clearSearchParams();
      }
    }
  });

  let lastFetchedURL = "";
  $effect(() => {
    // Claim the handed-over PDF. It arrives as a real File from IndexedDB, so
    // it goes straight to `previewFile` — `previewURL` is a `fetch`, and a
    // `blob:` handle minted in another tab can't be fetched from here.
    if (!handoffPending || handoffClaimed) return;
    handoffClaimed = true;
    const blobId = page.url.searchParams.get("blob") || "";
    void takeSignFile(blobId).then((file) => {
      if (!file) {
        app.showToast(
          "error",
          "Dokumen tidak ditemukan atau sudah dipakai. Silakan unggah ulang.",
        );
        handoffPending = false;
        clearSearchParams();
        return;
      }
      previewFile = file;
      fileName = file.name;
      handoffPending = false;
      // Drop the one-shot key so a refresh doesn't re-trigger the claim.
      clearSearchParams();
      // Verify explicitly rather than via `verify()`: a handoff can arrive
      // while uploaded documents are still listed, and `verify()` would then
      // re-check the selected upload instead of the document just claimed.
      verifyRemote(file);
    });
  });

  $effect(() => {
    // Server documents are only mirrored onto the screen while no upload is
    // selected. Without this, a pending lookup could swap its own preview in
    // over the document the user just picked from the list.
    if (activeId) return;

    // Sync data from search results
    const doc = docsData[0];
    if (doc && !fileURL) {
      fileName = doc.title || "default.pdf";
      fileURL = doc.files?.[0] || "";
    }

    // Trigger preview fetch if authorized and file details are known
    if (
      isAuthorized &&
      fileURL &&
      (!previewFile || lastFetchedURL !== fileURL)
    ) {
      previewURL(fileURL, fileName);
    }
  });

  async function previewURL(fileUri: string, fileName: string) {
    if (!fileUri || fileUri === lastFetchedURL) return;
    lastFetchedURL = fileUri;

    console.log("Fetching preview for:", fileUri, fileName);
    previewError = null;
    previewLoading = true;
    try {
      fileURL = fileUri;
      const response = await fetch(fileUri);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch file: ${response.status} ${response.statusText}`,
        );
      }
      const blob = await response.blob();
      console.log("Blob fetched, size:", blob.size, "type:", blob.type);
      previewFile = new File([blob], fileName, {
        type: "application/pdf", // Force PDF type
      });
      console.log("previewFile created:", previewFile.name);
      verifyRemote(previewFile);
    } catch (error) {
      console.error("Error fetching preview:", error);
      lastFetchedURL = ""; // Reset on error to allow retry
      // Surface the reason on the page. A silent console error leaves the
      // preview pane blank with nothing to explain it.
      previewError =
        error instanceof Error
          ? error.message
          : "Gagal memuat dokumen dari server.";
    } finally {
      previewLoading = false;
    }
  }
  function clearSearchParams() {
    const url = new URL(window.location.href);
    url.search = "";

    window.history.replaceState({}, "", url.toString());
  }

  /** Run the verification request for a file. Shared by every entry point. */
  async function callVerify(file: File) {
    const base64File = await fileToBase64(file);
    const response = await verifyDocument({
      file: base64File.replace("data:application/pdf;base64,", ""),
    });
    // The remote swallows transport failures and hands back `{ error }` with
    // no `conclusion`, which would leave the badge and the status panel blank.
    // Normalise it into a real response so a failure is legible instead of
    // looking like a document that simply has no verdict yet.
    if (!response || typeof response.conclusion !== "string") {
      return {
        conclusion: "ERROR",
        description:
          (response as { error?: string } | undefined)?.error ||
          "Verifikasi tidak dapat dijalankan.",
        signatureInformations: [],
        signatureCount: 0,
      };
    }
    return response;
  }

  /** Verify a document that lives on the server rather than in the upload set. */
  async function verifyRemote(file: File) {
    remoteResult = { ...remoteResult, loading: true };
    remoteResult = { loading: false, status: await callVerify(file) };
  }

  /**
   * Re-verify whatever is on screen: the active uploaded document when one is
   * selected, otherwise the server-side document being previewed.
   */
  async function verify() {
    if (activeId && uploaded[activeId]) {
      await verifyOne(activeId);
      return;
    }
    if (!previewFile) return;
    await verifyRemote(previewFile);
  }

  function handleEmailSubmit(e: Event) {
    e.preventDefault();

    const fullEmail = tempEmail.includes("@")
      ? tempEmail
      : `${tempEmail}@mojokertokota.go.id`;

    if (docOwner && fullEmail !== docOwner) {
      emailError = "Email tidak sesuai dengan pemilik dokumen";
      guestEmail = "";
      return;
    }

    emailError = "";
    guestEmail = fullEmail;
    if (fileURL && !previewFile) {
      previewURL(fileURL, fileName);
    }
  }

  async function downloadFile(url: string) {
    try {
      const res = await fetch(url);

      if (!res.ok) throw new Error("Failed to download");

      const blob = await res.blob();

      // Force PDF MIME type
      const pdfBlob = new Blob([blob], { type: "application/pdf" });

      const blobUrl = URL.createObjectURL(pdfBlob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download =
        url.split("/").pop()?.replace(".enc", ".pdf") || "document.pdf";
      document.body.appendChild(a);
      a.click();

      URL.revokeObjectURL(blobUrl);
      a.remove();
    } catch (err) {
      console.error(err);
      alert("Download failed");
    }
  }
</script>

<div
  class="px-5 pb-24 md:pb-2 flex gap-5 h-full flex-col md:flex-row overflow-y-auto md:overflow-y-hidden"
>
  <div id="tour-verify-preview" class="grow min-h-0 md:order-2 flex flex-col">
    {#if !isAuthorized && fileURL && !previewFile}
      <div class="flex flex-col items-center justify-center min-h-0 py-8">
        <div
          class="card bg-base-100 shadow-xl border border-base-300 w-full max-w-md"
        >
          <div class="card-body">
            <h2 class="card-title text-2xl font-bold">Verifikasi Identitas</h2>
            <p class="text-base-content/70">
              Silakan masukkan email Penandatangan untuk melanjutkan melihat
              dokumen.
            </p>
            <form onsubmit={handleEmailSubmit} class="mt-4">
              <label class="form-control w-full">
                <div class="label">
                  <span class="label-text">Alamat Email</span>
                </div>
                <div class="join w-full">
                  <input
                    type="text"
                    placeholder="nama"
                    class="input input-bordered join-item w-full"
                    class:input-error={emailError}
                    bind:value={tempEmail}
                    required
                  />
                  <div
                    class="join-item bg-base-200 flex items-center px-4 border border-l-0 border-base-content/20 text-sm opacity-60"
                  >
                    @mojokertokota.go.id
                  </div>
                </div>
                {#if emailError}
                  <div class="label">
                    <span class="label-text-alt text-error">{emailError}</span>
                  </div>
                {/if}
              </label>

              <div class="card-actions justify-end mt-6">
                <button class="btn btn-primary w-full" type="submit">
                  Buka Dokumen
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    {:else if previewLoading}
      <div
        class="grow min-h-0 rounded-2xl bg-base-200 border border-base-300 flex flex-col items-center justify-center gap-4 p-8"
      >
        <span class="loading loading-spinner loading-lg text-primary"></span>
        <div class="text-center">
          <h3 class="font-bold">Memuat Dokumen</h3>
          <p class="text-xs opacity-60 mt-1">
            Mengambil dokumen dari server, mohon tunggu…
          </p>
        </div>
      </div>
    {:else if previewError}
      <div
        class="grow min-h-0 rounded-2xl bg-base-200 border border-base-300 flex flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <iconify-icon icon="bx:error-circle" class="text-6xl text-error/60"
        ></iconify-icon>
        <h3 class="font-bold text-xl">Gagal Memuat Dokumen</h3>
        <p class="text-sm text-base-content/70 max-w-sm break-words">
          {previewError}
        </p>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onclick={() => {
            if (fileURL) previewURL(fileURL, fileName);
          }}
        >
          <iconify-icon icon="bx:refresh"></iconify-icon>
          Coba Lagi
        </button>
      </div>
    {:else if previewFile || fileURL}
      <div class="grow min-h-0 relative flex flex-col">
        <div class="grow min-h-0 overflow-y-auto">
          <Preview
            file={previewFile}
            controls
            onclose={() => {
              // Closing drops the whole upload set rather than one entry, so
              // the effect above can't immediately re-select what was closed
              // and the dropper comes back.
              uploaded = {};
              results = {};
              checksums = {};
              activeId = "";
              previewFile = null;
              fileURL = undefined;
              fileName = "";
              remoteResult = { loading: false };
              previewError = null;
              uploaderFiles = [];
            }}
            ondownload={(f) => {
              // The verify page can hold a server-side claim URL with no File
              // behind it, so prefer the local blob and fall back to the URL.
              if (f) {
                const url = URL.createObjectURL(f);
                const a = document.createElement("a");
                a.href = url;
                a.download = f.name || "document.pdf";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                return;
              }
              if (fileURL) downloadFile(fileURL);
            }}
          />
        </div>
      </div>
    {:else}
      <div class="grow min-h-0 flex flex-col">
        <Upload
          bind:files={uploaderFiles}
          bind:fileInput={uploaderInput}
          title="Pilih File untuk Verifikasi"
        />
        <!-- PDF only: `allowDocx` is intentionally omitted here. Verification
             needs a real signed PDF, and converting an editable DOCX would let
             unsigned input reach the status panel. -->
      </div>
    {/if}
  </div>

  <div class="flex flex-col md:w-sm shrink-0 min-h-0">
    <!-- Tabs Navigation -->
    <div id="tour-verify-mode" class="tabs tabs-lift w-full shrink-0">
      <label
        class="tab flex-1 {mode === 'upload' ? 'tab-active' : ''} bg-base-100"
      >
        <input
          type="radio"
          name="verify-nav"
          value="upload"
          checked={mode === "upload"}
          onchange={() => (location.hash = "!/upload")}
          class="hidden"
        />
        <iconify-icon icon="bx:upload"></iconify-icon>
        <span class="mx-2">Unggah</span>
      </label>
      <label class="tab flex-1 {mode === 'id' ? 'tab-active' : ''} bg-base-100">
        <input
          type="radio"
          name="verify-nav"
          value="id"
          checked={mode === "id"}
          onchange={() => (location.hash = "!/id")}
          class="hidden"
        />
        <iconify-icon icon="bx:search"></iconify-icon>
        <span class="mx-2">Cari</span>
      </label>
      <label
        class="tab flex-1 {mode === 'scan' ? 'tab-active' : ''} bg-base-100"
      >
        <input
          type="radio"
          name="verify-nav"
          value="scan"
          checked={mode === "scan"}
          onchange={() => (location.hash = "!/scan")}
          class="hidden"
        />
        <iconify-icon icon="bx:qr-scan"></iconify-icon>
        <span class="mx-2">Scan</span>
      </label>
    </div>

    <!-- Everything below wrapped in a container -->
    <div
      class="grow flex flex-col min-h-0 bg-base-100/50 rounded-b-xl border-x border-b border-base-300 overflow-hidden"
    >
      <!-- Tab Contents (Input Area) -->
      <div class="shrink-0 p-4">
        {#if mode === "upload"}
          <div class="space-y-4">
            <div class="alert alert-info text-xs py-2 shadow-sm">
              <iconify-icon icon="bx:info-circle" class="text-xl"
              ></iconify-icon>
              <span>Unggah dokumen PDF untuk verifikasi.</span>
            </div>
            <label id="tour-verify-input" class="floating-label w-full">
              <span>Pilih Dokumen PDF</span>
              <input
                type="file"
                accept="application/pdf"
                multiple
                class="file-input file-input-bordered w-full"
                onchange={async (e) => {
                  const target = e.target as HTMLInputElement;
                  // Snapshot before the reset below: `input.files` is a live
                  // view, so clearing the value would empty it.
                  const picked = target.files ? [...target.files] : [];
                  target.value = "";
                  if (picked.length > 0) void addFiles(picked);
                }}
              />
            </label>

            {#if uploadedIds.length > 0}
              <ul
                class="menu menu-xs w-full bg-base-200/50 rounded-xl p-2 border border-base-content/5"
              >
                <li class="menu-title w-full">
                  <div class="flex w-full gap-5 justify-between items-center">
                    <div>Dokumen ({uploadedIds.length})</div>
                    <button
                      type="button"
                      class="btn btn-xs btn-error"
                      onclick={() => {
                        uploaded = {};
                        results = {};
                        checksums = {};
                        activeId = "";
                        previewFile = null;
                        fileURL = undefined;
                        fileName = "";
                        remoteResult = { loading: false };
                        previewError = null;
                      }}
                    >
                      Hapus Semua
                    </button>
                  </div>
                </li>
                {#each uploadedIds as id, i (id)}
                  {@const entry = results[id]}
                  <li class="w-full">
                    <div
                      class="flex w-full items-center gap-1 {id === activeId
                        ? 'active'
                        : ''}"
                    >
                      <button
                        type="button"
                        class="grow min-w-0 basis-0 text-left"
                        onclick={() => selectDocument(id)}
                      >
                        <div class="truncate block">
                          {i + 1}. {uploaded[id]?.name}
                        </div>
                      </button>
                      {#if entry?.loading}
                        <span
                          class="loading loading-spinner loading-xs shrink-0"
                        ></span>
                      {:else if entry?.status}
                        {@const verdict = entry.status.conclusion}
                        <span
                          class="badge badge-xs shrink-0 {verdict === 'VALID'
                            ? 'badge-info'
                            : verdict === 'INVALID' || verdict === 'ERROR'
                              ? 'badge-error'
                              : 'badge-warning'}"
                        >
                          {verdict}
                        </span>
                      {/if}
                      <button
                        aria-label="hapus dokumen"
                        type="button"
                        class="btn btn-square btn-outline btn-xs btn-error shrink-0"
                        onclick={() => removeDocument(id)}
                      >
                        <iconify-icon icon="bx:x"></iconify-icon>
                      </button>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {:else if mode === "id"}
          <div class="space-y-4">
            <div class="alert alert-info text-xs py-2 shadow-sm">
              <iconify-icon icon="bx:search" class="text-xl"></iconify-icon>
              <span>Cari dokumen berdasarkan ID unik.</span>
            </div>
            <label class="floating-label w-full">
              <span>ID Dokumen</span>
              <input
                type="text"
                placeholder="Ex: 12345678"
                class="input input-bordered w-full"
                bind:value={idDocument}
              />
            </label>
            <button
              class="btn btn-primary w-full"
              onclick={() => (location.href = `/verify?id=${idDocument}`)}
              disabled={!idDocument}
            >
              Cari Dokumen
            </button>
          </div>
        {:else if mode === "scan"}
          <div class="space-y-4">
            <div class="alert alert-info text-xs py-2 shadow-sm">
              <iconify-icon icon="bx:qr-scan" class="text-xl"></iconify-icon>
              <span>Gunakan kamera untuk memindai QR Code.</span>
            </div>
            <div
              class="aspect-square bg-base-200 rounded-xl overflow-hidden flex flex-col items-center justify-center border-2 border-dashed border-base-content/10 gap-3 relative"
            >
              <video
                bind:this={videoEl}
                playsinline
                muted
                class="w-full h-full object-cover absolute inset-0 z-10"
              ></video>
              {#if !isScanning}
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-base-200 z-20"
                >
                  <iconify-icon icon="bx:camera" class="text-5xl opacity-20"
                  ></iconify-icon>
                  <span class="text-xs opacity-40">Kamera tidak aktif</span>
                </div>
              {/if}
            </div>
            {#if isScanning}
              <button class="btn btn-error w-full" onclick={stopScan}
                >Hentikan Kamera</button
              >
            {:else}
              <button class="btn btn-primary w-full" onclick={startScan}
                >Buka Kamera</button
              >
            {/if}
          </div>
        {/if}
      </div>

      <!-- Verification Results below -->
      <div class="divider divider-dashed mx-4 my-0 opacity-20"></div>
      <div class="flex-1 overflow-y-auto p-4 flex flex-col justify-end">
        <div id="tour-verify-status" class="space-y-6">
          <section>
            <h3
              class="font-bold text-base-content/60 mb-3 text-sm flex items-center gap-2"
            >
              <iconify-icon icon="bx:check-shield" class="text-lg"
              ></iconify-icon>
              Status Dokumen
              {#if activeId && uploaded[activeId]}
                <span class="badge badge-ghost badge-xs font-normal">
                  {uploadedIds.indexOf(activeId) + 1}/{uploadedIds.length}
                </span>
              {/if}
            </h3>
            <div class="bg-base-200 rounded-xl p-3 border border-base-300">
              {#if loading}
                <div
                  class="flex items-center gap-3 text-sm py-4 justify-center"
                >
                  <span class="loading loading-spinner text-primary"></span>
                  Verifikasi...
                </div>
              {:else if verifyUnsign}
                <div class="alert alert-warning text-xs">
                  <span>DOKUMEN VALID - TANPA E-SIGN</span>
                </div>
              {:else if verifyStatus}
                <Status {verifyStatus} {verify} />
              {:else}
                <div class="text-center py-8 text-sm opacity-40 italic">
                  Belum ada data verifikasi
                </div>
              {/if}
            </div>
          </section>

          {#if isAuthorized && previewFile}
            <section class="w-full">
              <h3
                class="font-bold text-base-content/60 mb-3 text-sm flex items-center gap-2"
              >
                <iconify-icon icon="bx:history" class="text-lg"></iconify-icon>
                Informasi Dokumen
              </h3>
              <ul
                class="menu menu-xs bg-base-200/50 rounded-xl p-2 border border-base-content/5"
              >
                {#each docsData as doc, i}
                  <li class="">
                    <details open={doc.files?.includes(fileURL || "-")}>
                      <summary>
                        <div class="truncate">{doc.title}</div>
                      </summary>
                      <ul class="before:opacity-10">
                        {#each [...(doc.files || [])].reverse() as file, ix}
                          <li>
                            <div class="flex gap-1">
                              <button
                                title={file.split("/").pop()}
                                type="button"
                                class="grow min-w-0"
                                class:active={file === fileURL}
                                onclick={() =>
                                  previewURL(file, doc.title || "default.pdf")}
                              >
                                <div class="truncate block w-50">
                                  {file.split("/").pop()}
                                </div>
                              </button>

                              {#if ix == 0}
                                <span
                                  class="badge badge-primary badge-xs shrink-0"
                                  >latest</span
                                >
                              {/if}
                              <button
                                aria-label="unduh"
                                type="button"
                                onclick={() => downloadFile(file)}
                                class="btn btn-square btn-outline btn-xs btn-primary shrink-0"
                              >
                                <iconify-icon icon="bx:download"></iconify-icon>
                              </button>
                            </div>
                          </li>
                        {/each}
                      </ul>
                    </details>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        </div>
      </div>
    </div>

    <!-- Sidebar Footer -->
  </div>
</div>

{#if app.showTour}
  <Tour
    steps={tourSteps}
    onComplete={() => {
      app.showTour = false;
      localStorage.setItem("tour-verify-last-shown", Date.now().toString());
    }}
    onSkip={() => {
      app.showTour = false;
      localStorage.setItem("tour-verify-last-shown", Date.now().toString());
    }}
  />
{/if}
