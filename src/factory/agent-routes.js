// Motion Factory (sisi agen Mac mini): klaim job, laporan progres, heartbeat. Dikunci token Bearer.
import crypto from 'node:crypto';
import { setSetting, now } from '../db.js';
import { safeEqual } from '../auth.js';
import { notify } from '../notify.js';

let notifyFn = notify;
// Tes mengganti pengirim notifikasi; null mengembalikan yang asli.
export const setNotifyForTests = (fn) => { notifyFn = fn || notify; };

const parse = (s) => { try { return JSON.parse(s); } catch { return {}; } };
const ACTIVE = ['menyiapkan', 'produksi'];
const inList = (a) => a.map(() => '?').join(',');
const APPROVED = "(SELECT status FROM factory_products WHERE id = factory_jobs.product_id) = 'approved'";

export function factoryAgentRoutes(app, db, { token } = {}) {
  const guard = (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!token || !m || !safeEqual(m[1], token)) return res.status(401).json({ error: 'Token agen salah' });
    next();
  };
  const jobId = (req) => { const n = Number(req.params.id); return Number.isInteger(n) ? n : null; };
  const getJob = (id) => (id === null ? null : db.get('SELECT j.*, p.name AS product_name FROM factory_jobs j LEFT JOIN factory_products p ON p.id = j.product_id WHERE j.id = ?', id));

  async function agentJob(j) {
    const p = await db.get('SELECT * FROM factory_products WHERE id = ?', j.product_id);
    // profile_version berubah tiap isi profil/gambar berubah → agen menyiapkan ulang produk (install + stem baru).
    const profile_version = crypto.createHash('sha256').update(JSON.stringify([p.profile, p.product_image, p.label_image])).digest('hex').slice(0, 16);
    return {
      id: j.id, brand_id: j.brand_id, target: j.target, cta: j.cta, footage_url: j.footage_url, done: j.done, drive_url: j.drive_url,
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
}
