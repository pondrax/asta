# Changelog

<!--
  This file is the source of truth for the in-app "Apa yang Baru" popup.

  `bun run changelog:build` parses this file into the generated block inside
  `src/lib/app/changelog.svelte.ts`. Edit this file, never the generated block.
  The build runs that script for you.

  FORMAT
  ------
  Entries are grouped by date, newest first. A `## YYYY-MM-DD` heading covers
  every entry below it, so the date is written once per group:

    ## 2026-09-30

    ### Judul
    Halaman: /main/portal-bsre - Portal BSrE
    Audiens: Admin
    Versi: v1.4

    - **Baru** - teks perubahan
    - **Perbaikan** - teks perubahan

  plus one HTML comment holding the entry id, described below.

  ENTRY METADATA
  --------------
  id comment                       machine bookkeeping, so it stays in a
                                   comment. The id is required, must be unique
                                   across the whole file, and must end in the
                                   same `-YYYY-MM-DD` as the date heading the
                                   entry sits under; the build fails if they
                                   disagree. Write it on its own line directly
                                   under the `### Judul`:
                                   `id: x-2026-09-30` wrapped in an HTML
                                   comment. (The build skips any comment that
                                   does not start with `id:`, so this file's
                                   own documentation never reads as an entry.)

  `Halaman: /route - Label`       which page this entry belongs to. The route is
                                   matched by longest prefix, so `/me/documents`
                                   beats `/me`; `*` is the fallback for pages
                                   with no entries of their own. Write it as
                                   `\*` in markdown so it is not read as
                                   emphasis. Entries sharing a route must spell
                                   the label the same way.
  `Audiens: Admin`                 who the note is for: `Tamu` (everyone, even
                                   signed out), `Pengguna` (any signed-in
                                   account), or `Admin`. Only `Tamu` is shown
                                   to signed-out visitors.
  `Versi: v1.4`                    optional release tag.

  `Halaman` and `Audiens` are plain text so a reader of this file can see at a
  glance where a change landed and who it is for. They sit directly under the
  `### Judul` and above the first `- **...**` bullet.

  ORDERING AND GROUPING
  ---------------------
  The file is grouped by date, newest first - add a new entry under a new `##`
  heading at the top, or under the heading for a date you are back-filling.
  Grouping by page is the build's job: it buckets entries by `Halaman`, which
  is how the popup decides which notes belong to the page you are on. Pages come
  out in the order their newest entry first appears here, so the most recently
  touched page is also the first one.

  CHANGE KINDS
  ------------
  Baru        added
  Diubah      changed
  Peningkatan  improved
  Perbaikan   fixed

  AUDIENCE
  --------
  Tamu      works signed-out, shown to everyone
  Pengguna  any signed-in account (`/me*`, `/profile`)
  Admin     admin only; `hooks.server.ts` 403s every other role on `/main*`
-->

## 2026-09-30

### Reset Passphrase Massal

<!-- id: bsre-bulk-reset-2026-09-30 -->

Halaman: /main/portal-bsre - Portal BSrE
Audiens: Admin
Versi: v1.4

- **Baru** - Pilih banyak pengguna sekaligus lewat checkbox di tabel, lalu kirim reset passphrase untuk seluruh pilihan dalam satu batch.
- **Baru** - Dialog konfirmasi menampilkan progres langsung per sertifikat: menunggu, mengirim, berhasil, atau gagal, beserta pesan resmi dari portal.
- **Baru** - Tombol Coba Lagi hanya mengulang baris yang gagal, tanpa mengirim ulang tautan reset ke sertifikat yang sudah berhasil.
- **Baru** - Jeda 400 ms antarpermintaan, karena portal membatasi frekuensi dan reset massal cukup untuk memicunya di tengah proses.
- **Peningkatan** - Progres `selesai/total` dipindahkan ke toolbar dan bertahan setelah dialog ditutup, jadi operator masih bisa memantau proses yang sedang berjalan.
- **Peningkatan** - Baris tanpa sertifikat yang bisa di-reset ditampilkan nonaktif, bukan disembunyikan, sehingga jumlah di toolbar selalu sama dengan jumlah centang yang bisa diklik.

### Lencana Filter

<!-- id: toolbar-chip-truncate-2026-09-30 -->

Halaman: /main/portal-bsre - Portal BSrE
Audiens: Admin

- **Perbaikan** - Lencana filter yang panjang dipotong dengan elipsis alih-alih mendorong filter lain ke luar baris, dan nilai lengkapnya tetap tersedia lewat tooltip.
- **Baru** - Kolom Hasil Reset di tabel mencatat status tiap baris untuk run terakhir, termasuk pesan penolakan dari portal.
- **Perbaikan** - Dialog tidak lagi menutup sendiri setelah selesai, karena pesan penolakan portal sering kali satu-satunya catatan alasan sebuah sertifikat ditolak.

### Popup "Apa yang Baru"

<!-- id: global-changelog-popup-2026-09-30 -->

Halaman: \* - Tapak Astà
Audiens: Tamu
Versi: v1.4

