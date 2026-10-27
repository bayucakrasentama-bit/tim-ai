// TIM-AI shell v3: toast bertumpuk, select kustom, Command Palette (Cmd/Ctrl+K),
// grup sidebar yang bisa diciutkan, Esc untuk tutup modal.
// Berdiri sendiri di atas window.siarin (app.js) — modul lain tidak perlu diubah.
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = () => window.siarin;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* mode privat */ } },
};
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const svg = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  caret: '<path d="M7 10l5 5 5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  card: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

// ---------- Toast bertumpuk ----------
// app.js tetap memanggil toast(msg) yang menulis ke #toast; di sini teks itu diubah jadi kartu bertumpuk.
const toastBox = document.createElement('div');
toastBox.className = 'ds-toasts';
toastBox.setAttribute('aria-live', 'polite');
document.body.append(toastBox);
function pushToast(msg, kind) {
  if (!msg) return;
  kind ||= /gagal|error|http \d|tidak bisa|belum|salah|cannot|undefined|failed/i.test(msg) ? 'bad' : /tersimpan|disalin|berhasil|sukses|dihapus|tersambung|terkirim|dijadwalkan|disetujui|dipindah|diperbarui|siap!|rencana tayang|diisi|dikirim|hasil ai siap|dibuat|dimasukkan|masuk ke kartu|dipindah ke generate/i.test(msg) ? 'ok' : 'info';
  const el = document.createElement('div');
  el.className = `ds-toast ${kind}`;
  el.innerHTML = `<span class="ds-toast-ic">${kind === 'bad' ? '!' : kind === 'ok' ? '✓' : 'i'}</span><span class="ds-toast-msg">${esc(msg)}</span><button class="ds-toast-x" aria-label="Tutup">×</button>`;
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  el.querySelector('.ds-toast-x').onclick = kill;
  setTimeout(kill, kind === 'bad' ? 5000 : 3000);
  toastBox.append(el);
  while (toastBox.children.length > 4) toastBox.firstElementChild.remove();
}
const legacyToast = $('#toast');
if (legacyToast) new MutationObserver(() => { if (!legacyToast.hidden) pushToast(legacyToast.textContent.trim()); }).observe(legacyToast, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

// ---------- Select kustom ----------
// <select> asli tetap ada (id, value, event change tetap jalan) — cuma disembunyikan dan diganti tombol + popover.
const enhanced = new WeakMap();
const brandColor = (value) => S()?.state?.brands?.find((b) => String(b.id) === String(value))?.color;

function enhanceSelect(sel) {
  if (enhanced.has(sel) || sel.multiple || sel.size > 1 || sel.dataset.native !== undefined || sel.closest('.ds-pop, .cmdk')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `ds-select ${sel.classList.contains('brand-switch') ? 'brand-switch' : ''}`;
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
  sel.classList.add('ds-native');
  sel.tabIndex = -1;
  sel.after(btn);
  enhanced.set(sel, btn);
  const sync = () => {
    const opt = sel.options[sel.selectedIndex];
    const dot = sel.id === 'brand-switch' ? `<span class="ds-dot" style="background:${esc(brandColor(sel.value) || '')}"></span>` : '';
    btn.className = ['ds-select', ...[...sel.classList].filter((c) => /^(pt-|st-|brand-switch$)/.test(c))].join(' ');
    btn.innerHTML = `${dot}<span class="ds-sel-label ${opt ? '' : 'placeholder'}">${esc(opt?.textContent || 'Pilih...')}</span>${svg(IC.caret, 'ds-sel-caret')}`;
    btn.hidden = sel.hidden;
    btn.disabled = sel.disabled;
    btn.style.display = sel.hidden || getComputedStyle(sel).display === 'none' ? 'none' : '';
  };
  sel._dsSync = sync;
  sync();
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'style', 'class'] });
  sel.addEventListener('change', sync);
  btn.addEventListener('click', () => openPop(sel, btn));
  btn.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openPop(sel, btn); }
  });
  // label[for] yang menunjuk select ikut membuka popover
  if (sel.id) document.querySelectorAll(`label[for="${CSS.escape(sel.id)}"]`).forEach((l) => l.addEventListener('click', (e) => { e.preventDefault(); btn.focus(); }));
}

