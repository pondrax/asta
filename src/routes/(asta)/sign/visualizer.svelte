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
  class="bg-base-100 flex flex-col text-sm w-full"
  class:hidden={signatures.length === 0}
>
  <div class="max-h-72 overflow-auto flex flex-col gap-2 p-1.5">
    {#each signatures as pl, idx (pl.id)}
      {@const kind = kindOf(pl)}
      <div
        class="group flex flex-col gap-1.5 p-2 rounded-lg border border-base-300 bg-base-100 hover:bg-base-200/50 transition-colors {selectedId ===
        pl.id
          ? 'border-primary bg-primary/10 shadow-sm'
          : ''}"
      >
        <!-- Line 1: Thumbnail with top-right sign icon, Title/Type, Hal, and Delete Button (on hover) -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <div class="relative inline-flex flex-none">
              <button
                type="button"
                class="btn btn-xs p-0 w-10 h-6 bg-center bg-no-repeat bg-contain bg-white rounded border border-base-300 tooltip"
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
                    class="text-xs"
                  ></iconify-icon>
                {/if}
              </button>
            </div>
            <span class="text-[11px] font-medium truncate capitalize">
              {kind === "signature" ? `#${idx + 1}` : kind}
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <div class="flex bg-base-200/60 rounded border border-base-300 overflow-hidden items-center px-1">
              <span class="text-[9px] text-base-content/60 px-1">Hal</span>
              <input
                type="number"
                bind:value={pl.page}
                min="1"
                class="input input-xs input-ghost w-8 text-center tabular-nums p-0 h-5 min-h-0 text-[11px] !border-0 !outline-none focus:ring-0 focus:bg-transparent"
              />
            </div>

            <button
              type="button"
              class="btn btn-xs btn-error btn-square opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Hapus item"
              onclick={() => {
                if (onDelete) onDelete(pl.id);
                else signatures = signatures.filter((s) => s.id !== pl.id);
              }}
            >
              <iconify-icon icon="bx:x" class="text-sm"></iconify-icon>
            </button>
          </div>
        </div>

        <!-- Line 2: Flex Inputs for X, Y, Width, Height -->
        <div class="flex w-full bg-base-200/50 rounded border border-base-300 overflow-hidden text-[10px]">
          <div class="flex flex-col items-center flex-1 px-1 py-0.5 border-r border-base-300">
            <span class="text-[8px] text-base-content/50 uppercase">X</span>
            <input
              type="number"
              bind:value={pl.originX}
              class="input input-xs input-ghost w-full text-center p-0 h-4 min-h-0 text-[10px] tabular-nums !border-0 !outline-none focus:ring-0 focus:bg-transparent"
            />
          </div>
          <div class="flex flex-col items-center flex-1 px-1 py-0.5 border-r border-base-300">
            <span class="text-[8px] text-base-content/50 uppercase">Y</span>
            <input
              type="number"
              bind:value={pl.originY}
              class="input input-xs input-ghost w-full text-center p-0 h-4 min-h-0 text-[10px] tabular-nums !border-0 !outline-none focus:ring-0 focus:bg-transparent"
            />
          </div>
          <div class="flex flex-col items-center flex-1 px-1 py-0.5 border-r border-base-300">
            <span class="text-[8px] text-base-content/50 uppercase">W</span>
            <input
              type="number"
              bind:value={pl.width}
              class="input input-xs input-ghost w-full text-center p-0 h-4 min-h-0 text-[10px] tabular-nums !border-0 !outline-none focus:ring-0 focus:bg-transparent"
            />
          </div>
          <div class="flex flex-col items-center flex-1 px-1 py-0.5">
            <span class="text-[8px] text-base-content/50 uppercase">H</span>
            <input
              type="number"
              bind:value={pl.height}
              step="1"
              class="input input-xs input-ghost w-full text-center p-0 h-4 min-h-0 text-[10px] tabular-nums !border-0 !outline-none focus:ring-0 focus:bg-transparent"
            />
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>