- **Baru** - Tombol "Apa yang Baru" di navbar menampilkan ringkasan pembaruan untuk halaman yang sedang dibuka, tanpa harus pindah halaman.
- **Baru** - Setiap entri ditandai audience - Tamu, Pengguna, atau Admin - dan entri yang melampaui hak akun disembunyikan, bukan ditampilkan lalu dikunci.
- **Baru** - Tab "Halaman ini" dan "Semua" untuk melihat pembaruan seluruh halaman sekaligus.
- **Baru** - Penanda entri baru memakai status baca yang tersimpan di peramban, dengan titik notifikasi pada tombol navbar.
- **Peningkatan** - Label jenis perubahan (Baru, Diubah, Peningkatan, Perbaikan) memakai lebar seragam per daftar sekaligus mengikuti lebar isi, sehingga kolom teks selalu sejajar.

## 2026-09-29

### Kelola Sertifikat per Pengguna

<!-- id: bsre-cert-manage-2026-09-29 -->

Halaman: /main/portal-bsre - Portal BSrE
Audiens: Admin

- **Baru** - Daftar sertifikat tiap pengguna tampil di modal detail: status, produk, nomor seri, masa berlaku, dan jenis sertifikat.
- **Baru** - Tombol Reset Passphrase untuk sertifikat berstatus ISSUE, memakai nomor seri sebagai kunci permintaan.
- **Baru** - Buat Sertifikat Baru: pilih produk (Tanda Tangan Elektronik / Digital) dan jenis, dengan CN terisi otomatis dari nama pengguna.
- **Peningkatan** - Nomor seri ditampilkan penuh agar mudah dicocokkan dengan sertifikat fisik.
- **Perbaikan** - Permintaan reset dan pembuatan sertifikat memakai nomor seri, bukan ID internal - sebelumnya ditolak dengan 404.

### Edit dengan AI

<!-- id: editor-ai-2026-09-29 -->

Halaman: /editor - Editor Dokumen
Audiens: Tamu

- **Baru** - Mode Edit with AI menyusun rencana perubahan struktural - tabel, gambar, paragraf, dan format - untuk ditinjau sebelum diterapkan.
- **Peningkatan** - Rencana yang sudah ditinjau dapat diterima atau dibuang sebelum dieksekusi.
- **Perbaikan** - Menu AI tidak lagi keluar dari layar di ponsel; popup-nya diratakan ke tepi kanan tombol pemicu pada layar di bawah 640px.

## 2026-09-28

### Penyaringan Email Massal

<!-- id: bsre-bulk-email-2026-09-28 -->

Halaman: /main/portal-bsre - Portal BSrE
Audiens: Admin

- **Baru** - Filter email menerima banyak alamat sekaligus, satu email per baris, dengan lencana jumlah yang diperbarui saat mengetik.
- **Peningkatan** - Baris baru, koma, dan titik koma juga diterima sebagai pemisah, sehingga daftar yang ditempel tidak perlu dibersihkan lebih dulu.
- **Perbaikan** - Alamat duplikat diabaikan secara case-insensitive, dan input tidak di-round-trip lewat `value` sehingga tombol Enter masih bisa dipakai untuk baris berikutnya.

### Dokumen Saya

<!-- id: me-docs-bulk-2026-09-28 -->

Halaman: /me/documents - Dokumen Saya
Audiens: Pengguna

- **Baru** - Tab Dokumen Saya, Permintaan, dan Sudah Ditandatangani dengan jumlah per tab.
- **Baru** - Tandatangani banyak dokumen sekaligus, hapus banyak, dan ekspor CSV.
- **Peningkatan** - Pratinjau dokumen dalam modal tanpa meninggalkan halaman.

## 2026-09-27

### Vault Passphrase & Keamanan

<!-- id: sign-vault-2026-09-27 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Simpan passphrase sertifikat di perangkat menggunakan WebAuthn PRF, dan buka dengan passkey.
- **Peningkatan** - Deteksi berkas PDF terenkripsi dan PDF yang sudah bertanda tangan, dengan peringatan sebelum diproses.

## 2026-09-26

### Unggah DOCX

<!-- id: sign-docx-2026-09-26 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Dropper menerima berkas DOCX dan mengonversinya ke PDF sebelum diproses.
- **Perbaikan** - Konversi DOCX dibatasi pada halaman penandatanganan, jadi unggahan di halaman lain tidak ikut terkonversi.

### Bilah Kendali Mengambang

<!-- id: editor-fab-2026-09-26 -->

Halaman: /editor - Editor Dokumen
Audiens: Tamu

- **Baru** - Bilah kendali muncul saat kursor berada di area kerja pratinjau.
- **Peningkatan** - Tombol Baru dan Tandatangani dipindahkan ke posisi mengambang supaya tidak menutupi dokumen.

## 2026-09-25

### Antrean Tiket & Tindak Lanjut

<!-- id: helpdesk-admin-2026-09-25 -->

Halaman: /main/helpdesk - Tiket Helpdesk
Audiens: Admin

- **Baru** - Antrean tiket dengan penyaring tahap, status, dan jenis layanan.
- **Baru** - Balas tiket langsung dari modal detail, dengan konteks jawaban admin.
- **Baru** - Aksi penyelesaian: perbarui tahap, tandai tanda tangan selesai, dan kirim notifikasi ke akun pengguna.

