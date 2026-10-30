// Masuk dengan Google: tiap anggota login pakai akun Google-nya sendiri, dicocokkan ke email yang diisi admin di menu Tim.
// Email yang sama dipakai tombol Gemini (gemini.google.com, AI Studio) supaya langsung terbuka di akun Google orang itu.
// Cukup Client ID (bukan rahasia) dari Google Cloud Console: env GOOGLE_CLIENT_ID atau diisi pemilik di Pengaturan.
// Alur: Google mengembalikan id_token di fragment URL /login.html -> halaman login mengirimnya ke /api/auth/google/token
// -> server memeriksa token lewat endpoint tokeninfo Google (tanda tangan, aud, nonce, email terverifikasi).
import crypto from 'node:crypto';
import { getSetting, setSetting } from './db.js';

const KEY = 'google_login';
const STATE_COOKIE = 'timai_gstate';

const cleanEmail = (s) => String(s ?? '').trim().toLowerCase();
export const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function loadConfig(db) {
  const saved = JSON.parse((await getSetting(db, KEY)) || '{}');
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || saved.client_id || '',
    ownerEmail: cleanEmail(process.env.OWNER_EMAIL || saved.owner_email),
    fromEnv: !!process.env.GOOGLE_CLIENT_ID,
  };
}
export const ownerEmail = async (db) => (await loadConfig(db)).ownerEmail;

const origin = (req) => `${req.protocol}://${req.get('host')}`;
const redirectUri = (req) => `${origin(req)}/login.html`;
const back = (res, error) => res.redirect(`/login.html?error=${encodeURIComponent(error)}`);

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// Rute publik (dipasang sebelum cek login).
export function googleLoginRoutes(app, db, auth) {
  app.get('/api/auth/google/config', async (_req, res) => {
    const c = await loadConfig(db);
    res.json({ enabled: auth.enabled && !!c.clientId });
  });

  app.get('/api/auth/google', async (req, res) => {
    const c = await loadConfig(db);
    if (!auth.enabled || !c.clientId) return back(res, 'Login Google belum diaktifkan pemilik.');
    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    const next = String(req.query.next || '');
    const safeNext = /^\/(?!\/)[\w\-./]*$/.test(next) ? next : '/';
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}.${nonce}.${encodeURIComponent(safeNext)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: c.clientId, redirect_uri: redirectUri(req), response_type: 'id_token',
      scope: 'openid email profile', prompt: 'select_account', state, nonce,
    })}`);
  });

  app.post('/api/auth/google/token', async (req, res) => {
    const fail = (error, status = 401) => res.status(status).json({ error });
    const [state, nonce, next = '%2F'] = (readCookie(req, STATE_COOKIE) || '').split('.');
    if (!state || String(req.body?.state || '') !== state) return fail('Sesi login Google kedaluwarsa. Coba lagi.');
    const c = await loadConfig(db);
    let claims;
    try {
      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(req.body?.id_token || ''))}`, { signal: AbortSignal.timeout(15_000) });
      claims = await r.json();
      if (!r.ok) throw new Error(claims.error_description || claims.error || 'token tidak valid');
    } catch (err) {
      return fail(`Google menolak login: ${err.message}`);
    }
    const email = cleanEmail(claims.email);
    const issuerOk = ['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss);
    if (claims.aud !== c.clientId || !issuerOk || claims.nonce !== nonce || !email || String(claims.email_verified) !== 'true') {
      return fail('Akun Google ini tidak bisa dipakai.');
    }
    if (c.ownerEmail && email === c.ownerEmail) {
      auth.startSession(req, res);
    } else {
      const user = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', email);
      if (!user) return fail(`${email} belum terdaftar di TIM-AI. Minta admin menambahkan email ini di menu Tim.`, 403);
      auth.startSession(req, res, user);
    }
    // Cookie sesi dari startSession + hapus cookie state.
    res.setHeader('Set-Cookie', [`${STATE_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0`, res.getHeader('Set-Cookie')].flat());
    res.json({ ok: true, next: decodeURIComponent(next) });
  });
}

// Rute pengaturan (setelah cek login, cuma pemilik).
export function googleLoginSettingsRoutes(app, db) {
  const ownerOnly = (req, res, next) => (req.user.role === 'owner' ? next() : res.status(403).json({ error: 'Cuma pemilik yang bisa mengatur login Google' }));
  const view = async (req) => {
    const c = await loadConfig(db);
    return { client_id: c.clientId, owner_email: c.ownerEmail, from_env: c.fromEnv, redirect_uri: redirectUri(req), origin: origin(req) };
  };
  app.get('/api/google-login', ownerOnly, async (req, res) => res.json(await view(req)));
  app.put('/api/google-login', ownerOnly, async (req, res) => {
    const saved = JSON.parse((await getSetting(db, KEY)) || '{}');
    const b = req.body || {};
    if (b.owner_email !== undefined) {
      const e = cleanEmail(b.owner_email);
      if (e && !validEmail(e)) return res.status(400).json({ error: 'Email pemilik tidak valid' });
      saved.owner_email = e;
    }
    if (b.client_id !== undefined) saved.client_id = String(b.client_id).trim();
    await setSetting(db, KEY, JSON.stringify(saved));
    res.json(await view(req));
  });
}
