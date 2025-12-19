<script lang="ts">
  import Lottie from "$lib/components/lottie.svelte";
  import { getStats } from "$lib/remotes/stats.remote";

  let { children } = $props();
  const stats = getStats({});
  const current = $derived(stats.current);

  function formatNumber(num: number) {
    const n = num;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString();
  }
</script>

<div>
  <div class="flex justify-center items-center h-[calc(100vh-12rem)]">
    <div class="max-w-xl text-center">
      <div class="-my-10">
        <Lottie url="/asta-themed.json" loop autoplay />
      </div>

      <p class="pb-5">
        Tata Pelayanan Keamanan dan Asisten Sertifikat Elektronik Kota Mojokerto
        disingkat <span class="animate-pulse font-semibold text-primary">
          Tapak Astà
        </span> adalah aplikasi berbasis digital yang berfungsi sebagai platform
        untuk pengajuan, penerbitan, dan pengelolaan sertifikat elektronik di Kota
        Mojokerto, dengan fokus pada tata pelayanan keamanan yang terpercaya dan
        mudah diakses oleh pengguna.
      </p>
      <a href="./sign" class="btn btn-primary animate-bounce">
        <iconify-icon icon="bx:pen"></iconify-icon>
        Tanda Tangan Dokumen Sekarang!
      </a>
    </div>
  </div>
  <section class="max-w-md sm:max-w-4xl mx-auto">
    {#if current}
      <div class="stats stats-vertical lg:stats-horizontal shadow w-full">
        <div class="stat">
          <div class="stat-figure text-primary/90 text-5xl">
            <iconify-icon icon="bx:bxs-file-archive"></iconify-icon>
          </div>
          <div class="stat-title">Tanda Tangan Hari ini</div>
          <div class="stat-value">
            {formatNumber(current?.signed?.today)}
          </div>
          <div class="stat-desc">
            {current?.signed?.today - current?.signed?.yesterday > 0
              ? "+"
              : ""}{current?.signed?.today - current?.signed?.yesterday}
            Kemarin
          </div>
        </div>

        <div class="stat">
          <div class="stat-figure text-primary text-5xl">
            <iconify-icon icon="bx:bxs-file-archive"></iconify-icon>
          </div>
          <div class="stat-title">Total Tanda Tangan</div>
          <div class="stat-value">
            {formatNumber(current?.signed?.total)}
          </div>
          <div class="stat-desc">
            {current?.signed?.thisMonth > 0 ? "+" : ""}{current?.signed
              ?.thisMonth}
            Bulan Ini
          </div>
        </div>

        <div class="stat">
          <div class="stat-figure text-accent/90 text-5xl">
            <iconify-icon icon="bx:bxs-file-find"></iconify-icon>
          </div>
          <div class="stat-title">Verifikasi Hari Ini</div>
          <div class="stat-value">
            {formatNumber(current?.verified?.today)}
          </div>
          <div class="stat-desc">
            {current?.verified?.today - current?.verified?.yesterday > 0
              ? "+"
              : ""}{current?.verified?.today - current?.verified?.yesterday}
            Kemarin
          </div>
        </div>
        <div class="stat">
          <div class="stat-figure text-accent text-5xl">
            <iconify-icon icon="bx:bxs-file-find"></iconify-icon>
          </div>
          <div class="stat-title">Total Verifikasi</div>
          <div class="stat-value">
            {formatNumber(current?.verified?.total)}
          </div>
          <div class="stat-desc">
            {current?.verified?.thisMonth > 0 ? "+" : ""}{current?.verified
              ?.thisMonth}
            Bulan Ini
          </div>
        </div>
      </div>
    {:else}
      <div class="stats stats-vertical lg:stats-horizontal shadow w-full">
        {#each Array.from({ length: 4 }) as _, i}
          <div class="stat">
            <div class="stat-title skeleton w-1/2">&nbsp;</div>
            <div class="stat-value skeleton my-1">&nbsp;</div>
            <div class="stat-desc skeleton w-3/4">&nbsp;</div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<footer
  class="footer sm:footer-horizontal bg-base-200 text-base-content p-10 mt-30 shadow-[0_-2px_6px_-1px_rgba(0,0,0,0.1)] relative z-1"
>
  <aside class="">
    <div class="w-50 -mb-10 -mt-20">
      <Lottie url="/asta-themed.json" loop autoplay />
    </div>

    <!-- <img src="/logo-white.png" alt="logo" class="dark-logo h-32" />
    <img src="/logo.png" alt="logo" class="light-logo h-32" /> -->
    <p class="skeleton skeleton-text">Tanda tangan mudah dan aman</p>
    <div>
      <p class="my-2">Didukung oleh:</p>
      <div class="flex gap-5">
        <img src="/favicon.png" alt="logo bsre" class="h-10" />
        <img src="/logo-bsre.png" alt="logo bsre" class="h-10" />
      </div>
    </div>
  </aside>
  <nav>
    <h6 class="footer-title">Layanan</h6>
    <a href="/pages/request-user" class="link link-hover">Pengajuan Pengguna</a>
    <a href="/pages/update-data" class="link link-hover">Pembaruan Data</a>
    <a href="/pages/guide" class="link link-hover">Panduan Penggunaan</a>
    <a href="/pages/helpdesk" class="link link-hover">Aduan</a>
  </nav>
  <nav>
    <h6 class="footer-title">Tentang</h6>
    <a href="/pages/about-us" class="link link-hover">Tentang Kami</a>
    <a href="/pages/contact" class="link link-hover">Kontak</a>
    <!-- <a href="/pages/jobs" class="link link-hover">Jobs</a>
    <a href="/pages/press-kit" class="link link-hover">Press kit</a> -->
  </nav>
  <nav>
    <h6 class="footer-title">Legal</h6>
    <a href="/pages/terms-of-use" class="link link-hover">
      Ketentuan Penggunaan
    </a>
    <a href="/pages/privacy-policy" class="link link-hover">
      Kebijakan Privasi
    </a>
  </nav>
</footer>
