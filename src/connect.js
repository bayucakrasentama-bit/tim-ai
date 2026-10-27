// Integrasi Cepat:
// 1) Pemilik memasang App ID & secret tiap platform SEKALI (Meta, Google/YouTube, TikTok).
// 2) Siapa pun di tim cukup bikin link/QR "Hubungkan akun" untuk sebuah brand. Pemilik akun (bisa klien brand)
//    scan QR atau buka link di HP-nya, login di halaman resmi Facebook/Google/TikTok, klik Izinkan → akun langsung masuk.
//    Tanpa copy-paste token. Facebook sekaligus menyambungkan semua Page + Instagram bisnis yang tertaut, Meta Ads
//    menyambungkan semua akun iklan ke Tim ADV.
// 3) MCP: satu URL rahasia yang tinggal di-copas ke Claude / ChatGPT / klien MCP lain untuk membaca laporan semua tim.
import crypto from 'node:crypto';
import { GRAPH_VERSION, bases, readJson } from './connectors/http.js';
import { PROVIDERS } from './oauth.js';
import { checkCredentials } from './checks.js';
import { getSetting, setSetting, now } from './db.js';
import { canManage, OWNER } from './auth.js';
import { teamReport, REPORT_TEAMS } from './reports.js';

const APPS_KEY = 'integration_apps';
const MCP_KEY = 'mcp_key';
const LINK_TTL = 24 * 3600e3;
// platform yang bisa dihubungkan -> app yang dipakai
const TARGETS = {
  facebook: { app: 'meta', label: 'Facebook Page + Instagram bisnis' },
  meta_ads: { app: 'meta', label: 'Meta Ads (akun iklan, untuk Tim ADV)' },
  youtube: { app: 'google', label: 'YouTube' },
  tiktok: { app: 'tiktok', label: 'TikTok' },
};
const META_SCOPES = {
  facebook: 'pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,instagram_basic,instagram_content_publish,instagram_manage_insights,business_management',
  meta_ads: 'ads_read,business_management',
};

