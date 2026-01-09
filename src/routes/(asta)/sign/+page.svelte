<script lang="ts">
  import { version } from "$app/environment";
  import { env } from "$env/dynamic/public";
  import type { SignatureType } from "./types";
  import * as pdfLib from "$lib/utils/pdf";
  import { Modal } from "$lib/components";
  import Documents from "./documents.svelte";
  import Metadata from "./metadata.svelte";
  import Preview from "$lib/components/preview.svelte";
  import Upload from "./upload.svelte";
  import Visualizer from "./visualizer.svelte";
  import Template from "../templates/template.svelte";
  import {
    debounce,
    fileToBase64,
    createId,
    promisePool,
    generateQRCode,
    d,
  } from "$lib/utils";
  import {
    getDocument,
    getTemplates,
    signDocument,
    verifyTurnstile,
  } from "$lib/remotes/sign.remote";

  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import Dragresize from "$lib/components/dragresize.svelte";
  import Char from "$lib/components/char.svelte";

  let turnstileSuccess = $state(false);
  let loading = $state(false);
  let signButton: HTMLButtonElement | null = $state(null);
  let activeIndex = $state("");
  let documents: Record<string, File> = $state({});
  let asTemplate = $state(false);
  let asDraft = $state(false);
  // let documents: File[] = $state([]);
  // let editedDocuments: File[] | null[] = $state([]);
  let status = $state("NOT_REGISTERED");
  let bsre = $state(true);
  let form: Record<string, any> = $state({});
  let useEmail = $state(true);
  let fields: Record<string, any> = $state({});
  let hasSignature = $state(true);
  let previewFile: File | null = $state(null);
  let startTime = $state(0);
  let timer = $state(0);
  let elapsedTime = $state(0);
  let turnstileId = $state("");

  let showPassphrase = $state(false);

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
      signatureProperties: SignatureType[];
      documents: Record<string, File>;
      // files: File[];
      to?: string[];
      completed: string[];
      __token: string;
      __error?: string;
    };
    confirm?: boolean;
    template?: string;
  } = $state({});

  let fileInput: HTMLInputElement | null = $state(null);
  let files: File[] = $state([]);

  let signatures: SignatureType[] = $state([]);
  const setSignature = (sign: SignatureType) => {
    const id = signatures.findIndex((signature) => signature.id === sign.id);
    if (id > -1) {
      signatures[id] = sign;
    } else if (bsre) {
      // Only allow 1 signature for BSre
      signatures = [sign];
    } else {
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

  async function fillFormFields(file: File, signing = false, id?: string) {
    let buffer: ArrayBuffer = await file.arrayBuffer();

    if (!id) id = activeIndex;
    const checkSignature = await pdfLib.hasSignature(buffer);
    if (checkSignature) {
      if (!signing) {
        previewFile = file;
      }
      return file;
    }

    if (form.footer) {
      const base64QR = await generateQRCode({
        data: `${location.origin}/d?id=${id}`,
      });

      buffer = (
        await pdfLib.drawFooter(buffer, {
          imageBase64: base64QR as string,
          text: bsre
            ? `Dokumen ini ditandatangani menggunakan sertifikat elektronik yang diterbitkan BSrE - BSSN\n#${id}`
            : `Dokumen ini ditandatangani menggunakan Aplikasi Tapak Astà\n#${id}`,
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

  $effect(() => {
    init();
  });
  onMount(async () => {
    form = {
      footer: true,
      email: localStorage.getItem("email") || "",
      nik: "",
      nama: "",
      jabatan: "-",
      pangkat: "-",
      instansi: "-",
      tanggal: d().format("DD MMMM YYYY"),
      location: "",
      note: "Tanda Tangan Elektronik",
    };
  });

  async function fetchFile(url: string, fileName?: string) {
    const file = await fetch(url + "?" + Date.now()).then((res) => res.blob());
    return new File([file], fileName || "default.pdf", {
      type: file.type,
    });
    // return await fetch(url).then((res) => res.blob());
  }
  async function init() {
    const docId = createId(10);
    const id = page.url.searchParams.get("id");
    const templateId = page.url.searchParams.get("template");
    if (id) {
      const existing = await getDocument({ id });
      if (existing) {
        existing.forEach(async (doc) => {
          const fileUrl = doc.files?.pop();
          if (!fileUrl) return;
          const file = await fetchFile(fileUrl);
          documents[docId] = file;
          activeIndex = docId;
          form.email = doc.owner;
        });
      }
    }
    if (templateId) {
      const existing = await getTemplates({ id: templateId });
      if (existing.length > 0) initTemplate(existing[0]);
    }
  }

  async function initTemplate(item: any) {
    asTemplate = true;
    const docId = createId(10);
    const file = await fetchFile(item.file, item.name);
    documents = { [docId]: file };

    bsre = item.properties.type == "bsre";
    form.note = item.properties.description || "Tanda Tangan Elektronik";
    form.to = item.properties.to || null;
    form.footer = true;
    activeIndex = docId;
    forms.template = undefined;
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

        <Preview file={previewFile} {hasSignature}>
          {#snippet children(scale, pageSizes, gutter)}
            {#each signatures as sign}
              {@const sumPrevHeight = pageSizes
                .slice(0, sign.page - 1)
                .reduce((acc, cur) => acc + cur.height + gutter, 0)}
              <Dragresize
                x={sign.originX}
                y={sign.originY + sumPrevHeight}
                width={sign.width}
                height={sign.height}
                {scale}
                onchange={(e) => {
                  let acc = 0;
                  for (let i = 0; i < pageSizes.length; i++) {
                    const h = pageSizes[i].height;
                    if (e.y < acc + h) {
                      sign.page = i + 1;
                      sign.originY = e.y - acc;
                      break;
                    }
                    acc += h + gutter;
                  }

                  sign.originX = e.x;
                  sign.width = e.width;
                  sign.height = e.height;
                }}
              >
                <button
                  type="button"
                  class="btn btn-xs btn-circle btn-error absolute -top-6 left-1/2 -translate-x-1/2"
                  onclick={() => {
                    signatures = signatures.filter((s) => s !== sign);
                  }}
                >
                  x
                </button>
                <img
                  id={`sign-${sign.id}`}
                  src={`data:image/png;base64,${sign.imageBase64}`}
                  class="w-full h-full pointer-events-none"
                  alt="Visualisasi"
                />
              </Dragresize>
            {/each}
          {/snippet}
        </Preview>
      </div>

      <div class:hidden={hasDocuments} class="h-full">
        <Upload bind:fileInput bind:files />
      </div>
    </div>
    <div class="flex flex-col gap-3">
      <div class="grow flex min-h-0">
        <div class="tabs tabs-lift md:w-sm h-150 md:h-auto">
          <label class="tab bg-base-100">
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
          <label class="tab bg-base-100">
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
              bind:useEmail
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
      <div class="text-sm flex items-end relative z-10">
        <div
          class="tooltip tooltip-right before:-translate-x-10 after:-translate-x-10"
          data-tip="Ada Pertanyaan?"
        >
          <div class="scale-80 -mt-15 -mb-10 overflow-clip">
            <Char closeeye={showPassphrase} />
          </div>
        </div>
        <div class="mr-auto">Tapak Astà v2.0.1 #{version.slice(0, 7)}</div>
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
  <button
    class="btn btn-lg rounded-xl"
    aria-label="Template PDF"
    onclick={() => (forms.template = "open")}
  >
    Template PDF
    <iconify-icon icon="bx:book" class="text-2xl"></iconify-icon>
  </button>
</div>
<div class="fab right-18">
  <button
    bind:this={signButton}
    class="btn btn-lg btn-secondary tooltip rounded-full font-normal
    {allowSigning && forms.sign == undefined
      ? 'animate-bounce'
      : 'bg-base-300'}"
    aria-label="Sign Document"
    data-tip="Sign Document"
    disabled={!(allowSigning && forms.sign == undefined)}
    onclick={async () => {
      forms.sign = {
        ...form,
        passphrase: "",
        signatureProperties: signatures,
        documents,
        completed: [],
      } as any;
      setTimeout(() => {
        // @ts-expect-error
        turnstileId = window.turnstile.render("#turnstile-container", {
          sitekey: env.PUBLIC_TURNSTILE_KEY,
          // size: "flexible",
          callback: async function (token: string) {
            turnstileSuccess = false;

            const verify = await verifyTurnstile({ __token: token });
            if (verify.success) {
              turnstileSuccess = true;
            }
          },
        });
      }, 100);
    }}
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
    {@const total = Object.keys(item.documents).length}
    {@const completed = item.completed.length}
    <form
      class="flex flex-col gap-4"
      autocomplete="off"
      onsubmit={async (e) => {
        e.preventDefault();
        // if (asDraft) {
        //   console.log("Simpan Draft");
        //   return;
        // }
        if (!turnstileSuccess) {
          forms.sign!.__error = "Please verify the captcha";
          return;
        }
        forms.sign!.__error = "";
        elapsedTime = 0;

        if (item.completed.length == 0) {
          startTime = performance.now();
        } else {
          startTime = performance.now() - timer;
        }

        let interval = setInterval(() => {
          timer = Math.floor(performance.now() - startTime);
        }, 1000);

        loading = true;

        try {
          const docsx = Object.entries(item.documents);

          // 🔴 GLOBAL ABORT FLAG
          let abortSigning = false;

          let index = -1;
          const results = await promisePool(
            docsx,
            Number(env.PUBLIC_MAX_CONCURRENT_REQUESTS) || 1,
            async ([id, file]) => {
              index++;
              await new Promise((resolve) =>
                setTimeout(
                  resolve,
                  (500 * index) % Number(env.PUBLIC_MAX_CONCURRENT_REQUESTS) ||
                    1,
                ),
              );
              // stop immediately if any previous doc failed
              if (abortSigning) return null;

              // skip if already completed
              if (item.completed.includes(id)) {
                return null;
              }

              let attempt = 0;

              while (attempt < (Number(env.PUBLIC_MAX_RETRIES) || 1)) {
                // stop before retry
                if (abortSigning) return null;

                attempt++;

                const fileSign = await fillFormFields(file, true, id);

                let fileBase64 = await fileToBase64(fileSign);
                if (!bsre) {
                  // const buffer = await fileSign.arrayBuffer();
                  const drawSignatures = (
                    await pdfLib.drawImages(
                      await fileSign.arrayBuffer(),
                      item.signatureProperties,
                    )
                  ).buffer as ArrayBuffer;

                  const blobSignature = new Blob([drawSignatures], {
                    type: "application/pdf",
                  });

                  fileBase64 = await fileToBase64(blobSignature);
                }

                const signing = await signDocument({
                  id,
                  __manual: !bsre,
                  __asDraft: asDraft,
                  to: item.to,
                  // email: item.email,
                  // nik: item.nik,
                  ...(useEmail ? { email: item.email } : { nik: item.nik }),
                  nama: item.nama,
                  jabatan: item.jabatan || "-",
                  pangkat: item.pangkat || "-",
                  instansi: item.instansi || "-",
                  passphrase: item.passphrase,
                  note: item.note || "-",
                  location: item.location || "-",
                  signatureProperties: item.signatureProperties,
                  fileName: asTemplate
                    ? file.name.replace(".pdf", "") +
                      "_" +
                      String(item.nama).replace(/\W/g, "_") +
                      ".pdf"
                    : file.name,
                  fileBase64,
                });

                if (signing?.error) {
                  forms.sign!.__error = signing.error;
                  abortSigning = true;
                  return null;
                }

                if (signing?.file) {
                  item.completed.push(id);
                  return signing;
                }
              }
            },
          );

          elapsedTime = performance.now() - startTime;
          clearInterval(interval);

          // console.log(results);
        } catch (err: any) {
          if (err?.body) {
            const { message, issues } = err.body;
            forms.sign!.__error = `[${message}] ${issues}`;
          }
          console.error(err);
        } finally {
          loading = false;
          asTemplate = false;
          // @ts-expect-error
          window.turnstile.reset(turnstileId);
          turnstileSuccess = false;
        }
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

              <span class="badge badge-sm badge-secondary text-nowrap">
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
              onclick={() => (forms.confirm = true)}
            >
              Tutup
            </button>
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
                {!showPassphrase ? 'text-password' : ''}"
              />
              <button
                type="button"
                class="btn join-item"
                onclick={() => {
                  showPassphrase = !showPassphrase;
                }}
                aria-label="Show/Hide Passphrase"
                disabled={item.completed.length > 0}
              >
                <iconify-icon
                  icon={showPassphrase ? "bx:show" : "bx:hide"}
                  class="text-2xl"
                ></iconify-icon>
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

        <!-- <div class="divider">Atau</div> -->
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
    </form>
  {/snippet}
</Modal>

<Modal
  bind:data={forms.confirm}
  title="Anda yakin ingin menutup menu ini?"
  closeable={false}
>
  <div class="my-5">
    <p>Semua data sesi ini yang belum disimpan akan hilang.</p>
    <p>
      Anda dapat mengakses semua dokumen yang sudah ditandatangani di halaman
      dashboard setelah login.
    </p>
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
        showPassphrase = false;
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
<!-- <SignModal bind:data={forms.sign} /> -->
