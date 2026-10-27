// Operasional lintas divisi (Fase 3 & 4):
// - Planner: komentar & log revisi, Approve / Request Revision (owner, admin, lead), pengaturan notifikasi.
// - Hybrid publishing: tandai target yang diposting manual (Publishing Kit) + notifikasi post gagal.
// - Tim ADV: kanban testing materi iklan (Antrean → Testing → Winning → Fatigue) + Push dari Analitik.
// - Tim KOL & Affiliate: pengiriman sampel (resi & kurir, massal), AI brief afiliasi.
// - Tim MP: event campaign marketplace, AI listing & SEO, audit toko harian.
// - Tim CS: paket skrip keberatan (objection bank), generator follow-up WhatsApp.
import { now } from './db.js';
import { brandsFor } from './team.js';
import { askClaude, AiError, brandBlock } from './ai.js';
import { notify, loadNotify, saveNotify, NOTIFY_EVENTS, onContentStatus } from './notify.js';
import { syncContentWithPost } from './planner.js';
import { parseNum, parseDay } from './ads.js';

export const canApprove = (u) => ['owner', 'admin', 'lead'].includes(u?.role);
const str = (v, n = 2000) => String(v ?? '').trim().slice(0, n);
const STAGES = ['antrean', 'testing', 'winning', 'fatigue'];
const SAMPLE_STATUS = ['disiapkan', 'dikirim', 'diterima', 'konten_tayang', 'tidak_ada_konten', 'retur'];
export const AUDIT_ITEMS = {
  stok: 'Stok produk utama aman (tidak habis/menipis)',
  harga: 'Harga & harga coret sesuai rencana',
  voucher: 'Voucher toko & voucher ikuti program aktif',
  banner: 'Dekorasi toko & banner campaign terpasang',
  flash: 'Flash sale / promo toko terjadwal',
  chat: 'Chat dibalas < 5 menit, tidak ada chat menggantung',
  pesanan: 'Pesanan baru diproses sebelum batas kirim',
  ulasan: 'Ulasan bintang rendah sudah dibalas',
  iklan: 'Iklan toko jalan & saldo iklan cukup',
  listing: 'Listing nonaktif / dibanned sudah dicek',
};
const handle = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) {
    if (err instanceof AiError || err.status) return res.status(err.status || 400).json({ error: err.message });
    throw err;
  }
};
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Notifikasi post gagal (dipanggil cron). Hanya post yang gagal dalam 2 jam terakhir, sekali kirim.
export async function notifyFailedPosts(db) {
  const since = new Date(Date.now() - 2 * 3600e3).toISOString();
  const rows = await db.all("SELECT * FROM posts WHERE status IN ('failed', 'partial') AND (notified IS NULL OR notified = 0) AND COALESCE(started_at, created_at) >= ? LIMIT 20", since);
  for (const p of rows) {
    await db.run('UPDATE posts SET notified = 1 WHERE id = ?', p.id);
    const fails = await db.all("SELECT a.name, a.platform, t.error FROM post_targets t JOIN accounts a ON a.id = t.account_id WHERE t.post_id = ? AND t.status = 'failed'", p.id);
    await notify(db, p.brand_id, 'post_failed', `⚠️ Post ${p.status === 'partial' ? 'sebagian ' : ''}gagal: "${String(p.caption || p.title || '').slice(0, 60)}". Gagal di: ${fails.map((f) => `${f.name} (${f.platform})`).join(', ')}. Buka Riwayat → Publishing Kit untuk posting manual.`, { post_id: p.id });
  }
  return rows.length;
}