// .value / .selectedIndex yang diubah lewat kode tidak memicu event — patch setter-nya supaya tombol ikut berubah.
for (const prop of ['value', 'selectedIndex']) {
  const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
  Object.defineProperty(HTMLSelectElement.prototype, prop, { ...d, set(v) { d.set.call(this, v); this._dsSync?.(); } });
}

let pop = null;
function closePop(focusBack = true) {
  if (!pop) return;
  pop.btn.setAttribute('aria-expanded', 'false');
  if (focusBack) pop.btn.focus();
  pop.el.remove();
  pop = null;
}
function openPop(sel, btn) {
  if (pop && !pop.el.isConnected) pop = null;
  if (pop?.sel === sel) return closePop();
  closePop(false);
  const items = [];
  for (const node of sel.children) {
    if (node.tagName === 'OPTGROUP') {
      items.push({ group: node.label });
      for (const o of node.children) items.push({ opt: o });
    } else items.push({ opt: node });
  }
  const optCount = items.filter((i) => i.opt).length;
  const el = document.createElement('div');
  el.className = 'ds-pop';
  el.innerHTML = `${optCount > 7 ? '<input class="ds-pop-search" placeholder="Cari..." aria-label="Cari pilihan">' : ''}<div class="ds-pop-list" role="listbox"></div>`;
  document.body.append(el);
  const list = $('.ds-pop-list', el);
  const search = $('.ds-pop-search', el);
  let active = -1;
  let shown = [];
  const draw = () => {
    const q = (search?.value || '').toLowerCase().trim();
    shown = [];
    let html = '';
    let pendingGroup = null;
    for (const it of items) {
      if (it.group) { pendingGroup = it.group; continue; }
      if (q && !it.opt.textContent.toLowerCase().includes(q)) continue;
      if (pendingGroup) { html += `<div class="ds-opt-group">${esc(pendingGroup)}</div>`; pendingGroup = null; }
      const i = shown.push(it.opt) - 1;
      const color = sel.id === 'brand-switch' ? brandColor(it.opt.value) : it.opt.dataset.color;
      html += `<div class="ds-opt" role="option" data-i="${i}" aria-selected="${it.opt.selected}" aria-disabled="${it.opt.disabled}">${color ? `<span class="ds-dot" style="background:${esc(color)}"></span>` : ''}<span>${esc(it.opt.textContent)}</span></div>`;
    }
    list.innerHTML = html || '<div class="ds-empty">Tidak ada yang cocok</div>';
    active = Math.max(0, shown.findIndex((o) => o.selected));
    if (q) active = 0;
    mark();
  };
  const mark = () => {
    list.querySelectorAll('.ds-opt').forEach((o) => o.classList.toggle('active', Number(o.dataset.i) === active));
    list.querySelector('.ds-opt.active')?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (i) => {
    const o = shown[i];
    if (!o || o.disabled) return;
    const changed = sel.value !== o.value;
    sel.value = o.value;
    closePop();
    if (changed) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  list.addEventListener('mousemove', (e) => { const o = e.target.closest('.ds-opt'); if (o && Number(o.dataset.i) !== active) { active = Number(o.dataset.i); mark(); } });
  // Klik hantu (touch / klik ganda) tepat setelah popover terbuka jangan langsung memilih opsi.
  const openedAt = performance.now();
  list.addEventListener('click', (e) => { const o = e.target.closest('.ds-opt'); if (o && performance.now() - openedAt > 250) choose(Number(o.dataset.i)); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
    else if (e.key === 'Home') { e.preventDefault(); active = 0; mark(); }
    else if (e.key === 'End') { e.preventDefault(); active = shown.length - 1; mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); }
    else if (e.key === 'Tab') closePop(false);
    else if (!search && e.key.length === 1) { // ketik huruf = lompat ke opsi
      const k = e.key.toLowerCase();
      const i = shown.findIndex((o, j) => j > active && o.textContent.trim().toLowerCase().startsWith(k));
      const j = i >= 0 ? i : shown.findIndex((o) => o.textContent.trim().toLowerCase().startsWith(k));
      if (j >= 0) { active = j; mark(); }
    }
  });
  search?.addEventListener('input', draw);
  pop = { sel, btn, el };
  btn.setAttribute('aria-expanded', 'true');
  draw();
  // Posisi: di bawah tombol, pindah ke atas kalau mentok bawah layar.
  const r = btn.getBoundingClientRect();
  el.style.minWidth = `${Math.max(200, r.width)}px`;
  const h = el.offsetHeight;
  const up = r.bottom + h + 8 > innerHeight && r.top > h + 8;
  el.classList.toggle('up', up);
  el.style.top = `${up ? r.top - h - 6 : r.bottom + 6}px`;
  el.style.left = `${Math.min(Math.max(12, r.left), innerWidth - el.offsetWidth - 12)}px`;
  (search || el).focus?.();
  if (!search) { el.tabIndex = -1; el.focus(); }
}
document.addEventListener('mousedown', (e) => { if (pop && !pop.el.contains(e.target) && !pop.btn.contains(e.target)) closePop(false); });
addEventListener('resize', () => closePop(false));
document.addEventListener('scroll', (e) => { if (pop && !pop.el.contains(e.target)) closePop(false); }, true);

const enhanceAll = (root = document) => root.querySelectorAll?.('select').forEach(enhanceSelect);
enhanceAll();
// Modul mengisi halaman lewat innerHTML — select baru ikut diganti otomatis.
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.tagName === 'SELECT') enhanceSelect(n); else enhanceAll(n);
  }
}).observe(document.body, { childList: true, subtree: true });

