// Integrasi Cepat: sambungkan akun brand tanpa copy-paste token.
// - Login sekali klik (OAuth resmi) atau kirim QR/link ke pemilik akun → scan di HP → login → Izinkan → akun masuk.
// - MCP: satu URL untuk di-copas ke Claude / ChatGPT supaya bisa membaca laporan semua tim.
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel) => document.querySelector(sel);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ICON = { facebook: '📘', meta_ads: '📣', youtube: '▶️', tiktok: '🎵' };
const NOTE = {
  facebook: 'Semua Facebook Page yang dicentang + Instagram bisnis yang tertaut langsung masuk ke Akun Sosmed brand ini.',
  meta_ads: 'Semua akun iklan Meta milik akun itu masuk ke Tim ADV (brand ini), angka hariannya ditarik otomatis tiap 6 jam.',
  youtube: 'Channel YouTube masuk ke Akun Sosmed (posting + statistik).',
  tiktok: 'Akun TikTok masuk ke Akun Sosmed (posting + video akun sendiri di Scraper).',
};
// Langkah pasang app untuk orang awam: satu kalimat = satu klik. {URI} diganti tombol salin Redirect URI.
const APP_INFO = {
  meta: {
    label: 'Meta (Facebook, Instagram, Meta Ads)', idLabel: 'App ID', link: 'https://developers.facebook.com/apps', time: '± 10 menit',
    steps: [
      'Klik <b>Buka Meta</b> di bawah, login pakai akun Facebook bisnis kamu, lalu klik <b>Create App</b>.',
      'Pilih <b>Other</b> → tipe <b>Business</b> → isi nama app (mis. "TIM-AI Brand Kamu") → <b>Create app</b>.',
      'Di dashboard app, cari <b>Facebook Login for Business</b> → <b>Set up</b> → <b>Settings</b>. Tempel alamat ini di kolom <b>Valid OAuth Redirect URIs</b>, lalu <b>Save</b>: {URI}',
      'Buka <b>App settings → Basic</b>. Salin <b>App ID</b>, klik <b>Show</b> di App Secret lalu salin juga. Tempel keduanya di bawah dan klik <b>Cek &amp; simpan</b>.',
      '<b>Biar langsung bisa dipakai tanpa nunggu review Meta:</b> buka <b>App roles → Roles → Add People</b>, tambahkan akun Facebook pemilik Page sebagai <b>Tester</b>. Orangnya terima undangan di developers.facebook.com/requests.',
    ],
  },
  google: {
    label: 'Google (YouTube)', idLabel: 'Client ID', link: 'https://console.cloud.google.com/apis/credentials', time: '± 10 menit',
    steps: [
      'Klik <b>Buka Google Cloud</b> di bawah, login pakai akun Google, lalu buat <b>project baru</b> (nama bebas).',
      'Menu <b>APIs &amp; Services → Library</b> → cari <b>YouTube Data API v3</b> → <b>Enable</b>.',
      'Menu <b>OAuth consent screen</b> → pilih <b>External</b> → isi nama app &amp; email → simpan → klik <b>Publish app</b> sampai statusnya <b>In production</b>.',
      'Menu <b>Credentials → Create credentials → OAuth client ID</b> → tipe <b>Web application</b>. Di <b>Authorized redirect URIs</b> tempel alamat ini, lalu <b>Create</b>: {URI}',
      'Salin <b>Client ID</b> dan <b>Client Secret</b>, tempel di bawah, klik <b>Cek &amp; simpan</b>. Nanti kalau muncul layar "Google belum memverifikasi app ini" saat login, itu aman: klik <b>Advanced → Go to …</b>.',
    ],
  },
  tiktok: {
    label: 'TikTok', idLabel: 'Client key', link: 'https://developers.tiktok.com/apps', time: '± 15 menit',
    steps: [
      'Klik <b>Buka TikTok Developers</b> di bawah, login, lalu <b>Manage apps → Connect an app</b>.',
      'Isi info app, lalu tambahkan produk <b>Login Kit</b> dan <b>Content Posting API</b>.',
      'Di pengaturan <b>Login Kit</b>, tempel alamat ini di <b>Redirect URI</b>: {URI}',
      'Buka <b>Credentials</b>, salin <b>Client Key</b> dan <b>Client Secret</b>, tempel di bawah, klik <b>Cek &amp; simpan</b>.',
      'Kirim app untuk review TikTok. Sambil menunggu, pakai tab <b>Sandbox</b>: tambahkan akun TikTok kamu di <b>Target users</b>. Sebelum lolos review, video yang diposting dari TIM-AI tampil sebagai privat.',
    ],
  },
};
const OPEN_LABEL = { meta: 'Buka Meta', google: 'Buka Google Cloud', tiktok: 'Buka TikTok Developers' };
let info = null;

function loadQr() {
  if (window.qrcode) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.onload = res;
    s.onerror = () => rej(new Error('Gagal memuat pembuat QR'));
    document.head.appendChild(s);
  });
}

