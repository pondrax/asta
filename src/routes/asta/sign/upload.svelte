<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    files = $bindable([]),
    fileInput = $bindable(null),
  }: {
    children?: Snippet;
    files?: File[];
    fileInput: HTMLInputElement | null;
  } = $props();
  // let fileInput: HTMLInputElement | null = null;
  let dragging = $state(false);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files) {
      files = [...e.dataTransfer.files].filter(
        (f) => f.type === "application/pdf",
      );
    }
  }

  function onDrag(e: DragEvent) {
    e.preventDefault();
    dragging = e.type === "dragover";
  }
  function onChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) {
      files = [...input.files].filter((f) => f.type === "application/pdf");
      input.value = ""; // ✅ reset input so the same file can be reselected
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="h-full w-full flex justify-center items-center border-2 border-dashed rounded-2xl
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
    accept="application/pdf"
    multiple
    bind:this={fileInput}
    hidden
    onchange={onChange}
  />

  <div class="drop-area text-center cursor-pointer transition-all duration-200">
    {#if children}
      {@render children?.()}
    {:else}
      <button class="btn btn-primary btn-lg">
        Pilih File PDF
        <iconify-icon icon="bx:upload" class="ml-2"></iconify-icon>
      </button>
      <div class="text-sm text-base-content/60 my-2">
        Atau geser file ke area ini
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
