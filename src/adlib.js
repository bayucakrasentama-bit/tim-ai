// Intel Iklan (Meta Ad Library): keyword di-scan agen Mac (Playwright) lalu hasilnya
// di-ingest ke sini. Metrik inti: umur iklan (longevity), velocity (creative baru/minggu),
// kejenuhan segmen (jumlah advertiser), dan kandidat pemenang = iklan yang tayang paling lama.
// Sisi agen dikunci token Bearer (dipakai juga oleh Motion Factory = FACTORY_AGENT_TOKEN).
import { now } from './db.js';
import { safeEqual } from './auth.js';

const clean = (s) => String(s ?? '').trim();
const parseArr = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };

// Umur iklan dalam hari (start_date YYYY-MM-DD vs sekarang). Null kalau tanggal tak dikenal.
export function ageDays(start) {
  if (!start) return null;
  const t = Date.parse(String(start).slice(0, 10));
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

const adOut = (r) => ({
  creative_id: r.creative_id,
  keyword_id: r.keyword_id ?? null,
  page_name: r.page_name,
  start_date: r.start_date,
  age_days: ageDays(r.start_date),
  body_text: r.body_text,
  platforms: parseArr(r.platforms),
  video: !!r.video,
  snapshot_url: r.snapshot_url,
  first_seen: r.first_seen,
  last_seen: r.last_seen,
  active: !!r.active,
});

export function adlibAgentRoutes(app, db, { token } = {}) {
  const guard = (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!token || !m || !safeEqual(m[1], token)) return res.status(401).json({ error: 'Token agen salah' });
    next();
  };

  // Daftar keyword aktif untuk di-scan agen Mac.
  app.get('/api/adlib/agent/keywords', guard, async (req, res) =>
    res.json({ keywords: await db.all('SELECT id, keyword, country FROM adlib_keywords WHERE active = 1 ORDER BY id') }));

  // Agen boleh menambah/mengaktifkan keyword (bootstrap dari sisi scanner) — idempoten.
  app.post('/api/adlib/agent/keywords', guard, async (req, res) => {
    const keyword = clean(req.body?.keyword).slice(0, 200);
    const country = clean(req.body?.country).toUpperCase().slice(0, 2) || 'ID';
    if (!keyword) return res.status(400).json({ error: 'Keyword wajib diisi' });
    const old = await db.get('SELECT * FROM adlib_keywords WHERE keyword = ? AND country = ?', keyword, country);
    if (old) {
      if (!old.active) await db.run('UPDATE adlib_keywords SET active = 1 WHERE id = ?', old.id);
      return res.json({ keyword: old, created: false });
    }
    const rows = await db.run(
      'INSERT INTO adlib_keywords (keyword, country, active, created_at) VALUES (?, ?, 1, ?) RETURNING *',
      keyword, country, now(),
    );
    res.json({ keyword: rows[0], created: true });
  });

  // Ingest hasil scan: { keyword_id, started_at, finished_at, complete, ads: [...] }.
  // complete=true → creative keyword itu yang tidak muncul di batch ini dianggap sudah berhenti.
  app.post('/api/adlib/agent/ingest', guard, async (req, res) => {
    const b = req.body || {};
    const kw = await db.get('SELECT * FROM adlib_keywords WHERE id = ?', Number(b.keyword_id));
    if (!kw) return res.status(404).json({ error: 'Keyword tidak ditemukan' });
    const ads = Array.isArray(b.ads) ? b.ads.slice(0, 3000) : [];
    const ts = now();
    let saved = 0;
    let newCount = 0;
    for (const a of ads) {
      const cid = clean(a.creative_id);
      if (!cid) continue;
      const row = {
        page_name: clean(a.page_name).slice(0, 300),
        start_date: clean(a.start_date).slice(0, 10) || null,
        body_text: String(a.body_text ?? '').slice(0, 5000),
        platforms: JSON.stringify(Array.isArray(a.platforms) ? a.platforms.map(clean).filter(Boolean).slice(0, 10) : []),
        video: a.video ? 1 : 0,
        snapshot_url: clean(a.snapshot_url).slice(0, 1000) || null,
      };
      const old = await db.get('SELECT id FROM adlib_ads WHERE creative_id = ?', cid);
      if (old) {
        await db.run(
          'UPDATE adlib_ads SET keyword_id = ?, page_name = ?, start_date = ?, body_text = ?, platforms = ?, video = ?, snapshot_url = ?, last_seen = ?, active = 1 WHERE id = ?',
          kw.id, row.page_name, row.start_date, row.body_text, row.platforms, row.video, row.snapshot_url, ts, old.id,
        );
      } else {
        await db.run(
          `INSERT INTO adlib_ads (creative_id, keyword_id, page_name, start_date, body_text, platforms, video, snapshot_url, first_seen, last_seen, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          cid, kw.id, row.page_name, row.start_date, row.body_text, row.platforms, row.video, row.snapshot_url, ts, ts,
        );
        newCount++;
      }
      saved++;
    }
    if (b.complete && b.started_at) {
      // started_at harus ISO penuh (sama formatnya dengan now()) supaya perbandingan presisi.
      await db.run('UPDATE adlib_ads SET active = 0 WHERE keyword_id = ? AND last_seen < ?', kw.id, clean(b.started_at));
    }
    await db.run(
      `INSERT INTO adlib_scans (keyword_id, started_at, finished_at, found, new_count, status, error)
       VALUES (?, ?, ?, ?, ?, 'ok', NULL)`,
      kw.id, clean(b.started_at) || ts, clean(b.finished_at) || ts, saved, newCount,
    );
    res.json({ ok: true, saved, new_count: newCount });
  });

  // Catatan gagal scan dari agen (biar dashboard tahu scan-nya bolong).
  app.post('/api/adlib/agent/error', guard, async (req, res) => {
    const b = req.body || {};
    await db.run(
      `INSERT INTO adlib_scans (keyword_id, started_at, finished_at, found, new_count, status, error)
       VALUES (?, ?, ?, 0, 0, 'error', ?)`,
      Number(b.keyword_id) || null, now(), now(), String(b.error ?? 'error').slice(0, 1000),
    );
    res.json({ ok: true });
  });
}

export function adlibRoutes(app, db, scope) {
  // ---- Keyword ----
  app.get('/api/adlib/keywords', scope, async (req, res) => {
    const rows = await db.all('SELECT * FROM adlib_keywords ORDER BY id');
    const out = [];
    for (const k of rows) {
      const st = await db.get(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS actives,
               SUM(CASE WHEN first_seen >= ? THEN 1 ELSE 0 END) AS new7
        FROM adlib_ads WHERE keyword_id = ?`, cutoff7(), k.id);
      const mx = await db.get('SELECT MAX(start_date) AS newest, MIN(start_date) AS oldest FROM adlib_ads WHERE keyword_id = ?', k.id);
      const pages = await db.get('SELECT COUNT(DISTINCT page_name) AS pages FROM adlib_ads WHERE keyword_id = ?', k.id);
      const last = await db.get('SELECT started_at, status FROM adlib_scans WHERE keyword_id = ? ORDER BY id DESC LIMIT 1', k.id);
      out.push({
        ...k,
        total: st?.total || 0,
        active: st?.actives || 0,
        new_7d: st?.new7 || 0,
        pages: pages?.pages || 0,
        oldest: mx?.oldest || null,
        max_age_days: ageDays(mx?.oldest),
        last_scan: last?.started_at || null,
        last_status: last?.status || null,
      });
    }
    res.json({ keywords: out });
  });

  app.post('/api/adlib/keywords', scope, async (req, res) => {
    const keyword = clean(req.body?.keyword).slice(0, 200);
    const country = clean(req.body?.country).toUpperCase().slice(0, 2) || 'ID';
    if (!keyword) return res.status(400).json({ error: 'Keyword wajib diisi' });
    const old = await db.get('SELECT * FROM adlib_keywords WHERE keyword = ? AND country = ?', keyword, country);
    if (old) return res.status(409).json({ error: 'Keyword sudah ada' });
    const rows = await db.run(
      'INSERT INTO adlib_keywords (keyword, country, active, created_at) VALUES (?, ?, 1, ?) RETURNING *',
      keyword, country, now(),
    );
    res.json({ keyword: rows[0] });
  });

  app.delete('/api/adlib/keywords/:id', scope, async (req, res) => {
    const id = Number(req.params.id);
    await db.run('DELETE FROM adlib_ads WHERE keyword_id = ?', id);
    await db.run('DELETE FROM adlib_scans WHERE keyword_id = ?', id);
    await db.run('DELETE FROM adlib_keywords WHERE id = ?', id);
    res.json({ ok: true });
  });

  // ---- Metrik ----
  app.get('/api/adlib/overview', scope, async (req, res) => {
    const total = await db.get(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS actives,
             SUM(CASE WHEN first_seen >= ? THEN 1 ELSE 0 END) AS new7
      FROM adlib_ads`, cutoff7());
    const winners = await db.all(`
      SELECT * FROM adlib_ads WHERE start_date IS NOT NULL
      ORDER BY start_date ASC LIMIT 10`);
    const topPages = await db.all(`
      SELECT page_name, COUNT(*) AS ads, MIN(start_date) AS oldest, MAX(start_date) AS newest
      FROM adlib_ads WHERE page_name != '' GROUP BY page_name ORDER BY ads DESC LIMIT 10`);
    const scans = await db.all(`
      SELECT s.*, k.keyword FROM adlib_scans s LEFT JOIN adlib_keywords k ON k.id = s.keyword_id
      ORDER BY s.id DESC LIMIT 15`);
    res.json({
      totals: { creatives: total?.total || 0, active: total?.actives || 0, new_7d: total?.new7 || 0 },
      winners: winners.map(adOut),
      top_advertisers: topPages.map((p) => ({
        page_name: p.page_name, ads: p.ads, oldest: p.oldest, max_age_days: ageDays(p.oldest),
      })),
      scans,
    });
  });

  // Daftar creative: /api/adlib/ads?keyword_id=&sort=age|recent&limit=150&only=1 (only aktif)
  app.get('/api/adlib/ads', scope, async (req, res) => {
    const kw = Number(req.query.keyword_id) || 0;
    const limit = Math.min(Number(req.query.limit) || 150, 500);
    const where = [];
    const args = [];
    if (kw) { where.push('keyword_id = ?'); args.push(kw); }
    if (String(req.query.only || '') === '1') where.push('active = 1');
    const order = String(req.query.sort) === 'recent' ? 'last_seen DESC, id DESC' : 'start_date ASC NULLS LAST, id ASC';
    const rows = await db.all(
      `SELECT * FROM adlib_ads ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT ?`,
      ...args, limit,
    );
    res.json({ ads: rows.map(adOut) });
  });

  app.get('/api/adlib/scans', scope, async (req, res) => {
    const scans = await db.all(`
      SELECT s.*, k.keyword FROM adlib_scans s LEFT JOIN adlib_keywords k ON k.id = s.keyword_id
      ORDER BY s.id DESC LIMIT 50`);
    res.json({ scans });
  });
}

function cutoff7() {
  return new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 19);
}
