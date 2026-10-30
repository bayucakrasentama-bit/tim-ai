// Login:
// - Pemilik: APP_USERNAME (default "admin") + APP_PASSWORD dari environment. Selalu bisa masuk.
// - Anggota tim: dibuat pemilik/admin dari menu Tim, password di-hash (scrypt) di database.
// - Masuk dengan Google (google-login.js): email Google dicocokkan ke email anggota / email pemilik.
// Cookie berisi id user + tanda tangan HMAC. Ganti password = sesi lama otomatis keluar.
// Tanpa APP_PASSWORD (jalan lokal) login dimatikan dan semua request dianggap pemilik.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'siarin_session';
const MAX_AGE = 30 * 24 * 60 * 60;

export const OWNER = Object.freeze({ id: 0, username: 'admin', role: 'owner', team: 'semua' });
// Tim: "konten" (bikin konten), "medsos" (distribusi & performa), "digital" (Launch Lab & landing page),
// "adv" (iklan Meta/TikTok/Google), "mp" (iklan & laporan marketplace), "cs" (layanan pelanggan), atau "semua".
// "kol" (influencer/KOL berbayar) dan "affiliate" (kreator afiliasi berbasis komisi).
export const TEAMS = ['konten', 'medsos', 'digital', 'adv', 'mp', 'kol', 'affiliate', 'cs', 'semua'];

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 32)).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

// Anggota yang cuma masuk lewat Google: hash ini tidak pernah cocok dengan password apa pun.
export const googleOnlyHash = () => `google$${crypto.randomBytes(16).toString('hex')}`;

async function verifyPassword(password, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  return safeEqual((await scrypt(String(password), salt, 32)).toString('hex'), hash);
}

// Tanda tangan sesi: dikunci pakai password pemilik, dan ikut hash password user
// supaya ganti password langsung membatalkan sesi lama.
function sign(login, userId, secretPart) {
  return crypto.createHmac('sha256', login.password)
    .update(`siarin-session-v3:${login.username}:${userId}:${secretPart}`)
    .digest('hex');
}

export function createAuth(db, login) {
  const enabled = !!login.password;
  const owner = { ...OWNER, username: login.username };

  async function currentUser(req) {
    if (!enabled) return owner;
    // Format: "<id angka>.<hmac hex>". Cookie versi lama (tanpa titik) atau rusak dianggap belum login,
    // jangan sampai id yang bukan angka diteruskan ke query (Postgres menolaknya jadi error 500).
    const m = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(readCookie(req, COOKIE) || '');
    if (!m) return null;
    const [, id, sig] = m;
    if (id === '0') return safeEqual(sig, sign(login, 0, '')) ? owner : null;
    const user = await db.get('SELECT id, username, role, team, email, password_hash FROM users WHERE id = ?', Number(id));
    if (!user || !safeEqual(sig, sign(login, user.id, user.password_hash))) return null;
    return { id: user.id, username: user.username, role: user.role, team: TEAMS.includes(user.team) ? user.team : 'semua', email: user.email || '' };
  }

  // Pasang cookie sesi untuk pemilik (user = null) atau baris tabel users. Dipakai login password & login Google.
  function startSession(req, res, user = null) {
    const cookie = user ? `${user.id}.${sign(login, user.id, user.password_hash)}` : `0.${sign(login, 0, '')}`;
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE}=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`);
  }

  function routes(app) {
    app.post('/api/login', async (req, res) => {
      if (!enabled) return res.json({ ok: true });
      const username = String(req.body?.username ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      let ok = false;
      // Pemilik: username & password selalu dibandingkan dua-duanya supaya waktunya sama.
      const ownerUser = safeEqual(username, login.username.toLowerCase());
      const ownerPass = safeEqual(password, login.password);
      if (ownerUser && ownerPass) {
        startSession(req, res);
        ok = true;
      } else if (!ownerUser) {
        const user = await db.get('SELECT * FROM users WHERE LOWER(username) = ?', username);
        if (user && (await verifyPassword(password, user.password_hash))) {
          startSession(req, res, user);
          ok = true;
        }
      }
      if (!ok) {
        await new Promise((r) => setTimeout(r, 600)); // memperlambat tebak-tebakan password
        return res.status(401).json({ error: 'Username atau password salah' });
      }
      res.json({ ok: true });
    });
    app.post('/api/logout', (_req, res) => {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      res.json({ ok: true });
    });
  }

  return { enabled, currentUser, routes, owner, startSession };
}

// Pemilik & admin bisa kelola tim dan semua brand; member cuma brand yang ditugaskan.
export const canManage = (user) => user.role === 'owner' || user.role === 'admin';

// Cron eksternal memanggil /api/cron dengan secret di header Authorization atau ?key=.
export function cronAllowed(req, secret) {
  if (!secret) return false;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return safeEqual(bearer, secret) || safeEqual(req.query.key ?? '', secret);
}