## 2026-09-24

### Verifikasi Dokumen

<!-- id: verify-qr-2026-09-24 -->

Halaman: /verify - Verifikasi Dokumen
Audiens: Tamu

- **Baru** - Pindai QR tanda tangan langsung lewat kamera.
- **Baru** - Verifikasi banyak berkas sekaligus, dengan hasil terpisah untuk tiap berkas.
- **Peningkatan** - Verifikasi berdasarkan ID dokumen dan alur lanjutan langsung dari halaman penandatanganan.

## 2026-09-23

### Akses Berbasis Peran

<!-- id: users-role-id-2026-09-23 -->

Halaman: /main - Panel Manajemen
Audiens: Admin

- **Perbaikan** - Penjaga akses mencocokkan ID peran, bukan hanya nama peran, sehingga peran tambahan tetap dikenali.

### Field Identitas Terkunci

<!-- id: sign-lock-identity-2026-09-23 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Field identitas terkunci sampai akun BSrE terverifikasi, supaya data penanda tangan tidak berubah di tengah alur.

### Notifikasi WhatsApp

<!-- id: sign-wa-flag-2026-09-23 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Perbaikan** - Nomor telepon dan tombol kirim berkas hanya muncul bila notifikasi WhatsApp diaktifkan di server.

## 2026-09-22

### Manajemen Pengguna

<!-- id: users-impersonate-2026-09-22 -->

Halaman: /main/users - Kelola Pengguna
Audiens: Admin

- **Baru** - Impersonasi pengguna untuk menelusuri masalah dari sudut pandang mereka.
- **Baru** - Ubah organisasi pengguna, hapus banyak pengguna sekaligus, dan ekspor CSV.

## 2026-09-21

### Permintaan Sertifikat Massal

<!-- id: helpdesk-bulk-2026-09-21 -->

Halaman: /helpdesk - Helpdesk Layanan
Audiens: Tamu

- **Baru** - Mode permintaan banyak: periksa kelayakan seluruh pengguna sekaligus sebelum mengirim.
- **Baru** - Lacak tiket yang sudah dibuat dan lihat statusnya.
- **Baru** - Notifikasi WhatsApp saat tiket terkirim.

## 2026-09-20

### Sinkronisasi & Sesi Portal

<!-- id: bsre-sync-2026-09-20 -->

Halaman: /main/portal-bsre - Portal BSrE
Audiens: Admin

- **Baru** - Tombol Sinkron untuk mengambil data pengguna BSrE terbaru, plus Update Tanggal untuk memperbarui masa berlaku sertifikat.
- **Peningkatan** - Token sesi disimpan dan dipakai ulang, dengan percobaan ulang otomatis saat kedaluwarsa.
- **Baru** - Panel status sesi: sesi aktif, status token, dan mode browser jarak jauh.
- **Peningkatan** - Status buka/tutup panel grafik diingat antar-muat halaman, dan tidak lagi melompat kembali terbuka setiap kali profil dimuat ulang.

## 2026-09-19

### Pengisian Formulir Otomatis

<!-- id: sign-autofill-2026-09-19 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Isi otomatis field formulir PDF (AcroForm) dari metadata dokumen.
- **Baru** - Cap kaki dokumen dengan QR dan teks, opsional.
- **Peningkatan** - Unggah banyak PDF sekaligus dengan daftar tab per dokumen.

## 2026-09-18

### Jejak Audit

<!-- id: logs-2026-09-18 -->

Halaman: /main/logs - Log Aktivitas
Audiens: Admin

- **Baru** - Log aktivitas dengan pencarian, penyaringan, dan paginasi.
- **Baru** - Ekspor log ke CSV untuk keperluan audit.

## 2026-09-17

### Beranda

<!-- id: home-stats-2026-09-17 -->

Halaman: / - Beranda
Audiens: Tamu

- **Baru** - Statistik langsung: tanda tangan dan verifikasi hari ini serta total, dengan perbandingan antar hari.
- **Peningkatan** - Tampilan statistik mengikuti tema terang dan gelap.

## 2026-09-16

### Template Saya

<!-- id: me-templates-2026-09-16 -->

Halaman: /me/templates - Template Saya
Audiens: Pengguna

- **Baru** - Kelola template: nama, status, deskripsi, penerima, dan organisasi.
- **Baru** - Unggah berkas template, pratinjau, dan hapus banyak.

### Template Dokumen

<!-- id: templates-2026-09-16 -->

Halaman: /templates - Template Dokumen
Audiens: Tamu

- **Baru** - Pilih template siap pakai untuk langsung ditandatangani tanpa mengunggah berkas dari awal.

## 2026-09-15

### Analitik Survey

<!-- id: survey-admin-2026-09-15 -->

Halaman: /main/survey - Data Survey
Audiens: Admin

- **Baru** - Ringkasan jumlah responden dan rata-rata penilaian.
- **Baru** - Distribusi penilaian per bintang dan rincian per nilai.

## 2026-09-14

### Dasbor Pribadi

<!-- id: me-dashboard-2026-09-14 -->

Halaman: /me - Dasbor Saya
Audiens: Pengguna

