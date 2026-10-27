// Analitik full funnel: views -> engagement -> profile visit -> klik link -> leads -> sales.
// Data masuk dari 3 jalur: tarik otomatis dari API platform, input manual, dan AI baca screenshot.
import { now, getSetting, setSetting } from './db.js';

export const METRIC_FIELDS = [
  'views', 'reach', 'likes', 'comments', 'shares', 'saves',
  'profile_visits', 'link_clicks', 'follows', 'leads', 'sales', 'revenue',
];
// Angka yang cuma bisa diisi manusia (tidak pernah ditimpa saat tarik data API).
const MANUAL_ONLY = ['link_clicks', 'leads', 'sales', 'revenue'];
const SYNC_DAYS = 90;
export const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;

// Terima angka gaya Indonesia: "1.500" / "450.000" (titik = ribuan), "1,5" (koma = desimal), "Rp 20.000".
const toInt = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  let t = String(v).replace(/[^\d.,-]/g, '');
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');
  else t = t.replace(',', '.');
  const n = Math.round(Number(t));
  return t !== '' && Number.isFinite(n) ? n : null;
};

function cleanMetric(body) {
  const out = {};
  for (const f of METRIC_FIELDS) if (body[f] !== undefined) out[f] = toInt(body[f]);
  return out;
}

// ---- Tarik data dari API platform ----
// Untuk semua post yang sukses tayang di 90 hari terakhir, ambil angka terbaru lalu simpan
// (upsert per post_target). Kolom manual (klik link, leads, sales, omzet) tidak disentuh.
export async function syncMetrics(db, connectors, { brandId = null } = {}) {
  const since = new Date(Date.now() - SYNC_DAYS * 86400_000).toISOString();
  const targets = await db.all(`
    SELECT t.id AS target_id, t.remote_id, t.remote_url, t.published_at, t.account_id,
           a.platform, a.credentials, p.brand_id, p.content_id, p.media_type, p.caption, p.title
    FROM post_targets t
    JOIN accounts a ON a.id = t.account_id
    JOIN posts p ON p.id = t.post_id
    WHERE t.status = 'success' AND t.remote_id IS NOT NULL AND t.published_at >= ?
      ${brandId ? 'AND p.brand_id = ?' : ''}
  `, since, ...(brandId ? [brandId] : []));

  let updated = 0;
  const errors = [];
  const skipped = new Set();
  for (const t of targets) {
    const connector = connectors[t.platform];
    if (!connector?.fetchStats) {
      skipped.add(connector?.label || t.platform);
      continue;
    }
    let stats;
    let error = null;
    try {
      stats = await connector.fetchStats({ remoteId: t.remote_id, mediaType: t.media_type, credentials: JSON.parse(t.credentials || '{}') });
      if (stats.warning) error = stats.warning;
    } catch (err) {
      error = String(err.message || err);
      errors.push({ platform: t.platform, message: error });
    }
    const existing = await db.get('SELECT * FROM metrics WHERE post_target_id = ?', t.target_id);
    const title = (t.title || t.caption || '').split('\n')[0].slice(0, 140);
    const stamp = now();
    if (!existing) {
      const vals = cleanMetric(stats || {});
      await db.run(`
        INSERT INTO metrics (brand_id, content_id, post_target_id, platform, account_id, title, url, posted_at,
          views, reach, likes, comments, shares, saves, profile_visits, follows, source, sync_error, synced_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'api', ?, ?, ?, ?)
      `, t.brand_id, t.content_id, t.target_id, t.platform, t.account_id, title, t.remote_url, t.published_at,
      vals.views ?? null, vals.reach ?? null, vals.likes ?? null, vals.comments ?? null, vals.shares ?? null,
      vals.saves ?? null, vals.profile_visits ?? null, vals.follows ?? null, error, stats ? stamp : null, stamp, stamp);
    } else if (stats) {
      const vals = cleanMetric(stats);
      const fields = METRIC_FIELDS.filter((f) => !MANUAL_ONLY.includes(f) && vals[f] !== undefined && vals[f] !== null);
      await db.run(
        `UPDATE metrics SET ${fields.map((f) => `${f} = ?, `).join('')}sync_error = ?, synced_at = ?, updated_at = ? WHERE id = ?`,
        ...fields.map((f) => vals[f]), error, stamp, stamp, existing.id,
      );
    } else {
      await db.run('UPDATE metrics SET sync_error = ?, updated_at = ? WHERE id = ?', error, stamp, existing.id);
    }
    if (stats) updated++;
  }
  await setSetting(db, 'metrics_synced_at', now());
  return { checked: targets.length, updated, errors, skipped: [...skipped] };
}

