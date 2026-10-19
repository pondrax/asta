<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    x,
    y,
    width,
    height,
    scale,
    onchange,
    onselect,
    selected = false,
    resizable = true,
    children,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    onchange?: (rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => void;
    /** Fired on pointer-down so the owner can mark this box as the selection. */
    onselect?: () => void;
    /** Highlights the box as the active selection. */
    selected?: boolean;
    /** When false the resize corners are hidden (e.g. a checkbox). */
    resizable?: boolean;
    children?: Snippet;
  } = $props();

  let startX = 0;
  let startY = 0;
  let mode: "drag" | "nw" | "ne" | "sw" | "se" | null = null;

  const MIN = 10;

  function pointerDown(e: PointerEvent, m: typeof mode) {
    e.stopPropagation();
    onselect?.();
    mode = m;
    startX = e.clientX;
    startY = e.clientY;

    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
  }

  function pointerMove(e: PointerEvent) {
    if (!mode) return;

    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;

    if (mode === "drag") {
      x += dx;
      y += dy;
    }

    if (mode === "se") {
      width = Math.max(MIN, width + dx);
      height = Math.max(MIN, height + dy);
    }

    if (mode === "sw") {
      const w = Math.max(MIN, width - dx);
      x += width - w;
      width = w;
      height = Math.max(MIN, height + dy);
    }

    if (mode === "ne") {
      const h = Math.max(MIN, height - dy);
      y += height - h;
      height = h;
      width = Math.max(MIN, width + dx);
    }

    if (mode === "nw") {
      const w = Math.max(MIN, width - dx);
      const h = Math.max(MIN, height - dy);
      x += width - w;
      y += height - h;
      width = w;
      height = h;
    }

    startX = e.clientX;
    startY = e.clientY;

    onchange?.({ x, y, width, height });
  }

  function pointerUp() {
    mode = null;
    window.removeEventListener("pointermove", pointerMove);
    window.removeEventListener("pointerup", pointerUp);
  }
</script>

<div
  tabindex="0"
  role="button"
  class="absolute select-none touch-none"
  class:selected
  style="
    left: {x * scale}px;
    top: {y * scale}px;
    width: {width * scale}px;
    height: {height * scale}px;"
  onpointerdown={(e) => pointerDown(e, "drag")}
>
  {@render children?.()}

  {#if resizable}
    <!-- corners -->
    <div
      tabindex="0"
      role="button"
      class="corner touch-none nw"
      onpointerdown={(e) => pointerDown(e, "nw")}
    ></div>
    <div
      tabindex="0"
      role="button"
      class="corner touch-none ne"
      onpointerdown={(e) => pointerDown(e, "ne")}
    ></div>
    <div
      tabindex="0"
      role="button"
      class="corner touch-none sw"
      onpointerdown={(e) => pointerDown(e, "sw")}
    ></div>
    <div
      tabindex="0"
      role="button"
      class="corner touch-none se"
      onpointerdown={(e) => pointerDown(e, "se")}
    ></div>
  {/if}
</div>

<style>
  .selected {
    outline: 2px solid #2563eb;
    outline-offset: 1px;
  }
  .corner {
    position: absolute;
    width: 10px;
    height: 10px;
    background: #3b82f6;
  }
  .nw {
    top: -4px;
    left: -4px;
    cursor: nw-resize;
  }
  .ne {
    top: -4px;
    right: -4px;
    cursor: ne-resize;
  }
  .sw {
    bottom: -4px;
    left: -4px;
    cursor: sw-resize;
  }
  .se {
    bottom: -4px;
    right: -4px;
    cursor: se-resize;
  }
</style>
