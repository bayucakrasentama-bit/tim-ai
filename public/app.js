const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  config: { storage: 'local', auth: false }, platforms: {}, accounts: [], selected: new Set(), file: null,
  calMonth: startOfMonth(new Date()), me: null, brands: [], brandId: null, contentId: null,
};
// Modul lain (suite.js) mendaftarkan fungsi render per halaman di sini.
const viewHooks = {};

const STATUS_LABEL = {
  done: 'Sukses', failed: 'Gagal', partial: 'Sebagian gagal', scheduled: 'Terjadwal',
  publishing: 'Sedang dikirim', pending: 'Menunggu', success: 'Sukses',
};
const TYPE_LABEL = { text: 'Teks', image: 'Gambar', video: 'Video' };

async function api(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (state.brandId) headers.set('X-Brand-Id', String(state.brandId));
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    location.href = '/login.html';
    throw new Error('Belum login');
  }
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function avatar(account) {
  const p = state.platforms[account.platform];
  return `<span class="avatar" style="background:${p?.color || '#888'}">${esc(account.name.trim()[0]?.toUpperCase() || '?')}</span>`;
}
function platformBadge(platformId) {
  const p = state.platforms[platformId];
  return `<span class="badge" style="background:${p?.color || '#888'}">${esc(p?.label || platformId)}</span>`;
}
const statusPill = (s) => `<span class="status st-${s}">${STATUS_LABEL[s] || s}</span>`;

// ---------- Navigasi ----------
// Ikon menu (garis sederhana, 24x24).
const ICONS = {
  today: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  planner: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  studio: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
  motion: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 10l4-2v8l-4-2"/>',
  launch: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2m6.5-12.5a6 6 0 0 1 4 4L13 15l-4-4z"/><circle cx="15" cy="9" r="1.5"/>',
  ai: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  compose: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  analytics: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  tiktok: '<path d="M14 3v11a4 4 0 1 1-4-4"/><path d="M14 3a5 5 0 0 0 5 5"/>',
  accounts: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  inbox: '<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
  cs: '<path d="M4 7h16v10H4z"/><path d="M4 7l8 6 8-6"/>',
  adv: '<path d="M3 10v4h3l6 4V6L6 10z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
mp: '<path d="M4 8h16l-1.5 12h-13z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
kol: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="M18 3l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L15 5.3l2-.3z"/>',
affiliate: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
aikeys: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
integrations: '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0z"/><path d="M12 16v5"/>',
brandlab: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/><path d="M12 21c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4"/>',
'agents-digital': '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 8h6M9 11h4"/>',
'agents-adv': '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6"/>',
closer: '<path d="M4 4h16v12H8l-4 4z"/><path d="M8.5 10l2 2 4-4"/>',
founder: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6M9 11h.01M15 11h.01"/>',
freetools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
team: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14a5 5 0 0 1 5 5"/>',
};
document.querySelectorAll('#nav [data-view]').forEach((b) => {
b.title = b.textContent.trim();
  b.innerHTML = `<svg class="nav-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[b.dataset.view] || ''}</svg><span class="nav-label">${b.innerHTML}</span><span class="nav-badge" hidden></span>`;
});
function setNavBadge(view, count) {
  const el = document.querySelector(`#nav [data-view="${view}"] .nav-badge`);
  if (!el) return;
  el.hidden = !count;
  el.textContent = count > 99 ? '99+' : String(count || '');
}

// Tema terang/gelap (disimpan di browser) & sidebar ciut di desktop.
function currentTheme() {
const t = document.documentElement.dataset.theme;
return t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
$('#theme-toggle').addEventListener('click', () => {
const next = currentTheme() === 'dark' ? 'light' : 'dark';
document.documentElement.dataset.theme = next;
try { localStorage.setItem('timai.theme', next); } catch { /* mode privat */ }
toast(next === 'dark' ? 'Mode gelap' : 'Mode terang');
});
const syncCollapse = () => {
const on = document.documentElement.classList.contains('sb-collapsed');
$('#sb-collapse').textContent = on ? '»' : '«';
$('#sb-collapse').title = on ? 'Lebarkan sidebar' : 'Ciutkan sidebar';
};
$('#sb-collapse').addEventListener('click', () => {
const on = document.documentElement.classList.toggle('sb-collapsed');
try { localStorage.setItem('timai.sb', on ? '1' : '0'); } catch { /* mode privat */ }
syncCollapse();
});
syncCollapse();

// Sidebar di HP: buka/tutup.
const closeSidebar = () => document.body.classList.remove('sb-open');
$('#sb-toggle').addEventListener('click', () => document.body.classList.toggle('sb-open'));
$('#sb-backdrop').addEventListener('click', closeSidebar);

function show(view) {
  closeSidebar();
  const navBtn = document.querySelector(`#nav [data-view="${view}"]`);
  $('#mb-title').textContent = navBtn?.querySelector('.nav-label')?.textContent || '';
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  try { localStorage.setItem('siarin.view', view); } catch { /* mode privat */ }
  if (view === 'calendar') renderCalendar();
  if (view === 'history') renderHistory();
  if (view === 'accounts') renderAccounts();
  if (view === 'compose') renderPicker();
  viewHooks[view]?.();
}
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) show(b.dataset.view); });

