# Desain: Motion Factory sebagai fitur TIM-AI

Tanggal: 7 November 2026 · Status: draf, menunggu persetujuan owner

## 1. Intinya (kata owner)

TikTok Motion Factory yang sekarang cuma bisa dijalankan dari Terminal (`./run.sh`) dan cuma kenal 2 produk (Zestmag, Gurahfit). Owner mau mesin ini **bisa dipakai dari TIM-AI** (`/Documents/tim-ai`, deploy Vercel):

1. User TIM-AI bikin **request produksi**: pilih/isi produk (misal Olymax, Binahong, Prolambung), isi **target jumlah video** (misal 1.000 / 2.000 / 10.000, bebas sesuai user), pilih **CTA** (misal keranjang kuning), dan **wajib** isi **link folder Google Drive footage** produk itu.
2. **Mac mini owner** yang memproses: footage diolah dan video dirender pakai pipeline Motion Factory yang sudah ada.
3. Hasilnya dikirim balik ke TIM-AI sebagai **link folder Google Drive baru** berisi semua video hasil request itu.

Kenapa begini: render butuh hardware Mac (VideoToolbox, Apple Vision, Google Drive for desktop, Remotion + Chrome, ±23 detik/video). Vercel nggak sanggup, dan owner memang mau prosesnya di Mac mini.

## 2. Tujuan, bukan tujuan, dan anti-tujuan

**Tujuan**
- Request produksi dari TIM-AI tanpa buka Terminal.
- Produk baru bisa diproduksi tanpa ada yang nulis JSON config manual.
- Progres kelihatan di TIM-AI (berapa video selesai, Mac lagi online/offline, perkiraan selesai).
- Hasil: satu link folder Drive per request, bisa dibuka oleh siapa pun yang punya link-nya, plus `_manifest.csv` (hook, caption, hashtag) kayak sekarang.

**Bukan tujuan (versi ini)**
- Render di cloud (Remotion Lambda dsb.).
- Auto-posting video hasil ke TikTok atau Planner. Link Drive aja dulu.
- Edit atau review per video di TIM-AI.
- Banyak Mac atau worker paralel.

**Anti-tujuan (gagal walaupun teknisnya jalan)**
- Ada video yang lolos dengan klaim berbahaya buat keranjang kuning (nama penyakit, klaim medis, promo palsu), atau nama merek salah atau tertukar dengan produk lain.
- Produksi Zestmag/Gurahfit yang sudah ada (DB `data/factory.db`, stem, kuota, folder Drive) rusak atau tertimpa.
- Video hilang sebelum Drive konfirmasi upload, atau disk Mac penuh.
- Request gagal diam-diam. Contoh: link footage nggak bisa diakses, tapi status di TIM-AI tetap "antre" selamanya. Setiap kegagalan harus muncul di TIM-AI dengan pesan yang jelas.
- Mac harus membuka port ke internet.

## 3. Kendala yang sudah pasti

- TIM-AI: Express 5 di Vercel serverless (`api/index.js` → `src/app.js`), DB Postgres (lokal PGlite), modul backend pola `xxxRoutes(app, db, scope)`, frontend modul `public/*.js` pola `window.siarin` + `viewHooks`, menu di `public/index.html` dengan `data-team`. Multi-brand dan multi-user (`brand_members`, `canManage`). AI di TIM-AI lewat `askClaude` (`src/ai.js`).
- Vercel nggak bisa menghubungi Mac. Mac yang aktif menarik (*poll*) pekerjaan dari TIM-AI.
- Motion Factory: Python (`py/factory.py`, `stems.py`, `planner.py`, `index_footage.py`, `deliver.py`) + Remotion (`src/`, `render/render.mjs`) + Swift helper (`bin/drive_sync`, `bin/vision_index`). State di SQLite `data/factory.db`. Produk didefinisikan di `config/factory.json → products` + `config/products/<id>.json` (field: `name`, `short`, `tts_name`, `file_prefix`, `official_claim`, `brand_lock`, `tts_lexicon`, `other_brands`, `label_regex`, `facts`, `audience`, `angles`, `hook_styles`, `cta_variants`, `badge_texts`, `compliance`, `palette`, `product_images`, `style_examples`, `safe_hashtags`) + entri di `products.json` (pain point, fitur fisik, manfaat aman, momen pemakaian) untuk format `story`.
- CTA sudah ada sebagai `modes` di `config/factory.json`: `kerkun` (keranjang kuning, softcta) dan `awareness` (tanpa keranjang, engagecta).
- Akun Google di Mac: bayucakrasentama@gmail.com (Drive for desktop sudah login). Folder hasil sekarang: `Drive Saya/Video Tiktok Affiliate/`.
- Mac mini M4 16GB, ±23 dtk/video → 2.000 video ≈ 13 jam, 10.000 ≈ 2,7 hari nonstop.

