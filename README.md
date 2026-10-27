# TIM-AI

Satu app buat ngurus konten sosmed dari ide sampai laporan: **rencanakan → jadwalkan → posting → ukur → evaluasi pakai AI**.
Platform: Facebook Page, Instagram, YouTube, TikTok, plus akun **Simulasi** buat latihan.

Fitur:
- **Dashboard**: views, engagement rate, profile visit, leads, sales, omzet, funnel, pipeline konten, post yang akan tayang
- **Content Planner (kanban)**: Ide → Draft → Siap → Terjadwal → Tayang. Kartu "Siap" langsung dijadwalkan, dan statusnya ikut bergerak sendiri sampai tayang
- **Kalender**: post terjadwal + rencana konten dalam satu tampilan
- **Post Now & penjadwalan** ke banyak akun sekali klik (teks, gambar, atau video), caption beda per platform
- **Analitik full funnel**: views → engagement → profile visit → klik link → leads → sales, jam tayang terbaik, per platform & per pilar
- **Data performa dari 3 jalur**: tarik otomatis dari API (Facebook, Instagram, YouTube), input manual, atau **AI baca screenshot insight**
- **Laporan otomatis**: siap cetak/PDF dan export CSV (bisa dibuka di Excel)
- **AI Studio (Claude)**: ide + hook + angle + script + caption, analisa performa, susun strategi & kalender konten sebulan. Hasilnya bisa langsung masuk ke Planner
- **Studio Visual** (menu Studio Visual, `/studio`): 12 tool desain (Design Feeds, 9 Feed Konsisten, Carousel, YouTube Thumbnail,
  Typography Ads, Copy Writing, Face Card, Menu F&B, Logo, Try-On, Review Produk, Video Storyboard). Isi brief → copy prompt →
  generate di ChatGPT. Login ikut akun TIM-AI.
- **Video Motion** (menu Video Motion): video ngomong atau info produk → video motion graphics siap posting.
  Caption kata kunci otomatis (transkrip Whisper jalan di browser, gratis), 12 gaya editing (Bold, Glow Editorial, Produk,
  Authority, Tech Demo, Athletic, Edukasi, Minimal, Podcast, Hype, Luxury, Storytelling), b-roll otomatis, zoom/ganti angle/
  shake/glitch, latar blur, musik dengan ducking, efek suara, hook pembuka, CTA penutup, rasio 9:16 / 1:1 / 16:9.
  Hasil MP4 langsung disimpan ke kartu Planner lalu dijadwalkan.
- **Launch Lab** (tim konten): 1 ide → riset & 5 konsep dengan skor permintaan (AI + pencarian web) → brand, palet & angle →
  20 hook, script UGC, iklan Meta, caption (bisa dikirim ke Planner) → brief visual → landing page yang bisa diterbitkan di `/lp/<alamat>` → AI Mentor.
  Semua langkah bisa diisi manual; tombol AI aktif setelah `ANTHROPIC_API_KEY` dipasang.
- **Scraper TikTok** (tim medsos): tempel link TikTok → username, caption, tanggal, durasi, musik, views, like, komen, share, save, ER,
  link thumbnail & video, diperbarui otomatis tiap 6 jam. Label akun sendiri / pesaing / referensi, export CSV, jadikan ide di Planner.
  Video berlabel "akun sendiri" otomatis masuk Analitik.
- **Inbox** (tim CS): satu kotak masuk untuk Shopee, TikTok Shop/Tokopedia, Lazada, WhatsApp Business, dan Instagram DM.
  Balas langsung dari TIM-AI (teks, gambar, template `/`), tugaskan ke staf, label & catatan, panel pesanan pembeli,
  auto-reply (sapaan, di luar jam kerja, kata kunci), pengingat pesanan otomatis, saran balasan AI, channel Simulasi untuk latihan.
- **Tiket & Template** (tim CS): tiket komplain/retur dengan batas waktu per prioritas, template balasan (salin ke Desty Chat),
  impor laporan Desty (Performa Staf & Performa Toko), tiket → ide konten untuk tim konten.
