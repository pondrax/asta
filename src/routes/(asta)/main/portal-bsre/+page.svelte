<script lang="ts">
  import {
    closeBsre,
    fetchBsreUsers,
    getSessionStatus,
    launchBsre,
    navigateBsre,
    debugBsreSession,
  } from "$lib/remotes/bsre.remote";

  let { data } = $props();
  const userId = $derived(data.user?.id ?? data.user?.email ?? "");
  const status = $derived(getSessionStatus({ userId }));

  let customUrl = $state("https://portal-bsre.bssn.go.id/");
  let toast = $state<{ type: "success" | "error"; message: string } | null>(null);

  // Users table state
  let users = $state<any[]>([]);
  let usersTotal = $state(0);
  let usersSearch = $state("");
  let usersStart = $state(0);
  let usersLength = $state(10);
  let usersLoading = $state(false);
  let usersError = $state("");
  let selectedUser = $state<any>(null);

  // Debug state
  let debugData = $state<any>(null);
  let debugLoading = $state(false);

  async function runDebug() {
    debugLoading = true;
    try {
      const res = await debugBsreSession({ userId });
      if (res?.success) {
        debugData = res;
        showToast("success", "Data debug berhasil diambil.");
      } else {
        showToast("error", res?.message ?? "Gagal mengambil data debug.");
      }
    } catch (e: any) {
      showToast("error", e?.message ?? "Gagal.");
    } finally {
      debugLoading = false;
    }
  }

  function showToast(type: "success" | "error", message: string) {
    toast = { type, message };
    setTimeout(() => (toast = null), 4000);
  }

  async function launch() {
    const res = await launchBsre({ userId });
    if (res?.success) showToast("success", res.message ?? "Browser dibuka.");
    else showToast("error", "Gagal membuka browser.");
  }

  async function close() {
    const res = await closeBsre({ userId });
    showToast("success", res?.message ?? "Sesi ditutup.");
    users = [];
    usersTotal = 0;
  }

  async function navigate() {
    const res = await navigateBsre({ userId, url: customUrl });
    if (res?.success) showToast("success", res.message ?? "Navigasi berhasil.");
    else showToast("error", res?.message ?? "Gagal navigasi.");
  }

  async function loadUsers() {
    usersLoading = true;
    usersError = "";
    try {
      const res = await fetchBsreUsers({
        userId,
        search: usersSearch,
        start: usersStart,
        length: usersLength,
      });
      if (res?.success && res.data) {
        const rawList = res.data?.data?.aaData ?? res.data?.data ?? res.data?.list ?? res.data;
        users = (Array.isArray(rawList) ? rawList : []).filter((u: any) => u != null);
        usersTotal = res.total ?? users.length;
      } else {
        usersError = res?.message ?? "Gagal memuat data.";
        showToast("error", usersError);
      }
    } catch (e: any) {
      usersError = e?.message ?? "Gagal memuat data.";
      showToast("error", usersError);
    } finally {
      usersLoading = false;
    }
  }

  const totalPages = $derived(Math.ceil(usersTotal / usersLength));
  const currentPage = $derived(Math.floor(usersStart / usersLength) + 1);

  function prevPage() {
    if (usersStart > 0) { usersStart = Math.max(0, usersStart - usersLength); loadUsers(); }
  }
  function nextPage() {
    if (usersStart + usersLength < usersTotal) { usersStart += usersLength; loadUsers(); }
  }
</script>

