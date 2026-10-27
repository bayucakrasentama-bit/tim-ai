// Alat profit & kesehatan toko (Tim MP & ADV), dari pola yang dibahas seller di Threads:
// - Profil biaya produk untuk Kalkulator BEP ROAS (hitungannya di browser, di sini cuma disimpan) + ROAS aktual brand.
// - Kesehatan toko per bulan: omzet per sumber (iklan, live, video, affiliate, organik lain) → porsi organik (target ≥ 40%).
// - Stok produk andalan (hero) → sisa hari stok.
// - ROAS gabungan: semua omzet marketplace brand ÷ semua biaya iklan brand (ADV + MP) di bulan yang sama,
//   supaya iklan Meta/Google yang mengarah ke marketplace tidak terlihat "rugi" hanya karena penjualannya tidak tercatat di Meta.
import { getSetting, setSetting } from './db.js';

const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const key = (kind, brandId) => `growth_${kind}:${brandId}`;
const load = async (db, kind, brandId) => JSON.parse((await getSetting(db, key(kind, brandId))) || '[]');
const save = (db, kind, brandId, list) => setSetting(db, key(kind, brandId), JSON.stringify(list));
const MONTH = /^\d{4}-\d{2}$/;

const PRODUCT_NUMS = ['hpp', 'price', 'admin_pct', 'program_pct', 'shipping_pct', 'affiliate_pct', 'tax_pct', 'process_fee', 'other_cost', 'target_margin_pct'];
const cleanProduct = (p, i) => ({
  id: str(p.id, 40) || `p${Date.now()}${i}`,
  name: str(p.name, 120),
  marketplace: str(p.marketplace, 40),
  ...Object.fromEntries(PRODUCT_NUMS.map((k) => [k, num(p[k])])),
});
const SOURCES = ['ads', 'live', 'video', 'affiliate', 'other'];
const cleanHealth = (r) => ({
  month: MONTH.test(r.month) ? r.month : new Date().toISOString().slice(0, 7),
  shop: str(r.shop, 80),
  ...Object.fromEntries(SOURCES.map((k) => [k, num(r[k]) ?? 0])),
});
const cleanHero = (h, i) => ({ id: str(h.id, 40) || `h${Date.now()}${i}`, name: str(h.name, 120), shop: str(h.shop, 80), stock: num(h.stock), daily_sales: num(h.daily_sales) });

// Biaya & omzet iklan per brand dari ad_daily (Tim ADV + Tim MP), dibatasi rentang tanggal.
async function adTotals(db, brandId, fromDay, toDay) {
  const rows = await db.all(`SELECT a.team, d.spend, d.revenue FROM ad_daily d JOIN ad_accounts a ON a.id = d.account_id
    WHERE a.brand_id = ? AND d.day >= ? AND d.day < ?`, brandId, fromDay, toDay);
  const out = { adv: { spend: 0, revenue: 0 }, mp: { spend: 0, revenue: 0 } };
  for (const r of rows) {
    const t = out[r.team] || (out[r.team] = { spend: 0, revenue: 0 });
    t.spend += Number(r.spend) || 0;
    t.revenue += Number(r.revenue) || 0;
  }
  return out;
}
const roas = (rev, spend) => (spend ? rev / spend : null);
const nextMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};

export function growthRoutes(app, db, scope) {
  const handle = (fn) => async (req, res) => {
    try { res.json(await fn(req)); } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
  };

  app.get('/api/growth/products', scope, handle(async (req) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
    const to = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
    const from = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
    const t = await adTotals(db, req.brand.id, from, to);
    return {
      products: await load(db, 'products', req.brand.id),
      actual: { days, mp: { ...t.mp, roas: roas(t.mp.revenue, t.mp.spend) }, adv: { ...t.adv, roas: roas(t.adv.revenue, t.adv.spend) } },
    };
  }));
  app.put('/api/growth/products', scope, handle(async (req) => {
    const list = (Array.isArray(req.body) ? req.body : []).slice(0, 100).map(cleanProduct).filter((p) => p.name);
    await save(db, 'products', req.brand.id, list);
    return list;
  }));

  app.get('/api/growth/health', scope, handle(async (req) => {
    const health = await load(db, 'health', req.brand.id);
    const months = [...new Set(health.map((h) => h.month))].sort().reverse().slice(0, 12);
    const blended = [];
    for (const m of months) {
      const t = await adTotals(db, req.brand.id, `${m}-01`, `${nextMonth(m)}-01`);
      const omzet = health.filter((h) => h.month === m).reduce((a, h) => a + SOURCES.reduce((s, k) => s + (h[k] || 0), 0), 0);
      const spend = t.adv.spend + t.mp.spend;
      blended.push({ month: m, omzet, spend_adv: t.adv.spend, spend_mp: t.mp.spend, spend, blended_roas: roas(omzet, spend), meta_reported: t.adv.revenue + t.mp.revenue });
    }
    return { health, heroes: await load(db, 'heroes', req.brand.id), blended };
  }));
  app.put('/api/growth/health', scope, handle(async (req) => {
    const row = cleanHealth(req.body || {});
    if (!row.shop) throw Object.assign(new Error('Isi nama toko'), { status: 400 });
    const list = (await load(db, 'health', req.brand.id)).filter((h) => !(h.month === row.month && h.shop === row.shop));
    list.push(row);
    await save(db, 'health', req.brand.id, list.slice(-300));
    return { ok: true };
  }));
  app.delete('/api/growth/health', scope, handle(async (req) => {
    const list = (await load(db, 'health', req.brand.id)).filter((h) => !(h.month === req.query.month && h.shop === req.query.shop));
    await save(db, 'health', req.brand.id, list);
    return { ok: true };
  }));
  app.put('/api/growth/heroes', scope, handle(async (req) => {
    const list = (Array.isArray(req.body) ? req.body : []).slice(0, 50).map(cleanHero).filter((h) => h.name);
    await save(db, 'heroes', req.brand.id, list);
    return list;
  }));
}
