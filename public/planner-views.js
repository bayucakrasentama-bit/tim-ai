// Content Planner multi-view: Kanban (bawaan suite.js) + Tabel (edit langsung) + Matriks Pilar.
// Kartu tetap dibuka lewat modal suite.js: elemen ber-[data-content] otomatis membuka kartunya.
const S = window.siarin;
const { api, esc, state } = S;
const $ = (sel, el = document) => el.querySelector(sel);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* mode privat */ } },
};

const STAGES = [
  { id: 'ide', label: 'Ide', tone: 'info' }, { id: 'draft', label: 'Draft', tone: 'info' },
  { id: 'review', label: 'Review', tone: 'warn' }, { id: 'siap', label: 'Siap', tone: 'ok' },
  { id: 'terjadwal', label: 'Terjadwal', tone: 'warn' }, { id: 'tayang', label: 'Tayang', tone: 'ok' },
];
const stageOf = (id) => STAGES.find((s) => s.id === id) || { id, label: id, tone: 'info' };
const PLATFORM_SHORT = { instagram: 'IG', tiktok: 'TT', youtube: 'YT', facebook: 'FB' };
const FORMATS = ['Reels', 'Video pendek', 'Video panjang', 'Carousel', 'Foto', 'Story', 'Live', 'Teks/Thread'];
const NO_PILLAR = '(tanpa pilar)';
const VIEWS = [
  { id: 'kanban', label: 'Kanban', icon: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>' },
  { id: 'table', label: 'Tabel', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>' },
  { id: 'pillar', label: 'Pilar', icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>' },
];

const ui = {
  view: store.get('timai.plannerView', 'kanban'),
  sort: store.get('timai.plannerSort', { key: 'planned_at', dir: 1 }),
  items: [],
  assignees: [],
  loaded: false,
};

// ---------- Kerangka ----------
const section = $('#view-planner');
const kanban = $('#kanban');
const seg = document.createElement('div');
seg.className = 'seg';
seg.id = 'planner-viewseg';
seg.setAttribute('role', 'tablist');
seg.setAttribute('aria-label', 'Tampilan planner');
seg.innerHTML = VIEWS.map((v) => `<button role="tab" data-pview="${v.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${v.icon}</svg>${v.label}</button>`).join('');
$('.row-between .btn-row', section)?.prepend(seg);
const host = document.createElement('div');
host.id = 'planner-alt';
kanban.after(host);

// ---------- Data ----------
async function load() {
  [ui.items, ui.assignees] = await Promise.all([api('/api/content'), ui.assignees.length ? ui.assignees : api('/api/assignees').catch(() => [])]);
  ui.loaded = true;
}
const who = (id) => ui.assignees.find((a) => a.id === id)?.username;
function filtered() {
  const q = $('#planner-search')?.value.trim().toLowerCase() || '';
  const mine = $('#planner-mine')?.checked;
  return ui.items.filter((i) => (!q || `${i.title} ${i.pillar} ${i.hook} ${i.format}`.toLowerCase().includes(q))
    && (!mine || i.assignee_id === state.me?.user.id));
}
async function patch(item, changes, msg) {
  const before = { ...item };
  Object.assign(item, changes);
  draw();
  try {
    await api(`/api/content/${item.id}`, json('PATCH', changes));
    S.toast(msg || 'Tersimpan');
    if (changes.status === 'siap') S.toast('Siap! Tim medsos tinggal jadwalkan dari kartunya.');
  } catch (ex) {
    Object.assign(item, before);
    draw();
    S.toast(ex.message);
  }
}
const toLocal = (iso) => (iso ? S.toLocalInput(new Date(iso)) : '');
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '');

// ---------- Tabel ----------
const COLS = [
  { key: 'title', label: 'Judul' }, { key: 'status', label: 'Status' }, { key: 'pillar', label: 'Pilar' },
  { key: 'format', label: 'Format' }, { key: 'platforms', label: 'Platform', nosort: true },
  { key: 'assignee_id', label: 'PIC' }, { key: 'planned_at', label: 'Rencana tayang' }, { key: 'assets', label: '📎', nosort: true },
];
function sortItems(list) {
  const { key, dir } = ui.sort;
  const val = (i) => {
    if (key === 'status') return STAGES.findIndex((s) => s.id === i.status);
    if (key === 'assignee_id') return who(i.assignee_id) || '￿';
    if (key === 'planned_at') return i.planned_at ? new Date(i.planned_at).getTime() : Infinity;
    return String(i[key] || '￿').toLowerCase();
  };
  return [...list].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0));
}
function drawTable() {
  const list = sortItems(filtered());
  const pillars = [...new Set(ui.items.map((i) => i.pillar).filter(Boolean))];
  host.innerHTML = `<div class="ptable-wrap card">
    <table class="ptable"><thead><tr>${COLS.map((c) => `<th ${c.nosort ? '' : `data-sort="${c.key}" tabindex="0"`} class="${ui.sort.key === c.key ? `sorted ${ui.sort.dir > 0 ? 'asc' : 'desc'}` : ''}">${c.label}</th>`).join('')}<th></th></tr></thead>
    <tbody>${list.map((i) => `<tr data-row="${i.id}">
      <td class="pt-title"><input class="pt-in" data-field="title" value="${esc(i.title)}" aria-label="Judul"></td>
      <td><select class="pt-status st-${esc(i.status)}" data-field="status" aria-label="Status">${STAGES.map((s) => `<option value="${s.id}" ${s.id === i.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></td>
      <td><input class="pt-in" data-field="pillar" value="${esc(i.pillar || '')}" list="pt-pillars" placeholder="–" aria-label="Pilar"></td>
      <td><select data-field="format" aria-label="Format"><option value="">–</option>${FORMATS.map((f) => `<option ${f === i.format ? 'selected' : ''}>${f}</option>`).join('')}</select></td>
      <td class="pt-pf">${(i.platforms || []).map((p) => `<span class="pf-chip pf-${esc(p)}" title="${esc(p)}">${PLATFORM_SHORT[p] || esc(p)}</span>`).join('') || '<span class="hint">–</span>'}</td>
      <td><select data-field="assignee_id" aria-label="PIC"><option value="">–</option>${ui.assignees.map((a) => `<option value="${a.id}" ${a.id === i.assignee_id ? 'selected' : ''}>${esc(a.username)}</option>`).join('')}</select></td>
      <td><input class="pt-in pt-date" type="datetime-local" data-field="planned_at" value="${toLocal(i.planned_at)}" aria-label="Rencana tayang"></td>
      <td class="pt-num" data-num>${i.assets?.length || ''}</td>
      <td><button class="ghost small" data-content="${i.id}" title="Buka kartu lengkap">Buka</button></td>
    </tr>`).join('')}</tbody></table>
    <datalist id="pt-pillars">${pillars.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
    ${list.length ? '' : '<div class="empty">Tidak ada kartu yang cocok. <button class="link" data-add-content>+ Konten baru</button></div>'}
  </div>
  <p class="hint">Klik sel untuk mengubah langsung. Perubahan tersimpan otomatis saat kamu pindah sel. Klik judul kolom untuk mengurutkan.</p>`;
}
host.addEventListener('change', (e) => {
  const f = e.target.closest('[data-field]');
  const row = e.target.closest('[data-row]');
  if (!f || !row) return;
  const item = ui.items.find((i) => i.id === Number(row.dataset.row));
  if (!item) return;
  let v = f.value;
  if (f.dataset.field === 'assignee_id') v = v === '' ? null : Number(v);
  if (f.dataset.field === 'planned_at') v = v ? new Date(v).toISOString() : null;
  if (f.dataset.field === 'title' && !v.trim()) { f.value = item.title; return S.toast('Judul tidak boleh kosong'); }
  if ((item[f.dataset.field] ?? '') === (v ?? '')) return;
  patch(item, { [f.dataset.field]: v }, f.dataset.field === 'status' ? `Dipindah ke ${stageOf(v).label}` : 'Tersimpan');
});
host.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.pt-in')) e.target.blur();
  if (e.key === 'Escape' && e.target.matches('.pt-in')) {
    const item = ui.items.find((i) => i.id === Number(e.target.closest('[data-row]').dataset.row));
    if (item && e.target.dataset.field !== 'planned_at') e.target.value = item[e.target.dataset.field] || '';
    e.target.blur();
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('th[data-sort]')) { e.preventDefault(); e.target.click(); }
});

// ---------- Matriks pilar ----------
function drawPillar() {
  const list = filtered();
  const groups = new Map();
  for (const i of list) {
    const key = (i.pillar || '').trim() || NO_PILLAR;
    const norm = [...groups.keys()].find((k) => k.toLowerCase() === key.toLowerCase()) || key;
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push(i);
  }
  const rows = [...groups.entries()].sort((a, b) => (a[0] === NO_PILLAR) - (b[0] === NO_PILLAR) || b[1].length - a[1].length);
  const total = list.length || 1;
  const active = (g) => g.filter((i) => i.status !== 'tayang').length;
  host.innerHTML = rows.length ? `
    <div class="pmix card">
      <div class="tile-head"><span class="tile-label">Komposisi pilar</span><span class="hint">${list.length} kartu</span></div>
      <div class="pmix-bar">${rows.map(([k, g], i) => `<span style="flex:${g.length}; --pc: var(--c${(i % 6) + 1})" data-tip="${esc(k)}: ${g.length} kartu (${Math.round((g.length / total) * 100)}%)"></span>`).join('')}</div>
      <div class="pmix-legend">${rows.map(([k, g], i) => `<span><i style="background: var(--c${(i % 6) + 1})"></i>${esc(k)} <b data-num>${Math.round((g.length / total) * 100)}%</b></span>`).join('')}</div>
    </div>
    <div class="pmatrix-wrap"><div class="pmatrix" style="--cols:${STAGES.length}">
      <div class="pm-corner">Pilar \\ Status</div>
      ${STAGES.map((s) => `<div class="pm-head"><span class="pill ${s.tone}">${s.label}</span></div>`).join('')}
      ${rows.map(([k, g], ri) => `
        <div class="pm-rowhead" style="--pc: var(--c${(ri % 6) + 1})"><b>${esc(k)}</b><span class="hint">${g.length} kartu · ${active(g)} aktif</span></div>
        ${STAGES.map((s) => {
    const cell = g.filter((i) => i.status === s.id);
    return `<div class="pm-cell" data-cell-pillar="${esc(k)}" data-cell-status="${s.id}">
            ${cell.slice(0, 4).map((i) => `<div class="pm-card" draggable="true" data-content="${i.id}" tabindex="0" title="${esc(i.title)}">${esc(i.title)}${i.planned_at ? `<span data-num>${shortDate(i.planned_at)}</span>` : ''}</div>`).join('')}
            ${cell.length > 4 ? `<button class="link small" data-expand-cell>+${cell.length - 4} lagi</button>` : ''}
          </div>`;
  }).join('')}`).join('')}
    </div></div>
    <p class="hint">Seret kartu ke sel lain untuk mengganti pilar dan/atau status sekaligus. Pilar yang kosong di kolom Ide berarti stok idenya perlu diisi.</p>`
    : '<div class="empty">Belum ada kartu. <button class="link" data-add-content>+ Konten baru</button></div>';
}
let dragId = null;
host.addEventListener('dragstart', (e) => {
  const c = e.target.closest('.pm-card');
  if (!c) return;
  dragId = Number(c.dataset.content);
  c.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
host.addEventListener('dragover', (e) => {
  const cell = e.target.closest('.pm-cell');
  if (!cell || dragId == null) return;
  e.preventDefault();
  host.querySelectorAll('.pm-cell.over').forEach((c) => c !== cell && c.classList.remove('over'));
  cell.classList.add('over');
});
host.addEventListener('dragend', () => { dragId = null; host.querySelectorAll('.over, .dragging').forEach((c) => c.classList.remove('over', 'dragging')); });
host.addEventListener('drop', (e) => {
  const cell = e.target.closest('.pm-cell');
  if (!cell || dragId == null) return;
  e.preventDefault();
  const item = ui.items.find((i) => i.id === dragId);
  dragId = null;
  if (!item) return;
  const pillar = cell.dataset.cellPillar === NO_PILLAR ? '' : cell.dataset.cellPillar;
  const changes = {};
  if (item.status !== cell.dataset.cellStatus) changes.status = cell.dataset.cellStatus;
  if ((item.pillar || '').toLowerCase() !== pillar.toLowerCase()) changes.pillar = pillar;
  if (Object.keys(changes).length) patch(item, changes, `Dipindah ke ${pillar || NO_PILLAR} · ${stageOf(cell.dataset.cellStatus).label}`);
});
host.addEventListener('click', (e) => {
  const th = e.target.closest('th[data-sort]');
  if (th) {
    ui.sort = { key: th.dataset.sort, dir: ui.sort.key === th.dataset.sort ? -ui.sort.dir : 1 };
    store.set('timai.plannerSort', ui.sort);
    drawTable();
    return;
  }
  const more = e.target.closest('[data-expand-cell]');
  if (more) {
    const cell = more.closest('.pm-cell');
    const g = filtered().filter((i) => ((i.pillar || '').trim() || NO_PILLAR).toLowerCase() === cell.dataset.cellPillar.toLowerCase() && i.status === cell.dataset.cellStatus);
    more.remove();
    cell.insertAdjacentHTML('beforeend', g.slice(4).map((i) => `<div class="pm-card" draggable="true" data-content="${i.id}" tabindex="0">${esc(i.title)}</div>`).join(''));
  }
});

// ---------- Ganti tampilan ----------
function draw() {
  seg.querySelectorAll('[data-pview]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pview === ui.view)));
  section.dataset.pview = ui.view;
  kanban.hidden = ui.view !== 'kanban';
  host.hidden = ui.view === 'kanban';
  if (ui.view === 'table') drawTable();
  if (ui.view === 'pillar') drawPillar();
}
async function setView(v) {
  ui.view = v;
  store.set('timai.plannerView', v);
  if (v === 'kanban') { draw(); S.viewHooks.planner?.(); return; } // kanban ambil data segar dari suite.js
  if (!ui.loaded) { host.hidden = false; kanban.hidden = true; host.innerHTML = '<div class="spinner"></div>'; }
  await load().catch((ex) => S.toast(ex.message));
  draw();
}
seg.addEventListener('click', (e) => { const b = e.target.closest('[data-pview]'); if (b) setView(b.dataset.pview); });
$('#planner-search')?.addEventListener('input', () => ui.view !== 'kanban' && draw());
$('#planner-mine')?.addEventListener('change', () => ui.view !== 'kanban' && draw());

// Kanban digambar ulang suite.js tiap ada perubahan (simpan modal, hapus, dll). Itu sinyal untuk memuat ulang tampilan lain.
let reloadTimer = null;
new MutationObserver(() => {
  if (ui.view === 'kanban' || !section.classList.contains('active')) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => load().then(draw).catch(() => {}), 150);
}).observe(kanban, { childList: true });

// Klik tahap di dashboard → buka kolom itu di kanban.
function focusStage() {
  const stage = store.get('timai.plannerStage', null);
  if (!stage) return;
  store.set('timai.plannerStage', null);
  if (ui.view !== 'kanban') setView('kanban');
  setTimeout(() => {
    const col = document.querySelector(`.kcol[data-col="${stage}"]`);
    col?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    col?.classList.add('flash');
    setTimeout(() => col?.classList.remove('flash'), 1200);
  }, 300);
}

const baseHook = S.viewHooks.planner;
S.viewHooks.planner = () => {
  if (ui.view === 'kanban') baseHook?.();
  else { baseHook?.(); setView(ui.view); }
  focusStage();
};
draw();
