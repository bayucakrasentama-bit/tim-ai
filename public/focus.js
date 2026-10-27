// Mode Fokus (default): untuk tim kecil 1–2 orang. Sidebar jadi 6 menu kerja + "Lab" (terlipat) untuk fitur lainnya,
// tiap menu kerja punya tab hub (maks. 4) di atas halaman, dan baris tab di dalam halaman dibatasi 3 tab + "Lainnya ▾".
// Tidak ada fitur yang dihapus: menu lama tetap ada (disembunyikan) supaya badge, Command Palette (Ctrl+K), dan
// show() di modul lain tetap jalan. Mode lama bisa dinyalakan lagi dari bawah grup Lab.
// Harus dimuat setelah semua modul (ikon menu dari app.js sudah terpasang) dan sebelum shell.js (grup sidebar).
const S = window.siarin;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* mode privat */ } },
};
const ON = store.get('timai.focus', true) !== false;

// Menu kerja: [kunci, label sidebar, [view, label tab hub]...]. View pertama = tombol sidebar (badge-nya ikut tampil).
const HUBS = [
  ['beranda', 'Beranda', [['today', 'Hari Ini'], ['dashboard', 'Ringkasan']]],
  ['konten', 'Konten', [['planner', 'Planner'], ['calendar', 'Kalender'], ['compose', 'Buat Post'], ['studio', 'Studio Visual']]],
  ['iklan', 'Iklan', [['adv', 'Iklan Meta & TikTok'], ['mp', 'Iklan Marketplace'], ['agents-adv', 'Agen & Kalkulator']]],
  ['cs', 'CS', [['inbox', 'Inbox'], ['closer', 'CS AI'], ['cs', 'Tiket & Template']]],
  ['laporan', 'Laporan', [['reports', 'Laporan'], ['analytics', 'Analitik'], ['history', 'Riwayat Post']]],
  ['pengaturan', 'Pengaturan', [['team', 'Brand & Anggota'], ['aikeys', 'AI & API Keys'], ['integrations', 'Integrasi'], ['accounts', 'Akun Sosmed']]],
];
const LAB = ['ai', 'brandlab', 'motion', 'launch', 'agents-digital', 'tiktok', 'kol', 'affiliate', 'founder'];
const hubOf = new Map(HUBS.flatMap(([key, , subs]) => subs.map(([v]) => [v, key])));
const GEAR = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>';

// Tab di dalam halaman: yang tampil = cocok prioritas dulu, lalu urutan asli, maks. 3 + "Lainnya".
const PRIORITY = {
  adv: /Ringkasan|Akun iklan|Data harian/, mp: /Ringkasan|Akun iklan|Data harian/, cs: /Tiket|Template|Follow/,
  closer: /Setting|Simulator|Data Order/, founder: /Conductor|Keuangan|Laporan Pagi/, ai: /Template Konten|Ide|Analisa/,
  reports: /Konten|ADV|CS/,
};
const MAX_TABS = 4;

const nav = $('#nav');
const navBtn = (v) => $(`#nav [data-view="${v}"]`);

function setupNav() {
  const more = $('#nav-more');
  $$('#nav > .nav-group').forEach((g) => g.remove());
  HUBS.forEach(([key, label, subs]) => {
    const b = navBtn(subs[0][0]);
    if (!b) return;
    b.dataset.hub = key;
    b.dataset.team = [...new Set(subs.flatMap(([v]) => (navBtn(v)?.dataset.team || '').split(' ')).filter(Boolean))].join(' ');
    $('.nav-label', b).textContent = label;
    b.title = label;
    if (key === 'pengaturan') $('.nav-ic', b).innerHTML = GEAR;
    nav.insertBefore(b, more);
  });
  const lab = document.createElement('span');
  lab.className = 'nav-group';
  lab.dataset.group = 'lab';
  lab.textContent = 'Lab · fitur lainnya';
  nav.insertBefore(lab, more);
  LAB.forEach((v) => { const b = navBtn(v); if (b) nav.insertBefore(b, more); });
  const classic = document.createElement('button');
  classic.type = 'button';
  classic.className = 'focus-switch';
  classic.textContent = 'Tampilkan semua menu (mode lama)';
  classic.addEventListener('click', () => { store.set('timai.focus', false); location.reload(); });
  nav.insertBefore(classic, more);
  // Menu yang sudah jadi tab hub: tetap ada (badge, Ctrl+K, show()) tapi tidak tampil di sidebar.
  $$('#nav > [data-view]').forEach((b) => {
    if (hubOf.has(b.dataset.view) && !b.dataset.hub) { b.classList.add('focus-hidden'); nav.append(b); }
  });
  // Lab terlipat saat pertama kali Mode Fokus dipakai (setelah itu ikut pilihan pengguna di shell.js).
  if (!store.get('timai.focus.labInit', false)) {
    store.set('timai.navGroups', [...new Set([...store.get('timai.navGroups', []), 'lab'])]);
    store.set('timai.focus.labInit', true);
  }
  // Klik menu kerja → buka tab hub terakhir yang dipakai (klik dari Ctrl+K/kode tetap ke view aslinya).
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hub]');
    if (!b || !e.isTrusted) return;
    const last = store.get('timai.focus.last', {})[b.dataset.hub];
    if (last && last !== b.dataset.view && document.getElementById(`view-${last}`)) {
      e.stopPropagation();
      S.show(last);
    }
  }, true);
}

