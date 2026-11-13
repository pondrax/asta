<script lang="ts">
  const integratedApps = [
    {
      no: 1,
      name: "E-surat",
      regNumber: "2092/BSSN/BS/KH.02.01/06/2021",
      date: "14 June 2021",
      year: "2021",
      opd: "Bagian Umum",
    },
    {
      no: 2,
      name: "Simojo",
      regNumber: "-",
      date: "-",
      year: "2020",
      opd: "DPMPTSP",
    },
    {
      no: 3,
      name: "SiraSa",
      regNumber: "5816/BSSN/BS/SE.02.01/10/2023",
      date: "10 October 2023",
      year: "2023",
      opd: "BPKPD",
    },
    {
      no: 4,
      name: "Ekinerja",
      regNumber: "5235/BSSN/BS/SE.02.01/08/2025",
      date: "19 September 2025",
      year: "2025",
      opd: "BKPSDM",
    },
    {
      no: 5,
      name: "Esign (Sicantik)",
      regNumber: "1745/BSSN/BS/SE.02.01/02/2026",
      date: "Feb 2026",
      year: "2026",
      opd: "BKPSDM",
    },
    {
      no: 6,
      name: "Tapak Asta",
      regNumber: "1794/BSSN/BS/SE.02.01/02/2026",
      date: "Feb 2026",
      year: "2026",
      opd: "Diskominfo",
    },
  ];

  const rules = [
    {
      id: "I",
      title: "Informasi Dokumen Keluaran Aplikasi",
      desc: "Mencantumkan informasi catatan kaki/footer pada dokumen keluaran aplikasi bahwa dokumen telah ditandatangani secara elektronik menggunakan Sertifikat Elektronik yang diterbitkan oleh Balai Sertifikasi Elektronik (BSrE) - BSSN.",
      icon: "solar:document-text-outline",
    },
    {
      id: "II",
      title: "Mekanisme Pendaftaran Verifikator",
      desc: "Memisahkan akun masing-masing pengguna penandatangan karena satu akun memiliki satu sertifikat, dan akun melekat langsung pada sertifikat pribadi.",
      icon: "solar:users-group-rounded-outline",
    },
    {
      id: "III",
      title: "Form Passphrase",
      desc: "Menambahkan input form khusus untuk pengisian passphrase pada saat penandatanganan dilakukan oleh pemilik sertifikat elektronik.",
      icon: "solar:lock-keyhole-outline",
    },
    {
      id: "IV",
      title: "Nonaktifkan Fitur Auto Complete",
      desc: "Menonaktifkan fitur autocomplete (autocomplete='off') pada form pengisian passphrase agar browser tidak menyimpan frasa sandi pengguna.",
      icon: "solar:shield-cross-outline",
    },
    {
      id: "V",
      title: "Tidak Mengaplikasikan Penyimpanan Passphrase",
      desc: "DILARANG KERAS menyimpan passphrase pada aplikasi, database, session, cookie, local storage, maupun log aplikasi.",
      icon: "solar:database-outline",
    },
    {
      id: "VI",
      title: "Menggunakan Secure Sockets Layer (SSL/HTTPS)",
      desc: "Memasang sertifikat SSL terpercaya pada seluruh domain & subdomain aplikasi untuk menjamin enkripsi transmisi data penandatanganan.",
      icon: "solar:shield-check-outline",
    },
    {
      id: "VII",
      title: "Notifikasi Penandatangan Berhasil",
      desc: "Menampilkan notifikasi/feedback jelas kepada pengguna jika proses tanda tangan berhasil serta menyediakan akses unduh dokumen.",
      icon: "solar:check-circle-outline",
    },
    {
      id: "VIII",
      title: "Notifikasi Penandatangan Gagal",
      desc: "Menampilkan notifikasi kegagalan secara transparan dan menyajikan pesan respon dari server BSrE agar pengguna mengetahui alasan gagal.",
      icon: "solar:danger-circle-outline",
    },
    {
      id: "IX",
      title: "Perekaman Log Gagal Tandatangan",
      desc: "Menerapkan pencatatan log audit trail untuk setiap kejadian kegagalan transaksi tanda tangan di sisi backend aplikasi.",
      icon: "solar:history-outline",
    },
    {
      id: "X",
      title: "Perubahan Status Dokumen",
      desc: "Menerapkan mekanisme perubahan status dokumen secara berjenjang sebelum dan setelah dilakukan penandatanganan.",
      icon: "solar:refresh-circle-outline",
    },
    {
      id: "XI",
      title: "Status Dokumen Keluaran Aplikasi: Valid",
      desc: "Hasil tanda tangan pada dokumen keluaran aplikasi harus valid dan dapat diverifikasi keasliannya via verifikator PDF resmi.",
      icon: "solar:verified-check-outline",
    },
  ];

  const workflowSteps = [
    {
      step: 1,
      name: "Pengajuan & Konsultasi",
      duration: "1 - 3 Hari Kerja",
      executor: "OPD Pemohon & Diskominfo",
      desc: "OPD mengajukan permohonan integrasi dan melakukan konsultasi terkait kebutuhan sistem, alur proses bisnis tanda tangan, identifikasi penandatangan, serta kesiapan integrasi.",
    },
    {
      step: 2,
      name: "Pemberian Akses Dev Client + Bimtek",
      duration: "2 - 4 Hari Kerja",
      executor: "Diskominfo",
      desc: "Diskominfo menyediakan kredensial akses ke server Esign Client Development (intranet) dan memberikan bimbingan teknis (bimtek) terkait integrasi API v2 serta standar implementasi.",
    },
    {
      step: 3,
      name: "Penerapan Modul",
      duration: "5 - 14 Hari Kerja",
      executor: "OPD",
      desc: "Tim pengembang OPD mengimplementasikan pemanggilan API v2 (Sign PDF / E-Seal / User / Verify) pada aplikasi serta menerapkan 11 Kriteria Wajib Integrasi Sistem BSrE.",
    },
    {
      step: 4,
      name: "Evaluasi Internal",
      duration: "2 - 3 Hari Kerja",
      executor: "OPD + Diskominfo",
      desc: "Uji coba dan evaluasi bersama antara OPD dan Diskominfo untuk memverifikasi kesesuaian form passphrase, keamanan sistem, penanganan error, pencatatan log, dan keabsahan dokumen keluaran.",
    },
    {
      step: 5,
      name: "Uji Modul BSrE + Penerbitan Surat",
      duration: "3 - 7 Hari Kerja",
      executor: "Diskominfo, BSrE & OPD",
      desc: "Pelaksanaan asesmen resmi Uji Penerapan Modul bersama pihak BSrE BSSN dan penerbitan surat rekomendasi/pengesahan sistem dari Diskominfo untuk OPD pemohon.",
    },
    {
      step: 6,
      name: "Pemberian Akses Prod + Go-Live",
      duration: "1 - 2 Hari Kerja",
      executor: "Diskominfo + OPD",
      desc: "Diskominfo membuka akses ke server Esign Client Production, OPD mengalihkan konfigurasi production, dan sistem resmi go-live melayani tanda tangan elektronik tersertifikasi.",
    },
  ];