// ---------- Sidebar: tombol cari + grup yang bisa diciutkan ----------
const sbTop = $('.sb-top');
const searchBtn = document.createElement('button');
searchBtn.type = 'button';
searchBtn.className = 'sb-search';
searchBtn.title = 'Cari menu, konten, aksi';
searchBtn.innerHTML = `${svg(IC.search)}<span>Cari atau lompat...</span><kbd>${isMac ? '⌘' : 'Ctrl'} K</kbd>`;
searchBtn.addEventListener('click', () => openCmdk());
sbTop?.append(searchBtn);

const navObserver = new MutationObserver(() => syncGroups());
const collapsedGroups = new Set(store.get('timai.navGroups', []));
const groupItems = (g) => {
  const out = [];
  for (let el = g.nextElementSibling; el && !el.classList.contains('nav-group') && el.id !== 'nav-more'; el = el.nextElementSibling) if (el.dataset.view) out.push(el);
  return out;
};
function syncGroups() {
  document.querySelectorAll('#nav .nav-group').forEach((g) => {
    const key = g.dataset.group;
    const off = collapsedGroups.has(key);
    g.classList.toggle('collapsed', off);
    g.setAttribute('aria-expanded', String(!off));
    const items = groupItems(g);
    // Menu yang sedang aktif tetap kelihatan walau grupnya diciutkan.
    items.forEach((b) => b.classList.toggle('ng-hide', off && !b.classList.contains('active')));
    const count = items.reduce((n, b) => n + (Number(b.querySelector('.nav-badge:not([hidden])')?.textContent.replace('+', '')) || 0), 0);
    let c = g.querySelector('.ng-count');
    if (off && count) {
      if (!c) { c = document.createElement('span'); c.className = 'ng-count'; g.append(c); }
      const text = count > 99 ? '99+' : String(count);
      if (c.textContent !== text) c.textContent = text;
    } else c?.remove();
  });
  navObserver.takeRecords(); // perubahan buatan sendiri jangan memicu sync lagi
}
document.querySelectorAll('#nav .nav-group').forEach((g) => {
  g.setAttribute('role', 'button');
  g.tabIndex = 0;
  const label = g.textContent.trim();
  g.innerHTML = `<span>${esc(label)}</span>`;
  const toggle = () => {
    const key = g.dataset.group;
    collapsedGroups.has(key) ? collapsedGroups.delete(key) : collapsedGroups.add(key);
    store.set('timai.navGroups', [...collapsedGroups]);
    syncGroups();
  };
  g.addEventListener('click', toggle);
  g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
});
navObserver.observe($('#nav'), { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'], characterData: true, childList: true });
syncGroups();

// ---------- Esc menutup modal ----------
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || pop || !cmdk.hidden) return;
  const modal = $('#modal');
  if (modal && !modal.hidden && !e.defaultPrevented) { S()?.closeModal?.(); modal.hidden = true; }
  if (document.body.classList.contains('sb-open')) document.body.classList.remove('sb-open');
});