async function draw() {
  info = await api('/api/integrations');
  const brand = state.brands.find((b) => b.id === state.brandId)?.name || '';
  const ready = (app) => info.apps[app]?.configured;
  $('#view-integrations').innerHTML = `
  <div class="page-head"><div><h1>Integrasi Cepat</h1>
    <p class="hint">Sambungkan akun brand tanpa copy-paste token: login resmi sekali klik, atau kirim <b>QR / link</b> ke pemilik akun (klien, owner brand, admin toko). Mereka scan di HP, login, klik <b>Izinkan</b>, beres.</p></div></div>
  <div class="card">
    <div class="row-between"><div class="label">Hubungkan akun untuk brand <b>${esc(brand)}</b></div><span class="hint">Ganti brand di pojok kiri atas</span></div>
    <div class="int-grid">${Object.entries(info.targets).map(([k, t]) => `<div class="int-card ${ready(t.app) ? '' : 'off'}">
      <div class="int-ic">${ICON[k]}</div><b>${esc(t.label)}</b><p class="hint">${NOTE[k]}</p>
      ${ready(t.app) ? `<div class="btn-row left"><button class="primary small" data-int-login="${k}">Login sekarang</button><button class="ghost small" data-int-qr="${k}">QR / link ke pemilik akun</button></div>`
        : `<p class="hint">⏳ ${info.canManage ? 'Pasang app-nya sekali di bagian <b>Pasang sekali</b> di bawah.' : 'Minta pemilik/admin memasang app-nya di menu ini.'}</p>`}
    </div>`).join('')}</div>
  </div>

  <div class="card">
    <div class="label">🔌 MCP — pakai data TIM-AI langsung di Claude / ChatGPT</div>
    <p class="hint">Tinggal copas satu URL. Setelah itu kamu bisa tanya di Claude/ChatGPT: <i>"Ambil laporan Tim ADV 30 hari dan bandingkan ROAS per brand"</i>. Akses hanya baca laporan.</p>
    ${info.canManage ? (info.mcp.url
      ? `<div class="copy-row"><code class="copy" title="Klik untuk salin">${esc(info.mcp.url)}</code></div>
         <ol class="steps"><li><b>Claude</b> (claude.ai / desktop): Settings → Connectors → <b>Add custom connector</b> → tempel URL → Add.</li>
         <li><b>ChatGPT</b>: Settings → Apps &amp; Connectors → Advanced → Developer mode → <b>Create</b> → tempel URL (Authentication: none).</li>
         <li><b>Klien MCP lain</b> (Cursor, Claude Code, dll): tambahkan server HTTP dengan URL ini.</li></ol>
         <p class="hint">URL ini rahasia, perlakukan seperti password. Bocor? Klik <b>Buat URL baru</b> (URL lama langsung mati).</p>
         <div class="btn-row left"><button class="ghost small" data-int-mcp="new">Buat URL baru</button><button class="danger small" data-int-mcp="off">Matikan MCP</button></div>`
      : '<button class="primary small" data-int-mcp="new">Aktifkan MCP &amp; buat URL</button>')
      : `<p class="hint">${info.mcp.enabled ? 'MCP sudah aktif. Minta URL-nya ke pemilik/admin.' : 'Minta pemilik/admin mengaktifkan MCP.'}</p>`}
  </div>

  ${info.canManage ? `<div class="card"><div class="label">⚙️ Pasang sekali (pemilik/admin)</div>
    <p class="hint">Supaya tombol <b>Login sekarang</b> di atas bisa dipakai, tiap platform perlu satu "app" milik bisnis kamu. Ini <b>cukup sekali</b>, ikuti langkahnya pelan-pelan. Setelah itu semua brand &amp; anggota tim tinggal klik Login atau kirim QR.</p>
    ${Object.entries(APP_INFO).map(([k, a]) => `<details class="manual" ${info.apps[k].configured ? '' : 'open'}><summary>${info.apps[k].configured ? '✅' : '⬜'} ${a.label} <span class="hint">· ${info.apps[k].configured ? 'sudah terpasang' : a.time}</span></summary>
      <ol class="steps">${a.steps.map((st) => `<li>${st.replace('{URI}', `<div class="copy-row"><code class="copy" title="Klik untuk salin">${esc(info.callbacks[k])}</code></div>`)}</li>`).join('')}</ol>
      <div class="btn-row left"><a class="btn small" href="${a.link}" target="_blank" rel="noopener">${OPEN_LABEL[k]} ↗</a></div>
      <form class="form-grid" data-int-app="${k}"><div><label class="label">${a.idLabel}</label><input name="app_id" value="${esc(info.apps[k].id)}" autocomplete="off" data-lpignore="true"></div>
      <div><label class="label">Secret</label><input name="app_secret" type="password" autocomplete="new-password" data-lpignore="true" placeholder="${info.apps[k].configured ? 'tersimpan — isi untuk mengganti' : ''}"></div>
      <div class="btn-row left"><button class="primary small">Cek &amp; simpan</button></div><div class="hint" data-int-result="${k}"></div></form></details>`).join('')}
  </div>` : ''}

  <div class="card"><div class="label">Platform tanpa login publik</div>
    <ul class="hint int-list">
      <li><b>Shopee, TikTok Shop/Tokopedia, Lazada (chat & pesanan)</b>: menu <button class="link" data-goto="inbox">Inbox</button> → Pengaturan → Channel → <b>Hubungkan toko</b>. Pemilik toko login di halaman resmi Seller Center (email, password, OTP seperti biasa) lalu klik Izinkan. TIM-AI <b>tidak pernah</b> menyimpan password toko. Syaratnya, admin memasang app partner marketplace sekali (panduannya ada di halaman Channel). Sebelum app partner disetujui, pakai <b>Impor CSV</b> di menu <button class="link" data-goto="mp">Tim MP</button>.</li>
      <li><b>Iklan marketplace & TikTok/Google Ads</b>: menu <button class="link" data-goto="mp">Tim MP</button> / <button class="link" data-goto="adv">Tim ADV</button> → Impor CSV hasil export dashboard iklan (kolom dikenali otomatis).</li>
      <li><b>WhatsApp Business</b>: Inbox → Channel → WhatsApp (Meta Cloud API). Login via QR WhatsApp Web tidak dipakai karena melanggar ketentuan WhatsApp dan nomor bisa diblokir.</li>
    </ul></div>`;
}

