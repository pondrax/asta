<script lang="ts">
  import { getSchema, modifySchema } from "$lib/remotes/designer.remote";
  import { Modal } from "$lib/components";
  import { app } from "$lib/app/index.svelte";
  import { untrack } from "svelte";

  // Data fetching - following the project's reactive pattern
  const schema = $derived(getSchema({}));
  const businessSchema = $derived(
    (schema.current || []).filter((t: any) => !t.name.startsWith("__")),
  );

  // Local state
  let showAddTableModal = $state(false);
  let showAddColumnModal = $state(false);
  let showAlterColumnModal = $state(false);
  let selectedTableName = $state("");
  let selectedColumn = $state<any>(null);

  let newTable = $state({ name: "" });
  let newColumn = $state({ name: "", type: "text", nullable: true });

  // Canvas State & Dragging Logic
  let pan = $state({ x: 0, y: 0 });
  let zoom = $state(1);
  let isPanning = $state(false);

  let positions = $state<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});
  /** Real card heights, measured from the DOM — column counts differ wildly. */
  let heights = $state<Record<string, number>>({});
  /** Set once the user drags a card, so auto-layout stops fighting them. */
  let userMoved = $state(false);
  /** Card under the cursor; its connectors light up. */
  let hoveredTable = $state<string | null>(null);
  let activeTable = $state<string | null>(null);
  let isDragging = $state(false);
  let dragOffset = { x: 0, y: 0 };
  /** Pointer that owns the current drag/pan, so stray events are ignored. */
  let activePointerId: number | null = null;

  /** Fixed card width, plus the height assumed before a card is measured. */
  const CARD_W = 260;
  const CARD_H = 300;
  /** Vertical spot on the card edge where connectors attach (under the header). */
  const ANCHOR_Y = 44;
  /** Closer than this and two cards count as stacked, so the line goes top/bottom. */
  const SIDE_GAP = CARD_W / 2;

  type Side = "left" | "right" | "top" | "bottom";

  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v));

  /** Slots along one card edge, shared by the dots and the line endpoints so
   *  every connector meets its own dot instead of all piling onto one spot. */
  const slots = (count: number) =>
    Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * 14);

  /** Positions a port dot on a card edge, on the same slot its line starts from. */
  function portStyle(name: string, side: Side, i: number, n: number) {
    if (!positions[name]) return "";
    const offset = slots(n)[i];

    switch (side) {
      case "left":
        return `left: -4px; top: ${ANCHOR_Y + offset}px;`;
      case "right":
        return `right: -4px; top: ${ANCHOR_Y + offset}px;`;
      case "top":
        return `top: -4px; left: ${CARD_W / 2 + offset}px;`;
      case "bottom":
        return `bottom: -4px; left: ${CARD_W / 2 + offset}px;`;
    }
  }

  let uniqueConnections = $derived.by(() => {
    if (!businessSchema.length) return [];
    const lines: Array<{ source: string; target: string }> = [];
    const seen = new Set<string>();

    for (const table of businessSchema) {
      if (!table.relations) continue;
      for (const rel of table.relations) {
        if (!positions[table.name] || !positions[rel.targetTable]) continue;
        // Sort to ensure A -> B and B -> A generate the same identifier
        const pair = [table.name, rel.targetTable].sort().join("::");
        if (!seen.has(pair)) {
          seen.add(pair);
          lines.push({ source: table.name, target: rel.targetTable });
        }
      }
    }
    return lines;
  });

  /** Which edge of each table a relation should use, based on real geometry —
   *  so lines always leave one side and arrive on the facing side. */
  function routeSides(a: string, b: string): [Side, Side] {
    const pa = positions[a];
    const pb = positions[b];
    if (!pa || !pb) return ["right", "left"];

    const dx = pb.x - pa.x;
    const dy = pb.y - (pa.y + (heights[a] ?? pa.h) / 2);

    if (Math.abs(dx) > SIDE_GAP) {
      return dx > 0 ? ["right", "left"] : ["left", "right"];
    }
    // Cards sit in the same column: route through their top/bottom instead of
    // slicing back across the cards.
    return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
  }

  /** Resolves one connection to concrete anchor points, route sides, and the
   *  slot index used on each end, so dots and lines always agree. */
  function resolveLink(conn: { source: string; target: string }) {
    const [a, b] = routeSides(conn.source, conn.target);

    // Count how many links share each side, then give this one a stable slot
    // within that group so multiple lines fan out instead of overlapping.
    const total = (name: string, side: Side) =>
      uniqueConnections.reduce((n, c) => {
        const [s1, s2] = routeSides(c.source, c.target);
        return (
          n +
          (c.source === name && s1 === side ? 1 : 0) +
          (c.target === name && s2 === side ? 1 : 0)
        );
      }, 0);
    const before = (name: string, side: Side) =>
      uniqueConnections.reduce((n, c) => {
        if (c === conn) return n;
        const [s1, s2] = routeSides(c.source, c.target);
        return (
          n +
          (c.source === name && s1 === side ? 1 : 0) +
          (c.target === name && s2 === side ? 1 : 0)
        );
      }, 0);

    const offA = slots(total(conn.source, a))[before(conn.source, a)];
    const offB = slots(total(conn.target, b))[before(conn.target, b)];

    return { a, b, offA, offB };
  }

  /** Resolves an anchor point on a card edge, offset by its slot along the edge. */
  function anchorPos(tableName: string, side: Side, offset = 0) {
    const pos = positions[tableName];
    if (!pos) return { x: 0, y: 0 };
    const h = heights[tableName] ?? pos.h;

    switch (side) {
      case "left":
        return { x: pos.x, y: pos.y + ANCHOR_Y + offset };
      case "right":
        return { x: pos.x + pos.w, y: pos.y + ANCHOR_Y + offset };
      case "top":
        return { x: pos.x + pos.w / 2 + offset, y: pos.y };
      case "bottom":
        return { x: pos.x + pos.w / 2 + offset, y: pos.y + h };
    }
  }

  /** Unit normal pointing away from the card on each edge. */
  const SIDE_NORMAL: Record<Side, { x: number; y: number }> = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
  };

  /** Cubic bezier whose control points are pushed *outward* along each card's
   *  edge normal, so a line always leaves and arrives away from the card instead
   *  of doubling back through it. Correct for all 16 side combinations, not just
   *  the right-to-left case. */
  function linkPath(
    from: Side,
    p1: { x: number; y: number },
    to: Side,
    p2: { x: number; y: number },
  ) {
    const n1 = SIDE_NORMAL[from];
    const n2 = SIDE_NORMAL[to];

    // Handle length follows the overall distance, so short hops stay tight and
    // long hauls get a generous, readable sweep.
    const gap = Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
    const d1 = clamp(gap * 0.5, 40, 160);
    const d2 = clamp(gap * 0.5, 40, 160);

    const c1x = p1.x + n1.x * d1;
    const c1y = p1.y + n1.y * d1;
    const c2x = p2.x + n2.x * d2;
    const c2y = p2.y + n2.y * d2;

    return `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  /** Connections resolved to concrete anchor points and route sides. */
  const links = $derived.by(() =>
    uniqueConnections.map((conn) => {
      const { a, b, offA, offB } = resolveLink(conn);
      const from = anchorPos(conn.source, a, offA);
      const to = anchorPos(conn.target, b, offB);
      const active =
        hoveredTable === conn.source || hoveredTable === conn.target;
      return {
        id: `${conn.source}::${conn.target}`,
        from,
        to,
        active,
        d: linkPath(a, from, b, to),
      };
    }),
  );

  /** The slot each connection occupies on each edge, for drawing its dot. */
  const portSlots = $derived.by(() => {
    const map: Record<string, { side: Side; index: number; count: number }[]> =
      {};
    for (const table of businessSchema) map[table.name] = [];

    for (const conn of uniqueConnections) {
      const { a, b, offA, offB } = resolveLink(conn);
      const push = (name: string, side: Side, offset: number) => {
        if (!map[name]) return;
        const group = uniqueConnections.filter((c) => {
          const [s1, s2] = routeSides(c.source, c.target);
          return (
            (c.source === name && s1 === side) ||
            (c.target === name && s2 === side)
          );
        });
        const index = slots(group.length).indexOf(offset);
        map[name].push({ side, index, count: group.length });
      };
      push(conn.source, a, offA);
      push(conn.target, b, offB);
    }
    return map;
  });

  /** Re-runs whenever a card is measured, so rows never overlap. */
  let heightSig = $derived(
    businessSchema.map((t: any) => heights[t.name] ?? 0).join(","),
  );

  $effect(() => {
    heightSig;
    if (userMoved || !businessSchema.length) return;
    untrack(() => autoLayout());
  });

  function autoLayout() {
    if (!businessSchema.length) return;
    const padding = 60;
    const cols = Math.ceil(Math.sqrt(businessSchema.length));
    const rows = Math.ceil(businessSchema.length / cols);

    // Find the tallest card in every row *first* — a card with many columns or
    // a REFS block must push the whole next row down, never be overlapped.
    const rowHeights = new Array<number>(rows).fill(CARD_H);
    businessSchema.forEach((table: any, i: number) => {
      const row = Math.floor(i / cols);
      rowHeights[row] = Math.max(
        rowHeights[row],
        heights[table.name] ?? CARD_H,
      );
    });

    const rowTops = new Array<number>(rows);
    let y = 120; // clear of the floating header
    for (let r = 0; r < rows; r++) {
      rowTops[r] = y;
      y += rowHeights[r] + padding;
    }

    businessSchema.forEach((table: any, i: number) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const h = heights[table.name] ?? CARD_H;
      positions[table.name] = {
        x: 40 + col * (CARD_W + padding),
        y: rowTops[row],
        w: CARD_W,
        h,
      };
    });
  }

  function runAutoLayout() {
    userMoved = false;
    autoLayout();
  }

  /** Keeps `heights` in sync with the rendered card so layout sees real sizes. */
  function measure(node: HTMLElement, name: string) {
    const sync = () => {
      const h = node.offsetHeight;
      if (heights[name] === h) return;
      heights = { ...heights, [name]: h };
      const pos = positions[name];
      if (pos) pos.h = h;
    };
    const ro = new ResizeObserver(sync);
    ro.observe(node);
    sync();
    return { destroy: () => ro.disconnect() };
  }

  function startDrag(e: PointerEvent, tableName: string) {
    if (/button/i.test((e.target as HTMLElement).tagName)) return;
    e.stopPropagation();
    activeTable = tableName;
    hoveredTable = tableName;
    isDragging = true;
    userMoved = true;
    activePointerId = e.pointerId;
    dragOffset = {
      x: e.clientX / zoom - positions[tableName].x,
      y: e.clientY / zoom - positions[tableName].y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onCanvasDown(e: PointerEvent) {
    if (activeTable) return;
    isPanning = true;
    activePointerId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onCanvasMove(e: PointerEvent) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;

    if (isDragging && activeTable) {
      positions[activeTable].x = e.clientX / zoom - dragOffset.x;
      positions[activeTable].y = e.clientY / zoom - dragOffset.y;
    } else if (isPanning) {
      pan.x += e.movementX;
      pan.y += e.movementY;
    }
  }

  function onCanvasUp(e: PointerEvent) {
    // `pointerleave` bubbles from every child card, so a naive handler here
    // would cancel the drag the moment the pointer left the card. Only the
    // pointer that started the gesture may end it.
    if (activePointerId !== null && e.pointerId !== activePointerId) return;

    isDragging = false;
    isPanning = false;
    activeTable = null;
    activePointerId = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (e) {}
  }

  function onCanvasWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const newZoom = Math.max(0.2, Math.min(zoom - e.deltaY * 0.005, 2));
      const zoomRatio = newZoom / zoom;
      pan.x = e.clientX - (e.clientX - pan.x) * zoomRatio;
      pan.y = e.clientY - (e.clientY - pan.y) * zoomRatio;
      zoom = newZoom;
    } else {
      pan.x -= e.deltaX;
      pan.y -= e.deltaY;
    }
  }

  const columnTypes = [
    { label: "Text", value: "text", color: "badge-info" },
    { label: "Integer", value: "integer", color: "badge-warning" },
    { label: "Boolean", value: "boolean", color: "badge-success" },
    { label: "Timestamp", value: "timestamp", color: "badge-secondary" },
    { label: "JSON", value: "json", color: "badge-ghost" },
  ];

  function openAddColumn(tableName: string) {
    selectedTableName = tableName;
    newColumn = { name: "", type: "text", nullable: true };
    showAddColumnModal = true;
  }

  function openAlterColumn(tableName: string, col: any) {
    selectedTableName = tableName;
    selectedColumn = col;
    newColumn = {
      name: col.key,
      type: col.type.replace("Pg", "").toLowerCase(),
      nullable: col.isNullable,
    };
    showAlterColumnModal = true;
  }

  function getBadgeColor(type: string) {
    if (type.includes("Text")) return "badge-info";
    if (type.includes("Integer") || type.includes("Serial"))
      return "badge-warning";
    if (type.includes("Boolean")) return "badge-success";
    if (type.includes("Timestamp")) return "badge-secondary";
    if (type.includes("Json")) return "badge-neutral";
    return "badge-ghost";
  }
</script>

<div class="h-screen w-full bg-base-300 relative overflow-hidden flex flex-col">
  <!-- Header Overlay -->
  <header
    class="absolute top-4 left-4 right-4 z-50 flex justify-between items-center bg-base-100/90 backdrop-blur-md p-4 px-6 rounded-2xl shadow-xl border border-base-300/50"
  >
    <div>
      <h1 class="text-2xl font-black flex items-center gap-3">
        <iconify-icon icon="bx:wrench" class="text-primary"></iconify-icon>
        Database <span class="text-primary">Designer</span>
      </h1>
      <p class="text-xs opacity-60 font-medium">
        Drag tables to reposition. Click Edit to alter columns.
      </p>
    </div>
    <div class="flex gap-2">
      <button
        class="btn btn-sm btn-outline shadow-sm gap-2"
        onclick={runAutoLayout}
      >
        <iconify-icon icon="bx:grid-alt"></iconify-icon> Layout
      </button>
      <button
        class="btn btn-sm btn-primary shadow-sm shadow-primary/20 gap-2"
        onclick={() => (showAddTableModal = true)}
      >
        <iconify-icon icon="bx:plus"></iconify-icon> New Table
      </button>
    </div>
  </header>

  <!-- Infinity Canvas -->
  <div
    class="flex-1 w-full h-full relative overflow-auto select-none"
    role="application"
    tabindex="-1"
    onpointerdown={onCanvasDown}
    onpointermove={onCanvasMove}
    onpointerup={onCanvasUp}
    onpointercancel={onCanvasUp}
    onpointerleave={onCanvasUp}
    onlostpointercapture={onCanvasUp}
    onwheel={onCanvasWheel}
  >
    <div
      class="absolute inset-0"
      style="transform: translate({pan.x}px, {pan.y}px) scale({zoom}); transform-origin: 0 0;"
    >
      <!-- SVG Connectors -->
      <svg
        class="absolute inset-0 overflow-visible pointer-events-none"
        style="z-index: 1;"
      >
        <defs>
          <marker
            id="designer-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
          </marker>
        </defs>
        {#each links as link (link.id)}
          <path
            d={link.d}
            fill="none"
            stroke="var(--color-primary)"
            stroke-width={link.active ? 2.5 : 1.75}
            stroke-linecap="round"
            marker-end="url(#designer-arrow)"
            class="transition-all duration-200 {link.active
              ? 'opacity-90'
              : 'opacity-35'}"
          />
          <circle
            cx={link.from.x}
            cy={link.from.y}
            r={link.active ? 5 : 3.5}
            fill="var(--color-primary)"
            class="transition-all duration-200"
          />
          <circle
            cx={link.to.x}
            cy={link.to.y}
            r={link.active ? 5 : 3.5}
            fill="var(--color-accent)"
            class="transition-all duration-200"
          />
        {/each}
      </svg>

      <!-- Draggable Nodes (Cards) -->
      {#if !schema.loading || schema.current}
        {#each businessSchema as table (table.name)}
          {#if positions[table.name]}
            <div
              class="absolute rounded-xl shadow-2xl border bg-base-100 flex flex-col group transition-[box-shadow,border-color] duration-200 hover:shadow-primary/20 {hoveredTable ===
              table.name
                ? 'border-primary/60 shadow-primary/20'
                : 'border-base-300'}"
              style="left: {positions[table.name].x}px; top: {positions[
                table.name
              ].y}px; width: {positions[table.name]
                .w}px; z-index: {activeTable === table.name
                ? 10
                : hoveredTable === table.name
                  ? 5
                  : 2};"
              role="group"
              use:measure={table.name}
              onpointerdown={(e) => startDrag(e, table.name)}
              onpointerenter={() => (hoveredTable = table.name)}
              onpointerleave={() => {
                if (!isDragging) hoveredTable = null;
              }}
            >
              <!-- Ports, one per connection, on the same slot its line uses -->
              {#each portSlots[table.name] ?? [] as port, i (i)}
                <span
                  class="absolute w-2 h-2 rounded-full bg-primary ring-2 ring-base-100 pointer-events-none -translate-x-1/2 -translate-y-1/2"
                  style={portStyle(
                    table.name,
                    port.side,
                    port.index,
                    port.count,
                  )}
                ></span>
              {/each}

              <!-- Card Header -->
              <div
                class="flex justify-between items-center p-3 bg-base-200/50 border-b border-base-300 rounded-t-xl cursor-grab active:cursor-grabbing relative"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <iconify-icon
                    icon="bx:table"
                    class="text-primary text-lg opacity-70 shrink-0"
                  ></iconify-icon>
                  <h2
                    class="text-sm font-mono font-bold tracking-tight uppercase select-none pointer-events-none truncate"
                  >
                    {table.name}
                  </h2>
                </div>
                <button
                  title="Add Column"
                  aria-label="Add Column"
                  class="btn btn-square btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onpointerdown={(e) => e.stopPropagation()}
                  onclick={() => openAddColumn(table.name)}
                >
                  <iconify-icon
                    icon="bx:plus-circle"
                    class="text-base text-primary"
                  ></iconify-icon>
                </button>
              </div>

              <!-- Columns: no max-height — the card grows and auto-layout
                   reads the real height back so rows never overlap. -->
              <div class="p-2 space-y-0.5">
                {#each table.columns as col}
                  {@render columnRow(col, table.name)}
                {/each}
              </div>

              <!-- Relations (Mini text) -->
              {#if table.relations?.length}
                <div
                  class="bg-base-200/30 p-2 border-t border-base-300/50 mt-1"
                >
                  <div
                    class="text-[8px] font-bold opacity-30 tracking-widest mb-1"
                  >
                    REFS
                  </div>
                  <div class="flex flex-wrap gap-1">
                    {#each table.relations as rel}
                      <span
                        class="badge badge-outline badge-ghost text-[8px] font-mono opacity-60"
                        >→ {rel.targetTable}</span
                      >
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>
</div>

<!-- Snippet for Column Row -->
{#snippet columnRow(col: any, tableName: string)}
  <div
    class="flex items-center gap-2 px-1.5 py-0.5 rounded cursor-default hover:bg-base-200 transition-colors group/row"
  >
    <div
      class="w-1.5 h-1.5 rounded-full {col.isId
        ? 'bg-primary shadow-[0_0_6px_var(--color-primary)]'
        : 'bg-base-300'}"
    ></div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5">
        <span
          class="text-[11px] font-bold truncate {col.isId
            ? 'text-primary'
            : 'text-base-content/80'}">{col.key}</span
        >
        {#if !col.isNullable}
          <span class="text-error font-mono text-[9px]">*</span>
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-1">
      <div
        class="text-[9px] font-mono opacity-40 uppercase tracking-tighter truncate max-w-[60px] group-hover/row:opacity-100 transition-opacity {col.isId
          ? 'text-primary font-bold'
          : ''}"
      >
        {col.type.replace("Pg", "")}
      </div>
      {#if !col.isId}
        <button
          title="Edit Column"
          class="btn btn-square min-h-0! h-4! w-4! btn-ghost opacity-0 group-hover/row:opacity-100 transition-all hover:bg-primary/10 hover:text-primary ml-1"
          onclick={() => openAlterColumn(tableName, col)}
        >
          <iconify-icon icon="bx:edit-alt" class="text-[10px]"></iconify-icon>
        </button>
      {/if}
    </div>
  </div>
{/snippet}

<!-- Snippet for Relation Row -->
{#snippet relationRow(rel: any)}
  <div
    class="flex flex-col gap-1 p-3 bg-base-200/50 rounded-xl border border-base-300/50 hover:bg-base-200 transition-colors group/rel"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div
          class="w-6 h-6 rounded-lg bg-base-100 flex items-center justify-center text-[10px] font-mono shadow-sm border border-base-300"
        >
          {rel.type === "One" ? "1" : "N"}
        </div>
        <span
          class="text-xs font-bold text-base-content/90 font-mono tracking-tight"
          >{rel.name}</span
        >
      </div>
      <div
        class="badge badge-outline badge-ghost border-base-300 text-[9px] uppercase tracking-tighter h-5 px-1.5 font-bold"
      >
        {rel.type}
      </div>
    </div>

    <div class="flex items-center gap-2 mt-1.5">
      <div
        class="flex-1 bg-primary/5 px-2 py-1 rounded-md border border-primary/20 text-[10px] font-mono text-primary truncate text-center"
      >
        {rel.localColumn}
      </div>
      <iconify-icon icon="bx:transfer" class="text-base-content/20 text-xs"
      ></iconify-icon>
      <div
        class="flex-1 bg-accent/5 px-2 py-1 rounded-md border border-accent/20 text-[10px] font-mono text-accent truncate text-center"
      >
        {rel.targetTable}.{rel.remoteColumn}
      </div>
    </div>
  </div>
{/snippet}

<!-- Modals -->
<Modal bind:data={showAddTableModal} title="Create New Table">
  <form
    {...modifySchema.enhance(async ({ submit }) => {
      await submit();
      app.showToast("success", "Table created! Server is reloading...");
      showAddTableModal = false;
      setTimeout(() => schema.refresh(), 1000);
    })}
    class="space-y-4"
  >
    <input type="hidden" name="action" value="createTable" />
    <div class="form-control">
      <label class="label" for="tableNameInput"
        ><span class="label-text font-bold">Table Name</span></label
      >
      <input
        id="tableNameInput"
        name="tableName"
        bind:value={newTable.name}
        placeholder="e.g. products, categories"
        class="input input-bordered w-full"
        required
      />
      <label class="label" for="tableNameInput"
        ><span class="label-text-alt opacity-50"
          >Standard ID, Created, and Updated fields will be added automatically.</span
        ></label
      >
    </div>
    <div class="modal-action">
      <button
        type="button"
        class="btn btn-ghost"
        onclick={() => (showAddTableModal = false)}>Cancel</button
      >
      <button
        type="submit"
        class="btn btn-primary"
        disabled={!!modifySchema.pending}
      >
        {#if modifySchema.pending}
          <span class="loading loading-spinner"></span>
        {:else}
          Create Table
        {/if}
      </button>
    </div>
  </form>
</Modal>

<Modal
  bind:data={showAddColumnModal}
  title={`Add Column to ${selectedTableName}`}
>
  <form
    {...modifySchema.enhance(async ({ submit }) => {
      await submit();
      app.showToast("success", `Added ${newColumn.name}!`);
      showAddColumnModal = false;
      setTimeout(() => schema.refresh(), 1000);
    })}
    class="space-y-6"
  >
    <input type="hidden" name="action" value="addColumn" />
    <input type="hidden" name="tableName" value={selectedTableName} />

    <div class="space-y-4">
      <div class="form-control">
        <label class="label" for="columnNameInput"
          ><span class="label-text font-bold">Column Name</span></label
        >
        <input
          id="columnNameInput"
          name="columnName"
          bind:value={newColumn.name}
          placeholder="e.g. price, slug, is_active"
          class="input input-bordered w-full"
          required
        />
      </div>

      <div class="form-control">
        <label class="label" for="columnTypeInput"
          ><span class="label-text font-bold">Type</span></label
        >
        <div id="columnTypeInput" class="grid grid-cols-2 gap-2">
          {#each columnTypes as type}
            <label
              class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-base-200 {newColumn.type ===
              type.value
                ? 'border-primary bg-primary/5'
                : 'border-base-300'}"
            >
              <input
                type="radio"
                name="columnType"
                value={type.value}
                bind:group={newColumn.type}
                class="radio radio-primary radio-sm"
              />
              <div class="flex flex-col">
                <span class="text-sm font-bold">{type.label}</span>
                <span class="badge {type.color} badge-xs opacity-50 font-mono"
                  >Pg{type.label}</span
                >
              </div>
            </label>
          {/each}
        </div>
      </div>

      <div class="form-control">
        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="checkbox"
            name="columnNullable"
            value="true"
            bind:checked={newColumn.nullable}
            class="checkbox checkbox-primary"
          />
          <span class="label-text font-medium">Nullable (Optional)</span>
        </label>
      </div>
    </div>

    <div class="modal-action border-t pt-4">
      <button
        type="button"
        class="btn btn-ghost"
        onclick={() => (showAddColumnModal = false)}>Cancel</button
      >
      <button
        type="submit"
        class="btn btn-primary"
        disabled={!!modifySchema.pending}
      >
        {#if modifySchema.pending}
          <span class="loading loading-spinner"></span>
        {:else}
          Add Column
        {/if}
      </button>
    </div>
  </form>
</Modal>

<Modal
  bind:data={showAlterColumnModal}
  title={`Edit Column: ${selectedColumn?.key} in ${selectedTableName}`}
>
  <form
    {...modifySchema.enhance(async ({ submit }) => {
      await submit();
      app.showToast("success", `Altered ${newColumn.name}!`);
      showAlterColumnModal = false;
      setTimeout(() => schema.refresh(), 1000);
    })}
    class="space-y-6"
  >
    <input type="hidden" name="action" value="alterColumn" />
    <input type="hidden" name="tableName" value={selectedTableName} />
    <input type="hidden" name="columnName" value={newColumn.name} />

    <div class="space-y-4">
      <div class="form-control">
        <label class="label" for="alterNameDisplay"
          ><span class="label-text font-bold opacity-50">Column Name</span
          ></label
        >
        <input
          id="alterNameDisplay"
          value={newColumn.name}
          disabled
          class="input input-bordered w-full opacity-50 bg-base-200 cursor-not-allowed"
        />
        <label class="label" for="alterNameDisplay"
          ><span class="label-text-alt opacity-40"
            >Column name cannot be changed here for safety.</span
          ></label
        >
      </div>

      <div class="form-control">
        <label class="label" for="alterTypeInput"
          ><span class="label-text font-bold">Type</span></label
        >
        <div id="alterTypeInput" class="grid grid-cols-2 gap-2">
          {#each columnTypes as type}
            <label
              class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-base-200 {newColumn.type ===
              type.value
                ? 'border-primary bg-primary/5'
                : 'border-base-300'}"
            >
              <input
                type="radio"
                name="columnType"
                value={type.value}
                bind:group={newColumn.type}
                class="radio radio-primary radio-sm"
              />
              <div class="flex flex-col">
                <span class="text-sm font-bold">{type.label}</span>
                <span class="badge {type.color} badge-xs opacity-50 font-mono"
                  >Pg{type.label}</span
                >
              </div>
            </label>
          {/each}
        </div>
      </div>

      <div class="form-control">
        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="checkbox"
            name="columnNullable"
            value="true"
            bind:checked={newColumn.nullable}
            class="checkbox checkbox-primary"
          />
          <span class="label-text font-medium">Nullable (Optional)</span>
        </label>
      </div>
    </div>

    <div class="modal-action border-t pt-4">
      <button
        type="button"
        class="btn btn-ghost"
        onclick={() => (showAlterColumnModal = false)}>Cancel</button
      >
      <button
        type="submit"
        class="btn btn-warning shadow-lg shadow-warning/20"
        disabled={!!modifySchema.pending}
      >
        {#if modifySchema.pending}
          <span class="loading loading-spinner"></span>
        {:else}
          Save Changes
        {/if}
      </button>
    </div>
  </form>
</Modal>

<style>
  :global(.card) {
    overflow: visible;
  }
</style>