- **Baru** - Ringkasan dokumen bertanda tangan, draf, dan gagal.
- **Baru** - Grafik dokumen harian dan distribusi status, dengan perbandingan antar minggu.

## 2026-09-13

### Pemeriksaan Kelayakan

<!-- id: register-check-2026-09-13 -->

Halaman: /services/register - Registrasi Akun BSrE
Audiens: Tamu

- **Baru** - Periksa status registrasi berdasarkan email atau NIK.
- **Baru** - Daftar syarat akun: email instansi aktif dan ASN aktif.

## 2026-09-12

### Dasbor Admin

<!-- id: admin-dashboard-2026-09-12 -->

Halaman: /main - Panel Manajemen
Audiens: Admin

- **Baru** - Statistik sistem: jumlah dokumen, pengguna, dan penanda tangan.
- **Baru** - Grafik dokumen bertanda tangan dan terverifikasi harian.
- **Baru** - Distribusi status dokumen, perbandingan mingguan, dan pemantauan pemakaian ruang penyimpanan.

## 2026-09-11

### Tabel & Tata Letak

<!-- id: editor-tables-2026-09-11 -->

Halaman: /editor - Editor Dokumen
Audiens: Tamu

- **Baru** - Sisip tabel dengan pengatur lebar kolom yang bisa diseret.
- **Baru** - Gabung dan pecah sel, perataan vertikal, serta isi sel.
- **Baru** - Penggar dengan pegangan indentasi yang bisa diseret, plus zoom otomatis dan sesuaikan lebar.

## 2026-09-08

### Mode Penandatanganan

<!-- id: sign-modes-2026-09-08 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Simpan hasil sebagai draf, jadikan template, atau kirim berkas ke WhatsApp.
- **Baru** - Pilihan tampilan tanda tangan: QR, gambar, atau teks nama.

## 2026-09-06

### Profil Pengguna

<!-- id: profile-org-2026-09-06 -->

Halaman: /profile - Profil Pengguna
Audiens: Pengguna

- **Baru** - Ubah organisasi langsung dari profil.
- **Baru** - Tautan ke perubahan kata sandi Single Sign-On.

## 2026-09-05

### Survey Kepuasan

<!-- id: survey-2026-09-05 -->

Halaman: /survey - Survey Kepuasan
Audiens: Tamu

- **Baru** - Berikan penilaian 1-5 bintang beserta masukan bebas.

## 2026-08-24

### Tindak Lanjut Tiket

<!-- id: helpdesk-followup-2026-08-24 -->

Halaman: /main/helpdesk - Tiket Helpdesk
Audiens: Admin

- **Peningkatan** - Survei tiket dan balasan admin dirapikan, dengan alur pembuatan tiket yang lebih ringkas.

## 2026-08-22

### Tiket Pertama & Balasan Admin

<!-- id: helpdesk-origin-2026-08-22 -->

Halaman: /main/helpdesk - Tiket Helpdesk
Audiens: Admin

- **Baru** - Halaman survei tiket dan antrean tiket di panel admin.
- **Baru** - Pengguna mengirim tiket, mengisi detail layanan dan lampiran.
- **Baru** - Admin membalas tiket, dan status tiket ikut berubah sesuai jawaban.

### Helpdesk Pertama

<!-- id: helpdesk-origin-page-2026-08-22 -->

Halaman: /helpdesk - Helpdesk Layanan
Audiens: Tamu

- **Baru** - Halaman utama helpdesk layanan untuk mengirim tiket baru.

## 2026-08-21

### Statistik Langsung

<!-- id: sign-stats-bump-2026-08-21 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Penandatangan dan verifikasi ikut menambah statistik, sehingga angka di beranda tidak perlu dimuat ulang.

## 2026-08-20

### Deteksi Berkas

<!-- id: sign-lazyfile-2026-08-20 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Perbaikan** - Deteksi berkas menangani proxy LazyFile, sehingga berkas besar tidak lagi terlewat.

## 2026-08-19

### Template Pertama

<!-- id: templates-origin-2026-08-19 -->

Halaman: /templates - Template Dokumen
Audiens: Tamu

- **Baru** - Halaman template dengan modal pengelolaan, termasuk unggah dan pratinjau berkas template.
- **Baru** - Penyuntingan template dan pratinjau berdasarkan organisasi.
- **Perbaikan** - Status template disederhanakan agar tidak lagi bertentangan dengan data organisasi.

### Beranda & Tata Letak

<!-- id: home-layout-2026-08-19 -->

Halaman: / - Beranda
Audiens: Tamu

- **Baru** - Latar beranda memakai titik-titik animasi yang bergerak halus.
- **Peningkatan** - Batas lebar dihapus dari beberapa komponen agar tampilan konsisten antar halaman.

## 2026-08-18

### Floating Label & Logo

<!-- id: global-floating-label-2026-08-18 -->

Halaman: \* - Tapak Astà
Audiens: Tamu

- **Perbaikan** - Label mengambang tampil pada posisi yang benar, dan logo lebih jelas di tema terang maupun gelap.

## 2026-08-11

### Sinkronisasi Harian & Login BeID

<!-- id: bsre-daily-sync-2026-08-11 -->

Halaman: /main/portal-bsre - Portal BSrE
Audiens: Admin

