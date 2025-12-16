<script lang="ts">
  import { formatFileSize } from "$lib/utils";

  let {
    documents = $bindable({}),
    activeIndex = $bindable(""),
    fileInput,
  }: {
    documents: Record<string, File>;
    activeIndex: string;
    fileInput: HTMLInputElement | null;
  } = $props();

  const listDocuments = $derived(Object.entries(documents));
</script>

<ul class="menu h-full overflow-auto flex-nowrap bg-base-100 rounded-xl w-full">
  <li class="menu-title sticky -top-2 bg-inherit z-1">
    <div class="flex gap-5 justify-between bg-transparent items-center">
      <div>File Dokumen ({listDocuments.length})</div>
      <div class="join">
        <button
          class="btn btn-sm btn-primary join-item"
          onclick={() => fileInput?.click()}
        >
          <iconify-icon icon="bx:plus"></iconify-icon>
          Tambah
        </button>
        {#if listDocuments.length > 0}
          <button
            class="btn btn-sm btn-error join-item"
            onclick={() => {
              activeIndex = "";
              documents = {};
            }}
          >
            Hapus Semua
          </button>
        {/if}
      </div>
    </div>
  </li>
  {#each listDocuments as [key, doc], i}
    <li class={activeIndex === key ? "bg-primary/60" : ""}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div onclick={() => (activeIndex = key)}>
        <span class="truncate">
          {i + 1}. {doc.name}
        </span>
        <span class="text-base-content/60">
          {formatFileSize(doc.size)}
        </span>
        <button
          class="btn btn-error btn-xs tooltip"
          aria-label="Hapus"
          data-tip="Hapus"
          onclick={(event) => {
            event.stopPropagation();
            delete documents[key];
            activeIndex = listDocuments[i - 1]?.[0] || "";
            // activeIndex = Math.max(0, activeIndex - 1);
          }}
        >
          <iconify-icon icon="bx:trash"></iconify-icon>
        </button>
      </div>
    </li>
  {/each}
</ul>
