<script lang="ts">
  import {
    getCollectionData,
    getCollections,
    upsertData,
    deleteCollectionRows,
    type CollectionSchema,
  } from "$lib/remotes/collections.remote";
  import { Toolbar, Modal } from "$lib/components";

  let query = $state({
    table: "__setting",
    limit: 100,
    offset: 0,
    where: {},
  });

  const collections = $derived(getCollections({}));
  const records = $derived(getCollectionData(query));
  const schema = $derived(
    collections.current?.find((c: CollectionSchema) => c.name === "__setting"),
  );
  const items = $derived(records.current ?? { data: [], count: 0 });

  let editingRow = $state<any>(null);
  let showEditModal = $state<boolean | undefined>(false);

  function startEdit(row: any) {
    editingRow = JSON.parse(JSON.stringify(row));
    showEditModal = true;
  }

  function startCreate() {
    editingRow = { key: "", value: "", description: "" };
    showEditModal = true;
  }
</script>

<div class="flex flex-col h-screen w-full bg-base-200/50 overflow-hidden">
  <header class="p-6 bg-base-100 border-b border-base-300">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-black tracking-tight flex items-center gap-3">
          <iconify-icon icon="bx:cog" class="text-primary"></iconify-icon>
          App <span class="text-primary text-opacity-70">Settings</span>
        </h1>
        <p class="text-sm opacity-50 mt-1">
          Manage global application configuration and constants.
        </p>
      </div>

      <button class="btn btn-primary btn-sm gap-2" onclick={startCreate}>
        <iconify-icon icon="bx:plus"></iconify-icon>
        Add Setting
      </button>
    </div>
  </header>

  <main class="flex-1 p-6 overflow-hidden flex flex-col">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-10">
      {#if records.loading}
        {#each Array(6) as _}
          <div class="h-40 bg-base-100 rounded-3xl animate-pulse border border-base-300"></div>
        {/each}
      {:else if !items.data?.length}
        <div class="col-span-full text-center py-40 opacity-30">
          <iconify-icon icon="bx:slider-alt" class="text-8xl mb-4"></iconify-icon>
          <p class="text-xl font-bold">No settings configured yet.</p>
          <button class="btn btn-primary btn-sm mt-4" onclick={startCreate}>Create First Setting</button>
        </div>
      {:else}
        {#each items.data as setting}
          <div
            class="group bg-base-100 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-300 border border-base-300 flex flex-col p-6 relative overflow-hidden"
          >
            <div class="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
               <button aria-label="Edit Setting" class="btn btn-ghost btn-square btn-xs" onclick={() => startEdit(setting)}>
                 <iconify-icon icon="bx:edit-alt" class="text-lg"></iconify-icon>
               </button>
            </div>

            <div class="flex items-center gap-4 mb-4">
              <div class="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary">
                <iconify-icon icon="bx:key" class="text-2xl"></iconify-icon>
              </div>
              <div class="min-w-0">
                <h3 class="font-black text-sm uppercase tracking-wider truncate" title={setting.key}>
                  {setting.key}
                </h3>
                <div class="badge badge-ghost badge-sm font-mono text-[10px] opacity-40">STRING</div>
              </div>
            </div>

            <div class="flex-1 bg-base-200/50 rounded-2xl p-4 font-mono text-xs break-all mb-4 border border-base-300/50 min-h-16 flex items-center justify-center text-center">
              {setting.value || '(Empty)'}
            </div>

            <p class="text-xs opacity-50 italic">
              {setting.description || 'No description provided.'}
            </p>
          </div>
        {/each}
      {/if}
    </div>
  </main>
</div>

<Modal bind:data={showEditModal} title={editingRow?.id ? 'Edit Setting' : 'New Setting'}>
  <form
    {...upsertData.enhance(async ({ submit }) => {
      await submit();
      showEditModal = false;
      records.refresh();
    })}
    class="space-y-6 pt-2"
  >
    <input type="hidden" name="table" value="__setting" />
    {#if editingRow?.id}
      <input type="hidden" name="id" value={editingRow.id} />
    {/if}

    <div class="form-control">
      <label class="label" for="setting_key">
        <span class="label-text font-bold">Key</span>
      </label>
      <input
        id="setting_key"
        name="key"
        bind:value={editingRow.key}
        placeholder="e.g. APP_NAME, SMTP_HOST"
        class="input input-bordered font-mono"
        required
      />
    </div>

    <div class="form-control">
      <label class="label" for="setting_value">
        <span class="label-text font-bold">Value</span>
      </label>
      <textarea
        id="setting_value"
        name="value"
        bind:value={editingRow.value}
        placeholder="Enter value..."
        class="textarea textarea-bordered font-mono h-24"
      ></textarea>
    </div>

    <div class="form-control">
      <label class="label" for="setting_desc">
        <span class="label-text font-bold">Description</span>
      </label>
      <input
        id="setting_desc"
        name="description"
        bind:value={editingRow.description}
        placeholder="What is this setting for?"
        class="input input-bordered"
      />
    </div>

    <div class="modal-action border-t pt-4">
      <button
        type="button"
        class="btn btn-ghost"
        onclick={() => (showEditModal = false)}
      >
        Cancel
      </button>
      <button type="submit" class="btn btn-primary min-w-[120px]" disabled={!!upsertData.pending}>
        {#if upsertData.pending}
          <span class="loading loading-spinner"></span>
        {:else}
          Save Setting
        {/if}
      </button>
    </div>
  </form>
</Modal>
