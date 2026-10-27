// Kantor AI (Tim Founder): laporan pagi lintas tim yang dikirim otomatis tiap hari lewat kanal notifikasi brand
// (Telegram / webhook gateway WhatsApp, diatur di Planner → Notifikasi). Dijalankan oleh /api/cron:
// begitu jam WIB sudah lewat jam kirim dan hari ini belum terkirim, laporan disusun AI dari laporan tiap tim lalu dikirim.
import { getSetting, setSetting } from './db.js';
import { teamReport, REPORT_TEAMS } from './reports.js';
import { askClaude, AiError } from './ai.js';
import { notify } from './notify.js';
import { canManage, OWNER } from './auth.js';

const key = (brandId) => `founder:${brandId}`;
const DEFAULTS = { enabled: false, hour: 6, days: 1, teams: ['adv', 'mp', 'medsos', 'cs'], last_sent: null };
const wib = (d = new Date()) => new Date(d.getTime() + 7 * 3600e3);
const todayWib = () => wib().toISOString().slice(0, 10);

export async function loadFounder(db, brandId) {
  return { ...DEFAULTS, ...JSON.parse((await getSetting(db, key(brandId))) || '{}') };
}
async function saveFounder(db, brandId, cfg) {
  await setSetting(db, key(brandId), JSON.stringify(cfg));
}

// Laporan tiap tim dipotong supaya muat di satu prompt.
async function collect(db, brand, cfg, ownerUsername) {
  const req = { user: { ...OWNER, username: ownerUsername }, brand, query: {} };
  const range = { from: new Date(Date.now() - cfg.days * 86400e3).toISOString(), to: null };
  const parts = await Promise.all(cfg.teams.filter((t) => REPORT_TEAMS.includes(t)).map(async (t) => {
    try { return `<tim nama="${t}">${JSON.stringify(await teamReport(db, t, req, range, ownerUsername)).slice(0, 4000)}</tim>`; } catch (err) { return `<tim nama="${t}">laporan gagal diambil: ${err.message}</tim>`; }
  }));
  const pipe = await db.all('SELECT status, COUNT(*) AS n FROM content_items WHERE brand_id = ? GROUP BY status', brand.id).catch(() => []);
  return `${parts.join('\n')}\n<planner>${JSON.stringify(Object.fromEntries(pipe.map((r) => [r.status, Number(r.n)])))}</planner>`;
}

export async function buildBrief(db, brand, cfg, ownerUsername = 'admin') {
  const date = wib().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const data = await collect(db, brand, cfg, ownerUsername);
  const text = await askClaude({
    system: 'Kamu chief of staff yang menulis laporan pagi untuk owner bisnis Indonesia. Tulis untuk WhatsApp: *tebal* pakai satu bintang, tanpa tabel, tanpa heading Markdown, maks 1.200 karakter. Jangan mengarang angka; kalau data kosong tulis "data belum masuk".',
    content: `Brand: ${brand.name}. Tanggal: ${date}. Periode: ${cfg.days} hari terakhir.\nData laporan tim (JSON):\n${data}\n\nFormat:\n☀️ *Laporan Pagi ${brand.name}* — ${date}\nlalu per tim 1-3 poin dengan angka kunci (spend, omzet, ROAS, konten tayang, chat/tiket), lalu *Keputusan hari ini* (3 poin, sebut tim penanggung jawab), lalu *Perlu perhatian* (risiko / data gap).`,
    effort: 'low',
    maxTokens: 3000,
  });
  return String(text).trim();
}

// Dipanggil /api/cron. Tandai terkirim dulu supaya instance cron yang jalan bareng tidak mengirim dua kali.
export async function runFounderBriefs(db, ownerUsername = 'admin') {
  const brands = await db.all('SELECT * FROM brands ORDER BY id');
  const hour = wib().getUTCHours();
  for (const brand of brands) {
    const cfg = await loadFounder(db, brand.id);
    if (!cfg.enabled || !cfg.teams.length || hour < cfg.hour || cfg.last_sent === todayWib()) continue;
    await saveFounder(db, brand.id, { ...cfg, last_sent: todayWib() });
    try {
      const text = await buildBrief(db, brand, cfg, ownerUsername);
      await notify(db, brand.id, 'founder_brief', text);
    } catch (err) {
      await notify(db, brand.id, 'founder_brief', `Laporan pagi ${brand.name} gagal disusun: ${err.message}`);
    }
  }
}

export function founderRoutes(app, db, scope, { ownerUsername = 'admin' } = {}) {
  app.get('/api/founder/settings', scope, async (req, res) => {
    res.json({ ...(await loadFounder(db, req.brand.id)), teams_available: REPORT_TEAMS, can_edit: canManage(req.user) });
  });

  app.put('/api/founder/settings', scope, async (req, res) => {
    if (!canManage(req.user)) return res.status(403).json({ error: 'Cuma pemilik/admin yang bisa mengatur laporan pagi' });
    const b = req.body || {};
    const cur = await loadFounder(db, req.brand.id);
    const next = {
      ...cur,
      enabled: !!b.enabled,
      hour: Math.min(Math.max(Math.round(Number(b.hour) || 0), 0), 23),
      days: [1, 7, 30].includes(Number(b.days)) ? Number(b.days) : 1,
      teams: (Array.isArray(b.teams) ? b.teams : []).filter((t) => REPORT_TEAMS.includes(t)),
    };
    await saveFounder(db, req.brand.id, next);
    res.json(next);
  });

  // Susun sekarang (pratinjau) dan, kalau send=true, kirim juga ke kanal notifikasi.
  app.post('/api/founder/brief', scope, async (req, res) => {
    const cfg = { ...(await loadFounder(db, req.brand.id)), ...(Array.isArray(req.body?.teams) ? { teams: req.body.teams.filter((t) => REPORT_TEAMS.includes(t)) } : {}),
      ...([1, 7, 30].includes(Number(req.body?.days)) ? { days: Number(req.body.days) } : {}) };
    try {
      const text = await buildBrief(db, req.brand, cfg, ownerUsername);
      const sent = req.body?.send ? await notify(db, req.brand.id, 'founder_brief', text) : null;
      res.json({ text, sent });
    } catch (err) {
      res.status(err instanceof AiError ? err.status || 503 : 500).json({ error: err.message });
    }
  });
}
