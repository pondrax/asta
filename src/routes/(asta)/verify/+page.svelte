<script lang="ts">
  import { page } from "$app/state";
  import { onDestroy, onMount } from "svelte";
  import Preview from "../sign/preview.svelte";
  import { verifyDocument } from "$lib/remotes/sign.remote";
  import { calculateFileChecksum, fileToBase64 } from "$lib/utils";
  import Status from "./status.svelte";
  import type { SignatureVerificationResponse } from "./types";

  const MODES = ["upload", "search", "scan"] as const;
  let mode: (typeof MODES)[number] = $state("upload");
  let previewFile: File | null = $state(null);
  let fileURL: string | undefined = $state();
  let verifyStatus: SignatureVerificationResponse | undefined = $state();
  let loading = $state(false);
  let checksum = $state("");

  onMount(async () => {
    if (!page.url.searchParams.get("blob")) {
      return;
    }
    const fileName = page.url.searchParams.get("fileName") || "default.pdf";
    fileURL = `blob:${location.origin}/${page.url.searchParams.get("blob")}`;

    if (fileURL) {
      try {
        const response = await fetch(fileURL);
        const blob = await response.blob();
        previewFile = new File([blob], fileName, {
          type: blob.type,
        });
        verify();
      } catch (error) {
        console.error("Error fetching blob:", error);
        clearSearchParams();
      }
    }
  });

  onDestroy(() => {
    if (fileURL) {
      URL.revokeObjectURL(fileURL);
      clearSearchParams();
    }
  });
  function clearSearchParams() {
    // Create URL without search params
    const url = new URL(window.location.href);
    url.search = "";

    // Update URL without reloading (using history API)
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
  <div class="md:w-sm flex flex-col gap-3 h-full overflow-auto p-1 shrink-0">
    <div class="font-bold text-base-content/60">
      Verifikasi Dokumen PDF Anda!
    </div>
    <div class="join w-full">
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
        <label class="floating-label">
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
        {#if checksum}
          <div class="text-base-content/60 mt-3">SHA-256 Digest</div>
          <div class="wrap-anywhere">{checksum}</div>
        {/if}
      {:else if mode === "search"}
        <div>
          Cari Dokumen yang telah ditandatangani menggunakan Aplikasi Tapak Asta
        </div>
        <label class="floating-label mt-5">
          <span>Masukkan ID dokumen</span>
          <input
            type="text"
            class="input input-sm"
            placeholder="Masukkan ID Dokumen"
          />
        </label>
      {:else if mode === "scan"}
        <div>Scan QR Code</div>
      {/if}

      <!-- <button class="btn btn-sm btn-secondary my-5">Verifikasi Dokumen!</button> -->
    </div>

    <div class="font-bold text-base-content/60 mt-10">Informasi Dokumen</div>
    <div>
      {#if loading}
        <div class="text-sm">
          <div class="loading"></div>
          Melakukan verifikasi ...
        </div>
      {:else if verifyStatus}
        <Status {verifyStatus} />
      {:else}
        <div class="text-sm text-base-content/60 -mt-2">
          Belum ada dokumen untuk diperiksa
        </div>
      {/if}
    </div>
  </div>
</div>
