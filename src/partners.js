// Tim KOL (influencer/KOL berbayar) & Tim Affiliate (kreator afiliasi berbasis komisi), lintas brand.
// - Roster mitra dengan pipeline status (prospek → negosiasi → deal → aktif → selesai / ditolak).
// - Hasil per konten/periode: views, interaksi, klik, pesanan, omzet, fee/komisi. Masuk lewat input manual atau impor CSV
//   (export TikTok Shop Affiliate, Shopee Affiliate, atau spreadsheet tim).
// - Laporan memakai rumus soul.md: median views, viral dependency (mean ÷ median), ER by views, CPV, ROAS.
import { now } from './db.js';
import { brandsFor } from './team.js';
import { parseNum, parseDay, splitCsv } from './ads.js';

export const PARTNER_TEAMS = {
  kol: { label: 'KOL', costLabel: 'Fee', platforms: ['tiktok', 'instagram', 'youtube', 'facebook', 'x', 'lainnya'] },
  affiliate: { label: 'Affiliate', costLabel: 'Komisi', platforms: ['tiktok_shop', 'shopee', 'tokopedia', 'lazada', 'instagram', 'lainnya'] },
};
export const PARTNER_STATUS = ['prospek', 'negosiasi', 'deal', 'aktif', 'selesai', 'ditolak'];
// Pipeline Tim KOL: List/Hunting → Negosiasi & Deal → Kirim Sampel → Menunggu Draft → Sudah Tayang → Evaluasi & Scoring.
export const KOL_STATUS = ['hunting', 'negosiasi', 'sampel', 'draft', 'tayang', 'evaluasi', 'ditolak'];
export const statusesFor = (team) => (team === 'kol' ? KOL_STATUS : PARTNER_STATUS);
const ACTIVE = ['deal', 'aktif', 'sampel', 'draft', 'tayang'];
const LEGACY_KOL = { prospek: 'hunting', deal: 'negosiasi', aktif: 'tayang', selesai: 'evaluasi' };
let legacyDone = false;
async function migrateKol(db) {
  if (legacyDone) return;
  for (const [from, to] of Object.entries(LEGACY_KOL)) await db.run("UPDATE partners SET status = ? WHERE team = 'kol' AND status = ?", to, from);
  legacyDone = true;
}

