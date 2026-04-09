<script lang="ts">
  import { page } from "$app/state";
  import { onDestroy, onMount } from "svelte";
  import Preview from "$lib/components/preview.svelte";
  import { getDocument, verifyDocument } from "$lib/remotes/sign.remote";
  import { calculateFileChecksum, fileToBase64 } from "$lib/utils";
  import Status from "./status.svelte";
  import Upload from "../sign/upload.svelte";
  import type { SignatureVerificationResponse } from "./types";
  import { version } from "$app/environment";
  import Char from "$lib/components/char.svelte";
  import { Tour } from "$lib/components";
  import { app } from "$lib/app/index.svelte";

  let { data } = $props();

  let guestEmail = $state("");
  let tempEmail = $state("");
  let emailError = $state("");

  const MODES = ["upload", "search", "scan"] as const;

  let mode: (typeof MODES)[number] = $state("upload");
  let previewFile: File | null = $state(null);
  let fileURL: string | undefined = $state();
  let verifyStatus: SignatureVerificationResponse | undefined = $state();
  let loading = $state(false);
  let checksum = $state("");
  let idDocument = $state("");
  let verifyUnsign = $state(false);

  let fileName = $state("");
  let uploaderFiles: File[] = $state([]);
  let uploaderInput: HTMLInputElement | null = $state(null);

  $effect(() => {
    if (uploaderFiles.length > 0) {
      previewFile = uploaderFiles[0];
      verify();
    }
  });
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
    queryParams.checksum = checksum;
  });

  const documents = getDocument(queryParams);

  const docsData = $derived(documents.current || []);

  const docOwner = $derived(docsData[0]?.owner);
  const isAuthorized = $derived.by(() => {
    if (data.user) return true;
    if (!guestEmail) return false;
    if (docsData.length === 0) return false;
    if (docOwner && guestEmail !== docOwner) return false;
    return true;
  });

  onMount(async () => {
    const urlOwner = page.url.searchParams.get("owner");
    if (urlOwner) {
      guestEmail = urlOwner;
      tempEmail = urlOwner.split("@")[0];
    }

    let localFileName = "";

    if (page.url.searchParams.get("blob")) {
      localFileName = page.url.searchParams.get("fileName") || "default.pdf";
      fileURL = `blob:${location.origin}/${page.url.searchParams.get("blob")}`;
    }

    const doc = (await documents)[0];
    if (doc) {
      localFileName = doc.title || "default.pdf";
      fileURL = doc.files?.[0] || "";
      if (!doc.esign) verifyUnsign = true;
    }

    fileName = localFileName; // Sync to state

    if (fileURL) {
      await previewURL(fileURL, localFileName);
    }

    const lastShown = localStorage.getItem("tour-verify-last-shown");
    const now = Date.now();
    if (!lastShown || now - Number(lastShown) > 3600000) {
      setTimeout(() => (app.showTour = true), 1000);
    }
  });

  onDestroy(() => {
    if (fileURL) {
      URL.revokeObjectURL(fileURL);

      if (page.url.searchParams.get("blob")) {
        clearSearchParams();
      }
    }
  });

  let lastFetchedURL = "";
  $effect(() => {
    // Sync data from search results
    const doc = docsData[0];
    if (doc) {
      if (!fileURL) {
        fileName = doc.title || "default.pdf";
        fileURL = doc.files?.[0] || "";
      }
      if (!doc.esign) verifyUnsign = true;
    }

    // Trigger preview fetch if authorized and file details are known
    if (isAuthorized && fileURL && (!previewFile || lastFetchedURL !== fileURL)) {
      previewURL(fileURL, fileName);
    }
  });

  async function previewURL(fileUri: string, fileName: string) {
    if (!fileUri || fileUri === lastFetchedURL) return;
    lastFetchedURL = fileUri;

    console.log("Fetching preview for:", fileUri, fileName);
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
      verify();
    } catch (error) {
      console.error("Error fetching preview:", error);
      lastFetchedURL = ""; // Reset on error to allow retry
    }
  }
  function clearSearchParams() {
    const url = new URL(window.location.href);
    url.search = "";

    window.history.replaceState({}, "", url.toString());
  }

  async function verify() {
    if (!previewFile) {
      return;
    }
    loading = true;
    const base64File = await fileToBase64(previewFile);
    const result = await verifyDocument({
      file: base64File.replace("data:application/pdf;base64,", ""),
    });
    verifyStatus = result;
    loading = false;
    console.log(result);
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

<div class="px-5 flex gap-5 h-full flex-col md:flex-row">
  <div id="tour-verify-preview" class="grow h-full min-h-200 md:order-2">
    {#if !isAuthorized && fileURL && !previewFile}
      <div class="flex flex-col items-center justify-center h-full">
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
    {:else if previewFile || fileURL}
      <Preview file={previewFile} />
    {:else}
      <Upload
        bind:files={uploaderFiles}
        bind:fileInput={uploaderInput}
        title="Pilih File untuk Verifikasi"
      />
    {/if}
  </div>

  <div class="flex flex-col md:w-sm shrink-0 h-full">
    <!-- Tabs Navigation (Now outside for cleaner border) -->
    <div
      id="tour-verify-mode"
      class="tabs tabs-lift w-full shrink-0 h-150 md:h-auto"
    >
      <label
        class="tab flex-1 {mode === 'upload' ? 'tab-active' : ''} bg-base-100"
      >
        <input
          type="radio"
          name="verify-nav"
          value="upload"
          bind:group={mode}
          class="hidden"
        />
        <iconify-icon icon="bx:upload"></iconify-icon>
        <span class="mx-2">Unggah</span>
      </label>
      <label
        class="tab flex-1 {mode === 'search' ? 'tab-active' : ''} bg-base-100"
      >
        <input
          type="radio"
          name="verify-nav"
          value="search"
          bind:group={mode}
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
          bind:group={mode}
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
                class="file-input file-input-bordered w-full"
                onchange={async (e) => {
                  const target = e.target as HTMLInputElement;
                  if (target.files) previewFile = target.files[0];
                  verify();
                  if (previewFile)
                    checksum = await calculateFileChecksum(previewFile);
                }}
              />
            </label>
          </div>
        {:else if mode === "search"}
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
              class="aspect-square bg-base-200 rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-base-content/10 gap-3"
            >
              <iconify-icon icon="bx:camera" class="text-5xl opacity-20"
              ></iconify-icon>
              <span class="text-xs opacity-40">Kamera tidak aktif</span>
            </div>
            <button class="btn btn-primary w-full" disabled>Buka Kamera</button>
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
    <div class="text-sm flex items-end relative z-10 shrink-0 mt-5">
      <div
        class="tooltip tooltip-right before:-translate-x-10 after:-translate-x-10"
        data-tip="Ada Pertanyaan?"
      >
        <div class="scale-75 -mt-12 -ml-5">
          <Char />
        </div>
      </div>
      <div class="mr-auto flex items-center gap-2">
        Tapak Astà v2.0.1 #{version.slice(0, 7)}
      </div>
    </div>
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
