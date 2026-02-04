<script lang="ts">
  import { Select } from "$lib/components";
  import type { TableRow } from "$lib/remotes/api.remote";

  const fruits = [
    { label: "Apple", value: "apple" },
    { label: "Banana", value: "banana" },
    { label: "Cherry", value: "cherry" },
    { label: "Date", value: "date" },
    { label: "Elderberry", value: "elderberry" },
    { label: "Fig", value: "fig" },
    { label: "Grape", value: "grape" },
    { label: "Honeydew", value: "honeydew" },
  ];

  // Local State
  let singleFruit = $state("apple");
  let multiFruits = $state(["banana", "cherry"]);
  let collapsedFruits = $state(["fig", "grape"]);
  let customKeyFruit = $state<string | null>(null);

  // User Objects for Rich UI
  let singleFruitObj = $state<any>();
  let multiFruitObjs = $state<any[]>([]);

  // Remote State (Users)
  let remoteUserId = $state<string | null>(null);
  let remoteUserObj = $state<NonNullable<TableRow<"users">> | null>(null);

  // Remote State (Roles)
  let remoteRoleIds = $state<string[]>([]);
  let remoteRoleObjs = $state<NonNullable<TableRow<"roles">>[]>([]);

  // Remote State (Documents)
  let remoteDocId = $state<string | null>(null);
  let remoteDocObj = $state<NonNullable<TableRow<"documents">> | null>(null);
</script>