// Skor otomatis mitra (KOL/affiliate). Biaya = fee + komisi + HPP sampel.
// Ambang bawaan (bisa disesuaikan nanti dengan benchmark 15B soul.md): CPV dalam rupiah per view.
export function scoreOf(m, sampleCost = 0) {
  const cost = (m.cost || 0) + (sampleCost || 0);
  const views = m.views || 0;
  const cpv = views ? cost / views : null;
  const cpe = m.engagement ? cost / m.engagement : null;
  const roas = cost ? (m.revenue || 0) / cost : null;
  let badge = 'nodata';
  if (views || m.revenue) {
    if ((roas != null && roas >= 2) || (cpv != null && cpv <= 30 && (m.er || 0) >= 0.04)) badge = 'repeat';
    else if ((roas != null && roas >= 1) || (cpv != null && cpv <= 60)) badge = 'nego';
    else badge = 'blacklist';
  }
  return { cost_total: cost, sample_cost: sampleCost || 0, cpv_total: cpv, cpe, roas_total: roas, badge };
}
const isTeam = (t) => Object.hasOwn(PARTNER_TEAMS, t);
const N = (v) => (v == null || v === '' ? null : Number(v));
const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const median = (arr) => {
  const a = arr.filter((x) => x != null).map(Number).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

function metricsOf(posts) {
  const views = posts.map((p) => N(p.views)).filter((v) => v != null);
  const t = {
    posts: posts.length, fee: sum(posts, 'fee'), commission: sum(posts, 'commission'), views: sum(posts, 'views'),
    engagement: sum(posts, 'likes') + sum(posts, 'comments') + sum(posts, 'shares') + sum(posts, 'saves'),
    clicks: sum(posts, 'clicks'), orders: sum(posts, 'orders'), revenue: sum(posts, 'revenue'),
  };
  const cost = t.fee + t.commission;
  const med = median(views);
  const mean = views.length ? views.reduce((a, b) => a + b, 0) / views.length : null;
  return {
    ...t, cost,
    median_views: med, mean_views: mean,
    viral_dependency: med ? mean / med : null,
    er: t.views ? t.engagement / t.views : null,
    cpv: t.views ? cost / t.views : null,
    cpv_median: med && posts.length ? (cost / posts.length) / med : null,
    roas: cost ? t.revenue / cost : null,
    cpo: t.orders ? cost / t.orders : null,
    aov: t.orders ? t.revenue / t.orders : null,
  };
}

export async function partnersReport(db, user, team, { brandId = null, from = null, to = null } = {}) {
  const brands = (await brandsFor(db, user)).filter((b) => !brandId || b.id === brandId);
  const base = { team, brands: brands.map((b) => ({ id: b.id, name: b.name })), totals: metricsOf([]), byStatus: {}, byBrand: [], byPlatform: [], partners: [], products: [], live: { sessions: 0, byCreator: [] }, campaigns: [], content: [], tracked: { links: 0, errors: 0 }, top: [] };
  if (!brands.length) return base;
  const ids = brands.map((b) => b.id);
  const partners = await db.all(`SELECT * FROM partners WHERE team = ? AND brand_id IN (${ids.map(() => '?').join(',')}) ORDER BY name`, team, ...ids);
  if (!partners.length) return base;
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const byId = new Map(partners.map((p) => [p.id, p]));
  const fromDay = from ? String(from).slice(0, 10) : null;
  const toDay = to ? String(to).slice(0, 10) : null;
  const posts = (await db.all(`SELECT * FROM partner_posts WHERE partner_id IN (${partners.map(() => '?').join(',')}) ORDER BY day`, ...partners.map((p) => p.id)))
    .filter((r) => (!fromDay || r.day >= fromDay) && (!toDay || r.day < toDay));
  const group = (keyFn) => {
    const m = new Map();
    for (const r of posts) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return m;
  };
  const samplesAll = await db.all(`SELECT partner_id, hpp, status FROM sample_shipments WHERE partner_id IN (${partners.map(() => '?').join(',')})`, ...partners.map((p) => p.id));
  const lives = (await db.all(`SELECT * FROM live_sessions WHERE partner_id IN (${partners.map(() => '?').join(',')})`, ...partners.map((p) => p.id)))
    .filter((r) => (!fromDay || r.day >= fromDay) && (!toDay || r.day < toDay));
  const liveOf = (list) => {
    const views = sum(list, 'views');
    const revenue = sum(list, 'revenue');
    const minutes = sum(list, 'duration_min');
    return { sessions: list.length, hours: minutes / 60, views, orders: sum(list, 'orders'), revenue, commission: sum(list, 'commission'),
      gpm: views ? (revenue / views) * 1000 : null, revenue_per_hour: minutes ? revenue / (minutes / 60) : null, peak: Math.max(0, ...list.map((l) => Number(l.peak_viewers) || 0)) };
  };
  const liveBy = new Map();
  for (const l of lives) { if (!liveBy.has(l.partner_id)) liveBy.set(l.partner_id, []); liveBy.get(l.partner_id).push(l); }
  const prodMap = new Map();
  for (const r of posts) { const k = String(r.product || '').trim(); if (!k) continue; if (!prodMap.has(k)) prodMap.set(k, []); prodMap.get(k).push(r); }
  const totalRevenue = sum(posts, 'revenue');
  let campaigns = [];
  if (team === 'kol') {
    const cs = await db.all(`SELECT * FROM kol_campaigns WHERE brand_id IN (${ids.map(() => '?').join(',')})`, ...ids);
    for (const c of cs) {
      const ds = (await db.all('SELECT d.*, pp.views, pp.orders, pp.revenue FROM kol_deliverables d LEFT JOIN partner_posts pp ON pp.id = d.post_id WHERE d.campaign_id = ?', c.id)).filter((d) => d.status !== 'batal');
      const fee = sum(ds, 'fee');
      const views = sum(ds, 'views');
      campaigns.push({ name: c.name, brand: brandName.get(c.brand_id), status: c.status, start: c.start_day, end: c.end_day, budget: N(c.budget), fee, deliverables: ds.length,
        posted: ds.filter((d) => ['tayang', 'dibayar'].includes(d.status)).length, late: ds.filter((d) => d.due_day && d.due_day < new Date().toISOString().slice(0, 10) && !['tayang', 'dibayar'].includes(d.status)).length,
        views, target_views: N(c.target_views), cpv: views ? fee / views : null, orders: sum(ds, 'orders'), revenue: sum(ds, 'revenue'), roas: fee ? sum(ds, 'revenue') / fee : null });
    }
  }
  const byStatus = {};
  for (const p of partners) byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  const perPartner = group((r) => r.partner_id);
  return {
    team,
    brands: base.brands,
    totals: { ...metricsOf(posts), partners: partners.length, active: partners.filter((p) => ACTIVE.includes(p.status)).length },
    byStatus,
    byBrand: [...group((r) => byId.get(r.partner_id).brand_id)].map(([k, list]) => ({ key: brandName.get(k), ...metricsOf(list) })).sort((a, b) => b.revenue - a.revenue),
    byPlatform: [...group((r) => byId.get(r.partner_id).platform)].map(([k, list]) => ({ key: k, ...metricsOf(list) })).sort((a, b) => b.revenue - a.revenue),
    partners: partners.map((p) => ({
      id: p.id, name: p.name, handle: p.handle, platform: p.platform, tier: p.tier, followers: N(p.followers), rate: N(p.rate), status: p.status,
      brand: brandName.get(p.brand_id), profile: p.stats ? (({ metrics, verified, video_count }) => ({ ...metrics, verified, video_count }))(JSON.parse(p.stats)) : null,
      live_revenue: sum(liveBy.get(p.id) || [], 'revenue'), ...(() => { const m = metricsOf(perPartner.get(p.id) || []); return { ...m, ...scoreOf(m, sum(samplesAll.filter((s) => s.partner_id === p.id), 'hpp')) }; })(),
    })).sort((a, b) => b.revenue - a.revenue || b.views - a.views),
    products: [...prodMap].map(([k, list]) => ({ key: k, creators: new Set(list.map((x) => x.partner_id)).size, share: totalRevenue ? sum(list, 'revenue') / totalRevenue : null, ...metricsOf(list) }))
      .sort((a, b) => b.revenue - a.revenue || b.views - a.views).slice(0, 30),
    live: { ...liveOf(lives), byCreator: [...liveBy].map(([pid, list]) => ({ key: byId.get(pid).name, brand: brandName.get(byId.get(pid).brand_id), ...liveOf(list) })).sort((a, b) => b.revenue - a.revenue) },
    campaigns,
    tracked: { links: posts.filter((x) => x.tracked).length, errors: posts.filter((x) => x.tracked && x.error).length },
    content: [...posts].sort((a, b) => String(b.day).localeCompare(String(a.day))).slice(0, 300).map((r) => ({ id: r.id, partner: byId.get(r.partner_id).name, day: r.day, posted_at: r.posted_at, title: r.title, url: r.url, product: r.product, thumbnail: r.thumbnail, duration: N(r.duration),
      views: N(r.views), likes: N(r.likes), comments: N(r.comments), shares: N(r.shares), saves: N(r.saves), orders: N(r.orders), revenue: N(r.revenue), cost: (Number(r.fee) || 0) + (Number(r.commission) || 0), tracked: !!r.tracked, error: r.error })),
    top: [...posts].sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0) || (Number(b.views) || 0) - (Number(a.views) || 0)).slice(0, 15)
      .map((r) => ({ partner: byId.get(r.partner_id).name, brand: brandName.get(byId.get(r.partner_id).brand_id), day: r.day, title: r.title, url: r.url, product: r.product, thumbnail: r.thumbnail, duration: N(r.duration), er: N(r.views) ? ((Number(r.likes) || 0) + (Number(r.comments) || 0) + (Number(r.shares) || 0) + (Number(r.saves) || 0)) / Number(r.views) : null,
        views: N(r.views), orders: N(r.orders), revenue: N(r.revenue), cost: (Number(r.fee) || 0) + (Number(r.commission) || 0) })),
  };
}

