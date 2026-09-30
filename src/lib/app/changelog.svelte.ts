/**
 * Per-page changelog data ("What's New") and the shared read/unread state.
 *
 * The *data* is generated: edit `CHANGELOG.md` and run `bun run changelog:build`
 * to regenerate the marked block below. Only the helpers after that block are
 * hand-written.
 *
 * Each entry is scoped to a route so the popup can show the notes that matter
 * for the page the user is actually on. `getChangelogFor()` resolves a pathname
 * to the *most specific* matching route, so `/me/documents` wins over `/me`.
 *
 * The navbar button shows a "new" dot for any entry the user has not dismissed
 * yet (tracked in localStorage), so a fresh id is all it takes to surface a
 * release.
 */

export type ChangeKind = "added" | "changed" | "fixed" | "improved";

/**
 * Minimum account role needed to actually use the feature in an entry.
 * - `guest`  — works signed-out (public); also shown to every signed-in role
 * - `member` — any signed-in role (`member`, `infra`, and `admin`)
 * - `admin`  — admin only (`/main/*` 403s for everyone else, see `hooks.server.ts`)
 *
 * Omit `audience` for anything public — `guest` is the default.
 */
export type ChangelogAudience = "guest" | "member" | "admin";

export interface ChangelogChange {
  kind: ChangeKind;
  text: string;
}

export interface ChangelogEntry {
  /** Stable unique id — also the localStorage key for the "seen" marker. */
  id: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  title: string;
  /** Optional short label for the release, e.g. "v1.4". */
  version?: string;
  /** Who can reach this. Defaults to `guest` (public). */
  audience?: ChangelogAudience;
  changes: ChangelogChange[];
}

export interface PageChangelog {
  /** Route this set of entries belongs to (prefix-matched). */
  route: string;
  /** Human label for the page. */
  page: string;
  entries: ChangelogEntry[];
}

/** Badge styling per change kind. */
export const CHANGE_STYLES: Record<
  ChangeKind,
  { label: string; class: string; icon: string }
> = {
  added: { label: "Baru", class: "badge-success", icon: "bx:plus-circle" },
  changed: { label: "Diubah", class: "badge-info", icon: "bx:swap" },
  improved: {
    label: "Peningkatan",
    class: "badge-secondary",
    icon: "bx:trend-up",
  },
  fixed: { label: "Perbaikan", class: "badge-warning", icon: "bx:bug" },
};

/**
 * Label + privilege rank per audience. `rank` is what lets the popup tell
 * whether the *signed-in* viewer is high enough for an entry.
 */
export const AUDIENCE_INFO: Record<
  ChangelogAudience,
  { label: string; rank: number; hint: string }
> = {
  guest: {
    label: "Tamu",
    rank: 0,
    hint: "Bisa diakses tanpa login",
  },
  member: {
    label: "Pengguna",
    rank: 1,
    hint: "Hanya untuk pengguna yang sudah login",
  },
  admin: {
    label: "Admin",
    rank: 2,
    hint: "Hanya untuk akun admin",
  },
};

/**
 * Map a signed-in account's role name to an audience tier. `infra` sits
 * alongside `member` — it is a real account role (`db/data/roles.ts`) but has
 * no extra access beyond the other signed-in roles.
 */
export function audienceForRole(
  roleName?: string | null,
): ChangelogAudience {
  if (roleName === "admin") return "admin";
  return roleName ? "member" : "guest";
}


// --- BEGIN GENERATED FROM CHANGELOG.md (bun run changelog:build) ---
/**
 * Changelog data generated from `CHANGELOG.md`.
 *
 * Do not edit below the marker by hand - run `bun run changelog:build`
 * instead. Entries are grouped by the `Halaman:` line in the markdown,
 * so adding a note there is the whole workflow.
 */
