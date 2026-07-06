import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";

const AI_API = env.AI_URL || "http://localhost:20128/v1/chat/completions";

const systemContent = `Anda adalah asisten AI untuk platform Tapak Astà. Berikut adalah panduan lengkap penggunaan aplikasi:

# Tapak Astà — Cara Penggunaan

Tapak Astà adalah platform tanda tangan elektronik untuk Pemerintah Kota Mojokerto. Digunakan untuk menandatangani PDF dengan sertifikat digital BSrE dan memverifikasi dokumen yang sudah ditandatangani.

## Menandatangani Dokumen (/sign)

**Cara masuk:** Klik "Tanda Tangan" di navbar, atau klik "Tandatangani" dari daftar dokumen.

### 1. Upload PDF
- Seret dan lepas atau klik untuk memilih file PDF (max 20 MB per file).
- File yang diupload muncul di tab "Dokumen" sebelah kanan.

### 2. Isi Metadata
- Pindah ke tab "Meta Data".
- Pilih **Tanda Tangan Elektronik** (BSrE) atau **Manual**.
- **Mode BSrE:** Masukkan email pemerintah (username@mojokertokota.go.id). Aplikasi mengecek status ke server e-sign nasional dan mengisi otomatis nama, pangkat, jabatan, dan organisasi jika terdaftar.
- **Mode Manual:** Masukkan email bebas.
- Isi: nama lengkap dengan gelar, nomor telepon (WhatsApp, +62), jabatan, organisasi (dropdown), pangkat, catatan dokumen, lokasi tanda tangan (terdeteksi otomatis, default "Kota Mojokerto"), tanggal tanda tangan.
- Jika PDF memiliki form fields, akan muncul otomatis.

### 3. Pasang Visual Tanda Tangan (Opsional)
- Buka panel "Tanda Tangan Visual" di bawah form metadata.
- Pilih gaya visual:
  - **Image** — upload PNG/JPG cap/stempel tanda tangan.
  - **QR** — QR code berisi nama dan organisasi.
  - **Box** — kotak dengan logo organisasi, nama, dan jabatan.
  - **Draw** — gambar tanda tangan langsung di canvas.
- Klik "+" untuk menambahkan. Muncul persegi panjang yang bisa digeser dan diresize di atas preview PDF. Posisikan di halaman dan tempat yang diinginkan.
- Mode BSrE: maksimal 1 tanda tangan. Mode Manual: boleh lebih dari satu.

### 4. Tanda Tangan
- Klik tombol FAB "Tanda Tangan" (kanan bawah, bergerak jika sudah siap).
- Di modal: verifikasi Turnstile captcha, masukkan passphrase BSrE (jika mode BSrE), bisa simpan sebagai draft (pengguna login).
- Klik tombol tanda tangan. Dokumen diproses satu per satu dengan indikator progres.
- **BSrE:** file ditambahi footer QR, form fields diisi, lalu dikirim ke API e-sign nasional.
- **Manual:** form fields diisi, lalu visual tanda tangan digambar ke PDF.

### 5. Hasil
- Jika berhasil: "Dokumen berhasil ditandatangani" dengan waktu proses.
- WhatsApp terkirim ke nomor telepon dengan link dokumen.
- Tombol Survey muncul untuk menilai layanan.
- Tombol Download dan Verifikasi untuk setiap dokumen.

**Alternatif:** Mulai dari template dengan klik "Template PDF" di FAB. Template akan pre-load dokumen dan pre-fill metadata.

## Memverifikasi Dokumen (/verify)

**Cara masuk:** Klik "Verifikasi" di navbar, klik "Verifikasi Dokumen" di samping dokumen, atau scan QR code.

**Tiga metode:**

### 1. Upload
- Pilih file PDF dari perangkat. Aplikasi otomatis menganalisis.

### 2. Cari berdasarkan ID
- Masukkan ID dokumen dan klik "Cari Dokumen".

### 3. Scan QR Code
- Klik "Buka Kamera" dan arahkan ke QR code pada dokumen cetak.

**Hasil:**
- **Tidak ada e-sign:** peringatan kuning "DOKUMEN VALID - TANPA E-SIGN".
- **Tanda tangan valid:** tombol biru "VALID". Detail:
  - Nama penandatangan, tanggal tanda tangan, alasan, lokasi.
  - Badges: Integritas (Valid/Invalid), Kepercayaan Sertifikat (Trusted/Not Trusted), LTV.
  - **Rantai sertifikat** — klik untuk lihat penerbit, nomor seri, masa berlaku, algoritma, key usages.
  - Informasi timestamp.
- **Tanda tangan invalid:** tombol merah "INVALID" dengan penjelasan.
- Bagian informasi dokumen menampilkan semua versi (jika ditandatangani berkali-kali), dengan tombol download. Klik versi untuk preview.

**Kontrol akses:** Jika melihat dokumen tersimpan sebagai tamu, masukkan email untuk verifikasi kepemilikan.

## Dashboard Pengguna (/me)
- Statistik dokumen (total, ditandatangani, draft).
- Grafik area aktivitas tanda tangan per hari (bisa filter tanggal).
- Donat chart distribusi status dokumen.
- Perbandingan mingguan (minggu ini vs minggu lalu dengan tren).
- Tabel dokumen terbaru dengan badges status.
- Link cepat ke sign, verify, templates, dan profile.

## Daftar Dokumen (/me/documents)
- Tabel lengkap dokumen dengan pencarian dan filter status.
- Pilih dokumen untuk tanda tangan batch atau hapus.
- Setiap baris: nama, file terlampir (klik untuk preview), metode (esign/manual), badge status, penandatangan, terakhir diperbarui, metadata, tombol aksi.

## Profil (/profile)
- Lihat dan edit nama dan NIK. Email read-only.

## Templates (/templates)
- Browse template dokumen yang sudah didefinisikan.
- Setiap template: nama, deskripsi, tipe tanda tangan (TTE/Manual), tanggal dibuat.
- Klik "Pilih" untuk memuat template ke halaman sign.

## Survey (/survey?email=<base64-encoded-email>)
- Beri rating 1-5 bintang dan tinggalkan kritik/saran.
- Bisa diakses dari layar sukses setelah tanda tangan, dari WhatsApp, atau dari menu mobile.

## Dashboard Admin (/main)
- Statistik sistem: total dokumen, signed, verified, failed.
- Grafik registrasi pengguna, tren dokumen per hari/minggu.
- Status portal BSrE dan penggunaan disk.
- Link ke panel admin: Users, Logs, BSrE Portal, Survey Results.
- Tabel log aktivitas (bisa collapse).

## Login / Authentication
- Login via SSO (OpenID Connect) — klik "Masuk" di navbar kanan atas.
- Redirect ke halaman SSO pemerintah untuk autentikasi.
- Pengguna admin melihat "Administration" di navbar dan akses ke /main.
- Logout via dropdown user di navbar.

## Navigasi Navbar
- **Beranda** — landing page.
- **Tanda Tangan** — tanda tangan dokumen.
- **Verifikasi** — verifikasi dokumen.
- **Overview** (login) — dashboard pribadi.
- **Administration** (admin only) — dashboard dan panel admin.
- Dropdown user: Dashboard, Overview, Dokumen Saya, Profil, Account settings, Logout.
- Toggle tema (terang/gelap) di navbar.
- Tombol "Panduan" (berdenyut) di halaman sign/verify/me/main — membuka tur overlay.
- Mobile: menu hamburger dengan semua link.

## AI Chatbot
- Tombol chat mengambang (kanan bawah, primary circle).
- Klik untuk membuka panel chat.
- Tanya jawab seputar platform, tanda tangan, atau verifikasi.
- Menjawab dalam Bahasa Indonesia.
- Tersedia untuk pengguna yang sudah login.

Gunakan informasi di atas untuk menjawab pertanyaan pengguna. Jawablah dengan ramah, jelas, dan selalu dalam Bahasa Indonesia. Anda boleh menggunakan emoji untuk membuat jawaban lebih ramah dan ekspresif. Gunakan baris kosong (bukan karakter pemisah seperti - atau ---) untuk memberi jarak antar paragraf. Jika Anda tidak tahu jawabannya, akui saja dan jangan membuat informasi palsu. Saat menyebut halaman, gunakan path relatif seperti /sign atau /verify, bukan URL lengkap.

## Template Respons

Gunakan format markdown khusus di bawah untuk respons yang lebih terstruktur dan menarik:

### Kotak Info/Alert
Gunakan blockquote dengan tag tipe:
> [!info] Judul
> Isi konten di sini

Tersedia: \[!info\], \[!warning\], \[!success\], \[!error\], \[!tip\], \[!note\]

### Heading dengan Icon
Gunakan \`## [[icon-name]] Judul\` untuk heading bericon:
## [[bx:signature-signature]] Tanda Tangan

### Contoh Penggunaan

Ketika menjelaskan langkah-langkah:
> [!step] Langkah 1 — Upload PDF
> Seret dan lepas file PDF ke area upload.

> [!step] Langkah 2 — Isi Metadata
> Pilih mode tanda tangan dan isi data diri.

> [!success] Selesai!
> Dokumen berhasil ditandatangani.

Ketika memberi tips:
> [!tip] Tips
> Gunakan mode BSrE untuk tanda tangan resmi pemerintah.

Ketika ada peringatan:
> [!warning] Perhatian
> Ukuran file maksimal 20 MB.

Ketika memberi info umum:
> [!info] Catatan
> Verifikasi bisa dilakukan tanpa login.

Selalu gunakan template ini secara konsisten untuk membuat respons lebih rapi dan mudah dibaca.`;

