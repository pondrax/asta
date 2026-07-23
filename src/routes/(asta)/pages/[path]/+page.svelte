<script lang="ts">
  import { page } from "$app/state";

  const path = $derived(page.params.path);

  const pages: Record<string, { title: string; content: string }> = {
    "privacy-policy": {
      title: "Kebijakan Privasi",
      content: "privacy-policy",
    },
    "terms-of-use": {
      title: "Ketentuan Penggunaan",
      content: "terms-of-use",
    },
    "about-us": {
      title: "Tentang Kami",
      content: "about-us",
    },
    contact: {
      title: "Kontak",
      content: "contact",
    },
    guide: {
      title: "Panduan Penggunaan",
      content: "guide",
    },
    helpdesk: {
      title: "Aduan",
      content: "helpdesk",
    },
    "request-user": {
      title: "Pengajuan Pengguna",
      content: "request-user",
    },
    "update-data": {
      title: "Pembaruan Data",
      content: "update-data",
    },
  };

  const currentPage = $derived(pages[path]);
</script>

<svelte:head>
  <title>{currentPage?.title ?? "Halaman"} – Tapak Astà</title>
</svelte:head>

<div class="overflow-y-auto">
  <div class="max-w-4xl mx-auto px-4 py-10 sm:py-16">
    {#if currentPage}
      {#if currentPage.content === "privacy-policy"}
        <!-- Kebijakan Privasi -->
        <div class="text-center mb-10">
          <h1 class="text-3xl sm:text-4xl font-bold text-primary mb-3">
            Kebijakan Privasi
          </h1>
          <p class="text-sm opacity-60">Terakhir diperbarui: 23 Juli 2026</p>
        </div>

        <div class="prose prose-sm sm:prose-base max-w-none space-y-8">
          <section>
            <p>
              Kebijakan Privasi ini adalah komitmen nyata dari <strong
                >Tapak Astà</strong
              > untuk menghargai dan melindungi setiap data atau informasi pribadi
              Pengguna aplikasi Tapak Astà.
            </p>
            <p>
              Kebijakan Privasi ini (beserta syarat-syarat penggunaan
              sebagaimana tercantum dalam "Syarat &amp; Ketentuan" dan informasi
              lain yang tercantum di aplikasi Tapak Astà) menetapkan dasar atas
              perolehan, pengumpulan, pengolahan, penganalisisan, penampilan,
              pembukaan, dan/atau segala bentuk pengelolaan yang terkait dengan
              data atau informasi yang Pengguna berikan kepada Tapak Astà atau
              yang Tapak Astà kumpulkan dari Pengguna, termasuk data pribadi
              Pengguna, baik pada saat Pengguna melakukan pendaftaran di
              aplikasi, mengakses aplikasi, maupun mempergunakan layanan-layanan
              pada aplikasi (selanjutnya disebut sebagai "data").
            </p>
            <p>
              Dengan mengakses dan/atau mempergunakan layanan Tapak Astà,
              Pengguna menyatakan bahwa setiap data Pengguna merupakan data yang
              benar dan sah, serta Pengguna dianggap telah membaca dan memahami
              dan memberikan persetujuan kepada Tapak Astà untuk memperoleh,
              mengumpulkan, menyimpan, mengelola, dan mempergunakan data
              tersebut sebagaimana tercantum dalam Kebijakan Privasi maupun
              Syarat &amp; Ketentuan Tapak Astà.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">
              Perolehan dan Pengumpulan Data Pengguna
            </h2>
            <p>
              Tapak Astà mengumpulkan data Pengguna dengan tujuan untuk
              mengelola dan memperlancar proses penggunaan situs, serta
              tujuan-tujuan lainnya selama diizinkan oleh peraturan
              perundang-undangan yang berlaku. Adapun data Pengguna yang
              dikumpulkan adalah sebagai berikut:
            </p>

            <div class="mt-4 space-y-4">
              <div>
                <h3 class="font-semibold text-base-content">
                  1. Data yang diserahkan secara mandiri oleh Pengguna
                </h3>
                <p class="mt-1">
                  termasuk namun tidak terbatas, pada data yang diserahkan pada
                  saat Pengguna:
                </p>
                <ul class="list-disc list-inside mt-2 space-y-1 ml-4">
                  <li>
                    Membuat atau memperbarui akun Tapak Astà, termasuk di
                    antaranya nama pengguna (username), Nomor NIK, alamat email,
                    nomor telepon, password, alamat sesuai dengan KTP, foto, dan
                    lain-lain yang diminta Tapak Astà;
                  </li>
                  <li>
                    Mengisi survei yang dikirimkan oleh Tapak Astà atau atas
                    nama Tapak Astà;
                  </li>
                  <li>
                    Melakukan interaksi dengan Pengguna lainnya melalui fitur
                    pesan, diskusi, ulasan, rating, dan sebagainya;
                  </li>
                  <li>
                    Menggunakan fitur yang membutuhkan izin akses terhadap
                    perangkat Pengguna seperti izin akses membuka kamera pada
                    saat masuk ke menu scan QR Code.
                  </li>
                </ul>
              </div>

              <div>
                <h3 class="font-semibold text-base-content">
                  2. Data yang terekam pada saat Pengguna mempergunakan aplikasi
                  Tapak Astà
                </h3>
                <p class="mt-1">termasuk namun tidak terbatas pada:</p>
                <ul class="list-disc list-inside mt-2 space-y-1 ml-4">
                  <li>
                    Data lokasi riil atau perkiraannya seperti alamat IP, lokasi
                    Wi-Fi, geolocation, dan sebagainya;
                  </li>
                  <li>
                    Data berupa waktu dari setiap aktivitas Pengguna, termasuk
                    aktivitas pendaftaran, login, dan lain sebagainya;
                  </li>
                  <li>
                    Data seluruh konten yang Pengguna buat, Pengguna bagikan,
                    atau Pengguna kirimkan dalam bentuk audio, video, teks,
                    gambar, atau jenis media atau file perangkat lunak lainnya;
                  </li>
                  <li>Data terkait topik yang dibaca dan umpan-balik;</li>
                  <li>
                    Data penggunaan atau preferensi Pengguna, di antaranya
                    interaksi Pengguna dalam menggunakan aplikasi, pilihan yang
                    disimpan, serta pengaturan yang dipilih;
                  </li>
                  <li>
                    Data perangkat, di antaranya jenis perangkat yang digunakan
                    untuk mengakses aplikasi, termasuk model perangkat keras,
                    sistem operasi dan versinya, perangkat lunak, nama file dan
                    versinya, pilihan bahasa, pengenal perangkat unik, dan/atau
                    informasi jaringan seluler;
                  </li>
                  <li>
                    Data catatan (log), di antaranya catatan pada server yang
                    menerima data seperti alamat IP perangkat, tanggal dan waktu
                    akses, fitur aplikasi atau laman yang dilihat, dan/atau
                    situs atau layanan Pihak Ketiga yang Pengguna gunakan
                    sebelum berinteraksi dengan aplikasi;
                  </li>
                  <li>
                    Data komunikasi, masukan, saran, dan ide pengguna yang
                    dikirimkan kepada kami;
                  </li>
                  <li>
                    Data yang berkaitan dengan kepentingan penggunaan layanan
                    pada Aplikasi; dan
                  </li>
                  <li>
                    Data yang Pengguna berikan saat Pengguna atau organisasi
                    Pengguna yang menghubungi atau berinteraksi dengan kami
                    untuk dukungan terkait layanan.
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">Penggunaan Data</h2>
            <p>
              Tapak Astà dapat menggunakan keseluruhan atau sebagian data yang
              diperoleh dan dikumpulkan dari Pengguna sebagaimana disebutkan
              dalam bagian sebelumnya untuk hal-hal sebagai berikut:
            </p>
            <ol class="list-decimal list-inside mt-3 space-y-2 ml-4">
              <li>
                Memproses segala bentuk permintaan maupun aktivitas yang
                dilakukan oleh Pengguna melalui aplikasi.
              </li>
              <li>
                Penyediaan fitur-fitur untuk memberikan, mewujudkan, memelihara,
                dan memperbaiki layanan kami, termasuk:
                <ul class="list-disc list-inside mt-1 ml-6 space-y-1">
                  <li>
                    Menawarkan, memperoleh, menyediakan, atau memfasilitasi
                    layanan dan/atau produk-produk lainnya baik bersumber dari
                    Tapak Astà atau Pihak Ketiga;
                  </li>
                  <li>
                    Memungkinkan fitur untuk memprivasikan akun Tapak Astà
                    Pengguna, seperti Like, Share, Bookmark; dan/atau
                  </li>
                  <li>
                    Melakukan kegiatan internal yang diperlukan untuk
                    menyediakan layanan pada situs/aplikasi Tapak Astà, seperti
                    pemecahan masalah software, bug, permasalahan operasional,
                    melakukan analisis data, pengujian dan penelitian, dan untuk
                    memantau dan menganalisis kecenderungan penggunaan dan
                    aktivitas.
                  </li>
                </ul>
              </li>
              <li>
                Menghubungi Pengguna melalui email, surat, telepon, fax, dan
                lain-lain, termasuk namun tidak terbatas, untuk membantu
                dan/atau memproses penyelesaian kendala.
              </li>
              <li>
                Menggunakan informasi yang diperoleh dari Pengguna untuk tujuan
                penelitian, analisis, pengembangan dan pengujian guna
                meningkatkan keamanan dan keamanan layanan-layanan pada
                aplikasi, serta mengembangkan fitur pada aplikasi.
              </li>
              <li>
                Menginformasikan kepada Pengguna terkait layanan, studi, survei,
                berita, perkembangan terbaru, acara dan lain-lain, baik melalui
                aplikasi maupun melalui media lainnya.
              </li>
              <li>
                Melakukan monitoring atau pun investigasi terhadap konten atau
                interaksi mencurigakan yang terindikasi mengandung unsur
                pelanggaran terhadap Syarat &amp; Ketentuan atau ketentuan hukum
                yang berlaku.
              </li>
            </ol>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">
              Pengungkapan Data Pribadi Pengguna
            </h2>
            <p>
              Tapak Astà menjamin tidak ada penjualan, pengalihan, distribusi
              atau meminjamkan data pribadi Pengguna kepada Pihak Ketiga lain,
              tanpa terdapat izin dari Pengguna, kecuali dalam hal-hal sebagai
              berikut:
            </p>
            <ol class="list-decimal list-inside mt-3 space-y-2 ml-4">
              <li>
                Dibutuhkan adanya pengungkapan data Pengguna kepada mitra atau
                Pihak Ketiga lain yang membantu Tapak Astà dalam menyajikan
                layanan pada aplikasi dan memproses segala bentuk aktivitas
                Pengguna dalam aplikasi.
              </li>
              <li>
                Tapak Astà dapat menyediakan informasi yang relevan kepada Pihak
                Ketiga sesuai dengan persetujuan Pengguna untuk menggunakan
                layanan Pihak Ketiga.
              </li>
              <li>
                Dibutuhkan adanya komunikasi antara Pihak Ketiga dengan Pengguna
                dalam hal penyelesaian kendala maupun hal-hal lainnya.
              </li>
              <li>
                Tapak Astà dapat membagikan informasi Pengguna kepada anak
                perusahaan dan afiliasinya untuk membantu memberikan layanan
                atau melakukan pengolahan data untuk dan atas nama Tapak Astà.
              </li>
              <li>
                Tapak Astà mengungkapkan data Pengguna dalam upaya mematuhi
                kewajiban hukum dan/atau adanya permintaan yang sah dari aparat
                penegak hukum.
              </li>
            </ol>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">Cookies</h2>
            <ol class="list-decimal list-inside space-y-2 ml-4">
              <li>
                Cookies adalah file kecil yang secara otomatis akan mengambil
                tempat di dalam perangkat Pengguna yang menjalankan fungsi dalam
                menyimpan preferensi maupun konfigurasi Pengguna selama
                mengunjungi suatu situs.
              </li>
              <li>
                Cookies tersebut tidak diperuntukkan untuk digunakan pada saat
                melakukan akses data lain yang Pengguna miliki di perangkat
                komputer Pengguna, selain dari yang telah Pengguna setujui untuk
                disampaikan.
              </li>
              <li>
                Walaupun secara otomatis perangkat komputer Pengguna akan
                menerima cookies, Pengguna dapat menentukan pilihan untuk
                melakukan modifikasi melalui pengaturan browser Pengguna yaitu
                dengan memilih untuk menolak cookies (pilihan ini dapat
                membatasi layanan optimal pada saat melakukan akses ke situs).
              </li>
              <li>
                Tapak Astà menggunakan fitur Google Analytics Demographics and
                Interest. Data yang kami peroleh dari fitur tersebut, seperti
                umur, jenis kelamin, minat Pengguna, dan lain-lain, akan kami
                gunakan untuk pengembangan situs dan konten Tapak Astà.
              </li>
            </ol>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">
              Pilihan Pengguna dan Transparansi
            </h2>
            <ol class="list-decimal list-inside space-y-2 ml-4">
              <li>
                Perangkat seluler pada umumnya (android dan sebagainya) memiliki
                pengaturan sehingga aplikasi Tapak Astà tidak dapat mengakses
                data tertentu tanpa persetujuan dari Pengguna.
              </li>
              <li>
                Pengguna dapat mengakses dan mengubah informasi berupa alamat
                email, nomor telepon, tanggal lahir, jenis kelamin, daftar
                alamat, melalui fitur Pengaturan pada aplikasi.
              </li>
              <li>
                Pengguna dapat menarik diri dari informasi atau notifikasi
                berupa buletin, ulasan, diskusi konten, pesan pribadi, atau
                pesan pribadi dari Admin yang dikirimkan oleh Tapak Astà melalui
                fitur Pengaturan pada aplikasi.
              </li>
              <li>
                Sejauh diizinkan oleh ketentuan yang berlaku, Pengguna dapat
                menghubungi Tapak Astà untuk melakukan penarikan persetujuan
                terhadap perolehan, pengumpulan, penyimpanan, pengelolaan, dan
                penggunaan data Pengguna.
              </li>
            </ol>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">
              Standar Keamanan Anak
            </h2>
            <p>
              Tapak Astà melarang dan menjauhi segala bentuk pelecehan seksual
              dan eksploitasi terhadap anak-anak, termasuk konten atau perilaku
              yang mengeksploitasi, melecehkan, atau membahayakan anak-anak
              secara seksual. Apabila terjadi maka postingan akan dihapuskan dan
              pengguna akan dibekukan secara permanen.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">
              Penyimpanan dan Penghapusan Data Pribadi
            </h2>
            <p>
              Tapak Astà akan menyimpan data Pengguna yang Pengguna berikan
              kepada Tapak Astà atau yang Tapak Astà kumpulkan dari Pengguna,
              termasuk data pribadi Pengguna, baik pada saat Pengguna melakukan
              pendaftaran di aplikasi, mengakses aplikasi, maupun mempergunakan
              layanan-layanan pada aplikasi di server database utama selama akun
              Pengguna aktif dan/atau selama penyimpanan yang diperlukan atau
              diperbolehkan oleh peraturan perundang-undangan yang berlaku.
            </p>
            <p class="mt-2">
              Tapak Astà akan berhenti menyimpan, menghapus dan/atau menganonim
              data Pengguna secepatnya apabila data Pengguna sudah tidak lagi
              diperlukan untuk memenuhi kebutuhan pengguna dalam menggunakan
              layanan-layanan aplikasi dan penyimpanan data tidak diperlukan
              lagi untuk kepentingan kepatuhan terhadap peraturan
              perundang-undangan yang berlaku.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">Keamanan Data</h2>
            <p>
              Tapak Astà melindungi data pribadi Pengguna dengan cara memelihara
              langkah-langkah keamanan yang wajar, termasuk enkripsi data selama
              transmisi dan penyimpanan, untuk mencegah akses yang tidak sah,
              penggunaan, atau pengungkapan data pribadi Pengguna.
            </p>
            <p class="mt-2">
              Meskipun demikian, tidak ada metode transmisi melalui internet
              atau metode penyimpanan elektronik yang sepenuhnya aman. Oleh
              karena itu, Tapak Astà tidak dapat menjamin keamanan absolut data
              Pengguna.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">Hak Pengguna</h2>
            <p>Pengguna memiliki hak untuk:</p>
            <ul class="list-disc list-inside mt-2 space-y-1 ml-4">
              <li>Mengakses data pribadi yang dimiliki oleh Tapak Astà;</li>
              <li>
                Memperbarui atau mengoreksi data pribadi yang tidak akurat;
              </li>
              <li>
                Meminta penghapusan data pribadi, tunduk pada ketentuan
                peraturan perundang-undangan yang berlaku;
              </li>
              <li>
                Menarik persetujuan yang telah diberikan terhadap pengolahan
                data pribadi;
              </li>
              <li>
                Mengajukan keluhan kepada otoritas perlindungan data yang
                berwenang apabila merasa hak-hak privasinya dilanggar.
              </li>
            </ul>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">
              Tautan ke Pihak Ketiga
            </h2>
            <p>
              Aplikasi Tapak Astà mungkin memuat tautan ke situs atau layanan
              pihak ketiga. Kebijakan Privasi ini tidak berlaku untuk situs atau
              layanan pihak ketiga tersebut. Tapak Astà menyarankan Pengguna
              untuk membaca kebijakan privasi dari setiap situs atau layanan
              pihak ketiga yang dikunjungi.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">
              Pembaruan Kebijakan Privasi
            </h2>
            <p>
              Tapak Astà dapat sewaktu-waktu melakukan perubahan atau pembaruan
              terhadap Kebijakan Privasi ini. Tapak Astà menyarankan agar
              Pengguna membaca secara seksama dan memeriksa halaman Kebijakan
              Privasi ini dari waktu ke waktu untuk mengetahui perubahan apa
              pun. Dengan tetap mengakses dan menggunakan layanan aplikasi Tapak
              Astà, maka Pengguna dianggap menyetujui perubahan-perubahan dalam
              Kebijakan Privasi.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-bold text-primary mb-4">Hubungi Kami</h2>
            <p>
              Jika Pengguna memiliki pertanyaan, keluhan, atau komentar mengenai
              Kebijakan Privasi ini, Pengguna dapat menghubungi kami melalui:
            </p>
            <div class="mt-3 p-4 bg-base-200 rounded-xl">
              <p class="font-semibold">Tapak Astà – Kota Mojokerto</p>
              <p class="text-sm opacity-70 mt-1">
                Dinas Komunikasi dan Informatika Kota Mojokerto
              </p>
              <p class="text-sm opacity-70">
                Email:
                <a
                  href="mailto:csirt@mojokertokota.go.id"
                  class="link link-primary">csirt@mojokertokota.go.id</a
                >
              </p>
            </div>
          </section>
        </div>
      {:else}
        <!-- Placeholder for other pages -->
        <div class="text-center mb-10">
          <h1 class="text-3xl sm:text-4xl font-bold text-primary mb-3">
            {currentPage.title}
          </h1>
        </div>
        <div class="text-center py-20 opacity-50">
          <iconify-icon icon="bx:construction" class="text-6xl mb-4"
          ></iconify-icon>
          <p>Halaman ini sedang dalam tahap pengembangan.</p>
        </div>
      {/if}
    {:else}
      <!-- 404 -->
      <div class="text-center py-20">
        <iconify-icon icon="bx:error" class="text-6xl text-error mb-4"
        ></iconify-icon>
        <h1 class="text-2xl font-bold mb-2">Halaman Tidak Ditemukan</h1>
        <p class="opacity-60 mb-6">
          Halaman "{path}" tidak tersedia.
        </p>
        <a href="/" class="btn btn-primary">Kembali ke Beranda</a>
      </div>
    {/if}
  </div>
</div>