// Dipanggil dari cron: tarik data paling sering tiap 6 jam.
export async function syncIfStale(db, connectors) {
  const last = await getSetting(db, 'metrics_synced_at');
  if (last && Date.now() - new Date(last).getTime() < SYNC_EVERY_MS) return null;
  await setSetting(db, 'metrics_synced_at', now()); // klaim dulu supaya cron berikutnya tidak dobel
  return syncMetrics(db, connectors);
}

// ---- Ringkasan untuk dashboard, analitik, laporan, dan AI ----
const sum = (rows, f) => rows.reduce((a, r) => a + (Number(r[f]) || 0), 0);
const engagement = (r) => (Number(r.likes) || 0) + (Number(r.comments) || 0) + (Number(r.shares) || 0) + (Number(r.saves) || 0);
const rate = (a, b) => (b ? a / b : null);

export function summarize(rows) {
  const totals = Object.fromEntries(METRIC_FIELDS.map((f) => [f, sum(rows, f)]));
  totals.engagement = rows.reduce((a, r) => a + engagement(r), 0);
  totals.contents = rows.length;
  totals.engagement_rate = rate(totals.engagement, totals.views);

  const funnel = [
    { key: 'views', label: 'Views', value: totals.views },
    { key: 'engagement', label: 'Engagement', value: totals.engagement },
    { key: 'profile_visits', label: 'Profile visit', value: totals.profile_visits },
    { key: 'link_clicks', label: 'Klik link', value: totals.link_clicks },
    { key: 'leads', label: 'Leads', value: totals.leads },
    { key: 'sales', label: 'Sales', value: totals.sales },
  ].map((step, i, all) => ({ ...step, conversion: i ? rate(step.value, all[i - 1].value) : null }));

  const group = (keyOf) => {
    const map = new Map();
    for (const r of rows) {
      const k = keyOf(r) || '(tanpa label)';
      const g = map.get(k) || { key: k, contents: 0, views: 0, engagement: 0, sales: 0, revenue: 0 };
      g.contents++;
      g.views += Number(r.views) || 0;
      g.engagement += engagement(r);
      g.sales += Number(r.sales) || 0;
      g.revenue += Number(r.revenue) || 0;
      map.set(k, g);
    }
    return [...map.values()]
      .map((g) => ({ ...g, avg_views: Math.round(g.views / g.contents), engagement_rate: rate(g.engagement, g.views) }))
      .sort((a, b) => b.views - a.views);
  };

  // Jam terbaik: rata-rata views per hari x jam (waktu Indonesia Barat).
  const slots = new Map();
  for (const r of rows) {
    if (!r.posted_at || r.views == null) continue;
    const d = new Date(new Date(r.posted_at).getTime() + 7 * 3600_000); // UTC+7
    const k = `${d.getUTCDay()}-${d.getUTCHours()}`;
    const s = slots.get(k) || { weekday: d.getUTCDay(), hour: d.getUTCHours(), posts: 0, views: 0 };
    s.posts++;
    s.views += Number(r.views) || 0;
    slots.set(k, s);
  }
  const bestTimes = [...slots.values()].map((s) => ({ ...s, avg_views: Math.round(s.views / s.posts) })).sort((a, b) => b.avg_views - a.avg_views);

  const scored = rows.map((r) => ({
    id: r.id, title: r.title, platform: r.platform, pillar: r.pillar || '', format: r.format || '', posted_at: r.posted_at, url: r.url,
    views: Number(r.views) || 0, engagement: engagement(r), engagement_rate: rate(engagement(r), Number(r.views) || 0),
    profile_visits: Number(r.profile_visits) || 0, sales: Number(r.sales) || 0, revenue: Number(r.revenue) || 0,
  }));
  const top = [...scored].sort((a, b) => b.views - a.views || b.engagement - a.engagement).slice(0, 10);
  const bottom = [...scored].filter((r) => r.views).sort((a, b) => a.views - b.views).slice(0, 5);

  const daily = new Map();
  for (const r of rows) {
    if (!r.posted_at) continue;
    const day = new Date(new Date(r.posted_at).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    const d = daily.get(day) || { day, views: 0, engagement: 0, contents: 0 };
    d.views += Number(r.views) || 0;
    d.engagement += engagement(r);
    d.contents++;
    daily.set(day, d);
  }

  return {
    totals,
    funnel,
    byPlatform: group((r) => r.platform),
    byPillar: group((r) => r.pillar),
    byFormat: group((r) => r.format),
    bestTimes: bestTimes.slice(0, 10),
    top,
    bottom,
    timeline: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export async function metricRows(db, brandId, { from, to } = {}) {
  const where = ['m.brand_id = ?'];
  const args = [brandId];
  if (from) { where.push('COALESCE(m.posted_at, m.created_at) >= ?'); args.push(String(from)); }
  if (to) { where.push('COALESCE(m.posted_at, m.created_at) < ?'); args.push(String(to)); }
  return db.all(`
    SELECT m.*, c.pillar, c.format, a.name AS account_name
    FROM metrics m
    LEFT JOIN content_items c ON c.id = m.content_id
    LEFT JOIN accounts a ON a.id = m.account_id
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(m.posted_at, m.created_at) DESC
  `, ...args);
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ---- Laporan produksi tim: dari kartu planner sampai post terkirim ----
// Tepat waktu = tayang paling telat 24 jam setelah tanggal rencana kartu.
const GRACE_MS = 24 * 3600_000;

export async function productionReport(db, brandId, { from, to } = {}, ownerUsername = 'admin') {
  const inRange = (iso) => iso && (!from || iso >= from) && (!to || iso < to);
  const items = (await db.all('SELECT * FROM content_items WHERE brand_id = ?', brandId))
    .filter((i) => inRange(i.planned_at || i.created_at));
  const names = new Map([[0, ownerUsername], ...(await db.all('SELECT id, username FROM users')).map((u) => [u.id, u.username])]);
  const nowIso = new Date().toISOString();

  const byStatus = {};
  const people = new Map();
  let onTime = 0;
  let late = 0;
  let overdue = 0;
  for (const i of items) {
    byStatus[i.status] = (byStatus[i.status] || 0) + 1;
    const key = i.assignee_id ?? null;
    const p = people.get(key) || { name: key === null ? '(belum ada PIC)' : names.get(key) || `#${key}`, total: 0, tayang: 0, on_time: 0, late: 0, overdue: 0 };
    p.total++;
    let published = null;
    if (i.post_id) {
      published = (await db.get(
        "SELECT MIN(published_at) AS t FROM post_targets WHERE post_id = ? AND status = 'success'", i.post_id,
      ))?.t || null;
    }
    if (i.status === 'tayang') p.tayang++;
    if (published && i.planned_at) {
      const ok = new Date(published).getTime() <= new Date(i.planned_at).getTime() + GRACE_MS;
      if (ok) { onTime++; p.on_time++; } else { late++; p.late++; }
    } else if (i.planned_at && i.planned_at < nowIso && !['tayang', 'terjadwal'].includes(i.status)) {
      overdue++;
      p.overdue++;
    }
    people.set(key, p);
  }

  const posts = (await db.all('SELECT id, status, scheduled_at, created_at FROM posts WHERE brand_id = ?', brandId))
    .filter((p) => inRange(p.scheduled_at || p.created_at));
  const postStatus = {};
  for (const p of posts) postStatus[p.status] = (postStatus[p.status] || 0) + 1;
  const platforms = new Map();
  for (const p of posts) {
    const targets = await db.all(`
      SELECT t.status, a.platform FROM post_targets t JOIN accounts a ON a.id = t.account_id WHERE t.post_id = ?
    `, p.id);
    for (const t of targets) {
      const g = platforms.get(t.platform) || { platform: t.platform, success: 0, failed: 0, pending: 0 };
      if (t.status === 'success') g.success++;
      else if (t.status === 'failed') g.failed++;
      else g.pending++;
      platforms.set(t.platform, g);
    }
  }

  return {
    content: { total: items.length, byStatus, on_time: onTime, late, overdue, on_time_rate: onTime + late ? onTime / (onTime + late) : null },
    people: [...people.values()].sort((a, b) => b.total - a.total),
    distribution: { posts: posts.length, byStatus: postStatus, byPlatform: [...platforms.values()] },
  };
}

export function analyticsRoutes(app, db, connectors, scope, { ownerUsername = 'admin' } = {}) {
  const range = (q) => ({ from: q.from ? String(q.from) : null, to: q.to ? String(q.to) : null });

  app.get('/api/metrics', scope, async (req, res) => {
    res.json(await metricRows(db, req.brand.id, range(req.query)));
  });

  app.post('/api/metrics', scope, async (req, res) => {
    const b = req.body || {};
    const platform = String(b.platform || '').trim();
    if (!platform) return res.status(400).json({ error: 'Pilih platform' });
    if (b.posted_at && Number.isNaN(new Date(b.posted_at).getTime())) return res.status(400).json({ error: 'Tanggal tayang tidak valid' });
    let contentId = b.content_id ? Number(b.content_id) : null;
    if (contentId && !(await db.get('SELECT id FROM content_items WHERE id = ? AND brand_id = ?', contentId, req.brand.id))) contentId = null;
    const vals = cleanMetric(b);
    const stamp = now();
    const [row] = await db.run(`
      INSERT INTO metrics (brand_id, content_id, platform, title, url, posted_at, ${METRIC_FIELDS.join(', ')}, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ${METRIC_FIELDS.map(() => '?').join(', ')}, ?, ?, ?) RETURNING *
    `, req.brand.id, contentId, platform, String(b.title || '').slice(0, 200), b.url || null,
    b.posted_at ? new Date(b.posted_at).toISOString() : null, ...METRIC_FIELDS.map((f) => vals[f] ?? null),
    b.source === 'ai' ? 'ai' : 'manual', stamp, stamp);
    res.status(201).json(row);
  });

  app.patch('/api/metrics/:id', scope, async (req, res) => {
    const m = await db.get('SELECT * FROM metrics WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    if (!m) return res.status(404).json({ error: 'Data tidak ditemukan' });
    const b = req.body || {};
    const vals = cleanMetric(b);
    const sets = Object.keys(vals).map((f) => `${f} = ?`);
    const args = Object.values(vals);
    if (b.title !== undefined) { sets.push('title = ?'); args.push(String(b.title).slice(0, 200)); }
    if (b.url !== undefined) { sets.push('url = ?'); args.push(b.url || null); }
    if (b.posted_at !== undefined) {
      if (b.posted_at && Number.isNaN(new Date(b.posted_at).getTime())) return res.status(400).json({ error: 'Tanggal tayang tidak valid' });
      sets.push('posted_at = ?');
      args.push(b.posted_at ? new Date(b.posted_at).toISOString() : null);
    }
    if (b.content_id !== undefined) {
      const cid = b.content_id ? Number(b.content_id) : null;
      if (cid && !(await db.get('SELECT id FROM content_items WHERE id = ? AND brand_id = ?', cid, req.brand.id))) {
        return res.status(400).json({ error: 'Konten planner tidak ditemukan' });
      }
      sets.push('content_id = ?');
      args.push(cid);
    }
    if (!sets.length) return res.json(m);
    const [row] = await db.run(`UPDATE metrics SET ${sets.join(', ')}, updated_at = ? WHERE id = ? RETURNING *`, ...args, now(), m.id);
    res.json(row);
  });

  app.delete('/api/metrics/:id', scope, async (req, res) => {
    await db.run('DELETE FROM metrics WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    res.status(204).end();
  });

  app.post('/api/metrics/sync', scope, async (req, res) => {
    res.json(await syncMetrics(db, connectors, { brandId: req.brand.id }));
  });

  app.get('/api/analytics/summary', scope, async (req, res) => {
    const rows = await metricRows(db, req.brand.id, range(req.query));
    res.json({ ...summarize(rows), lastSync: await getSetting(db, 'metrics_synced_at') });
  });

  app.get('/api/reports/production', scope, async (req, res) => {
    res.json(await productionReport(db, req.brand.id, range(req.query), ownerUsername));
  });

  app.get('/api/reports/export.csv', scope, async (req, res) => {
    const rows = await metricRows(db, req.brand.id, range(req.query));
    const cols = ['posted_at', 'platform', 'account_name', 'title', 'pillar', 'format', ...METRIC_FIELDS, 'url', 'source'];
    const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))];
    const name = `laporan-${req.brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(`﻿${lines.join('\n')}`); // BOM supaya Excel membaca UTF-8
  });
}
