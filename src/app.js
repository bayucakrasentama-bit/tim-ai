import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { platformInfo } from './connectors/index.js';
import { mimeFor } from './connectors/http.js';
import { now, ensureDefaultBrand } from './db.js';
import { publishPost, claimPost, runDue } from './publisher.js';
import { createAuth, cronAllowed, canManage } from './auth.js';
import { aiRouterRoutes } from './ai-router.js';
import { opsRoutes, notifyFailedPosts } from './ops.js';
import { brandScope, teamRoutes } from './team.js';
import { plannerRoutes, syncContentWithPost, unlinkPost } from './planner.js';
import { analyticsRoutes, syncIfStale } from './analytics.js';
import { aiRoutes, aiEnabled } from './ai.js';
import { tiktokRoutes, refreshStale } from './tiktok.js';
import { csRoutes } from './cs.js';
import { launchRoutes, landingPublicRoute } from './launch.js';
import { reportRoutes } from './reports.js';
import { inboxRoutes, inboxWebhookRoute } from './inbox/routes.js';
import { syncAll } from './inbox/service.js';
import { checkCredentials } from './checks.js';
import { oauthRoutes } from './oauth.js';
import { guides } from './guides.js';
import { adsRoutes, syncStaleAds } from './ads.js';
import { growthRoutes } from './growth.js';
import { partnerRoutes } from './partners.js';
import { partnerToolRoutes, refreshTrackedPosts } from './partner-tools.js';
import { lpRoutes, lpPublicRoute } from './lp-builder.js';
import { connectRoutes, connectPublicRoutes } from './connect.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Di Vercel, kerjaan yang masih jalan setelah response dikirim harus didaftarkan ke waitUntil.
let waitUntil = (p) => p;
if (process.env.VERCEL) ({ waitUntil } = await import('@vercel/functions'));
const background = (promise) => waitUntil(promise.catch((err) => console.error(err)));

const mediaKind = (mime) => (mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : null);