// Kolom CSV: kreator/username + angka. Dikenali dari judulnya (Indonesia/Inggris).
const COLS = [
  ['day', /^(date|tanggal|day|hari|waktu|periode|time)/],
  ['url', /(link|url|tautan)/],
  ['commission', /(komisi|commission)/],
  ['fee', /(fee|biaya|ratecard|rate card|harga|cost)/],
  ['revenue', /(gmv|revenue|omzet|omset|penjualan|sales|nilai pesanan)/],
  ['orders', /(pesanan|order|terjual|items sold|sold|pembelian)/],
  ['views', /(views|view|tayangan|ditonton|plays|impresi|impression)/],
  ['likes', /(like|suka)/],
  ['comments', /(comment|komen)/],
  ['shares', /(share|bagikan)/],
  ['saves', /(save|simpan)/],
  ['clicks', /(click|klik)/],
  ['product', /(produk|product|sku)/],
  ['title', /(judul|title|video|konten|content|caption)/],
  ['partner', /(creator|kreator|affiliate|afiliasi|influencer|kol|username|nama akun|akun|nama)/],
];
const SKIP = /(rate|%|persen|rata|avg|per |rasio|ratio|id$|^id )/;
function mapHeader(header) {
  const map = {};
  header.forEach((h, i) => {
    const t = String(h).toLowerCase().trim();
    if (!t || SKIP.test(t)) return;
    const hit = COLS.find(([key, re]) => re.test(t) && map[key] === undefined);
    if (hit) map[hit[0]] = i;
  });
  return map;
}