- **Baru** - Sinkronisasi pengguna BSrE berjalan otomatis setiap hari lewat cron, lalu mengirim notifikasi WhatsApp ke operator bila ada hasil.
- **Baru** - Login BeID memakai otomatisasi peramban, dengan implementasi TOTP sendiri di atas crypto bawaan Node.
- **Peningkatan** - Data pribadi (PII) pengguna disamarkan di antarmuka portal.
- **Baru** - Pindai QR untuk verifikasi dokumen, dengan opsional footer BSrE pada alur penandatanganan.

## 2026-07-23

### Kebijakan Privasi

<!-- id: privacy-policy-2026-07-23 -->

Halaman: \* - Tapak Astà
Audiens: Tamu

- **Baru** - Halaman kebijakan privasi, dengan sintaks halaman statis agar halaman serupa mudah ditambah.

## 2026-07-07

### Waktu Respons

<!-- id: ai-chatbot-latency-2026-07-07 -->

Halaman: \* - Tapak Astà
Audiens: Tamu

- **Baru** - Waktu respons chatbot ditampilkan.
- **Perbaikan** - Respons kosong dari penyedia tidak lagi membuat percakapan berhenti.

## 2026-07-06

### Penyimpanan Enkripsi

<!-- id: sign-encryption-2026-07-06 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Dokumen tersimpan di server dienkripsi dengan AES-256-GCM, memakai kunci yang diturunkan dari kode rahasia.
- **Perbaikan** - Data lama yang masih memakai CBC dibaca ulang lewat jalur dekripsi khusus, lalu naskah migrasi mengenkripsi ulang ke AES-GCM.
- **Perbaikan** - Unduhan berkas terenkripsi diubah kembali menjadi PDF di peramban, bukan mengunduh berkas `.enc`.

### Tanya Jawab Otomatis

<!-- id: ai-chatbot-faq-2026-07-06 -->

Halaman: \* - Tapak Astà
Audiens: Tamu

- **Baru** - Chatbot menjawab dari kumpulan tanya jawab, memakai konteks percakapan.
- **Peningkatan** - Balasan memakai rendering markdown khusus dan templat respons.

## 2026-07-03

### Dokumen Terenkripsi

<!-- id: sign-encrypted-pdf-2026-07-03 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Perbaikan** - Dokumen terenkripsi ditangani dengan benar, termasuk pada berkas yang memakai password.
- **Perbaikan** - Tombol tambah visualisasi aktif apa pun status tanda tangan.

## 2026-06-15

### Sesi Portal

<!-- id: bsre-session-2026-06-15 -->

Halaman: /main/portal-bsre - Portal BSrE
Audiens: Admin

- **Perbaikan** - Pengambilan token BSrE dirampingkan dan sesi peramban dipakai ulang, sehingga login portal lebih jarang terputus.

## 2026-06-11

### Petunjuk Unggah

<!-- id: sign-upload-hint-2026-06-11 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Perbaikan** - Petunjuk unggah menegaskan bahwa beberapa berkas boleh diunggah sekaligus.

## 2026-06-09

### Survey Pertama

<!-- id: survey-origin-2026-06-09 -->

Halaman: /survey - Survey Kepuasan
Audiens: Tamu

- **Baru** - Sistem survei kepuasan pelanggan tersimpan di basis data, dengan tampilan formulir.

### Asisten AI

<!-- id: ai-chatbot-origin-2026-06-09 -->

Halaman: \* - Tapak Astà
Audiens: Tamu

- **Baru** - Asisten AI menjawab pertanyaan tentang Tapak Astà, lewat tombol mengambang di halaman.
- **Baru** - Balasan panjang dilanjutkan otomatis dan ditampilkan dengan markdown.
- **Perbaikan** - Balasan selalu memakai bahasa Indonesia dengan jarak antarparagraf yang rapi.

## 2026-06-08

### Statistik BSrE

<!-- id: bsre-stats-dashboard-2026-06-08 -->

Halaman: /main/portal-bsre - Portal BSrE
Audiens: Admin

- **Baru** - Dasbor statistik BSrE dengan penyaringan dan visualisasi interaktif.
- **Baru** - Grafik aktivitas pengguna BSrE.
- **Peningkatan** - Agregasi statistik dihitung di server, bukan di peramban.
- **Peningkatan** - Notifikasi Toast memakai state aplikasi global, konsisten di seluruh halaman.

## 2026-06-05

### Daftar Dokumen

<!-- id: me-docs-preview-2026-06-05 -->

Halaman: /me/documents - Dokumen Saya
Audiens: Pengguna

- **Baru** - Pratinjau dokumen dalam modal, lengkap dengan konfirmasi hapus yang lebih jelas.
- **Peningkatan** - Tampilan daftar dokumen dirapikan agar mudah dipindai.

### Grafik & Metrik

<!-- id: admin-charts-2026-06-05 -->

Halaman: /main - Panel Manajemen
Audiens: Admin

- **Baru** - Komponen grafik batang dan donat untuk dasbor.
- **Baru** - Halaman analitik dan metrik pengguna.
- **Baru** - Data pengguna BSrE disimpan di basis data pada tabel tersendiri.

## 2026-06-04