</script>

<div class="max-w-6xl mx-auto px-4 py-8 space-y-10">
  <!-- Hero Section -->
  <div class="card bg-base-200 border border-base-300 shadow-sm">
    <div class="card-body gap-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="badge badge-primary gap-1 mb-2 font-mono text-xs">
            <iconify-icon icon="solar:shield-check-bold"></iconify-icon>
            BSrE - BSSN Integration Guide
          </div>
          <h1 class="text-3xl font-extrabold tracking-tight">
            Panduan & Kriteria Integrasi Sistem TTE BSrE
          </h1>
          <p class="text-base text-base-content/70 mt-1 max-w-2xl">
            Pedoman teknis, alur tahapan, dan kriteria kepatuhan integrasi Tanda Tangan Elektronik
            menggunakan Esign Client Service API v2 di lingkungan Pemerintah Kota Mojokerto.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a href="/integrasi/playground" class="btn btn-primary gap-2">
            <iconify-icon icon="solar:play-circle-bold" class="text-lg"></iconify-icon>
            API Playground v2
          </a>
          <a
            href="/data/esign-collection.json"
            download="Esign-Client-Service-v2.postman_collection.json"
            class="btn btn-outline gap-2"
          >
            <iconify-icon icon="solar:download-square-outline" class="text-lg"></iconify-icon>
            Download Postman JSON
          </a>
          <a
            href="https://bsre.bssn.go.id/doc/juknis/PEDOMAN-KRITERIA-INTEGRASI-SISTEM.pdf"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-ghost gap-2"
          >
            <iconify-icon icon="solar:file-download-outline" class="text-lg"></iconify-icon>
            Juknis PDF
          </a>
          <a
            href="https://canva.link/2zmsgo57y3xb1vy"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-ghost gap-2"
          >
            <iconify-icon icon="solar:presentation-outline" class="text-lg"></iconify-icon>
            Materi
          </a>
        </div>
      </div>
    </div>
  </div>

  <!-- Intranet Notice & Server Status -->
  <div class="alert alert-info shadow-xs border border-info/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-sm">
    <div class="flex items-start gap-3">
      <iconify-icon icon="solar:server-square-bold" class="text-2xl text-info shrink-0 mt-0.5"></iconify-icon>
      <div class="space-y-0.5">
        <div class="font-bold">Infrastruktur Server Esign Client (Diskominfo Kota Mojokerto)</div>
        <div class="text-xs text-base-content/80 leading-relaxed">
          Server <strong>Esign Client Dev</strong> dan <strong>Esign Client Prod</strong> dikelola sepenuhnya oleh Dinas Kominfo Kota Mojokerto dan telah beroperasi aktif. 
          Pengembang aplikasi OPD <strong>tidak perlu menyediakan server client fisik sendiri</strong>, namun server aplikasi pemohon wajib terhubung ke <strong>Jaringan Intranet Pemkot Mojokerto</strong> (VPN / Local Fiber FO) untuk mengakses endpoint API.
        </div>
      </div>
    </div>
    <div class="badge badge-success gap-1 font-mono text-xs whitespace-nowrap self-end md:self-auto">
      <span class="w-2 h-2 rounded-full bg-success-content animate-pulse"></span>
      Server Ready (Intranet Only)
    </div>
  </div>

  <!-- Integrated Apps Table -->
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold flex items-center gap-2">
          <iconify-icon icon="solar:check-read-outline" class="text-primary text-2xl"></iconify-icon>
          Aplikasi yang Telah Terintegrasi
        </h2>
        <p class="text-sm text-base-content/70">
          Daftar aplikasi Pemerintah Kota Mojokerto yang telah mengantongi Surat Rekomendasi/Registrasi resmi BSrE.
        </p>
      </div>
      <div class="badge badge-accent badge-outline font-semibold">
        Total {integratedApps.length} Aplikasi
      </div>
    </div>

    <div class="overflow-x-auto rounded-box border border-base-300 bg-base-100 shadow-xs">
      <table class="table table-zebra w-full text-sm">
        <thead>
          <tr class="bg-base-200 text-base-content/80">
            <th class="w-12 text-center">No</th>
            <th>Nama Aplikasi</th>
            <th>Nomor Surat Registrasi</th>
            <th>Tanggal Registrasi</th>
            <th>Tahun</th>
            <th>Organisasi Perangkat Daerah (OPD)</th>
          </tr>
        </thead>
        <tbody>
          {#each integratedApps as app}
            <tr class="hover">
              <td class="text-center font-mono font-medium">{app.no}</td>
              <td class="font-semibold text-primary">{app.name}</td>
              <td class="font-mono text-xs">
                {#if app.regNumber !== "-"}
                  <span class="badge badge-neutral badge-sm font-mono">{app.regNumber}</span>
                {:else}
                  <span class="text-base-content/40">-</span>
                {/if}
              </td>
              <td>{app.date}</td>
              <td><span class="badge badge-ghost badge-sm font-mono">{app.year}</span></td>
              <td>
                <span class="badge badge-info badge-outline badge-sm font-medium">
                  {app.opd}
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- Alur Tahapan & Estimasi Waktu -->
  <section class="space-y-4">
    <div>
      <h2 class="text-xl font-bold flex items-center gap-2">
        <iconify-icon icon="solar:route-bold" class="text-secondary text-2xl"></iconify-icon>
        Alur Tahapan Integrasi & Estimasi Waktu Pelaksanaan
      </h2>
      <p class="text-sm text-base-content/70">
        Rangkaian tahapan pelaksanaan integrasi sistem aplikasi SKPD dengan layanan Esign Client BSrE Kota Mojokerto.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {#each workflowSteps as w}
        <div class="card bg-base-100 border border-base-300 shadow-xs flex flex-col justify-between">
          <div class="card-body p-4 space-y-2">
            <div class="flex items-center justify-between">
              <span class="w-7 h-7 rounded-full bg-secondary/15 text-secondary font-bold flex items-center justify-center text-xs">
                {w.step}
              </span>
              <span class="badge badge-warning badge-xs font-semibold">{w.duration}</span>
            </div>
            <h3 class="font-bold text-sm leading-snug">{w.name}</h3>
            <p class="text-[11px] text-base-content/70 leading-relaxed">{w.desc}</p>
          </div>
          <div class="px-4 pb-3 pt-1 border-t border-base-200 text-[10px] text-base-content/50 font-medium">
            Pelaksana: {w.executor}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- 11 Kriteria Integrasi -->
  <section class="space-y-4">
    <div>
      <h2 class="text-xl font-bold flex items-center gap-2">
        <iconify-icon icon="solar:shield-warning-outline" class="text-warning text-2xl"></iconify-icon>
        11 Kriteria Wajib Integrasi Sistem (BSrE - BSSN)
      </h2>
      <p class="text-sm text-base-content/70">
        Berdasarkan Bab IV Pedoman Kriteria Integrasi Sistem BSrE, seluruh poin di bawah ini wajib dipenuhi untuk lulus asesmen Uji Penerapan Modul.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each rules as rule}
        <div class="card bg-base-100 border border-base-300 shadow-xs hover:border-primary/50 transition">
          <div class="card-body p-5 space-y-2">
            <div class="flex items-center justify-between">
              <span class="badge badge-primary badge-sm font-mono font-bold">Kriteria {rule.id}</span>
              <iconify-icon icon={rule.icon} class="text-2xl text-primary"></iconify-icon>
            </div>
            <h3 class="font-bold text-base leading-snug">{rule.title}</h3>
            <p class="text-xs text-base-content/70 leading-relaxed">{rule.desc}</p>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Quick CTA to Playground -->
  <div class="card bg-primary text-primary-content shadow-sm">
    <div class="card-body flex-col md:flex-row items-center justify-between gap-4 py-6">
      <div>
        <h3 class="text-xl font-bold">Uji Coba API v2 di Playground Interaktif</h3>
        <p class="text-sm opacity-90">
          Dilengkapi simulasi request, konversi PDF/Gambar Base64, dan generator code snippet (cURL, PHP, JS Fetch).
        </p>
      </div>
      <a href="/integrasi/playground" class="btn btn-neutral gap-2 whitespace-nowrap">
        Buka API Playground
        <iconify-icon icon="solar:arrow-right-outline" class="text-lg"></iconify-icon>
      </a>
    </div>
  </div>
</div>