<div class="min-h-screen bg-base-200 py-12 px-4">
  <div class="max-w-7xl mx-auto space-y-12">
    <!-- Header -->
    <div class="text-center space-y-4">
      <div class="badge badge-primary badge-outline font-black py-3 px-6">
        COMPONENT SHOWCASE
      </div>
      <h1 class="text-6xl font-black tracking-tighter text-base-content">
        Select <span class="text-primary text-outline">v2.0</span>
      </h1>
      <p class="text-base-content/60 text-xl max-w-2xl mx-auto">
        A premium, Svelte 5 powered selection engine supporting high-density UI,
        dual-binding, and relational database discovery.
      </p>
    </div>

    <!-- Section 1: Local Data Scenarios -->
    <div class="space-y-6">
      <div class="flex items-center gap-4">
        <h2 class="text-2xl font-black tracking-tight">Local Data Patterns</h2>
        <div class="h-px bg-base-content/10 grow"></div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Basic Single -->
        <div class="card bg-base-100 shadow-xl border border-base-content/5">
          <div class="card-body p-6">
            <h3 class="font-bold flex items-center gap-2 mb-2 text-sm">
              <iconify-icon
                icon="bx:radio-circle-marked"
                class="text-primary text-xl"
              ></iconify-icon>
              Single Selection
            </h3>
            <Select
              options={fruits}
              bind:value={singleFruit}
              bind:object={singleFruitObj}
              label="Choose Fruit"
            />
            <div
              class="mt-4 p-3 bg-base-200/50 rounded-lg text-[10px] font-mono"
            >
              Value: {singleFruit}
            </div>
          </div>
        </div>

        <!-- Basic Multi -->
        <div class="card bg-base-100 shadow-xl border border-base-content/5">
          <div class="card-body p-6">
            <h3 class="font-bold flex items-center gap-2 mb-2 text-sm">
              <iconify-icon
                icon="bx:check-square"
                class="text-secondary text-xl"
              ></iconify-icon>
              Normal Multi
            </h3>
            <Select
              options={fruits}
              multiple
              bind:value={multiFruits}
              label="Selected Items"
            />
            <div
              class="mt-4 p-3 bg-base-200/50 rounded-lg text-[10px] font-mono"
            >
              Count: {multiFruits.length}
            </div>
          </div>
        </div>

        <!-- Collapsed Multi -->
        <div class="card bg-base-100 shadow-xl border border-base-content/5">
          <div class="card-body p-6">
            <h3
              class="font-bold flex items-center gap-2 mb-2 text-sm text-accent"
            >
              <iconify-icon icon="bx:collapse" class="text-xl"></iconify-icon>
              Collapsed Multi
            </h3>
            <Select
              options={fruits}
              multiple
              collapse
              bind:value={collapsedFruits}
              label="High Density"
            />
            <div
              class="mt-4 p-3 bg-base-200/50 rounded-lg text-[10px] font-mono"
            >
              Items: {collapsedFruits.join(", ")}
            </div>
          </div>
        </div>

        <!-- Custom Keys -->
        <div class="card bg-base-100 shadow-xl border border-base-content/5">
          <div class="card-body p-6">
            <h3
              class="font-bold flex items-center gap-2 mb-2 text-sm text-warning"
            >
              <iconify-icon icon="bx:code-curly" class="text-xl"></iconify-icon>
              Custom Schema
            </h3>
            <Select
              options={[
                { name: "Red Apple", id: "ap-1" },
                { name: "Yellow Banana", id: "bn-2" },
              ] as any}
              labelKey="name"
              valueKey="id"
              bind:value={customKeyFruit}
              label="Custom Keys"
            />
            <div
              class="mt-4 p-3 bg-base-200/50 rounded-lg text-[10px] font-mono"
            >
              ID: {customKeyFruit}
            </div>
          </div>
        </div>

        <!-- Small Variant -->
        <div class="card bg-base-100 shadow-xl border border-base-content/5">
          <div class="card-body p-6">
            <h3
              class="font-bold flex items-center gap-2 mb-2 text-sm text-info"
            >
              <iconify-icon icon="bx:move" class="text-xl"></iconify-icon>
              Small Selection
            </h3>
            <Select
              options={fruits}
              bind:value={singleFruit}
              label="Compact Input"
              inputClass="input-sm"
            />
            <div
              class="mt-4 p-3 bg-base-200/50 rounded-lg text-[10px] font-mono"
            >
              Mode: input-sm
            </div>
          </div>
        </div>

        <!-- Floating Label Variant -->
        <div class="card bg-base-100 shadow-xl border border-base-content/5">
          <div class="card-body p-6">
            <h3
              class="font-bold flex items-center gap-2 mb-2 text-sm text-secondary"
            >
              <iconify-icon icon="bx:label" class="text-xl"></iconify-icon>
              Floating Label
            </h3>
            <Select
              options={fruits}
              bind:value={singleFruit}
              label="Floating Fruit"
              inputClass="input-primary"
            />
            <div
              class="mt-4 p-3 bg-base-200/50 rounded-lg text-[10px] font-mono"
            >
              Status: Validated
            </div>
          </div>
        </div>

        <!-- Stacked Example -->
        <div class="card bg-base-100 shadow-xl border border-base-content/5">
          <div class="card-body p-6">
            <h3
              class="font-bold flex items-center gap-2 mb-4 text-sm text-primary"
            >
              <iconify-icon icon="bx:layer" class="text-xl"></iconify-icon>
              Stacked Layout
            </h3>
            <div class="space-y-4">
              <Select
                options={fruits}
                bind:value={singleFruit}
                label="Primary Fruit"
                inputClass="input-sm"
              />
              <Select
                options={fruits}
                multiple
                collapse
                bind:value={collapsedFruits}
                label="Backup Options"
                inputClass="input-sm"
              />
            </div>
            <p class="text-[9px] opacity-40 mt-4 italic">
              * Multiple instances in a vertical stack
            </p>
          </div>
        </div>

        <!-- Clipping Test -->
        <div
          class="card bg-base-100 shadow-xl border border-base-content/5 overflow-visible"
        >
          <div class="card-body p-6">
            <h3
              class="font-bold flex items-center gap-2 mb-2 text-sm text-error"
            >
              <iconify-icon icon="bx:bug" class="text-xl"></iconify-icon>
              Strict Container
            </h3>
            <div
              class="bg-base-300 p-4 rounded-xl border-2 border-dashed border-error/20"
            >
              <Select
                options={fruits}
                bind:value={singleFruit}
                placeholder="Clip Test"
                inputClass="input-sm"
              />
            </div>
            <p class="text-[9px] opacity-40 mt-2 italic">
              * Use <code>overflow-visible</code> on parent cards to prevent clipping.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: Remote/Relational discovery -->
    <div class="space-y-6">
      <div class="flex items-center gap-4">
        <h2 class="text-2xl font-black tracking-tight">
          Remote Relational Discovery
        </h2>
        <div class="h-px bg-base-content/10 grow"></div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-nowrap">
        <!-- Table: Users -->
        <div
          class="card bg-base-100 shadow-2xl border-l-4 border-l-primary overflow-visible"
        >
          <div class="card-body p-8">
            <div class="flex justify-between items-start mb-6">
              <div>
                <h3 class="text-2xl font-black tracking-tight">
                  Database: Users
                </h3>
                <p class="text-sm opacity-50">
                  Discovery from remote "users" table
                </p>
              </div>
              <iconify-icon
                icon="bx:cloud-download"
                class="text-4xl text-primary/30"
              ></iconify-icon>
            </div>

            <Select
              table="users"
              labelKey="email"
              valueKey="id"
              bind:value={remoteUserId}
              bind:object={remoteUserObj}
              label="Search Users by Email"
              inputClass="input-lg ring-2 ring-primary/10"
            />

            <div class="grid grid-cols-2 gap-4 mt-8">
              <div class="space-y-1">
                <span class="text-[10px] font-black uppercase opacity-40"
                  >Primary Value</span
                >
                <div
                  class="p-3 bg-base-200 rounded-xl font-mono text-xs truncate"
                >
                  {remoteUserId || "null"}
                </div>
              </div>
              <div class="space-y-1">
                <span class="text-[10px] font-black uppercase opacity-40"
                  >Resolved Object</span
                >
                <div
                  class="p-3 bg-base-200 rounded-xl font-mono text-xs truncate"
                >
                  {remoteUserObj ? remoteUserObj.email : "null"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Table: Roles -->
        <div
          class="card bg-base-100 shadow-2xl border-l-4 border-l-accent overflow-visible"
        >
          <div class="card-body p-8">
            <div class="flex justify-between items-start mb-6">
              <div>
                <h3 class="text-2xl font-black tracking-tight">
                  Database: Roles
                </h3>
                <p class="text-sm opacity-50">
                  Multi-select relational mapping
                </p>
              </div>
              <iconify-icon
                icon="bx:shield-quarter"
                class="text-4xl text-accent/30"
              ></iconify-icon>
            </div>

            <Select
              table="roles"
              labelKey="name"
              valueKey="id"
              multiple
              collapse
              bind:value={remoteRoleIds}
              bind:object={remoteRoleObjs}
              label="Assign System Roles"
              inputClass="input-lg ring-2 ring-accent/10"
            />

            <div class="grid grid-cols-2 gap-4 mt-8">
              <div class="space-y-1">
                <span class="text-[10px] font-black uppercase opacity-40"
                  >Role IDs</span
                >
                <div
                  class="p-3 bg-base-200 rounded-xl font-mono text-xs truncate"
                >
                  [{remoteRoleIds.join(", ")}]
                </div>
              </div>
              <div class="space-y-1">
                <span class="text-[10px] font-black uppercase opacity-40"
                  >Object Array</span
                >
                <div
                  class="p-3 bg-base-200 rounded-xl font-mono text-xs truncate"
                >
                  {remoteRoleObjs.length} records
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Table: Documents -->
        <div
          class="card bg-base-100 shadow-2xl border-l-4 border-l-warning overflow-visible md:col-span-2"
        >
          <div class="card-body p-8">
            <div class="flex justify-between items-start mb-6">
              <div>
                <h3 class="text-2xl font-black tracking-tight">
                  Database: Documents
                </h3>
                <p class="text-sm opacity-50">
                  Search through official records by title
                </p>
              </div>
              <iconify-icon icon="bx:file" class="text-4xl text-warning/30"
              ></iconify-icon>
            </div>

            <Select
              table="documents"
              labelKey="title"
              valueKey="id"
              bind:value={remoteDocId}
              bind:object={remoteDocObj}
              label="Search Documents"
              placeholder="Start typing title..."
              inputClass="input-lg ring-2 ring-warning/10"
            />

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
              <div class="space-y-1">
                <span class="text-[10px] font-black uppercase opacity-40"
                  >Selected ID</span
                >
                <div
                  class="p-3 bg-base-200 rounded-xl font-mono text-xs truncate"
                >
                  {remoteDocId || "null"}
                </div>
              </div>
              <div class="space-y-1">
                <span class="text-[10px] font-black uppercase opacity-40"
                  >Document Title</span
                >
                <div
                  class="p-3 bg-base-200 rounded-xl font-mono text-xs truncate"
                >
                  {remoteDocObj ? remoteDocObj.title : "None selected"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Features Info -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div
        class="flex gap-4 p-6 bg-base-100 rounded-3xl border border-base-content/5 shadow-sm items-center"
      >
        <div
          class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0"
        >
          <iconify-icon icon="bx:target-lock" class="text-2xl"></iconify-icon>
        </div>
        <div>
          <h4 class="font-bold">Type Safe</h4>
          <p class="text-xs opacity-60">
            Strict generics for columns and table names.
          </p>
        </div>
      </div>

      <div
        class="flex gap-4 p-6 bg-base-100 rounded-3xl border border-base-content/5 shadow-sm items-center"
      >
        <div
          class="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0"
        >
          <iconify-icon icon="bx:timer" class="text-2xl"></iconify-icon>
        </div>
        <div>
          <h4 class="font-bold">Debounced</h4>
          <p class="text-xs opacity-60">Smart prefetch for large datasets.</p>
        </div>
      </div>

      <div
        class="flex gap-4 p-6 bg-base-100 rounded-3xl border border-base-content/5 shadow-sm items-center"
      >
        <div
          class="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0"
        >
          <iconify-icon icon="bx:keyboard" class="text-2xl"></iconify-icon>
        </div>
        <div>
          <h4 class="font-bold">A11y First</h4>
          <p class="text-xs opacity-60">
            Full keyboard & Screen reader support.
          </p>
        </div>
      </div>
    </div>
  </div>
</div>
