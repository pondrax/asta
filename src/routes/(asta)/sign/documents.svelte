<script lang="ts">
  import { formatFileSize } from "$lib/utils";

  let {
    documents = $bindable({}),
    activeIndex = $bindable(""),
    fileInput,
    docxFiles = {},
    onRemove,
  }: {
    documents: Record<string, File>;
    activeIndex: string;
    fileInput: HTMLInputElement | null;
    docxFiles?: Record<string, File>;
    onRemove?: (key: string) => void;
  } = $props();

  const listDocuments = $derived(Object.entries(documents));

  let checked = $state<Record<string, boolean>>({});
  let selectAllEl: HTMLInputElement | null = $state(null);

  const checkedKeys = $derived(
    listDocuments.filter(([key]) => checked[key]).map(([key]) => key),
  );
  const allChecked = $derived(
    listDocuments.length > 0 && checkedKeys.length === listDocuments.length,
  );

  $effect(() => {
    if (selectAllEl) {
      selectAllEl.indeterminate =
        checkedKeys.length > 0 && checkedKeys.length < listDocuments.length;
    }
  });

  function toggleAll(event: Event) {
    const on = (event.currentTarget as HTMLInputElement).checked;
    const next: Record<string, boolean> = {};
    if (on) for (const [key] of listDocuments) next[key] = true;
    checked = next;
  }

  function removeChecked() {
    for (const key of checkedKeys) delete documents[key];
    if (checkedKeys.includes(activeIndex)) activeIndex = "";
    checked = {};
  }

  function removeDocument(key: string) {
    if (checked[key]) {
      const next = { ...checked };
      delete next[key];
      checked = next;
    }
    if (onRemove) {
      onRemove(key);
      return;
    }
    delete documents[key];
    if (activeIndex === key) {
      activeIndex = Object.keys(documents)[0] ?? "";
    }
  }
</script>

<div id="tour-documents" class="flex flex-col h-full min-h-0 w-full">
  <div class="sticky top-0 z-1 flex flex-col gap-1 bg-base-100 px-1 py-2">
    <div class="flex items-center gap-2 px-2">
      <button
        type="button"
        class="btn btn-xs btn-primary"
        title="Tambah file dokumen"
        onclick={() => fileInput?.click()}
      >
        <iconify-icon icon="bx:file"></iconify-icon>
        Tambah File
      </button>
      {#if checkedKeys.length > 0}
        <button
          type="button"
          class="btn btn-xs btn-error ml-auto"
          onclick={removeChecked}
        >
          <iconify-icon icon="bx:trash"></iconify-icon>
          Hapus ({checkedKeys.length})
        </button>
      {/if}
    </div>
    {#if listDocuments.length > 0}
      <label
        class="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[11px] text-base-content/70 cursor-pointer select-none hover:bg-base-200"
      >
        <input
          type="checkbox"
          class="checkbox checkbox-xs shrink-0"
          aria-label="Pilih semua"
          checked={allChecked}
          bind:this={selectAllEl}
          onchange={toggleAll}
        />
        Pilih semua
        <span class="ml-auto tabular-nums text-base-content/50"
          >{checkedKeys.length}/{listDocuments.length}</span
        >
      </label>
    {/if}
  </div>

  {#if listDocuments.length === 0}
    <div
      class="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-[11px] text-base-content/50"
    >
      <iconify-icon icon="bx:file-blank" class="text-[22px]"></iconify-icon>
      <span>Belum ada dokumen</span>
    </div>
  {:else}
    <ul class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 p-1">
      {#each listDocuments as [key, doc], i (key)}
        <li class="group">
          <div
            role="button"
            tabindex="0"
            aria-current={activeIndex === key ? "true" : undefined}
            onclick={() => (activeIndex = key)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                activeIndex = key;
              }
            }}
            class="relative flex items-center gap-2 w-full ps-2 pe-9 group-hover:pe-20 py-1.5 rounded-lg cursor-pointer transition-colors {activeIndex ===
            key
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-base-200'}"
          >
            <input
              type="checkbox"
              class="checkbox checkbox-xs shrink-0"
              aria-label={`Pilih ${doc.name}`}
              checked={!!checked[key]}
              onclick={(e) => e.stopPropagation()}
              onchange={(e) => (checked[key] = e.currentTarget.checked)}
            />
            <span class="min-w-0 flex-1 truncate text-sm" title={doc.name}
              >{i + 1}. {doc.name}</span
            >
            <span
              class="shrink-0 text-[11px] text-base-content/50 group-hover:hidden"
            >
              {formatFileSize(doc.size)}
            </span>
            <div
              class="absolute end-1 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
            >
              {#if docxFiles[doc.name]}
                <span class="badge badge-secondary badge-xs">Word</span>
              {:else}
                <span class="badge badge-primary badge-xs">PDF</span>
              {/if}
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-circle text-error"
                aria-label={`Hapus ${doc.name}`}
                title={`Hapus ${doc.name}`}
                onclick={(e) => {
                  e.stopPropagation();
                  removeDocument(key);
                }}
                onkeydown={(e) => e.stopPropagation()}
              >
                <iconify-icon icon="bx:trash"></iconify-icon>
              </button>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
