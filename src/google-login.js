// Masuk dengan Google: tiap anggota login pakai akun Google-nya sendiri, dicocokkan ke email yang diisi admin di menu Tim.
// Email yang sama dipakai tombol Gemini (gemini.google.com, AI Studio) supaya langsung terbuka di akun Google orang itu.
// Client ID & secret dari Google Cloud Console: env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, atau diisi pemilik di Pengaturan.
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
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || saved.client_secret || '',
    ownerEmail: cleanEmail(process.env.OWNER_EMAIL || saved.owner_email),
    fromEnv: !!process.env.GOOGLE_CLIENT_ID,
  };
}
export const ownerEmail = async (db) => (await loadConfig(db)).ownerEmail;

const redirectUri = (req) => `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
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
    res.json({ enabled: auth.enabled && !!(c.clientId && c.clientSecret) });
  });

  app.get('/api/auth/google', async (req, res) => {
    const c = await loadConfig(db);
    if (!auth.enabled || !c.clientId || !c.clientSecret) return back(res, 'Login Google belum diaktifkan pemilik.');
    const state = crypto.randomBytes(16).toString('hex');
    const next = String(req.query.next || '');
    const safeNext = /^\/(?!\/)[\w\-./]*$/.test(next) ? next : '/';
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}.${encodeURIComponent(safeNext)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: c.clientId, redirect_uri: redirectUri(req), response_type: 'code',
      scope: 'openid email profile', prompt: 'select_account', state,
    })}`);
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const [state, next = '%2F'] = (readCookie(req, STATE_COOKIE) || '').split('.');
    if (req.query.error) return back(res, 'Login Google dibatalkan.');
    if (!state || String(req.query.state || '') !== state) return back(res, 'Sesi login Google kedaluwarsa. Coba lagi.');
    const c = await loadConfig(db);
    let claims;
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({ code: String(req.query.code || ''), client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri(req), grant_type: 'authorization_code' }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await r.json();
      if (!r.ok || !body.id_token) throw new Error(body.error_description || body.error || 'tidak ada id_token');
      // id_token diterima langsung dari Google lewat HTTPS, jadi isinya cukup dibaca (tanda tangan tidak perlu dicek ulang).
      claims = JSON.parse(Buffer.from(body.id_token.split('.')[1], 'base64url').toString('utf8'));
    } catch (err) {
      return back(res, `Google menolak login: ${err.message}`);
    }
    const email = cleanEmail(claims.email);
    if (claims.aud !== c.clientId || !email || claims.email_verified === false) return back(res, 'Akun Google ini tidak bisa dipakai.');
    if (c.ownerEmail && email === c.ownerEmail) {
      auth.startSession(req, res);
    } else {
      const user = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', email);
      if (!user) return back(res, `${email} belum terdaftar di TIM-AI. Minta admin menambahkan email ini di menu Tim.`);
      auth.startSession(req, res, user);
    }
    // Cookie sesi dari startSession + hapus cookie state.
    const cookies = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', [`${STATE_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0`, cookies].flat());
    res.redirect(decodeURIComponent(next));
  });
}

// Rute pengaturan (setelah cek login, cuma pemilik).
export function googleLoginSettingsRoutes(app, db) {
  const ownerOnly = (req, res, next) => (req.user.role === 'owner' ? next() : res.status(403).json({ error: 'Cuma pemilik yang bisa mengatur login Google' }));
  const view = async (req) => {
    const c = await loadConfig(db);
    return { client_id: c.clientId, secret_hint: c.clientSecret ? `••••${c.clientSecret.slice(-4)}` : '', owner_email: c.ownerEmail,
      from_env: c.fromEnv, redirect_uri: redirectUri(req), origin: `${req.protocol}://${req.get('host')}` };
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
    if (b.client_secret) saved.client_secret = String(b.client_secret).trim();
    await setSetting(db, KEY, JSON.stringify(saved));
    res.json(await view(req));
  });
}
