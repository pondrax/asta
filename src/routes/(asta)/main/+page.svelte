<script lang="ts">
  let { data } = $props();
</script>

<div class="px-5 overflow-x-clip pt-2">
  <h3 class="text-xl">Dashboard</h3>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
    <a href="/main/users" class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <h2 class="card-title font-bold">Users</h2>
        <p>Menu administrasi user</p>
      </div>
    </a>
    <a href="/main/logs" class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <h2 class="card-title font-bold">Logs</h2>
        <p>Menu administrasi logs</p>
      </div>
    </a>
  </div>
</div>