// ---------- Command Palette ----------
const cmdk = document.createElement('div');
cmdk.className = 'cmdk-wrap';
cmdk.hidden = true;
cmdk.innerHTML = `<div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
  <div class="cmdk-head">${svg(IC.search)}<input id="cmdk-q" placeholder="Cari menu, konten, brand, skrip CS, atau aksi..." autocomplete="off" spellcheck="false"><span class="cmdk-scope" id="cmdk-scope"></span></div>
  <div class="cmdk-list" id="cmdk-list" role="listbox"></div>
  <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> pilih</span><span><kbd>↵</kbd> buka</span><span><kbd>esc</kbd> tutup</span></div>
</div>`;
document.body.append(cmdk);
const cq = $('#cmdk-q', cmdk);
const clist = $('#cmdk-list', cmdk);
let cItems = [];
let cActive = 0;
let contentCache = null;

const navIcon = (view) => document.querySelector(`#nav [data-view="${view}"] .nav-ic`)?.outerHTML || svg(IC.arrow);
const go = (view) => S()?.show(view);
const after = (fn) => setTimeout(fn, 60);
const clickIn = (view, pick) => { go(view); after(() => { const b = pick(document.getElementById(`view-${view}`)); if (b) b.click(); else S()?.toast('Aksi ini belum ada di halaman tersebut'); }); };
const findBtn = (root, re) => [...(root?.querySelectorAll('button, a.btn') || [])].find((b) => re.test(b.textContent));

const currentTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function actions() {
  return [
    { group: 'Aksi cepat', title: 'Buat konten baru', meta: 'Planner', icon: IC.plus, kw: 'tambah kartu ide konten new', run: () => { go('planner'); after(() => $('#planner-add')?.click()); } },
    { group: 'Aksi cepat', title: 'Jadwalkan post', meta: 'Buat Post', icon: IC.clock, kw: 'schedule posting compose', run: () => { go('compose'); after(() => { const r = document.querySelector('input[name=mode][value=schedule]'); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } $('#caption')?.focus(); }); } },
    { group: 'Aksi cepat', title: 'Posting sekarang', meta: 'Buat Post', icon: IC.arrow, kw: 'post publish', run: () => { go('compose'); after(() => $('#caption')?.focus()); } },
    { group: 'Aksi cepat', title: 'Tambah KOL', meta: 'Tim KOL', icon: IC.plus, kw: 'influencer kol baru', run: () => clickIn('kol', (v) => findBtn(v, /\+\s*(kol|tambah|baru)|tambah kol|campaign baru/i)) },
    { group: 'Aksi cepat', title: 'Tambah kreator affiliate', meta: 'Tim Affiliate', icon: IC.plus, kw: 'affiliate creator seeding', run: () => clickIn('affiliate', (v) => findBtn(v, /\+|tambah/i)) },
    { group: 'Aksi cepat', title: 'Input metrik manual', meta: 'Analitik', icon: IC.plus, kw: 'views data analitik', run: () => { go('analytics'); after(() => $('#an-add')?.click()); } },
    { group: 'Aksi cepat', title: 'Ide & script dengan AI', meta: 'AI Studio', icon: IC.star, kw: 'hook script generator ai', run: () => go('ai') },
    { group: 'Aksi cepat', title: `Ganti ke tema ${currentTheme() === 'dark' ? 'terang' : 'gelap'}`, meta: 'Tampilan', icon: IC.moon, kw: 'dark light mode theme', run: () => $('#theme-toggle')?.click() },
  ];
}
// Tab tambahan divisi (divisions.js): buka halamannya, tunggu tab tersisip, lalu klik.
const openTab = (view, key) => {
  go(view);
  let n = 0;
  const tick = () => {
    const b = document.querySelector(`#view-${view} [data-x-tab="${key}"]`);
    if (b) b.click(); else if (n++ < 20) setTimeout(tick, 100);
  };
  setTimeout(tick, 80);
};
const TAB_ITEMS = [
  ['adv', 'tracker', 'Tracker harian iklan', 'Tim ADV', 'cpm ctr cpc cpr roas ads'],
  ['mp', 'store', 'Toko omnichannel', 'Tim MP', 'gmv aov cvr shopee tokopedia lazada tiktok shop'],
  ['mp', 'live', 'Live Command Center', 'Tim MP', 'live streaming host shift'],
  ['kol', 'roi', 'Kalkulator CPM & ROI', 'Tim KOL', 'influencer cpe roi'],
  ['affiliate', 'leaderboard', 'Leaderboard & sampel telat', 'Tim Affiliate', 'overdue sampel kreator tier'],
  ['cs', 'daily', 'Lead & closing harian', 'Tim CS', 'closing rate chat follow up'],
];
const tabItems = () => TAB_ITEMS.filter(([v]) => document.getElementById(`view-${v}`)).map(([v, key, title, meta, kw]) => ({
  group: 'Workspace divisi', title, meta, iconHtml: navIcon(v), kw, run: () => openTab(v, key),
}));
function navItems() {
  const out = [];
  let group = 'Umum';
  for (const el of document.querySelectorAll('#nav > *')) {
    if (el.classList.contains('nav-group')) { group = el.textContent.trim(); continue; }
    if (!el.dataset.view) continue;
    const title = el.querySelector('.nav-label')?.textContent.trim() || el.textContent.trim();
    out.push({ group: 'Menu', title, meta: group, iconHtml: navIcon(el.dataset.view), kw: `${group} ${el.dataset.view}`, run: () => go(el.dataset.view) });
  }
  return out;
}
function brandItems() {
  const st = S()?.state;
  return (st?.brands || []).map((b) => ({
    group: 'Brand', title: `Ganti ke ${b.name}`, meta: b.id === st.brandId ? 'aktif' : '', iconHtml: `<span class="dot" style="background:${esc(b.color || 'var(--accent)')}"></span>`,
    kw: 'brand workspace', run: () => { if (b.id !== st.brandId) { const sel = document.getElementById('brand-switch'); sel.value = String(b.id); sel.dispatchEvent(new Event('change', { bubbles: true })); } },
  }));
}
const STAGE = { ide: 'Ide', rencana: 'Rencana', scripting: 'Scripting', produksi: 'Produksi', review: 'Review', siap: 'Siap', terjadwal: 'Terjadwal', tayang: 'Tayang' };
function contentItems() {
  return (contentCache || []).map((c) => ({
    group: 'Konten', title: c.title || '(tanpa judul)', meta: STAGE[c.status] || c.status || '', icon: IC.card,
    kw: `${c.pillar || ''} ${c.hook || ''} ${(c.platforms || []).join(' ')}`,
    run: () => { go('planner'); after(() => { const card = document.querySelector(`.kcard[data-content="${c.id}"]`); if (card) card.click(); }); },
  }));
}
let scriptCache = null;
function scriptItems() {
  return (scriptCache || []).map((t) => ({
    group: 'Skrip CS', title: t.title || '(tanpa judul)', sub: (t.body || '').replace(/\s+/g, ' ').slice(0, 110), meta: 'salin', icon: IC.card,
    kw: `${t.category || ''} ${t.body || ''}`,
    run: () => navigator.clipboard?.writeText(t.body || '').then(() => pushToast(`Disalin: ${t.title}`, 'ok')).catch(() => pushToast('Gagal menyalin', 'bad')),
  }));
}
function score(item, q) {
  if (!q) return 1;
  const t = item.title.toLowerCase();
  const hay = `${t} ${(item.meta || '').toLowerCase()} ${(item.kw || '').toLowerCase()}`;
  if (t.startsWith(q)) return 4;
  if (t.includes(q)) return 3;
  const words = q.split(/\s+/);
  if (words.every((w) => hay.includes(w))) return 2;
  // Inisial kata: "bp" cocok dengan "Buat Post"
  const initials = t.split(/[^a-z0-9]+/).filter(Boolean).map((w) => w[0]).join('');
  return q.length >= 2 && !q.includes(' ') && initials.startsWith(q) ? 1 : 0;
}
const hl = (title, q) => {
  if (!q) return esc(title);
  const i = title.toLowerCase().indexOf(q);
  return i < 0 ? esc(title) : `${esc(title.slice(0, i))}<mark>${esc(title.slice(i, i + q.length))}</mark>${esc(title.slice(i + q.length))}`;
};
function drawCmdk() {
  const q = cq.value.toLowerCase().trim();
  const onCs = ['view-cs', 'view-inbox'].includes(document.querySelector('.view.active')?.id);
  const pools = q ? [actions(), navItems(), tabItems(), brandItems(), contentItems(), scriptItems()]
    : onCs ? [scriptItems(), actions().slice(0, 4), navItems()] : [actions().slice(0, 4), navItems(), brandItems()];
  const limit = { Konten: 8, 'Skrip CS': q ? 8 : 6 };
  cItems = [];
  for (const pool of pools) {
    const ranked = pool.map((it) => [it, score(it, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([it]) => it);
    cItems.push(...ranked.slice(0, limit[pool[0]?.group] || 50));
  }
  let html = '';
  let g = null;
  cItems.forEach((it, i) => {
    if (it.group !== g) { g = it.group; html += `<div class="cmdk-group">${esc(g)}</div>`; }
    html += `<div class="cmdk-item" role="option" data-i="${i}"><span class="cmdk-ic">${it.iconHtml || svg(it.icon)}</span><span class="cmdk-title">${hl(it.title, q)}${it.sub ? `<span class="cmdk-sub">${esc(it.sub)}</span>` : ''}</span><span class="cmdk-meta">${esc(it.meta || '')}</span></div>`;
  });
  clist.innerHTML = html || `<div class="ds-empty">Tidak ada hasil untuk "${esc(cq.value)}"</div>`;
  cActive = 0;
  markCmdk();
}
function markCmdk() {
  clist.querySelectorAll('.cmdk-item').forEach((el) => el.classList.toggle('active', Number(el.dataset.i) === cActive));
  clist.querySelector('.cmdk-item.active')?.scrollIntoView({ block: 'nearest' });
}
function runCmdk(i) {
  const it = cItems[i];
  if (!it) return;
  closeCmdk();
  it.run();
}
function openCmdk() {
  closePop(false);
  cmdk.hidden = false;
  cq.value = '';
  const brand = S()?.state?.brands?.find((b) => b.id === S()?.state?.brandId);
  $('#cmdk-scope', cmdk).textContent = brand ? brand.name : '';
  $('#cmdk-scope', cmdk).hidden = !brand;
  drawCmdk();
  cq.focus();
  // Kartu konten dimuat di latar supaya bisa dicari; gagal = diam saja.
  S()?.api('/api/content').then((r) => { contentCache = Array.isArray(r) ? r : []; if (!cmdk.hidden && cq.value) drawCmdk(); }).catch(() => {});
  S()?.api('/api/cs/templates').then((r) => { scriptCache = Array.isArray(r) ? r : []; if (!cmdk.hidden) drawCmdk(); }).catch(() => {});
}
function closeCmdk() { cmdk.hidden = true; }
cq.addEventListener('input', drawCmdk);
// Dengar di document (bukan cuma input) supaya tetap jalan walau fokus sempat lepas dari input.
document.addEventListener('keydown', (e) => {
  if (cmdk.hidden) return;
  if (e.target !== cq && e.key.length === 1 && !e.metaKey && !e.ctrlKey) cq.focus();
  if (e.key === 'ArrowDown') { e.preventDefault(); cActive = Math.min(cItems.length - 1, cActive + 1); markCmdk(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cActive = Math.max(0, cActive - 1); markCmdk(); }
  else if (e.key === 'Enter') { e.preventDefault(); runCmdk(cActive); }
  else if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); }
});
cmdk.addEventListener('mousemove', (e) => { const el = e.target.closest('.cmdk-item'); if (el && Number(el.dataset.i) !== cActive) { cActive = Number(el.dataset.i); markCmdk(); } });
cmdk.addEventListener('click', (e) => {
  if (e.target === cmdk) return closeCmdk();
  const el = e.target.closest('.cmdk-item');
  if (el) runCmdk(Number(el.dataset.i));
});
// Fase capture di window + stopImmediatePropagation: ops.js juga memasang Ctrl/Cmd+K (skrip CS);
// skrip CS kini ikut dicari di palette ini, jadi pintasan lama tidak perlu ikut terbuka.
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopImmediatePropagation(); cmdk.hidden ? openCmdk() : closeCmdk(); }
}, true);

// Ganti brand selalu dikonfirmasi lewat toast.
document.getElementById('brand-switch')?.addEventListener('change', (e) => {
  const b = S()?.state?.brands?.find((x) => String(x.id) === e.target.value);
  if (b) pushToast(`Brand aktif: ${b.name}`, 'ok');
});

window.timaiShell = { toast: pushToast, openCmdk, closeCmdk, enhanceSelect };
