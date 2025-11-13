<script lang="ts">
  import { formatFileSize } from "$lib/utils";

  let {
    documents = $bindable([]),
    activeIndex = $bindable(0),
    fileInput,
  }: {
    documents: File[];
    activeIndex: number;
    fileInput: HTMLInputElement | null;
  } = $props();
</script>

<ul class="menu h-full overflow-auto flex-nowrap bg-base-100 rounded-xl w-full">
  <li class="menu-title sticky -top-2 bg-inherit z-1">
    <div class="flex gap-5 justify-between bg-transparent">
      <div>File Dokumen ({documents.length})</div>
      <button class="btn btn-xs btn-primary" onclick={() => fileInput?.click()}>
        <iconify-icon icon="bx:plus"></iconify-icon>
        Tambah
      </button>
    </div>
  </li>
  {#each documents as doc, i}
    <li class={activeIndex === i ? "bg-primary/60" : ""}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div onclick={() => (activeIndex = i)}>
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
          onclick={() => {
            documents.splice(i, 1);
            activeIndex = Math.max(0, activeIndex - 1);
          }}
        >
          <iconify-icon icon="bx:trash"></iconify-icon>
        </button>
      </div>
    </li>
  {/each}
  <!-- {#each Array.from({ length: 50 }) as _, i}
    <li>
      <div>
        <span class="truncate">
          {i + 1}. Item jahsfbjhbasfj sfajhfs jhsfa jhsaf jhaf fsahj sfjh
          fsajhfs jhfsa jhfs jhasf jafhs asfhj jh jh {i + 1}
        </span>
        <button
          class="btn btn-error btn-xs tooltip"
          aria-label="Hapus"
          data-tip="Hapus"
        >
          <iconify-icon icon="bx:trash"></iconify-icon>
        </button>
      </div>
    </li>
  {/each} -->
</ul>
