<script lang="ts">
  import { page } from "$app/state";
  import { Toolbar } from "$lib/components";
  import {
    closeBsre,
    fetchBsreUsers,
    getSessionStatus,
    launchBsre,
    navigateBsre,
    debugBsreSession,
  } from "$lib/remotes/bsre.remote";
  import { getData, type GetParams } from "$lib/remotes/api.remote";

  const userId = $derived(page.data.user?.id ?? page.data.user?.email ?? "");
  const status = $derived(getSessionStatus({ userId }));

  let customUrl = $state("https://portal-bsre.bssn.go.id/");
  let toast = $state<{ type: "success" | "error"; message: string } | null>(null);

  // Toolbar query state
  let query: GetParams<"bsreUsers"> = $state({
    table: "bsreUsers",
    limit: 10,
    offset: 0,
    search: "",
    where: {},
  });

  // Reactive records from local DB
  const records = $derived(getData({ ...query }));
  const items = $derived(records.current ?? { data: [], count: 0 });

  // Sync state
  let syncing = $state(false);
  let selectedUser = $state<any>(null);

  // PII masking
  let showPii = $state(false);

  function latestCert(user: any) {
    const certs: any[] = user?.details?.data?.sertifikat ?? [];
    if (!certs.length) return null;
    return [...certs].sort(
      (a, b) => new Date(b.notAfterDate).getTime() - new Date(a.notAfterDate).getTime()
    )[0];
  }

  function maskPii(value: string | null | undefined, type: "nik" | "nip" | "username" | "phone"): string {
    if (!value) return "-";
    if (showPii) return value;
    if (type === "nik" || type === "nip") {
      const clean = value.replace(/\s/g, "");
      if (clean.length <= 4) return clean;
      return "••••••" + clean.slice(-4);
    }
    if (type === "phone") {
      const clean = value.replace(/\s/g, "");
      if (clean.length <= 4) return clean;
      return "••••••" + clean.slice(-4);
    }
    if (type === "username") {
      if (value.length <= 1) return value;
      return value[0] + "••••";
    }
    return value;
  }

  // Debug state
  let debugData = $state<any>(null);
  let debugLoading = $state(false);

  // Reset offset when count changes (like users page)
  let lastCount = $state(0);
  $effect(() => {
    if (records.current && lastCount !== items.count) {
      query.offset = 0;
      lastCount = items.count;
    }
  });

  async function syncFromBsre() {
    if (syncing) return;
    syncing = true;
    try {
      const res = await fetchBsreUsers({ userId });
      if (res?.success) {
        showToast("success", `Data BSrE tersinkronisasi (${res.total} pengguna).`);
        records.refresh();
      } else {
        showToast("error", res?.message ?? "Gagal sinkronisasi.");
      }
    } catch (e: any) {
      showToast("error", e?.message ?? "Gagal sinkronisasi.");
    } finally {
      syncing = false;
    }
  }

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

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function showToast(type: "success" | "error", message: string) {
    toast = { type, message };
    setTimeout(() => (toast = null), 4000);
  }

  async function launch() {
    const res = await launchBsre({ userId });
    if (res?.success) showToast("success", res.message ?? "Browser dibuka.");
    else showToast("error", "Gagal membuka browser.");
    status.refresh();
  }

  async function close() {
    const res = await closeBsre({ userId });
    showToast("success", res?.message ?? "Sesi ditutup.");
    status.refresh();
  }

  async function navigate() {
    const res = await navigateBsre({ userId, url: customUrl });
    if (res?.success) showToast("success", res.message ?? "Navigasi berhasil.");
    else showToast("error", res?.message ?? "Gagal navigasi.");
    status.refresh();
  }
</script>