export const PAGE_CHANGELOGS: PageChangelog[] = [
  {
    route: "/main/portal-bsre",
    page: "Portal BSrE",
    entries: [
      {
        id: "bsre-bulk-reset-2026-09-30",
        date: "2026-09-30",
        title: "Reset Passphrase Massal",
        version: "v1.4",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Pilih banyak pengguna sekaligus lewat checkbox di tabel, lalu kirim reset passphrase untuk seluruh pilihan dalam satu batch.",
          },
          {
            kind: "added",
            text: "Dialog konfirmasi menampilkan progres langsung per sertifikat: menunggu, mengirim, berhasil, atau gagal, beserta pesan resmi dari portal.",
          },
          {
            kind: "added",
            text: "Tombol Coba Lagi hanya mengulang baris yang gagal, tanpa mengirim ulang tautan reset ke sertifikat yang sudah berhasil.",
          },
          {
            kind: "added",
            text: "Jeda 400 ms antarpermintaan, karena portal membatasi frekuensi dan reset massal cukup untuk memicunya di tengah proses.",
          },
          {
            kind: "improved",
            text: "Progres `selesai/total` dipindahkan ke toolbar dan bertahan setelah dialog ditutup, jadi operator masih bisa memantau proses yang sedang berjalan.",
          },
          {
            kind: "improved",
            text: "Baris tanpa sertifikat yang bisa di-reset ditampilkan nonaktif, bukan disembunyikan, sehingga jumlah di toolbar selalu sama dengan jumlah centang yang bisa diklik.",
          },
        ],
      },
      {
        id: "toolbar-chip-truncate-2026-09-30",
        date: "2026-09-30",
        title: "Lencana Filter",
        audience: "admin",
        changes: [
          {
            kind: "fixed",
            text: "Lencana filter yang panjang dipotong dengan elipsis alih-alih mendorong filter lain ke luar baris, dan nilai lengkapnya tetap tersedia lewat tooltip.",
          },
          {
            kind: "added",
            text: "Kolom Hasil Reset di tabel mencatat status tiap baris untuk run terakhir, termasuk pesan penolakan dari portal.",
          },
          {
            kind: "fixed",
            text: "Dialog tidak lagi menutup sendiri setelah selesai, karena pesan penolakan portal sering kali satu-satunya catatan alasan sebuah sertifikat ditolak.",
          },
        ],
      },
      {
        id: "bsre-cert-manage-2026-09-29",
        date: "2026-09-29",
        title: "Kelola Sertifikat per Pengguna",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Daftar sertifikat tiap pengguna tampil di modal detail: status, produk, nomor seri, masa berlaku, dan jenis sertifikat.",
          },
          {
            kind: "added",
            text: "Tombol Reset Passphrase untuk sertifikat berstatus ISSUE, memakai nomor seri sebagai kunci permintaan.",
          },
          {
            kind: "added",
            text: "Buat Sertifikat Baru: pilih produk (Tanda Tangan Elektronik / Digital) dan jenis, dengan CN terisi otomatis dari nama pengguna.",
          },
          {
            kind: "improved",
            text: "Nomor seri ditampilkan penuh agar mudah dicocokkan dengan sertifikat fisik.",
          },
          {
            kind: "fixed",
            text: "Permintaan reset dan pembuatan sertifikat memakai nomor seri, bukan ID internal - sebelumnya ditolak dengan 404.",
          },
        ],
      },
      {
        id: "bsre-bulk-email-2026-09-28",
        date: "2026-09-28",
        title: "Penyaringan Email Massal",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Filter email menerima banyak alamat sekaligus, satu email per baris, dengan lencana jumlah yang diperbarui saat mengetik.",
          },
          {
            kind: "improved",
            text: "Baris baru, koma, dan titik koma juga diterima sebagai pemisah, sehingga daftar yang ditempel tidak perlu dibersihkan lebih dulu.",
          },
          {
            kind: "fixed",
            text: "Alamat duplikat diabaikan secara case-insensitive, dan input tidak di-round-trip lewat `value` sehingga tombol Enter masih bisa dipakai untuk baris berikutnya.",
          },
        ],
      },
      {
        id: "bsre-sync-2026-09-20",
        date: "2026-09-20",
        title: "Sinkronisasi & Sesi Portal",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Tombol Sinkron untuk mengambil data pengguna BSrE terbaru, plus Update Tanggal untuk memperbarui masa berlaku sertifikat.",
          },
          {
            kind: "improved",
            text: "Token sesi disimpan dan dipakai ulang, dengan percobaan ulang otomatis saat kedaluwarsa.",
          },
          {
            kind: "added",
            text: "Panel status sesi: sesi aktif, status token, dan mode browser jarak jauh.",
          },
          {
            kind: "improved",
            text: "Status buka/tutup panel grafik diingat antar-muat halaman, dan tidak lagi melompat kembali terbuka setiap kali profil dimuat ulang.",
          },
        ],
      },
      {
        id: "bsre-daily-sync-2026-08-11",
        date: "2026-08-11",
        title: "Sinkronisasi Harian & Login BeID",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Sinkronisasi pengguna BSrE berjalan otomatis setiap hari lewat cron, lalu mengirim notifikasi WhatsApp ke operator bila ada hasil.",
          },
          {
            kind: "added",
            text: "Login BeID memakai otomatisasi peramban, dengan implementasi TOTP sendiri di atas crypto bawaan Node.",
          },
          {
            kind: "improved",
            text: "Data pribadi (PII) pengguna disamarkan di antarmuka portal.",
          },
          {
            kind: "added",
            text: "Pindai QR untuk verifikasi dokumen, dengan opsional footer BSrE pada alur penandatanganan.",
          },
        ],
      },
      {
        id: "bsre-session-2026-06-15",
        date: "2026-06-15",
        title: "Sesi Portal",
        audience: "admin",
        changes: [
          {
            kind: "fixed",
            text: "Pengambilan token BSrE dirampingkan dan sesi peramban dipakai ulang, sehingga login portal lebih jarang terputus.",
          },
        ],
      },
      {
        id: "bsre-stats-dashboard-2026-06-08",
        date: "2026-06-08",
        title: "Statistik BSrE",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Dasbor statistik BSrE dengan penyaringan dan visualisasi interaktif.",
          },
          {
            kind: "added",
            text: "Grafik aktivitas pengguna BSrE.",
          },
          {
            kind: "improved",
            text: "Agregasi statistik dihitung di server, bukan di peramban.",
          },
          {
            kind: "improved",
            text: "Notifikasi Toast memakai state aplikasi global, konsisten di seluruh halaman.",
          },
        ],
      },
    ],
  },
  {
    route: "/editor",
    page: "Editor Dokumen",
    entries: [
      {
        id: "editor-ai-2026-09-29",
        date: "2026-09-29",
        title: "Edit dengan AI",
        changes: [
          {
            kind: "added",
            text: "Mode Edit with AI menyusun rencana perubahan struktural - tabel, gambar, paragraf, dan format - untuk ditinjau sebelum diterapkan.",
          },
          {
            kind: "improved",
            text: "Rencana yang sudah ditinjau dapat diterima atau dibuang sebelum dieksekusi.",
          },
          {
            kind: "fixed",
            text: "Menu AI tidak lagi keluar dari layar di ponsel; popup-nya diratakan ke tepi kanan tombol pemicu pada layar di bawah 640px.",
          },
        ],
      },
      {
        id: "editor-fab-2026-09-26",
        date: "2026-09-26",
        title: "Bilah Kendali Mengambang",
        changes: [
          {
            kind: "added",
            text: "Bilah kendali muncul saat kursor berada di area kerja pratinjau.",
          },
          {
            kind: "improved",
            text: "Tombol Baru dan Tandatangani dipindahkan ke posisi mengambang supaya tidak menutupi dokumen.",
          },
        ],
      },
      {
        id: "editor-tables-2026-09-11",
        date: "2026-09-11",
        title: "Tabel & Tata Letak",
        changes: [
          {
            kind: "added",
            text: "Sisip tabel dengan pengatur lebar kolom yang bisa diseret.",
          },
          {
            kind: "added",
            text: "Gabung dan pecah sel, perataan vertikal, serta isi sel.",
          },
          {
            kind: "added",
            text: "Penggar dengan pegangan indentasi yang bisa diseret, plus zoom otomatis dan sesuaikan lebar.",
          },
        ],
      },
      {
        id: "editor-tables-origin-2026-04-09",
        date: "2026-04-09",
        title: "Tabel Pertama",
        changes: [
          {
            kind: "added",
            text: "Penyuntingan tabel langsung di dalam dokumen, dengan navigasi antar tabel lewat URL.",
          },
          {
            kind: "improved",
            text: "Tampilan tabel memakai header lengket dan perataan kolom yang konsisten.",
          },
        ],
      },
      {
        id: "editor-shortcuts-2026-02-02",
        date: "2026-02-02",
        title: "Pintasan Papan Ketik",
        changes: [
          {
            kind: "added",
            text: "Pintasan papan ketik untuk navigasi tabel dan pencarian.",
          },
          {
            kind: "fixed",
            text: "Pintasan tidak lagi bentrok saat kursor berada di kolom isian.",
          },
          {
            kind: "fixed",
            text: "Paginasi tidak melewati jumlah catatan.",
          },
        ],
      },
    ],
  },
  {
    route: "/me/documents",
    page: "Dokumen Saya",
    entries: [
      {
        id: "me-docs-bulk-2026-09-28",
        date: "2026-09-28",
        title: "Dokumen Saya",
        audience: "member",
        changes: [
          {
            kind: "added",
            text: "Tab Dokumen Saya, Permintaan, dan Sudah Ditandatangani dengan jumlah per tab.",
          },
          {
            kind: "added",
            text: "Tandatangani banyak dokumen sekaligus, hapus banyak, dan ekspor CSV.",
          },
          {
            kind: "improved",
            text: "Pratinjau dokumen dalam modal tanpa meninggalkan halaman.",
          },
        ],
      },
      {
        id: "me-docs-preview-2026-06-05",
        date: "2026-06-05",
        title: "Daftar Dokumen",
        audience: "member",
        changes: [
          {
            kind: "added",
            text: "Pratinjau dokumen dalam modal, lengkap dengan konfirmasi hapus yang lebih jelas.",
          },
          {
            kind: "improved",
            text: "Tampilan daftar dokumen dirapikan agar mudah dipindai.",
          },
        ],
      },
      {
        id: "me-docs-list-2026-01-30",
        date: "2026-01-30",
        title: "Daftar Dokumen & Ekspor",
        audience: "member",
        changes: [
          {
            kind: "added",
            text: "Halaman Dokumen Saya di `/me/documents` dengan toolbar cari dan saring.",
          },
          {
            kind: "added",
            text: "Unggah dokumen, tandatangani dari daftar, dan hapus banyak berkas.",
          },
          {
            kind: "added",
            text: "Ekspor data ke CSV, JSON, dan XLSX langsung dari toolbar.",
          },
          {
            kind: "improved",
            text: "Pencarian grabbing API generik, dengan paginasi yang tidak melewati total catatan.",
          },
        ],
      },
    ],
  },
  {
    route: "/sign",
    page: "Tanda Tangan Dokumen",
    entries: [
      {
        id: "sign-vault-2026-09-27",
        date: "2026-09-27",
        title: "Vault Passphrase & Keamanan",
        changes: [
          {
            kind: "added",
            text: "Simpan passphrase sertifikat di perangkat menggunakan WebAuthn PRF, dan buka dengan passkey.",
          },
          {
            kind: "improved",
            text: "Deteksi berkas PDF terenkripsi dan PDF yang sudah bertanda tangan, dengan peringatan sebelum diproses.",
          },
        ],
      },
      {
        id: "sign-docx-2026-09-26",
        date: "2026-09-26",
        title: "Unggah DOCX",
        changes: [
          {
            kind: "added",
            text: "Dropper menerima berkas DOCX dan mengonversinya ke PDF sebelum diproses.",
          },
          {
            kind: "fixed",
            text: "Konversi DOCX dibatasi pada halaman penandatanganan, jadi unggahan di halaman lain tidak ikut terkonversi.",
          },
        ],
      },
      {
        id: "sign-lock-identity-2026-09-23",
        date: "2026-09-23",
        title: "Field Identitas Terkunci",
        changes: [
          {
            kind: "added",
            text: "Field identitas terkunci sampai akun BSrE terverifikasi, supaya data penanda tangan tidak berubah di tengah alur.",
          },
        ],
      },
      {
        id: "sign-wa-flag-2026-09-23",
        date: "2026-09-23",
        title: "Notifikasi WhatsApp",
        changes: [
          {
            kind: "fixed",
            text: "Nomor telepon dan tombol kirim berkas hanya muncul bila notifikasi WhatsApp diaktifkan di server.",
          },
        ],
      },
      {
        id: "sign-autofill-2026-09-19",
        date: "2026-09-19",
        title: "Pengisian Formulir Otomatis",
        changes: [
          {
            kind: "added",
            text: "Isi otomatis field formulir PDF (AcroForm) dari metadata dokumen.",
          },
          {
            kind: "added",
            text: "Cap kaki dokumen dengan QR dan teks, opsional.",
          },
          {
            kind: "improved",
            text: "Unggah banyak PDF sekaligus dengan daftar tab per dokumen.",
          },
        ],
      },
      {
        id: "sign-modes-2026-09-08",
        date: "2026-09-08",
        title: "Mode Penandatanganan",
        changes: [
          {
            kind: "added",
            text: "Simpan hasil sebagai draf, jadikan template, atau kirim berkas ke WhatsApp.",
          },
          {
            kind: "added",
            text: "Pilihan tampilan tanda tangan: QR, gambar, atau teks nama.",
          },
        ],
      },
      {
        id: "sign-stats-bump-2026-08-21",
        date: "2026-08-21",
        title: "Statistik Langsung",
        changes: [
          {
            kind: "added",
            text: "Penandatangan dan verifikasi ikut menambah statistik, sehingga angka di beranda tidak perlu dimuat ulang.",
          },
        ],
      },
      {
        id: "sign-lazyfile-2026-08-20",
        date: "2026-08-20",
        title: "Deteksi Berkas",
        changes: [
          {
            kind: "fixed",
            text: "Deteksi berkas menangani proxy LazyFile, sehingga berkas besar tidak lagi terlewat.",
          },
        ],
      },
      {
        id: "sign-encryption-2026-07-06",
        date: "2026-07-06",
        title: "Penyimpanan Enkripsi",
        changes: [
          {
            kind: "added",
            text: "Dokumen tersimpan di server dienkripsi dengan AES-256-GCM, memakai kunci yang diturunkan dari kode rahasia.",
          },
          {
            kind: "fixed",
            text: "Data lama yang masih memakai CBC dibaca ulang lewat jalur dekripsi khusus, lalu naskah migrasi mengenkripsi ulang ke AES-GCM.",
          },
          {
            kind: "fixed",
            text: "Unduhan berkas terenkripsi diubah kembali menjadi PDF di peramban, bukan mengunduh berkas `.enc`.",
          },
        ],
      },
      {
        id: "sign-encrypted-pdf-2026-07-03",
        date: "2026-07-03",
        title: "Dokumen Terenkripsi",
        changes: [
          {
            kind: "fixed",
            text: "Dokumen terenkripsi ditangani dengan benar, termasuk pada berkas yang memakai password.",
          },
          {
            kind: "fixed",
            text: "Tombol tambah visualisasi aktif apa pun status tanda tangan.",
          },
        ],
      },
      {
        id: "sign-upload-hint-2026-06-11",
        date: "2026-06-11",
        title: "Petunjuk Unggah",
        changes: [
          {
            kind: "fixed",
            text: "Petunjuk unggah menegaskan bahwa beberapa berkas boleh diunggah sekaligus.",
          },
        ],
      },
      {
        id: "sign-wa-file-2026-06-04",
        date: "2026-06-04",
        title: "Berkas via WhatsApp",
        changes: [
          {
            kind: "added",
            text: "Pengiriman berkas ke WhatsApp bisa dimatikan, dan parameter pemilik menerima data base64.",
          },
        ],
      },
      {
        id: "sign-identity-nik-2026-02-26",
        date: "2026-02-26",
        title: "Identitas Penanda Tangan",
        changes: [
          {
            kind: "added",
            text: "Field identitas memakai email atau NIK, sesuai sumber dokumen.",
          },
          {
            kind: "improved",
            text: "Validasi NIK menampilkan keterangan status dan tautan pendaftaran.",
          },
          {
            kind: "added",
            text: "Dokumen bertanda tangan disimpan terenkripsi di server.",
          },
        ],
      },
      {
        id: "sign-retry-2026-02-04",
        date: "2026-02-04",
        title: "Keandalan Penandatanganan",
        changes: [
          {
            kind: "fixed",
            text: "Kegagalan penandatanganan dicoba ulang otomatis.",
          },
          {
            kind: "added",
            text: "Daftar dokumen menampilkan keadaan memuat dan gagal, dengan pesan yang dibedakan untuk draf.",
          },
          {
            kind: "fixed",
            text: "Dokumen yang tampil hanya milik pemilik yang sedang masuk.",
          },
        ],
      },
      {
        id: "sign-multi-server-2026-02-01",
        date: "2026-02-01",
        title: "Penandatanganan Banyak Dokumen",
        changes: [
          {
            kind: "improved",
            text: "Penandatanganan banyak dokumen menangani ID di sisi server, bukan menebak di peramban.",
          },
          {
            kind: "improved",
            text: "Pengambilan data remote dibuat umum agar bisa dipakai ulang oleh tabel dinamis.",
          },
        ],
      },
      {
        id: "sign-whatsapp-2026-01-22",
        date: "2026-01-22",
        title: "Nomor Telepon & Notifikasi WhatsApp",
        changes: [
          {
            kind: "added",
            text: "Nomor telepon bisa diisi pada dokumen yang ditandatangani, lalu penerima menerima notifikasi WhatsApp.",
          },
          {
            kind: "improved",
            text: "Notifikasi dirangkum menjadi satu pesan berisi seluruh dokumen, bukan satu pesan per dokumen.",
          },
        ],
      },
      {
        id: "sign-metadata-date-2026-01-05",
        date: "2026-01-05",
        title: "Metadata Tanggal",
        changes: [
          {
            kind: "improved",
            text: "Metadata tanggal ditambahkan ke dokumen, dan perpindahan penanda tangan ikut diperhalus.",
          },
        ],
      },
      {
        id: "sign-status-notif-2025-12-25",
        date: "2025-12-25",
        title: "Status Penandatanganan",
        changes: [
          {
            kind: "fixed",
            text: "Notifikasi status penandatanganan muncul tepat setelah proses selesai.",
          },
        ],
      },
      {
        id: "sign-passphrase-default-2025-12-19",
        date: "2025-12-19",
        title: "Passphrase Bawaan",
        changes: [
          {
            kind: "fixed",
            text: "Tombol lihat/sembunyikan passphrase memakai posisi penanda yang benar.",
          },
          {
            kind: "improved",
            text: "Passphrase tampil sesuai bawaan yang dipilih, tanpa harus ditekan ulang tiap kali.",
          },
        ],
      },
      {
        id: "sign-resign-2025-12-17",
        date: "2025-12-17",
        title: "Tandatangani Ulang",
        changes: [
          {
            kind: "fixed",
            text: "Dokumen yang sudah ditandatangani dapat ditandatangani ulang.",
          },
          {
            kind: "fixed",
            text: "Pratinjau tanda tangan selalu mengikuti perubahan terakhir.",
          },
        ],
      },
      {
        id: "sign-multi-2025-12-16",
        date: "2025-12-16",
        title: "Penandatanganan Banyak Dokumen",
        changes: [
          {
            kind: "added",
            text: "Penandatanganan beberapa dokumen dalam satu alur.",
          },
          {
            kind: "improved",
            text: "Input passphrase dibatasi sesuai jumlah permintaan bersamaan yang dikonfigurasi di server.",
          },
          {
            kind: "fixed",
            text: "Identitas penanda tangan berupa NIK maupun email sama-sama diterima.",
          },
          {
            kind: "fixed",
            text: "Tampilan penandatanganan lebih stabil, termasuk saat berkas gagal diunggah.",
          },
        ],
      },
      {
        id: "sign-pool-2025-12-14",
        date: "2025-12-14",
        title: "Antrean Permintaan",
        changes: [
          {
            kind: "improved",
            text: "Permintaan diproses lewat antrean dengan batas tertentu, sehingga halaman tidak ikut melambat.",
          },
        ],
      },
      {
        id: "sign-storage-2025-11-17",
        date: "2025-11-17",
        title: "Penyimpanan Dokumen",
        changes: [
          {
            kind: "added",
            text: "Dokumen disimpan di server, dengan skema basis data untuk data penanda tangan.",
          },
          {
            kind: "fixed",
            text: "Unggah berkas besar tidak lagi terputus di tengah jalan.",
          },
        ],
      },
      {
        id: "sign-debounce-2025-11-15",
        date: "2025-11-15",
        title: "Isian Formulir",
        changes: [
          {
            kind: "fixed",
            text: "Isian formulir tidak lagi tertimpa saat pengetikan berlangsung cepat.",
          },
        ],
      },
      {
        id: "sign-autofill-origin-2025-11-14",
        date: "2025-11-14",
        title: "Pengisian Otomatis",
        changes: [
          {
            kind: "added",
            text: "Field formulir PDF terisi otomatis dari metadata dokumen.",
          },
          {
            kind: "added",
            text: "Validasi berjalan langsung di peramban, tanpa menunggu server.",
          },
          {
            kind: "improved",
            text: "Nama organisasi ditampilkan singkat, dan berkas PDF dapat disunting dari pustaka.",
          },
          {
            kind: "fixed",
            text: "Kanvas tanda tangan tidak digambar ulang berulang kali saat tidak ada perubahan.",
          },
        ],
      },
      {
        id: "sign-origin-2025-11-13",
        date: "2025-11-13",
        title: "Penandatanganan Pertama",
        changes: [
          {
            kind: "added",
            text: "Halaman penandatanganan: unggah PDF, isi data penanda tangan, lalu proses hasilnya.",
          },
          {
            kind: "fixed",
            text: "Daftar dokumen panjang memakai virtual scroller supaya tetap ringan.",
          },
          {
            kind: "fixed",
            text: "Pratinjau dokumen draf menampilkan isi yang benar.",
          },
        ],
      },
    ],
  },
  {
    route: "/main/helpdesk",
    page: "Tiket Helpdesk",
    entries: [
      {
        id: "helpdesk-admin-2026-09-25",
        date: "2026-09-25",
        title: "Antrean Tiket & Tindak Lanjut",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Antrean tiket dengan penyaring tahap, status, dan jenis layanan.",
          },
          {
            kind: "added",
            text: "Balas tiket langsung dari modal detail, dengan konteks jawaban admin.",
          },
          {
            kind: "added",
            text: "Aksi penyelesaian: perbarui tahap, tandai tanda tangan selesai, dan kirim notifikasi ke akun pengguna.",
          },
        ],
      },
      {
        id: "helpdesk-followup-2026-08-24",
        date: "2026-08-24",
        title: "Tindak Lanjut Tiket",
        audience: "admin",
        changes: [
          {
            kind: "improved",
            text: "Survei tiket dan balasan admin dirapikan, dengan alur pembuatan tiket yang lebih ringkas.",
          },
        ],
      },
      {
        id: "helpdesk-origin-2026-08-22",
        date: "2026-08-22",
        title: "Tiket Pertama & Balasan Admin",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Halaman survei tiket dan antrean tiket di panel admin.",
          },
          {
            kind: "added",
            text: "Pengguna mengirim tiket, mengisi detail layanan dan lampiran.",
          },
          {
            kind: "added",
            text: "Admin membalas tiket, dan status tiket ikut berubah sesuai jawaban.",
          },
        ],
      },
    ],
  },
  {
    route: "/verify",
    page: "Verifikasi Dokumen",
    entries: [
      {
        id: "verify-qr-2026-09-24",
        date: "2026-09-24",
        title: "Verifikasi Dokumen",
        changes: [
          {
            kind: "added",
            text: "Pindai QR tanda tangan langsung lewat kamera.",
          },
          {
            kind: "added",
            text: "Verifikasi banyak berkas sekaligus, dengan hasil terpisah untuk tiap berkas.",
          },
          {
            kind: "improved",
            text: "Verifikasi berdasarkan ID dokumen dan alur lanjutan langsung dari halaman penandatanganan.",
          },
        ],
      },
      {
        id: "verify-owner-filter-2026-02-26",
        date: "2026-02-26",
        title: "Penyaringan Pemilik",
        changes: [
          {
            kind: "added",
            text: "Penyaringan pemilik memakai alamat email, bukan hanya kecocokan persis.",
          },
        ],
      },
      {
        id: "verify-public-2026-02-25",
        date: "2026-02-25",
        title: "Verifikasi tanpa Login",
        changes: [
          {
            kind: "added",
            text: "Dokumen bisa ditandatangani tanpa login, memakai nama dan email sebagai identitas penanda tangan.",
          },
          {
            kind: "improved",
            text: "Field formulir terisi otomatis dari parameter pemilik di URL, supaya penerima tidak mengetik ulang datanya.",
          },
          {
            kind: "improved",
            text: "Penyimpanan dokumen bertanda tangan menyesuaikan: dokumen tanpa akun tersimpan sebagai catatan minimal.",
          },
          {
            kind: "fixed",
            text: "Pencarian pemilik di halaman verifikasi memeriksa alamat email dengan rentang, bukan hanya kecocokan persis.",
          },
        ],
      },
      {
        id: "verify-preview-2025-12-16",
        date: "2025-12-16",
        title: "Pratinjau Verifikasi",
        changes: [
          {
            kind: "fixed",
            text: "Pratinjau dokumen hasil verifikasi menampilkan isi yang benar.",
          },
        ],
      },
      {
        id: "verify-origin-2025-12-11",
        date: "2025-12-11",
        title: "Verifikasi Pertama",
        changes: [
          {
            kind: "added",
            text: "Halaman verifikasi dokumen, terpisah dari halaman penandatanganan.",
          },
          {
            kind: "fixed",
            text: "Dokumen yang sudah ditandatangani dikenali lebih awal sebelum diproses.",
          },
        ],
      },
    ],
  },
  {
    route: "/main",
    page: "Panel Manajemen",
    entries: [
      {
        id: "users-role-id-2026-09-23",
        date: "2026-09-23",
        title: "Akses Berbasis Peran",
        audience: "admin",
        changes: [
          {
            kind: "fixed",
            text: "Penjaga akses mencocokkan ID peran, bukan hanya nama peran, sehingga peran tambahan tetap dikenali.",
          },
        ],
      },
      {
        id: "admin-dashboard-2026-09-12",
        date: "2026-09-12",
        title: "Dasbor Admin",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Statistik sistem: jumlah dokumen, pengguna, dan penanda tangan.",
          },
          {
            kind: "added",
            text: "Grafik dokumen bertanda tangan dan terverifikasi harian.",
          },
          {
            kind: "added",
            text: "Distribusi status dokumen, perbandingan mingguan, dan pemantauan pemakaian ruang penyimpanan.",
          },
        ],
      },
      {
        id: "admin-charts-2026-06-05",
        date: "2026-06-05",
        title: "Grafik & Metrik",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Komponen grafik batang dan donat untuk dasbor.",
          },
          {
            kind: "added",
            text: "Halaman analitik dan metrik pengguna.",
          },
          {
            kind: "added",
            text: "Data pengguna BSrE disimpan di basis data pada tabel tersendiri.",
          },
        ],
      },
      {
        id: "admin-dashboard-origin-2026-02-05",
        date: "2026-02-05",
        title: "Dasbor Pertama",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Tata letak aplikasi utama dan dasbor kelola pengguna.",
          },
          {
            kind: "added",
            text: "Registrasi akun BSrE pindah ke `/services/register`, menggantikan `/account/register`.",
          },
          {
            kind: "added",
            text: "Komponen `Select` dengan pencarian, pemindahan otomatis ke opsi aktif, dan dukungan tetikus.",
          },
          {
            kind: "fixed",
            text: "Inisialisasi Turnstile dijaga agar tidak melempar galat saat skrip belum termuat.",
          },
        ],
      },
    ],
  },
  {
    route: "/main/users",
    page: "Kelola Pengguna",
    entries: [
      {
        id: "users-impersonate-2026-09-22",
        date: "2026-09-22",
        title: "Manajemen Pengguna",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Impersonasi pengguna untuk menelusuri masalah dari sudut pandang mereka.",
          },
          {
            kind: "added",
            text: "Ubah organisasi pengguna, hapus banyak pengguna sekaligus, dan ekspor CSV.",
          },
        ],
      },
      {
        id: "users-roles-2026-02-24",
        date: "2026-02-24",
        title: "Peran & Akses",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Peran pengguna melalui skema Drizzle: `admin`, `infra`, dan `member`.",
          },
          {
            kind: "added",
            text: "Dasbor admin, halaman kelola pengguna, dan halaman log di bawah struktur rute `/main/*`.",
          },
          {
            kind: "added",
            text: "Halaman pengguna menampilkan data spesifik per pengguna, termasuk peran dan login terakhir.",
          },
          {
            kind: "improved",
            text: "Rute `/main/*` kini 403 untuk selain admin, jadi dasbor tidak lagi terbuka untuk pengguna biasa.",
          },
        ],
      },
    ],
  },
  {
    route: "/helpdesk",
    page: "Helpdesk Layanan",
    entries: [
      {
        id: "helpdesk-bulk-2026-09-21",
        date: "2026-09-21",
        title: "Permintaan Sertifikat Massal",
        changes: [
          {
            kind: "added",
            text: "Mode permintaan banyak: periksa kelayakan seluruh pengguna sekaligus sebelum mengirim.",
          },
          {
            kind: "added",
            text: "Lacak tiket yang sudah dibuat dan lihat statusnya.",
          },
          {
            kind: "added",
            text: "Notifikasi WhatsApp saat tiket terkirim.",
          },
        ],
      },
      {
        id: "helpdesk-origin-page-2026-08-22",
        date: "2026-08-22",
        title: "Helpdesk Pertama",
        changes: [
          {
            kind: "added",
            text: "Halaman utama helpdesk layanan untuk mengirim tiket baru.",
          },
        ],
      },
    ],
  },
  {
    route: "/main/logs",
    page: "Log Aktivitas",
    entries: [
      {
        id: "logs-2026-09-18",
        date: "2026-09-18",
        title: "Jejak Audit",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Log aktivitas dengan pencarian, penyaringan, dan paginasi.",
          },
          {
            kind: "added",
            text: "Ekspor log ke CSV untuk keperluan audit.",
          },
        ],
      },
      {
        id: "logs-level-2026-02-24",
        date: "2026-02-24",
        title: "Catatan-Level Log",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Halaman log aktivitas dengan tampilan per level, pesan yang lebih mudah dibaca, dan paginasi.",
          },
          {
            kind: "improved",
            text: "Panel statistik dasbor admin dibangun di atas data agregat sisi server, bukan dihitung di peramban.",
          },
        ],
      },
    ],
  },
  {
    route: "/",
    page: "Beranda",
    entries: [
      {
        id: "home-stats-2026-09-17",
        date: "2026-09-17",
        title: "Beranda",
        changes: [
          {
            kind: "added",
            text: "Statistik langsung: tanda tangan dan verifikasi hari ini serta total, dengan perbandingan antar hari.",
          },
          {
            kind: "improved",
            text: "Tampilan statistik mengikuti tema terang dan gelap.",
          },
        ],
      },
      {
        id: "home-layout-2026-08-19",
        date: "2026-08-19",
        title: "Beranda & Tata Letak",
        changes: [
          {
            kind: "added",
            text: "Latar beranda memakai titik-titik animasi yang bergerak halus.",
          },
          {
            kind: "improved",
            text: "Batas lebar dihapus dari beberapa komponen agar tampilan konsisten antar halaman.",
          },
        ],
      },
      {
        id: "home-stats-count-2026-01-08",
        date: "2026-01-08",
        title: "Perhitungan Statistik",
        changes: [
          {
            kind: "fixed",
            text: "Jumlah pada statistik penandatanganan dihitung ulang dengan benar setelah ada dokumen baru.",
          },
        ],
      },
      {
        id: "home-stats-schema-2026-01-07",
        date: "2026-01-07",
        title: "Statistik & Autosave",
        changes: [
          {
            kind: "added",
            text: "Skema statistik penandatanganan, dengan total harian dan akumulasi.",
          },
          {
            kind: "fixed",
            text: "Dokumen disimpan otomatis di peramban, dan email saja sudah cukup sebagai identitas penanda tangan.",
          },
        ],
      },
      {
        id: "home-simplify-2025-12-17",
        date: "2025-12-17",
        title: "Beranda Ringkas",
        changes: [
          {
            kind: "improved",
            text: "Beranda dirampingkan supaya lebih cepat dibuka.",
          },
        ],
      },
    ],
  },
  {
    route: "/me/templates",
    page: "Template Saya",
    entries: [
      {
        id: "me-templates-2026-09-16",
        date: "2026-09-16",
        title: "Template Saya",
        audience: "member",
        changes: [
          {
            kind: "added",
            text: "Kelola template: nama, status, deskripsi, penerima, dan organisasi.",
          },
          {
            kind: "added",
            text: "Unggah berkas template, pratinjau, dan hapus banyak.",
          },
        ],
      },
    ],
  },
  {
    route: "/templates",
    page: "Template Dokumen",
    entries: [
      {
        id: "templates-2026-09-16",
        date: "2026-09-16",
        title: "Template Dokumen",
        changes: [
          {
            kind: "added",
            text: "Pilih template siap pakai untuk langsung ditandatangani tanpa mengunggah berkas dari awal.",
          },
        ],
      },
      {
        id: "templates-origin-2026-08-19",
        date: "2026-08-19",
        title: "Template Pertama",
        changes: [
          {
            kind: "added",
            text: "Halaman template dengan modal pengelolaan, termasuk unggah dan pratinjau berkas template.",
          },
          {
            kind: "added",
            text: "Penyuntingan template dan pratinjau berdasarkan organisasi.",
          },
          {
            kind: "fixed",
            text: "Status template disederhanakan agar tidak lagi bertentangan dengan data organisasi.",
          },
        ],
      },
      {
        id: "templates-form-2026-01-09",
        date: "2026-01-09",
        title: "Template Formulir Email",
        changes: [
          {
            kind: "added",
            text: "Template formulir email, terpisah dari template dokumen biasa.",
          },
          {
            kind: "fixed",
            text: "Pengisian field formulir PDF lebih stabil, termasuk pada dokumen dengan banyak field.",
          },
        ],
      },
      {
        id: "templates-desc-2026-01-07",
        date: "2026-01-07",
        title: "Deskripsi Template",
        changes: [
          {
            kind: "fixed",
            text: "Deskripsi template ditampilkan dan dapat diisi.",
          },
        ],
      },
      {
        id: "templates-seed-2026-01-02",
        date: "2026-01-02",
        title: "Template Pertama",
        changes: [
          {
            kind: "added",
            text: "Halaman template dokumen, dengan template awal yang bisa langsung dipakai.",
          },
        ],
      },
    ],
  },
  {
    route: "/main/survey",
    page: "Data Survey",
    entries: [
      {
        id: "survey-admin-2026-09-15",
        date: "2026-09-15",
        title: "Analitik Survey",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Ringkasan jumlah responden dan rata-rata penilaian.",
          },
          {
            kind: "added",
            text: "Distribusi penilaian per bintang dan rincian per nilai.",
          },
        ],
      },
    ],
  },
  {
    route: "/me",
    page: "Dasbor Saya",
    entries: [
      {
        id: "me-dashboard-2026-09-14",
        date: "2026-09-14",
        title: "Dasbor Pribadi",
        audience: "member",
        changes: [
          {
            kind: "added",
            text: "Ringkasan dokumen bertanda tangan, draf, dan gagal.",
          },
          {
            kind: "added",
            text: "Grafik dokumen harian dan distribusi status, dengan perbandingan antar minggu.",
          },
        ],
      },
    ],
  },
  {
    route: "/services/register",
    page: "Registrasi Akun BSrE",
    entries: [
      {
        id: "register-check-2026-09-13",
        date: "2026-09-13",
        title: "Pemeriksaan Kelayakan",
        changes: [
          {
            kind: "added",
            text: "Periksa status registrasi berdasarkan email atau NIK.",
          },
          {
            kind: "added",
            text: "Daftar syarat akun: email instansi aktif dan ASN aktif.",
          },
        ],
      },
      {
        id: "register-origin-2026-02-05",
        date: "2026-02-05",
        title: "Registrasi Akun",
        changes: [
          {
            kind: "added",
            text: "Halaman registrasi akun BSrE, dipindahkan ke `/services/register` dari `/account/register`.",
          },
        ],
      },
    ],
  },
  {
    route: "/profile",
    page: "Profil Pengguna",
    entries: [
      {
        id: "profile-org-2026-09-06",
        date: "2026-09-06",
        title: "Profil Pengguna",
        audience: "member",
        changes: [
          {
            kind: "added",
            text: "Ubah organisasi langsung dari profil.",
          },
          {
            kind: "added",
            text: "Tautan ke perubahan kata sandi Single Sign-On.",
          },
        ],
      },
      {
        id: "profile-edit-2026-02-25",
        date: "2026-02-25",
        title: "Profil yang Dapat Diedit",
        audience: "member",
        changes: [
          {
            kind: "added",
            text: "Data profil dapat disunting sendiri, tidak lagi hanya-baca.",
          },
          {
            kind: "fixed",
            text: "Logo dan label yang mengambang tampil benar pada tema terang maupun gelap.",
          },
        ],
      },
    ],
  },
  {
    route: "/survey",
    page: "Survey Kepuasan",
    entries: [
      {
        id: "survey-2026-09-05",
        date: "2026-09-05",
        title: "Survey Kepuasan",
        changes: [
          {
            kind: "added",
            text: "Berikan penilaian 1-5 bintang beserta masukan bebas.",
          },
        ],
      },
      {
        id: "survey-origin-2026-06-09",
        date: "2026-06-09",
        title: "Survey Pertama",
        changes: [
          {
            kind: "added",
            text: "Sistem survei kepuasan pelanggan tersimpan di basis data, dengan tampilan formulir.",
          },
        ],
      },
    ],
  },
  {
    route: "/_/designer",
    page: "Desainer Skema",
    entries: [
      {
        id: "collections-designer-2026-04-08",
        date: "2026-04-08",
        title: "Desainer Skema",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Desainer skema basis data dengan visualisasi relasi dan perubahan skema saat runtime.",
          },
          {
            kind: "added",
            text: "Utilitas otorisasi admin, komponen ApexCharts, dan rute dasbor untuk pengaturan serta log.",
          },
        ],
      },
    ],
  },
  {
    route: "/_/collections",
    page: "Koleksi Data",
    entries: [
      {
        id: "collections-origin-2026-04-07",
        date: "2026-04-07",
        title: "Koleksi Data",
        audience: "admin",
        changes: [
          {
            kind: "added",
            text: "Antarmuka pengelolaan koleksi data, dengan remote handler untuk setiap tabel.",
          },
          {
            kind: "added",
            text: "Pembaruan banyak baris dan penghapusan, dijaga oleh hak akses admin.",
          },
          {
            kind: "improved",
            text: "Kueri relasional Drizzle dibungkus helper sendiri dengan penghitung yang sadar skema.",
          },
        ],
      },
    ],
  },
  {
    route: "/user-guide",
    page: "Panduan Pengguna",
    entries: [
      {
        id: "user-guide-origin-2025-12-17",
        date: "2025-12-17",
        title: "Panduan Penggunaan",
        changes: [
          {
            kind: "added",
            text: "Halaman panduan penggunaan, bisa dipanggil langsung dari navbar.",
          },
        ],
      },
    ],
  },
];

