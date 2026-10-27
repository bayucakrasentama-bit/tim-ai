// Laporan per tim (sesuai job desk):
// - konten: produksi konten (planner), aset visual & video, Launch Lab.
// - medsos: distribusi (post), performa (analitik), riset TikTok (scraper).
// - cs: chat (impor Desty) + tiket komplain/retur.
import { productionReport, metricRows, summarize } from './analytics.js';
import { csReport } from './cs.js';
import { er } from './tiktok.js';
import { adsReport, AD_PLATFORMS } from './ads.js';
import { partnersReport } from './partners.js';
import { teamAiRoutes } from './team-ai.js';

const inRange = (iso, from, to) => iso && (!from || iso >= from) && (!to || iso < to);
const countBy = (rows, f) => rows.reduce((m, r) => ({ ...m, [r[f]]: (m[r[f]] || 0) + 1 }), {});

export async function kontenReport(db, brandId, range, ownerUsername) {
  const production = await productionReport(db, brandId, range, ownerUsername);
  const assets = (await db.all(`
    SELECT a.kind, a.name, a.created_by, a.created_at FROM content_assets a
    JOIN content_items c ON c.id = a.content_id WHERE c.brand_id = ?
  `, brandId)).filter((x) => inRange(x.created_at, range.from, range.to));
  const launch = (await db.all('SELECT stage, published, created_at, updated_at FROM launch_projects WHERE brand_id = ?', brandId))
    .filter((x) => inRange(x.updated_at, range.from, range.to));
  const byPerson = {};
  for (const x of assets) {
    const p = (byPerson[x.created_by || '-'] ||= { name: x.created_by || '-', images: 0, videos: 0, motion: 0 });
    if (x.kind === 'image') p.images++;
    else p.videos++;
    if (/^video-motion/.test(x.name)) p.motion++;
  }
  return {
    ...production,
    assets: {
      total: assets.length,
      images: assets.filter((x) => x.kind === 'image').length,
      videos: assets.filter((x) => x.kind === 'video').length,
      motion: assets.filter((x) => /^video-motion/.test(x.name)).length,
      byPerson: Object.values(byPerson).sort((x, y) => (y.images + y.videos) - (x.images + x.videos)),
    },
    launch: { total: launch.length, published: launch.filter((x) => x.published).length, byStage: countBy(launch, 'stage') },
  };
}

// Tim Digital: Launch Lab (riset sampai landing page) + halaman LP Builder.
export async function digitalReport(db, brandId, range) {
const projects = await db.all('SELECT id, name, niche, stage, published, slug, data, created_by, created_at, updated_at FROM launch_projects WHERE brand_id = ?', brandId);
const active = projects.filter((x) => inRange(x.updated_at, range.from, range.to));
const pages = await db.all('SELECT id, name, slug, published, created_by, created_at, updated_at FROM lp_pages WHERE brand_id = ?', brandId);
const summary = (p) => {
const d = JSON.parse(p.data || '{}');
const c = d.research?.concepts?.[d.research?.chosen ?? 0];
return {
name: p.name, niche: p.niche, stage: p.stage, published: !!p.published, slug: p.slug, by: p.created_by, updated_at: p.updated_at,
concept: c ? { name: c.name, price: c.price, demand_score: c.demand_score ?? null } : null,
hooks: (d.copy?.hooks || []).length, scripts: (d.copy?.scripts || []).length, ads: (d.copy?.ads || []).length,
landing_ready: !!d.landing?.headline, cta_url: d.landing?.cta_url || null,
};
};
return {
launch: { total: projects.length, active: active.length, published: projects.filter((x) => x.published).length, byStage: countBy(projects, 'stage'), projects: projects.map(summary) },
pages: { total: pages.length, published: pages.filter((x) => x.published).length, updated: pages.filter((x) => inRange(x.updated_at, range.from, range.to)).length,
list: pages.map((p) => ({ name: p.name, slug: p.slug, published: !!p.published, by: p.created_by, updated_at: p.updated_at })) },
};
}