### Berkas via WhatsApp

<!-- id: sign-wa-file-2026-06-04 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Pengiriman berkas ke WhatsApp bisa dimatikan, dan parameter pemilik menerima data base64.

### Tur & Footer BSrE

<!-- id: global-tour-2026-06-04 -->

Halaman: \* - Tapak Astà
Audiens: Tamu

- **Perbaikan** - Posisi kartu tur lebih tepat, dengan penyuntingan memakai topeng SVG.
- **Baru** - Footer BSrE bisa ditampilkan pada alur penandatanganan.

## 2026-04-09

### Tabel Pertama

<!-- id: editor-tables-origin-2026-04-09 -->

Halaman: /editor - Editor Dokumen
Audiens: Tamu

- **Baru** - Penyuntingan tabel langsung di dalam dokumen, dengan navigasi antar tabel lewat URL.
- **Peningkatan** - Tampilan tabel memakai header lengket dan perataan kolom yang konsisten.

## 2026-04-08

### Desainer Skema

<!-- id: collections-designer-2026-04-08 -->

Halaman: /\_/designer - Desainer Skema
Audiens: Admin

- **Baru** - Desainer skema basis data dengan visualisasi relasi dan perubahan skema saat runtime.
- **Baru** - Utilitas otorisasi admin, komponen ApexCharts, dan rute dasbor untuk pengaturan serta log.

## 2026-04-07

### Koleksi Data

<!-- id: collections-origin-2026-04-07 -->

Halaman: /\_/collections - Koleksi Data
Audiens: Admin

- **Baru** - Antarmuka pengelolaan koleksi data, dengan remote handler untuk setiap tabel.
- **Baru** - Pembaruan banyak baris dan penghapusan, dijaga oleh hak akses admin.
- **Peningkatan** - Kueri relasional Drizzle dibungkus helper sendiri dengan penghitung yang sadar skema.

## 2026-02-26

### Penyaringan Pemilik

<!-- id: verify-owner-filter-2026-02-26 -->

Halaman: /verify - Verifikasi Dokumen
Audiens: Tamu

- **Baru** - Penyaringan pemilik memakai alamat email, bukan hanya kecocokan persis.

### Identitas Penanda Tangan

<!-- id: sign-identity-nik-2026-02-26 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Field identitas memakai email atau NIK, sesuai sumber dokumen.
- **Peningkatan** - Validasi NIK menampilkan keterangan status dan tautan pendaftaran.
- **Baru** - Dokumen bertanda tangan disimpan terenkripsi di server.

## 2026-02-25

### Verifikasi tanpa Login

<!-- id: verify-public-2026-02-25 -->

Halaman: /verify - Verifikasi Dokumen
Audiens: Tamu

- **Baru** - Dokumen bisa ditandatangani tanpa login, memakai nama dan email sebagai identitas penanda tangan.
- **Peningkatan** - Field formulir terisi otomatis dari parameter pemilik di URL, supaya penerima tidak mengetik ulang datanya.
- **Peningkatan** - Penyimpanan dokumen bertanda tangan menyesuaikan: dokumen tanpa akun tersimpan sebagai catatan minimal.
- **Perbaikan** - Pencarian pemilik di halaman verifikasi memeriksa alamat email dengan rentang, bukan hanya kecocokan persis.

### Profil yang Dapat Diedit

<!-- id: profile-edit-2026-02-25 -->

Halaman: /profile - Profil Pengguna
Audiens: Pengguna

- **Baru** - Data profil dapat disunting sendiri, tidak lagi hanya-baca.
- **Perbaikan** - Logo dan label yang mengambang tampil benar pada tema terang maupun gelap.

## 2026-02-24

### Peran & Akses

<!-- id: users-roles-2026-02-24 -->

Halaman: /main/users - Kelola Pengguna
Audiens: Admin

- **Baru** - Peran pengguna melalui skema Drizzle: `admin`, `infra`, dan `member`.
- **Baru** - Dasbor admin, halaman kelola pengguna, dan halaman log di bawah struktur rute `/main/*`.
- **Baru** - Halaman pengguna menampilkan data spesifik per pengguna, termasuk peran dan login terakhir.
- **Peningkatan** - Rute `/main/*` kini 403 untuk selain admin, jadi dasbor tidak lagi terbuka untuk pengguna biasa.

### Catatan-Level Log

<!-- id: logs-level-2026-02-24 -->

Halaman: /main/logs - Log Aktivitas
Audiens: Admin

- **Baru** - Halaman log aktivitas dengan tampilan per level, pesan yang lebih mudah dibaca, dan paginasi.
- **Peningkatan** - Panel statistik dasbor admin dibangun di atas data agregat sisi server, bukan dihitung di peramban.

## 2026-02-05

### Dasbor Pertama

<!-- id: admin-dashboard-origin-2026-02-05 -->

Halaman: /main - Panel Manajemen
Audiens: Admin

- **Baru** - Tata letak aplikasi utama dan dasbor kelola pengguna.
- **Baru** - Registrasi akun BSrE pindah ke `/services/register`, menggantikan `/account/register`.
- **Baru** - Komponen `Select` dengan pencarian, pemindahan otomatis ke opsi aktif, dan dukungan tetikus.
- **Perbaikan** - Inisialisasi Turnstile dijaga agar tidak melempar galat saat skrip belum termuat.