// Tab hub di atas halaman.
// div, bukan nav: gaya "nav button" milik sidebar akan ikut kena.
const bar = document.createElement('div');
bar.className = 'hub-tabs';
bar.setAttribute('role', 'tablist');
bar.setAttribute('aria-label', 'Sub-menu');
function syncHub(view) {
  const key = hubOf.get(view);
  const hub = HUBS.find(([k]) => k === key);
  $$('#nav [data-hub]').forEach((b) => b.classList.toggle('active', b.dataset.hub === key));
  if (key) { const last = store.get('timai.focus.last', {}); if (last[key] !== view) store.set('timai.focus.last', { ...last, [key]: view }); }
  if (!hub || hub[2].length < 2) { bar.hidden = true; return; }
  bar.hidden = false;
  const html = hub[2].filter(([v]) => document.getElementById(`view-${v}`)).map(([v, l]) => {
    const badge = navBtn(v)?.querySelector('.nav-badge:not([hidden])')?.textContent;
    return `<button type="button" data-hub-view="${v}" class="${v === view ? 'active' : ''}">${l}${badge ? `<span class="hub-badge">${badge}</span>` : ''}</button>`;
  }).join('');
  if (bar.innerHTML !== html) bar.innerHTML = html;
}
bar.addEventListener('click', (e) => { const v = e.target.closest('[data-hub-view]')?.dataset.hubView; if (v) S.show(v); });

// Batasi baris tab di dalam halaman: sisanya masuk menu "Lainnya" di dalam baris yang sama,
// jadi event handler bawaan (yang dipasang di baris tab / halaman) tetap menerima klik.
function limitTabs(view) {
  const root = document.getElementById(`view-${view}`);
  if (!root) return;
  for (const row of $$('.tabs', root)) {
    const direct = $$(':scope > button', row);
    const menu = $(':scope > .tab-more .tab-menu', row);
    const all = [...direct, ...(menu ? $$(':scope > button', menu) : [])];
    if (all.length > MAX_TABS && direct.length > MAX_TABS - 1) {
      const pr = PRIORITY[view];
      const keep = [...all.filter((b) => pr?.test(b.textContent)), ...all].filter((b, i, a) => a.indexOf(b) === i).slice(0, MAX_TABS - 1);
      let more = $(':scope > .tab-more', row);
      if (!more) {
        more = document.createElement('span');
        more.className = 'tab-more';
        more.innerHTML = '<span class="tab-more-btn" role="button" tabindex="0" aria-haspopup="true"></span><span class="tab-menu" hidden></span>';
      }
      row.append(more);
      keep.forEach((b) => row.insertBefore(b, more));
      all.filter((b) => !keep.includes(b)).forEach((b) => $('.tab-menu', more).append(b));
    }
    const more = $(':scope > .tab-more', row);
    if (more) {
      const act = $('.tab-menu > button.active', more);
      const label = act ? `${act.textContent.trim()} ▾` : `Lainnya (${$$('.tab-menu > button', more).length}) ▾`;
      const btn = $('.tab-more-btn', more);
      if (btn.textContent !== label) btn.textContent = label;
      btn.classList.toggle('active', !!act);
    }
  }
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('.tab-more-btn');
  $$('.tab-menu:not([hidden])').forEach((m) => { if (!t || m !== t.nextElementSibling) m.hidden = true; });
  // Klik apa pun selain tombol "Lainnya" menutup menu (tombol tab bisa sudah diganti modul sebelum event sampai sini).
  if (t) t.nextElementSibling.hidden = !t.nextElementSibling.hidden;
  else setTimeout(() => $$('.tab-menu').forEach((m) => { m.hidden = true; }));
}, true); // capture: beberapa modul memanggil stopPropagation di handler tab-nya
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $$('.tab-menu').forEach((m) => { m.hidden = true; });
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.tab-more-btn')) { e.preventDefault(); e.target.click(); }
});

if (ON) {
  document.documentElement.classList.add('focus-mode');
  setupNav();
  $('main').prepend(bar);
  bar.hidden = true;
  let queued = false;
  const sync = () => {
    queued = false;
    const view = $('.view.active')?.id.replace('view-', '');
    if (!view) return;
    syncHub(view);
    limitTabs(view);
    obs.takeRecords();
  };
  // setTimeout, bukan requestAnimationFrame: rAF tertahan saat tab tidak terlihat.
  const obs = new MutationObserver(() => { if (!queued) { queued = true; setTimeout(sync, 0); } });
  obs.observe($('main'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  obs.observe(nav, { subtree: true, attributes: true, attributeFilter: ['hidden'], characterData: true, childList: true });
  sync();
} else {
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'focus-switch';
  back.textContent = '← Kembali ke Mode Fokus (6 menu)';
  back.addEventListener('click', () => { store.set('timai.focus', true); location.reload(); });
  nav.insertBefore(back, $('#nav-more'));
}
