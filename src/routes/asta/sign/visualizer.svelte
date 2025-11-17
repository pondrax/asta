<script lang="ts">
  import type { SignatureType } from "./types";

  type Props = {
    signatures?: SignatureType[];
  };
  let { signatures = $bindable([]) }: Props = $props();
</script>

<div class="bg-transparent flex flex-col">
  <details class="collapse collapse-arrow" open={signatures.length > 0}>
    <summary class="collapse-title px-0 py-1">
      Visualisasi Tanda Tangan ({signatures.length})
    </summary>
    <div class="collapse-content px-0 py-1">
      <div class="h-30 overflow-auto">
        <table class="table table-xs table-pin-rows">
          <thead>
            <tr class="text-center">
              <th>Gambar</th>
              <th>P</th>
              <th>x</th>
              <th>y</th>
              <th>w</th>
              <th>h</th>
              <th>#</th>
            </tr>
          </thead>
          <tbody>
            {#each signatures as signature}
              <tr class="[&>td]:p-0">
                <td>
                  <button
                    type="button"
                    class="join-item btn btn-sm p-0.5 w-20 bg-center bg-no-repeat bg-contain bg-white"
                    aria-label="Preview Signature"
                    style={`background-image: url("data:image/png;base64,${signature.imageBase64}")`}
                  >
                  </button>
                </td>
                <td>
                  <input
                    type="number"
                    bind:value={signature.page}
                    min="1"
                    class="join-item input input-sm input-ghost pl-0 w-5"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    bind:value={signature.originX}
                    class="join-item input input-sm input-ghost pl-0 w-10"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    bind:value={signature.originY}
                    class="join-item input input-sm input-ghost pl-0 w-10"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    bind:value={signature.width}
                    class="join-item input input-sm input-ghost pl-0 w-10"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    bind:value={signature.height}
                    step="1"
                    class="join-item input input-sm input-ghost pl-0 w-10"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    class="btn btn-xs btn-error btn-square"
                    aria-label="Delete Signature"
                    onclick={() => {
                      signatures = signatures.filter(
                        (sig) => sig.id !== signature.id,
                      );
                    }}
                  >
                    <iconify-icon icon="bx:x"></iconify-icon>
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <!-- <ul class="menu w-full p-0">
        <li>
          <div class="p-0">
            <div class="join-item btn btn-sm btn-outline">Image</div>
            <div class="join-item btn btn-sm btn-outline">Page</div>
            <div class="join-item btn btn-sm btn-outline">#</div>
          </div>
        </li>
        {#each signatures as signature}
          <li>
            <div class="join p-0">
              <button
                type="button"
                class="join-item btn btn-sm p-0.5 w-30 bg-center bg-no-repeat bg-contain bg-white"
                aria-label="Preview Signature"
                style={`background-image: url("data:image/png;base64,${signature.imageBase64}")`}
              >
              </button>
              <input
                type="number"
                bind:value={signature.page}
                class="join-item input input-sm w-10"
              />
              <button
                type="button"
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
          </li>
        {/each}
      </ul> -->
      <!-- <div
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
      </div> -->
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
