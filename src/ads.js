// Tim ADV (iklan Meta/TikTok/Google) & Tim MP (iklan marketplace: Shopee, TikTok Shop, Tokopedia, Lazada).
// Satu tim mengelola akun iklan dari banyak brand sekaligus. Angka harian per kampanye masuk lewat:
// - tarik otomatis dari Meta Marketing API (akun Meta Ads yang tersambung, juga lewat Integrasi Cepat),
// - impor CSV/Excel-ke-CSV hasil export dashboard iklan (semua platform),
// - input manual.
import { now } from './db.js';
import { brandsFor } from './team.js';
import { GRAPH_VERSION, bases, readJson } from './connectors/http.js';

export const AD_PLATFORMS = {
  adv: { meta: 'Meta Ads (FB/IG)', tiktok_ads: 'TikTok Ads', google_ads: 'Google Ads', lainnya: 'Lainnya' },
  mp: { shopee_ads: 'Shopee Ads', tiktok_shop_ads: 'TikTok Shop Ads (GMV Max)', tokopedia_ads: 'TopAds Tokopedia', lazada_ads: 'Lazada Sponsored', lainnya: 'Lainnya' },
};
const isTeam = (t) => Object.hasOwn(AD_PLATFORMS, t);
const STALE_MS = 6 * 3600e3;