export async function medsosReport(db, brandId, range, ownerUsername) {
  const production = await productionReport(db, brandId, range, ownerUsername);
  const performance = summarize(await metricRows(db, brandId, range));
  const vids = (await db.all('SELECT * FROM tiktok_videos WHERE brand_id = ?', brandId))
    .filter((v) => inRange(v.posted_at || v.created_at, range.from, range.to));
  const labels = {};
  for (const v of vids) {
    const g = (labels[v.label] ||= { label: v.label, videos: 0, views: 0, engagement: 0 });
    g.videos++;
    g.views += v.views || 0;
    g.engagement += (v.likes || 0) + (v.comments || 0) + (v.shares || 0) + (v.saves || 0);
  }
  return {
    distribution: production.distribution,
    performance: { totals: performance.totals, funnel: performance.funnel, byPlatform: performance.byPlatform, top: performance.top, bestTimes: performance.bestTimes },
    tiktok: {
      videos: vids.length,
      errors: vids.filter((v) => v.error).length,
      byLabel: Object.values(labels).map((g) => ({ ...g, avg_views: g.videos ? Math.round(g.views / g.videos) : 0, er: g.views ? g.engagement / g.views : null })),
      top: [...vids].sort((x, y) => (y.views || 0) - (x.views || 0)).slice(0, 10)
        .map((v) => ({ url: v.url, username: v.username, caption: String(v.caption || '').slice(0, 120), label: v.label, views: v.views, er: er(v) })),
    },
  };
}

// Tim ADV & MP memegang banyak brand: laporannya mencakup semua brand yang boleh diakses (atau ?only=<brandId>).
const adsBuilder = (team) => (db, _brandId, rg, _owner, req) => adsReport(db, req.user, team, { brandId: Number(req.query?.only) || null, ...rg });
const partnerBuilder = (team) => (db, _brandId, rg, _owner, req) => partnersReport(db, req.user, team, { brandId: Number(req.query?.only) || null, ...rg });
const BUILDERS = { konten: kontenReport, medsos: medsosReport, digital: digitalReport, adv: adsBuilder('adv'), mp: adsBuilder('mp'), kol: partnerBuilder('kol'), affiliate: partnerBuilder('affiliate'), cs: csReport };
export const REPORT_TEAMS = Object.keys(BUILDERS);
// Dipakai halaman Laporan, Master BCS, dan MCP. req butuh: user, brand, query.
export function teamReport(db, team, req, range, ownerUsername = 'admin') {
  return BUILDERS[team](db, req.brand.id, range, ownerUsername, req);
}

