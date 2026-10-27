// Content planner: kartu konten yang bergerak Ide -> Draft -> Review -> Siap -> Terjadwal -> Tayang.
// Tim konten mengisi kartu & melampirkan aset (hasil Studio), tim medsos menjadwalkan kartu yang Siap.
// Kartu "Siap" dijadwalkan lewat Buat Post (post menyimpan content_id), lalu statusnya
// otomatis jadi Terjadwal/Tayang mengikuti post-nya.
import fs from 'node:fs';
import path from 'node:path';
import { now } from './db.js';
import { mimeFor } from './connectors/http.js';
import { onContentStatus } from './notify.js';

export const CONTENT_STATUSES = ['ide', 'draft', 'review', 'siap', 'terjadwal', 'tayang'];
const assetKind = (mime) => (mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : null);
const TEXT_FIELDS = ['title', 'pillar', 'format', 'hook', 'script', 'caption', 'notes', 'ref_link'];
// Kartu yang masuk Review atau lebih jauh wajib punya pilar, platform tujuan, dan hook / link referensi.
const GATED = ['review', 'siap', 'terjadwal'];
function missingMeta(f) {
  const miss = [];
  if (!String(f.pillar || '').trim()) miss.push('Pilar konten');
  if (!JSON.parse(f.platforms || '[]').length) miss.push('Target platform');
  if (!String(f.hook || '').trim() && !String(f.ref_link || '').trim()) miss.push('Hook atau Link referensi');
  return miss;
}

function parsePlatforms(v) {
  if (Array.isArray(v)) return v.map(String);
  try {
    return JSON.parse(v || '[]');
  } catch {
    return [];
  }
}

const publicAsset = (a) => ({
  id: a.id, kind: a.kind, name: a.name, created_by: a.created_by, created_at: a.created_at,
  url: a.url || (a.path ? `/uploads/${path.basename(a.path)}` : null),
});

export async function loadContent(db, row) {
  if (!row) return null;
  const post = row.post_id ? await db.get('SELECT id, status, scheduled_at, created_at FROM posts WHERE id = ?', row.post_id) : null;
  const assets = await db.all('SELECT * FROM content_assets WHERE content_id = ? ORDER BY id', row.id);
  const comments = await db.get("SELECT COUNT(*) AS n FROM content_comments WHERE content_id = ? AND kind IN ('comment', 'revision')", row.id);
  return { ...row, platforms: parsePlatforms(row.platforms), post: post || null, assets: assets.map(publicAsset), comment_count: Number(comments?.n || 0) };
}

// Hapus file aset kalau sudah tidak dipakai post mana pun.
async function removeAssetFile(db, storage, asset) {
  if (await db.get('SELECT id FROM posts WHERE asset_id = ?', asset.id)) return;
  await storage.remove({ media_path: asset.path, media_url: asset.url });
}

// Dipanggil saat post dibuat/selesai/dihapus supaya kartu planner ikut bergerak.
export async function syncContentWithPost(db, postId) {
  const post = await db.get('SELECT id, status, content_id FROM posts WHERE id = ?', postId);
  if (!post?.content_id) return;
  const status = post.status === 'scheduled' ? 'terjadwal'
    : ['done', 'partial'].includes(post.status) ? 'tayang'
      : post.status === 'publishing' ? 'terjadwal' : null;
  if (status) {
    await db.run('UPDATE content_items SET status = ?, post_id = ?, updated_at = ? WHERE id = ?', status, post.id, now(), post.content_id);
  } else if (post.status === 'failed') {
    // Gagal total: balikkan ke "Siap" supaya kelihatan butuh tindakan, tapi link ke post tetap ada.
    await db.run("UPDATE content_items SET status = 'siap', post_id = ?, updated_at = ? WHERE id = ?", post.id, now(), post.content_id);
  }
}

export async function unlinkPost(db, post) {
  if (!post.content_id) return;
  await db.run(
    "UPDATE content_items SET status = CASE WHEN status = 'tayang' THEN status ELSE 'siap' END, post_id = NULL, updated_at = ? WHERE id = ? AND post_id = ?",
    now(), post.content_id, post.id,
  );
}