// ---------- Buat Post ----------
const mediaType = () => (state.file ? (state.file.type.startsWith('video/') ? 'video' : 'image') : state.asset ? state.asset.kind : 'text');

function renderPicker() {
  const box = $('#account-picker');
  if (!state.accounts.length) {
    box.innerHTML = `<div class="empty">Belum ada akun. <button type="button" class="link" data-goto="accounts">Tambah akun dulu</button></div>`;
    renderComposeExtras();
    return;
  }
  const type = mediaType();
  box.innerHTML = state.accounts.map((a) => {
    const ok = state.platforms[a.platform]?.supports.includes(type);
    if (!ok) state.selected.delete(a.id);
    const checked = state.selected.has(a.id);
    return `<label class="acc-card ${checked ? 'checked' : ''} ${ok ? '' : 'disabled'}" title="${ok ? '' : `${esc(state.platforms[a.platform]?.label)} tidak mendukung konten ${TYPE_LABEL[type]}`}">
      ${avatar(a)}
      <span><div class="acc-name">${esc(a.name)}</div>${platformBadge(a.platform)}</span>
      <input type="checkbox" data-id="${a.id}" ${checked ? 'checked' : ''} ${ok ? '' : 'disabled'}>
    </label>`;
  }).join('');
  renderComposeExtras();
}

function renderComposeExtras() {
  const selectedAccounts = state.accounts.filter((a) => state.selected.has(a.id));
  const platforms = [...new Set(selectedAccounts.map((a) => a.platform))];
  $('#title-wrap').hidden = !platforms.includes('youtube');

  const wrap = $('#per-platform-fields');
  const prev = Object.fromEntries([...wrap.querySelectorAll('textarea')].map((t) => [t.dataset.platform, t.value]));
  wrap.innerHTML = platforms.length
    ? platforms.map((p) => `<div class="label">${platformBadge(p)}</div>
        <textarea rows="3" data-platform="${p}" placeholder="Kosongkan = pakai caption utama">${esc(prev[p] || '')}</textarea>`).join('')
    : '<p class="hint">Pilih akun dulu, nanti muncul kolom caption untuk tiap platform.</p>';

  document.querySelectorAll('#type-pills span').forEach((s) => s.classList.toggle('active', s.dataset.type === mediaType()));
  const n = selectedAccounts.length;
  const schedule = document.querySelector('input[name=mode]:checked').value === 'schedule';
  $('#submit-btn').textContent = schedule ? `Jadwalkan ke ${n} akun` : `Posting Sekarang ke ${n} akun`;
  $('#submit-btn').disabled = n === 0;
  $('#select-all').textContent = n && n === state.accounts.filter((a) => state.platforms[a.platform]?.supports.includes(mediaType())).length ? 'Batal pilih semua' : 'Pilih semua';
}

$('#account-picker').addEventListener('change', (e) => {
  const id = Number(e.target.dataset.id);
  if (!id) return;
  e.target.checked ? state.selected.add(id) : state.selected.delete(id);
  e.target.closest('.acc-card').classList.toggle('checked', e.target.checked);
  renderComposeExtras();
});
document.addEventListener('click', (e) => {
  if (e.target.dataset.goto) show(e.target.dataset.goto);
});
$('#select-all').addEventListener('click', () => {
  const eligible = state.accounts.filter((a) => state.platforms[a.platform]?.supports.includes(mediaType()));
  const all = eligible.every((a) => state.selected.has(a.id));
  eligible.forEach((a) => (all ? state.selected.delete(a.id) : state.selected.add(a.id)));
  renderPicker();
});

$('#caption').addEventListener('input', () => ($('#caption-count').textContent = $('#caption').value.length));

// Media dari lampiran kartu planner (tidak di-upload ulang).
function setAsset(asset) {
  state.file = null;
  $('#media').value = '';
  state.asset = asset || null;
  const prev = $('#drop-preview');
  if (state.asset) {
    prev.innerHTML = (state.asset.kind === 'video' ? `<video src="${esc(state.asset.url)}" controls></video>` : `<img src="${esc(state.asset.url)}" alt="">`) +
      `<div class="hint">Lampiran kartu: ${esc(state.asset.name)}</div>`;
  }
  prev.hidden = !state.asset;
  $('#drop-empty').hidden = !!state.asset;
  $('#media-clear').hidden = !state.asset;
  renderPicker();
}

function setFile(file) {
  state.file = file || null;
  if (state.file) state.asset = null;
  else if (state.asset) return setAsset(null);
  const prev = $('#drop-preview');
  if (state.file) {
    const url = URL.createObjectURL(state.file);
    prev.innerHTML = (mediaType() === 'video' ? `<video src="${url}" controls></video>` : `<img src="${url}" alt="">`) +
      `<div class="hint">${esc(state.file.name)} · ${(state.file.size / 1024 / 1024).toFixed(1)} MB</div>`;
  } else {
    prev.innerHTML = '';
    $('#media').value = '';
  }
  prev.hidden = !state.file;
  $('#drop-empty').hidden = !!state.file;
  $('#media-clear').hidden = !state.file;
  renderPicker();
}
$('#media').addEventListener('change', (e) => setFile(e.target.files[0]));
$('#media-clear').addEventListener('click', () => setFile(null));
const dz = $('#dropzone');
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', (e) => {
  e.preventDefault();
  dz.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f && (f.type.startsWith('image/') || f.type.startsWith('video/'))) setFile(f);
});