## 4. Yang sudah diputuskan

### 4a. Alur user di TIM-AI
Menu baru **"Motion Factory"** di grup Tim Konten (`data-team="konten"`), isinya:

- **Form request**:
  - Produk: pilih dari profil produk brand yang sudah ada, atau "produk baru".
  - Target jumlah video: angka 1–20.000.
  - CTA: Keranjang kuning / Tanpa keranjang (awareness) / Campur 50:50. Ini memetakan ke `modes` yang sudah ada.
  - Link folder Google Drive footage: **wajib**, divalidasi formatnya.
- **Daftar request**: status, progres `selesai / target`, perkiraan selesai, link Drive hasil (kalau sudah ada), pesan error, dan tombol Jeda / Lanjut / Batalkan.
- **Indikator Mac**: Online (heartbeat < 2 menit), Offline, atau Sedang produksi request #X.

### 4b. Status request
`menunggu_profil` → `antre` → `menyiapkan` (download footage, index, generate stem + TTS) → `produksi` → `selesai`.
Status samping: `dijeda`, `dibatalkan`, `gagal` (dengan pesan + tombol "Coba lagi").

### 4c. Mac menarik pekerjaan (pull)
Di Mac jalan satu proses agen (dijalankan `launchd` supaya hidup lagi setelah restart). Tiap ±30 detik agen ini:
- kirim heartbeat ke TIM-AI;
- ambil request berikutnya kalau lagi nganggur;
- lapor progres dan error.

Autentikasinya pakai token rahasia khusus agen (env di Vercel + `.env` di Mac), bukan login user. Mac nggak membuka port apa pun.

### 4d. Satu request satu waktu
Antrean FIFO lintas brand. Satu request dikerjakan sampai selesai dulu, baru lanjut ke yang berikutnya (resume tetap jalan kalau Mac mati di tengah).

### 4e. Hasil di Drive
- Tiap request punya folder baru di `Drive Saya/Video Tiktok Affiliate/<Nama Produk> - <tanggal> (#<id request>)/`.
- Upload tetap pakai mekanisme rolling sync yang sudah ada (konfirmasi upload → purge → evict → backpressure).
- Setelah request selesai, folder di-share "siapa saja yang punya link: lihat", lalu link-nya dilaporkan ke TIM-AI.
- Link juga boleh muncul sejak awal produksi, supaya user bisa lihat video yang sudah jadi.

### 4f. Aturan aman keranjang kuning
Semua mekanisme yang ada (`violations`, `sanitize`, `brand_lock`, `brand_errors`, `banned_hashtag_terms`) wajib berlaku untuk produk baru. Request dengan CTA "Tanpa keranjang" dilarang menyebut keranjang/checkout (aturan `awareness` yang sudah ada).

## 5. Keputusan dariku (bisa dikoreksi owner)

- **Profil produk baru disusun AI, lalu dicek user.** Pertanyaan ini belum dijawab owner.
  - User isi: nama produk, kategori, klaim resmi di label (wajib, ini dasar aturan aman), foto botol/produk (PNG), warna brand (opsional), catatan bebas.
  - Claude di TIM-AI menyusun sisanya: pain point, fitur fisik, manfaat aman, momen pemakaian, angle, hook style, CTA variants, badge texts, kata terlarang tambahan, brand lock, lexicon TTS, hashtag aman.
  - User mengecek dan mengedit di layar, lalu klik "Setujui profil". Baru setelah itu request masuk `antre`.
  - Profil disimpan per brand dan dipakai ulang di request berikutnya.
- **Footage diambil lewat Google Drive API** dengan akun Google owner di Mac (login OAuth sekali), lalu di-download ke folder lokal per produk. Alasannya: link Drive bisa dari folder siapa saja yang di-share ke akun itu, tanpa harus bikin pintasan manual. Dengan cara ini link folder hasil juga bisa diambil dan di-share.
  - Kalau link nggak bisa diakses, request langsung `gagal` dengan pesan "Folder belum di-share ke bayucakrasentama@gmail.com".