/** Shown on pages with no page-specific set of their own. */
export const GLOBAL_CHANGELOG: PageChangelog =
  {
    route: "*",
    page: "Tapak Astà",
    entries: [
      {
        id: "global-changelog-popup-2026-09-30",
        date: "2026-09-30",
        title: "Popup \"Apa yang Baru\"",
        version: "v1.4",
        changes: [
          {
            kind: "added",
            text: "Tombol \"Apa yang Baru\" di navbar menampilkan ringkasan pembaruan untuk halaman yang sedang dibuka, tanpa harus pindah halaman.",
          },
          {
            kind: "added",
            text: "Setiap entri ditandai audience - Tamu, Pengguna, atau Admin - dan entri yang melampaui hak akun disembunyikan, bukan ditampilkan lalu dikunci.",
          },
          {
            kind: "added",
            text: "Tab \"Halaman ini\" dan \"Semua\" untuk melihat pembaruan seluruh halaman sekaligus.",
          },
          {
            kind: "added",
            text: "Penanda entri baru memakai status baca yang tersimpan di peramban, dengan titik notifikasi pada tombol navbar.",
          },
          {
            kind: "improved",
            text: "Label jenis perubahan (Baru, Diubah, Peningkatan, Perbaikan) memakai lebar seragam per daftar sekaligus mengikuti lebar isi, sehingga kolom teks selalu sejajar.",
          },
        ],
      },
      {
        id: "global-floating-label-2026-08-18",
        date: "2026-08-18",
        title: "Floating Label & Logo",
        changes: [
          {
            kind: "fixed",
            text: "Label mengambang tampil pada posisi yang benar, dan logo lebih jelas di tema terang maupun gelap.",
          },
        ],
      },
      {
        id: "privacy-policy-2026-07-23",
        date: "2026-07-23",
        title: "Kebijakan Privasi",
        changes: [
          {
            kind: "added",
            text: "Halaman kebijakan privasi, dengan sintaks halaman statis agar halaman serupa mudah ditambah.",
          },
        ],
      },
      {
        id: "ai-chatbot-latency-2026-07-07",
        date: "2026-07-07",
        title: "Waktu Respons",
        changes: [
          {
            kind: "added",
            text: "Waktu respons chatbot ditampilkan.",
          },
          {
            kind: "fixed",
            text: "Respons kosong dari penyedia tidak lagi membuat percakapan berhenti.",
          },
        ],
      },
      {
        id: "ai-chatbot-faq-2026-07-06",
        date: "2026-07-06",
        title: "Tanya Jawab Otomatis",
        changes: [
          {
            kind: "added",
            text: "Chatbot menjawab dari kumpulan tanya jawab, memakai konteks percakapan.",
          },
          {
            kind: "improved",
            text: "Balasan memakai rendering markdown khusus dan templat respons.",
          },
        ],
      },
      {
        id: "ai-chatbot-origin-2026-06-09",
        date: "2026-06-09",
        title: "Asisten AI",
        changes: [
          {
            kind: "added",
            text: "Asisten AI menjawab pertanyaan tentang Tapak Astà, lewat tombol mengambang di halaman.",
          },
          {
            kind: "added",
            text: "Balasan panjang dilanjutkan otomatis dan ditampilkan dengan markdown.",
          },
          {
            kind: "fixed",
            text: "Balasan selalu memakai bahasa Indonesia dengan jarak antarparagraf yang rapi.",
          },
        ],
      },
      {
        id: "global-tour-2026-06-04",
        date: "2026-06-04",
        title: "Tur & Footer BSrE",
        changes: [
          {
            kind: "fixed",
            text: "Posisi kartu tur lebih tepat, dengan penyuntingan memakai topeng SVG.",
          },
          {
            kind: "added",
            text: "Footer BSrE bisa ditampilkan pada alur penandatanganan.",
          },
        ],
      },
      {
        id: "global-seo-2026-01-09",
        date: "2026-01-09",
        title: "Metadata & Tautan Sosial",
        changes: [
          {
            kind: "added",
            text: "Tag SEO dan metadata sosial di setiap halaman, supaya tautan yang dibagikan tampil benar.",
          },
        ],
      },
      {
        id: "global-animate-2025-12-19",
        date: "2025-12-19",
        title: "Animasi Halaman",
        changes: [
          {
            kind: "added",
            text: "Animasi pada logo, karakter, dan tutup halaman.",
          },
        ],
      },
      {
        id: "global-login-sso-2025-12-18",
        date: "2025-12-18",
        title: "Masuk & Akun",
        changes: [
          {
            kind: "added",
            text: "Masuk lewat OAuth, dengan token JWT dan sesi Single Sign-On.",
          },
          {
            kind: "added",
            text: "Verifikasi Turnstile pada pendaftaran, disertai jeda timeout agar pengguna tidak terkunci.",
          },
          {
            kind: "added",
            text: "Penandatanganan di luar BSrE, memakai identitas penanda tangan sendiri.",
          },
        ],
      },
      {
        id: "global-csrf-2025-12-17",
        date: "2025-12-17",
        title: "Proteksi Permintaan",
        changes: [
          {
            kind: "fixed",
            text: "Proteksi CSRF dan daftar asal tepercaya, sehingga permintaan dari situs lain tidak lagi diterima.",
          },
          {
            kind: "improved",
            text: "Pembaruan otomatis ikut dijalankan setiap proses deploy.",
          },
        ],
      },
      {
        id: "app-origin-2025-11-13",
        date: "2025-11-13",
        title: "Tapak Astà",
        changes: [
          {
            kind: "added",
            text: "Luncuran pertama Tapak Astà: unggah dokumen, tanda tangan, lalu simpan dan unduh hasilnya.",
          },
        ],
      },
    ],
  };