async function qrModal(platform) {
  const link = await api('/api/connect/links', json('POST', { platform }));
  await loadQr().catch(() => {});
  let svg = '';
  if (window.qrcode) {
    const q = window.qrcode(0, 'M');
    q.addData(link.url);
    q.make();
    svg = q.createSvgTag(6, 2);
  }
  const wa = `https://wa.me/?text=${encodeURIComponent(`Halo, untuk menyambungkan ${link.label} brand ${link.brand} ke TIM-AI, buka link ini lalu login & klik Izinkan (berlaku 24 jam): ${link.url}`)}`;
  openModal(`<h3>Scan untuk menyambungkan ${esc(link.label)}</h3>
    <p class="hint center">Brand: <b>${esc(link.brand)}</b> · berlaku 24 jam · sekali pakai</p>
    <div class="qr-box">${svg || '<p class="error">QR tidak bisa dibuat, pakai link di bawah.</p>'}</div>
    <div class="copy-row"><code class="copy">${esc(link.url)}</code></div>
    <div class="btn-row center"><a class="btn small" href="${esc(wa)}" target="_blank" rel="noopener">Kirim via WhatsApp</a><button class="ghost small" data-copy-link>Salin link</button></div>
    <div id="qr-status" class="hint center">Menunggu pemilik akun login…</div>
    <div class="modal-actions"><button class="primary" data-close>Tutup</button></div>`);
  document.querySelector('[data-copy-link]').addEventListener('click', () => navigator.clipboard?.writeText(link.url).then(() => toast('Link disalin')));
  const box = $('#modal-box');
  const timer = setInterval(async () => {
    if (!box.contains(document.getElementById('qr-status')) || $('#modal').hidden) return clearInterval(timer);
    try {
      const r = await api(`/api/connect/links/${link.token}`);
      if (r.done) {
        clearInterval(timer);
        $('#qr-status').innerHTML = `<div class="check ok">✓ Tersambung:<br>${(r.result.items || []).map(esc).join('<br>')}</div>`;
        toast('Akun tersambung');
      } else if (r.expired) {
        clearInterval(timer);
        $('#qr-status').textContent = 'Link kedaluwarsa. Buat QR baru.';
      }
    } catch { clearInterval(timer); }
  }, 3000);
}

function bind() {
  const root = $('#view-integrations');
  root.addEventListener('click', async (e) => {
    const d = e.target.dataset;
    try {
      if (d.intLogin) {
        const link = await api('/api/connect/links', json('POST', { platform: d.intLogin }));
        window.open(link.url, '_blank', 'noopener');
        toast('Login di tab baru. Setelah selesai, akun muncul di Akun Sosmed / Tim ADV.');
      }
      if (d.intQr) await qrModal(d.intQr);
      if (d.intMcp) {
        if (d.intMcp === 'off' && !confirm('Matikan MCP? Claude/ChatGPT yang tersambung tidak bisa membaca data lagi.')) return;
        if (d.intMcp === 'new' && info.mcp.url && !confirm('Buat URL baru? URL lama langsung tidak berlaku.')) return;
        await api('/api/integrations/mcp', json('POST', { enable: d.intMcp !== 'off' }));
        await draw();
      }
    } catch (ex) { toast(ex.message); }
  });
  root.addEventListener('submit', async (e) => {
    const app = e.target.dataset.intApp;
    if (!app) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    const out = root.querySelector(`[data-int-result="${app}"]`);
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    out.textContent = 'Mengecek ke platform…';
    try {
      const r = await api('/api/integrations/apps', json('PUT', { app, id: v.app_id, secret: v.app_secret }));
      toast(r.name ? `Benar ✓ App "${r.name}" tersimpan` : 'Benar ✓ Tersimpan');
      draw();
    } catch (ex) {
      out.innerHTML = `<span class="error">⚠️ ${esc(ex.message)}</span>`;
      btn.disabled = false;
    }
  });
}

bind();
S.viewHooks.integrations = () => draw().catch((ex) => toast(ex.message));
