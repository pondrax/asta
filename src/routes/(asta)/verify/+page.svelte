<script lang="ts">
  import { page } from "$app/state";
  import { onDestroy, onMount } from "svelte";
  import Preview from "$lib/components/preview.svelte";
  import { getDocument, verifyDocument } from "$lib/remotes/sign.remote";
  import { calculateFileChecksum, fileToBase64 } from "$lib/utils";
  import Status from "./status.svelte";
  import type { SignatureVerificationResponse } from "./types";
  import { version } from "$app/environment";
  import Char from "$lib/components/char.svelte";

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
  const documents = $derived(
    getDocument({
      id: page.url.searchParams.get("id") || "",
      checksum,
    }),
  );

  const docOwner = $derived(documents.current?.[0]?.owner);
  const isAuthorized = $derived.by(() => {
    if (data.user) return true;
    if (!guestEmail) return false;
    if (documents.current === undefined) return false;
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
  });

  onDestroy(() => {
    if (fileURL) {
      URL.revokeObjectURL(fileURL);

      if (page.url.searchParams.get("blob")) {
        clearSearchParams();
      }
    }
  });

  $effect(() => {
    documents;
    (async () => {
      const doc = (await documents)[0];
      if (doc) {
        fileName = doc.title || "default.pdf";
        fileURL = doc.files?.[0] || "";
        if (!doc.esign) verifyUnsign = true;
      }
    })();
  });

  async function previewURL(fileUri: string, fileName: string) {
    try {
      fileURL = fileUri;
      const response = await fetch(fileUri);
      const blob = await response.blob();
      previewFile = new File([blob], fileName, {
        type: blob.type,
      });
      verify();
    } catch (error) {
      console.error("Error fetching blob:", error);
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

<div class="px-5 flex gap-5 h-[calc(100vh-100px)] flex-col md:flex-row">
  <div class="grow h-full min-h-200 md:order-2">
    {#if !isAuthorized && (previewFile || fileURL)}
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
    {:else if previewFile}
      <Preview file={previewFile} />
    {:else}
      <div
        class="flex flex-col items-center justify-center h-full bg-base-200 rounded-2xl border-dashed border border-base-300"
      >
        <h3 class="text-lg">Dokumen tidak ditemukan</h3>
        <p class="text-sm text-base-content/60">
          Silahkan pilih dokumen terlebih dahulu.
        </p>
      </div>
    {/if}
  </div>

  <div class="md:w-sm flex h-[calc(100vh-100px)] flex-col">
    <div class="shrink-0">
      <div class="text-xl font-bold text-base-content/60">
        Verifikasi Dokumen PDF!
      </div>
      <div class="join w-full mb-2">
        <button
          class="btn btn-sm join-item grow"
          onclick={() => (mode = "upload")}
          class:btn-primary={mode === "upload"}
        >
          Pilih Dokumen
        </button>
        <button
          class="btn btn-sm join-item grow"
          onclick={() => (mode = "search")}
          class:btn-primary={mode === "search"}
        >
          Cari ID
        </button>
        <button
          class="btn btn-sm join-item grow"
          onclick={() => (mode = "scan")}
          class:btn-primary={mode === "scan"}
        >
          Scan QR
        </button>
      </div>
      <div class="text-sm">
        {#if mode === "upload"}
          <div class="alert">Unggah untuk memverifikasi dokumen PDF.</div>
          <label class="floating-label mt-5">
            <span>Pilih Dokumen</span>
            <input
              type="file"
              accept="application/pdf"
              class="file-input file-input-sm w-full"
              onchange={async (e) => {
                const target = e.target as HTMLInputElement;
                previewFile = target.files![0];
                verify();
                checksum = await calculateFileChecksum(previewFile);
              }}
            />
          </label>
          <!-- {#if checksum}
            <div class="text-base-content/60 mt-3">SHA-256 Digest</div>
            <div class="wrap-anywhere">{checksum}</div>
          {/if} -->
        {:else if mode === "search"}
          <div class="alert">Cari Dokumen tertandatangan di Tapak Asta</div>
          <label class="floating-label mt-5">
            <span>Masukkan ID dokumen</span>
            <div class="join w-full">
              <input
                type="text"
                bind:value={idDocument}
                class="input input-sm join-item"
                placeholder="Masukkan ID Dokumen"
              />
              <button
                class="btn btn-sm join-item"
                onclick={() => (location.href = `/verify?id=${idDocument}`)}
              >
                Cari
              </button>
            </div>
          </label>
        {:else if mode === "scan"}
          <div class="alert">
            <div>
              <div class="font-bold">Scan QR Code</div>
              <div class="">Fitur dalam pengembangan</div>
            </div>
          </div>
        {/if}
      </div>
      <!-- 
      <div
        class="cf-turnstile mt-3"
        data-sitekey={env.PUBLIC_TURNSTILE_KEY}
        data-size="flexible"
      ></div> -->
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto">
      {#if isAuthorized && previewFile}
        <div class="font-bold text-base-content/60 mt-10">
          Informasi Dokumen ({documents.current?.length || 0})
        </div>

        {#if documents.current && documents.current.length > 0}
          <div>Dokumen tersimpan di Tapak Asta</div>
        {:else}
          <div>Dokumen tidak ditemukan di Tapak Asta</div>
        {/if}
      {/if}
      <div class="h-[calc(100vh-500px)] overflow-y-auto overflow-x-clip">
        <ul class="menu w-full p-0">
          {#each documents.current as doc, i}
            <li class="">
              <details open={doc.files?.includes(fileURL || "-")}>
                <summary
                  class="my-1"
                  class:menu-active={doc.files?.includes(fileURL || "-")}
                >
                  <button
                    class="truncate"
                    title={doc.title}
                    onclick={() => {
                      if (doc.files)
                        previewURL(doc.files[0], doc.title || "default.pdf");
                    }}
                  >
                    {i + 1} - {doc.title}
                  </button>
                </summary>
                <ul class="menu p-0 w-full">
                  {#each doc.files?.reverse() as file, ix}
                    <li class="w-[calc(100%-16px)] pb-0.5">
                      <div
                        class="flex p-0 gap-1"
                        title={file.split("/").pop()}
                        class:bg-base-300={file === fileURL}
                      >
                        <button
                          class="btn btn-sm btn-ghost join-item flex-1 justify-start w-60 mr-auto"
                          title={file.split("/").pop()}
                          onclick={() =>
                            previewURL(file, doc.title || "default.pdf")}
                        >
                          <span class="truncate">
                            {file.split("/").pop()}
                          </span>

                          {#if ix == 0}
                            <span class="badge badge-xs badge-primary">
                              latest
                            </span>
                          {/if}
                        </button>

                        <!-- {#if ix == 0}
                          <a
                            href={`/sign?id=${doc.id}`}
                            target="_blank"
                            class="btn btn-sm btn-secondary join-item tooltip tooltip-left"
                            aria-label="Tanda Tangan"
                            data-tip="Tanda Tangan Lanjutan"
                          >
                            <iconify-icon icon="bx:pen" class="w-5 h-5"
                            ></iconify-icon>
                          </a>
                        {/if} -->
                        {#if isAuthorized}
                          <button
                            onclick={() => downloadFile(file)}
                            class="btn btn-sm btn-primary join-item tooltip tooltip-left"
                            aria-label="Download"
                            data-tip="Download"
                          >
                            <iconify-icon icon="bx:download" class="w-5 h-5"
                            ></iconify-icon>
                          </button>
                          <!-- <a
                            href={file}
                            target="_blank"
                            class="btn btn-sm btn-primary join-item tooltip tooltip-left"
                            download={file.split("/").pop()}
                            aria-label="Download"
                            data-tip="Download"
                          >
                            <iconify-icon icon="bx:download" class="w-5 h-5"
                            ></iconify-icon>
                          </a> -->
                        {/if}
                      </div>
                    </li>
                  {/each}
                </ul>
              </details>
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <div class="shrink-0">
      <div class="font-bold text-base-content/60 mt-10">Status Dokumen</div>
      <div class="">
        {#if loading}
          <div class="text-sm">
            <div class="loading"></div>
            Melakukan verifikasi ...
          </div>
        {:else if verifyUnsign}
          <div class="space-y-2">
            <div class="-mb-1">
              <button class="btn btn-sm w-full tooltip btn-warning">
                VALID &middot; NO_SIGNATURE
              </button>
              <div class="inline-flex gap-2 pt-2">
                <iconify-icon icon="bx:check"></iconify-icon>
                <div class="text-xs">
                  Dokumen hanya valid di aplikasi Tapak Asta
                </div>
              </div>
            </div>
          </div>
        {:else if verifyStatus}
          <Status {verifyStatus} {verify} />
        {:else}
          <div class="text-sm text-base-content/60">
            Belum ada dokumen untuk diperiksa
          </div>
        {/if}
      </div>
    </div>
    <div class="shrink-0 mt-5">
      <div class="text-sm flex items-end relative z-10">
        <div
          class="tooltip tooltip-right before:-translate-x-10 after:-translate-x-10"
          data-tip="Ada Pertanyaan?"
        >
          <div class="scale-80 -mt-15 -mb-12 overflow-clip">
            <Char />
          </div>
        </div>
        <div class="mr-auto">Tapak Astà v2.0.1 #{version.slice(0, 7)}</div>
      </div>
      <!-- <div class="text-sm">
        <div class="mr-auto">Tapak Astà v2.0.1 #{version.slice(0, 7)}</div>
      </div> -->
    </div>
  </div>
</div>