### Registrasi Akun

<!-- id: register-origin-2026-02-05 -->

Halaman: /services/register - Registrasi Akun BSrE
Audiens: Tamu

- **Baru** - Halaman registrasi akun BSrE, dipindahkan ke `/services/register` dari `/account/register`.

## 2026-02-04

### Keandalan Penandatanganan

<!-- id: sign-retry-2026-02-04 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Perbaikan** - Kegagalan penandatanganan dicoba ulang otomatis.
- **Baru** - Daftar dokumen menampilkan keadaan memuat dan gagal, dengan pesan yang dibedakan untuk draf.
- **Perbaikan** - Dokumen yang tampil hanya milik pemilik yang sedang masuk.

## 2026-02-02

### Pintasan Papan Ketik

<!-- id: editor-shortcuts-2026-02-02 -->

Halaman: /editor - Editor Dokumen
Audiens: Tamu

- **Baru** - Pintasan papan ketik untuk navigasi tabel dan pencarian.
- **Perbaikan** - Pintasan tidak lagi bentrok saat kursor berada di kolom isian.
- **Perbaikan** - Paginasi tidak melewati jumlah catatan.

## 2026-02-01

### Penandatanganan Banyak Dokumen

<!-- id: sign-multi-server-2026-02-01 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Peningkatan** - Penandatanganan banyak dokumen menangani ID di sisi server, bukan menebak di peramban.
- **Peningkatan** - Pengambilan data remote dibuat umum agar bisa dipakai ulang oleh tabel dinamis.

## 2026-01-30

### Daftar Dokumen & Ekspor

<!-- id: me-docs-list-2026-01-30 -->

Halaman: /me/documents - Dokumen Saya
Audiens: Pengguna

- **Baru** - Halaman Dokumen Saya di `/me/documents` dengan toolbar cari dan saring.
- **Baru** - Unggah dokumen, tandatangani dari daftar, dan hapus banyak berkas.
- **Baru** - Ekspor data ke CSV, JSON, dan XLSX langsung dari toolbar.
- **Peningkatan** - Pencarian grabbing API generik, dengan paginasi yang tidak melewati total catatan.

## 2026-01-22

### Nomor Telepon & Notifikasi WhatsApp

<!-- id: sign-whatsapp-2026-01-22 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Nomor telepon bisa diisi pada dokumen yang ditandatangani, lalu penerima menerima notifikasi WhatsApp.
- **Peningkatan** - Notifikasi dirangkum menjadi satu pesan berisi seluruh dokumen, bukan satu pesan per dokumen.

## 2026-01-09

### Template Formulir Email

<!-- id: templates-form-2026-01-09 -->

Halaman: /templates - Template Dokumen
Audiens: Tamu

- **Baru** - Template formulir email, terpisah dari template dokumen biasa.
- **Perbaikan** - Pengisian field formulir PDF lebih stabil, termasuk pada dokumen dengan banyak field.

### Metadata & Tautan Sosial

<!-- id: global-seo-2026-01-09 -->

Halaman: \* - Tapak Astà
Audiens: Tamu

- **Baru** - Tag SEO dan metadata sosial di setiap halaman, supaya tautan yang dibagikan tampil benar.

## 2026-01-08

### Perhitungan Statistik

<!-- id: home-stats-count-2026-01-08 -->

Halaman: / - Beranda
Audiens: Tamu

- **Perbaikan** - Jumlah pada statistik penandatanganan dihitung ulang dengan benar setelah ada dokumen baru.

## 2026-01-07

### Statistik & Autosave

<!-- id: home-stats-schema-2026-01-07 -->

Halaman: / - Beranda
Audiens: Tamu

- **Baru** - Skema statistik penandatanganan, dengan total harian dan akumulasi.
- **Perbaikan** - Dokumen disimpan otomatis di peramban, dan email saja sudah cukup sebagai identitas penanda tangan.

### Deskripsi Template

<!-- id: templates-desc-2026-01-07 -->

Halaman: /templates - Template Dokumen
Audiens: Tamu

- **Perbaikan** - Deskripsi template ditampilkan dan dapat diisi.

## 2026-01-05

### Metadata Tanggal

<!-- id: sign-metadata-date-2026-01-05 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Peningkatan** - Metadata tanggal ditambahkan ke dokumen, dan perpindahan penanda tangan ikut diperhalus.

## 2026-01-02

### Template Pertama

<!-- id: templates-seed-2026-01-02 -->

Halaman: /templates - Template Dokumen
Audiens: Tamu

- **Baru** - Halaman template dokumen, dengan template awal yang bisa langsung dipakai.

## 2025-12-25

### Status Penandatanganan

<!-- id: sign-status-notif-2025-12-25 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Perbaikan** - Notifikasi status penandatanganan muncul tepat setelah proses selesai.

## 2025-12-19

### Animasi Halaman

<!-- id: global-animate-2025-12-19 -->

Halaman: \* - Tapak Astà
Audiens: Tamu

- **Baru** - Animasi pada logo, karakter, dan tutup halaman.

