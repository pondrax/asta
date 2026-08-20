<script lang="ts">
  import {
    delData,
    getData,
    saveData,
    type GetParams,
  } from "$lib/remotes/api.remote";
  import { Modal, Toolbar, Select } from "$lib/components";
  import { d } from "$lib/utils";

  const expand = {
    with: {
      role: {},
      organization: {},
    },
  };
  let query: GetParams<"users"> = $state({
    table: "users",
    limit: 20,
    offset: 0,
    where: {},
    ...expand,
  });
  const records = $derived(getData({ ...query, ...expand }));
  const items = $derived(records.current ?? { data: [], count: 0 });
  const forms: Record<string, any> = $state({});
  let selections: string[] = $state([]);

  let lastCount = $state(0);
  $effect(() => {
    if (records.current && lastCount !== items.count) {
      query.offset = 0;
      lastCount = items.count;
      selections = [];
    }
  });

  function startEdit(item: any) {
    forms.edit = JSON.parse(JSON.stringify(item));
  }
</script>

<Modal bind:data={forms.del} title="Delete Data">
  <form
    {...delData.enhance(async ({ form, data, submit }) => {
      try {
        await submit();
        forms.del = false;
      } catch (e) {
        console.error(e);
      }
    })}
  >
    <input type="hidden" name="table" value="documents" />
    <p class="sticky top-0 bg-base-100 py-2">
      Apakah Anda yakin ingin menghapus data ini?
    </p>
    {#each selections as id}
      {@const item = items.data.find((i) => i.id === id)}
      <div>
        <input type="text" name="id[]" value={id} class="w-20" readonly />
        - {item?.email}
      </div>
    {/each}
    <div class="sticky bottom-0 bg-base-100 pt-2">
      <button
        type="submit"
        class="btn btn-sm btn-error"
        disabled={!!delData.pending}
      >
        {#if delData.pending}
          <span class="loading loading-spinner loading-xs"></span>
        {:else}
          <iconify-icon icon="bx:trash"></iconify-icon>
        {/if}
        Hapus
      </button>
    </div>
  </form>
</Modal>

<Modal bind:data={forms.edit} title="Edit Pengguna" size="lg">
  {#snippet children(item)}
    <form
      {...saveData.enhance(async (form) => {
        try {
          await form.submit();
          forms.edit = false;
          records.refresh();
        } catch (e) {
          console.error(e);
        }
      })}
      class="space-y-4"
    >
      <input type="hidden" name="table" value="users" />
      <input type="hidden" name="id" value={item.id} />
      <label class="floating-label">
        <span>Email</span>
        <input
          type="email"
          class="input input-sm"
          value={item.email}
          readonly
        />
      </label>
      <Select
        table="organizations"
        params={{ limit: 100, offset: 0 }}
        labelKey="name"
        valueKey="id"
        bind:value={item.organization_id}
        name="organization_id"
        label="Organisasi"
        placeholder="Pilih organisasi..."
        inputClass="input-sm"
        mapOptions={(opts) =>
          opts.map((opt) =>
            opt.name === "-" ? { ...opt, name: "Semua Perangkat Daerah" } : opt,
          )}
      />
      <div class="flex justify-end gap-2 pt-2 border-t border-base-200">
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          onclick={() => (forms.edit = false)}>Batal</button
        >
        <button
          type="submit"
          class="btn btn-sm btn-primary"
          disabled={!!saveData.pending}
        >
          {#if saveData.pending}
            <span class="loading loading-spinner loading-xs"></span>
          {:else}
            <iconify-icon icon="bx:save" class="text-sm"></iconify-icon>
          {/if}
          Simpan
        </button>
      </div>
    </form>
  {/snippet}
</Modal>

<div class="px-6 py-4 space-y-3 mx-auto">
  <div class="flex items-center justify-between gap-4">
    <div>
      <h1
        class="text-2xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent"
      >
        Daftar Pengguna
      </h1>
      <p class="text-sm opacity-60">
        Kelola akun dan hak akses pengguna sistem
      </p>
    </div>
  </div>

  <div
    class="bg-base-100/40 border border-base-200/60 rounded-2xl p-4 shadow-sm backdrop-blur space-y-4"
  >
    <Toolbar
      bind:query
      {records}
      mapper={{
        export: (item) => ({
          coba: item.id,
          ...item,
        }),
      }}
    >
      {#if selections.length}
        <div class="flex items-center gap-2 animate-fade-in">
          <button
            class="btn btn-sm btn-error btn-outline gap-1.5"
            onclick={() => (forms.del = true)}
          >
            <iconify-icon icon="bx:trash" class="text-sm"></iconify-icon>
            Hapus ({selections.length})
          </button>
        </div>
      {/if}
      {#snippet filter(where)}
        <div class="form-control w-full max-w-xs">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="label py-1">
            <span class="label-text font-bold text-xs opacity-75"
              >Cari Email</span
            >
          </label>
          <input
            bind:value={where.email}
            class="input input-sm input-bordered"
            placeholder="Masukkan email..."
          />
        </div>
      {/snippet}
    </Toolbar>

    <!-- Table Container -->
    <div
      class="overflow-x-auto border border-base-300/60 rounded-xl bg-base-100/50 backdrop-blur-md h-[calc(100vh-17.5rem)] relative shadow-inner"
    >
      <table class="table table-md table-pin-rows table-pin-cols">
        <thead>
          <tr
            class="bg-base-200/50 text-base-content/80 font-bold border-b border-base-300"
          >
            <th class="w-12 text-center bg-base-200/50 z-20">
              <input
                type="checkbox"
                class="checkbox checkbox-sm checkbox-primary"
                bind:checked={
                  () =>
                    !!selections.length &&
                    selections.length === items.data?.length,
                  (v) => {
                    selections = v ? items.data?.map((r) => r.id) || [] : [];
                  }
                }
              />
            </th>
            <th class="min-w-64">Email</th>
            <th class="w-32">Role</th>
            <th class="w-44">Organisasi</th>
            <th class="w-44">Dibuat</th>
            <th class="w-44">Diperbarui</th>
            <th class="w-20"></th>
          </tr>
        </thead>
        <tbody>
          {#if records.loading}
            <tr>
              <td colspan="6" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-2">
                  <span class="loading loading-spinner loading-md text-primary"
                  ></span>
                  <span class="text-sm opacity-55 font-medium"
                    >Memuat data pengguna...</span
                  >
                </div>
              </td>
            </tr>
          {:else if records.error}
            <tr>
              <td colspan="6" class="py-12 text-center">
                <div
                  class="flex flex-col items-center justify-center gap-3 text-error"
                >
                  <iconify-icon icon="bx:error-circle" class="text-3xl"
                  ></iconify-icon>
                  <div class="text-sm font-semibold">
                    Gagal memuat data: {records.error.message}
                  </div>
                  <button
                    class="btn btn-sm btn-error btn-outline"
                    onclick={() => records.refresh()}
                  >
                    Coba Lagi
                  </button>
                </div>
              </td>
            </tr>
          {:else if !items.data?.length}
            <tr>
              <td colspan="6" class="py-12 text-center">
                <div
                  class="flex flex-col items-center justify-center gap-2 opacity-40"
                >
                  <iconify-icon icon="bx:user-x" class="text-3xl"
                  ></iconify-icon>
                  <span class="text-sm font-medium"
                    >Tidak ada data pengguna</span
                  >
                </div>
              </td>
            </tr>
          {:else}
            {#each items.data as item}
              <tr class="hover:bg-base-200/30 transition-colors">
                <td class="text-center">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm checkbox-primary"
                    bind:group={selections}
                    value={item.id}
                  />
                </td>
                <td class="font-medium">{item.email}</td>
                <td>
                  <span
                    class="badge badge-sm {item.role?.name === 'admin'
                      ? 'badge-primary'
                      : 'badge-ghost'}"
                  >
                    {item.role?.name ?? "-"}
                  </span>
                </td>
                <td class="text-xs">
                  {item.organization?.name ?? "-"}
                </td>
                <td class="text-xs opacity-60 whitespace-nowrap">
                  {d(item.created).format("HH:mm, DD MMM YYYY")}
                </td>
                <td class="text-xs opacity-60 whitespace-nowrap">
                  {d(item.updated).format("HH:mm, DD MMM YYYY")}
                </td>
                <td>
                  <button
                    class="btn btn-xs btn-ghost btn-square"
                    onclick={() => startEdit(item)}
                    aria-label="Edit Pengguna"
                  >
                    <iconify-icon icon="bx:edit"></iconify-icon>
                  </button>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>