// "Rp1.234.567,89" / "1,234.56" / "12.5%" -> angka. Kosong -> null.
export function parseNum(v) {
  if (v == null) return null;
  let s = String(v).trim().replace(/[^0-9.,-]/g, '');
  if (!s || s === '-') return null;
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  if (dot > -1 && comma > -1) {
    s = dot > comma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (comma > -1) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (dot > -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Tanggal dari berbagai format export -> YYYY-MM-DD.
export function parseDay(v) {
  const s = String(v || '').trim();
  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export function splitCsv(text) {
  const firstLines = text.split(/\r?\n/).slice(0, 15).join('\n');
  const delim = [';', '\t', ','].map((d) => [d, firstLines.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// Kolom dikenali dari judulnya (export Meta, TikTok, Google, Shopee, TikTok Shop, Tokopedia, Lazada, Indonesia/Inggris).
const COLS = [
  ['day', /^(date|tanggal|day|hari|waktu|reporting starts|periode|time|by day)/],
  ['revenue', /(revenue|gmv|omzet|omset|penjualan|purchase.*value|conversion value|nilai konversi|pendapatan|sales amount|gross)/],
  ['spend', /(spend|spent|biaya|pengeluaran|cost|expense|modal iklan|total biaya)/],
  ['impressions', /(impression|impresi|tayangan|dilihat)/],
  ['clicks', /(click|klik)/],
  ['conversions', /(conversion|konversi|pesanan|order|purchase|pembelian|results|hasil|terjual|produk terjual|items sold)/],
  ['campaign', /(campaign|kampanye|iklan|ad name|nama iklan|ad group|produk|product|nama)/],
];
const SKIP = /(per |cpc|ctr|cpm|cpa|rate|roas|rasio|ratio|persen|%|avg|rata)/;

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

export function parseAdsCsv(text, fallbackDay) {
  const rows = splitCsv(String(text || '').replace(/^﻿/, ''));
  // Beberapa export (Shopee) punya baris keterangan sebelum judul kolom.
  let headerAt = -1;
  let map = {};
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const m = mapHeader(rows[i]);
    const metrics = ['spend', 'impressions', 'clicks', 'conversions', 'revenue'].filter((k) => m[k] !== undefined).length;
    if (metrics >= 2) { headerAt = i; map = m; break; }
  }
  if (headerAt < 0) throw new Error('Judul kolom tidak dikenali. Minimal ada 2 kolom angka seperti Biaya/Spend, Impresi, Klik, Pesanan/Konversi, Penjualan/GMV.');
  const out = [];
  for (const r of rows.slice(headerAt + 1)) {
    const get = (k) => (map[k] === undefined ? null : r[map[k]]);
    const label = String(get('campaign') ?? '').trim();
    if (/^(total|grand total|jumlah|summary)/i.test(label)) continue;
    const day = map.day !== undefined ? parseDay(get('day')) : fallbackDay;
    if (!day) continue;
    const row = {
      day, campaign: label.slice(0, 200),
      spend: parseNum(get('spend')), impressions: parseNum(get('impressions')), clicks: parseNum(get('clicks')),
      conversions: parseNum(get('conversions')), revenue: parseNum(get('revenue')),
    };
    if ([row.spend, row.impressions, row.clicks, row.conversions, row.revenue].every((x) => x == null)) continue;
    out.push(row);
  }
  return { rows: out, columns: Object.keys(map) };
}

async function upsertRow(db, accountId, r, source) {
  const int = (v) => (v == null ? null : Math.round(Number(v)));
  await db.run(`INSERT INTO ad_daily (account_id, day, campaign, spend, impressions, clicks, conversions, revenue, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (account_id, day, campaign) DO UPDATE SET spend = excluded.spend, impressions = excluded.impressions,
    clicks = excluded.clicks, conversions = excluded.conversions, revenue = excluded.revenue, source = excluded.source, updated_at = excluded.updated_at`,
  accountId, r.day, String(r.campaign || ''), r.spend == null ? null : Number(r.spend), int(r.impressions), int(r.clicks), int(r.conversions),
  r.revenue == null ? null : Number(r.revenue), source, now());
}

// ---- Meta Marketing API: insights harian per kampanye ----
const PURCHASE = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'];
const FALLBACK = ['lead', 'onsite_conversion.lead_grouped', 'onsite_conversion.messaging_conversation_started_7d'];
const pickAction = (list, types) => {
  for (const t of types) {
    const hit = (list || []).find((a) => a.action_type === t);
    if (hit) return Number(hit.value);
  }
  return null;
};

export async function syncMetaAccount(db, acc, days = 30) {
  const creds = JSON.parse(acc.credentials || '{}');
  if (!creds.accessToken) throw new Error('Token Meta belum ada. Sambungkan lewat menu Integrasi Cepat (Login dengan Facebook) atau isi token akses.');
  const act = acc.external_id.startsWith('act_') ? acc.external_id : `act_${acc.external_id}`;
  const until = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  let url = `${bases.graph()}/${GRAPH_VERSION}/${act}/insights?${new URLSearchParams({
    level: 'campaign', time_increment: '1', limit: '500',
    fields: 'campaign_name,spend,impressions,clicks,actions,action_values',
    time_range: JSON.stringify({ since, until }), access_token: creds.accessToken,
  })}`;
  let count = 0;
  for (let page = 0; url && page < 30; page++) {
    const body = await readJson(await fetch(url), 'Meta Ads');
    for (const r of body.data || []) {
      const purchases = pickAction(r.actions, PURCHASE);
      await upsertRow(db, acc.id, {
        day: r.date_start, campaign: r.campaign_name || '',
        spend: Number(r.spend || 0), impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0),
        conversions: purchases ?? pickAction(r.actions, FALLBACK), revenue: pickAction(r.action_values, PURCHASE),
      }, 'meta');
      count++;
    }
    url = body.paging?.next || null;
  }
  await db.run('UPDATE ad_accounts SET synced_at = ?, error = NULL WHERE id = ?', now(), acc.id);
  return count;
}

// Akun Meta yang datanya sudah lewat 6 jam (atau belum pernah ditarik) -> tarik ulang, beberapa akun sekaligus.
// Dipanggil cron dan otomatis saat halaman Tim ADV dibuka, jadi tidak perlu klik "Tarik data" satu per satu.
export async function syncStaleAds(db, brandIds = null) {
  const accs = (await db.all("SELECT * FROM ad_accounts WHERE platform = 'meta'"))
    .filter((a) => !brandIds || brandIds.has(a.brand_id))
    .filter((a) => !a.synced_at || Date.now() - new Date(a.synced_at).getTime() >= STALE_MS)
    .filter((a) => JSON.parse(a.credentials || '{}').accessToken);
  let rows = 0;
  let failed = 0;
  const queue = [...accs];
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      // Belum pernah ditarik -> ambil 30 hari; sesudahnya cukup 7 hari terakhir (angka Meta masih bisa berubah beberapa hari).
      try { rows += await syncMetaAccount(db, a, a.synced_at ? 7 : 30); } catch (err) {
        failed++;
        await db.run('UPDATE ad_accounts SET error = ?, synced_at = ? WHERE id = ?', err.message.slice(0, 500), now(), a.id);
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  return { accounts: accs.length, rows, failed };
}

// ---- Laporan (semua brand yang boleh diakses, atau satu brand) ----
const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
function metricsOf(rows) {
  const t = { spend: sum(rows, 'spend'), impressions: sum(rows, 'impressions'), clicks: sum(rows, 'clicks'), conversions: sum(rows, 'conversions'), revenue: sum(rows, 'revenue') };
  return {
    ...t,
    roas: t.spend ? t.revenue / t.spend : null,
    cpa: t.conversions ? t.spend / t.conversions : null,
    ctr: t.impressions ? t.clicks / t.impressions : null,
    cpc: t.clicks ? t.spend / t.clicks : null,
    cvr: t.clicks ? t.conversions / t.clicks : null,
  };
}
const groupBy = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
};

export async function adsReport(db, user, team, { brandId = null, from = null, to = null } = {}) {
  const brands = (await brandsFor(db, user)).filter((b) => !brandId || b.id === brandId);
  const empty = { team, brands: brands.map((b) => ({ id: b.id, name: b.name })), totals: metricsOf([]), byBrand: [], byAccount: [], byPlatform: [], campaigns: [], daily: [], accounts: [] };
  if (!brands.length) return empty;
  const ids = brands.map((b) => b.id);
  const accounts = await db.all(`SELECT * FROM ad_accounts WHERE team = ? AND brand_id IN (${ids.map(() => '?').join(',')}) ORDER BY brand_id, name`, team, ...ids);
  if (!accounts.length) return empty;
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const fromDay = from ? String(from).slice(0, 10) : null;
  const toDay = to ? String(to).slice(0, 10) : null;
  const rows = (await db.all(`SELECT * FROM ad_daily WHERE account_id IN (${accounts.map(() => '?').join(',')}) ORDER BY day`, ...accounts.map((a) => a.id)))
    .filter((r) => (!fromDay || r.day >= fromDay) && (!toDay || r.day < toDay))
    .map((r) => ({ ...r, brand_id: accById.get(r.account_id).brand_id, platform: accById.get(r.account_id).platform }));
  const labels = AD_PLATFORMS[team];
  const block = (map, label) => [...map].map(([k, list]) => ({ key: label(k), ...metricsOf(list) })).sort((a, b) => b.spend - a.spend);
  return {
    team,
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    totals: metricsOf(rows),
    byBrand: block(groupBy(rows, (r) => r.brand_id), (k) => brandName.get(k)),
    byAccount: [...groupBy(rows, (r) => r.account_id)].map(([k, list]) => {
      const a = accById.get(k);
      return { key: a.name, brand: brandName.get(a.brand_id), platform: labels[a.platform] || a.platform, ...metricsOf(list) };
    }).sort((a, b) => b.spend - a.spend),
    byPlatform: block(groupBy(rows, (r) => r.platform), (k) => labels[k] || k),
    campaigns: [...groupBy(rows, (r) => `${r.account_id}|${r.campaign}`)].map(([k, list]) => {
      const a = accById.get(Number(k.split('|')[0]));
      return { key: list[0].campaign || '(tanpa nama)', account: a.name, brand: brandName.get(a.brand_id), ...metricsOf(list) };
    }).sort((a, b) => b.spend - a.spend).slice(0, 25),
    daily: [...groupBy(rows, (r) => r.day)].map(([day, list]) => ({ day, ...metricsOf(list) })),
    accounts: accounts.map((a) => ({
      id: a.id, name: a.name, brand: brandName.get(a.brand_id), platform: labels[a.platform] || a.platform,
      synced_at: a.synced_at, error: a.error, rows: rows.filter((r) => r.account_id === a.id).length,
    })),
  };
}

export function adsRoutes(app, db) {
  const team = (req, res, next) => (isTeam(req.params.team) ? next() : res.status(404).json({ error: 'Tim tidak dikenal' }));
  const allowedBrandIds = async (req) => new Set((await brandsFor(db, req.user)).map((b) => b.id));
  async function ownAccount(req) {
    const a = await db.get('SELECT * FROM ad_accounts WHERE id = ? AND team = ?', Number(req.params.id || req.body?.account_id), req.params.team);
    if (!a || !(await allowedBrandIds(req)).has(a.brand_id)) return null;
    return a;
  }
  const publicAcc = (a) => ({ id: a.id, brand_id: a.brand_id, platform: a.platform, name: a.name, external_id: a.external_id,
    has_token: !!JSON.parse(a.credentials || '{}').accessToken, error: a.error, synced_at: a.synced_at, created_at: a.created_at });

  app.get('/api/ads/:team/accounts', team, async (req, res) => {
    const ids = [...(await allowedBrandIds(req))];
    if (!ids.length) return res.json({ platforms: AD_PLATFORMS[req.params.team], accounts: [] });
    const rows = await db.all(`SELECT * FROM ad_accounts WHERE team = ? AND brand_id IN (${ids.map(() => '?').join(',')}) ORDER BY brand_id, name`, req.params.team, ...ids);
    res.json({ platforms: AD_PLATFORMS[req.params.team], accounts: rows.map(publicAcc) });
  });

  app.post('/api/ads/:team/accounts', team, async (req, res) => {
    const b = req.body || {};
    const brandId = Number(b.brand_id);
    if (!(await allowedBrandIds(req)).has(brandId)) return res.status(403).json({ error: 'Pilih brand yang kamu pegang' });
    if (!AD_PLATFORMS[req.params.team][b.platform]) return res.status(400).json({ error: 'Platform tidak dikenal' });
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nama akun wajib diisi' });
    const creds = b.access_token ? { accessToken: String(b.access_token).trim() } : {};
    const [row] = await db.run(`INSERT INTO ad_accounts (brand_id, team, platform, name, external_id, credentials, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`, brandId, req.params.team, b.platform, name, String(b.external_id || '').trim(), JSON.stringify(creds), req.user.username, now());
    res.status(201).json(publicAcc(row));
  });

  app.patch('/api/ads/:team/accounts/:id', team, async (req, res) => {
    const a = await ownAccount(req);
    if (!a) return res.status(404).json({ error: 'Akun iklan tidak ditemukan' });
    const b = req.body || {};
    const creds = JSON.parse(a.credentials || '{}');
    if (typeof b.access_token === 'string' && b.access_token.trim()) creds.accessToken = b.access_token.trim();
    // Pindah brand: hanya ke brand yang juga dipegang user ini.
    const brandId = b.brand_id == null || b.brand_id === '' ? a.brand_id : Number(b.brand_id);
    if (!(await allowedBrandIds(req)).has(brandId)) return res.status(403).json({ error: 'Pilih brand yang kamu pegang' });
    const [row] = await db.run('UPDATE ad_accounts SET name = ?, external_id = ?, credentials = ?, brand_id = ? WHERE id = ? RETURNING *',
      String(b.name ?? a.name).trim() || a.name, String(b.external_id ?? a.external_id).trim(), JSON.stringify(creds), brandId, a.id);
    res.json(publicAcc(row));
  });

  app.delete('/api/ads/:team/accounts/:id', team, async (req, res) => {
    const a = await ownAccount(req);
    if (!a) return res.status(404).json({ error: 'Akun iklan tidak ditemukan' });
    await db.run('DELETE FROM ad_daily WHERE account_id = ?', a.id);
    await db.run('DELETE FROM ad_accounts WHERE id = ?', a.id);
    res.status(204).end();
  });

  app.post('/api/ads/:team/accounts/:id/sync', team, async (req, res) => {
    const a = await ownAccount(req);
    if (!a) return res.status(404).json({ error: 'Akun iklan tidak ditemukan' });
    if (a.platform !== 'meta') return res.status(400).json({ error: 'Tarik otomatis baru tersedia untuk Meta Ads. Platform lain: impor CSV hasil export.' });
    try {
      res.json({ rows: await syncMetaAccount(db, a, Math.min(Math.max(Number(req.body?.days) || 30, 1), 90)) });
    } catch (err) {
      await db.run('UPDATE ad_accounts SET error = ? WHERE id = ?', err.message.slice(0, 500), a.id);
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/ads/:team/sync-stale', team, async (req, res) => {
    res.json(await syncStaleAds(db, await allowedBrandIds(req)));
  });

  app.post('/api/ads/:team/rows', team, async (req, res) => {
    const a = await ownAccount(req);
    if (!a) return res.status(404).json({ error: 'Pilih akun iklan' });
    const b = req.body || {};
    const day = parseDay(b.day);
    if (!day) return res.status(400).json({ error: 'Tanggal tidak valid' });
    await upsertRow(db, a.id, { day, campaign: String(b.campaign || '').trim(), spend: parseNum(b.spend), impressions: parseNum(b.impressions),
      clicks: parseNum(b.clicks), conversions: parseNum(b.conversions), revenue: parseNum(b.revenue) }, 'manual');
    res.status(201).json({ ok: true });
  });

  app.post('/api/ads/:team/import', team, async (req, res) => {
    const a = await ownAccount(req);
    if (!a) return res.status(404).json({ error: 'Pilih akun iklan' });
    try {
      const { rows, columns } = parseAdsCsv(req.body?.csv, parseDay(req.body?.day) || new Date().toISOString().slice(0, 10));
      for (const r of rows) await upsertRow(db, a.id, r, 'csv');
      res.json({ rows: rows.length, columns, days: [...new Set(rows.map((r) => r.day))].sort() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/ads/:team/rows', team, async (req, res) => {
    const a = await ownAccount({ ...req, params: { ...req.params, id: req.query.account_id } });
    if (!a) return res.status(404).json({ error: 'Akun iklan tidak ditemukan' });
    res.json(await db.all('SELECT * FROM ad_daily WHERE account_id = ? ORDER BY day DESC, campaign LIMIT 500', a.id));
  });

  app.delete('/api/ads/:team/rows/:rowId', team, async (req, res) => {
    const row = await db.get('SELECT * FROM ad_daily WHERE id = ?', Number(req.params.rowId));
    const a = row && (await ownAccount({ ...req, params: { ...req.params, id: row.account_id } }));
    if (!a) return res.status(404).json({ error: 'Data tidak ditemukan' });
    await db.run('DELETE FROM ad_daily WHERE id = ?', row.id);
    res.status(204).end();
  });
}