export function createApp({ db, connectors, storage, username = 'admin', password = '', cronSecret = '', setupError = '' }) {
  const login = { username, password };
  const app = express();
  app.set('trust proxy', true); // supaya https & host asli terbaca di belakang proxy Vercel
  // Screenshot untuk AI dikirim sebagai base64 (sudah diperkecil di browser); batas body Vercel 4,5 MB.
  app.use('/api/ai/extract', express.json({ limit: '4mb' }));
  // Webhook chat butuh body mentah untuk verifikasi tanda tangan platform.
  app.use('/api/chat/webhook', express.raw({ type: '*/*', limit: '2mb' }), (req, _res, next) => {
    req.rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    try { req.body = req.rawBody ? JSON.parse(req.rawBody) : {}; } catch { req.body = {}; }
    next();
  });
  app.use(express.json());
  app.use(express.static(publicDir));

  // Belum dikonfigurasi dengan benar (mis. di Vercel tanpa password): tolak semua API.
  if (setupError) {
    app.use('/api', (_req, res) => res.status(503).json({ error: setupError }));
    return app;
  }

  const auth = createAuth(db, login);
  auth.routes(app);

  // Landing page Launch Lab yang sudah dipublikasikan (publik, tanpa login).
  landingPublicRoute(app, db);
  // LP Builder yang sudah diterbitkan (/p/<alamat>), link/QR Integrasi Cepat, dan endpoint MCP (publik, dikunci token).
  lpPublicRoute(app, db);
  connectPublicRoutes(app, db, { ownerUsername: username });
  // Webhook chat dari Shopee / TikTok Shop / Lazada / Meta (publik, diverifikasi tanda tangan).
  inboxWebhookRoute(app, db, { background });

  // Studio Visual (/studio) memakai login TIM-AI: endpoint ini dipanggil form login studio.
  app.post('/api/studio/auth', async (req, res) => {
    res.json((await auth.currentUser(req))
      ? { ok: true }
      : { ok: false, error: 'Login ke TIM-AI dulu, lalu buka Studio dari menu TIM-AI.' });
  });
  // Database lama (sebelum ada brand) dirapikan sekali di awal.
  let ready = null;
  app.use('/api', (_req, _res, next) => {
    ready ??= ensureDefaultBrand(db).catch((err) => {
      ready = null; // coba lagi di request berikutnya
      throw err;
    });
    ready.then(() => next(), next);
  });

  // ---- Cron (dipanggil layanan cron eksternal tiap menit) ----
  // Selain kirim post terjadwal, tiap 6 jam sekalian tarik data performa dari API platform.
  app.all('/api/cron', async (req, res) => {
    if (!cronAllowed(req, cronSecret)) return res.status(401).json({ error: 'Cron secret salah' });
    const { claimed, done } = await runDue(db, connectors);
    background(done);
    background(syncIfStale(db, connectors));
    background(refreshStale(db));
    background(syncAll(db));
    background(syncStaleAds(db));
    background(refreshTrackedPosts(db));
    background(notifyFailedPosts(db));
    res.json({ ok: true, publishing: claimed });
  });

  // ---- Upload langsung browser -> Vercel Blob ----
  // Blob juga memanggil route ini (tanpa cookie) untuk event "upload selesai"; itu diverifikasi oleh handleUpload.
  app.post('/api/blob-upload', async (req, res) => {
    if (storage.kind !== 'blob') return res.status(404).json({ error: 'Blob tidak aktif' });
    if (req.body?.type === 'blob.generate-client-token' && !(await auth.currentUser(req))) {
      return res.status(401).json({ error: 'Belum login' });
    }
    try {
      const { handleUpload } = await import('@vercel/blob/client');
      const result = await handleUpload({
        body: req.body,
        request: req,
        onBeforeGenerateToken: async () => ({
          allowedContentTypes: ['image/*', 'video/*'],
          addRandomSuffix: true,
          maximumSizeInBytes: 1024 * 1024 * 1024,
        }),
        onUploadCompleted: async () => {},
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.use('/api', async (req, res, next) => {
    req.user = await auth.currentUser(req);
    return req.user ? next() : res.status(401).json({ error: 'Belum login' });
  });
  const scope = brandScope(db);

  if (storage.kind === 'local') app.use('/uploads', express.static(storage.uploadDir));

  const upload = multer({
    storage: storage.kind === 'local'
      ? multer.diskStorage({
        destination: storage.uploadDir,
        filename: (_req, file, cb) =>
          cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
      })
      : multer.memoryStorage(),
    limits: { fileSize: storage.kind === 'local' ? 1024 * 1024 * 1024 : 1 },
    fileFilter: (_req, file, cb) => {
      if (storage.kind !== 'local') return cb(Object.assign(new Error('Upload file lewat Blob, bukan ke server'), { status: 400 }));
      // Sebagian klien kirim application/octet-stream, jadi tebak juga dari ekstensi.
      if (!/^(image|video)\//.test(file.mimetype)) file.mimetype = mimeFor(file.originalname);
      if (/^(image|video)\//.test(file.mimetype)) return cb(null, true);
      cb(Object.assign(new Error('File harus berupa gambar atau video'), { status: 400 }));
    },
  });

  app.get('/api/config', async (req, res) => res.json({ storage: storage.kind, auth: !!password, ai: await aiEnabled(req.user?.id) }));
  app.get('/api/platforms', (_req, res) => res.json(platformInfo().map((p) => ({ ...p, guide: guides[p.id] || null }))));
  oauthRoutes(app, db);
  teamRoutes(app, db, { ownerUsername: username, authEnabled: auth.enabled, scope });
  plannerRoutes(app, db, scope, { storage, upload });
  analyticsRoutes(app, db, connectors, scope, { ownerUsername: username });
  aiRoutes(app, db, scope);
  aiRouterRoutes(app, db, scope, { canManage });
  opsRoutes(app, db, scope, { canManage });
  tiktokRoutes(app, db, scope);
  csRoutes(app, db, scope, { ownerUsername: username });
  launchRoutes(app, db, scope);
  adsRoutes(app, db);
  growthRoutes(app, db, scope);
  partnerToolRoutes(app, db);
  partnerRoutes(app, db);
  lpRoutes(app, db, scope);
  connectRoutes(app, db, scope);
  inboxRoutes(app, db, scope, { storage, ownerUsername: username });
  reportRoutes(app, db, scope, { ownerUsername: username });

  // ---- Akun ----
  const publicAccount = (a) => {
    const creds = JSON.parse(a.credentials || '{}');
    const fields = connectors[a.platform]?.fields || [];
    const visible = {};
    for (const f of fields) if (!f.secret && creds[f.key]) visible[f.key] = creds[f.key];
    return { id: a.id, platform: a.platform, name: a.name, details: visible, created_at: a.created_at };
  };

  app.get('/api/accounts', scope, async (req, res) => {
    res.json((await db.all('SELECT * FROM accounts WHERE brand_id = ? ORDER BY platform, name', req.brand.id)).map(publicAccount));
  });

  app.post('/api/accounts', scope, async (req, res) => {
    const { platform, name, credentials = {} } = req.body || {};
    const connector = connectors[platform];
    if (!connector) return res.status(400).json({ error: 'Platform tidak dikenal' });
    if (!name?.trim()) return res.status(400).json({ error: 'Nama akun wajib diisi' });
    const missing = connector.fields.filter((f) => !f.optional && !String(credentials[f.key] || '').trim());
    if (missing.length) return res.status(400).json({ error: `Belum diisi: ${missing.map((f) => f.label).join(', ')}` });
    const clean = {};
    for (const f of connector.fields) if (credentials[f.key]) clean[f.key] = String(credentials[f.key]).trim();
    const [row] = await db.run(
      'INSERT INTO accounts (platform, name, credentials, created_at, brand_id) VALUES (?, ?, ?, ?, ?) RETURNING *',
      platform, name.trim(), JSON.stringify(clean), now(), req.brand.id,
    );
    res.status(201).json(publicAccount(row));
  });

  // Cek token sebelum disimpan (dari form).
  app.post('/api/accounts/check', async (req, res) => {
    const { platform, credentials } = req.body || {};
    res.json(await checkCredentials(platform, credentials));
  });

  // Cek token akun yang sudah tersimpan; token yang diperbarui platform langsung disimpan.
  app.post('/api/accounts/:id/check', scope, async (req, res) => {
    const a = await db.get('SELECT * FROM accounts WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    if (!a) return res.status(404).json({ error: 'Akun tidak ditemukan' });
    const r = await checkCredentials(a.platform, JSON.parse(a.credentials || '{}'));
    if (r.credentials) await db.run('UPDATE accounts SET credentials = ? WHERE id = ?', JSON.stringify(r.credentials), a.id);
    res.json({ ...r, credentials: null });
  });

  // Pindahkan akun (beserta data analitiknya) ke brand lain. Riwayat post tetap di brand lama.
  app.patch('/api/accounts/:id', scope, async (req, res) => {
    if (!canManage(req.user)) return res.status(403).json({ error: 'Cuma pemilik/admin yang bisa memindahkan akun' });
    const a = await db.get('SELECT id FROM accounts WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    if (!a) return res.status(404).json({ error: 'Akun tidak ditemukan' });
    const target = await db.get('SELECT id, name FROM brands WHERE id = ?', Number(req.body?.brand_id));
    if (!target) return res.status(400).json({ error: 'Brand tujuan tidak ditemukan' });
    await db.run('UPDATE accounts SET brand_id = ? WHERE id = ?', target.id, a.id);
    await db.run('UPDATE metrics SET brand_id = ? WHERE account_id = ? AND brand_id = ?', target.id, a.id, req.brand.id);
    res.json({ ok: true, brand: target });
  });

  app.delete('/api/accounts/:id', scope, async (req, res) => {
    await db.run('DELETE FROM accounts WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    res.status(204).end();
  });

  // ---- Post ----
  const loadPost = async (p) => ({
    ...p,
    captions: JSON.parse(p.captions || '{}'),
    media_url: p.media_url || (p.media_name ? `/uploads/${p.media_name}` : null),
    media_path: undefined,
    targets: await db.all(`
      SELECT t.id, t.account_id, t.status, t.remote_id, t.remote_url, t.error, t.published_at,
             a.name AS account_name, a.platform
      FROM post_targets t JOIN accounts a ON a.id = t.account_id
      WHERE t.post_id = ? ORDER BY a.platform, a.name
    `, p.id),
  });
  const getPost = (id, brandId) => db.get('SELECT * FROM posts WHERE id = ? AND brand_id = ?', Number(id), brandId);

  app.get('/api/posts', scope, async (req, res) => {
    const { from, to, status } = req.query;
    const where = ['brand_id = ?'];
    const args = [req.brand.id];
    if (from) { where.push('COALESCE(scheduled_at, created_at) >= ?'); args.push(String(from)); }
    if (to) { where.push('COALESCE(scheduled_at, created_at) < ?'); args.push(String(to)); }
    if (status) { where.push('status = ?'); args.push(String(status)); }
    const rows = await db.all(`
      SELECT * FROM posts WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(scheduled_at, created_at) DESC
    `, ...args);
    res.json(await Promise.all(rows.map(loadPost)));
  });

  app.get('/api/posts/:id', scope, async (req, res) => {
    const p = await getPost(req.params.id, req.brand.id);
    if (!p) return res.status(404).json({ error: 'Post tidak ditemukan' });
    res.json(await loadPost(p));
  });

  app.post('/api/posts', scope, upload.single('media'), async (req, res) => {
    const fail = (msg) => {
      if (req.file?.path) fs.rm(req.file.path, () => {});
      res.status(400).json({ error: msg });
    };
    const caption = String(req.body.caption || '');
    const title = String(req.body.title || '');
    let captions, accountIds;
    try {
      captions = JSON.parse(req.body.captions || '{}');
      accountIds = JSON.parse(req.body.accountIds || '[]').map(Number);
    } catch {
      return fail('Data tidak valid');
    }

    // Media: file upload (lokal) atau URL Vercel Blob yang sudah di-upload browser.
    let mediaType = 'text';
    let media = { path: null, name: null, url: null };
    let assetId = null;
    if (req.file) {
      mediaType = mediaKind(req.file.mimetype);
      media = { path: req.file.path, name: req.file.filename, url: null };
    } else if (req.body.assetId) {
      // Media dari lampiran kartu planner: dipakai langsung, file tidak disalin.
      const asset = await db.get(`
        SELECT a.* FROM content_assets a JOIN content_items c ON c.id = a.content_id
        WHERE a.id = ? AND c.brand_id = ?
      `, Number(req.body.assetId), req.brand.id);
      if (!asset) return fail('Lampiran kartu tidak ditemukan');
      assetId = asset.id;
      mediaType = asset.kind;
      media = asset.path
        ? { path: asset.path, name: path.basename(asset.path), url: null }
        : { path: null, name: path.basename(new URL(asset.url).pathname), url: asset.url };
    } else if (req.body.mediaUrl) {
      if (storage.kind !== 'blob' || !storage.isOwnUrl(req.body.mediaUrl)) return fail('URL media tidak valid');
      mediaType = mediaKind(mimeFor(new URL(req.body.mediaUrl).pathname));
      if (!mediaType) return fail('File harus berupa gambar atau video');
      media = { path: null, name: path.basename(new URL(req.body.mediaUrl).pathname), url: req.body.mediaUrl };
    }

    if (!accountIds.length) return fail('Pilih minimal satu akun');
    if (!caption.trim() && mediaType === 'text') return fail('Isi caption atau pilih media dulu');

    const accounts = await Promise.all(accountIds.map((id) => db.get('SELECT * FROM accounts WHERE id = ? AND brand_id = ?', id, req.brand.id)));
    if (accounts.some((a) => !a)) return fail('Ada akun yang sudah tidak ada');
    const unsupported = accounts.filter((a) => !connectors[a.platform]?.supports.includes(mediaType));
    if (unsupported.length) {
      return fail(`Konten ${mediaType} tidak didukung oleh: ${unsupported.map((a) => `${a.name} (${connectors[a.platform].label})`).join(', ')}`);
    }

    let scheduledAt = null;
    if (req.body.mode === 'schedule') {
      const d = new Date(req.body.scheduledAt);
      if (Number.isNaN(d.getTime())) return fail('Tanggal/jam jadwal tidak valid');
      if (d.getTime() < Date.now() - 60_000) return fail('Jadwal sudah lewat, pilih waktu ke depan');
      scheduledAt = d.toISOString();
    }

    // Post dari kartu planner: kartunya ikut bergerak ke Terjadwal/Tayang.
    let contentId = Number(req.body.contentId) || null;
    if (contentId && !(await db.get('SELECT id FROM content_items WHERE id = ? AND brand_id = ?', contentId, req.brand.id))) {
      return fail('Kartu planner tidak ditemukan');
    }

    const stamp = now();
    const [post] = await db.run(`
      INSERT INTO posts (caption, captions, title, media_type, media_path, media_name, media_url, scheduled_at, started_at, status, created_at,
        brand_id, content_id, created_by, asset_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
    `, caption, JSON.stringify(captions), title, mediaType, media.path, media.name, media.url,
    scheduledAt, scheduledAt ? null : stamp, scheduledAt ? 'scheduled' : 'publishing', stamp,
    req.brand.id, contentId, req.user.username, assetId);
    for (const a of accounts) await db.run('INSERT INTO post_targets (post_id, account_id) VALUES (?, ?)', post.id, a.id);
    await syncContentWithPost(db, post.id);

    if (!scheduledAt) background(publishPost(db, connectors, post.id));
    res.status(201).json(await loadPost(post));
  });

  app.post('/api/posts/:id/retry', scope, async (req, res) => {
    const p = await getPost(req.params.id, req.brand.id);
    if (!p) return res.status(404).json({ error: 'Post tidak ditemukan' });
    if (!(await claimPost(db, p.id, ['failed', 'partial']))) {
      return res.status(400).json({ error: 'Hanya post gagal yang bisa dicoba ulang' });
    }
    background(publishPost(db, connectors, p.id));
    res.json(await loadPost(await getPost(p.id, req.brand.id)));
  });

  app.delete('/api/posts/:id', scope, async (req, res) => {
    const p = await getPost(req.params.id, req.brand.id);
    if (!p) return res.status(404).json({ error: 'Post tidak ditemukan' });
    if (p.status === 'publishing') return res.status(400).json({ error: 'Post sedang dikirim, tunggu sebentar' });
    await unlinkPost(db, p);
    await db.run('DELETE FROM posts WHERE id = ?', p.id);
    // Media milik lampiran kartu planner tetap disimpan (kartunya masih memakainya).
    const shared = p.asset_id && ((await db.get('SELECT id FROM content_assets WHERE id = ?', p.asset_id))
      || (await db.get('SELECT id FROM posts WHERE asset_id = ?', p.asset_id)));
    if (!shared) await storage.remove(p);
    res.status(204).end();
  });

  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Terjadi kesalahan' });
  });

  return app;
}