<div class="px-5 pt-2 overflow-x-clip">
  <div class="flex items-center gap-3 mb-5">
    <div class="bg-primary/10 p-3 rounded-xl">
      <iconify-icon icon="bx:globe" class="text-3xl text-primary"></iconify-icon>
    </div>
    <div>
      <h3 class="text-xl font-bold">Portal BSrE</h3>
      <p class="text-sm opacity-60">Buka Portal BSrE BSSN — login otomatis via BeID + TOTP</p>
    </div>
    <span class="badge badge-warning badge-sm ml-auto">Administrator Only</span>
  </div>

  {#if toast}
    <div class="alert {toast.type === 'success' ? 'alert-success' : 'alert-error'} mb-4">
      <iconify-icon icon={toast.type === 'success' ? 'bx:check-circle' : 'bx:error-circle'} class="text-xl"></iconify-icon>
      <span>{toast.message}</span>
    </div>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
    <!-- Session Status -->
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body py-4">
        <h2 class="card-title text-sm mb-2">
          <iconify-icon icon="bx:wifi" class="text-primary"></iconify-icon>
          Status Sesi
        </h2>
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <div class="badge {status.current?.active ? 'badge-success' : 'badge-neutral'} gap-1">
            <iconify-icon icon={status.current?.active ? 'bx:radio-circle-marked' : 'bx:radio-circle'}></iconify-icon>
            {status.current?.active ? "Aktif" : "Tidak Aktif"}
          </div>
          <div class="badge {status.current?.hasToken ? 'badge-info' : 'badge-ghost'} gap-1">
            <iconify-icon icon={status.current?.hasToken ? 'bx:key' : 'bx:lock'}></iconify-icon>
            {status.current?.hasToken ? "Token OK" : "No Token"}
          </div>
          {#if status.current?.active}
            <span class="text-xs opacity-60">
              {status.current.mode?.startsWith("remote") ? "🌐 Remote" : "💻 Lokal"}
            </span>
          {/if}
        </div>
        <div class="flex gap-2">
          <button class="btn btn-primary btn-sm flex-1" onclick={launch}>
            {#if launchBsre.pending}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:play"></iconify-icon>
            {/if}
            Buka
          </button>
          <button class="btn btn-warning btn-sm" onclick={runDebug} disabled={!status.current?.active}>
            {#if debugLoading}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:bug"></iconify-icon>
            {/if}
            Debug
          </button>
          <button class="btn btn-error btn-outline btn-sm" onclick={close} disabled={!status.current?.active}>
            {#if closeBsre.pending}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:stop"></iconify-icon>
            {/if}
            Tutup
          </button>
        </div>
      </div>
    </div>

    <!-- Navigate -->
    <div class="card bg-base-100 shadow-sm lg:col-span-2">
      <div class="card-body py-4">
        <h2 class="card-title text-sm mb-2">
          <iconify-icon icon="bx:navigation" class="text-secondary"></iconify-icon>
          Navigasi URL
        </h2>
        <div class="flex gap-2">
          <input
            type="url"
            bind:value={customUrl}
            class="input input-bordered input-sm flex-1"
            placeholder="https://portal-bsre.bssn.go.id/"
          />
          <button class="btn btn-secondary btn-sm" onclick={navigate} disabled={!status.current?.active}>
            {#if navigateBsre.pending}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:right-arrow-alt"></iconify-icon>
            {/if}
            Buka
          </button>
        </div>
        <div class="alert alert-info py-2 mt-2 text-xs">
          <iconify-icon icon="bx:info-circle" class="shrink-0"></iconify-icon>
          <span>Jika diarahkan ke BeID, sistem otomatis login dengan username, password, dan TOTP.</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Users Table -->
  <div class="card bg-base-100 shadow-sm">
    <div class="card-body">
      <div class="flex items-center gap-3 mb-3">
        <h2 class="card-title text-base flex-1">
          <iconify-icon icon="bx:group" class="text-accent"></iconify-icon>
          Daftar Pengguna BSrE
        </h2>
        <div class="join">
          <input
            class="input input-bordered input-sm join-item w-48"
            placeholder="Cari pengguna..."
            bind:value={usersSearch}
            onkeydown={(e) => e.key === 'Enter' && (usersStart = 0, loadUsers())}
          />
          <button
            class="btn btn-sm btn-primary join-item"
            onclick={() => { usersStart = 0; loadUsers(); }}
            disabled={(!status.current?.active && !status.current?.hasToken) || usersLoading}
          >
            {#if usersLoading}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <iconify-icon icon="bx:search"></iconify-icon>
            {/if}
            Muat
          </button>
        </div>
      </div>

      {#if !status.current?.active && !status.current?.hasToken && !users.length}
        <div class="text-center py-10 opacity-50">
          <iconify-icon icon="bx:globe" class="text-5xl mb-2"></iconify-icon>
          <p class="text-sm">Buka sesi BSrE terlebih dahulu untuk memuat data pengguna atau pastikan token tersimpan.</p>
        </div>
      {:else if usersError && !users.length}
        <div class="alert alert-error text-sm">
          <iconify-icon icon="bx:error-circle"></iconify-icon>
          <span>{usersError}</span>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="table table-sm table-zebra w-full">
            <thead>
              <tr>
                <th>#</th>
                <th>Nama</th>
                <th>Username</th>
                <th>Email</th>
                <th>NIK / NIP</th>
                <th>Jabatan</th>
                <th>Status</th>
                <th class="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {#if usersLoading}
                <tr>
                  <td colspan="8" class="text-center py-6">
                    <span class="loading loading-spinner loading-sm mr-2"></span>
                    Memuat data...
                  </td>
                </tr>
              {:else if !users.length}
                <tr>
                  <td colspan="8" class="text-center py-6 opacity-50">Belum ada data. Klik "Muat" untuk mengambil data.</td>
                </tr>
              {:else}
                {#each users as user, i}
                  {#if user}
                    <tr class="hover:bg-base-200/50 cursor-pointer transition-colors duration-150" onclick={() => selectedUser = user}>
                      <td class="text-xs opacity-60">{usersStart + i + 1}</td>
                      <td class="font-semibold">{user?.nama ?? "-"}</td>
                      <td class="font-mono text-xs">{user?.emailAddress?.split('@')[0] ?? "-"}</td>
                      <td class="text-xs">{user?.emailAddress ?? "-"}</td>
                      <td class="text-xs font-mono">{[user?.nik, user?.nip].filter(Boolean).join(' / ') || "-"}</td>
                      <td class="text-xs">{user?.jabatanOrganisasi ?? "-"}</td>
                      <td>
                        <span class="badge badge-xs {user?.status === 'VERIFIED' || user?.status === 'ACTIVE' || user?.aktif ? 'badge-success' : 'badge-ghost'} font-semibold">
                          {user?.status || (user?.aktif ? "Aktif" : "Nonaktif") || "-"}
                        </span>
                      </td>
                      <td class="text-right">
                        <button class="btn btn-ghost btn-xs text-primary gap-1" onclick={(e) => { e.stopPropagation(); selectedUser = user; }}>
                          <iconify-icon icon="bx:show" class="text-sm"></iconify-icon>
                          Detail
                        </button>
                      </td>
                    </tr>
                  {/if}
                {/each}
              {/if}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        {#if usersTotal > usersLength}
          <div class="flex items-center justify-between mt-3">
            <span class="text-xs opacity-60">
              {usersStart + 1}–{Math.min(usersStart + usersLength, usersTotal)} dari {usersTotal} pengguna
            </span>
            <div class="join">
              <button class="join-item btn btn-xs" onclick={prevPage} disabled={usersStart === 0}>«</button>
              <button class="join-item btn btn-xs btn-active">{currentPage} / {totalPages}</button>
              <button class="join-item btn btn-xs" onclick={nextPage} disabled={usersStart + usersLength >= usersTotal}>»</button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>

  {#if debugData}
    <div class="card bg-base-100 shadow-sm mt-4">
      <div class="card-body">
        <h2 class="card-title text-sm flex items-center justify-between">
          <span>Info Debug Sesi</span>
          <button class="btn btn-ghost btn-xs" onclick={() => debugData = null}>Tutup</button>
        </h2>
        <pre class="bg-base-200 p-3 rounded text-xs overflow-auto max-h-96">{JSON.stringify(debugData, null, 2)}</pre>
      </div>
    </div>
  {/if}

  <!-- User Detail Modal -->
  {#if selectedUser}
    <dialog class="modal modal-open">
      <div class="modal-box max-w-2xl bg-base-100 border border-base-content/10 shadow-2xl rounded-2xl">
        <div class="flex items-center justify-between border-b border-base-content/10 pb-3 mb-4">
          <div class="flex items-center gap-3">
            <div class="avatar placeholder">
              <div class="bg-primary text-primary-content rounded-full w-10">
                <span class="text-sm font-semibold">{selectedUser.nama?.charAt(0) || "U"}</span>
              </div>
            </div>
            <div>
              <h3 class="font-bold text-lg">{selectedUser.nama ?? "-"}</h3>
              <p class="text-xs opacity-60 font-mono">{selectedUser.id ?? "-"}</p>
            </div>
          </div>
          <button class="btn btn-ghost btn-circle btn-sm" onclick={() => selectedUser = null}>✕</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <!-- Personal Info Card -->
          <div class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5">
            <h4 class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1">
              <iconify-icon icon="bx:user"></iconify-icon> Informasi Personal
            </h4>
            <div class="space-y-2">
              <div>
                <span class="text-xs opacity-60">NIK / NIP</span>
                <p class="font-semibold font-mono">{[selectedUser.nik, selectedUser.nip].filter(Boolean).join(' / ') || "-"}</p>
              </div>
              <div>
                <span class="text-xs opacity-60">Email</span>
                <p class="font-semibold select-all">{selectedUser.emailAddress ?? "-"}</p>
              </div>
              <div>
                <span class="text-xs opacity-60">Nomor HP</span>
                <p class="font-semibold">{selectedUser.phone || selectedUser.no_wa || "-"}</p>
              </div>
            </div>
          </div>

          <!-- Job Info Card -->
          <div class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5">
            <h4 class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1">
              <iconify-icon icon="bx:briefcase"></iconify-icon> Jabatan & Organisasi
            </h4>
            <div class="space-y-2">
              <div>
                <span class="text-xs opacity-60">Jabatan</span>
                <p class="font-semibold">{selectedUser.jabatanOrganisasi ?? "-"}</p>
              </div>
              <div>
                <span class="text-xs opacity-60">Unit Kerja</span>
                <p class="font-semibold">{selectedUser.organisasiUnit ?? "-"}</p>
              </div>
              <div>
                <span class="text-xs opacity-60">Organisasi</span>
                <p class="font-semibold">{selectedUser.organisasi ?? "-"}</p>
              </div>
            </div>
          </div>

          <!-- Certificate & Products -->
          <div class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5 md:col-span-2">
            <h4 class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1">
              <iconify-icon icon="bx:certification"></iconify-icon> Sertifikat & Layanan
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span class="text-xs opacity-60">Status Sertifikat</span>
                <div>
                  <span class="badge {selectedUser.certificateStatus === 'ISSUE' ? 'badge-success' : 'badge-warning'} font-semibold badge-sm mt-1">
                    {selectedUser.certificateStatus ?? "-"}
                  </span>
                </div>
              </div>
              <div>
                <span class="text-xs opacity-60">Layanan Produk</span>
                <p class="font-semibold text-xs mt-1">{selectedUser.products ?? "-"}</p>
              </div>
              <div>
                <span class="text-xs opacity-60">Tanggal Pendaftaran</span>
                <p class="font-semibold">{selectedUser.createdDate ?? "-"}</p>
              </div>
              <div>
                <span class="text-xs opacity-60">Asal Registrasi</span>
                <p class="font-semibold font-mono">{selectedUser.registeredOrigin ?? "-"}</p>
              </div>
            </div>
          </div>

          <!-- Status Verifikasi -->
          <div class="card bg-base-200/50 p-4 rounded-xl border border-base-content/5 md:col-span-2">
            <h4 class="font-bold text-xs opacity-60 uppercase mb-3 flex items-center gap-1">
              <iconify-icon icon="bx:check-shield"></iconify-icon> Status Verifikasi
            </h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div class="bg-base-100 p-2 rounded-lg border border-base-content/5">
                <span class="text-[10px] opacity-60 block">Dukcapil</span>
                <span class="badge badge-sm {selectedUser.verifiedDukcapil ? 'badge-success' : 'badge-neutral'} mt-1">
                  {selectedUser.verifiedDukcapil ? "✓ Terverifikasi" : "✗ Belum"}
                </span>
              </div>
              <div class="bg-base-100 p-2 rounded-lg border border-base-content/5">
                <span class="text-[10px] opacity-60 block">Liveness</span>
                <span class="badge badge-sm {selectedUser.verfifiedLiveness ? 'badge-success' : 'badge-neutral'} mt-1">
                  {selectedUser.verfifiedLiveness ? "✓ Terverifikasi" : "✗ Belum"}
                </span>
              </div>
              <div class="bg-base-100 p-2 rounded-lg border border-base-content/5">
                <span class="text-[10px] opacity-60 block">WhatsApp</span>
                <span class="badge badge-sm {selectedUser.phoneVerified ? 'badge-success' : 'badge-neutral'} mt-1">
                  {selectedUser.phoneVerified ? "✓ Terverifikasi" : "✗ Belum"}
                </span>
              </div>
              <div class="bg-base-100 p-2 rounded-lg border border-base-content/5">
                <span class="text-[10px] opacity-60 block">Verifikator</span>
                <span class="badge badge-sm {selectedUser.verifiedVerifikator ? 'badge-success' : 'badge-neutral'} mt-1">
                  {selectedUser.verifiedVerifikator ? "✓ Terverifikasi" : "✗ Belum"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-action mt-6">
          <button class="btn btn-neutral btn-sm" onclick={() => selectedUser = null}>Tutup</button>
        </div>
      </div>
      <div class="modal-backdrop bg-black/40 backdrop-blur-xs" onclick={() => selectedUser = null}></div>
    </dialog>
  {/if}
</div>
