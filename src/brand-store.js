// Penyimpanan data kecil per brand (JSON di tabel settings) untuk fitur yang dulu menyimpan di browser:
// CS AI (agent, ongkir, promo, order, broadcast), riwayat & aktivitas agen AI, jadwal & omzet riil Kantor AI, ceklis Hari Ini.
// Dengan ini 2 laptop melihat data yang sama. List (order, aktivitas) diubah per item di server supaya penulisan bareng
// dari dua orang tidak saling menimpa seluruh daftar.
import { getSetting, setSetting } from './db.js';

const KEY = /^[a-z][a-z0-9._-]{0,79}$/i;
const MAX_BYTES = 900_000;
const sk = (brandId, key) => `store:${brandId}:${key}`;
const badKey = (key) => !KEY.test(key);

async function read(db, brandId, key) {
  const raw = await getSetting(db, sk(brandId, key));
  return raw == null ? null : JSON.parse(raw);
}
async function write(db, brandId, key, value) {
  const raw = JSON.stringify(value ?? null);
  if (raw.length > MAX_BYTES) throw Object.assign(new Error('Data terlalu besar untuk disimpan'), { status: 413 });
  await setSetting(db, sk(brandId, key), raw);
}

export function brandStoreRoutes(app, db, scope) {
  const handle = (fn) => async (req, res) => {
    if (badKey(req.params.key || 'ok')) return res.status(400).json({ error: 'Nama data tidak valid' });
    try { res.json(await fn(req)); } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  };

  // Ambil beberapa kunci sekaligus: /api/store?keys=cs.orders,cs.agents → { "cs.orders": [...], "cs.agents": null }
  app.get('/api/store', scope, handle(async (req) => {
    const keys = String(req.query.keys || '').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 60);
    if (keys.some(badKey)) throw Object.assign(new Error('Nama data tidak valid'), { status: 400 });
    const out = {};
    for (const k of keys) out[k] = await read(db, req.brand.id, k);
    return out;
  }));
  // Semua kunci dengan awalan tertentu (mis. agents.hist. → riwayat semua agen).
  app.get('/api/store-prefix/:key', scope, handle(async (req) => {
    const rows = await db.all('SELECT key, value FROM settings WHERE key LIKE ?', `${sk(req.brand.id, req.params.key)}%`);
    return Object.fromEntries(rows.map((r) => [r.key.slice(sk(req.brand.id, '').length), JSON.parse(r.value)]));
  }));

  app.put('/api/store/:key', scope, handle(async (req) => {
    await write(db, req.brand.id, req.params.key, req.body?.value);
    return { ok: true };
  }));

  // List: tambah/ganti item (berdasarkan id) di depan, potong ke cap.
  app.post('/api/store/:key/items', scope, handle(async (req) => {
    const item = req.body?.item;
    if (!item || item.id == null) throw Object.assign(new Error('Item butuh id'), { status: 400 });
    const cap = Math.min(Math.max(Number(req.body?.cap) || 500, 1), 2000);
    const list = (await read(db, req.brand.id, req.params.key)) || [];
    const next = [item, ...list.filter((x) => String(x.id) !== String(item.id))].slice(0, cap);
    await write(db, req.brand.id, req.params.key, next);
    return next;
  }));
  app.patch('/api/store/:key/items/:id', scope, handle(async (req) => {
    const list = (await read(db, req.brand.id, req.params.key)) || [];
    const next = list.map((x) => (String(x.id) === req.params.id ? { ...x, ...(req.body?.patch || {}) } : x));
    await write(db, req.brand.id, req.params.key, next);
    return next;
  }));
  app.delete('/api/store/:key/items/:id', scope, handle(async (req) => {
    const list = (await read(db, req.brand.id, req.params.key)) || [];
    const next = list.filter((x) => String(x.id) !== req.params.id);
    await write(db, req.brand.id, req.params.key, next);
    return next;
  }));
}
