<script lang="ts">
  import type { Snippet } from "svelte";
  import { app } from "$lib/app/index.svelte";
  import {
    DOCX_MIME,
    convertDocxToPdf,
    isDocx,
    isPdf,
  } from "$lib/utils/docx";

  let {
    children,
    files = $bindable([]),
    fileInput = $bindable(null),
    title = "Pilih File PDF",
    allowDocx = false,
  }: {
    children?: Snippet;
    files?: File[];
    fileInput: HTMLInputElement | null;
    title?: string;
    /** Accept DOCX and convert it to PDF. Off by default: this dropper is shared,
     *  and only the sign page should offer the conversion. */
    allowDocx?: boolean;
  } = $props();
  // let fileInput: HTMLInputElement | null = null;
  let dragging = $state(false);
  let converting = $state(false);

  const accept = $derived(
    allowDocx
      ? `application/pdf,.docx,${DOCX_MIME}`
      : "application/pdf",
  );

  /**
   * DOCX has to be rendered to PDF before anything downstream can use it, and
   * that only happens on the server. The rest of the app is PDF-only, so the
   * conversion lives here at the edge: callers bind to `files` and always
   * receive PDFs, and never learn that DOCX was ever accepted.
   *
   * Only enabled when the caller opts in via `allowDocx`. Otherwise a DOCX is
   * just another unsupported file and is rejected with the rest.
   *
   * Files convert in parallel and keep their input order. A file that fails
   * drops out of the batch with a toast rather than failing the whole upload —
   * one corrupt file should not block the rest of a multi-file drop.
   */
  async function ingest(list: FileList | File[]) {
    const picked = [...list];
    const keep = picked.filter(isPdf);
    const toConvert = allowDocx ? picked.filter(isDocx) : [];
    const skipped = picked.length - keep.length - toConvert.length;

    if (skipped > 0) {
      app.showToast(
        "error",
        allowDocx
          ? `${skipped} file diabaikan. Hanya PDF dan DOCX yang didukung.`
          : `${skipped} file diabaikan. Hanya PDF yang didukung.`,
      );
    }
    if (keep.length === 0 && toConvert.length === 0) return;

    if (toConvert.length > 0) converting = true;
    const converted = await Promise.all(
      toConvert.map(async (file) => {
        try {
          return await convertDocxToPdf(file);
        } catch (err) {
          console.error("[docx] conversion failed", err);
          app.showToast(
            "error",
            `${file.name} gagal dikonversi: ${
              err instanceof Error ? err.message : "kesalahan tidak diketahui"
            }`,
          );
          return null;
        }
      }),
    );
    converting = false;

    const next = [...keep, ...converted.filter((f): f is File => !!f)];
    if (next.length === 0) return;
    // Replace rather than append: a new drop supersedes the previous pick.
    // Callers differ in how they consume this — the sign page drains the list,
    // but the verify page reads `files[0]` and would otherwise keep showing the
    // document from the first drop.
    files = next;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files) void ingest(e.dataTransfer.files);
  }

  function onDrag(e: DragEvent) {
    e.preventDefault();
    dragging = e.type === "dragover";
  }
  function onChange(e: Event) {
    const input = e.target as HTMLInputElement;
    // Snapshot before resetting: `input.files` is a live view onto the input,
    // so clearing `value` empties it. Reading it after the reset yields nothing.
    // The array copy also outlives the input, which matters because conversion
    // is async and the file list must still be intact by then.
    const picked = input.files ? [...input.files] : [];
    // Reset so picking the same file again still fires `change`.
    input.value = "";
    if (picked.length > 0) void ingest(picked);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  id="tour-upload"
  class="h-full w-full flex justify-center items-center border-2 border-dashed rounded-2xl min-h-[60vh]
    {dragging
    ? 'bg-primary/10 border-primary shadow-lg'
    : 'bg-base-200 border-base-300'}"
  ondrop={onDrop}
  ondragover={onDrag}
  ondragleave={onDrag}
  onclick={() => fileInput?.click()}
>
  <input
    type="file"
    {accept}
    multiple
    bind:this={fileInput}
    hidden
    onchange={onChange}
  />

  <div class="drop-area text-center cursor-pointer transition-all duration-200">
    {#if children}
      {@render children?.()}
    {:else if converting}
      <span class="loading loading-spinner loading-lg text-primary"></span>
      <div class="text-sm text-base-content/70 mt-3">
        Mengonversi DOCX ke PDF…
      </div>
    {:else}
      <button id="tour-upload-btn" class="btn btn-primary btn-lg">
        {title}
        <iconify-icon icon="bx:upload" class="ml-2"></iconify-icon>
      </button>
      <div class="text-sm text-base-content/60 mt-3">
        atau geser file ke area ini
      </div>

      <div class="text-sm text-base-content/70 mt-2">
        {#if allowDocx}
          Mendukung unggah beberapa file PDF dan DOCX
        {:else}
          Mendukung unggah beberapa file PDF
        {/if}
      </div>

      {#if allowDocx}
        <div class="text-sm text-base-content/60 mt-1">
          File DOCX otomatis dikonversi ke PDF
        </div>
      {/if}

      <div class="text-sm text-error mt-2 font-medium">
        Maksimal ukuran file: 20 MB
      </div>
    {/if}
  </div>
</div>

<!-- {#if files.length}
  <ul class="mt-4 list-none space-y-2 text-sm max-w-2xl mx-auto">
    {#each files as file}
      <li
        class="flex items-center justify-between p-2 border border-base-300 rounded-md bg-base-100"
      >
        <div class="flex items-center gap-2">
          <span class="badge badge-outline badge-primary">PDF</span>
          {file.name}
        </div>
        <span class="text-xs opacity-70">{Math.round(file.size / 1024)} KB</span
        >
      </li>
    {/each}
  </ul>
{/if} -->
