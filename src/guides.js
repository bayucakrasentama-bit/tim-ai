// Panduan langkah demi langkah di form "Tambah akun", per platform.
// Disusun dari dokumentasi resmi (dicek Oktober 2026):
// - Meta: developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived,
//         /docs/pages-api/posts, /docs/instagram-platform/content-publishing
// - Google: developers.google.com/identity/protocols/oauth2, /youtube/v3/docs/videos/insert
// - TikTok: developers.tiktok.com/doc/content-posting-api-get-started, /doc/oauth-user-access-token-management,
//           /doc/login-kit-web, /doc/content-posting-api-reference-query-creator-info, /docs/en/add-a-sandbox
// Teks boleh berisi HTML sederhana. {{REDIRECT_URI}} diganti alamat callback TIM-AI oleh halaman.

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

const metaApp = [
  {
    title: 'Bikin app di Meta for Developers',
    html: `Buka ${link('https://developers.facebook.com/apps', 'developers.facebook.com/apps')}, login pakai akun Facebook yang jadi admin Page, lalu klik <b>Create App</b>.
      Pilih use case untuk <b>mengelola Page</b>. Kalau ditanya portofolio bisnis, boleh dilewati.
      Mode <b>Development</b> sudah cukup untuk Page milik sendiri, jadi nggak perlu App Review.`,
  },
  {
    title: 'Catat App ID & App Secret',
    html: 'Di app tadi buka <b>App settings → Basic</b>. Salin <b>App ID</b> dan <b>App Secret</b> (klik Show). Dua-duanya dipakai di kotak "Ambil token otomatis" (di samping/bawah panduan ini). App Secret <b>tidak disimpan</b> oleh TIM-AI.',
  },
];

const metaExplorer = (perms) => ({
  title: 'Ambil token sementara dari Graph API Explorer',
  html: `Buka ${link('https://developers.facebook.com/tools/explorer/', 'Graph API Explorer')}. Di kanan, pilih app kamu di <b>Meta App</b>, lalu <b>User or Page → Get User Access Token</b>.
    Di <b>Permissions</b>, centang: ${perms.map((p) => `<code>${p}</code>`).join(', ')}.
    Klik <b>Generate Access Token</b>, login, lalu pastikan Page kamu <b>dicentang</b> di jendela izin. Salin token yang muncul. Token ini cuma berlaku sekitar 1–2 jam, makanya langkah berikutnya menukarnya.`,
});

const metaHelper = (target) => ({
  title: 'Tukar jadi token permanen (otomatis)',
  html: `Tempel App ID, App Secret, dan token tadi di kotak <b>"Ambil token otomatis"</b>, lalu klik <b>Ambil Page</b>.
    TIM-AI menukarnya jadi token 60 hari, lalu mengambil <b>Page token</b> yang <b>tidak punya tanggal kedaluwarsa</b>.
    Klik <b>Pakai</b> di ${target}. Kolom ID & token langsung terisi.`,
});