function pickFields(body, base = {}) {
  const out = { ...base };
  for (const f of TEXT_FIELDS) if (body[f] !== undefined) out[f] = String(body[f] ?? '');
  if (body.platforms !== undefined) out.platforms = JSON.stringify(parsePlatforms(body.platforms));
  if (body.status !== undefined) {
    if (!CONTENT_STATUSES.includes(body.status)) throw Object.assign(new Error('Status tidak dikenal'), { status: 400 });
    out.status = body.status;
  }
  if (body.planned_at !== undefined) {
    if (body.planned_at && Number.isNaN(new Date(body.planned_at).getTime())) {
      throw Object.assign(new Error('Tanggal rencana tidak valid'), { status: 400 });
    }
    out.planned_at = body.planned_at ? new Date(body.planned_at).toISOString() : null;
  }
  if (body.assignee_id !== undefined) out.assignee_id = body.assignee_id === null || body.assignee_id === '' ? null : Number(body.assignee_id);
  if (body.position !== undefined) out.position = Number(body.position) || 0;
  return out;
}

export async function createContent(db, brandId, body, user) {
  const f = pickFields(body, { status: 'ide', platforms: '[]' });
  if (!f.title?.trim()) throw Object.assign(new Error('Judul konten wajib diisi'), { status: 400 });
  const stamp = now();
  const [row] = await db.run(`
    INSERT INTO content_items (brand_id, title, status, pillar, format, platforms, hook, script, caption, notes,
      planned_at, assignee_id, position, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
  `, brandId, f.title.trim(), f.status, f.pillar || '', f.format || '', f.platforms, f.hook || '', f.script || '',
  f.caption || '', f.notes || '', f.planned_at ?? null, f.assignee_id ?? null, f.position ?? 0, user?.username || '', stamp, stamp);
  if (f.ref_link) await db.run('UPDATE content_items SET ref_link = ? WHERE id = ?', String(f.ref_link).slice(0, 500), row.id);
return row;
}