- **Laporan per tim** (menu Laporan): Tim Konten (produksi, ketepatan jadwal, aset, Video Motion, Launch Lab), Tim Medsos (distribusi,
  performa, funnel, TikTok), Tim CS (chat Desty, tingkat & kecepatan respons, konversi, tiket & SLA). Cetak/PDF dan CSV.
- **Alur tim konten → tim medsos**: kartu Planner bisa diberi **lampiran visual** (hasil Studio), lewat kolom **Review**, lalu
  tim medsos menjadwalkan kartu **Siap**, dan media dari lampiran ikut otomatis ke Buat Post. Filter **Tugas saya** untuk kartu milik sendiri.
- **Label tim** per anggota (Tim Konten / Tim Medsos / Semua): menu utama & halaman awal menyesuaikan tugasnya
- **Laporan lengkap**: performa + produksi tim (konten per PIC, tepat waktu/telat/lewat jadwal) + distribusi (berhasil/gagal per platform)
- **Multi-brand**: tiap brand punya akun, post, planner, dan analitik sendiri
- **Multi-user**: anggota tim punya login masing-masing, aksesnya bisa dibatasi per brand

Semua posting ke sosmed lewat **API resmi** masing-masing platform.

## Cara menjalankan

Butuh Node.js versi 22.13 atau lebih baru (cek pakai `node -v`).

```bash
cd siarin
npm install
npm start
```

Lalu buka **http://localhost:4321** di browser.

Biarkan Terminal-nya tetap terbuka. Post terjadwal cuma terkirim selama app jalan.
Kalau app sempat mati, post yang jadwalnya kelewat bakal langsung dikirim begitu app dinyalakan lagi.

## Mulai cepat (tanpa akun asli)

1. Buka tab **Akun**, pilih platform **Simulasi**, isi nama bebas, lalu klik Simpan. Ulangi 2-3 kali.
2. Buka tab **Buat Post**, tulis caption, klik **Pilih semua**, lalu **Posting Sekarang**.
3. Mau lihat tampilan kalau gagal? Tulis `#gagal` di caption.

## Menyambungkan akun asli

Buka tab **Akun**, lalu pilih platform di bagian **Tambah akun**. TIM-AI menampilkan panduan langkah demi langkah
khusus platform itu: app developer apa yang perlu dibuat (dengan link resminya), izin yang wajib dicentang,
cara ambil token, berapa lama token berlaku, dan kolom mana diisi apa.

- **Facebook & Instagram**: ambil token sementara dari Graph API Explorer, lalu kotak **Ambil token otomatis**
  menukarnya jadi Page token yang tidak kedaluwarsa. Tinggal klik **Pakai** di Page-nya.
- **YouTube & TikTok**: isi Client ID/key dan secret, lalu klik **Hubungkan**. Refresh token terisi sendiri dan
  diperbarui otomatis. TikTok cuma bisa dihubungkan dari versi online (https).
- Tombol **Cek token** memanggil API platform beneran: hasilnya valid/tidak, nama akun, izin yang kurang,
  dan cara benerinnya. Akun yang sudah tersimpan juga bisa dicek dari daftar akun.

Hal penting dari dokumentasi resmi (dicek Oktober 2026):

| Platform | Catatan |
|---|---|
| Facebook | Page token dari langkah otomatis tidak punya tanggal kedaluwarsa. |
| Instagram | Wajib akun profesional yang tertaut ke Facebook Page. Maks 100 post API per 24 jam. Posting **gambar** dari versi localhost butuh "URL publik app" (versi online otomatis beres). |
| YouTube | Status OAuth consent screen harus **In production**. Kalau masih Testing, refresh token mati setelah 7 hari. |
| TikTok | Sebelum app lolos audit, semua postingan **private (SELF_ONLY)**. Access token 24 jam dan refresh token 365 hari (diperbarui otomatis). |

## Pengaturan lain (opsional)

