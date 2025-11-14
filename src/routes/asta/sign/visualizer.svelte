<script lang="ts">
  import type { SignatureType } from "./types";

  type Props = {
    signatures?: SignatureType[];
  };
  let { signatures = $bindable([]) }: Props = $props();
</script>

<div class="bg-transparent flex flex-col">
  <details class="collapse collapse-arrow">
    <summary class="collapse-title px-0 py-1">
      Visualisasi Tanda Tangan ({signatures.length})
    </summary>
    <div class="collapse-content px-0 py-1">
      <div
        class="flex flex-wrap gap-1 justify-center h-30 overflow-scroll py-2"
      >
        {#each signatures as signature}
          <div class="shrink-0 join">
            <button
              class="join-item btn btn-sm p-0.5 w-30 bg-center bg-no-repeat bg-contain bg-white"
              aria-label="Preview Signature"
              style={`background-image: url("data:image/png;base64,${signature.imageBase64}")`}
            >
            </button>
            <button
              class="join-item btn btn-sm btn-circle btn-error"
              aria-label="Delete Signature"
              onclick={() => {
                signatures = signatures.filter(
                  (sig) => sig.id !== signature.id,
                );
              }}
            >
              <iconify-icon icon="bx:x"></iconify-icon>
            </button>
          </div>
        {/each}
      </div>
    </div>
  </details>
  <!-- <div class="menu-title w-full p-0">
    Visualisasi ({signatures.length})
  </div>
  <div class="flex flex-wrap gap-1 justify-center h-30 overflow-scroll py-2">
    {#each signatures as signature}
      <div class="shrink-0 join">
        <button
          class="join-item btn btn-sm p-0.5 w-30 bg-center bg-no-repeat bg-contain bg-white"
          aria-label="Preview Signature"
          style={`background-image: url("data:image/png;base64,${signature.imageBase64}")`}
        >
        </button>
        <button
          class="join-item btn btn-sm btn-circle btn-error"
          aria-label="Delete Signature"
          onclick={() => {
            signatures = signatures.filter((sig) => sig.id !== signature.id);
          }}
        >
          <iconify-icon icon="bx:x"></iconify-icon>
        </button>
      </div>
    {/each}
  </div> -->
</div>
