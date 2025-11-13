<script lang="ts">
  let { children } = $props();
</script>

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
      </span> adalah aplikasi berbasis digital yang berfungsi sebagai platform untuk
      pengajuan, penerbitan, dan pengelolaan sertifikat elektronik di Kota Mojokerto,
      dengan fokus pada tata pelayanan keamanan yang terpercaya dan mudah diakses
      oleh pengguna.
    </p>
    <a href="/asta/sign" class="btn btn-primary animate-bounce">
      Tanda Tangan Dokumen Sekarang!
      <iconify-icon icon="bx:pen"></iconify-icon>
    </a>
  </div>
</div>