| Variabel | Default | Fungsi |
|---|---|---|
| `PORT` | `4321` | Port web app |
| `SIARIN_DATA_DIR` | `./data` | Lokasi database & file upload |
| `SIARIN_SCHEDULER_MS` | `15000` | Seberapa sering cek jadwal (milidetik) |
| `DATABASE_URL` | – | Pakai Postgres (Neon) alih-alih SQLite |
| `BLOB_READ_WRITE_TOKEN` | – | Simpan media di Vercel Blob |
| `APP_PASSWORD` | – | Wajibkan login dengan password ini |
| `CRON_SECRET` | – | Kunci untuk `/api/cron` |
| `APP_USERNAME` | `admin` | Username pemilik |
| `ANTHROPIC_API_KEY` | – | Mengaktifkan AI Studio & pembaca screenshot (buat di console.anthropic.com) |
| `SIARIN_AI_MODEL` | `claude-opus-5-5` | Model Claude yang dipakai |

## Studio Visual

File studio ada di `public/studio/` (paket "Ngonten Dibantu AI", sudah di-build). Yang diubah untuk TIM-AI:
- `public/studio/config.js`: nama brand, link, dan `authEndpoint: "/api/studio/auth"` (login studio = login TIM-AI).
- `public/studio/index.html`: bundle baru dimuat setelah login TIM-AI dicek; yang belum login diarahkan ke halaman login.
Gambar dari ChatGPT di-upload ke kartu Planner (bagian **Lampiran visual**).

## Video Motion

- Semua proses di browser (Chrome/Edge/Safari terbaru). Pertama kali, browser mengunduh model suara
  `onnx-community/whisper-base_timestamped` (±80 MB, dari Hugging Face) lewat transformers.js 4.3.0 (CDN jsDelivr), lalu disimpan di cache.
- Render berjalan sepanjang durasi video (video 1 menit = render ±1 menit). Jangan pindah tab selama render.
- Hasil MP4 (H.264 + AAC) kalau browser mendukung, selain itu WebM.
- Musik latar: pakai lagu yang kamu punya hak pakainya. Efek suara dibuat otomatis (tanpa file).
- Lampiran kartu yang tersimpan online dipakai langsung kalau server penyimpanannya mengizinkan akses lintas domain (CORS);
  kalau tidak, download dulu lalu upload dari perangkat.

## Scraper TikTok

- Link akun **orang lain** diambil lewat layanan pihak ketiga **tikwm.com** (tidak resmi, melanggar aturan TikTok soal scraping,
  bisa berhenti kapan saja). Batas gratisnya ±1 permintaan/detik, jadi cron memperbarui maksimal 8 link per menit.
- Video **akun sendiri** lewat API resmi TikTok (`video.list`): hubungkan ulang akun TikTok di menu Akun supaya izin barunya ikut,
  dan izin ini perlu disetujui TikTok di app developer-mu.
- Link video (kolom download) dari TikTok cuma berlaku sementara.

## Inbox (tim CS)

Inbox → **Pengaturan** → **Channel** → **+ Tambah channel**. Tiap platform punya panduan langkah demi langkah di formnya.

| Platform | Yang dibutuhkan | Cara masuk chat baru |
|---|---|---|
| Shopee | Aplikasi di Shopee Open Platform (Partner ID & Key) dengan izin SellerChat | Cek otomatis tiap menit + webhook |
| TikTok Shop / Tokopedia | Aplikasi di TikTok Shop Partner Center (App Key & Secret), izin Customer Service | Cek otomatis tiap menit + webhook |
| Lazada | Aplikasi di Lazada Open Platform (App Key & Secret), izin IM | Cek otomatis tiap menit + webhook |
| WhatsApp Business | Meta Cloud API: Phone Number ID, token permanen, App Secret | Webhook (wajib) |
| Instagram DM | Meta: akun IG profesional + token Page, App Secret | Webhook (wajib) |
| Simulasi | Tidak ada | Tombol di tab **Simulasi** |

