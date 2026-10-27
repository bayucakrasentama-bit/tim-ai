// Bantuan menyambungkan akun tanpa copy-paste token manual:
// - YouTube & TikTok: tombol "Hubungkan" (OAuth), refresh token langsung didapat.
// - Facebook & Instagram: tukar token pendek dari Graph API Explorer jadi Page token yang tidak kedaluwarsa.
import crypto from 'node:crypto';
import { GRAPH_VERSION, bases, readJson } from './connectors/http.js';
import { now } from './db.js';

export const PROVIDERS = {
  youtube: {
    authUrl: ({ clientId, redirectUri, state }) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      access_type: 'offline',
      prompt: 'consent', // supaya Google selalu memberi refresh token
      include_granted_scopes: 'true',
      state,
    })}`,
    async exchange({ code, clientId, clientSecret, redirectUri }) {
      const res = await fetch(`${bases.googleOAuth()}/token`, {
        method: 'POST',
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      });
      const body = await readJson(res, 'Google');
      if (!body.refresh_token) {
        throw new Error('Google tidak memberi refresh token. Cabut akses app ini di myaccount.google.com/permissions, lalu klik Hubungkan lagi.');
      }
      return { clientId, clientSecret, refreshToken: body.refresh_token };
    },
  },
  tiktok: {
    httpsOnly: true,
    authUrl: ({ clientId, redirectUri, state }) => `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
      client_key: clientId,
      response_type: 'code',
      // video.list: buat Scraper TikTok (statistik video akun sendiri lewat API resmi).
      scope: 'user.info.basic,video.publish,video.list',
      redirect_uri: redirectUri,
      state,
    })}`,
    async exchange({ code, clientId, clientSecret, redirectUri }) {
      const res = await fetch(`${bases.tiktok()}/v2/oauth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_key: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
      });
      const body = await readJson(res, 'TikTok');
      if (!body.refresh_token) throw new Error(`TikTok: ${body.error_description || body.error || 'tidak ada refresh token'}`);
      return { clientKey: clientId, clientSecret, refreshToken: body.refresh_token };
    },
  },
};

const origin = (req) => `${req.protocol}://${req.get('host')}`;

export function oauthRoutes(app, db) {
  app.post('/api/oauth/:platform/start', async (req, res) => {
    const provider = PROVIDERS[req.params.platform];
    if (!provider) return res.status(404).json({ error: 'Platform ini tidak pakai tombol Hubungkan' });
    const clientId = String(req.body?.clientId || '').trim();
    const clientSecret = String(req.body?.clientSecret || '').trim();
    if (!clientId || !clientSecret) return res.status(400).json({ error: 'Isi Client ID/key dan Client secret dulu' });
    const redirectUri = `${origin(req)}/api/oauth/${req.params.platform}/callback`;
    if (provider.httpsOnly && !redirectUri.startsWith('https://')) {
      return res.status(400).json({ error: 'TikTok cuma menerima alamat https. Hubungkan TikTok dari versi online TIM-AI (bukan localhost).' });
    }
    // Sesi lama (lebih dari 1 jam) dibuang.
    await db.run('DELETE FROM oauth_sessions WHERE created_at < ?', new Date(Date.now() - 3600e3).toISOString());
    const state = crypto.randomBytes(24).toString('hex');
    await db.run(
      'INSERT INTO oauth_sessions (state, platform, client_id, client_secret, redirect_uri, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      state, req.params.platform, clientId, clientSecret, redirectUri, now(),
    );
    res.json({ authUrl: provider.authUrl({ clientId, redirectUri, state }), redirectUri });
  });

  app.get('/api/oauth/:platform/callback', async (req, res) => {
    const state = String(req.query.state || '');
    const s = await db.get('SELECT * FROM oauth_sessions WHERE state = ? AND platform = ?', state, req.params.platform);
    if (!s) return res.status(400).send('Sesi login tidak ditemukan atau sudah kedaluwarsa. Tutup halaman ini dan klik Hubungkan lagi dari TIM-AI.');
    let result = null;
    let error = null;
    if (req.query.error) {
      error = `Izin ditolak atau dibatalkan (${req.query.error_description || req.query.error}).`;
    } else {
      try {
        result = await PROVIDERS[s.platform].exchange({
          code: String(req.query.code || ''), clientId: s.client_id, clientSecret: s.client_secret, redirectUri: s.redirect_uri,
        });
      } catch (err) {
        error = err.message;
      }
    }
    await db.run('UPDATE oauth_sessions SET result = ?, error = ? WHERE state = ?', result ? JSON.stringify(result) : null, error, state);
    res.redirect(`/?oauth=${state}`);
  });

  // Hasil diambil sekali oleh halaman Akun, lalu sesinya (berikut client secret-nya) dihapus.
  app.get('/api/oauth/result/:state', async (req, res) => {
    const s = await db.get('SELECT * FROM oauth_sessions WHERE state = ?', req.params.state);
    if (!s) return res.status(404).json({ error: 'Hasil login tidak ditemukan' });
    await db.run('DELETE FROM oauth_sessions WHERE state = ?', s.state);
    res.json({ platform: s.platform, credentials: s.result ? JSON.parse(s.result) : null, error: s.error });
  });

  // Meta: token pendek (1-2 jam) -> user token 60 hari -> Page token tanpa tanggal kedaluwarsa.
  app.post('/api/meta/pages', async (req, res) => {
    const { appId, appSecret, userToken } = Object.fromEntries(
      ['appId', 'appSecret', 'userToken'].map((k) => [k, String(req.body?.[k] || '').trim()]),
    );
    if (!appId || !appSecret || !userToken) return res.status(400).json({ error: 'Isi App ID, App Secret, dan token dari Graph API Explorer' });
    const graph = `${bases.graph()}/${GRAPH_VERSION}`;
    try {
      const long = await readJson(await fetch(`${graph}/oauth/access_token?${new URLSearchParams({
        grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: userToken,
      })}`), 'Meta (tukar token)');
      const pages = await readJson(await fetch(`${graph}/me/accounts?${new URLSearchParams({
        fields: 'id,name,access_token,tasks,instagram_business_account{id,username}',
        limit: '100',
        access_token: long.access_token,
      })}`), 'Meta (daftar Page)');
      res.json({
        pages: (pages.data || []).map((p) => ({
          id: p.id,
          name: p.name,
          accessToken: p.access_token,
          canPost: !p.tasks || p.tasks.includes('CREATE_CONTENT'),
          instagram: p.instagram_business_account || null,
        })),
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}