- **Notifikasi selesai/gagal** lewat kanal notifikasi brand yang sudah ada (`src/notify.js`, Telegram/WA).
- **Siapa yang boleh request**: semua anggota brand. **Menyetujui profil produk hanya owner/admin** (`canManage`), karena profil ini dasar aturan aman keranjang kuning untuk ribuan video. Klaim label wajib disertai foto label sebagai bukti yang bisa dicek admin.
- **Antrean**: target maksimal 20.000 per request. FIFO lintas brand, dan owner/admin bisa mengubah urutan atau menaikkan prioritas request. Nggak ada kuota per brand dulu.
- **Footage talent "Mas Bayu"** dan `talent_sources` tetap hanya untuk Zestmag/Gurahfit. Produk baru hanya memakai footage dari link-nya sendiri.
  - Cek di awal (tahap `menyiapkan`): kalau nggak ada shot produk sama sekali, request `gagal` dengan pesan jelas.
  - Kalau nggak ada shot orang, semua peran memakai shot produk/ambience (tetap jalan, dengan catatan di TIM-AI).
- **Kombinasi unik per produk lintas request.** Request kedua untuk produk yang sama tetap nggak mengulang kombinasi dari request sebelumnya, dan memakai ulang stem yang sudah ada (tambah stem kalau ruang kombinasinya kurang).
- **OAuth Google**: owner bikin sekali Google Cloud project + OAuth client "Desktop app" dengan scope `drive`, publishing status **In production** (bukan Testing, supaya token nggak kedaluwarsa tiap 7 hari). Peringatan "aplikasi belum diverifikasi" wajar untuk pemakaian pribadi. Builder menulis panduan langkah demi langkahnya.

- **Penyimpanan hasil** (jawaban owner: semua di Drive bayucakrasentama@gmail.com). Folder hasil disimpan terus, tanpa hapus otomatis.
  - Sebelum request masuk `antre`, agen mengecek sisa kuota Drive lewat API (`about.storageQuota`) dengan perkiraan ±18GB per 1.000 video.
  - Kalau nggak cukup, request ditahan dengan pesan "Drive kurang ±X GB".
  - Saat produksi, kalau kuota hampir habis, request otomatis `dijeda`.

- **Produksi lama Zestmag/Gurahfit** (jawaban owner: "Pause, TIM-AI duluan").
  - Request TIM-AI selalu didahulukan. Begitu ada request `antre`, agen menghentikan `run.sh` yang sedang jalan dengan aman: tunggu batch render aktif selesai, lalu stop.
  - Setelah antrean TIM-AI kosong, produksi lama otomatis dilanjutkan ke kuotanya (auto-resume yang sudah ada).
  - Agen menggantikan `run.sh` sebagai satu-satunya pengendali Mac, tapi `./run.sh` manual tetap bisa dipakai.
  - Keputusanku: Zestmag dan Gurahfit juga muncul sebagai profil produk siap pakai di TIM-AI, memakai stem dan riwayat kombinasi di `factory.db` yang sudah ada.

## 6. Diserahkan ke builder

- Skema tabel di TIM-AI (`factory_jobs`, `factory_products`, heartbeat di `settings` atau tabel sendiri), nama endpoint, bentuk payload agen.
- Cara agen memanggil pipeline: import modul Python langsung atau subprocess ke `py/factory.py` dengan argumen baru.
- Perubahan di `py/*` supaya produk didefinisikan dinamis dari profil (tulis `config/products/<slug>.json` + entri `products.json`, tambah sumber footage, index hanya footage produk itu).
- Kalibrasi ukuran stem matrix terhadap target (2.000 video butuh stem jauh lebih sedikit dari 10.000).
- Cara memisahkan antrean dan kuota request dari produksi Zestmag/Gurahfit yang lama, misalnya kolom `request_id` di tabel video.
- Tampilan detail menu, pakai token warna dan pola komponen TIM-AI yang ada.
- Tes: unit test endpoint di `test/*.test.js` TIM-AI, mock agen untuk `dev/mock-server.mjs`, uji ujung ke ujung dengan target kecil (misal 5 video).

## 7. Pertanyaan terbuka

Nggak ada. Semua pertanyaan dari review builder sudah dijawab owner atau diputuskan di bagian 5.
