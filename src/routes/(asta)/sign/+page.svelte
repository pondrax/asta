<script lang="ts">
  import { env } from "$env/dynamic/public";
  import type { SignatureType } from "./types";
  import * as pdfLib from "$lib/utils/pdf";
  import { debounce, fileToBase64, createId, promisePool } from "$lib/utils";
  import { Modal } from "$lib/components";
  import Documents from "./documents.svelte";
  import Metadata from "./metadata.svelte";
  import Preview from "./preview.svelte";
  import Upload from "./upload.svelte";
  import Visualizer from "./visualizer.svelte";
  import { signDocument } from "$lib/remotes/sign.remote";
  import { goto } from "$app/navigation";

  let loading = $state(false);
  let signButton: HTMLButtonElement | null = $state(null);
  let activeIndex = $state("");
  let documents: Record<string, File> = $state({});
  // let documents: File[] = $state([]);
  // let editedDocuments: File[] | null[] = $state([]);
  let status = $state("NOT_REGISTERED");
  let bsre = $state(true);
  let form: Record<string, any> = $state({
    footer: true,
    email: "pondra@mojokertokota.go.id",
    nama: "",
    jabatan: "",
    pangkat: "-",
    instansi: "-",
    tanggal: "",
    note: "Tanda Tangan Elektronik",
  });
  let fields: Record<string, any> = $state({});
  let hasSignature = $state(true);
  let previewFile: File | null = $state(null);
  let startTime = $state(0);
  let timer = $state(0);
  let elapsedTime = $state(0);

  let forms: {
    sign?: {
      email: "";
      nama: "";
      jabatan: "";
      pangkat: "";
      instansi: "";
      passphrase: "";
      note: "";
      signatureProperties: SignatureType[];
      documents: Record<string, File>;
      // files: File[];
      completed: string[];
    };
    signError?: string;
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
  const hasDocuments = $derived(Object.keys(documents).length > 0);
  const hasMetadata = $derived(
    // true ||
    String(form.email).length > 0 &&
      String(form.nama).length > 0 &&
      (bsre ? status === "ISSUE" : signatures.length > 0),
  );
  const allowSigning = $derived(hasDocuments && hasMetadata);

  async function getDocumentDetails(file: File) {
    const buffer = await file.arrayBuffer();
    fields = await pdfLib.getAllFormFields(buffer);
    hasSignature = await pdfLib.hasSignature(buffer);

    await pdfLib.fillFormFields(buffer, form);
  }

  async function fillFormFields(file: File, signing = false) {
    let buffer: ArrayBuffer = await file.arrayBuffer();

    const checkSignature = await pdfLib.hasSignature(buffer);
    if (checkSignature) {
      if (!signing) {
        previewFile = file;
      }
      return file;
    }
    // console.log(form.footer, "footer");
    if (form.footer) {
      buffer = (
        await pdfLib.drawFooter(buffer, {
          text: "Dokumen ini ditandatangani menggunakan sertifikat elektronik yang diterbitkan BSrE - BSSN",
        })
      ).buffer as ArrayBuffer;
    }

    const filled = await pdfLib.fillFormFields(buffer, form);

    const filledFile = new File([new Uint8Array(filled)], file.name, {
      type: "application/pdf",
    });
    if (!signing) {
      previewFile = filledFile;
    }
    return filledFile;
  }

  //@ts-expect-error
  const debounceFillFormFields = debounce(() => {
    fillFormFields(documents[activeIndex]);
  }, 500);

  $effect(() => {
    if (files.length > 0) {
      documents = Object.fromEntries(files.map((file) => [createId(10), file]));
      activeIndex = Object.keys(documents)[0];
      files = [];
    }
  });

  $effect(() => {
    if (!documents[activeIndex]) return;

    getDocumentDetails(documents[activeIndex]);
    const serialized = JSON.stringify(form);
    //@ts-expect-error
    debounceFillFormFields();
  });

  $effect(() => {
    if (hasSignature) {
      form.footer = false;
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
            <button
              type="button"
              class="btn btn-xs btn-primary"
              onclick={() => {
                const file = documents[activeIndex];
                const blobURL = URL.createObjectURL(file);
                const blobId = blobURL.split("/").pop();
                goto(`/verify?blob=${blobId}&fileName=${file.name}`);
              }}
            >
              Verifikasi
            </button>
          </div>
        {/if}
        <Preview file={previewFile} {hasSignature} />
      </div>

      <div class:hidden={hasDocuments} class="h-full">
        <Upload bind:fileInput bind:files />
      </div>
    </div>
    <div class="flex flex-col gap-3">
      <div class="grow flex min-h-0">
        <div class="tabs tabs-lift md:w-sm h-150 md:h-auto">
          <label class="tab">
            <input type="radio" name="sign-nav" checked />
            <iconify-icon icon="bx:file"></iconify-icon>
            <span class="mx-2"> Dokumen ({Object.keys(documents).length})</span>
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
            <!-- bind:footer -->
            <Metadata
              bind:status
              bind:bsre
              bind:form
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
    onclick={async () =>
      (forms.sign = {
        ...form,
        passphrase: "",
        signatureProperties: signatures,
        documents,
        completed: [],
        // fileNames: documents.map((doc) => doc.name),
        // files: await Promise.all(
        //   documents.map(async (doc) => await fillFormFields(doc)),
        // ),
        // completed: documents.map(() => false),
        // files: documents.map((_, i) => editedDocuments[i] || documents[i]),
      } as any)}
  >
    <iconify-icon icon="bx:pen" class="text-xl"></iconify-icon>
    Tanda Tangan
  </button>
</div>

<Modal
  bind:data={forms.sign}
  title={`Tanda Tangan Dokumen (${Object.keys(forms.sign?.documents || {}).length})`}
  closeable={!forms.sign?.completed?.length}
>
  <!-- <h1>Tanda Tangan</h1> -->
  {#snippet children(item)}
    <form
      class="flex flex-col gap-4"
      autocomplete="off"
      onsubmit={async (e) => {
        e.preventDefault();
        forms.signError = "";
        if (item.completed.length == 0) {
          startTime = performance.now();
        }

        elapsedTime = 0;
        let interval = setInterval(() => {
          timer = Math.floor(performance.now() - startTime);
        }, 1000);

        loading = true;

        try {
          const docsx = Object.entries(item.documents);

          // 🔴 GLOBAL ABORT FLAG
          let abortSigning = false;

          const results = await promisePool(
            docsx,
            Number(env.PUBLIC_MAX_CONCURRENT_REQUESTS) || 1,
            async ([id, file]) => {
              // stop immediately if any previous doc failed
              if (abortSigning) return null;

              // skip if already completed
              if (item.completed.includes(id)) {
                return null;
              }

              let attempt = 0;

              while (attempt < Number(env.PUBLIC_MAX_RETRIES) || 1) {
                // stop before retry
                if (abortSigning) return null;

                attempt++;

                const fileSign = await fillFormFields(file, true);

                // stop before sending sign request
                if (abortSigning) return null;

                const signing = await signDocument({
                  id,
                  email: item.email,
                  nama: item.nama,
                  jabatan: item.jabatan,
                  pangkat: item.pangkat,
                  instansi: item.instansi,
                  passphrase: item.passphrase,
                  note: item.note,
                  signatureProperties: item.signatureProperties,
                  fileName: file.name,
                  fileBase64: await fileToBase64(fileSign),
                });

                console.log(signing);
                // ❌ FIRST ERROR → STOP EVERYTHING
                if (signing?.error) {
                  forms.signError = signing.error;
                  abortSigning = true;
                  return null;
                }

                // ✅ SUCCESS
                if (signing?.file) {
                  item.completed.push(id);
                  return signing;
                }
              }
            },
          );

          elapsedTime = performance.now() - startTime;
          clearInterval(interval);

          console.log(results);
        } catch (err) {
          console.error(err);
        }
        loading = false;
      }}
    >
      <ul
        class=" w-full min-h-30 max-h-100 overflow-y-auto p-0 list-decimal pl-12"
      >
        {#each Object.entries(item.documents) as [id, file]}
          <li>
            <a
              href={item.completed.includes(id)
                ? `/verify?id=${id}`
                : undefined}
              target="_blank"
              class="flex justify-between w-full btn btn-sm btn-ghost gap-1 p-1"
            >
              <div class="text-sm text-base-content/80 truncate mr-auto">
                {file.name}
              </div>

              <span class="badge badge-sm badge-secondary">
                {(file.size / 1024).toFixed(2)} KB
              </span>
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
            </a>
          </li>
        {/each}
      </ul>
      <div class="flex justify-between h-8 text-base-content/60 text-sm">
        {#if loading}
          Proses Penandatangan... ({item.completed.length}/{Object.keys(
            item.documents,
          ).length})
          <span>({Math.floor(timer / 1000)} detik)</span>
        {:else if forms.signError}
          <span class="text-error">{forms.signError}</span>
        {:else if item.completed.length == 0}
          <span>Masukkan Passphrase untuk menandatangani dokumen</span>
        {/if}
      </div>

      {#if item.completed.length == Object.keys(item.documents).length}
        <div role="alert" class="alert">
          <iconify-icon icon="bx:check-circle" class="text-3xl text-success"
          ></iconify-icon>
          <span>
            {item.completed.length} Dokumen berhasil ditandatangani
            <strong class="text-sm text-base-content/80">
              ({(elapsedTime / 1000).toFixed(2)} detik)
            </strong>
          </span>

          <div>
            <a
              href={`/verify?id=${item.completed.join(",")}`}
              target="_blank"
              class="btn btn-sm btn-success"
            >
              Lihat Dokumen
            </a>
            <button
              type="button"
              class="btn btn-sm btn-error"
              onclick={() => {
                if (
                  !confirm(
                    "Apakah Anda yakin ingin menutup halaman ini?\nSemua data yang belum disimpan akan hilang.",
                  )
                ) {
                  return;
                }
                forms.sign = undefined;
                documents = {};
              }}
            >
              Tutup
            </button>
          </div>
        </div>
      {:else}
        <label class="floating-label">
          <span>Email Penandatangan</span>
          <input
            type="text"
            value={item.email}
            placeholder="mail@mojokertokota.go.id"
            class="input"
            readonly
          />
        </label>

        <label class="floating-label">
          <span>Passphrase</span>
          <div class="join w-full">
            <input
              type="text"
              bind:value={item.passphrase}
              autocomplete="off"
              placeholder="Masukkan Passphrase"
              class="input input-bordered join-item text-password grow"
            />
            <button
              type="button"
              class="btn join-item"
              onclick={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                const input = btn.previousElementSibling as HTMLInputElement;
                const icon = btn.querySelector("iconify-icon");
                const masked = input.classList.toggle("text-password");
                icon?.setAttribute("icon", masked ? "bx:show" : "bx:hide");
              }}
              aria-label="Show/Hide Passphrase"
            >
              <iconify-icon icon="bx:show" class="text-2xl"></iconify-icon>
            </button>
          </div>

          <!-- <input
            bind:value={item.passphrase}
            type="password"
            placeholder="Passphrase"
            class="input"
            autocomplete="new-password"
          /> -->
        </label>

        <button type="submit" class="btn btn-primary" disabled={loading}>
          <iconify-icon icon="bx:pen" class="text-2xl"></iconify-icon>
          Tanda Tangan
        </button>
      {/if}
    </form>
  {/snippet}
</Modal>

<!-- <SignModal bind:data={forms.sign} /> -->
