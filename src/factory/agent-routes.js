// Motion Factory (sisi agen Mac mini): klaim job, laporan progres, heartbeat. Dikunci token Bearer.
import crypto from 'node:crypto';
import { setSetting, now } from '../db.js';
import { safeEqual } from '../auth.js';
import { notify } from '../notify.js';
import { agentState } from './routes.js';
import { createMacJob, macName, JOB_READY_SQL } from './mac.js';

let notifyFn = notify;
// Tes mengganti pengirim notifikasi; null mengembalikan yang asli.
export const setNotifyForTests = (fn) => { notifyFn = fn || notify; };

const parse = (s) => { try { return JSON.parse(s); } catch { return {}; } };
const ACTIVE = ['menyiapkan', 'produksi'];
const inList = (a) => a.map(() => '?').join(',');
const APPROVED = JOB_READY_SQL;

export function factoryAgentRoutes(app, db, { token } = {}) {
  const guard = (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!token || !m || !safeEqual(m[1], token)) return res.status(401).json({ error: 'Token agen salah' });
    next();
  };
  const jobId = (req) => { const n = Number(req.params.id); return Number.isInteger(n) ? n : null; };
  const getJob = async (id) => {
    if (id === null) return null;
    const j = await db.get('SELECT j.*, p.name AS product_name FROM factory_jobs j LEFT JOIN factory_products p ON p.id = j.product_id WHERE j.id = ?', id);
    if (j?.mac_product) j.product_name = macName((await agentState(db)).products, j.mac_product);
    return j;
  };

  async function agentJob(j) {
    if (j.mac_product) {
      // Produk sudah terpasang di Mac → agen langsung produksi tanpa footage/profil.
      const name = macName((await agentState(db)).products, j.mac_product);
      return {
        id: j.id, brand_id: j.brand_id, target: j.target, cta: j.cta, footage_url: null, done: j.done, drive_url: j.drive_url,
        options: {}, mac_product: j.mac_product,
        product: { id: null, slug: j.mac_product, name, profile: {}, product_image: null, label_image: null, updated_at: null, profile_version: null },
      };
    }
    const p = await db.get('SELECT * FROM factory_products WHERE id = ?', j.product_id);
    // profile_version berubah tiap isi profil/gambar berubah → agen menyiapkan ulang produk (install + stem baru).
    const profile_version = crypto.createHash('sha256').update(JSON.stringify([p.profile, p.product_image, p.label_image])).digest('hex').slice(0, 16);
    return {
      id: j.id, brand_id: j.brand_id, target: j.target, cta: j.cta, footage_url: j.footage_url, done: j.done, drive_url: j.drive_url,
      options: (() => { try { return JSON.parse(j.options || '{}'); } catch { return {}; } })(),
      product: {
        id: p.id, slug: p.slug, name: p.name, profile: parse(p.profile), product_image: p.product_image, label_image: p.label_image,
        updated_at: p.updated_at, profile_version,
      },
    };
  }

  app.post('/api/factory/agent/heartbeat', guard, async (req, res) => {
    const b = req.body || {};
    await setSetting(db, 'factory:agent', JSON.stringify({ ...b, seen_at: now() }));
    const commands = [];
    const id = Number(b.job_id);
    if (b.job_id !== null && b.job_id !== undefined && Number.isInteger(id)) {
      const j = await db.get('SELECT id, status FROM factory_jobs WHERE id = ?', id);
      // menunggu_profil: profil balik draft saat job jalan → agen berhenti dulu sampai disetujui ulang.
      if (j?.status === 'dijeda' || j?.status === 'menunggu_profil') commands.push({ job_id: j.id, action: 'pause' });
      if (j?.status === 'dibatalkan') commands.push({ job_id: j.id, action: 'cancel' });
    }
    res.json({ ok: true, commands });
  });

  app.post('/api/factory/agent/claim', guard, async (req, res) => {
    const resume = await db.get(`SELECT * FROM factory_jobs WHERE status IN (${inList(ACTIVE)}) AND ${APPROVED} ORDER BY id ASC LIMIT 1`, ...ACTIVE);
    if (resume) return res.json({ job: await agentJob(resume) });
    const cands = await db.all(`SELECT id FROM factory_jobs WHERE status = 'antre' AND ${APPROVED} ORDER BY priority DESC, id ASC`);
    for (const c of cands) {
      const t = now();
      const rows = await db.run(`UPDATE factory_jobs SET status = 'menyiapkan', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ? AND status = 'antre' AND ${APPROVED} RETURNING id`, t, t, c.id);
      if (rows.length) return res.json({ job: await agentJob(await db.get('SELECT * FROM factory_jobs WHERE id = ?', c.id)) });
    }
    res.json({ job: null });
  });

  app.get('/api/factory/agent/peek', guard, async (req, res) => {
    const r = await db.get(`SELECT id FROM factory_jobs WHERE status = 'antre' AND ${APPROVED} LIMIT 1`);
    res.json({ waiting: !!r });
  });

  app.post('/api/factory/agent/jobs/:id/progress', guard, async (req, res) => {
    const j = await getJob(jobId(req));
    if (!j) return res.status(404).json({ error: 'Job nggak ketemu' });
    const b = req.body || {};
    const num = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
    const status = ['menyiapkan', 'produksi', 'dijeda'].includes(b.status) ? b.status : null;
    const sets = []; const args = [];
    const done = num(b.done); const failed = num(b.failed);
    if (done !== null) { sets.push('done = CASE WHEN ? > done THEN ? ELSE done END'); args.push(done, done); }
    if (failed !== null) { sets.push('failed = ?'); args.push(failed); }
    if (typeof b.drive_url === 'string') { sets.push('drive_url = ?'); args.push(b.drive_url); }
    if (typeof b.message === 'string') { sets.push('message = ?'); args.push(b.message.slice(0, 1000)); }
    if (typeof b.eta_at === 'string') { sets.push('eta_at = ?'); args.push(b.eta_at); }
    // Status hanya boleh diubah dari menyiapkan/produksi; job dijeda user hanya menerima hitungan.
    const apply = async (allowed, extraSets, extraArgs) => {
      const all = [...extraSets, ...sets];
      if (!all.length) return;
      await db.run(`UPDATE factory_jobs SET ${all.join(', ')}, updated_at = ? WHERE id = ? AND status IN (${inList(allowed)})`, ...extraArgs, ...args, now(), j.id, ...allowed);
    };
    if (ACTIVE.includes(j.status)) await apply(ACTIVE, status ? ['status = ?'] : [], status ? [status] : []);
    else if (j.status === 'dijeda') await apply(['dijeda'], [], []);
    const cur = await db.get('SELECT status FROM factory_jobs WHERE id = ?', j.id);
    const action = ['dijeda', 'menunggu_profil'].includes(cur.status) ? 'pause' : cur.status === 'dibatalkan' ? 'cancel' : 'continue';
    res.json({ ok: true, action });
  });

  app.post('/api/factory/agent/jobs/:id/fail', guard, async (req, res) => {
    const j = await getJob(jobId(req));
    if (!j) return res.status(404).json({ error: 'Job nggak ketemu' });
    const message = String(req.body?.message ?? '').slice(0, 1000);
    const allowed = [...ACTIVE, 'dijeda'];
    const rows = await db.run(`UPDATE factory_jobs SET status = 'gagal', message = ?, finished_at = ?, updated_at = ? WHERE id = ? AND status IN (${inList(allowed)}) RETURNING id`, message, now(), now(), j.id, ...allowed);
    if (rows.length) await notifyFn(db, j.brand_id, 'factory_done', `❌ Motion Factory: ${j.product_name} gagal — ${message}`).catch(() => {});
    res.json({ ok: true });
  });

  app.post('/api/factory/agent/jobs/:id/done', guard, async (req, res) => {
    const j = await getJob(jobId(req));
    if (!j) return res.status(404).json({ error: 'Job nggak ketemu' });
    const b = req.body || {};
    const done = Number.isInteger(b.done) && b.done >= 0 ? b.done : 0;
    const url = String(b.drive_url ?? '');
    const allowed = [...ACTIVE, 'dijeda'];
    const rows = await db.run(`UPDATE factory_jobs SET status = 'selesai', done = CASE WHEN ? > done THEN ? ELSE done END, drive_url = COALESCE(NULLIF(?, ''), drive_url), finished_at = ?, updated_at = ? WHERE id = ? AND status IN (${inList(allowed)}) RETURNING done, drive_url`, done, done, url, now(), now(), j.id, ...allowed);
    if (rows.length) await notifyFn(db, j.brand_id, 'factory_done', `✅ Motion Factory: ${j.product_name} ${rows[0].done} video selesai\n${rows[0].drive_url || ''}`).catch(() => {});
    res.json({ ok: true });
  });
  // ---- Hermes / CLI di Mac (token agen yang sama): ringkasan + request produk Mac + jeda/lanjut/batal ----
  const brandNames = async () => new Map((await db.all('SELECT id, name FROM brands')).map((b) => [Number(b.id), b.name]));
  const shape = (j, names, products) => ({
    id: j.id, brand_id: j.brand_id, brand: names.get(Number(j.brand_id)) || null,
    product: j.mac_product ? macName(products, j.mac_product) : j.product_name, mac_product: j.mac_product || null,
    target: j.target, done: j.done, failed: j.failed, cta: j.cta, status: j.status, message: j.message, eta_at: j.eta_at,
    drive_url: j.drive_url, created_by: j.created_by, created_at: j.created_at, finished_at: j.finished_at,
  });

  app.get('/api/factory/agent/overview', guard, async (_req, res) => {
    const agent = await agentState(db);
    const names = await brandNames();
    const rows = await db.all('SELECT j.*, p.name AS product_name FROM factory_jobs j LEFT JOIN factory_products p ON p.id = j.product_id ORDER BY j.id DESC LIMIT 20');
    res.json({
      agent: { online: agent.online, state: agent.state, job_id: agent.job_id, seen_at: agent.seen_at, drive_free_gb: agent.drive_free_gb },
      products: agent.products.map((p) => ({ ...p, brand: names.get(Number(p.brand_id)) || null })),
      jobs: rows.map((j) => shape(j, names, agent.products)),
    });
  });

  app.post('/api/factory/agent/requests', guard, async (req, res) => {
    const b = req.body || {};
    const agent = await agentState(db);
    const r = await createMacJob(db, agent.products, { slug: String(b.mac_product || ''), target: b.target, cta: b.cta || 'kerkun', by: b.by || 'hermes' });
    if (r.error) return res.status(r.status).json({ error: r.error });
    const j = await getJob(r.job_id);
    res.json({ job: shape(j, await brandNames(), agent.products) });
  });

  const MOVES = {
    pause: [['antre', 'menyiapkan', 'produksi'], "'dijeda'"],
    resume: [['dijeda'], `CASE WHEN ${JOB_READY_SQL} THEN 'antre' ELSE 'menunggu_profil' END`],
    cancel: [['menunggu_profil', 'antre', 'menyiapkan', 'produksi', 'dijeda', 'gagal'], "'dibatalkan'"],
  };
  app.post('/api/factory/agent/requests/:id/:action', guard, async (req, res) => {
    const move = MOVES[req.params.action];
    if (!move) return res.status(400).json({ error: 'Aksi harus pause, resume, atau cancel' });
    const j = await getJob(jobId(req));
    if (!j) return res.status(404).json({ error: 'Request nggak ketemu' });
    const [from, toSql] = move;
    if (!from.includes(j.status)) return res.status(400).json({ error: `Request berstatus "${j.status}" nggak bisa di-${req.params.action}` });
    const rows = await db.run(`UPDATE factory_jobs SET status = ${toSql}, updated_at = ? WHERE id = ? AND status IN (${inList(from)}) RETURNING id`, now(), j.id, ...from);
    if (!rows.length) return res.status(409).json({ error: 'Status request sudah berubah, coba lagi' });
    const agent = await agentState(db);
    res.json({ job: shape(await getJob(j.id), await brandNames(), agent.products) });
  });
}