export const guides = {
  simulasi: {
    intro: 'Akun pura-pura buat latihan. Nggak perlu token apa-apa, langsung simpan aja.',
    steps: [],
    fieldMap: [],
    tokenLife: 'Tidak ada token.',
  },

  facebook: {
    intro: 'Posting ke <b>Facebook Page</b> (bukan profil pribadi) lewat Graph API resmi.',
    needs: [
      'Facebook Page, dan akun Facebook kamu bisa membuat konten di Page itu (admin/editor).',
      'Akun Meta for Developers (gratis, login pakai Facebook).',
    ],
    helper: 'meta',
    steps: [
      ...metaApp,
      metaExplorer(['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_engagement', 'pages_read_user_engagement', 'publish_video']),
      metaHelper('Page yang mau dipakai'),
      { title: 'Cek token', html: 'Klik <b>Cek token</b>. Kalau hijau ("Valid") dan nama Page-nya benar, isi nama akun lalu <b>Simpan akun</b>.' },
    ],
    fieldMap: [
      ['Page ID', 'ID Page (terisi otomatis dari tombol Pakai)'],
      ['Page Access Token', 'Page token permanen (terisi otomatis)'],
    ],
    tokenLife: 'Token dari Explorer ±1–2 jam → ditukar jadi user token ±60 hari → Page token <b>tanpa tanggal kedaluwarsa</b>. Page token bisa mati kalau password Facebook diganti, akses app dicabut, atau kamu bukan admin Page lagi. Kalau "Cek token" merah, ulangi langkah 3–4.',
  },

  instagram: {
    intro: 'Posting ke <b>Instagram</b> lewat "Instagram API with Facebook Login" (API resmi Meta).',
    needs: [
      'Akun Instagram <b>profesional</b> (Bisnis atau Kreator). Di app Instagram: Pengaturan → Jenis akun dan alat → Beralih ke akun profesional.',
      'Akun IG itu <b>terhubung ke Facebook Page</b> (di app Instagram: Edit profil → Page, atau dari pengaturan Page → Akun tertaut).',
      'App Meta (boleh pakai app yang sama dengan Facebook).',
    ],
    helper: 'meta',
    steps: [
      ...metaApp,
      {
        title: 'Tambahkan produk Instagram ke app',
        html: 'Di dashboard app, tambahkan use case/produk <b>Instagram</b> versi <b>"API setup with Facebook login"</b> (bukan "Instagram login").',
      },
      metaExplorer(['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish']),
      {
        title: 'Catatan izin tambahan',
        html: 'Kalau akses Page kamu didapat lewat <b>Business Manager</b>, Meta mewajibkan izin <code>ads_management</code> dan <code>ads_read</code> juga. Centang dua itu kalau "Cek token" bilang izin kurang.',
      },
      metaHelper('Page yang ada tulisan Instagram-nya'),
      { title: 'Cek token', html: 'Klik <b>Cek token</b>. Kalau valid, muncul @username dan sisa kuota posting hari ini.' },
    ],
    fieldMap: [
      ['Instagram Business Account ID', 'ID IG yang tertaut ke Page (terisi otomatis)'],
      ['Access Token', 'Page token dari Page yang tertaut (terisi otomatis)'],
      ['URL publik app', 'Kosongkan kalau pakai versi online. Cuma perlu di versi localhost buat posting gambar.'],
    ],
    tokenLife: 'Sama seperti Facebook: Page token <b>tanpa tanggal kedaluwarsa</b>. Batas Instagram: <b>100 post lewat API per 24 jam</b>. Kalau Page-nya butuh Page Publishing Authorization (PPA), selesaikan dulu di Facebook.',
  },

  youtube: {
    intro: 'Upload video ke <b>YouTube</b> lewat YouTube Data API v3 resmi.',
    needs: ['Akun Google yang sudah punya channel YouTube.', 'Project Google Cloud (gratis).'],
    helper: 'oauth',
    steps: [
      {
        title: 'Bikin project & aktifkan API',
        html: `Buka ${link('https://console.cloud.google.com/projectcreate', 'Google Cloud Console')} → buat project baru.
          Lalu buka ${link('https://console.cloud.google.com/apis/library/youtube.googleapis.com', 'YouTube Data API v3')} dan klik <b>Enable</b>.`,
      },
      {
        title: 'Atur OAuth consent screen',
        html: `Buka ${link('https://console.cloud.google.com/auth/overview', 'Google Auth Platform')} (OAuth consent screen). Isi nama app & email, pilih Audience <b>External</b>.
          Di <b>Data Access</b>, tambahkan scope <code>.../auth/youtube.upload</code> dan <code>.../auth/youtube.readonly</code>.`,
      },
      {
        title: 'PENTING: ubah status ke "In production"',
        html: `Di <b>Audience</b>, klik <b>Publish app</b>. Kalau status tetap <b>Testing</b>, Google bikin refresh token-nya <b>mati setelah 7 hari</b>.
          Nanti waktu login muncul peringatan "Google hasn't verified this app". Itu wajar untuk app pribadi: klik <b>Advanced → Go to (nama app)</b>.`,
      },
      {
        title: 'Bikin OAuth Client ID',
        html: `Buka ${link('https://console.cloud.google.com/auth/clients', 'Clients')} → <b>Create client</b> → Application type <b>Web application</b>.
          Di <b>Authorized redirect URIs</b> tempel persis: <code class="copy">{{REDIRECT_URI}}</code>
          Klik Create, lalu salin <b>Client ID</b> dan <b>Client secret</b> ke form "Isi data akun".`,
      },
      {
        title: 'Hubungkan',
        html: 'Klik <b>Hubungkan dengan Google</b>. Login, pilih akun/channel, lalu izinkan semua. Kamu balik ke TIM-AI dan refresh token terisi otomatis, terus langsung dicek.',
      },
    ],
    fieldMap: [
      ['OAuth Client ID', 'Dari langkah 4'],
      ['OAuth Client Secret', 'Dari langkah 4'],
      ['Refresh Token', 'Terisi otomatis setelah Hubungkan'],
      ['Privasi', 'private, unlisted, atau public (kosong = private)'],
    ],
    tokenLife: 'Access token cuma ±1 jam, tapi TIM-AI memperbaruinya sendiri tiap posting. Refresh token tidak punya tanggal kedaluwarsa, <b>kecuali</b>: status consent screen masih Testing (mati 7 hari), tidak dipakai 6 bulan, aksesnya kamu cabut, atau sudah lebih dari 100 refresh token untuk client yang sama.',
  },

  tiktok: {
    intro: 'Posting video ke <b>TikTok</b> lewat Content Posting API resmi (Direct Post).',
    needs: [
      'Akun TikTok, plus akun di TikTok for Developers (login pakai TikTok).',
      'TIM-AI versi <b>online</b> (https). TikTok menolak alamat localhost.',
    ],
    helper: 'oauth',
    steps: [
      {
        title: 'Bikin app',
        html: `Buka ${link('https://developers.tiktok.com/apps', 'developers.tiktok.com/apps')} → <b>Connect an app</b> (pilih individu atau organisasi).`,
      },
      {
        title: 'Pakai Sandbox dulu (tanpa review)',
        html: `Buat <b>Sandbox</b> di app itu, lalu tambahkan akun TikTok kamu sebagai <b>Target user</b>. Sandbox bisa dipakai tanpa review TikTok. ${link('https://developers.tiktok.com/doc/add-a-sandbox', 'Panduan Sandbox')}`,
      },
      {
        title: 'Tambah produk & izin',
        html: 'Di <b>Products</b>, tambahkan <b>Login Kit</b> dan <b>Content Posting API</b>, lalu nyalakan <b>Direct Post</b>. Di <b>Scopes</b>, pastikan ada <code>user.info.basic</code> dan <code>video.publish</code>.',
      },
      {
        title: 'Daftarkan Redirect URI',
        html: 'Di <b>Login Kit → Redirect URI (Web)</b>, tempel persis: <code class="copy">{{REDIRECT_URI}}</code>',
      },
      {
        title: 'Salin Client key & secret',
        html: 'Ambil <b>Client key</b> dan <b>Client secret</b> dari halaman app/sandbox, lalu tempel di form "Isi data akun".',
      },
      {
        title: 'Hubungkan',
        html: 'Klik <b>Hubungkan dengan TikTok</b>, login, lalu izinkan. Refresh token terisi otomatis dan langsung dicek.',
      },
      {
        title: 'Biar postingan bisa publik',
        html: 'Sebelum app lolos <b>audit</b> TikTok, semua postingan otomatis <b>private (SELF_ONLY)</b>. Kalau udah siap, ajukan audit/App Review dari developer portal.',
      },
    ],
    fieldMap: [
      ['Client key', 'Dari langkah 5'],
      ['Client secret', 'Dari langkah 5'],
      ['Refresh token', 'Terisi otomatis setelah Hubungkan'],
      ['Privasi', 'Kosong = SELF_ONLY. "Cek token" menampilkan pilihan yang tersedia untuk akunmu.'],
    ],
    tokenLife: 'Access token TikTok cuma <b>24 jam</b>, tapi TIM-AI memperbaruinya otomatis. Refresh token berlaku <b>365 hari</b> dan bisa berganti; yang baru disimpan otomatis. Setelah setahun, klik Hubungkan lagi.',
  },
};