document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => {
  const schedule = document.querySelector('input[name=mode]:checked').value === 'schedule';
  $('#scheduled-at').disabled = !schedule;
  if (schedule && !$('#scheduled-at').value) {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    $('#scheduled-at').value = toLocalInput(d);
  }
  renderComposeExtras();
}));

function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

$('#compose-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#compose-error');
  err.hidden = true;
  const schedule = document.querySelector('input[name=mode]:checked').value === 'schedule';
  const captions = {};
  document.querySelectorAll('#per-platform-fields textarea').forEach((t) => {
    if (t.value.trim()) captions[t.dataset.platform] = t.value;
  });
  const fd = new FormData();
  fd.set('caption', $('#caption').value);
  fd.set('title', $('#title').value);
  fd.set('captions', JSON.stringify(captions));
  fd.set('accountIds', JSON.stringify([...state.selected]));
  fd.set('mode', schedule ? 'schedule' : 'now');
  if (state.contentId) fd.set('contentId', String(state.contentId));
  if (state.asset && !state.file) fd.set('assetId', String(state.asset.id));
  if (schedule) {
    if (!$('#scheduled-at').value) { err.textContent = 'Pilih tanggal & jam dulu'; err.hidden = false; return; }
    fd.set('scheduledAt', new Date($('#scheduled-at').value).toISOString());
  }
  $('#submit-btn').disabled = true;
  try {
    if (state.file && state.config.storage === 'blob') {
      // Online: file langsung dikirim dari browser ke Vercel Blob, server cuma terima URL-nya.
      openModal(`<div class="spinner"></div><h3>Mengunggah media... <span id="up-pct">0%</span></h3>`);
      const { upload } = await import('/vendor/blob-client.js');
      const blob = await upload(state.file.name, state.file, {
        access: 'public',
        handleUploadUrl: '/api/blob-upload',
        multipart: state.file.size > 20 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => {
          const el = $('#up-pct');
          if (el) el.textContent = `${Math.round(percentage)}%`;
        },
      });
      fd.set('mediaUrl', blob.url);
    } else if (state.file) {
      fd.set('media', state.file);
    }
    if (!schedule) openModal(`<div class="spinner"></div><h3>Mengirim ke ${state.selected.size} akun...</h3><p class="hint center">Jangan tutup halaman ini dulu ya.</p>`);
    const post = await api('/api/posts', { method: 'POST', body: fd });
    resetCompose();
    if (schedule) {
      openModal(`<div class="big-icon st-scheduled">🗓</div><h3>Terjadwal!</h3>
        <p class="hint center">Akan diposting ${esc(fmtDate(post.scheduled_at))} ke ${post.targets.length} akun.${state.config.storage === 'local' ? '<br>Biarkan app ini tetap jalan supaya jadwalnya terkirim.' : ''}</p>
        <div class="modal-actions"><button class="ghost" data-close>Buat post lagi</button><button class="primary" data-close data-goto="calendar">Lihat jadwal</button></div>`);
    } else {
      showResult(await waitForPost(post.id));
    }
  } catch (ex) {
    closeModal();
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    renderComposeExtras();
  }
});

function resetCompose() {
  state.contentId = null;
  $('#compose-from').innerHTML = '';
  $('#caption').value = '';
  $('#title').value = '';
  $('#caption-count').textContent = '0';
  $('#per-platform-fields').innerHTML = '';
  $('#per-platform').open = false;
  state.selected.clear();
  setFile(null);
}

