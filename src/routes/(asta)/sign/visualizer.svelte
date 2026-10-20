<script lang="ts">
  import type { PlacementType } from "./types";

  type Props = {
    signatures?: PlacementType[];
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    onDelete?: (id: string) => void;
  };
  let {
    signatures = $bindable([]),
    selectedId = null,
    onSelect,
    onDelete,
  }: Props = $props();

  const kindOf = (p: PlacementType) => p.kind ?? "signature";

  function focusItem(id: string) {
    onSelect?.(id);
    const el = document.getElementById(`sign-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }
</script>

<div
  class="bg-base-100 flex flex-col text-sm"
  class:hidden={signatures.length === 0}
>
  <div class="max-h-40 overflow-auto">
    <table
      class="table table-xs table-pin-rows [&_th]:text-[10px] [&_td]:text-[10px]"
    >
      <thead>
        <tr class="text-center">
          <th>Item</th>
          <th>P</th>
          <th>x</th>
          <th>y</th>
          <th>w</th>
          <th>h</th>
          <th>#</th>
        </tr>
      </thead>
      <tbody>
        {#each signatures as pl (pl.id)}
          {@const kind = kindOf(pl)}
          <tr
            class="[&>td]:p-0 {selectedId === pl.id ? 'bg-primary/15' : ''}"
          >
            <td>
              <button
                type="button"
                class="join-item btn btn-sm p-0.5 w-20 h-8 bg-center bg-no-repeat bg-contain bg-white tooltip tooltip-right"
                aria-label="Fokuskan item"
                data-tip={kind}
                style={kind === "signature"
                  ? `background-image: url("data:image/png;base64,${(pl as any).imageBase64}")`
                  : ""}
                onclick={() => focusItem(pl.id)}
              >
                {#if kind !== "signature"}
                  <iconify-icon
                    icon={kind === "date"
                      ? "bx:calendar"
                      : kind === "checkbox"
                        ? "bx:checkbox"
                        : "bx:pencil"}
                  ></iconify-icon>
                {/if}
              </button>
            </td>
            <td>
              <input
                type="number"
                bind:value={pl.page}
                min="1"
                class="join-item input input-sm input-ghost pl-0 w-5"
              />
            </td>
            <td>
              <input
                type="number"
                bind:value={pl.originX}
                class="join-item input input-sm input-ghost pl-0 w-10"
              />
            </td>
            <td>
              <input
                type="number"
                bind:value={pl.originY}
                class="join-item input input-sm input-ghost pl-0 w-10"
              />
            </td>
            <td>
              <input
                type="number"
                bind:value={pl.width}
                class="join-item input input-sm input-ghost pl-0 w-10"
              />
            </td>
            <td>
              <input
                type="number"
                bind:value={pl.height}
                step="1"
                class="join-item input input-sm input-ghost pl-0 w-10"
              />
            </td>
            <td>
              <button
                type="button"
                class="btn btn-xs btn-error btn-square"
                aria-label="Hapus item"
                onclick={() => {
                  if (onDelete) onDelete(pl.id);
                  else signatures = signatures.filter((s) => s.id !== pl.id);
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
</div>