const origin = (req) => `${req.protocol}://${req.get('host')}`;
const callbackUrl = (req, app) => `${origin(req)}/api/connect/callback/${app}`;
const apps = async (db) => JSON.parse((await getSetting(db, APPS_KEY)) || '{}');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, body, ok = true) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · TIM-AI</title><link rel="icon" href="/logo.svg">
<style>body{font-family:Inter,system-ui,sans-serif;background:#0b0d14;color:#e6e8ef;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}
.box{max-width:440px;background:#12151f;border:1px solid #232838;border-radius:16px;padding:28px;text-align:center}
.ic{font-size:44px}h1{font-size:20px;margin:10px 0}p,li{color:#a3aac0;line-height:1.5}ul{text-align:left}img{width:48px;height:48px}</style></head>
<body><div class="box"><img src="/logo.svg" alt="TIM-AI"><div class="ic">${ok ? '✅' : '⚠️'}</div><h1>${esc(title)}</h1>${body}</div></body></html>`;
}

async function upsertAccount(db, brandId, platform, name, creds, key) {
  const existing = await db.get('SELECT id FROM accounts WHERE brand_id = ? AND platform = ? AND credentials LIKE ?',
    brandId, platform, `%${JSON.stringify({ [key]: creds[key] }).slice(1, -1)}%`);
  if (existing) {
    await db.run('UPDATE accounts SET credentials = ?, name = ? WHERE id = ?', JSON.stringify(creds), name, existing.id);
    return `${name} (diperbarui)`;
  }
  await db.run('INSERT INTO accounts (platform, name, credentials, created_at, brand_id) VALUES (?, ?, ?, ?, ?)', platform, name, JSON.stringify(creds), now(), brandId);
  return name;
}

// Cek App ID & secret langsung ke platformnya sebelum disimpan, supaya salah ketik ketahuan saat itu juga
// (bukan baru ketahuan waktu klien mencoba login). Kembalikan nama app kalau ada.
async function verifyApp(key, id, secret, redirectUri) {
  if (key === 'meta') {
    const graph = `${bases.graph()}/${GRAPH_VERSION}`;
    const res = await fetch(`${graph}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' })}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new Error('App ID atau App Secret Meta salah. Salin ulang dari developers.facebook.com → app kamu → App settings → Basic (klik "Show" di App Secret).');
    const app = await (await fetch(`${graph}/${encodeURIComponent(id)}?fields=name&access_token=${encodeURIComponent(body.access_token)}`)).json().catch(() => ({}));
    return app.name || null;
  }
  if (key === 'google') {
    if (!/\.apps\.googleusercontent\.com$/.test(id)) throw new Error('Client ID Google biasanya diakhiri ".apps.googleusercontent.com". Salin ulang dari Google Cloud → Credentials → OAuth 2.0 Client IDs.');
    // Kode palsu: Google menjawab "invalid_grant" kalau ID & secret benar, "invalid_client" kalau salah.
    const res = await fetch(`${bases.googleOAuth()}/token`, { method: 'POST', body: new URLSearchParams({ code: 'cek-tim-ai', client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
    const body = await res.json().catch(() => ({}));
    if (body.error === 'invalid_client' || body.error === 'unauthorized_client') throw new Error('Client ID atau Client Secret Google salah. Salin ulang dari Google Cloud → Credentials → klik nama OAuth client-nya.');
    return null;
  }
  if (key === 'tiktok') {
    const res = await fetch(`${bases.tiktok()}/v2/oauth/token/`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: id, client_secret: secret, grant_type: 'client_credentials' }),
    });
    const body = await res.json().catch(() => ({}));
    if (!body.access_token) throw new Error('Client Key atau Client Secret TikTok salah. Salin ulang dari developers.tiktok.com → Manage apps → app kamu → Credentials.');
    return null;
  }
  return null;
}

// Pesan error teknis dari Meta/Google/TikTok -> bahasa awam + apa yang harus dilakukan.
function friendlyError(msg, platform) {
  const m = String(msg || '');
  if (/redirect_uri|redirect uri|URL Blocked|domain of this URL/i.test(m)) return 'Alamat "Redirect URI" belum didaftarkan di app developer. Minta admin TIM-AI menyalin Redirect URI dari menu Integrasi Cepat ke pengaturan app-nya.';
  if (/not active|development mode|isn't available|app not set up|not been approved|App not active/i.test(m)) return 'App TIM-AI masih mode uji coba. Minta admin menambahkan akun Facebook kamu sebagai Tester/Admin di app-nya (App roles → Roles), lalu coba lagi.';
  if (/access_denied|user denied|permissions error|did not grant/i.test(m)) return 'Izinnya belum diberikan. Ulangi, lalu klik Lanjutkan/Izinkan dan centang semua Page/akun yang mau disambungkan.';
  if (/invalid_client|client secret|Error validating client secret/i.test(m)) return 'App ID / secret yang tersimpan sudah tidak cocok. Minta admin mengecek ulang di menu Integrasi Cepat → Pasang sekali.';
  if (/expired|invalid_grant|code has been used|authorization code/i.test(m)) return 'Sesi login kedaluwarsa. Buka link lagi dan ulangi dari awal (jangan tekan tombol Back).';
  if (/scope|permission/i.test(m) && platform === 'tiktok') return 'Izin TikTok belum aktif di app. Minta admin menambahkan Login Kit & Content Posting API di developers.tiktok.com.';
  return m;
}

async function connectMeta(db, link, code, redirectUri, app) {
  const graph = `${bases.graph()}/${GRAPH_VERSION}`;
  const short = await readJson(await fetch(`${graph}/oauth/access_token?${new URLSearchParams({
    client_id: app.id, client_secret: app.secret, redirect_uri: redirectUri, code,
  })}`), 'Meta (login)');
  const long = await readJson(await fetch(`${graph}/oauth/access_token?${new URLSearchParams({
    grant_type: 'fb_exchange_token', client_id: app.id, client_secret: app.secret, fb_exchange_token: short.access_token,
  })}`), 'Meta (token panjang)');
  const done = [];
  if (link.platform === 'meta_ads') {
    const list = await readJson(await fetch(`${graph}/me/adaccounts?${new URLSearchParams({ fields: 'account_id,name,account_status', limit: '200', access_token: long.access_token })}`), 'Meta (akun iklan)');
    for (const a of list.data || []) {
      const ext = `act_${a.account_id}`;
      const creds = JSON.stringify({ accessToken: long.access_token });
      const ex = await db.get("SELECT id FROM ad_accounts WHERE brand_id = ? AND team = 'adv' AND external_id = ?", link.brand_id, ext);
      if (ex) await db.run('UPDATE ad_accounts SET credentials = ?, name = ?, error = NULL WHERE id = ?', creds, a.name || ext, ex.id);
      else await db.run("INSERT INTO ad_accounts (brand_id, team, platform, name, external_id, credentials, created_by, created_at) VALUES (?, 'adv', 'meta', ?, ?, ?, ?, ?)",
        link.brand_id, a.name || ext, ext, creds, link.created_by, now());
      done.push(`Akun iklan ${a.name || ext}`);
    }
    if (!done.length) throw new Error('Tidak ada akun iklan yang bisa diakses akun Facebook ini.');
    return done;
  }
  const pages = await readJson(await fetch(`${graph}/me/accounts?${new URLSearchParams({
    fields: 'id,name,access_token,tasks,instagram_business_account{id,username}', limit: '100', access_token: long.access_token,
  })}`), 'Meta (daftar Page)');
  for (const p of pages.data || []) {
    done.push(`Facebook: ${await upsertAccount(db, link.brand_id, 'facebook', p.name, { pageId: p.id, accessToken: p.access_token }, 'pageId')}`);
    const ig = p.instagram_business_account;
    if (ig) done.push(`Instagram: ${await upsertAccount(db, link.brand_id, 'instagram', `@${ig.username || ig.id}`, { igUserId: ig.id, accessToken: p.access_token }, 'igUserId')}`);
  }
  if (!done.length) throw new Error('Tidak ada Facebook Page yang dipilih/diizinkan. Ulangi dan centang Page-nya.');
  return done;
}

async function connectOAuth(db, link, code, redirectUri, app) {
  const creds = await PROVIDERS[link.platform].exchange({ code, clientId: app.id, clientSecret: app.secret, redirectUri });
  const check = await checkCredentials(link.platform, creds).catch(() => null);
  const final = check?.credentials || creds;
  const name = check?.account || (link.platform === 'youtube' ? 'Channel YouTube' : 'Akun TikTok');
  const key = link.platform === 'youtube' ? 'refreshToken' : 'refreshToken';
  return [`${link.platform === 'youtube' ? 'YouTube' : 'TikTok'}: ${await upsertAccount(db, link.brand_id, link.platform, name, final, key)}`];
}

// ---- Rute publik (tanpa login): dibuka dari link/QR, lalu callback dari platform ----
export function connectPublicRoutes(app, db, { ownerUsername = 'admin' } = {}) {
  app.get('/api/connect/go/:token', async (req, res) => {
    const link = await db.get('SELECT * FROM connect_links WHERE token = ?', String(req.params.token));
    if (!link || link.result || new Date(link.expires_at) < new Date()) {
      return res.status(410).type('html').send(page('Link tidak berlaku', '<p>Link ini sudah dipakai atau kedaluwarsa. Minta link/QR baru dari tim TIM-AI.</p>', false));
    }
    const t = TARGETS[link.platform];
    const cfg = (await apps(db))[t.app];
    if (!cfg?.id) return res.status(400).type('html').send(page('Belum siap', '<p>Admin TIM-AI belum memasang app untuk platform ini.</p>', false));
    const redirectUri = callbackUrl(req, t.app);
    if (t.app === 'meta') {
      return res.redirect(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${new URLSearchParams({
        client_id: cfg.id, redirect_uri: redirectUri, state: link.token, response_type: 'code', scope: META_SCOPES[link.platform],
      })}`);
    }
    if (t.app === 'tiktok' && !redirectUri.startsWith('https://')) return res.status(400).send('TikTok butuh https');
    res.redirect(PROVIDERS[link.platform].authUrl({ clientId: cfg.id, redirectUri, state: link.token }));
  });

  app.get('/api/connect/callback/:app', async (req, res) => {
    const link = await db.get('SELECT * FROM connect_links WHERE token = ?', String(req.query.state || ''));
    if (!link || link.result || new Date(link.expires_at) < new Date()) {
      return res.status(410).type('html').send(page('Link tidak berlaku', '<p>Sesi ini sudah dipakai atau kedaluwarsa. Minta link/QR baru.</p>', false));
    }
    if (req.query.error) {
      return res.type('html').send(page('Dibatalkan', `<p>${esc(friendlyError(req.query.error_description || req.query.error, link.platform))}</p><p>Buka link lagi kalau mau mencoba ulang.</p>`, false));
    }
    const t = TARGETS[link.platform];
    const cfg = (await apps(db))[t.app];
    try {
      const done = t.app === 'meta'
        ? await connectMeta(db, link, String(req.query.code || ''), callbackUrl(req, t.app), cfg)
        : await connectOAuth(db, link, String(req.query.code || ''), callbackUrl(req, t.app), cfg);
      await db.run('UPDATE connect_links SET result = ? WHERE token = ?', JSON.stringify({ ok: true, items: done, at: now() }), link.token);
      res.type('html').send(page('Akun tersambung', `<p>Berhasil masuk ke TIM-AI:</p><ul>${done.map((d) => `<li>${esc(d)}</li>`).join('')}</ul><p>Halaman ini boleh ditutup.</p>`));
    } catch (err) {
      res.status(400).type('html').send(page('Gagal menyambungkan', `<p>${esc(friendlyError(err.message, link.platform))}</p><p>Buka link lagi untuk mencoba ulang.</p>`, false));
    }
  });

  // ---- MCP (Streamable HTTP, JSON): POST /api/mcp/<kunci> ----
  const TOOLS = [
    { name: 'list_brands', description: 'Daftar brand/workspace di TIM-AI (id & nama).', inputSchema: { type: 'object', properties: {} } },
    {
      name: 'team_report',
      description: 'Laporan satu tim TIM-AI untuk periode tertentu. Tim: konten, medsos, digital, adv, mp, kol, affiliate, cs. Tim adv, mp, kol & affiliate mencakup semua brand kecuali brand_id diisi.',
      inputSchema: {
        type: 'object',
        properties: {
          team: { type: 'string', enum: REPORT_TEAMS },
          brand_id: { type: 'integer', description: 'Opsional. Kosong = brand pertama (atau semua brand untuk adv/mp).' },
          days: { type: 'integer', description: 'Periode ke belakang dalam hari (default 30, maks 365).' },
        },
        required: ['team'],
      },
    },
  ];
  const owner = { ...OWNER, username: ownerUsername };
  async function callTool(name, args = {}) {
    const brands = await db.all('SELECT id, name, description FROM brands ORDER BY id');
    if (name === 'list_brands') return brands;
    if (name === 'team_report') {
      if (!REPORT_TEAMS.includes(args.team)) throw new Error('team tidak dikenal');
      const brand = brands.find((b) => b.id === Number(args.brand_id)) || brands[0];
      if (!brand) throw new Error('Belum ada brand');
      const days = Math.min(Math.max(Number(args.days) || 30, 1), 365);
      const from = new Date(Date.now() - days * 86400e3).toISOString();
      const req = { user: owner, brand, query: { only: args.brand_id ? String(args.brand_id) : '' } };
      return { team: args.team, brand: ['adv', 'mp', 'kol', 'affiliate'].includes(args.team) && !args.brand_id ? 'semua brand' : brand.name, days, report: await teamReport(db, args.team, req, { from, to: null }, ownerUsername) };
    }
    throw new Error(`Tool tidak dikenal: ${name}`);
  }

  app.all('/api/mcp/:key', async (req, res) => {
    const saved = await getSetting(db, MCP_KEY);
    const given = String(req.params.key || '');
    if (!saved || given.length !== saved.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(saved))) {
      return res.status(401).json({ error: 'Kunci MCP salah atau MCP belum diaktifkan' });
    }
    if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').end();
    const msgs = Array.isArray(req.body) ? req.body : [req.body || {}];
    const out = [];
    for (const m of msgs) {
      if (m.id === undefined || m.id === null) continue; // notifikasi (mis. notifications/initialized)
      const reply = (result) => out.push({ jsonrpc: '2.0', id: m.id, result });
      const fail = (code, message) => out.push({ jsonrpc: '2.0', id: m.id, error: { code, message } });
      try {
        if (m.method === 'initialize') {
          reply({ protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'tim-ai', title: 'TIM-AI', version: '1.0.0' },
            instructions: 'Laporan tim TIM-AI (konten, medsos, digital, adv, mp, cs). Pakai list_brands lalu team_report.' });
        } else if (m.method === 'ping') reply({});
        else if (m.method === 'tools/list') reply({ tools: TOOLS });
        else if (m.method === 'tools/call') {
          try {
            const data = await callTool(m.params?.name, m.params?.arguments || {});
            reply({ content: [{ type: 'text', text: JSON.stringify(data) }] });
          } catch (err) {
            reply({ content: [{ type: 'text', text: err.message }], isError: true });
          }
        } else fail(-32601, `Method tidak didukung: ${m.method}`);
      } catch (err) {
        fail(-32603, err.message);
      }
    }
    if (!out.length) return res.status(202).end();
    res.json(Array.isArray(req.body) ? out : out[0]);
  });
}

// ---- Rute dengan login ----
export function connectRoutes(app, db, scope) {
  const manageOnly = (req, res, next) => (canManage(req.user) ? next() : res.status(403).json({ error: 'Cuma pemilik/admin yang bisa mengatur integrasi' }));

  app.get('/api/integrations', async (req, res) => {
    const a = await apps(db);
    const mcp = canManage(req.user) ? await getSetting(db, MCP_KEY) : null;
    res.json({
      canManage: canManage(req.user),
      targets: TARGETS,
      apps: Object.fromEntries(['meta', 'google', 'tiktok'].map((k) => [k, { configured: !!(a[k]?.id && a[k]?.secret), id: a[k]?.id || '' }])),
      callbacks: { meta: callbackUrl(req, 'meta'), google: callbackUrl(req, 'google'), tiktok: callbackUrl(req, 'tiktok') },
      mcp: { enabled: !!(await getSetting(db, MCP_KEY)), url: mcp ? `${origin(req)}/api/mcp/${mcp}` : null },
    });
  });

  app.put('/api/integrations/apps', manageOnly, async (req, res) => {
    const key = String(req.body?.app || '');
    if (!['meta', 'google', 'tiktok'].includes(key)) return res.status(400).json({ error: 'App tidak dikenal' });
    const a = await apps(db);
    const id = String(req.body?.id || '').trim();
    const secret = String(req.body?.secret || '').trim();
    if (!id) delete a[key];
    else a[key] = { id, secret: secret || a[key]?.secret || '' };
    if (a[key] && !a[key].secret) return res.status(400).json({ error: 'Isi App/Client secret juga' });
    let name = null;
    if (a[key]) {
      try {
        name = await verifyApp(key, a[key].id, a[key].secret, callbackUrl(req, key));
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }
    await setSetting(db, APPS_KEY, JSON.stringify(a));
    res.json({ ok: true, name });
  });

  app.post('/api/connect/links', scope, async (req, res) => {
    const platform = String(req.body?.platform || '');
    const t = TARGETS[platform];
    if (!t) return res.status(400).json({ error: 'Platform tidak dikenal' });
    if (!(await apps(db))[t.app]?.id) return res.status(400).json({ error: 'App untuk platform ini belum dipasang. Minta pemilik/admin mengisi bagian "Pasang sekali" dulu.' });
    await db.run('DELETE FROM connect_links WHERE expires_at < ?', new Date(Date.now() - 7 * 86400e3).toISOString());
    const token = crypto.randomBytes(18).toString('base64url');
    const expires = new Date(Date.now() + LINK_TTL).toISOString();
    await db.run('INSERT INTO connect_links (token, brand_id, platform, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      token, req.brand.id, platform, req.user.username, expires, now());
    res.status(201).json({ token, url: `${origin(req)}/api/connect/go/${token}`, expires_at: expires, label: t.label, brand: req.brand.name });
  });

  app.get('/api/connect/links/:token', scope, async (req, res) => {
    const link = await db.get('SELECT * FROM connect_links WHERE token = ? AND brand_id = ?', String(req.params.token), req.brand.id);
    if (!link) return res.status(404).json({ error: 'Link tidak ditemukan' });
    res.json({ done: !!link.result, result: link.result ? JSON.parse(link.result) : null, expired: new Date(link.expires_at) < new Date() });
  });

  app.post('/api/integrations/mcp', manageOnly, async (req, res) => {
    if (req.body?.enable === false) {
      await db.run('DELETE FROM settings WHERE key = ?', MCP_KEY);
      return res.json({ enabled: false, url: null });
    }
    const key = crypto.randomBytes(24).toString('base64url');
    await setSetting(db, MCP_KEY, key);
    res.json({ enabled: true, url: `${origin(req)}/api/mcp/${key}` });
  });
}
