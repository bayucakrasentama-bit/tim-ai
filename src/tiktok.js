// Scraper TikTok: tempel link video -> username, caption, durasi, musik, views, like, komen, share, save, ER,
// link thumbnail & video, diperbarui otomatis berkala.
// Dua sumber:
// - "tikwm": layanan pihak ketiga (TIDAK resmi) untuk link akun mana pun. Bisa berhenti sewaktu-waktu.
// - "official": API resmi TikTok (video.list) untuk akun TikTok sendiri yang sudah disambungkan di menu Akun.
import { bases, readJson, sleep } from './connectors/http.js';
import { tiktokAccessToken } from './connectors/tiktok.js';
import { now } from './db.js';

export const LABELS = ['sendiri', 'pesaing', 'referensi'];
const STALE_MS = 6 * 3600_000; // diperbarui paling sering tiap 6 jam
const PER_CRON = 8; // batas per panggilan cron (layanan gratis membatasi ±1 permintaan/detik)
const n = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

export const er = (r) => (r.views ? ((r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.saves || 0)) / r.views : null);

// Link TikTok: vt.tiktok.com/xxx, vm.tiktok.com/xxx, tiktok.com/@user/video/123.
export function cleanTiktokUrl(raw) {
  const s = String(raw || '').trim();
  if (!/^https?:\/\/([\w-]+\.)?tiktok\.com\//i.test(s)) return null;
  return s.split('#')[0];
}

export async function fetchTikwm(url) {
  const res = await fetch(`${bases.tikwm()}/api/?${new URLSearchParams({ url, hd: '1' })}`, { headers: { Accept: 'application/json' } });
  const body = await readJson(res, 'Scraper TikTok');
  if (body.code !== 0 || !body.data) throw new Error(`Scraper TikTok: ${body.msg || 'video tidak ditemukan / private / dihapus'}`);
  const d = body.data;
  return {
    video_id: String(d.id || ''),
    username: d.author?.unique_id || null,
    caption: d.title || '',
    posted_at: d.create_time ? new Date(Number(d.create_time) * 1000).toISOString() : null,
    duration: n(d.duration),
    music: d.music_info?.title ? `${d.music_info.title}${d.music_info.author ? ` - ${d.music_info.author}` : ''}` : null,
    views: n(d.play_count),
    likes: n(d.digg_count),
    comments: n(d.comment_count),
    shares: n(d.share_count),
    saves: n(d.collect_count),
    thumbnail_url: d.origin_cover || d.cover || null,
    video_url: d.hdplay || d.play || null,
  };
}

// Video akun sendiri lewat API resmi (butuh izin video.list saat Hubungkan TikTok).
export async function fetchOwnVideos(credentials, max = 60) {
  const token = await tiktokAccessToken(credentials);
  if (token.scope && !token.scope.includes('video.list')) {
    throw Object.assign(new Error('Akun TikTok ini belum memberi izin video.list. Hubungkan ulang akunnya di menu Akun (izin baru sudah diminta).'), { credentials: token.credentials });
  }
  const fields = 'id,title,video_description,duration,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time';
  const out = [];
  let cursor;
  while (out.length < max) {
    const res = await fetch(`${bases.tiktok()}/v2/video/list/?fields=${fields}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
    });
    const body = await readJson(res, 'TikTok (video.list)');
    for (const v of body.data?.videos || []) {
      out.push({
        url: v.share_url, video_id: String(v.id), caption: v.video_description || v.title || '',
        posted_at: v.create_time ? new Date(v.create_time * 1000).toISOString() : null, duration: n(v.duration),
        views: n(v.view_count), likes: n(v.like_count), comments: n(v.comment_count), shares: n(v.share_count),
        saves: null, thumbnail_url: v.cover_image_url || null, music: null, video_url: null,
      });
    }
    if (!body.data?.has_more) break;
    cursor = body.data.cursor;
  }
  return { videos: out.slice(0, max), credentials: token.credentials };
}

const FIELDS = ['video_id', 'username', 'caption', 'posted_at', 'duration', 'music', 'views', 'likes', 'comments', 'shares', 'saves', 'thumbnail_url', 'video_url'];

async function saveStats(db, id, stats) {
  const keys = FIELDS.filter((k) => stats[k] !== undefined && !(stats[k] === null && k === 'saves'));
  await db.run(
    `UPDATE tiktok_videos SET ${keys.map((k) => `${k} = ?`).join(', ')}, error = NULL, updated_at = ? WHERE id = ?`,
    ...keys.map((k) => stats[k]), now(), id,
  );
}

// Video milik brand sendiri ikut masuk ke Analitik (sumber "api"), jadi TikTok tidak perlu diisi manual lagi.
async function syncToMetrics(db, row) {
  if (row.label !== 'sendiri' || !row.video_id) return;
  const ext = `tiktok:${row.video_id}`;
  const vals = [row.views, row.likes, row.comments, row.shares, row.saves];
  const existing = await db.get('SELECT id FROM metrics WHERE brand_id = ? AND external_id = ?', row.brand_id, ext);
  if (existing) {
    await db.run('UPDATE metrics SET views = ?, likes = ?, comments = ?, shares = ?, saves = ?, synced_at = ?, updated_at = ? WHERE id = ?', ...vals, now(), now(), existing.id);
  } else {
    await db.run(`
      INSERT INTO metrics (brand_id, platform, title, url, posted_at, views, likes, comments, shares, saves, source, external_id, synced_at, created_at, updated_at)
      VALUES (?, 'tiktok', ?, ?, ?, ?, ?, ?, ?, ?, 'api', ?, ?, ?, ?)
    `, row.brand_id, String(row.caption || '').split('\n')[0].slice(0, 140), row.url, row.posted_at, ...vals, ext, now(), now(), now());
  }
}

export async function refreshVideo(db, row) {
  try {
    const stats = await fetchTikwm(row.url);
    await saveStats(db, row.id, stats);
  } catch (err) {
    await db.run('UPDATE tiktok_videos SET error = ?, updated_at = ? WHERE id = ?', String(err.message || err), now(), row.id);
  }
  const fresh = await db.get('SELECT * FROM tiktok_videos WHERE id = ?', row.id);
  await syncToMetrics(db, fresh);
  return fresh;
}

// Dipanggil cron tiap menit: perbarui beberapa link yang sudah lewat 6 jam.
export async function refreshStale(db, { limit = PER_CRON, delayMs = 1100 } = {}) {
  const before = new Date(Date.now() - STALE_MS).toISOString();
  const rows = await db.all(`
    SELECT * FROM tiktok_videos WHERE source = 'tikwm' AND (updated_at IS NULL OR updated_at < ?)
    ORDER BY COALESCE(updated_at, '') LIMIT ?
  `, before, limit);
  for (const [i, r] of rows.entries()) {
    if (i) await sleep(delayMs);
    await refreshVideo(db, r);
  }
  return rows.length;
}

const publicRow = (r) => ({ ...r, er: er(r) });

export function tiktokRoutes(app, db, scope) {
  const get = (req) => db.get('SELECT * FROM tiktok_videos WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);

  app.get('/api/tiktok', scope, async (req, res) => {
    const where = ['brand_id = ?'];
    const args = [req.brand.id];
    if (LABELS.includes(req.query.label)) { where.push('label = ?'); args.push(req.query.label); }
    const rows = await db.all(`SELECT * FROM tiktok_videos WHERE ${where.join(' AND ')} ORDER BY COALESCE(posted_at, created_at) DESC`, ...args);
    res.json(rows.map(publicRow));
  });

  // Tempel banyak link sekaligus (satu per baris). Data ditarik di latar belakang oleh pemanggil berikutnya.
  app.post('/api/tiktok', scope, async (req, res) => {
    const label = LABELS.includes(req.body?.label) ? req.body.label : 'referensi';
    const lines = String(req.body?.urls || '').split(/[\s,]+/).map(cleanTiktokUrl).filter(Boolean);
    if (!lines.length) return res.status(400).json({ error: 'Tempel minimal satu link TikTok (tiktok.com / vt.tiktok.com)' });
    const existing = new Set((await db.all('SELECT url FROM tiktok_videos WHERE brand_id = ?', req.brand.id)).map((r) => r.url));
    const added = [];
    for (const url of [...new Set(lines)].slice(0, 200)) {
      if (existing.has(url)) continue;
      const [row] = await db.run(
        'INSERT INTO tiktok_videos (brand_id, url, label, source, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *',
        req.brand.id, url, label, 'tikwm', now(),
      );
      added.push(row);
    }
    res.status(201).json({ added: added.map(publicRow), skipped: lines.length - added.length });
  });

  app.post('/api/tiktok/:id/refresh', scope, async (req, res) => {
    const row = await get(req);
    if (!row) return res.status(404).json({ error: 'Link tidak ditemukan' });
    if (row.source !== 'tikwm') return res.status(400).json({ error: 'Video akun sendiri diperbarui lewat tombol "Tarik video akun sendiri"' });
    res.json(publicRow(await refreshVideo(db, row)));
  });

  app.patch('/api/tiktok/:id', scope, async (req, res) => {
    const row = await get(req);
    if (!row) return res.status(404).json({ error: 'Link tidak ditemukan' });
    const label = LABELS.includes(req.body?.label) ? req.body.label : row.label;
    const notes = req.body?.notes !== undefined ? String(req.body.notes) : row.notes;
    const [upd] = await db.run('UPDATE tiktok_videos SET label = ?, notes = ? WHERE id = ? RETURNING *', label, notes, row.id);
    await syncToMetrics(db, upd);
    res.json(publicRow(upd));
  });

  app.delete('/api/tiktok/:id', scope, async (req, res) => {
    await db.run('DELETE FROM tiktok_videos WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    res.status(204).end();
  });

  // Video akun TikTok sendiri (API resmi) dari akun yang tersambung di brand ini.
  app.post('/api/tiktok/own', scope, async (req, res) => {
    const accounts = await db.all("SELECT * FROM accounts WHERE brand_id = ? AND platform = 'tiktok'", req.brand.id);
    if (!accounts.length) return res.status(400).json({ error: 'Belum ada akun TikTok tersambung di brand ini. Hubungkan dulu di menu Akun.' });
    let imported = 0;
    const errors = [];
    for (const a of accounts) {
      try {
        const { videos, credentials } = await fetchOwnVideos(JSON.parse(a.credentials || '{}'));
        if (credentials) await db.run('UPDATE accounts SET credentials = ? WHERE id = ?', JSON.stringify(credentials), a.id);
        for (const v of videos) {
          if (!v.url) continue;
          let row = await db.get('SELECT * FROM tiktok_videos WHERE brand_id = ? AND (video_id = ? OR url = ?)', req.brand.id, v.video_id, v.url);
          if (!row) {
            [row] = await db.run(
              "INSERT INTO tiktok_videos (brand_id, url, label, source, username, created_at) VALUES (?, ?, 'sendiri', 'official', ?, ?) RETURNING *",
              req.brand.id, v.url, a.name, now(),
            );
          } else if (row.source !== 'official') {
            await db.run("UPDATE tiktok_videos SET source = 'official', label = 'sendiri' WHERE id = ?", row.id);
          }
          await saveStats(db, row.id, v);
          await syncToMetrics(db, await db.get('SELECT * FROM tiktok_videos WHERE id = ?', row.id));
          imported++;
        }
      } catch (err) {
        if (err.credentials) await db.run('UPDATE accounts SET credentials = ? WHERE id = ?', JSON.stringify(err.credentials), a.id);
        errors.push(`${a.name}: ${err.message}`);
      }
    }
    res.json({ imported, errors });
  });

  app.get('/api/tiktok/export.csv', scope, async (req, res) => {
    const rows = await db.all('SELECT * FROM tiktok_videos WHERE brand_id = ? ORDER BY COALESCE(posted_at, created_at) DESC', req.brand.id);
    const cols = ['url', 'label', 'source', 'username', 'caption', 'posted_at', 'duration', 'music', 'views', 'likes', 'comments', 'shares', 'saves', 'er', 'thumbnail_url', 'video_url', 'updated_at', 'error'];
    const cell = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(','), ...rows.map(publicRow).map((r) => cols.map((c) => cell(c === 'er' && r.er != null ? `${(r.er * 100).toFixed(2)}%` : r[c])).join(','))];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="scraper-tiktok-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`﻿${lines.join('\n')}`);
  });
}