async function waitForPost(id) {
  for (;;) {
    const post = await api(`/api/posts/${id}`);
    if (post.status !== 'publishing') return post;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function resultRows(post) {
  return post.targets.map((t) => `<div class="result-row">
      ${avatar({ name: t.account_name, platform: t.platform })}
      <div class="grow"><div class="acc-name">${esc(t.account_name)}</div>${platformBadge(t.platform)}
        ${t.error ? `<div class="err">${esc(t.error)}</div>` : ''}
        ${t.remote_url ? `<div><a href="${esc(t.remote_url)}" target="_blank" rel="noopener">Lihat postingan ↗</a></div>` : ''}
      </div>
      ${statusPill(t.status)}
    </div>`).join('');
}

function showResult(post) {
  const ok = post.status === 'done';
  const icon = ok ? '<div class="big-icon st-done">✓</div>' : post.status === 'partial' ? '<div class="big-icon st-partial">!</div>' : '<div class="big-icon st-failed">✕</div>';
  const title = ok ? 'Sukses!' : post.status === 'partial' ? 'Sebagian berhasil' : 'Gagal diposting';
  const okCount = post.targets.filter((t) => t.status === 'success').length;
  openModal(`${icon}<h3>${title}</h3><p class="hint center">${okCount} dari ${post.targets.length} akun berhasil.</p>
    ${resultRows(post)}
    <div class="modal-actions">
      ${ok ? '' : `<button class="ghost" data-retry="${post.id}">Coba lagi yang gagal</button>`}
      <button class="ghost" data-close>Buat post lagi</button>
      <button class="primary" data-close data-goto="history">Lihat riwayat</button>
    </div>`);
}

// ---------- Modal ----------
function openModal(html) {
  $('#modal-box').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', async (e) => {
  if (e.target.id === 'modal' || e.target.dataset.close !== undefined) closeModal();
  if (e.target.dataset.retry) {
    openModal('<div class="spinner"></div><h3>Mencoba lagi...</h3>');
    try {
      await api(`/api/posts/${e.target.dataset.retry}/retry`, { method: 'POST' });
      showResult(await waitForPost(e.target.dataset.retry));
    } catch (ex) { closeModal(); toast(ex.message); }
    refreshViews();
  }
  if (e.target.dataset.delete) {
    if (!confirm('Hapus post ini? Postingan yang sudah terkirim di sosmed tidak ikut terhapus.')) return;
    try {
      await api(`/api/posts/${e.target.dataset.delete}`, { method: 'DELETE' });
      closeModal();
      toast('Post dihapus');
      refreshViews();
    } catch (ex) { toast(ex.message); }
  }
});

async function showDetail(id) {
  const p = await api(`/api/posts/${id}`);
  const media = p.media_url ? (p.media_type === 'video' ? `<video src="${p.media_url}" controls style="max-width:100%;border-radius:8px"></video>` : `<img src="${p.media_url}" style="max-width:100%;border-radius:8px" alt="">`) : '';
  const extra = Object.entries(p.captions).map(([k, v]) => `<div class="label">${platformBadge(k)}</div><div class="detail-caption">${esc(v)}</div>`).join('');
  openModal(`<div class="row-between"><strong>${TYPE_LABEL[p.media_type]}</strong>${statusPill(p.status)}</div>
    <p class="hint">${p.scheduled_at ? `Jadwal: ${esc(fmtDate(p.scheduled_at))}` : `Dibuat: ${esc(fmtDate(p.created_at))}`}</p>
    ${media}
    ${p.title ? `<div class="label">Judul YouTube</div><div class="detail-caption">${esc(p.title)}</div>` : ''}
    <div class="label">Caption</div><div class="detail-caption">${esc(p.caption) || '<span class="hint">(kosong)</span>'}</div>
    ${extra}
    <div class="label">Akun tujuan</div>${resultRows(p)}
    <div class="modal-actions">
      ${['failed', 'partial'].includes(p.status) ? `<button class="ghost" data-retry="${p.id}">Coba lagi yang gagal</button>` : ''}
      ${p.status !== 'publishing' ? `<button class="danger" data-delete="${p.id}">${p.status === 'scheduled' ? 'Batalkan jadwal' : 'Hapus'}</button>` : ''}
      <button class="primary" data-close>Tutup</button>
    </div>`);
}

// ---------- List post ----------
function postItem(p) {
  const when = p.scheduled_at || p.created_at;
  const thumb = p.media_url
    ? (p.media_type === 'video' ? `<video class="thumb" src="${p.media_url}" muted></video>` : `<img class="thumb" src="${p.media_url}" alt="">`)
    : '<div class="thumb">Teks</div>';
  return `<div class="post-item" data-post="${p.id}">
    ${thumb}
    <div class="post-body">
      <div class="post-caption">${esc(p.caption || '(tanpa caption)')}</div>
      <div class="post-meta">${statusPill(p.status)}<span>${esc(fmtDate(when))}</span><span>${p.targets.length} akun</span></div>
      <div class="dots">${p.targets.map((t) => `<span class="dot st-${t.status}" title="${esc(t.error || STATUS_LABEL[t.status])}">${esc(t.account_name)}</span>`).join('')}</div>
    </div>
  </div>`;
}
document.addEventListener('click', (e) => {
  const item = e.target.closest('[data-post]');
  if (item) showDetail(item.dataset.post);
});

async function renderHistory() {
  const status = $('#history-filter').value;
  const posts = await api(`/api/posts${status ? `?status=${status}` : ''}`);
  $('#history').innerHTML = posts.length ? posts.map(postItem).join('') : '<div class="empty">Belum ada post.</div>';
}
$('#history-filter').addEventListener('change', renderHistory);

// ---------- Kalender ----------
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
async function renderCalendar() {
  const m = state.calMonth;
  $('#cal-title').textContent = m.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const start = new Date(m);
  start.setDate(1 - ((m.getDay() + 6) % 7)); // mulai Senin
  const end = new Date(start);
  end.setDate(start.getDate() + 42);
  const [posts, plans] = await Promise.all([
    api(`/api/posts?from=${start.toISOString()}&to=${end.toISOString()}`),
    api(`/api/content?from=${start.toISOString()}&to=${end.toISOString()}`),
  ]);
  const byDay = {};
  for (const p of posts) {
    const d = new Date(p.scheduled_at || p.created_at);
    (byDay[d.toDateString()] ||= []).push({ p, d });
  }
  for (const c of plans.filter((x) => !x.post_id)) {
    const d = new Date(c.planned_at);
    (byDay[d.toDateString()] ||= []).push({ c, d });
  }
  const todayStr = new Date().toDateString();
  let html = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => `<div class="cal-head">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const items = (byDay[day.toDateString()] || []).sort((a, b) => a.d - b.d);
    html += `<div class="cal-day ${day.getMonth() !== m.getMonth() ? 'other' : ''} ${day.toDateString() === todayStr ? 'today' : ''}" data-day="${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}">
      <span class="num">${day.getDate()}</span>
      ${items.map(({ p, c, d }) => (c
    ? `<button class="chip plan" data-content="${c.id}" title="${esc(c.title)}">${esc(c.title)}</button>`
    : `<button class="chip st-${p.status}" data-post="${p.id}" title="${esc(p.caption)}">${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ${esc(p.caption || TYPE_LABEL[p.media_type])}</button>`)).join('')}
    </div>`;
  }
  $('#calendar').innerHTML = html;
window.timOps?.decorateCalendar?.(document.getElementById('calendar'));

  const upcoming = (await api('/api/posts?status=scheduled')).reverse();
  $('#upcoming').innerHTML = upcoming.length ? upcoming.map(postItem).join('') : '<div class="empty">Tidak ada post terjadwal.</div>';
}
$('#cal-prev').addEventListener('click', () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1); renderCalendar(); });
$('#cal-next').addEventListener('click', () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1); renderCalendar(); });
$('#cal-today').addEventListener('click', () => { state.calMonth = startOfMonth(new Date()); renderCalendar(); });

// ---------- Akun ----------
async function loadAccounts() {
  state.accounts = await api('/api/accounts');
}
function renderAccounts() {
  $('#account-list').innerHTML = state.accounts.length
    ? state.accounts.map((a) => `<div class="acc-row">${avatar(a)}
        <div class="grow"><div class="acc-name">${esc(a.name)}</div>${platformBadge(a.platform)}
          <div class="hint">${Object.entries(a.details).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ')}</div>
          <div class="acc-check" id="acc-check-${a.id}"></div></div>
        <button class="ghost" data-check-account="${a.id}">Cek token</button>
        ${['owner', 'admin'].includes(state.me?.user.role) && state.brands.length > 1 ? `<select class="ghost" data-move-account="${a.id}" title="Pindah ke brand lain">
          <option value="">Pindah brand…</option>${state.brands.filter((b) => b.id !== state.brandId).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>` : ''}
        <button class="danger" data-del-account="${a.id}">Hapus</button></div>`).join('')
    : '<div class="empty">Belum ada akun. Mulai dengan akun Simulasi buat nyoba alurnya.</div>';
}
$('#account-list').addEventListener('click', async (e) => {
  const checkId = e.target.dataset.checkAccount;
  if (checkId) {
    const box = $(`#acc-check-${checkId}`);
    box.innerHTML = '<span class="hint">Mengecek ke server platform...</span>';
    try {
      box.innerHTML = checkHtml(await api(`/api/accounts/${checkId}/check`, { method: 'POST' }));
    } catch (ex) { box.innerHTML = `<span class="error">${esc(ex.message)}</span>`; }
    return;
  }
  const id = e.target.dataset.delAccount;
  if (!id || !confirm('Hapus akun ini dari TIM-AI?')) return;
  await api(`/api/accounts/${id}`, { method: 'DELETE' });
  state.selected.delete(Number(id));
  await loadAccounts();
  renderAccounts();
  toast('Akun dihapus');
});