<div class="px-6 py-4 space-y-4 max-w-7xl mx-auto">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h1
        class="text-2xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent"
      >Portal BSrE</h1>
      <p class="text-sm opacity-60">Buka Portal BSrE BSSN — login otomatis via BeID + TOTP</p>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <a
        href="https://portal-bsre.bssn.go.id/"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-sm gap-1"
      >
        <iconify-icon icon="bx:link-external" class="text-sm"></iconify-icon>
        Buka Portal
      </a>
      <button
        class="btn btn-sm btn-primary gap-1"
        onclick={syncFromBsre}
        disabled={(!status.current?.active && !status.current?.hasToken) || syncing}
      >
        {#if syncing}
          <span class="loading loading-spinner loading-xs"></span>
        {:else}
          <iconify-icon icon="bx:sync"></iconify-icon>
        {/if}
        Sync
      </button>
    </div>
  </div>

  <div class="toast toast-end toast-bottom z-[9999]">
    {#if toast}
      <div class="alert {toast.type === 'success' ? 'alert-success' : 'alert-error'} py-2 px-4 shadow-xl text-xs font-semibold">
        <iconify-icon icon={toast.type === 'success' ? 'bx:check-circle' : 'bx:error-circle'}></iconify-icon>
        <span>{toast.message}</span>
      </div>
    {/if}
  </div>

  <!-- Session Status -->
  <div class="bg-base-100/40 border border-base-200/60 rounded-2xl py-2 px-4 shadow-sm backdrop-blur">
    <div class="flex items-center gap-3">
      <iconify-icon icon="bx:wifi" class="text-lg text-primary"></iconify-icon>
      <span class="font-semibold text-sm">Status Sesi</span>
      <div class="flex items-center gap-2 ml-2">
        <div class="badge badge-sm {status.current?.active ? 'badge-success' : 'badge-neutral'} gap-1">
          <iconify-icon icon={status.current?.active ? 'bx:radio-circle-marked' : 'bx:radio-circle'}></iconify-icon>
          {status.current?.active ? "Aktif" : "Tidak Aktif"}
        </div>
        <div class="badge badge-sm {status.current?.hasToken ? 'badge-info' : 'badge-ghost'} gap-1">
          <iconify-icon icon={status.current?.hasToken ? 'bx:key' : 'bx:lock'}></iconify-icon>
          {status.current?.hasToken ? "Token OK" : "No Token"}
        </div>
        {#if status.current?.active && status.current.mode?.startsWith("remote")}
          <span class="text-xs opacity-60">🌐 Remote</span>
        {/if}
      </div>
      <div class="flex gap-2 ml-auto">
        <button class="btn btn-primary btn-sm gap-1" onclick={launch}>
          {#if launchBsre.pending}
            <span class="loading loading-spinner loading-xs"></span>
          {:else}
            <iconify-icon icon="bx:key"></iconify-icon>
          {/if}
          Update Token
        </button>
        <button class="btn btn-warning btn-sm gap-1" onclick={runDebug} disabled={!status.current?.active}>
          {#if debugLoading}
            <span class="loading loading-spinner loading-xs"></span>
          {:else}
            <iconify-icon icon="bx:bug"></iconify-icon>
          {/if}
          Debug
        </button>
        <button class="btn btn-error btn-outline btn-sm gap-1" onclick={close} disabled={!status.current?.active}>
          {#if closeBsre.pending}
            <span class="loading loading-spinner loading-xs"></span>
          {:else}
            <iconify-icon icon="bx:stop"></iconify-icon>
          {/if}
          Tutup
        </button>
      </div>
    </div>

    {#if debugData}
      <div class="border-t border-base-content/10 mt-2 pt-2">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[11px] font-semibold opacity-60">Info Debug Sesi</span>
          <button class="btn btn-ghost btn-xs" onclick={() => debugData = null}>Tutup</button>
        </div>
        <pre class="bg-base-200/80 p-2 rounded text-[10px] overflow-auto max-h-40">{JSON.stringify(debugData, null, 2)}</pre>
      </div>
    {/if}
  </div>

  <!-- Users Table -->
  <div
    class="bg-base-100/40 border border-base-200/60 rounded-2xl p-4 shadow-sm backdrop-blur space-y-4"
  >
    <Toolbar bind:query {records}>
      {#snippet filter(where)}
        <div class="form-control w-full max-w-xs">
          <label class="label py-1" for="filter-cert-status">
            <span class="label-text font-bold text-xs opacity-75">Status Sertifikat</span>
          </label>
          <input
            id="filter-cert-status"
            bind:value={where.certificateStatus}
            class="input input-sm input-bordered"
            placeholder="ISSUE, REVOKED..."
          />
        </div>
        <div class="form-control w-full max-w-xs">
          <label class="label py-1" for="filter-nik">
            <span class="label-text font-bold text-xs opacity-75">NIK</span>
          </label>
          <input
            id="filter-nik"
            bind:value={where.nik}
            class="input input-sm input-bordered"
            placeholder="Cari NIK..."
          />
        </div>
      {/snippet}
      {#snippet actions()}
        <li>
          <button onclick={() => showPii = !showPii}>
            <iconify-icon icon={showPii ? "bx:show" : "bx:hide"}></iconify-icon>
            {showPii ? "Tampilkan PII" : "Masking PII"}
          </button>
        </li>
      {/snippet}
    </Toolbar>

    <div
      class="overflow-x-auto border border-base-300/60 rounded-xl bg-base-100/50 backdrop-blur-md h-[calc(100vh-20rem)] relative shadow-inner"
    >
      <table class="table table-md table-pin-rows table-pin-cols">
        <thead>
          <tr class="bg-base-200/50 text-base-content/80 font-bold border-b border-base-300">
            <th class="w-10 text-center bg-base-200/50 sticky left-0 z-2">#</th>
            <th class="min-w-[180px] bg-base-200/50 sticky left-10 z-2">Nama</th>
            <th class="w-56">Email</th>
            <th class="w-36">NIK</th>
            <th class="w-36">NIP</th>
            <th class="w-24 text-center">Sertifikat</th>
            <th class="w-28">Mulai</th>
            <th class="w-28">Berakhir</th>
            <th class="w-48">Jabatan</th>
            <th class="w-28 text-center">Status</th>
            <th class="w-20 text-center bg-base-200/50">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {#if records.loading && !items.data.length}
            <tr>
              <td colspan="11" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-2">
                  <span class="loading loading-spinner loading-md text-primary"></span>
                  <span class="text-sm opacity-55 font-medium">Memuat data pengguna BSrE...</span>
                </div>
              </td>
            </tr>
          {:else if !status.current?.active && !status.current?.hasToken && !items.data.length}
            <tr>
              <td colspan="11" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-2 opacity-50">
                  <iconify-icon icon="bx:globe" class="text-3xl"></iconify-icon>
                  <p class="text-sm font-medium">Buka sesi BSrE terlebih dahulu</p>
                  <p class="text-xs">Pastikan token tersimpan untuk memuat data pengguna.</p>
                </div>
              </td>
            </tr>
          {:else if records.error}
            <tr>
              <td colspan="11" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-3 text-error">
                  <iconify-icon icon="bx:error-circle" class="text-3xl"></iconify-icon>
                  <div class="text-sm font-semibold">{records.error.message}</div>
                  <button class="btn btn-sm btn-error btn-outline" onclick={() => records.refresh()}>
                    Coba Lagi
                  </button>
                </div>
              </td>
            </tr>
          {:else if !items.data.length}
            <tr>
              <td colspan="11" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center gap-2 opacity-40">
                  <iconify-icon icon="bx:group" class="text-3xl"></iconify-icon>
                  <span class="text-sm font-medium">Belum ada data. Klik "Sync" untuk mengambil data dari BSrE.</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each items.data as user, i}
              {#if user}
                <tr class="hover:bg-base-200/30 transition-colors">
                  <td class="text-center text-xs opacity-60 bg-base-100 sticky left-0 z-1">{query.offset + i + 1}</td>
                  <td class="font-semibold bg-base-100 sticky left-10 z-1">{user?.nama ?? "-"}</td>
                  <td class="text-xs">{user?.emailAddress ?? "-"}</td>
                  <td class="text-xs font-mono">{maskPii(user?.nik ?? "-", "nik")}</td>
                  <td class="text-xs font-mono">{maskPii(user?.nip ?? "-", "nip")}</td>
                  <td class="text-center">
                    <span class="badge badge-sm {latestCert(user)?.status === 'ISSUE' ? 'badge-success' : latestCert(user)?.status === 'REVOKE' ? 'badge-error' : 'badge-ghost'} font-semibold">
                      {latestCert(user)?.status ?? "-"}
                    </span>
                  </td>
                  <td class="text-xs">{latestCert(user)?.notBeforeDate?.split(" ")[0] ?? "-"}</td>
                  <td class="text-xs">{latestCert(user)?.notAfterDate?.split(" ")[0] ?? "-"}</td>
                  <td class="text-xs">{user?.jabatanOrganisasi ?? "-"}</td>
                  <td class="text-center">
                    <span class="badge badge-sm {user?.status === 'VERIFIED' || user?.status === 'ACTIVE' || user?.aktif ? 'badge-success' : 'badge-ghost'} font-semibold">
                      {user?.status || (user?.aktif ? "Aktif" : "Nonaktif") || "-"}
                    </span>
                  </td>
                  <td class="text-center sticky right-0 z-1 bg-base-100">
                    <div class="flex items-center justify-center gap-1">
                      <button
                        class="btn btn-ghost btn-xs text-primary tooltip tooltip-left"
                        data-tip="Lihat Detail"
                        onclick={(e) => { e.stopPropagation(); selectedUser = user; }}
                      >
                        <iconify-icon icon="bx:show" class="text-sm"></iconify-icon>
                      </button>
                      {#if user?.id}
                        <a
                          href="https://portal-bsre.bssn.go.id/app/users/{user.id}"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="btn btn-ghost btn-xs text-accent tooltip tooltip-left"
                          data-tip="Buka Profil BSrE"
                          onclick={(e) => e.stopPropagation()}
                        >
                          <iconify-icon icon="bx:link-external" class="text-sm"></iconify-icon>
                        </a>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- User Detail Modal -->
  {#if selectedUser}
    <div use:portal>
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
                <span class="text-xs opacity-60">NIK</span>
                <p class="font-semibold font-mono">{maskPii(selectedUser.nik ?? "-", "nik")}</p>
              </div>
              <div>
                <span class="text-xs opacity-60">NIP</span>
                <p class="font-semibold font-mono">{maskPii(selectedUser.nip ?? "-", "nip")}</p>
              </div>
              <div>
                <span class="text-xs opacity-60">Email</span>
                <p class="font-semibold select-all">{selectedUser.emailAddress ?? "-"}</p>
              </div>
              <div>
                <span class="text-xs opacity-60">Nomor HP</span>
                <p class="font-semibold">{maskPii(selectedUser.phone || selectedUser.no_wa || "-", "phone")}</p>
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
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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

            {#if selectedUser.details?.data?.sertifikat?.length}
              <div class="border-t border-base-content/10 pt-3">
                <span class="text-xs opacity-60 uppercase font-bold block mb-2">Riwayat Sertifikat</span>
                <div class="space-y-2">
                  {#each [...selectedUser.details.data.sertifikat].sort((a, b) => new Date(b.notAfterDate).getTime() - new Date(a.notAfterDate).getTime()) as cert, ci}
                    <div class="bg-base-100 p-3 rounded-lg border border-base-content/5">
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <div class="flex items-center gap-2">
                          <span class="badge badge-sm {cert.status === 'ISSUE' ? 'badge-success' : cert.status === 'REVOKE' ? 'badge-error' : 'badge-warning'}">
                            {cert.status}
                          </span>
                          <span class="text-xs font-semibold">{cert.product ?? "-"}</span>
                        </div>
                        <span class="text-[10px] opacity-50 font-mono">{cert.serialNumber?.slice(-8) ?? ""}</span>
                      </div>
                      <div class="flex items-center gap-3 text-[11px] opacity-70">
                        <span>Berlaku: {cert.notBeforeDate?.split(" ")[0] ?? "?"} — {cert.notAfterDate?.split(" ")[0] ?? "?"}</span>
                        <span class="badge badge-ghost badge-xs">{cert.jenisSertifikat ?? "-"}</span>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
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
    </div>
  {/if}
</div>
