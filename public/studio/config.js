/* ====================================================================
   KONFIGURASI - edit file ini lalu upload. TIDAK perlu build/coding.
   Baca PANDUAN-SETUP.txt untuk panduan lengkap + aturan tanda kutip.
   ==================================================================== */
window.__AF_CONFIG = {

  /* -- 1. BRANDING --------------------------------------------------- */
  brandName: "TIM-AI Studio",              // nama brandmu (kata terakhir tampil warna aksen)
  tagline:   "Studio Visual Tim Konten",           // teks kecil di bawah logo
  logoUrl: "/logo.svg",    // timpa file logo di folder ini, atau isi URL gambar

  /* -- 1b. WARNA (opsional) - kosongkan "" = pakai bawaan -------------
     accentColor : warna utama (tombol, link, glow). bgColor : background GELAP. */
  accentColor: "#a855f7",   // contoh: "#7c3aed" (ungu) / "#2563eb" (biru) / "#0d9488" (teal)
  bgColor:     "#0a0b1e",   // contoh: "#0a0a14" (navy gelap) / "#0c0a09" (charcoal)

  /* -- 2. LINK ------------------------------------------------------- */
  paymentUrl:   "/",   // WAJIB: ganti dengan link pembayaran/checkout kamu
  affiliateUrl: "",                            // link daftar affiliate (Wajib Di isi "")

  // Link tombol "Buka Gemini" di jendela setelah Copy: pemilih akun Google dulu, jadi tiap orang masuk pakai emailnya sendiri.
  chatgptUrl: "https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fgemini.google.com%2Fapp",

  /* -- 2b. SOCIAL (footer) ------------------------------------------- */
  instagramUrl:    "",
  instagramHandle: "",
  facebookUrl:     "",   // kosongkan "" untuk menyembunyikan link Facebook
  facebookHandle:  "",

  /* -- 3. HARGA (tampilan teks) -------------------------------------- */
  price:       "99.000",     // harga tampil
  priceStrike: "700.000",    // harga coret
  affiliatePerSignup: 63000, // komisi affiliate per pendaftaran (angka, tanpa kutip)

  /* -- 3b. TIER LISENSI RESELLER ------------------------------------
     false = sembunyikan kartu "Jual Ulang" (untuk situs jualan biasa). */
  showResellerTier: false,

  /* -- 4. LOGIN via GOOGLE SPREADSHEET ------------------------------
     1. Buat Google Sheet, kolom A1 = "Email", isi email pelanggan ke bawah.
     2. File > Share > Publish to web > pilih sheet > format CSV > Publish.
     3. Salin URL (berakhiran output=csv), tempel DI ANTARA kutip di bawah. */
  sheetCsvUrl: "",

  // SIARIN: login studio memakai akun TIM-AI (endpoint ini mengecek cookie login TIM-AI).
  authEndpoint: "/api/studio/auth",

  // Password login (semua pelanggan pakai 1 password ini). JANGAN tulis
  // password apa adanya - buka hash-tool.html, ketik password, salin hash-nya,
  // tempel DI ANTARA kutip (ganti kode lama).
  loginPasswordHash: "265b9dba2464bae7cfe83689ed020d23bcf378fa46a96c23a0c0bdeed848ad1a",
  // ^ bawaan = password "GantiPasswordIni". Ganti dengan punyamu (pakai hash-tool.html).
};
