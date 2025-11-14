<script lang="ts">
  import Documents from "./documents.svelte";
  import Metadata from "./metadata.svelte";
  import Preview from "./preview.svelte";
  import SignModal from "./signModal.svelte";
  import Upload from "./upload.svelte";
  import type { SignatureType } from "./types";
  import Visualizer from "./visualizer.svelte";
  import * as pdfLib from "$lib/utils/pdf";

  let signButton: HTMLButtonElement | null = $state(null);
  let activeIndex = $state(0);
  let documents: File[] = $state([]);
  let editedDocuments: File[] | null[] = $state([]);
  let status = $state("NOT_REGISTERED");
  let bsre = $state(true);
  let form: Record<string, any> = $state({
    email: "",
    nama: "",
    jabatan: "",
    pangkat: "-",
    instansi: "-",
    rank: "-",
    tanggal: "",
  });
  let fields: Record<string, any> = $state({});
  let hasSignature = $state(false);
  let footer = $state(false);

  let forms: {
    sign?: any;
  } = $state({});

  let fileInput: HTMLInputElement | null = $state(null);
  let files: File[] = $state([]);

  let signatures: SignatureType[] = $state([]);
  const setSignature = (sign: SignatureType) => {
    const id = signatures.findIndex((signature) => signature.id === sign.id);
    if (id > -1) {
      signatures[id] = sign;
    } else {
      sign.reason = form.deskripsi;
      sign.location = form.lokasi;
      signatures = [...signatures, sign];
    }
  };

  const hasDocuments = $derived(documents.length > 0);
  const hasMetadata = $derived(
    String(form.email).length > 0 && String(form.nama).length > 0 && bsre
      ? status === "ISSUE"
      : signatures.length > 0,
  );
  const allowSigning = $derived(hasDocuments && hasMetadata);

  async function getDocumentDetails(file: File) {
    const buffer = await file.arrayBuffer();
    fields = await pdfLib.getAllFormFields(buffer);
    hasSignature = await pdfLib.hasSignature(buffer);
    editedDocuments[activeIndex] = null;
  }
  async function addFooter(file: File) {
    console.log("addFooter", file);
    const buffer = await file.arrayBuffer();
    const editedBytes = await pdfLib.drawFooter(buffer, {
      text: "Dokumen ini ditandatangani menggunakan sertifikat elektronik yang diterbitkan BSrE - BSSN",
    });
    editedDocuments[activeIndex] = new File(
      [new Uint8Array(editedBytes)],
      file.name,
      {
        type: "application/pdf",
      },
    );
  }
  $effect(() => {
    if (files.length > 0) {
      documents = [...documents, ...files];
      editedDocuments = Array.from({ length: documents.length }).map(
        () => null,
      );
      files = [];
    }
  });

  $effect(() => {
    const file = documents[activeIndex];
    if (!file) return;

    if (form) {
      getDocumentDetails(file);
    }
    if (footer) {
      addFooter(file);
    } else {
      editedDocuments[activeIndex] = null;
    }
  });

  $effect(() => {
    if (hasSignature) {
      footer = false;
    }
  });
</script>

<div class="p-5">
  <div class="h-[calc(100vh-110px)] flex gap-5 flex-col md:flex-row">
    <div class="rounded-2xl grow min-h-150 sm:order-1">
      <div class:hidden={!documents[activeIndex]} class="h-full relative">
        {#if hasSignature}
          <div
            class="absolute -top-5 alert py-1 px-5 alert-warning left-0 right-0 z-5"
          >
            <iconify-icon icon="bx:error" class="text-xl"></iconify-icon>
            <span>
              <strong>Peringatan:</strong> Terdapat tanda tangan elektronik pada
              dokumen ini.
            </span>
          </div>
        {/if}
        <Preview
          file={editedDocuments[activeIndex] || documents[activeIndex]}
          {hasSignature}
        />
      </div>

      <div class:hidden={documents.length > 0} class="h-full">
        <Upload bind:fileInput bind:files />
      </div>
    </div>
    <div class="flex flex-col gap-3">
      <div class="grow flex min-h-0">
        <div class="tabs tabs-lift md:w-sm h-100 md:h-auto">
          <label class="tab">
            <input type="radio" name="sign-nav" checked />
            <iconify-icon icon="bx:file"></iconify-icon>
            <span class="mx-2"> Dokumen ({documents.length})</span>
            {#if hasDocuments}
              <iconify-icon icon="bx:check" class="text-success"></iconify-icon>
            {:else}
              <iconify-icon icon="bx:x" class="text-error"></iconify-icon>
            {/if}
          </label>
          <div class="tab-content border-base-300">
            <Documents bind:documents bind:activeIndex {fileInput} />
          </div>
          <label class="tab">
            <input type="radio" name="sign-nav" checked />
            <iconify-icon icon="bx:detail"></iconify-icon>
            <span class="mx-2"> Meta Data ({bsre ? "TTE" : "Manual"})</span>
            {#if hasMetadata}
              <iconify-icon icon="bx:check" class="text-success"></iconify-icon>
            {:else}
              <iconify-icon icon="bx:x" class="text-error"></iconify-icon>
            {/if}
          </label>
          <div class="tab-content border-base-300">
            <Metadata
              bind:status
              bind:bsre
              bind:form
              bind:footer
              {fields}
              {hasSignature}
              {setSignature}
              {signButton}
            >
              <Visualizer bind:signatures />
            </Metadata>
          </div>
        </div>
      </div>
      <div class="text-sm">
        <div class="flex gap-2">
          <div class="mr-auto">Tapak Astà v2.0.1</div>
          <a href="/asta/privacy" class="text-primary hover:underline">
            Kebijakan Privasi
          </a>
          <a href="/asta/terms" class="text-primary hover:underline">
            Kebijakan Umum
          </a>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="fab">
  <div
    tabindex="0"
    role="button"
    class="btn btn-lg btn-circle btn-primary tooltip"
    data-tip="Unggah"
  >
    <iconify-icon icon="bx:plus" class="text-2xl"></iconify-icon>
  </div>
  <div class="fab-close">
    <span class="btn btn-circle btn-lg btn-error">✕</span>
  </div>

  <button
    class="btn btn-lg rounded-xl"
    aria-label="Upload PDF"
    onclick={() => fileInput?.click()}
  >
    Unggah PDF
    <iconify-icon icon="bx:upload" class="text-2xl"></iconify-icon>
  </button>
  <button class="btn btn-lg rounded-xl" aria-label="Template PDF">
    Template PDF
    <iconify-icon icon="bx:book" class="text-2xl"></iconify-icon>
  </button>
</div>
<div class="fab right-18">
  <button
    bind:this={signButton}
    class="btn btn-lg btn-secondary tooltip rounded-full font-normal
    {allowSigning ? 'animate-bounce' : 'bg-base-300'}"
    aria-label="Sign Document"
    data-tip="Sign Document"
    disabled={!allowSigning}
    onclick={() => (forms.sign = true)}
  >
    <iconify-icon icon="bx:pen" class="text-xl"></iconify-icon>
    Tanda Tangan
  </button>
</div>

<SignModal bind:data={forms.sign} />