$('#account-list').addEventListener('change', async (e) => {
  const id = e.target.dataset.moveAccount;
  const to = Number(e.target.value);
  if (!id || !to) return;
  const name = state.brands.find((b) => b.id === to)?.name;
  if (!confirm(`Pindahkan akun ini ke brand ${name}?`)) { e.target.value = ''; return; }
  try {
    await api(`/api/accounts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand_id: to }) });
    state.selected.delete(Number(id));
    await loadAccounts();
    renderAccounts();
    toast(`Akun dipindah ke ${name}`);
  } catch (ex) { e.target.value = ''; toast(ex.message); }
});

const currentPlatform = () => state.platforms[$('#acc-platform').value];
const redirectUri = (id) => `${location.origin}/api/oauth/${id}/callback`;

function checkHtml(r) {
  const list = (items) => (items.length ? `<ul>${items.join('')}</ul>` : '');
  return `<div class="check ${r.ok ? 'ok' : 'bad'}">
    <div class="head">${r.ok ? '✓ Valid' : '✕ Belum valid'}${r.account ? ` · ${esc(r.account)}` : ''}</div>
    ${list(r.problems.map((p) => `<li><b>${esc(p.message)}</b>${p.fix ? `<br><span class="fix">Cara benerin: ${esc(p.fix)}</span>` : ''}</li>`))}
    ${list(r.details.map((d) => `<li>${esc(d)}</li>`))}
  </div>`;
}

function renderGuide() {
  const p = currentPlatform();
  const g = p.guide || { intro: p.note || '', steps: [], fieldMap: [] };
  const fill = (html) => html.replaceAll('{{REDIRECT_URI}}', esc(redirectUri(p.id)));
  $('#guide').innerHTML = `
    <p class="guide-intro">${g.intro}</p>
    ${g.needs?.length ? `<div class="guide-box"><b>Yang perlu disiapkan</b><ul>${g.needs.map((n) => `<li>${n}</li>`).join('')}</ul></div>` : ''}
    ${g.steps.length ? `<ol class="steps">${g.steps.map((s) => `<li><b class="step-title">${s.title}</b>${fill(s.html)}</li>`).join('')}</ol>` : ''}
    ${g.fieldMap.length ? `<div class="label">Kolom di form diisi pakai apa?</div>
      <table class="field-map">${g.fieldMap.map(([f, v]) => `<tr><td>${f}</td><td>${v}</td></tr>`).join('')}</table>` : ''}
    <div class="guide-box"><b>Berapa lama token-nya berlaku?</b><br>${g.tokenLife || '-'}</div>`;
}

function renderHelper() {
  const p = currentPlatform();
  const helper = p.guide?.helper;
  const box = $('#helper');
  if (helper === 'meta') {
    box.innerHTML = `<div class="helper">
      <div class="label">Ambil token otomatis</div>
      <input id="meta-app-id" placeholder="App ID" autocomplete="off">
      <input id="meta-app-secret" type="password" placeholder="App Secret (tidak disimpan)" autocomplete="new-password" data-lpignore="true">
      <input id="meta-user-token" type="password" placeholder="Token dari Graph API Explorer" autocomplete="new-password" data-lpignore="true">
      <button type="button" class="ghost" id="meta-fetch">Ambil Page</button>
      <div id="meta-pages"></div>
    </div>`;
  } else if (helper === 'oauth') {
    const label = p.id === 'youtube' ? 'Google' : 'TikTok';
    const blocked = p.id === 'tiktok' && location.protocol !== 'https:';
    box.innerHTML = `<div class="helper">
      <div class="label">Hubungkan otomatis</div>
      <p class="hint">Isi ${p.id === 'youtube' ? 'Client ID' : 'Client key'} & Client secret di bawah, lalu klik tombol ini. Redirect URI yang harus didaftarkan:<br><code class="copy">${esc(redirectUri(p.id))}</code></p>
      ${blocked ? '<p class="error">TikTok cuma menerima alamat https. Buka TIM-AI versi online buat nyambungin TikTok.</p>' : ''}
      <button type="button" class="ghost" id="oauth-start" ${blocked ? 'disabled' : ''}>Hubungkan dengan ${label}</button>
    </div>`;
  } else {
    box.innerHTML = '';
  }
}

function renderAccountFields() {
  const p = currentPlatform();
  $('#acc-fields').innerHTML = p.fields.map((f) => `<input name="${f.key}" type="${f.secret ? 'password' : 'text'}" placeholder="${esc(f.label)}${f.optional ? '' : ' *'}" autocomplete="${f.secret ? 'new-password' : 'off'}">`).join('');
  $('#check-result').innerHTML = '';
  $('#account-error').hidden = true;
  renderGuide();
  renderHelper();
}
$('#acc-platform').addEventListener('change', renderAccountFields);

const formCredentials = () => Object.fromEntries([...$('#acc-fields').querySelectorAll('input')].map((i) => [i.name, i.value.trim()]));
function setField(key, value) {
  const input = $('#acc-fields').querySelector(`input[name="${key}"]`);
  if (input && value != null) input.value = value;
}

async function runCheck() {
  const box = $('#check-result');
  box.innerHTML = '<p class="hint">Mengecek ke server platform...</p>';
  try {
    const r = await api('/api/accounts/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: currentPlatform().id, credentials: formCredentials() }),
    });
    // Refresh token yang diganti platform (TikTok) langsung dipakai di form.
    if (r.credentials) Object.entries(r.credentials).forEach(([k, v]) => setField(k, v));
    if (r.ok && r.account && !$('#acc-name').value.trim()) $('#acc-name').value = r.account;
    box.innerHTML = checkHtml(r);
  } catch (ex) {
    box.innerHTML = `<p class="error">${esc(ex.message)}</p>`;
  }
}
$('#check-btn').addEventListener('click', runCheck);

// Klik kode redirect URI = salin.
document.addEventListener('click', (e) => {
  if (!e.target.matches('code.copy')) return;
  navigator.clipboard?.writeText(e.target.textContent).then(() => toast('Disalin'));
});

$('#helper').addEventListener('click', async (e) => {
  const p = currentPlatform();
  if (e.target.id === 'meta-fetch') {
    const out = $('#meta-pages');
    out.innerHTML = '<p class="hint">Menukar token...</p>';
    try {
      const { pages } = await api('/api/meta/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: $('#meta-app-id').value, appSecret: $('#meta-app-secret').value, userToken: $('#meta-user-token').value }),
      });
      state.metaPages = pages;
      const usable = p.id === 'instagram' ? pages.filter((pg) => pg.instagram) : pages;
      out.innerHTML = usable.length
        ? usable.map((pg) => `<div class="page-option"><div class="grow"><b>${esc(pg.name)}</b>
            ${p.id === 'instagram' ? `<div class="hint">Instagram: @${esc(pg.instagram.username || pg.instagram.id)}</div>` : ''}
            ${pg.canPost ? '' : '<div class="hint">Kamu tidak punya izin bikin konten di Page ini</div>'}</div>
            <button type="button" class="ghost" data-use-page="${esc(pg.id)}">Pakai</button></div>`).join('')
        : `<p class="error">${p.id === 'instagram'
          ? 'Tidak ada Page yang tertaut ke akun Instagram profesional. Cek langkah "Yang perlu disiapkan", lalu pastikan izin pages_show_list & instagram_basic dicentang.'
          : 'Tidak ada Page. Pastikan izin pages_show_list dicentang dan Page-nya dipilih waktu Generate Access Token.'}</p>`;
    } catch (ex) {
      out.innerHTML = `<p class="error">${esc(ex.message)}</p>`;
    }
  }
  if (e.target.dataset.usePage) {
    const pg = state.metaPages.find((x) => x.id === e.target.dataset.usePage);
    if (p.id === 'instagram') setField('igUserId', pg.instagram.id);
    else setField('pageId', pg.id);
    setField('accessToken', pg.accessToken);
    $('#meta-app-secret').value = '';
    $('#meta-user-token').value = '';
    $('#meta-pages').innerHTML = `<p class="hint">Terisi dari Page "${esc(pg.name)}".</p>`;
    runCheck();
  }
  if (e.target.id === 'oauth-start') {
    const c = formCredentials();
    try {
      const { authUrl } = await api(`/api/oauth/${p.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: c.clientId || c.clientKey, clientSecret: c.clientSecret }),
      });
      location.href = authUrl;
    } catch (ex) {
      $('#account-error').textContent = ex.message;
      $('#account-error').hidden = false;
    }
  }
});

