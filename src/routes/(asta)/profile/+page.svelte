<script lang="ts">
  import { getData } from "$lib/remotes/api.remote";

  let { data } = $props();

  const profile = $derived(
    getData({
      table: "signers",
      where: {
        OR: [
          {
            email: data.user?.email,
          },
        ],
      },
      limit: 1,
      offset: 0,
    }),
  );

  // console.log(profile.current);
</script>

<div class="px-5 overflow-x-clip">
  <h3 class="text-xl">Profil</h3>

  <div class="space-y-5 mt-5">
    <label class="floating-label">
      <span>Email</span>
      <input
        type="text"
        class="input input-sm"
        value={data.user?.email}
        disabled
      />
    </label>
    <label class="floating-label">
      <span>Nama</span>
      <input type="text" class="input input-sm" bind:value={data.user!.name} />
    </label>
    <label class="floating-label">
      <span>NIK</span>
      <input type="text" class="input input-sm" bind:value={data.user!.nik} />
    </label>
    <div>
      <button class="btn btn-sm btn-primary">Simpan</button>
    </div>
  </div>
</div>
