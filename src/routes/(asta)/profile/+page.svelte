<script lang="ts">
  import { getData, saveData } from "$lib/remotes/api.remote";
  import { Select } from "$lib/components";

  let { data } = $props();

  const profile = $derived(
    getData({
      table: "signers",
      where: {
        email: data.user?.email,
      },
      limit: 1,
      offset: 0,
    }),
  );

  const signer = $derived(profile.current?.data?.[0] ?? null);

  let signerForm = $state({ name: "", nik: "" });
  let signerLoaded = $state(false);

  $effect(() => {
    if (signer && !signerLoaded) {
      signerForm.name = signer.name ?? "";
      signerForm.nik = signer.nik ?? "";
      signerLoaded = true;
    }
  });
</script>

<div class="px-5 py-6 max-w-2xl mx-auto space-y-6">
  <!-- Profile Header -->
  <div
    class="flex items-center gap-4 p-6 bg-base-200/50 rounded-2xl border border-base-300/50"
  >
    <div class="avatar placeholder">
      <div class="bg-primary text-primary-content rounded-full w-16">
        <span class="text-2xl font-bold"
          >{(data.user?.email ?? "?")[0].toUpperCase()}</span
        >
      </div>
    </div>
    <div class="flex-1 min-w-0">
      <h1 class="text-xl font-bold truncate">
        {signer?.name ?? data.user?.email}
      </h1>
      <p class="text-sm opacity-60 truncate">{data.user?.email}</p>
      <span class="badge badge-sm badge-primary mt-1"
        >{data.user?.role?.name ?? "-"}</span
      >
      {#if data.user?.organization?.name}
        <span class="badge badge-sm badge-outline mt-1"
          >{data.user.organization.name === "-"
            ? "Semua Perangkat Daerah"
            : data.user.organization.name}</span
        >
      {/if}
    </div>
  </div>

  <!-- Account Section -->
  <div class="card bg-base-100 border border-base-200/60 shadow-sm">
    <div class="card-body space-y-4">
      <h2 class="card-title text-lg">
        <iconify-icon icon="bx:user" class="text-primary"></iconify-icon>
        Informasi Akun
      </h2>

      <form
        {...saveData.enhance(async ({ submit }) => {
          try {
            await submit();
          } catch (e) {
            console.error(e);
          }
        })}
        class="space-y-4"
      >
        <input type="hidden" name="table" value="users" />
        <input type="hidden" name="id" value={data.user?.id} />

        <label class="floating-label">
          <span>Email</span>
          <input
            type="email"
            class="input input-sm"
            value={data.user?.email}
            disabled
          />
        </label>

        <label class="floating-label">
          <span>Role</span>
          <input
            type="text"
            class="input input-sm"
            value={data.user?.role?.name ?? "-"}
            disabled
          />
        </label>

        <Select
          table="organizations"
          params={{ limit: 100, offset: 0 }}
          labelKey="name"
          valueKey="id"
          value={data.user?.organization_id}
          name="organization_id"
          label="Organisasi"
          placeholder="Pilih organisasi..."
          inputClass="input-sm"
          mapOptions={(opts) =>
            opts.map((opt) =>
              opt.name === "-"
                ? { ...opt, name: "Semua Perangkat Daerah" }
                : opt,
            )}
        />

        <div
          class="flex items-center justify-between pt-2 border-t border-base-200"
        >
          <a
            href={`${data.baseURLSSO}/account/#/security/signingin`}
            target="_blank"
            class="btn btn-sm btn-ghost gap-1.5"
          >
            <iconify-icon icon="bx:key" class="text-sm"></iconify-icon>
            Ubah Password SSO
          </a>
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
            Simpan Akun
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Signer Section -->
  {#if signer}
    <div class="card bg-base-100 border border-base-200/60 shadow-sm">
      <div class="card-body space-y-4">
        <h2 class="card-title text-lg">
          <iconify-icon icon="bx:pen" class="text-secondary"></iconify-icon>
          Profil Penandatangan
        </h2>

        <form
          {...saveData.enhance(async ({ submit }) => {
            try {
              await submit();
            } catch (e) {
              console.error(e);
            }
          })}
          class="space-y-4"
        >
          <input type="hidden" name="table" value="signers" />
          <input type="hidden" name="id" value={signer.id} />

          <label class="floating-label">
            <span>Nama</span>
            <input
              type="text"
              class="input input-sm"
              bind:value={signerForm.name}
              name="name"
            />
          </label>

          <label class="floating-label">
            <span>NIK</span>
            <input
              type="text"
              class="input input-sm"
              bind:value={signerForm.nik}
              name="nik"
            />
          </label>

          <div class="flex justify-end pt-2 border-t border-base-200">
            <button
              type="submit"
              class="btn btn-sm btn-secondary"
              disabled={!!saveData.pending}
            >
              {#if saveData.pending}
                <span class="loading loading-spinner loading-xs"></span>
              {:else}
                <iconify-icon icon="bx:save" class="text-sm"></iconify-icon>
              {/if}
              Simpan Profil
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>