// Balik dari halaman login Google/TikTok: isi form dengan hasilnya, lalu langsung cek.
async function finishOAuth(stateId) {
  history.replaceState(null, '', '/');
  show('accounts');
  try {
    const r = await api(`/api/oauth/result/${encodeURIComponent(stateId)}`);
    $('#acc-platform').value = r.platform;
    renderAccountFields();
    if (r.error) {
      $('#account-error').textContent = r.error;
      $('#account-error').hidden = false;
      return;
    }
    Object.entries(r.credentials).forEach(([k, v]) => setField(k, v));
    toast('Akun tersambung, lagi dicek...');
    runCheck();
  } catch (ex) {
    toast(ex.message);
  }
}

$('#account-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#account-error');
  err.hidden = true;
  const name = $('#acc-name').value;
  try {
    await api('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: currentPlatform().id, name, credentials: formCredentials() }),
    });
    if ($('#acc-name').value === name) $('#acc-name').value = '';
    renderAccountFields();
    await loadAccounts();
    renderAccounts();
    toast('Akun tersimpan');
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

function refreshViews() {
  const active = document.querySelector('.view.active').id.replace('view-', '');
  if (active === 'calendar') renderCalendar();
  if (active === 'history') renderHistory();
}

// ---------- Brand ----------
function renderBrandSwitch() {
  const sel = $('#brand-switch');
  sel.innerHTML = state.brands.map((b) => `<option value="${b.id}" ${b.id === state.brandId ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  sel.hidden = !state.brands.length;
  const brand = state.brands.find((b) => b.id === state.brandId);
  document.documentElement.style.setProperty('--brand', brand?.color || 'var(--accent)');
}

async function loadMe() {
  state.me = await api('/api/me');
  state.brands = state.me.brands;
  let saved = null;
  try { saved = Number(localStorage.getItem('siarin.brand')); } catch { /* mode privat */ }
  state.brandId = state.brands.find((b) => b.id === state.brandId)?.id
    ?? state.brands.find((b) => b.id === saved)?.id ?? state.brands[0]?.id ?? null;
  renderBrandSwitch();
  $('#user-label').innerHTML = state.config.auth
    ? `<b>${esc(state.me.user.username)}</b><span>${esc(ROLE_LABEL[state.me.user.role] || state.me.user.role)}${state.me.user.team !== 'semua' ? ` · ${esc(TEAM_LABEL[state.me.user.team])}` : ''}</span>`
    : '<b>Mode lokal</b><span>tanpa login</span>';
  $('#ub-avatar').textContent = (state.config.auth ? state.me.user.username : 'T')[0].toUpperCase();
  applyTeamNav();
}
const TEAM_LABEL = { konten: 'Tim Konten', medsos: 'Tim Medsos', digital: 'Tim Digital', adv: 'Tim ADV', mp: 'Tim MP', kol: 'Tim KOL', affiliate: 'Tim Affiliate', cs: 'Tim CS', founder: 'Tim Founder', semua: 'Semua tim' };
const ROLE_LABEL = { owner: 'Pemilik', admin: 'Admin', lead: 'Lead / Supervisor', member: 'Anggota' };

async function switchBrand(id) {
  state.brandId = id;
  try { localStorage.setItem('siarin.brand', String(id)); } catch { /* mode privat */ }
  state.selected.clear();
  resetCompose();
  renderBrandSwitch();
  await loadAccounts();
  show(document.querySelector('.view.active').id.replace('view-', ''));
}
$('#brand-switch').addEventListener('change', (e) => switchBrand(Number(e.target.value)));

// Buat Post dari kartu planner: caption, judul & tanggal rencana langsung terisi.
function composeFrom(item) {
  resetCompose();
  state.contentId = item.id;
  const media = (item.assets || []).filter((a) => a.kind === 'image' || a.kind === 'video');
  $('#compose-from').innerHTML = `<div class="from-plan">Dari planner: <b>${esc(item.title)}</b>
    <button type="button" class="link" id="compose-unlink">lepas</button>
    ${media.length > 1 ? `<div class="asset-pick">Pilih media: ${media.map((a, i) => `<button type="button" class="asset-thumb ${i === 0 ? 'on' : ''}" data-pick-asset="${a.id}" title="${esc(a.name)}">${a.kind === 'video' ? '🎬' : `<img src="${esc(a.url)}" alt="">`}</button>`).join('')}</div>` : ''}</div>`;
  state.cardAssets = media;
  if (media[0]) setAsset(media[0]);
  $('#caption').value = item.caption || item.hook || '';
  $('#caption-count').textContent = $('#caption').value.length;
  $('#title').value = item.title.slice(0, 100);
  const platforms = new Set(item.platforms || []);
  for (const a of state.accounts) if (platforms.has(a.platform)) state.selected.add(a.id);
  if (item.planned_at && new Date(item.planned_at) > new Date()) {
    document.querySelector('input[name=mode][value=schedule]').checked = true;
    $('#scheduled-at').disabled = false;
    $('#scheduled-at').value = toLocalInput(new Date(item.planned_at));
  }
  show('compose');
}
document.addEventListener('click', (e) => {
  if (e.target.id === 'compose-unlink') {
    state.contentId = null;
    $('#compose-from').innerHTML = '';
    setAsset(null);
  }
  const pick = e.target.closest('[data-pick-asset]');
  if (pick) {
    document.querySelectorAll('[data-pick-asset]').forEach((b) => b.classList.toggle('on', b === pick));
    setAsset(state.cardAssets.find((a) => a.id === Number(pick.dataset.pickAsset)));
  }
});

// ---------- Menu per tim ----------
// Tim konten & tim medsos melihat menu utamanya dulu; sisanya di balik "Semua menu".
function applyTeamNav() {
  const team = state.me?.user.team || 'semua';
  const manage = ['owner', 'admin'].includes(state.me?.user.role);
  let hidden = 0;
  document.querySelectorAll('#nav [data-view]').forEach((b) => {
    const teams = b.dataset.team.split(' ').filter(Boolean);
    const main = team === 'semua' || teams.includes(team) || (b.dataset.view === 'team' && manage);
    b.classList.toggle('nav-extra', !main);
    if (!main) hidden++;
  });
  // Label kelompok ikut tersembunyi kalau semua menunya tersembunyi.
  document.querySelectorAll('#nav .nav-group').forEach((g) => {
    let el = g.nextElementSibling;
    let any = false;
    while (el && !el.classList.contains('nav-group') && el.id !== 'nav-more') {
      if (!el.classList.contains('nav-extra')) any = true;
      el = el.nextElementSibling;
    }
    g.classList.toggle('nav-extra', !any);
  });
  $('#nav-more').hidden = !hidden;
}
$('#nav-more').addEventListener('click', () => {
  const open = $('#nav').classList.toggle('show-all');
  $('#nav-more').textContent = open ? 'Menu tim saja ▴' : 'Semua menu ▾';
});
const TEAM_HOME = { konten: 'planner', medsos: 'calendar', digital: 'launch', adv: 'adv', mp: 'mp', kol: 'kol', affiliate: 'affiliate', cs: 'inbox', founder: 'founder', semua: 'today' };

// Dipakai suite.js (Dashboard, Planner, Analitik, AI, Tim).
window.siarin = {
  state, api, esc, toast, openModal, closeModal, show, fmtDate, platformBadge, statusPill, avatar,
  viewHooks, composeFrom, loadMe, switchBrand, renderBrandSwitch, toLocalInput, STATUS_LABEL, TEAM_LABEL, setNavBadge,
};

// ---------- Mulai ----------
(async () => {
  state.config = await api('/api/config');
  if (state.config.auth) {
    $('#logout-btn').hidden = false;
    $('#logout-btn').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      location.href = '/login.html';
    });
  }
  await loadMe();
  const platforms = await api('/api/platforms');
  state.platforms = Object.fromEntries(platforms.map((p) => [p.id, p]));
  $('#acc-platform').innerHTML = platforms.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
  renderAccountFields();
  await loadAccounts();
  renderPicker();
  const oauthState = new URLSearchParams(location.search).get('oauth');
  if (oauthState) finishOAuth(oauthState);
  else {
    let last = TEAM_HOME[state.me?.user.team] || 'dashboard';
    try { last = localStorage.getItem('siarin.view') || last; } catch { /* mode privat */ }
    if (new URLSearchParams(location.search).get('inbox_oauth')) last = 'inbox'; // balik dari menghubungkan toko
    show(document.getElementById(`view-${last}`) ? last : 'dashboard');
  }
  setInterval(refreshViews, 10000);
})();