### Passphrase Bawaan

<!-- id: sign-passphrase-default-2025-12-19 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Perbaikan** - Tombol lihat/sembunyikan passphrase memakai posisi penanda yang benar.
- **Peningkatan** - Passphrase tampil sesuai bawaan yang dipilih, tanpa harus ditekan ulang tiap kali.

## 2025-12-18

### Masuk & Akun

<!-- id: global-login-sso-2025-12-18 -->

Halaman: \* - Tapak Astà
Audiens: Tamu

- **Baru** - Masuk lewat OAuth, dengan token JWT dan sesi Single Sign-On.
- **Baru** - Verifikasi Turnstile pada pendaftaran, disertai jeda timeout agar pengguna tidak terkunci.
- **Baru** - Penandatanganan di luar BSrE, memakai identitas penanda tangan sendiri.

## 2025-12-17

### Proteksi Permintaan

<!-- id: global-csrf-2025-12-17 -->

Halaman: \* - Tapak Astà
Audiens: Tamu

- **Perbaikan** - Proteksi CSRF dan daftar asal tepercaya, sehingga permintaan dari situs lain tidak lagi diterima.
- **Peningkatan** - Pembaruan otomatis ikut dijalankan setiap proses deploy.

### Tandatangani Ulang

<!-- id: sign-resign-2025-12-17 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Perbaikan** - Dokumen yang sudah ditandatangani dapat ditandatangani ulang.
- **Perbaikan** - Pratinjau tanda tangan selalu mengikuti perubahan terakhir.

### Beranda Ringkas

<!-- id: home-simplify-2025-12-17 -->

Halaman: / - Beranda
Audiens: Tamu

- **Peningkatan** - Beranda dirampingkan supaya lebih cepat dibuka.

### Panduan Penggunaan

<!-- id: user-guide-origin-2025-12-17 -->

Halaman: /user-guide - Panduan Pengguna
Audiens: Tamu

- **Baru** - Halaman panduan penggunaan, bisa dipanggil langsung dari navbar.

## 2025-12-16

### Penandatanganan Banyak Dokumen

<!-- id: sign-multi-2025-12-16 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Penandatanganan beberapa dokumen dalam satu alur.
- **Peningkatan** - Input passphrase dibatasi sesuai jumlah permintaan bersamaan yang dikonfigurasi di server.
- **Perbaikan** - Identitas penanda tangan berupa NIK maupun email sama-sama diterima.
- **Perbaikan** - Tampilan penandatanganan lebih stabil, termasuk saat berkas gagal diunggah.

### Pratinjau Verifikasi

<!-- id: verify-preview-2025-12-16 -->

Halaman: /verify - Verifikasi Dokumen
Audiens: Tamu

- **Perbaikan** - Pratinjau dokumen hasil verifikasi menampilkan isi yang benar.

## 2025-12-14

### Antrean Permintaan

<!-- id: sign-pool-2025-12-14 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Peningkatan** - Permintaan diproses lewat antrean dengan batas tertentu, sehingga halaman tidak ikut melambat.

## 2025-12-11

### Verifikasi Pertama

<!-- id: verify-origin-2025-12-11 -->

Halaman: /verify - Verifikasi Dokumen
Audiens: Tamu

- **Baru** - Halaman verifikasi dokumen, terpisah dari halaman penandatanganan.
- **Perbaikan** - Dokumen yang sudah ditandatangani dikenali lebih awal sebelum diproses.

## 2025-11-17

### Penyimpanan Dokumen

<!-- id: sign-storage-2025-11-17 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Dokumen disimpan di server, dengan skema basis data untuk data penanda tangan.
- **Perbaikan** - Unggah berkas besar tidak lagi terputus di tengah jalan.

## 2025-11-15

### Isian Formulir

<!-- id: sign-debounce-2025-11-15 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Perbaikan** - Isian formulir tidak lagi tertimpa saat pengetikan berlangsung cepat.

## 2025-11-14

### Pengisian Otomatis

<!-- id: sign-autofill-origin-2025-11-14 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Field formulir PDF terisi otomatis dari metadata dokumen.
- **Baru** - Validasi berjalan langsung di peramban, tanpa menunggu server.
- **Peningkatan** - Nama organisasi ditampilkan singkat, dan berkas PDF dapat disunting dari pustaka.
- **Perbaikan** - Kanvas tanda tangan tidak digambar ulang berulang kali saat tidak ada perubahan.

## 2025-11-13

### Tapak Astà

<!-- id: app-origin-2025-11-13 -->

Halaman: \* - Tapak Astà
Audiens: Tamu

- **Baru** - Luncuran pertama Tapak Astà: unggah dokumen, tanda tangan, lalu simpan dan unduh hasilnya.

### Penandatanganan Pertama

<!-- id: sign-origin-2025-11-13 -->

Halaman: /sign - Tanda Tangan Dokumen
Audiens: Tamu

- **Baru** - Halaman penandatanganan: unggah PDF, isi data penanda tangan, lalu proses hasilnya.
- **Perbaikan** - Daftar dokumen panjang memakai virtual scroller supaya tetap ringan.
- **Perbaikan** - Pratinjau dokumen draf menampilkan isi yang benar.