// Baris datar untuk CSV per tim.
function csvRows(team, r) {
  const pct = (v) => (v == null ? '' : `${(v * 100).toFixed(1)}%`);
  if (team === 'konten') {
    return [
      ['Bagian', 'Nama', 'Total', 'Tayang/Selesai', 'Tepat waktu', 'Telat', 'Lewat jadwal'],
      ...r.people.map((p) => ['PIC', p.name, p.total, p.tayang, p.on_time, p.late, p.overdue]),
      ...r.assets.byPerson.map((p) => ['Aset', p.name, p.images + p.videos, `${p.images} gambar / ${p.videos} video`, `${p.motion} Video Motion`, '', '']),
      ['Launch Lab', 'Proyek', r.launch.total, `${r.launch.published} terbit`, '', '', ''],
    ];
  }
  if (team === 'digital') {
return [
['Bagian', 'Nama', 'Tahap / status', 'Terbit', 'Hook', 'Script', 'Iklan'],
...r.launch.projects.map((p) => ['Launch Lab', p.name, p.stage, p.published ? `/lp/${p.slug}` : '', p.hooks, p.scripts, p.ads]),
...r.pages.list.map((p) => ['LP Builder', p.name, p.published ? 'terbit' : 'draft', p.published ? `/p/${p.slug}` : '', '', '', '']),
];
}
if (team === 'adv' || team === 'mp') {
const f = (v, d = 0) => (v == null ? '' : Number(v).toFixed(d));
return [
['Bagian', 'Nama', 'Brand', 'Spend', 'Impresi', 'Klik', 'Konversi', 'Revenue', 'ROAS', 'CPA', 'CTR'],
...r.byAccount.map((a) => ['Akun', `${a.key} (${a.platform})`, a.brand, f(a.spend), a.impressions, a.clicks, a.conversions, f(a.revenue), f(a.roas, 2), f(a.cpa), pct(a.ctr)]),
...r.campaigns.map((c) => ['Kampanye', c.key, c.brand, f(c.spend), c.impressions, c.clicks, c.conversions, f(c.revenue), f(c.roas, 2), f(c.cpa), pct(c.ctr)]),
...r.daily.map((d) => ['Harian', d.day, '', f(d.spend), d.impressions, d.clicks, d.conversions, f(d.revenue), f(d.roas, 2), f(d.cpa), pct(d.ctr)]),
];
}
if (team === 'kol' || team === 'affiliate') {
const f = (v, d = 0) => (v == null ? '' : Number(v).toFixed(d));
return [
['Mitra', 'Brand', 'Platform', 'Status', 'Konten', 'Views', 'Median views', 'Viral dependency', 'ER', 'Biaya (fee+komisi)', 'CPV', 'Pesanan', 'Omzet', 'ROAS'],
...r.partners.map((p) => [p.name, p.brand, p.platform, p.status, p.posts, p.views, f(p.median_views), f(p.viral_dependency, 2), pct(p.er), f(p.cost), f(p.cpv, 2), p.orders, f(p.revenue), f(p.roas, 2)]),
];
}
if (team === 'medsos') {
    return [
      ['Bagian', 'Nama', 'Nilai 1', 'Nilai 2', 'Nilai 3'],
      ...r.distribution.byPlatform.map((g) => ['Distribusi', g.platform, `${g.success} berhasil`, `${g.failed} gagal`, `${g.pending} menunggu`]),
      ...r.performance.byPlatform.map((g) => ['Performa', g.key, `${g.views} views`, `ER ${pct(g.engagement_rate)}`, `${g.sales} sales`]),
      ...r.tiktok.byLabel.map((g) => ['TikTok', g.label, `${g.videos} video`, `rata-rata ${g.avg_views} views`, `ER ${pct(g.er)}`]),
    ];
  }
  return [
    ['Bagian', 'Nama', 'Pelanggan', 'Dibalas', 'Tingkat respons', 'Balas ≤5 menit', 'Rata-rata respons (menit)', 'Konversi'],
    ...r.staff.map((s) => ['Staf', s.key, s.customers, s.customers_replied, pct(s.response_rate), pct(s.within_5m), s.avg_first_response?.toFixed(1) ?? '', '']),
    ...r.shops.map((s) => ['Toko', `${s.key} (${s.marketplace})`, s.customers, s.customers_replied, pct(s.response_rate), '', s.avg_first_response?.toFixed(1) ?? '', `${s.converted} (${pct(s.conversion_rate)})`]),
    ...r.tickets.byAgent.map((a) => ['Tiket', a.key, a.total, a.selesai, `SLA ${a.sla_met}/${a.selesai}`, `${a.overdue} lewat batas`, '', '']),
    ...r.inbox.staff.map((s) => ['Inbox (staf)', s.key, s.conversations, s.replies, '', pct(s.within_5m), s.avg_first_response?.toFixed(1) ?? '', '']),
    ...r.inbox.channels.map((c) => ['Inbox (channel)', `${c.key} (${c.platform})`, c.customers, c.replied, pct(c.customers ? c.replied / c.customers : null), pct(c.within_5m), c.avg_first_response?.toFixed(1) ?? '', '']),
  ];
}

export function reportRoutes(app, db, scope, { ownerUsername = 'admin' } = {}) {
  const range = (q) => ({ from: q.from ? String(q.from) : null, to: q.to ? String(q.to) : null });
  const build = BUILDERS;
  const buildTeamReport = (team, req, rg) => teamReport(db, team, req, rg, ownerUsername);

  app.get('/api/reports/team/:team', scope, async (req, res) => {
    if (!build[req.params.team]) return res.status(404).json({ error: 'Tim tidak dikenal' });
    res.json(await buildTeamReport(req.params.team, req, range(req.query)));
  });

  app.get('/api/reports/team/:team/export.csv', scope, async (req, res) => {
    if (!build[req.params.team]) return res.status(404).json({ error: 'Tim tidak dikenal' });
    const rows = csvRows(req.params.team, await buildTeamReport(req.params.team, req, range(req.query)));
    const cell = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-${req.params.team}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`﻿${rows.map((r) => r.map(cell).join(',')).join('\n')}`);
  });

  teamAiRoutes(app, db, scope, { buildTeamReport, teams: Object.keys(build), platforms: AD_PLATFORMS });
}
