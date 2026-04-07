<script lang="ts">
  import { getSchema, modifySchema } from "$lib/remotes/designer.remote";
  import { Modal } from "$lib/components";
  import { untrack } from "svelte";

  // Data fetching - following the project's reactive pattern
  const schema = $derived(getSchema({}));
  
  // Local state
  let toasts = $state<{ id: number; msg: string; type: string }[]>([]);
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
  
  let positions = $state<Record<string, { x: number, y: number, w: number, h: number }>>({});
  let activeTable = $state<string | null>(null);
  let isDragging = $state(false);
  let dragOffset = { x: 0, y: 0 };

  let uniqueConnections = $derived.by(() => {
    if (!schema.current) return [];
    const lines: Array<{source: string, target: string}> = [];
    const seen = new Set<string>();
    
    for (const table of schema.current) {
      if (!table.relations) continue;
      for (const rel of table.relations) {
        if (!positions[table.name] || !positions[rel.targetTable]) continue;
        // Sort to ensure A -> B and B -> A generate the same identifier
        const pair = [table.name, rel.targetTable].sort().join('::');
        if (!seen.has(pair)) {
          seen.add(pair);
          lines.push({ source: table.name, target: rel.targetTable });
        }
      }
    }
    return lines;
  });

  $effect(() => {
    if (schema.current && Object.keys(positions).length === 0) {
      autoLayout();
    }
  });

  function autoLayout() {
    if (!schema.current) return;
    const padding = 60;
    const cardWidth = 260; // Narrower cards
    let cols = Math.ceil(Math.sqrt(schema.current.length));
    
    schema.current.forEach((table: any, i: number) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions[table.name] = {
        x: col * (cardWidth + padding) + 40,
        y: row * (300 + padding) + 80,
        w: cardWidth,
        h: 300
      };
    });
  }

  function getPortPos(tableName: string, type: 'source' | 'target') {
    const pos = positions[tableName];
    if (!pos) return { x: 0, y: 0 };
    return {
      x: type === 'source' ? pos.x + pos.w : pos.x,
      y: pos.y + 40 // Offset from top
    };
  }

  function startDrag(e: PointerEvent, tableName: string) {
    if (/button/i.test((e.target as HTMLElement).tagName)) return;
    activeTable = tableName;
    isDragging = true;
    dragOffset = {
      x: e.clientX / zoom - positions[tableName].x,
      y: e.clientY / zoom - positions[tableName].y
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onCanvasDown(e: PointerEvent) {
    if (activeTable) return;
    isPanning = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onCanvasMove(e: PointerEvent) {
    if (isDragging && activeTable) {
      positions[activeTable].x = e.clientX / zoom - dragOffset.x;
      positions[activeTable].y = e.clientY / zoom - dragOffset.y;
    } else if (isPanning) {
      pan.x += e.movementX;
      pan.y += e.movementY;
    }
  }

  function onCanvasUp(e: PointerEvent) {
    isDragging = false;
    isPanning = false;
    activeTable = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch(e) {}
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

  function showToast(msg: string, type = "success") {
    const id = Date.now();
    toasts = [...toasts, { id, msg, type }];
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 3000);
  }

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
      type: col.type.replace('Pg', '').toLowerCase(),
      nullable: col.isNullable 
    };
    showAlterColumnModal = true;
  }

  function getBadgeColor(type: string) {
    if (type.includes("Text")) return "badge-info";
    if (type.includes("Integer") || type.includes("Serial")) return "badge-warning";
    if (type.includes("Boolean")) return "badge-success";
    if (type.includes("Timestamp")) return "badge-secondary";
    if (type.includes("Json")) return "badge-neutral";
    return "badge-ghost";
  }
</script>

<div class="h-screen w-full bg-base-300 relative overflow-hidden flex flex-col">
  <!-- Header Overlay -->
  <header class="absolute top-4 left-4 right-4 z-50 flex justify-between items-center bg-base-100/90 backdrop-blur-md p-4 px-6 rounded-2xl shadow-xl border border-base-300/50">
    <div>
      <h1 class="text-2xl font-black flex items-center gap-3">
        <iconify-icon icon="bx:wrench" class="text-primary"></iconify-icon>
        Database <span class="text-primary">Designer</span>
      </h1>
      <p class="text-xs opacity-60 font-medium">Drag tables to reposition. Click Edit to alter columns.</p>
    </div>
    <div class="flex gap-2">
      <button class="btn btn-sm btn-outline shadow-sm gap-2" onclick={() => autoLayout()}>
        <iconify-icon icon="bx:grid-alt"></iconify-icon> Layout
      </button>
      <button class="btn btn-sm btn-primary shadow-sm shadow-primary/20 gap-2" onclick={() => showAddTableModal = true}>
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
    onpointerleave={onCanvasUp}
    onwheel={onCanvasWheel}
  >
    <div class="absolute inset-0" style="transform: translate({pan.x}px, {pan.y}px) scale({zoom}); transform-origin: 0 0;">
      
      <!-- SVG Connectors -->
      <svg class="absolute inset-0 overflow-visible pointer-events-none" style="z-index: 1;">
        {#each uniqueConnections as conn (conn.source + '::' + conn.target)}
          {@const p1 = getPortPos(conn.source, 'source')}
          {@const p2 = getPortPos(conn.target, 'target')}
          <path 
            d="M {p1.x} {p1.y} C {p1.x + 50} {p1.y}, {p2.x - 50} {p2.y}, {p2.x} {p2.y}" 
            fill="none" 
            stroke="var(--color-primary)" 
            stroke-width="2" 
            class="opacity-40"
          />
          <!-- Small circles for connections -->
          <circle cx={p1.x} cy={p1.y} r="4" fill="var(--color-primary)" />
          <circle cx={p2.x} cy={p2.y} r="4" fill="var(--color-accent)" />
        {/each}
      </svg>

      <!-- Draggable Nodes (Cards) -->
      {#if !schema.loading || schema.current}
        {#each schema.current || [] as table}
          {#if positions[table.name]}
            <div 
              class="absolute rounded-xl shadow-2xl border border-base-300 bg-base-100 flex flex-col group transition-shadow hover:shadow-primary/20 hover:border-primary/40"
              style="left: {positions[table.name].x}px; top: {positions[table.name].y}px; width: {positions[table.name].w}px; z-index: {activeTable === table.name ? 10 : 2};"
              role="group"
              onpointerdown={(e) => startDrag(e, table.name)}
            >
              <!-- Card Header -->
              <div class="flex justify-between items-center p-3 bg-base-200/50 border-b border-base-300 rounded-t-xl cursor-grab active:cursor-grabbing relative">
                <div class="flex items-center gap-2">
                  <iconify-icon icon="bx:table" class="text-primary text-lg opacity-70"></iconify-icon>
                  <h2 class="text-sm font-mono font-bold tracking-tight uppercase select-none pointer-events-none">{table.name}</h2>
                </div>
                <button title="Add Column" aria-label="Add Column" class="btn btn-square btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity" onpointerdown={(e)=>e.stopPropagation()} onclick={() => openAddColumn(table.name)}>
                  <iconify-icon icon="bx:plus-circle" class="text-base text-primary"></iconify-icon>
                </button>
              </div>

              <!-- Columns -->
              <div class="p-2 space-y-0.5 overflow-y-auto max-h-[300px]">
                {#each table.columns as col}
                  {@render columnRow(col, table.name)}
                {/each}
              </div>

              <!-- Relations (Mini text) -->
              {#if table.relations?.length}
                 <div class="bg-base-200/30 p-2 border-t border-base-300/50 mt-1">
                   <div class="text-[8px] font-bold opacity-30 tracking-widest mb-1">REFS</div>
                   <div class="flex flex-wrap gap-1">
                     {#each table.relations as rel}
                       <span class="badge badge-outline badge-ghost text-[8px] font-mono opacity-60">→ {rel.targetTable}</span>
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
  <div class="flex items-center gap-2 px-1.5 py-0.5 rounded cursor-default hover:bg-base-200 transition-colors group/row">
    <div class="w-1.5 h-1.5 rounded-full {col.isId ? 'bg-primary shadow-[0_0_6px_var(--color-primary)]' : 'bg-base-300'}"></div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5">
        <span class="text-[11px] font-bold truncate {col.isId ? 'text-primary' : 'text-base-content/80'}">{col.key}</span>
        {#if !col.isNullable}
          <span class="text-error font-mono text-[9px]">*</span>
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-1">
      <div class="text-[9px] font-mono opacity-40 uppercase tracking-tighter truncate max-w-[60px] group-hover/row:opacity-100 transition-opacity {col.isId ? 'text-primary font-bold' : ''}">
        {col.type.replace('Pg', '')}
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
  <div class="flex flex-col gap-1 p-3 bg-base-200/50 rounded-xl border border-base-300/50 hover:bg-base-200 transition-colors group/rel">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-lg bg-base-100 flex items-center justify-center text-[10px] font-mono shadow-sm border border-base-300">
          {rel.type === 'One' ? '1' : 'N'}
        </div>
        <span class="text-xs font-bold text-base-content/90 font-mono tracking-tight">{rel.name}</span>
      </div>
      <div class="badge badge-outline badge-ghost border-base-300 text-[9px] uppercase tracking-tighter h-5 px-1.5 font-bold">
        {rel.type}
      </div>
    </div>
    
    <div class="flex items-center gap-2 mt-1.5">
      <div class="flex-1 bg-primary/5 px-2 py-1 rounded-md border border-primary/20 text-[10px] font-mono text-primary truncate text-center">
        {rel.localColumn}
      </div>
      <iconify-icon icon="bx:transfer" class="text-base-content/20 text-xs"></iconify-icon>
      <div class="flex-1 bg-accent/5 px-2 py-1 rounded-md border border-accent/20 text-[10px] font-mono text-accent truncate text-center">
        {rel.targetTable}.{rel.remoteColumn}
      </div>
    </div>
  </div>
{/snippet}

<!-- Modals -->
<Modal bind:data={showAddTableModal} title="Create New Table">
  <form {...modifySchema.enhance(async ({ submit }) => {
    await submit();
    showToast("Table created! Server is reloading...");
    showAddTableModal = false;
    setTimeout(() => schema.refresh(), 1000);
  })} class="space-y-4">
    <input type="hidden" name="action" value="createTable" />
    <div class="form-control">
      <label class="label" for="tableNameInput"><span class="label-text font-bold">Table Name</span></label>
      <input id="tableNameInput" name="tableName" bind:value={newTable.name} placeholder="e.g. products, categories" class="input input-bordered w-full" required />
      <label class="label" for="tableNameInput"><span class="label-text-alt opacity-50">Standard ID, Created, and Updated fields will be added automatically.</span></label>
    </div>
    <div class="modal-action">
      <button type="button" class="btn btn-ghost" onclick={() => showAddTableModal = false}>Cancel</button>
      <button type="submit" class="btn btn-primary" disabled={!!modifySchema.pending}>
        {#if modifySchema.pending}
          <span class="loading loading-spinner"></span>
        {:else}
          Create Table
        {/if}
      </button>
    </div>
  </form>
</Modal>

<Modal bind:data={showAddColumnModal} title={`Add Column to ${selectedTableName}`}>
  <form {...modifySchema.enhance(async ({ submit }) => {
    await submit();
    showToast(`Added ${newColumn.name}!`);
    showAddColumnModal = false;
    setTimeout(() => schema.refresh(), 1000);
  })} class="space-y-6">
    <input type="hidden" name="action" value="addColumn" />
    <input type="hidden" name="tableName" value={selectedTableName} />
    
    <div class="space-y-4">
      <div class="form-control">
        <label class="label" for="columnNameInput"><span class="label-text font-bold">Column Name</span></label>
        <input id="columnNameInput" name="columnName" bind:value={newColumn.name} placeholder="e.g. price, slug, is_active" class="input input-bordered w-full" required />
      </div>

      <div class="form-control">
        <label class="label" for="columnTypeInput"><span class="label-text font-bold">Type</span></label>
        <div id="columnTypeInput" class="grid grid-cols-2 gap-2">
          {#each columnTypes as type}
            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-base-200 {newColumn.type === type.value ? 'border-primary bg-primary/5' : 'border-base-300'}">
              <input type="radio" name="columnType" value={type.value} bind:group={newColumn.type} class="radio radio-primary radio-sm" />
              <div class="flex flex-col">
                <span class="text-sm font-bold">{type.label}</span>
                <span class="badge {type.color} badge-xs opacity-50 font-mono">Pg{type.label}</span>
              </div>
            </label>
          {/each}
        </div>
      </div>

      <div class="form-control">
        <label class="label cursor-pointer justify-start gap-3">
          <input type="checkbox" name="columnNullable" value="true" bind:checked={newColumn.nullable} class="checkbox checkbox-primary" />
          <span class="label-text font-medium">Nullable (Optional)</span>
        </label>
      </div>
    </div>

    <div class="modal-action border-t pt-4">
      <button type="button" class="btn btn-ghost" onclick={() => showAddColumnModal = false}>Cancel</button>
      <button type="submit" class="btn btn-primary" disabled={!!modifySchema.pending}>
        {#if modifySchema.pending}
          <span class="loading loading-spinner"></span>
        {:else}
          Add Column
        {/if}
      </button>
    </div>
  </form>
</Modal>

<Modal bind:data={showAlterColumnModal} title={`Edit Column: ${selectedColumn?.key} in ${selectedTableName}`}>
  <form {...modifySchema.enhance(async ({ submit }) => {
    await submit();
    showToast(`Altered ${newColumn.name}!`);
    showAlterColumnModal = false;
    setTimeout(() => schema.refresh(), 1000);
  })} class="space-y-6">
    <input type="hidden" name="action" value="alterColumn" />
    <input type="hidden" name="tableName" value={selectedTableName} />
    <input type="hidden" name="columnName" value={newColumn.name} />
    
    <div class="space-y-4">
      <div class="form-control">
        <label class="label" for="alterNameDisplay"><span class="label-text font-bold opacity-50">Column Name</span></label>
        <input id="alterNameDisplay" value={newColumn.name} disabled class="input input-bordered w-full opacity-50 bg-base-200 cursor-not-allowed" />
        <label class="label" for="alterNameDisplay"><span class="label-text-alt opacity-40">Column name cannot be changed here for safety.</span></label>
      </div>

      <div class="form-control">
        <label class="label" for="alterTypeInput"><span class="label-text font-bold">Type</span></label>
        <div id="alterTypeInput" class="grid grid-cols-2 gap-2">
          {#each columnTypes as type}
            <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-base-200 {newColumn.type === type.value ? 'border-primary bg-primary/5' : 'border-base-300'}">
              <input type="radio" name="columnType" value={type.value} bind:group={newColumn.type} class="radio radio-primary radio-sm" />
              <div class="flex flex-col">
                <span class="text-sm font-bold">{type.label}</span>
                <span class="badge {type.color} badge-xs opacity-50 font-mono">Pg{type.label}</span>
              </div>
            </label>
          {/each}
        </div>
      </div>

      <div class="form-control">
        <label class="label cursor-pointer justify-start gap-3">
          <input type="checkbox" name="columnNullable" value="true" bind:checked={newColumn.nullable} class="checkbox checkbox-primary" />
          <span class="label-text font-medium">Nullable (Optional)</span>
        </label>
      </div>
    </div>

    <div class="modal-action border-t pt-4">
      <button type="button" class="btn btn-ghost" onclick={() => showAlterColumnModal = false}>Cancel</button>
      <button type="submit" class="btn btn-warning shadow-lg shadow-warning/20" disabled={!!modifySchema.pending}>
        {#if modifySchema.pending}
          <span class="loading loading-spinner"></span>
        {:else}
          Save Changes
        {/if}
      </button>
    </div>
  </form>
</Modal>

<!-- Toast -->
<div class="toast toast-end toast-bottom z-9999">
  {#each toasts as toast (toast.id)}
    <div class="alert {toast.type === 'error' ? 'alert-error' : 'alert-success'} py-2 px-4 shadow-xl text-white text-xs font-semibold animate-in fade-in slide-in-from-bottom-5 duration-300">
      <iconify-icon icon={toast.type === "error" ? "bx:error-circle" : "bx:check-circle"}></iconify-icon>
      <span>{toast.msg}</span>
    </div>
  {/each}
</div>

<style>
  :global(.card) {
    overflow: visible;
  }
</style>
