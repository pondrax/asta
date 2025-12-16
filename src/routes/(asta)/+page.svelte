<script lang="ts">
  import { getStats } from "$lib/remotes/stats.remote";

  let { children } = $props();
  const stats = getStats({});
</script>

<div>
  <div class="flex justify-center items-center h-[calc(100vh-8rem)]">
    <div class="max-w-xl text-center">
      <figure class="">
        <img src="/logo-white.png" alt="logo" class="dark-logo h-40" />
        <img src="/logo.png" alt="logo" class="light-logo h-40" />
      </figure>
      <p class="my-5">
        Tata Pelayanan Keamanan dan Asisten Sertifikat Elektronik Kota Mojokerto
        disingkat <span class="animate-pulse font-semibold text-primary">
          Tapak Astà
        </span> adalah aplikasi berbasis digital yang berfungsi sebagai platform
        untuk pengajuan, penerbitan, dan pengelolaan sertifikat elektronik di Kota
        Mojokerto, dengan fokus pada tata pelayanan keamanan yang terpercaya dan
        mudah diakses oleh pengguna.
      </p>
      <a href="./sign" class="btn btn-primary animate-bounce">
        Tanda Tangan Dokumen Sekarang!
        <iconify-icon icon="bx:pen"></iconify-icon>
      </a>
    </div>
  </div>
  <section class="text-center max-w-2xl mx-auto my-10">
    <div>
      <h3 class="text-lg">Statistik Penandatangan</h3>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-6">
      {#if stats.loading}
        <div>loading</div>
      {:else if stats.current}
        {@const { signed, verified } = stats.current}
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Hari Ini</div>
            <div class="stat-value">{signed.today}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Kemarin</div>
            <div class="stat-value">{signed.yesterday}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Minggu Ini</div>
            <div class="stat-value">{signed.thisWeek}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Bulan Ini</div>
            <div class="stat-value">{signed.thisMonth}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Tahun Ini</div>
            <div class="stat-value">{signed.thisYear}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Total</div>
            <div class="stat-value">{signed.total}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
      {/if}
    </div>
  </section>
  <section class="text-center max-w-2xl mx-auto my-10">
    <div>
      <h3 class="text-lg">Statistik Verifikasi</h3>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-6">
      {#if stats.loading}
        <div>loading</div>
      {:else if stats.current}
        {@const { signed, verified } = stats.current}
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Hari Ini</div>
            <div class="stat-value">{verified.today}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Kemarin</div>
            <div class="stat-value">{verified.yesterday}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Minggu Ini</div>
            <div class="stat-value">{verified.thisWeek}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Bulan Ini</div>
            <div class="stat-value">{verified.thisMonth}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Tahun Ini</div>
            <div class="stat-value">{verified.thisYear}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Total</div>
            <div class="stat-value">{verified.total}</div>
            <div class="stat-desc">Dokumen</div>
          </div>
        </div>
      {/if}
    </div>
  </section>
</div>