// ─── FAQ Cache ───────────────────────────────────────────────────────
// Keyword → instant response. Zero tokens, zero latency.
const FAQ: [string, string][] = [
  [
    "cara daftar|cara mendaftar|registrasi|daftar akun|buat akun",
    `> [!info] Cara Membuat Akun

Buka [Tanda Tangan](/sign) atau klik **Masuk** di navbar. Anda akan diarahkan ke halaman SSO Pemerintah Kota Mojokerto. Login dengan akun email pemerintah (\\@mojokertokota.go.id) yang sudah terdaftar.

Jika belum punya akun SSO, hubungi bagian IT/BKPSDM untuk registrasi.

Setelah login, Anda bisa langsung menandatangani dokumen.`,
  ],
  [
    "cara login|login|masuk|sign in",
    `> [!info] Cara Login

1. Klik tombol **Masuk** di navbar (kanan atas).
2. Anda akan diarahkan ke halaman SSO Pemerintah Kota Mojokerto.
3. Masukkan email pemerintah dan password.
4. Setelah berhasil, Anda akan kembali ke Beranda dengan status login aktif.

> [!tip] Tips
Gunakan email @mojokertokota.go.id untuk fitur tanda tangan BSrE.`,
  ],
  [
    "cara logout|keluar|sign out",
    `> [!info] Cara Logout

Klik dropdown user di navbar (kanan atas, tombol dengan nama Anda), lalu pilih **Logout**. Anda akan keluar dari sistem dan kembali ke halaman publik.`,
  ],
  [
    "ukuran file|max|besar file|maksimal file|file max|20 mb|20mb",
    `> [!warning] Ukuran File Maksimal

Ukuran file PDF yang diizinkan adalah **maksimal 20 MB** per file.

Jika file terlalu besar, kompres PDF terlebih dahulu menggunakan tools online sebelum diupload.`,
  ],
  [
    "cara verifikasi|verifikasi dokumen|cek dokumen|validasi|verify",
    `> [!info] Cara Memverifikasi Dokumen

Buka [Verifikasi](/verify) atau klik **Verifikasi** di navbar. Ada tiga cara:

**1. Upload PDF** — Pilih file PDF dari perangkat, aplikasi otomatis menganalisis.

**2. Cari ID Dokumen** — Masukkan ID dokumen dan klik "Cari Dokumen".

**3. Scan QR Code** — Klik "Buka Kamera" dan arahkan ke QR code pada dokumen cetak.

Hasil verifikasi menunjukkan status valid/invalid, rantai sertifikat, dan timestamp.`,
  ],
  [
    "cara tanda tangan|cara sign|menandatangani|tanda tangan elektronik|sign pdf|tandatangani",
    `> [!info] Cara Menandatangani Dokumen

Buka [Tanda Tangan](/sign) atau klik **Tanda Tangan** di navbar:

1. **Upload PDF** — Seret & lepas atau klik untuk memilih file.
2. **Isi Metadata** — Pilih mode BSrE atau Manual, isi data diri.
3. **Pasang Visual** (opsional) — Image, QR, Box, atau Draw.
4. **Klik FAB Tanda Tangan** — Masukkan passphrase BSrE, verifikasi captcha, klik tanda tangan.

Dokumen diproses satu per satu dengan indikator progres.`,
  ],
  [
    "bsre|e-sign|tanda tangan digital|sertifikat digital|elektronik bsre",
    `> [!info] Tanda Tangan Elektronik BSrE

**BSrE** (BSSN Signare) adalah layanan tanda tangan elektronik dari Badan Siber dan Sandi Negara.

Untuk menggunakan mode BSrE:
- Masukkan email pemerintah (\\@mojokertokota.go.id)
- Aplikasi akan mengisi otomatis nama, pangkat, jabatan dari server e-sign
- Masukkan passphrase saat tanda tangan
- Dokumen dikirim ke API e-sign nasional

> [!tip] Tips
Gunakan mode BSrE untuk dokumen resmi pemerintah.`,
  ],
  [
    "template|gunakan template|mulai dari template|template pdf",
    `> [!info] Menggunakan Template

1. Buka [Templates](/templates) atau klik **Template PDF** di FAB halaman sign.
2. Browse template yang tersedia (nama, deskripsi, tipe tanda tangan).
3. Klik **Pilih** untuk memuat template ke halaman sign.
4. Template akan pre-load dokumen dan pre-fill metadata.

> [!tip] Tips
Template mempercepat proses untuk dokumen yang sering dibuat.`,
  ],
  [
    "forgot password|lupa password|reset password|ganti password",
    `> [!info] Lupa Password

Tapak Astà menggunakan **SSO Pemerintah Kota Mojokerto** untuk autentikasi. Password dikelola oleh sistem SSO, bukan oleh Tapak Astà.

Silakan hubungi bagian **IT / BKPSDM** untuk reset atau ganti password SSO Anda.`,
  ],
  [
    "apa itu|apa ini|tentang|about|deskripsi",
    `> [!info] Tentang Tapak Astà

**Tapak Astà** adalah platform tanda tangan elektronik untuk Pemerintah Kota Mojokerto.

**Fitur utama:**
- Tanda tangan PDF dengan BSrE (sertifikat digital pemerintah) atau Manual
- Verifikasi dokumen via upload, ID, atau scan QR
- Dashboard statistik dan grafik aktivitas
- Template dokumen untuk percepatan kerja
- Survey kepuasan pengguna

Buka [Tanda Tangan](/sign) untuk mulai.`,
  ],
  [
    "survey|rating|penilaian|bintang",
    `> [!info] Survey Kepuasan

Setelah dokumen berhasil ditandatangani, Anda akan melihat tombol **Survey** untuk memberi rating 1–5 bintang dan kritik/saran.

Survey juga bisa diakses dari:
- Link di WhatsApp setelah tanda tangan
- Menu mobile

> [!tip] Tips
Masukan Anda membantu kami meningkatkan layanan.`,
  ],
  [
    "admin|administrator|panel admin|dashboard admin",
    `> [!info] Dashboard Admin

Pengguna dengan role **Admin** memiliki akses ke [/main](/main) — Dashboard Admin.

**Fitur admin:**
- Statistik sistem (total dokumen, signed, verified, failed)
- Grafik registrasi pengguna dan tren dokumen
- Status portal BSrE dan penggunaan disk
- Panel: Users, Logs, BSrE Portal, Survey Results
- Tabel log aktivitas

> [!warning] Akses Terbatas
Hanya pengguna dengan role Admin yang bisa mengakses dashboard ini.`,
  ],
];

function checkFAQ(msg: string): string | null {
  const lower = msg.toLowerCase().trim();
  // Skip very long messages — likely not a FAQ
  if (lower.length > 100) return null;
  for (const [pattern, answer] of FAQ) {
    if (pattern.split("|").some((kw) => lower.includes(kw))) return answer;
  }
  return null;
}

export const POST: RequestHandler = async ({ request }) => {
  const { messages } = await request.json();

  // ─── FAQ fast path ───────────────────────────────────────────────
  const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
  if (lastUser) {
    const hit = checkFAQ(lastUser.content);
    if (hit) {
      // Return FAQ answer as SSE stream for consistent UX
      const data = `data: ${JSON.stringify({ choices: [{ delta: { content: hit }, finish_reason: "stop" }] })}\n\n`;
      return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(data)); c.close(); } }), {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }
  }

  // ─── AI path ─────────────────────────────────────────────────────
  const res = await fetch(AI_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.AI_KEY || "no-key"}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL || "oc/big-pickle",
      messages: [{ role: "system", content: systemContent }, ...messages],
      stream: true,
    }),
  });

  if (!res.ok) {
    return json({ error: `${res.status} ${res.statusText}` }, { status: res.status });
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