// --- END GENERATED ---


/**
 * Whether an entry's audience is reachable for a viewer at `viewerTier`.
 * Public (`guest`) entries are always visible — a member can do everything a
 * guest can, so higher tiers never hide them.
 */
export function canViewerSee(
  entry: ChangelogEntry,
  viewerTier: ChangelogAudience,
): boolean {
  const needs = entry.audience ?? "guest";
  return AUDIENCE_INFO[viewerTier].rank >= AUDIENCE_INFO[needs].rank;
}

/**
 * Narrow a page's entries to what the viewer can actually reach. A member on
 * `/main/users` would otherwise be shown admin-only notes for a page that 403s.
 */
export function visibleEntries(
  changelog: PageChangelog,
  viewerTier: ChangelogAudience,
): ChangelogEntry[] {
  return changelog.entries.filter((e) => canViewerSee(e, viewerTier));
}

/** Longest-prefix match so `/me/documents` beats `/me` and `*`. */
export function getChangelogFor(pathname: string): PageChangelog {
  // Collapse trailing slashes; an empty or all-slash path is the home page.
  const stripped = pathname.replace(/\/+$/, "");
  const normalized = stripped === "" ? "/" : stripped;

  const exact = PAGE_CHANGELOGS.find((p) => p.route === normalized);
  if (exact) return exact;

  const prefixed = PAGE_CHANGELOGS.filter(
    (p) => normalized.startsWith(p.route + "/"),
  ).sort((a, b) => b.route.length - a.route.length);

  return prefixed[0] ?? GLOBAL_CHANGELOG;
}

