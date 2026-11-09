// Permalink ala app/SaaS: setiap layar punya URL stabil yang bisa dibagikan.
// /konten, /adv, /cs  → workspace tim (tabel TEAM_HOME di bawah).
// /planner, /inbox    → langsung ke layar (view) yang bersangkutan.
// /cs (view Tiket & Template) dapat permalink /tiket supaya tidak bentrok.

const TEAM_HOME = {
  konten: 'planner',
  medsos: 'calendar',
  digital: 'launch',
  adv: 'adv',
  mp: 'mp',
  live: 'mp',
  kol: 'kol',
  affiliate: 'affiliate',
  cs: 'inbox',
  sales: 'closer',
  keuangan: 'founder',
  founder: 'founder',
  semua: 'today',
};

// view id → segmen URL. Yang tidak disebut otomatis memakai id-nya sendiri.
const VIEW_PATH = {
  cs: 'tiket', // "Tiket & Template"; /cs dipakai untuk workspace Tim CS
};

const teamOf = (token) => (token in TEAM_HOME ? token : null);
const viewOfToken = (token) => {
  for (const [view, seg] of Object.entries(VIEW_PATH)) if (seg === token) return view;
  return null; // dicek ulang terhadap daftar view sah oleh pemanggil
};

export function homeViewForTeam(team) {
  return TEAM_HOME[team] || 'today';
}

export function pathForView(view) {
  return `/${VIEW_PATH[view] || view}`;
}

export function pathForTeam(team) {
  return `/${team}`;
}

// pathname → view id, atau null kalau bukan permalink yang dikenal.
// validViews: opsional (Set) untuk membatasi ke view yang benar-benar ada.
export function viewFromPath(pathname, validViews) {
  const segs = String(pathname || '/').split('/').filter(Boolean).map((s) => s.toLowerCase());
  if (!segs.length) return null;
  const known = (view) => (!validViews || validViews.has(view)) && view;

  if (segs.length === 1) {
    const t = segs[0];
    if (teamOf(t)) return known(homeViewForTeam(t));
    const byAlias = viewOfToken(t);
    if (byAlias) return known(byAlias);
    if (known(t)) return t;
    return null;
  }
  if (segs.length === 2) {
    const [, t] = segs;
    const byAlias = viewOfToken(t);
    if (byAlias) return known(byAlias);
    if (known(t)) return t;
    return null;
  }
  return null;
}

// View yang bisa dibuka lewat URL (untuk validasi tombol/tautan).
export function isViewToken(token, validViews) {
  return !!viewFromPath(`/${token}`, validViews);
}