export function opsRoutes(app, db, scope, { canManage }) {
  const allowed = async (req) => new Set((await brandsFor(db, req.user)).map((b) => b.id));
  const getItem = (req) => db.get('SELECT * FROM content_items WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);

  // ================= PLANNER: komentar, approval, notifikasi =================
  app.get('/api/content/:id/comments', scope, handle(async (req) => {
    const item = await getItem(req);
    if (!item) throw bad('Konten tidak ditemukan', 404);
    return { comments: await db.all('SELECT * FROM content_comments WHERE content_id = ? ORDER BY id', item.id), can_approve: canApprove(req.user), approved_by: item.approved_by, approved_at: item.approved_at };
  }));
  app.post('/api/content/:id/comments', scope, handle(async (req) => {
    const item = await getItem(req);
    if (!item) throw bad('Konten tidak ditemukan', 404);
    const body = str(req.body?.body, 4000);
    if (!body) throw bad('Tulis komentar dulu');
    const [row] = await db.run('INSERT INTO content_comments (content_id, author, kind, body, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *', item.id, req.user.username, 'comment', body, now());
    return row;
  }));
  app.post('/api/content/:id/approve', scope, handle(async (req) => {
    if (!canApprove(req.user)) throw bad('Approve hanya untuk Lead/Supervisor, admin, atau pemilik', 403);
    const item = await getItem(req);
    if (!item) throw bad('Konten tidak ditemukan', 404);
    if (item.status !== 'review') throw bad('Hanya kartu di kolom Review yang bisa di-approve');
    const note = str(req.body?.note, 1000);
    await db.run("UPDATE content_items SET status = 'siap', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?", req.user.username, now(), now(), item.id);
    await db.run('INSERT INTO content_comments (content_id, author, kind, body, created_at) VALUES (?, ?, ?, ?, ?)', item.id, req.user.username, 'approve', note || 'Approved', now());
    await onContentStatus(db, item, 'review', 'siap', req.user, 'approved');
    await notify(db, item.brand_id, 'approve', `👍 Di-approve oleh ${req.user.username}: "${item.title}"${note ? ` — ${note}` : ''}`, { content_id: item.id });
    return { ok: true };
  }));
  app.post('/api/content/:id/revision', scope, handle(async (req) => {
    if (!canApprove(req.user)) throw bad('Minta revisi hanya untuk Lead/Supervisor, admin, atau pemilik', 403);
    const item = await getItem(req);
    if (!item) throw bad('Konten tidak ditemukan', 404);
    const note = str(req.body?.note, 4000);
    if (!note) throw bad('Tulis catatan revisinya');
    await db.run("UPDATE content_items SET status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = ? WHERE id = ?", now(), item.id);
    await db.run('INSERT INTO content_comments (content_id, author, kind, body, created_at) VALUES (?, ?, ?, ?, ?)', item.id, req.user.username, 'revision', note, now());
    await onContentStatus(db, item, item.status, 'draft', req.user, 'minta revisi');
    await notify(db, item.brand_id, 'revision', `✏️ Revisi diminta oleh ${req.user.username}: "${item.title}" — ${note}`, { content_id: item.id });
    return { ok: true };
  }));

  app.get('/api/notify', scope, handle(async (req) => {
    const c = await loadNotify(db, req.brand.id);
    return { events: NOTIFY_EVENTS, enabled: c.events || {}, telegram_chat: c.telegram_chat || '', telegram_token: c.telegram_token ? `••••${c.telegram_token.slice(-4)}` : '',
      webhook_url: c.webhook_url || '', webhook_target: c.webhook_target || '', webhook_secret: c.webhook_secret ? '••••' : '', webhook_auth: c.webhook_auth ? '••••' : '', can_edit: canManage(req.user) };
  }));
  app.put('/api/notify', scope, handle(async (req) => {
    if (!canManage(req.user)) throw bad('Cuma pemilik/admin yang bisa mengatur notifikasi', 403);
    const c = await loadNotify(db, req.brand.id);
    const b = req.body || {};
    if (typeof b.telegram_token === 'string' && b.telegram_token.trim() && !b.telegram_token.includes('•')) c.telegram_token = b.telegram_token.trim();
    if (b.telegram_token === '') delete c.telegram_token;
    if (typeof b.telegram_chat === 'string') c.telegram_chat = b.telegram_chat.trim();
    if (typeof b.webhook_url === 'string') {
      if (b.webhook_url && !/^https:\/\/[^\s]+$/i.test(b.webhook_url.trim())) throw bad('Webhook URL harus https://');
      c.webhook_url = b.webhook_url.trim();
    }
    if (typeof b.webhook_target === 'string') c.webhook_target = b.webhook_target.trim().slice(0, 100);
    if (typeof b.webhook_secret === 'string' && !b.webhook_secret.includes('•')) c.webhook_secret = b.webhook_secret.trim().slice(0, 200);
    if (typeof b.webhook_auth === 'string' && !b.webhook_auth.includes('•')) c.webhook_auth = b.webhook_auth.trim().slice(0, 400);
    if (b.events && typeof b.events === 'object') c.events = Object.fromEntries(Object.keys(NOTIFY_EVENTS).map((k) => [k, b.events[k] !== false]));
    await saveNotify(db, req.brand.id, c);
    return { ok: true };
  }));
  app.post('/api/notify/test', scope, handle(async (req) => notify(db, req.brand.id, 'test', `🔔 Tes notifikasi dari ${req.user.username} (brand ${req.brand.name})`)));

  // ================= HYBRID PUBLISHING: tandai sudah diposting manual =================
  app.post('/api/posts/:id/targets/:tid/manual', scope, handle(async (req) => {
    const post = await db.get('SELECT * FROM posts WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    if (!post) throw bad('Post tidak ditemukan', 404);
    const t = await db.get('SELECT * FROM post_targets WHERE id = ? AND post_id = ?', Number(req.params.tid), post.id);
    if (!t) throw bad('Target tidak ditemukan', 404);
    const url = str(req.body?.remote_url, 500);
    if (url && !/^https?:\/\//.test(url)) throw bad('Link postingan harus diawali http(s)://');
    await db.run("UPDATE post_targets SET status = 'success', remote_url = ?, error = ?, published_at = ? WHERE id = ?", url || null, 'Diposting manual (Publishing Kit)', now(), t.id);
    const left = await db.get("SELECT COUNT(*) AS n FROM post_targets WHERE post_id = ? AND status != 'success'", post.id);
    await db.run('UPDATE posts SET status = ? WHERE id = ?', Number(left.n) ? 'partial' : 'done', post.id);
    await syncContentWithPost(db, post.id);
    return { ok: true, status: Number(left.n) ? 'partial' : 'done' };
  }));

  // ================= TIM ADV: kanban testing materi iklan =================
  const pubCreative = (c) => {
    const spend = Number(c.spend) || 0;
    const revenue = Number(c.revenue) || 0;
    const results = Number(c.results) || 0;
    return { ...c, results: c.results == null ? null : results, roas: spend ? revenue / spend : null, cpa: results ? spend / results : null };
  };
  const ownCreative = async (req) => {
    const c = await db.get('SELECT * FROM ad_creatives WHERE id = ?', Number(req.params.id));
    return c && (await allowed(req)).has(c.brand_id) ? c : null;
  };
  const creativeFields = (b, c = {}) => ({
    title: str(b.title ?? c.title, 200), stage: STAGES.includes(b.stage) ? b.stage : c.stage || 'antrean',
    platform: str(b.platform ?? c.platform ?? 'meta', 40), source_url: str(b.source_url ?? c.source_url, 500), media_url: str(b.media_url ?? c.media_url, 1000),
    spark_code: str(b.spark_code ?? c.spark_code, 300), angle: str(b.angle ?? c.angle, 500), audience: str(b.audience ?? c.audience, 500),
    daily_budget: b.daily_budget !== undefined ? parseNum(b.daily_budget) : c.daily_budget ?? null, spend: b.spend !== undefined ? parseNum(b.spend) : c.spend ?? null,
    revenue: b.revenue !== undefined ? parseNum(b.revenue) : c.revenue ?? null, results: b.results !== undefined ? parseNum(b.results) : c.results ?? null,
    notes: str(b.notes ?? c.notes, 4000), position: b.position !== undefined ? Number(b.position) || 0 : c.position || 0,
  });
  app.get('/api/adv/creatives', handle(async (req) => {
    const ids = [...(await allowed(req))].filter((id) => !req.query.only || id === Number(req.query.only));
    if (!ids.length) return [];
    return (await db.all(`SELECT * FROM ad_creatives WHERE brand_id IN (${ids.map(() => '?').join(',')}) ORDER BY position, id DESC`, ...ids)).map(pubCreative);
  }));
  app.post('/api/adv/creatives', handle(async (req) => {
    const brandId = Number(req.body?.brand_id);
    if (!(await allowed(req)).has(brandId)) throw bad('Pilih brand', 403);
    const f = creativeFields(req.body || {});
    if (!f.title) throw bad('Judul materi wajib diisi');
    const stamp = now();
    const [row] = await db.run(`INSERT INTO ad_creatives (brand_id, title, stage, platform, source_url, media_url, spark_code, angle, audience, daily_budget, spend, revenue, results, notes, position, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`, brandId, f.title, f.stage, f.platform, f.source_url, f.media_url, f.spark_code, f.angle, f.audience,
    f.daily_budget, f.spend, f.revenue, f.results == null ? null : Math.round(f.results), f.notes, f.position, req.user.username, stamp, stamp);
    return pubCreative(row);
  }));
  app.patch('/api/adv/creatives/:id', handle(async (req) => {
    const c = await ownCreative(req);
    if (!c) throw bad('Materi tidak ditemukan', 404);
    const f = creativeFields(req.body || {}, c);
    const [row] = await db.run(`UPDATE ad_creatives SET title = ?, stage = ?, platform = ?, source_url = ?, media_url = ?, spark_code = ?, angle = ?, audience = ?, daily_budget = ?, spend = ?, revenue = ?, results = ?, notes = ?, position = ?, updated_at = ?
      WHERE id = ? RETURNING *`, f.title || c.title, f.stage, f.platform, f.source_url, f.media_url, f.spark_code, f.angle, f.audience, f.daily_budget, f.spend, f.revenue,
    f.results == null ? null : Math.round(f.results), f.notes, f.position, now(), c.id);
    return pubCreative(row);
  }));
  app.delete('/api/adv/creatives/:id', handle(async (req) => {
    const c = await ownCreative(req);
    if (!c) throw bad('Materi tidak ditemukan', 404);
    await db.run('DELETE FROM ad_creatives WHERE id = ?', c.id);
    return { ok: true };
  }));
  // Push konten organik dari Analitik ke antrean Tim ADV.
  app.post('/api/adv/push-metric', scope, handle(async (req) => {
    const m = await db.get('SELECT * FROM metrics WHERE id = ? AND brand_id = ?', Number(req.body?.metric_id), req.brand.id);
    if (!m) throw bad('Konten tidak ditemukan', 404);
    const exists = await db.get('SELECT id FROM ad_creatives WHERE brand_id = ? AND source_metric_id = ?', req.brand.id, m.id);
    if (exists) throw bad('Konten ini sudah ada di antrean Tim ADV');
    let media = '';
    if (m.content_id) media = (await db.get("SELECT url FROM content_assets WHERE content_id = ? AND url IS NOT NULL ORDER BY id LIMIT 1", m.content_id))?.url || '';
    const eng = (Number(m.likes) || 0) + (Number(m.comments) || 0) + (Number(m.shares) || 0) + (Number(m.saves) || 0);
    const views = Number(m.views) || 0;
    const stamp = now();
    const [row] = await db.run(`INSERT INTO ad_creatives (brand_id, title, stage, platform, source_metric_id, source_url, media_url, notes, created_by, created_at, updated_at)
      VALUES (?, ?, 'antrean', ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`, req.brand.id, String(m.title || 'Konten organik').slice(0, 200), m.platform === 'tiktok' ? 'tiktok_ads' : 'meta', m.id, m.url || '', media,
    `Dari organik (${m.platform}, ${m.posted_at ? m.posted_at.slice(0, 10) : '-'}): ${views.toLocaleString('id-ID')} views, ER ${views ? ((eng / views) * 100).toFixed(1) : '-'}%, ${Number(m.sales) || 0} sales.`, req.user.username, stamp, stamp);
    return pubCreative(row);
  }));

  // ================= KOL & AFFILIATE: sampel =================
  const ownPartner = async (req, id) => {
    const p = await db.get('SELECT * FROM partners WHERE id = ? AND team = ?', Number(id), req.params.team);
    return p && (await allowed(req)).has(p.brand_id) ? p : null;
  };
  const sampleFields = (b, s = {}) => ({
    product: str(b.product ?? s.product, 200), courier: str(b.courier ?? s.courier, 60), resi: str(b.resi ?? s.resi, 80),
    sent_at: b.sent_at !== undefined ? parseDay(b.sent_at) : s.sent_at || null, status: SAMPLE_STATUS.includes(b.status) ? b.status : s.status || 'disiapkan',
    hpp: b.hpp !== undefined ? parseNum(b.hpp) : s.hpp ?? null, notes: str(b.notes ?? s.notes, 1000),
  });
  app.get('/api/samples/:team', handle(async (req) => {
    const ids = [...(await allowed(req))];
    if (!ids.length) return [];
    return db.all(`SELECT s.*, p.name AS partner_name, p.handle, p.brand_id, p.contact FROM sample_shipments s JOIN partners p ON p.id = s.partner_id
      WHERE p.team = ? AND p.brand_id IN (${ids.map(() => '?').join(',')}) ORDER BY s.id DESC LIMIT 500`, req.params.team, ...ids);
  }));
  // Satu atau banyak mitra sekaligus (kirim sampel massal).
  app.post('/api/samples/:team', handle(async (req) => {
    const pidList = (Array.isArray(req.body?.partner_ids) ? req.body.partner_ids : [req.body?.partner_id]).filter(Boolean).slice(0, 200);
    if (!pidList.length) throw bad('Pilih minimal satu mitra');
    const f = sampleFields(req.body || {});
    if (!f.product) throw bad('Isi nama produk sampel');
    let n = 0;
    for (const pid of pidList) {
      const p = await ownPartner(req, pid);
      if (!p) continue;
      const stamp = now();
      await db.run(`INSERT INTO sample_shipments (partner_id, product, courier, resi, sent_at, status, hpp, notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, p.id, f.product, f.courier, pidList.length > 1 ? '' : f.resi, f.sent_at, f.status, f.hpp, f.notes, req.user.username, stamp, stamp);
      if (req.params.team === 'kol' && ['hunting', 'negosiasi'].includes(p.status) && ['dikirim', 'diterima'].includes(f.status)) await db.run("UPDATE partners SET status = 'sampel', updated_at = ? WHERE id = ?", stamp, p.id);
      n++;
    }
    return { created: n };
  }));
  app.patch('/api/samples/:team/:id', handle(async (req) => {
    const s = await db.get('SELECT * FROM sample_shipments WHERE id = ?', Number(req.params.id));
    const p = s && (await ownPartner(req, s.partner_id));
    if (!p) throw bad('Data sampel tidak ditemukan', 404);
    const f = sampleFields(req.body || {}, s);
    await db.run('UPDATE sample_shipments SET product = ?, courier = ?, resi = ?, sent_at = ?, status = ?, hpp = ?, notes = ?, updated_at = ? WHERE id = ?',
      f.product || s.product, f.courier, f.resi, f.sent_at, f.status, f.hpp, f.notes, now(), s.id);
    if (req.params.team === 'kol' && f.status === 'diterima' && p.status === 'sampel') await db.run("UPDATE partners SET status = 'draft', updated_at = ? WHERE id = ?", now(), p.id);
    return { ok: true };
  }));
  app.delete('/api/samples/:team/:id', handle(async (req) => {
    const s = await db.get('SELECT * FROM sample_shipments WHERE id = ?', Number(req.params.id));
    if (!s || !(await ownPartner(req, s.partner_id))) throw bad('Data sampel tidak ditemukan', 404);
    await db.run('DELETE FROM sample_shipments WHERE id = ?', s.id);
    return { ok: true };
  }));

  // AI brief & link untuk grup afiliator / KOL (teks siap kirim WhatsApp).
  app.post('/api/partners/:team/ai-brief', scope, handle(async (req) => {
    const b = req.body || {};
    if (!str(b.product)) throw bad('Isi nama produk');
    const text = await askClaude({
      effort: 'medium', maxTokens: 6000,
      system: 'Kamu affiliate & KOL manager senior untuk pasar Indonesia. Tulis brief yang jelas, menarik, patuh aturan (tanpa klaim medis/hasil mutlak, wajib disclosure kerja sama), siap kirim di WhatsApp: pakai *tebal* bintang tunggal, bullet •, tanpa tabel/markdown header.',
      content: `${brandBlock(req.brand)}
Buat brief ${req.params.team === 'kol' ? 'KOL' : 'afiliator (TikTok Shop/Shopee Affiliate)'} untuk:
Produk: ${str(b.product, 300)}
Link produk / affiliate: ${str(b.link, 500) || '(belum ada, tulis [LINK])'}
Komisi / fee: ${str(b.commission, 200) || '-'}
Keunggulan utama: ${str(b.usp, 1500) || '-'}
Target pembeli: ${str(b.audience, 300) || '-'}
Wajib dilakukan: ${str(b.dos, 1000) || '-'}
Dilarang: ${str(b.donts, 1000) || '-'}
Periode/deadline: ${str(b.deadline, 200) || '-'}

Susun: 1) pembuka singkat & benefit buat kreator, 2) info produk & link, 3) 5 hook siap pakai (3 detik pertama), 4) alur video 15–30 detik, 5) do & don't (termasuk aturan klaim & disclosure #ad/#sponsored), 6) CTA keranjang kuning / link, 7) kontak & deadline.`,
    });
    return { text: String(text).trim() };
  }));

  // ================= TIM MP =================
  app.get('/api/mp/events', handle(async (req) => {
    const ids = [...(await allowed(req))];
    if (!ids.length) return [];
    return db.all(`SELECT * FROM mp_events WHERE brand_id IN (${ids.map(() => '?').join(',')}) ORDER BY start_day`, ...ids);
  }));
  app.post('/api/mp/events', handle(async (req) => {
    const b = req.body || {};
    const brandId = Number(b.brand_id);
    if (!(await allowed(req)).has(brandId)) throw bad('Pilih brand', 403);
    const start = parseDay(b.start_day);
    const end = parseDay(b.end_day) || start;
    if (!str(b.title) || !start) throw bad('Isi nama event & tanggal mulai');
    const [row] = await db.run('INSERT INTO mp_events (brand_id, title, start_day, end_day, type, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
      brandId, str(b.title, 120), start, end < start ? start : end, str(b.type || 'campaign', 40), str(b.notes, 1000), req.user.username, now());
    return row;
  }));
  app.delete('/api/mp/events/:id', handle(async (req) => {
    const e = await db.get('SELECT * FROM mp_events WHERE id = ?', Number(req.params.id));
    if (!e || !(await allowed(req)).has(e.brand_id)) throw bad('Event tidak ditemukan', 404);
    await db.run('DELETE FROM mp_events WHERE id = ?', e.id);
    return { ok: true };
  }));

  const S = { type: 'string' };
  const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  const LISTING = obj({
    titles: { type: 'array', items: obj({ title: S, why: S }) },
    description: S,
    bullets: { type: 'array', items: S },
    keywords: { type: 'array', items: S },
    slides: { type: 'array', items: obj({ slide: { type: 'integer' }, visual: S, text_on_image: S }) },
    warnings: { type: 'array', items: S },
  });
  const LIMIT = { shopee: 120, tokopedia: 70, tiktok_shop: 255, lazada: 255 };
  app.post('/api/mp/listing-ai', scope, handle(async (req) => {
    const b = req.body || {};
    const mp = Object.hasOwn(LIMIT, b.marketplace) ? b.marketplace : 'shopee';
    if (!str(b.product)) throw bad('Isi nama produk');
    return askClaude({
      schema: LISTING, effort: 'medium', maxTokens: 8000,
      content: `${brandBlock(req.brand)}
Optimasi listing ${mp.replace('_', ' ')} (batas judul ${LIMIT[mp]} karakter) untuk:
Produk: ${str(b.product, 300)}
Kata kunci target: ${str(b.keywords, 500) || '(cari yang paling relevan)'}
Fitur / spesifikasi / isi: ${str(b.features, 2000) || '-'}
Harga & promo: ${str(b.price, 200) || '-'}
Target pembeli: ${str(b.audience, 300) || '-'}
Isi: 5 judul SEO (kata kunci utama di depan, tanpa spam simbol/huruf kapital semua, di bawah batas karakter) + alasannya; deskripsi terstruktur (paragraf pembuka, manfaat, spesifikasi, isi paket, cara pakai, garansi/retur, FAQ singkat); 5–8 bullet keunggulan; 10–15 kata kunci/tag; ide gambar slide 1 sampai 7 (visual + teks di gambar: slide 1 foto utama bersih, lalu manfaat, bukti, perbandingan, ukuran/isi, testimoni nyata bila ada, CTA/promo); dan peringatan kepatuhan (klaim medis/BPOM/halal, kata terlarang marketplace) bila ada.`,
    });
  }));

  app.get('/api/mp/audits', scope, handle(async (req) => {
    const since = new Date(Date.now() - (Number(req.query.days) || 14) * 86400e3).toISOString().slice(0, 10);
    return { items: AUDIT_ITEMS, audits: await db.all('SELECT * FROM store_audits WHERE brand_id = ? AND day >= ? ORDER BY day DESC, shop', req.brand.id, since) };
  }));
  app.put('/api/mp/audits', scope, handle(async (req) => {
    const b = req.body || {};
    const day = parseDay(b.day) || new Date().toISOString().slice(0, 10);
    const shop = str(b.shop, 80);
    const items = Object.fromEntries(Object.keys(AUDIT_ITEMS).map((k) => [k, !!b.items?.[k]]));
    await db.run(`INSERT INTO store_audits (brand_id, day, shop, items, notes, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (brand_id, day, shop) DO UPDATE SET items = excluded.items, notes = excluded.notes, created_by = excluded.created_by, updated_at = excluded.updated_at`,
    req.brand.id, day, shop, JSON.stringify(items), str(b.notes, 2000), req.user.username, now());
    return { ok: true };
  }));

  app.delete('/api/mp/audits/:id', scope, handle(async (req) => {
    await db.run('DELETE FROM store_audits WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    return { ok: true };
  }));

  // ================= TIM CS =================
  const OBJECTIONS = [
    ['Harga kemahalan', 'Wajar kok Kak nanya soal harga 🙏 Boleh aku jelasin sedikit? Di [produk] Kakak dapat [isi/manfaat utama], dan kalau dihitung per pemakaian cuma sekitar [harga per hari/pakai]. Hari ini juga ada [promo/bonus] lho Kak. Mau aku bantu cek ongkir ke alamat Kakak dulu?'],
    ['Aman untuk anak / lambung / ibu hamil?', 'Pertanyaan bagus Kak, keamanan memang nomor satu 🙏 [produk] terdaftar [nomor izin edar/halal] dan komposisinya [komposisi utama]. Untuk kondisi khusus (hamil, menyusui, punya riwayat penyakit, atau anak di bawah [usia]) kami sarankan konsultasi dulu ke dokter/tenaga kesehatan ya Kak. Ada kondisi tertentu yang mau Kakak tanyakan?'],
    ['Bisa COD?', 'Bisa Kak 😊 Pembayaran di tempat (COD) tersedia lewat [marketplace/kurir]. Cukup pilih COD saat checkout, nanti bayar ke kurir waktu paket sampai. Mau aku kirimkan link checkout-nya sekarang?'],
    ['Ada efek samping?', 'Terima kasih sudah teliti Kak 🙏 [produk] dibuat dari [bahan] dan dipakai sesuai aturan pakai umumnya aman. Tapi setiap tubuh bisa berbeda, jadi kalau muncul reaksi tidak nyaman, hentikan pemakaian dan konsultasikan ke tenaga kesehatan ya Kak. Kakak ada alergi tertentu?'],
    ['Komplain pengiriman lama / paket belum sampai', 'Mohon maaf banget Kak atas ketidaknyamanannya 🙏 Boleh kirim nomor pesanannya? Aku cek posisi paket sekarang dan langsung follow up ke kurir. Kalau dalam [x] hari belum sampai, kami bantu proses [kirim ulang/refund] sesuai ketentuan.'],
    ['Takut produk palsu / tidak original', 'Wajar Kak, sekarang banyak barang palsu 😊 Kami toko resmi [brand] dengan [bukti: izin edar, segel, kode unik/barcode]. Kakak bisa cek keasliannya di [cara cek]. Kalau terbukti tidak original, uang kembali 100% sesuai ketentuan toko.'],
    ['Pikir-pikir dulu / nanti saja', 'Siap Kak, silakan dipertimbangkan dulu 😊 Biar nggak kelewatan, promo [promo] berlaku sampai [tanggal] ya. Ada yang masih bikin Kakak ragu? Aku bantu jawab supaya Kakak yakin dulu sebelum beli.'],
    ['Kapan hasilnya terasa?', 'Hasil tiap orang bisa beda ya Kak, tergantung kondisi tubuh & konsistensi pemakaian 🙏 Pelanggan kami biasanya rutin pakai [aturan pakai] selama [periode]. Kami tidak menjanjikan hasil instan, tapi kami bantu pantau pemakaiannya. Mau aku kirimkan panduan pemakaiannya?'],
  ];
  app.post('/api/cs/objections/seed', scope, handle(async (req) => {
    const have = new Set((await db.all("SELECT title FROM cs_templates WHERE brand_id = ? AND category = 'keberatan'", req.brand.id)).map((r) => r.title));
    let n = 0;
    for (const [title, body] of OBJECTIONS) {
      if (have.has(title)) continue;
      await db.run('INSERT INTO cs_templates (brand_id, title, category, body, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', req.brand.id, title, 'keberatan', body, req.user.username, now(), now());
      n++;
    }
    return { added: n };
  }));
  const FOLLOW = obj({ messages: { type: 'array', items: obj({ step: S, goal: S, text: S }) } });
  app.post('/api/cs/followup-ai', scope, handle(async (req) => {
    const b = req.body || {};
    if (!str(b.product)) throw bad('Isi nama produk');
    return askClaude({
      schema: FOLLOW, effort: 'medium', maxTokens: 6000,
      system: `Kamu CS & closing specialist WhatsApp untuk pasar Indonesia. Bahasa ramah, singkat (maks 400 karakter per pesan), personal, pakai sapaan Kak, emoji secukupnya, tanpa klaim medis/hasil mutlak, tanpa false urgency.${b.voice ? `\nBrand voice: ${str(b.voice, 3000)}` : ''}`,
      content: `${brandBlock(req.brand)}
Produk: ${str(b.product, 300)}
Konteks pelanggan: ${str(b.context, 1000) || 'sudah tanya/checkout tapi belum transfer'}
Promo yang boleh dipakai: ${str(b.offer, 500) || '-'}
Buat urutan follow-up WhatsApp: H+1 Reminder (belum transfer), H+3 Edukasi manfaat, H+7 Promo terbatas (jujur), H+14 Retensi/cek pemakaian, H+25 Habis pakai/repeat order. Pakai placeholder [nama] dan [link]. step berisi label (mis. "H+1 Reminder"), goal tujuan singkat.`,
    });
  }));
}