/** All entries across every page, newest first — used by the "all updates" view. */
export function getAllEntries(): { page: string; entry: ChangelogEntry }[] {
  // The `*` fallback is a real entry set too, so it has to be included here —
  // otherwise the "Semua" tab silently omits whatever the fallback announces.
  return [...PAGE_CHANGELOGS, GLOBAL_CHANGELOG]
    .flatMap((p) => p.entries.map((entry) => ({ page: p.page, entry })))
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date));
}

const SEEN_KEY = "changelog:seen";

/**
 * Ids of entries the user has already read. Shared between the navbar (which
 * shows the "new" dot) and the popup (which highlights unseen entries) so the
 * two can't disagree.
 */
export const changelogSeen = $state<{ ids: string[] }>({ ids: [] });

/** Read persisted "seen" ids into the shared store. Safe to call repeatedly. */
export function loadChangelogSeen(): void {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    changelogSeen.ids = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    changelogSeen.ids = [];
  }
}

function persistSeen(ids: string[]): void {
  changelogSeen.ids = ids;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    // Private mode / quota — highlighting still works, it just won't persist.
  }
}

/** Mark one entry as read. */
export function markChangelogSeen(id: string): void {
  if (changelogSeen.ids.includes(id)) return;
  persistSeen([...changelogSeen.ids, id]);
}

/** Mark a batch of entries as read. */
export function markChangelogSeenMany(ids: string[]): void {
  const next = [...new Set([...changelogSeen.ids, ...ids])];
  if (next.length === changelogSeen.ids.length) return;
  persistSeen(next);
}

/** How many of this page's entries the user hasn't read yet. */
export function countUnseenFor(pathname: string): number {
  return getChangelogFor(pathname).entries.filter(
    (e) => !changelogSeen.ids.includes(e.id),
  ).length;
}
