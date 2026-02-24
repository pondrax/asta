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
          {
            nik: data.user?.nik,
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
      <input
        type="text"
        class="input input-sm"
        value={data.user?.name}
        disabled
      />
    </label>
  </div>
</div>