async function addPost(db, partnerId, r, source) {
  const int = (v) => (v == null ? null : Math.round(Number(v)));
  const url = String(r.url || '').trim().slice(0, 500);
  await db.run(`INSERT INTO partner_posts (partner_id, day, title, url, product, tracked, fee, views, likes, comments, shares, saves, clicks, orders, revenue, commission, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, partnerId, r.day, String(r.title || '').slice(0, 300), url, String(r.product || '').trim().slice(0, 200),
  /^https?:\/\/([\w-]+\.)?tiktok\.com\//i.test(url) ? 1 : 0,
  r.fee ?? null, int(r.views), int(r.likes), int(r.comments), int(r.shares), int(r.saves), int(r.clicks), int(r.orders), r.revenue ?? null, r.commission ?? null, source, now());
}

export function partnerRoutes(app, db) {
  const team = (req, res, next) => (isTeam(req.params.team) ? next() : res.status(404).json({ error: 'Tim tidak dikenal' }));
  const allowed = async (req) => new Set((await brandsFor(db, req.user)).map((b) => b.id));
  async function own(req, id) {
    const p = await db.get('SELECT * FROM partners WHERE id = ? AND team = ?', Number(id), req.params.team);
    return p && (await allowed(req)).has(p.brand_id) ? p : null;
  }
  const clean = (b, p = {}, team = 'affiliate') => ({
    name: String(b.name ?? p.name ?? '').trim().slice(0, 120),
    handle: String(b.handle ?? p.handle ?? '').trim().replace(/^@/, '').slice(0, 120),
    platform: String(b.platform ?? p.platform ?? 'tiktok').slice(0, 40),
    tier: String(b.tier ?? p.tier ?? '').slice(0, 40),
    followers: b.followers !== undefined ? parseNum(b.followers) : N(p.followers),
    rate: b.rate !== undefined ? parseNum(b.rate) : N(p.rate),
    contact: String(b.contact ?? p.contact ?? '').slice(0, 200),
    status: statusesFor(team).includes(b.status) ? b.status : p.status || statusesFor(team)[0],
    notes: String(b.notes ?? p.notes ?? '').slice(0, 4000),
  });

  app.get('/api/partners/:team', team, async (req, res) => {
    const ids = [...(await allowed(req))];
    if (req.params.team === 'kol') await migrateKol(db);
    const rows = ids.length ? await db.all(`SELECT * FROM partners WHERE team = ? AND brand_id IN (${ids.map(() => '?').join(',')}) ORDER BY updated_at DESC`, req.params.team, ...ids) : [];
    const pids = rows.map((p) => p.id);
    const posts = pids.length ? await db.all(`SELECT * FROM partner_posts WHERE partner_id IN (${pids.map(() => '?').join(',')})`, ...pids) : [];
    const samples = pids.length ? await db.all(`SELECT * FROM sample_shipments WHERE partner_id IN (${pids.map(() => '?').join(',')}) ORDER BY id DESC`, ...pids) : [];
    const out = rows.map((p) => {
      const m = metricsOf(posts.filter((x) => x.partner_id === p.id));
      const sm = samples.filter((s) => s.partner_id === p.id);
      return { ...p, perf: { ...m, ...scoreOf(m, sum(sm, 'hpp')) }, last_sample: sm[0] || null };
    });
    res.json({ meta: { ...PARTNER_TEAMS[req.params.team], statuses: statusesFor(req.params.team) }, partners: out });
  });

  app.post('/api/partners/:team', team, async (req, res) => {
    const brandId = Number(req.body?.brand_id);
    if (!(await allowed(req)).has(brandId)) return res.status(403).json({ error: 'Pilih brand yang kamu pegang' });
    const v = clean(req.body || {}, {}, req.params.team);
    if (!v.name) return res.status(400).json({ error: 'Nama wajib diisi' });
    const stamp = now();
    const [row] = await db.run(`INSERT INTO partners (brand_id, team, name, handle, platform, tier, followers, rate, contact, status, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`, brandId, req.params.team, v.name, v.handle, v.platform, v.tier, v.followers, v.rate, v.contact, v.status, v.notes, req.user.username, stamp, stamp);
    res.status(201).json(row);
  });

  app.patch('/api/partners/:team/:id', team, async (req, res) => {
    const p = await own(req, req.params.id);
    if (!p) return res.status(404).json({ error: 'Mitra tidak ditemukan' });
    const v = clean(req.body || {}, p, req.params.team);
    const [row] = await db.run(`UPDATE partners SET name = ?, handle = ?, platform = ?, tier = ?, followers = ?, rate = ?, contact = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ? RETURNING *`, v.name || p.name, v.handle, v.platform, v.tier, v.followers, v.rate, v.contact, v.status, v.notes, now(), p.id);
    res.json(row);
  });

  app.delete('/api/partners/:team/:id', team, async (req, res) => {
    const p = await own(req, req.params.id);
    if (!p) return res.status(404).json({ error: 'Mitra tidak ditemukan' });
    await db.run('DELETE FROM partner_posts WHERE partner_id = ?', p.id);
    await db.run('DELETE FROM partners WHERE id = ?', p.id);
    res.status(204).end();
  });

  app.get('/api/partners/:team/posts', team, async (req, res) => {
    const p = await own(req, req.query.partner_id);
    if (!p) return res.status(404).json({ error: 'Mitra tidak ditemukan' });
    res.json(await db.all('SELECT * FROM partner_posts WHERE partner_id = ? ORDER BY day DESC, id DESC LIMIT 500', p.id));
  });

  app.post('/api/partners/:team/posts', team, async (req, res) => {
    const b = req.body || {};
    const p = await own(req, b.partner_id);
    if (!p) return res.status(404).json({ error: 'Pilih mitra' });
    const day = parseDay(b.day);
    if (!day) return res.status(400).json({ error: 'Tanggal tidak valid' });
    await addPost(db, p.id, { day, title: b.title, url: b.url, product: b.product, ...Object.fromEntries(['fee', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'orders', 'revenue', 'commission'].map((k) => [k, parseNum(b[k])])) }, 'manual');
    await db.run('UPDATE partners SET updated_at = ? WHERE id = ?', now(), p.id);
    res.status(201).json({ ok: true });
  });

  app.delete('/api/partners/:team/posts/:postId', team, async (req, res) => {
    const row = await db.get('SELECT * FROM partner_posts WHERE id = ?', Number(req.params.postId));
    if (!row || !(await own(req, row.partner_id))) return res.status(404).json({ error: 'Data tidak ditemukan' });
    await db.run('DELETE FROM partner_posts WHERE id = ?', row.id);
    res.status(204).end();
  });

  // Impor CSV: satu baris = satu konten/periode milik seorang kreator. Kreator yang belum ada otomatis dibuat (status aktif).
  app.post('/api/partners/:team/import', team, async (req, res) => {
    const brandId = Number(req.body?.brand_id);
    if (!(await allowed(req)).has(brandId)) return res.status(403).json({ error: 'Pilih brand' });
    const rows = splitCsv(String(req.body?.csv || '').replace(/^﻿/, ''));
    let at = -1;
    let map = {};
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const m = mapHeader(rows[i]);
      if (m.partner !== undefined && ['views', 'orders', 'revenue', 'commission', 'fee', 'clicks', 'likes'].some((k) => m[k] !== undefined)) { at = i; map = m; break; }
    }
    if (at < 0) return res.status(400).json({ error: 'Judul kolom tidak dikenali. Wajib ada kolom kreator/username + minimal satu angka (views, pesanan, GMV, komisi, fee).' });
    const fallback = parseDay(req.body?.day) || new Date().toISOString().slice(0, 10);
    const existing = await db.all('SELECT id, name, handle FROM partners WHERE brand_id = ? AND team = ?', brandId, req.params.team);
    const key = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();
    const index = new Map();
    for (const p of existing) { index.set(key(p.name), p.id); if (p.handle) index.set(key(p.handle), p.id); }
    let added = 0;
    let created = 0;
    for (const r of rows.slice(at + 1)) {
      const get = (k) => (map[k] === undefined ? null : r[map[k]]);
      const who = String(get('partner') ?? '').trim();
      if (!who || /^(total|jumlah|grand total)/i.test(who)) continue;
      let pid = index.get(key(who));
      if (!pid) {
        const stamp = now();
        const [p] = await db.run(`INSERT INTO partners (brand_id, team, name, handle, platform, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, brandId, req.params.team, who.replace(/^@/, ''), who.startsWith('@') ? who.slice(1) : '',
        String(req.body?.platform || PARTNER_TEAMS[req.params.team].platforms[0]), req.params.team === 'kol' ? 'tayang' : 'aktif', req.user.username, stamp, stamp);
        pid = p.id;
        index.set(key(who), pid);
        created++;
      }
      const row = { day: map.day !== undefined ? parseDay(get('day')) || fallback : fallback, title: get('title'), url: get('url'), product: get('product') };
      for (const k of ['fee', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'orders', 'revenue', 'commission']) row[k] = parseNum(get(k));
      await addPost(db, pid, row, 'csv');
      added++;
    }
    res.json({ rows: added, created, columns: Object.keys(map) });
  });
}