export function plannerRoutes(app, db, scope, { storage, upload }) {
  const getItem = (req) => db.get('SELECT * FROM content_items WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);

  app.get('/api/content', scope, async (req, res) => {
    const { from, to, status } = req.query;
    const where = ['brand_id = ?'];
    const args = [req.brand.id];
    if (from) { where.push('planned_at >= ?'); args.push(String(from)); }
    if (to) { where.push('planned_at < ?'); args.push(String(to)); }
    if (status) { where.push('status = ?'); args.push(String(status)); }
    const rows = await db.all(`SELECT * FROM content_items WHERE ${where.join(' AND ')} ORDER BY position, id`, ...args);
    res.json(await Promise.all(rows.map((r) => loadContent(db, r))));
  });

  app.get('/api/content/:id', scope, async (req, res) => {
    const item = await getItem(req);
    if (!item) return res.status(404).json({ error: 'Konten tidak ditemukan' });
    res.json(await loadContent(db, item));
  });

  app.post('/api/content', scope, async (req, res) => {
    const row = await createContent(db, req.brand.id, req.body || {}, req.user);
    res.status(201).json(await loadContent(db, row));
  });

  // Simpan banyak sekaligus (dari hasil AI: ide atau rencana strategi).
  app.post('/api/content/bulk', scope, async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 60) : [];
    if (!items.length) return res.status(400).json({ error: 'Tidak ada konten untuk disimpan' });
    const rows = [];
    for (const it of items) rows.push(await createContent(db, req.brand.id, it, req.user));
    res.status(201).json(await Promise.all(rows.map((r) => loadContent(db, r))));
  });

  app.patch('/api/content/:id', scope, async (req, res) => {
    const item = await getItem(req);
    if (!item) return res.status(404).json({ error: 'Konten tidak ditemukan' });
    const f = pickFields(req.body || {}, item);
    if (!String(f.title || '').trim()) return res.status(400).json({ error: 'Judul konten wajib diisi' });
    if (f.status !== item.status && GATED.includes(f.status) && ['ide', 'draft'].includes(item.status)) {
      const miss = missingMeta(f);
      if (miss.length) return res.status(400).json({ error: `Lengkapi dulu sebelum ke ${f.status === 'review' ? 'Review' : 'Siap'}: ${miss.join(', ')}` });
    }
    const [row] = await db.run(`
      UPDATE content_items SET title = ?, status = ?, pillar = ?, format = ?, platforms = ?, hook = ?, script = ?,
        caption = ?, notes = ?, planned_at = ?, assignee_id = ?, position = ?, updated_at = ?
      WHERE id = ? RETURNING *
    `, f.title.trim(), f.status, f.pillar, f.format, f.platforms, f.hook, f.script, f.caption, f.notes,
    f.planned_at, f.assignee_id, f.position, now(), item.id);
    if (row.ref_link !== (f.ref_link ?? row.ref_link)) await db.run('UPDATE content_items SET ref_link = ? WHERE id = ?', f.ref_link || '', row.id);
    if (f.status !== item.status) await onContentStatus(db, row, item.status, f.status, req.user).catch((err) => console.error(err));
    res.json(await loadContent(db, await db.get('SELECT * FROM content_items WHERE id = ?', row.id)));
  });

  app.delete('/api/content/:id', scope, async (req, res) => {
    const item = await getItem(req);
    if (!item) return res.status(404).json({ error: 'Konten tidak ditemukan' });
    // Post yang sudah dibuat dari kartu ini tetap ada (cuma lepas dari planner).
    const assets = await db.all('SELECT * FROM content_assets WHERE content_id = ?', item.id);
    await db.run('UPDATE posts SET content_id = NULL WHERE content_id = ?', item.id);
    await db.run('UPDATE metrics SET content_id = NULL WHERE content_id = ?', item.id);
    await db.run('DELETE FROM content_items WHERE id = ?', item.id);
    for (const a of assets) await removeAssetFile(db, storage, a);
    res.status(204).end();
  });

  // ---- Lampiran aset ----
  // Lokal: file dikirim ke server. Online (Vercel Blob): browser upload ke Blob, server terima URL-nya.
  app.post('/api/content/:id/assets', scope, upload.single('file'), async (req, res) => {
    const item = await getItem(req);
    const cleanup = () => req.file?.path && fs.rm(req.file.path, () => {});
    if (!item) {
      cleanup();
      return res.status(404).json({ error: 'Konten tidak ditemukan' });
    }
    let row;
    if (req.file) {
      const kind = assetKind(req.file.mimetype);
      if (!kind) {
        cleanup();
        return res.status(400).json({ error: 'File harus berupa gambar atau video' });
      }
      [row] = await db.run(
        'INSERT INTO content_assets (content_id, kind, name, path, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
        item.id, kind, req.file.originalname.slice(0, 200), req.file.path, req.user.username, now(),
      );
    } else if (req.body?.url) {
      if (storage.kind !== 'blob' || !storage.isOwnUrl(req.body.url)) return res.status(400).json({ error: 'URL aset tidak valid' });
      const kind = assetKind(mimeFor(new URL(req.body.url).pathname));
      if (!kind) return res.status(400).json({ error: 'File harus berupa gambar atau video' });
      [row] = await db.run(
        'INSERT INTO content_assets (content_id, kind, name, url, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
        item.id, kind, String(req.body.name || path.basename(new URL(req.body.url).pathname)).slice(0, 200), req.body.url, req.user.username, now(),
      );
    } else {
      return res.status(400).json({ error: 'Pilih file dulu' });
    }
    await db.run('UPDATE content_items SET updated_at = ? WHERE id = ?', now(), item.id);
    res.status(201).json(publicAsset(row));
  });

  app.delete('/api/content/:id/assets/:assetId', scope, async (req, res) => {
    const item = await getItem(req);
    if (!item) return res.status(404).json({ error: 'Konten tidak ditemukan' });
    const asset = await db.get('SELECT * FROM content_assets WHERE id = ? AND content_id = ?', Number(req.params.assetId), item.id);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    await db.run('DELETE FROM content_assets WHERE id = ?', asset.id);
    await removeAssetFile(db, storage, asset);
    res.status(204).end();
  });
}
