<script lang="ts">
  import { page } from "$app/state";
  import { onDestroy, onMount } from "svelte";
  import Preview from "../sign/preview.svelte";
  import { getDocument, verifyDocument } from "$lib/remotes/sign.remote";
  import { calculateFileChecksum, fileToBase64 } from "$lib/utils";
  import Status from "./status.svelte";
  import type { SignatureVerificationResponse } from "./types";
  import { env } from "$env/dynamic/public";

  const MODES = ["upload", "search", "scan"] as const;
  let mode: (typeof MODES)[number] = $state("upload");
  let previewFile: File | null = $state(null);
  let fileURL: string | undefined = $state();
  let verifyStatus: SignatureVerificationResponse | undefined = $state();
  let loading = $state(false);
  let checksum = $state("");
  let idDocument = $state("");

  let fileName = $state("");
  const documents = $derived(
    getDocument({
      id: page.url.searchParams.get("id") || "",
      checksum,
    }),
  );

  onMount(async () => {
    let fileName = "";
    if (page.url.searchParams.get("blob")) {
      fileName = page.url.searchParams.get("fileName") || "default.pdf";
      fileURL = `blob:${location.origin}/${page.url.searchParams.get("blob")}`;
    }

    const doc = (await documents)[0];
    if (doc) {
      fileName = doc.title || "default.pdf";
      fileURL = doc.files?.[0] || "";
    }
    if (fileURL) {
      await previewURL(fileURL, fileName);
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
</script>

<div class="p-5 flex gap-5 h-[calc(100vh-75px)] flex-col md:flex-row">
  <div class="grow h-full min-h-200 md:order-2">
    {#if previewFile}
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
      {#if previewFile}
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
                    <li class="w-85 pb-0.5">
                      <div
                        class="flex p-0 gap-1"
                        title={file.split("/").pop()}
                        class:bg-base-300={file === fileURL}
                      >
                        <button
                          class="btn btn-sm btn-ghost join-item flex-1 justify-start mr-auto"
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

                        {#if ix == 0}
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
                        {/if}
                        <a
                          href={file}
                          target="_blank"
                          class="btn btn-sm btn-primary join-item tooltip tooltip-left"
                          download={file.split("/").pop()}
                          aria-label="Download"
                          data-tip="Download"
                        >
                          <iconify-icon icon="bx:download" class="w-5 h-5"
                          ></iconify-icon>
                        </a>
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
        {:else if verifyStatus}
          <Status {verifyStatus} {verify} />
        {:else}
          <div class="text-sm text-base-content/60">
            Belum ada dokumen untuk diperiksa
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