URL redirect OAuth dan URL webhook tampil di panduan tiap channel. Batasan yang perlu diketahui:
- Marketplace hanya memberi akses chat ke aplikasi yang **sudah disetujui**. Sebelum disetujui, pakai channel Simulasi.
- Endpoint chat Shopee (SellerChat) dokumennya tertutup untuk non-partner; perlu dicek ulang setelah akses dibuka.
- WhatsApp & Instagram: balasan biasa hanya boleh dalam 24 jam sejak pesan terakhir pelanggan (aturan Meta).
- Saran balasan AI butuh `ANTHROPIC_API_KEY`.

Laporan Tim CS menggabungkan data Inbox (tingkat respons, rata-rata balas pertama, balas ≤5 menit per staf & per channel),
impor Desty, dan tiket. Impor laporan Desty masih tersedia di **Tiket & Template** (Performa Staf / Performa Toko).

## Tim & brand

- **Pemilik** login pakai `APP_USERNAME` + `APP_PASSWORD` dan bisa semua hal.
- Di menu **Tim & Brand**, pemilik/admin bisa bikin brand baru dan menambah anggota tim (username + password).
  - **Admin**: semua brand + kelola tim.
  - **Anggota**: cuma brand yang dicentang; boleh melengkapi profil brand, tapi tidak bisa kelola tim.
- Ganti password anggota = sesi lamanya otomatis keluar.
- Login tim butuh `APP_PASSWORD`. Tanpa itu (jalan lokal), login mati dan semua orang dianggap pemilik.
- Data lama dari sebelum ada fitur brand otomatis masuk ke **Brand Utama**.

## Tarik data performa dari API

Tombol **Tarik data dari API** di menu Analitik (dan cron tiap 6 jam) mengambil angka terbaru untuk semua post
yang tayang lewat TIM-AI 90 hari terakhir. Klik link, leads, sales, dan omzet diisi manual dan tidak pernah ditimpa.

| Platform | Yang ditarik | Izin tambahan |
|---|---|---|
| Instagram | views, reach, likes, komentar, share, simpan, profile visit & follow (feed) | `instagram_manage_insights` |
| Facebook | reaksi, komentar, share, views (`post_media_view`) | `pages_read_engagement`, `read_insights` (untuk views) |
| YouTube | views, likes, komentar | sudah termasuk saat **Hubungkan** (`youtube.readonly`) |
| TikTok | belum didukung (pakai input manual atau screenshot) | – |

Kalau izinnya belum ada, TIM-AI menampilkan pesan error per konten. Sambungkan ulang akunnya dengan izin itu.

## AI Studio

Butuh `ANTHROPIC_API_KEY`. Biaya dihitung per pemakaian di akun Anthropic-mu. Isi **Profil brand** (niche, target audiens,
produk, gaya bahasa) supaya hasilnya pas. AI juga membaca data performa di menu Analitik untuk analisa & strategi.
Pembaca screenshot menerima gambar (PNG/JPG/WEBP, maks 6 sekaligus). Video screen record belum bisa dibaca, jadi ambil screenshot-nya.

## Versi online (Vercel)

Di Vercel, TIM-AI pakai Neon Postgres (database), Vercel Blob (gambar/video), dan wajib password (`APP_PASSWORD`).
Karena Vercel tidak punya proses yang jalan terus, jadwal dikirim lewat layanan cron eksternal (mis. cron-job.org)
yang memanggil tiap menit:

```
GET https://ALAMAT-SIARIN/api/cron
Authorization: Bearer <CRON_SECRET>
```

## Tes

```bash
npm test
```

Tes ini mencakup alur posting, Video Motion, Scraper TikTok, tim CS & impor Desty, Launch Lab & landing page, laporan per tim, penjadwalan, caption per platform, coba ulang, validasi,
bentuk request ke API Facebook/Instagram/YouTube/TikTok, brand & tim, planner, analitik, laporan,
dan AI (semua pakai server tiruan, bukan API asli).
