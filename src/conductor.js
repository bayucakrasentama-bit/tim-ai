import { getSetting, setSetting } from './db.js';
import { canManage } from './auth.js';

const emptyCatalog = () => ({ teams: [], agents: [] });
const idPattern = /^custom-[a-z0-9-]{1,45}$/;
const fieldKeyPattern = /^[a-z][a-z0-9_]{0,39}$/;
const text = (value, label, max, required = true) => {
  const valueText = String(value ?? '').trim();
  if (required && !valueText) throw Object.assign(new Error(`${label} wajib diisi`), { status: 400 });
  if (valueText.length > max) throw Object.assign(new Error(`${label} terlalu panjang (maks ${max} karakter)`), { status: 400 });
  return valueText;
};
const bad = (message) => { throw Object.assign(new Error(message), { status: 400 }); };

function normalizeTeam(team) {
  if (!team || !idPattern.test(String(team.id || ''))) bad('ID divisi harus diawali custom- dan hanya berisi huruf kecil, angka, atau tanda -');
  return {
    id: String(team.id),
    label: text(team.label, 'Nama divisi', 80),
    icon: text(team.icon || '🧩', 'Ikon divisi', 12),
  };
}
function normalizeField(field) {
  if (!field || !fieldKeyPattern.test(String(field.k || ''))) bad('Kunci field tidak valid');
  const out = { k: String(field.k), label: text(field.label, 'Label field', 80), req: field.req === true };
  if (field.ph != null) out.ph = text(field.ph, 'Placeholder', 240, false);
  if (field.def != null) out.def = text(field.def, 'Nilai awal', 240, false);
  if (field.rows != null) {
    const rows = Number(field.rows);
    if (!Number.isInteger(rows) || rows < 1 || rows > 12) bad('Jumlah baris field harus 1–12');
    out.rows = rows;
  }
  if (field.opts != null) {
    if (!Array.isArray(field.opts) || field.opts.length > 15) bad('Pilihan field maksimal 15 opsi');
    out.opts = field.opts.map((v) => text(v, 'Opsi field', 80));
  }
  return out;
}
function normalizeAgent(agent, teamIds) {
  if (!agent || !idPattern.test(String(agent.id || ''))) bad('ID agen harus diawali custom- dan hanya berisi huruf kecil, angka, atau tanda -');
  const team = String(agent.team || '');
  if (!teamIds.has(team)) bad(`Agen ${agent.name || agent.id} merujuk divisi yang belum ada`);
  if (!Array.isArray(agent.fields) || agent.fields.length > 12) bad('Agen harus punya maksimal 12 field input');
  const fields = agent.fields.map(normalizeField);
  if (new Set(fields.map((f) => f.k)).size !== fields.length) bad('Field agen tidak boleh duplikat');
  return {
    id: String(agent.id), team,
    name: text(agent.name, 'Nama agen', 80),
    role: text(agent.role, 'Peran agen', 180),
    desc: text(agent.desc, 'Deskripsi agen', 400),
    fields,
    sys: text(agent.sys, 'Instruksi agen', 4000),
    out: text(agent.out, 'Format output agen', 4000),
  };
}

const knownBuiltInTeams = new Set(['founder', 'konten', 'digital', 'medsos', 'adv', 'mp', 'kol', 'affiliate', 'cs']);

export function mergeCustomCatalog(current = emptyCatalog(), proposal = {}) {
  const teams = Array.isArray(current.teams) ? current.teams : [];
  const agents = Array.isArray(current.agents) ? current.agents : [];
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) bad('Proposal katalog tidak valid');
  const newTeams = proposal.teams ?? [];
  const newAgents = proposal.agents ?? [];
  if (!Array.isArray(newTeams) || !Array.isArray(newAgents)) bad('Divisi dan agen harus berupa daftar');
  if (teams.length + newTeams.length > 20) bad('Maksimal 20 divisi kustom per brand');
  if (agents.length + newAgents.length > 80) bad('Maksimal 80 agen kustom per brand');
  const teamIds = new Set([...knownBuiltInTeams, ...teams.map((x) => String(x.id))]);
  const normalizedTeams = newTeams.map(normalizeTeam);
  for (const team of normalizedTeams) {
    if (teamIds.has(team.id)) bad(`ID divisi duplikat: ${team.id}`);
    teamIds.add(team.id);
  }
  const agentIds = new Set(agents.map((x) => String(x.id)));
  const normalizedAgents = newAgents.map((agent) => {
    const normalized = normalizeAgent(agent, teamIds);
    if (agentIds.has(normalized.id)) bad(`ID agen duplikat: ${normalized.id}`);
    agentIds.add(normalized.id);
    return normalized;
  });
  return { teams: [...teams, ...normalizedTeams], agents: [...agents, ...normalizedAgents] };
}

const catalogKey = (brandId) => `conductor_catalog:${Number(brandId)}`;
async function readCatalog(db, brandId) {
  const raw = await getSetting(db, catalogKey(brandId));
  if (!raw) return emptyCatalog();
  try {
    const data = JSON.parse(raw);
    return { teams: Array.isArray(data.teams) ? data.teams : [], agents: Array.isArray(data.agents) ? data.agents : [] };
  } catch { return emptyCatalog(); }
}

export function conductorRoutes(app, db, scope) {
  app.get('/api/conductor/catalog', scope, async (req, res) => {
    res.json({ ...(await readCatalog(db, req.brand.id)), canManage: canManage(req.user) });
  });
  app.post('/api/conductor/catalog', scope, async (req, res) => {
    if (!canManage(req.user)) return res.status(403).json({ error: 'Hanya owner/admin yang boleh menyetujui divisi dan agen baru' });
    try {
      const catalog = mergeCustomCatalog(await readCatalog(db, req.brand.id), req.body);
      await setSetting(db, catalogKey(req.brand.id), JSON.stringify(catalog));
      res.status(201).json({ ...catalog, canManage: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });
}
