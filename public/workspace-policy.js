// Aturan personalisasi UI; bukan otorisasi API. Akses data/brand tetap divalidasi server.
const MANAGERS = new Set(['owner', 'admin']);
const ACTIONS = {
  konten: [['planner', 'Kerjakan konten'], ['studio', 'Buat visual'], ['ai', 'Ide & script']],
  medsos: [['calendar', 'Jadwal tayang'], ['compose', 'Buat post'], ['analytics', 'Cek performa']],
  digital: [['launch', 'Proyek produk'], ['agents-digital', 'Agen produk'], ['studio', 'Buat visual']],
  adv: [['adv', 'Pantau iklan'], ['agents-adv', 'Agen Meta Ads'], ['reports', 'Laporan']],
  mp: [['mp', 'Iklan marketplace'], ['reports', 'Laporan']],
  live: [['mp', 'Jadwal & hasil live', 'live'], ['reports', 'Laporan']],
  kol: [['kol', 'KOL & influencer'], ['reports', 'Laporan']],
  affiliate: [['affiliate', 'Kreator affiliate'], ['reports', 'Laporan']],
  cs: [['inbox', 'Balas inbox'], ['closer', 'Closing & order'], ['cs', 'Tiket CS']],
  sales: [['closer', 'Follow-up & closing'], ['inbox', 'Percakapan prospek'], ['cs', 'Tiket & template']],
  keuangan: [['founder', 'Pantau keuangan', 'finance'], ['reports', 'Laporan tim']],
  founder: [['founder', 'Kantor AI'], ['reports', 'Laporan tim']],
  semua: [['today', 'Prioritas hari ini'], ['reports', 'Laporan tim'], ['team', 'Anggota & brand']],
};

export function visibleViews(subs, team, role, viewTeams) {
  if (MANAGERS.has(role) || team === 'semua') return subs;
  return subs.filter(([view]) => String(viewTeams(view) || '').split(/\s+/).includes(team));
}
export function homeForTeam() { return 'today'; }
export function todayAreas(team, role) {
  if (MANAGERS.has(role) || team === 'semua' || team === 'founder') return ['Konten', 'CS', 'Iklan'];
  if (team === 'konten' || team === 'medsos') return ['Konten'];
  if (team === 'cs' || team === 'sales') return ['CS'];
  if (team === 'adv') return ['Iklan'];
  return [];
}
export function doneKey(date, brandId, userId) {
  return `today.done.${date}.brand.${brandId}.user.${userId}`;
}
export function teamActions(team, role) {
  return (MANAGERS.has(role) ? ACTIONS.semua : ACTIONS[team] || ACTIONS.semua)
    .map(([view, label, tab]) => ({ view, label, ...(tab ? { tab } : {}) }));
}
