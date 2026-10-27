// Tim Medsos (Tahap 4): preview HP di Buat Post, kalender Bulan/Minggu/Hari + antrean Siap (drag & drop)
// + jam tayang terbaik, tabel Analitik bisa dicari/diurutkan/diekspor, timeline + retry di Riwayat,
// dan kartu kesehatan koneksi akun. Semua lewat endpoint yang sudah ada; markup app.js tidak diubah.
const S = window.siarin;
const { api, esc, state } = S;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const DAY = 86400_000;
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* mode privat */ } },
};
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DAYS_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------- Jam tayang terbaik (dari Analitik, 90 hari) ----------
let bestCache = null;
async function bestTimes() {
  if (bestCache && bestCache.brand === state.brandId) return bestCache.list;
  const s = await api(`/api/analytics/summary?from=${new Date(Date.now() - 90 * DAY).toISOString()}`).catch(() => null);
  const list = (s?.bestTimes || []).filter((t) => t.avg_views);
  bestCache = { brand: state.brandId, list };
  return list;
}
// Jam terbaik per hari dalam seminggu: { weekday: {hour, avg_views} }
const bestByWeekday = (list) => {
  const out = {};
  for (const t of list) if (!out[t.weekday] || t.avg_views > out[t.weekday].avg_views) out[t.weekday] = t;
  return out;
};
// Sel "prime time": 15% teratas dari semua kombinasi hari × jam.
const primeSet = (list) => {
  const sorted = [...list].sort((a, b) => b.avg_views - a.avg_views);
  return new Set(sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.15))).map((t) => `${t.weekday}-${t.hour}`));
};

// =====================================================================
// 1) BUAT POST — preview HP
// =====================================================================
const form = $('#compose-form');
const MODES = [
  { id: 'tiktok', label: 'TikTok', limit: 2200, ratio: '9 / 16' },
  { id: 'reels', label: 'IG Reels', limit: 2200, ratio: '9 / 16', platform: 'instagram' },
  { id: 'feed', label: 'IG Feed', limit: 2200, ratio: '4 / 5', platform: 'instagram' },
  { id: 'shorts', label: 'Shorts', limit: 5000, ratio: '9 / 16', platform: 'youtube' },
];
const pv = { mode: store.get('timai.pvMode', 'tiktok') };
if (form) {
  form.classList.add('compose-3');
  const panel = document.createElement('aside');
  panel.className = 'card pv-card';
  panel.innerHTML = `<div class="row-between"><div class="label">Preview</div><span class="hint" id="pv-acc"></span></div>
    <div class="seg pv-seg" role="tablist">${MODES.map((m) => `<button type="button" role="tab" data-pv="${m.id}">${m.label}</button>`).join('')}</div>
    <div class="phone"><div class="phone-notch"></div><div class="phone-screen" id="pv-screen"></div></div>
    <div id="pv-checks" class="pv-checks"></div>
    <div id="pv-best" class="pv-best"></div>`;
  form.append(panel);
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pv]');
    if (b) { pv.mode = b.dataset.pv; store.set('timai.pvMode', pv.mode); drawPreview(); }
    const slot = e.target.closest('[data-best-at]');
    if (slot) {
      const r = document.querySelector('input[name=mode][value=schedule]');
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
      $('#scheduled-at').disabled = false;
      $('#scheduled-at').value = slot.dataset.bestAt;
      $('#scheduled-at').dispatchEvent(new Event('input', { bubbles: true }));
      S.toast(`Jadwal diisi: ${slot.dataset.label}`);
    }
  });
  form.addEventListener('input', () => drawPreview());
  form.addEventListener('change', () => drawPreview());
  new MutationObserver(() => drawPreview()).observe($('#drop-preview'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(() => drawPreview()).observe($('#account-picker'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}
function captionFor(platform) {
  const own = platform && $(`#per-platform-fields textarea[data-platform="${platform}"]`)?.value.trim();
  return own || $('#caption')?.value || '';
}
function fmtCaption(text, max) {
  const t = esc(text.length > max ? `${text.slice(0, max)}…` : text);
  return t.replace(/(#[\p{L}\p{N}_]+)/gu, '<b class="pv-tag">$1</b>').replace(/(@[\w.]+)/g, '<b class="pv-tag">$1</b>').replace(/\n/g, '<br>');
}
function drawPreview() {
  const screen = $('#pv-screen');
  if (!screen) return;
  const mode = MODES.find((m) => m.id === pv.mode) || MODES[0];
  $$('[data-pv]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pv === mode.id)));
  const platform = mode.platform || mode.id;
  const accs = state.accounts.filter((a) => state.selected.has(a.id));
  const acc = accs.find((a) => a.platform === platform) || accs[0];
  const handle = (acc?.name || brandHandle()).replace(/^@/, '');
  $('#pv-acc').textContent = accs.length ? `${accs.length} akun dipilih` : 'pilih akun di samping';
  const cap = captionFor(platform);
  const mediaEl = $('#drop-preview img, #drop-preview video');
  const src = $('#drop-preview')?.hidden ? null : mediaEl?.getAttribute('src');
  const isVideo = mediaEl?.tagName === 'VIDEO';
  const media = src ? (isVideo ? `<video src="${esc(src)}" muted autoplay loop playsinline></video>` : `<img src="${esc(src)}" alt="">`) : '<div class="pv-empty">Belum ada media<br><span>Teks saja = background polos</span></div>';
  const avatarLetter = esc(handle[0]?.toUpperCase() || 'T');
  const title = $('#title')?.value || cap.split('\n')[0] || 'Judul video';
  if (mode.id === 'feed') {
    screen.className = 'phone-screen ig-feed';
    screen.innerHTML = `<div class="ig-top"><span class="pv-av">${avatarLetter}</span><b>${esc(handle)}</b><span class="pv-dots">•••</span></div>
      <div class="pv-media" style="aspect-ratio:${mode.ratio}">${media}</div>
      <div class="ig-actions"><span>♡</span><span>💬</span><span>↗</span><span class="ig-save">⌑</span></div>
      <div class="ig-cap"><b>${esc(handle)}</b> ${fmtCaption(cap, 220) || '<span class="pv-muted">Caption muncul di sini…</span>'}</div>`;
  } else {
    screen.className = `phone-screen vert ${mode.id}`;
    const side = mode.id === 'shorts' ? ['👍', '👎', '💬', '↗', '⟳'] : mode.id === 'reels' ? ['♡', '💬', '↗', '•••'] : ['♥', '💬', '🔖', '↗'];
    screen.innerHTML = `<div class="pv-media full">${media}</div>
      <div class="vert-top">${mode.id === 'tiktok' ? '<span>Mengikuti</span><b>Untuk Anda</b>' : mode.id === 'reels' ? '<b>Reels</b>' : '<b>Shorts</b>'}</div>
      <div class="vert-side"><span class="pv-av big">${avatarLetter}</span>${side.map((s) => `<span>${s}</span>`).join('')}</div>
      <div class="vert-cap">${mode.id === 'shorts' ? `<div class="pv-title">${esc(title.slice(0, 100))}</div>` : ''}<b>@${esc(handle)}</b>
        <div>${fmtCaption(cap, mode.id === 'tiktok' ? 150 : 120) || '<span class="pv-muted">Caption muncul di sini…</span>'}</div>
        ${mode.id === 'tiktok' ? '<div class="pv-sound">♫ suara asli · ' + esc(handle) + '</div>' : ''}</div>`;
  }
  // Cek cepat per platform
  const tags = (cap.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  const checks = [
    [cap.length <= mode.limit, `${cap.length.toLocaleString('id-ID')}/${mode.limit.toLocaleString('id-ID')} karakter`],
    [!(platform === 'instagram' && tags > 30), `${tags} hashtag${platform === 'instagram' ? ' (maks 30)' : ''}`],
    [!!src || platform === 'facebook', src ? (isVideo ? 'Video terlampir' : 'Gambar terlampir') : `${mode.label} butuh media`],
  ];
  if (platform === 'youtube') checks.push([title.length <= 100, `Judul ${title.length}/100`]);
  if (!cap.slice(0, 80).trim()) checks.push([false, 'Hook di baris pertama masih kosong']);
  $('#pv-checks').innerHTML = checks.map(([ok, t]) => `<span class="pv-chk ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '!'} ${esc(t)}</span>`).join('');
}
const brandHandle = () => (state.brands.find((b) => b.id === state.brandId)?.name || 'brandkamu').toLowerCase().replace(/[^a-z0-9]+/g, '');
async function drawBest() {
  const box = $('#pv-best');
  if (!box) return;
  const list = await bestTimes();
  if (!list.length) { box.innerHTML = '<span class="hint">Jam tayang terbaik muncul setelah ada data Analitik.</span>'; return; }
  // 3 slot berikutnya yang paling bagus dalam 7 hari ke depan.
  const top = [...list].sort((a, b) => b.avg_views - a.avg_views).slice(0, 6);
  const now = new Date();
  const slots = top.map((t) => {
    const d = new Date(now);
    d.setHours(t.hour, 0, 0, 0);
    let add = (t.weekday - d.getDay() + 7) % 7;
    if (add === 0 && d <= now) add = 7;
    d.setDate(d.getDate() + add);
    return { d, t };
  }).sort((a, b) => a.d - b.d).slice(0, 3);
  box.innerHTML = `<div class="label">⚡ Jam tayang terbaik (WIB)</div><div class="pv-slots">${slots.map(({ d, t }) => `<button type="button" class="pv-slot" data-best-at="${ymd(d)}T${pad(d.getHours())}:00" data-label="${DAYS_LONG[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} ${pad(t.hour)}:00">${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${pad(t.hour)}:00<span>${Math.round(t.avg_views).toLocaleString('id-ID')} views rata²</span></button>`).join('')}</div>`;
}

// =====================================================================
// 2) KALENDER — Bulan / Minggu / Hari + antrean Siap + prime time
// =====================================================================
const cal = { view: store.get('timai.calView', 'month'), cursor: new Date(), dragId: null, queue: [] };
const calSection = $('#view-calendar');
const calGrid = $('#calendar');
if (calSection && calGrid) {
  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.id = 'cal-viewseg';
  seg.innerHTML = [['month', 'Bulan'], ['week', 'Minggu'], ['day', 'Hari']].map(([k, l]) => `<button type="button" data-calv="${k}">${l}</button>`).join('');
  $('.cal-nav', calSection)?.prepend(seg);
  const layout = document.createElement('div');
  layout.className = 'cal-layout';
  calGrid.before(layout);
  const main = document.createElement('div');
  main.className = 'cal-main';
  layout.append(main);
  main.append(calGrid);
  const alt = document.createElement('div');
  alt.id = 'cal-alt';
  alt.hidden = true;
  main.append(alt);
  const queue = document.createElement('aside');
  queue.className = 'cal-queue card';
  queue.id = 'cal-queue';
  layout.append(queue);
  $('.hint', calSection).innerHTML = '<span class="chip-demo plan">Rencana</span> = kartu planner. Seret kartu dari <b>Antrean</b> ke tanggal / jam untuk menentukan rencana tayang. Sel bertanda <span class="prime-demo">⚡</span> = jam tayang terbaik.';

  seg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-calv]');
    if (!b) return;
    cal.view = b.dataset.calv;
    store.set('timai.calView', cal.view);
    if (cal.view === 'month') { state.calMonth = new Date(cal.cursor.getFullYear(), cal.cursor.getMonth(), 1); S.show('calendar'); } else drawCal();
  });
  // Tombol ‹ › Hari ini: di mode minggu/hari ditangani di sini (app.js hanya kenal bulan).
  for (const [id, dir] of [['cal-prev', -1], ['cal-next', 1], ['cal-today', 0]]) {
    $(`#${id}`)?.addEventListener('click', (e) => {
      if (cal.view === 'month') { if (dir === 0) cal.cursor = new Date(); return; }
      e.stopImmediatePropagation();
      cal.cursor = dir === 0 ? new Date() : new Date(cal.cursor.getTime() + dir * (cal.view === 'week' ? 7 : 1) * DAY);
      drawCal();
    }, true);
  }
  // app.js menggambar ulang grid bulan → hiasi dengan prime time + jadikan sel tujuan drop.
  new MutationObserver(() => {
    if (cal.view === 'month') decorateMonth();
    else if (cal.title) $('#cal-title').textContent = cal.title; // refresh berkala app.js menulis judul bulan
  }).observe(calGrid, { childList: true });
  calSection.addEventListener('dragstart', (e) => {
    const el = e.target.closest('[data-drag-content]');
    if (!el) return;
    cal.dragId = Number(el.dataset.dragContent);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(cal.dragId));
    el.classList.add('dragging');
    calSection.classList.add('is-dragging');
  });
  calSection.addEventListener('dragend', () => { cal.dragId = null; calSection.classList.remove('is-dragging'); $$('.dragging, .drop-over', calSection).forEach((x) => x.classList.remove('dragging', 'drop-over')); });
  calSection.addEventListener('dragover', (e) => {
    const t = e.target.closest('[data-day], [data-slot]');
    if (!t || cal.dragId == null) return;
    e.preventDefault();
    $$('.drop-over', calSection).forEach((x) => x !== t && x.classList.remove('drop-over'));
    t.classList.add('drop-over');
  });
  calSection.addEventListener('drop', async (e) => {
    const t = e.target.closest('[data-day], [data-slot]');
    if (!t || cal.dragId == null) return;
    e.preventDefault();
    const id = cal.dragId;
    cal.dragId = null;
    let when;
    if (t.dataset.slot) when = new Date(t.dataset.slot);
    else {
      const [y, m, d] = t.dataset.day.split('-').map(Number);
      const best = bestByWeekday(await bestTimes())[new Date(y, m - 1, d).getDay()];
      when = new Date(y, m - 1, d, best?.hour ?? 19, 0, 0);
    }
    try {
      await api(`/api/content/${id}`, json('PATCH', { planned_at: when.toISOString() }));
      S.toast(`Rencana tayang: ${DAYS_LONG[when.getDay()]} ${when.getDate()}/${when.getMonth() + 1} ${pad(when.getHours())}:00`);
      if (cal.view === 'month') S.show('calendar'); else drawCal();
      drawQueue();
    } catch (ex) { S.toast(ex.message); }
  });
  queue.addEventListener('click', async (e) => {
    const sch = e.target.closest('[data-q-schedule]');
    if (sch) {
      e.stopPropagation();
      const c = await api(`/api/content/${sch.dataset.qSchedule}`).catch(() => cal.queue.find((x) => x.id === Number(sch.dataset.qSchedule)));
      S.composeFrom(c);
    }
  });
}
async function drawQueue() {
  const q = $('#cal-queue');
  if (!q) return;
  const all = await api('/api/content').catch(() => []);
  // Antrean = kartu tanpa post: Siap dulu, lalu yang masih rencana (Ide/Draft/Review).
  cal.queue = all.filter((c) => !c.post_id && !c.post && ['siap', 'review', 'draft', 'ide'].includes(c.status));
  const order = { siap: 0, review: 1, draft: 2, ide: 3 };
  cal.queue.sort((a, b) => order[a.status] - order[b.status] || (a.planned_at ? 0 : 1) - (b.planned_at ? 0 : 1));
  const siap = cal.queue.filter((c) => c.status === 'siap');
  const rencana = cal.queue.filter((c) => c.status !== 'siap');
  const card = (c) => `<div class="q-card" draggable="true" data-drag-content="${c.id}" data-content="${c.id}" tabindex="0">
      <b>${esc(c.title || '(tanpa judul)')}</b>
      <span class="hint">${c.planned_at ? `🗓 ${new Date(c.planned_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${pad(new Date(c.planned_at).getHours())}:00` : 'belum ada tanggal'}${c.pillar ? ` · ${esc(c.pillar)}` : ''}</span>
      ${c.status === 'siap' ? `<button type="button" class="link small" data-q-schedule="${c.id}">Jadwalkan post →</button>` : ''}
    </div>`;
  S.setNavBadge?.('calendar', siap.length);
  q.innerHTML = `<div class="row-between"><div class="label">Antrean</div><span class="hint">seret ke kalender</span></div>
    <div class="q-group"><span class="pill ok">Siap</span><span class="count">${siap.length}</span></div>
    ${siap.map(card).join('') || '<p class="hint">Belum ada kartu Siap.</p>'}
    <div class="q-group"><span class="pill info">Rencana</span><span class="count">${rencana.length}</span></div>
    ${rencana.slice(0, 12).map(card).join('') || '<p class="hint">Kosong.</p>'}
    ${rencana.length > 12 ? `<button class="link small" data-goto="planner">+${rencana.length - 12} lainnya di Planner</button>` : ''}`;
}
async function decorateMonth() {
  $$('[data-content].chip.plan', calGrid).forEach((c) => { c.draggable = true; c.dataset.dragContent = c.dataset.content; });
  const best = bestByWeekday(await bestTimes());
  for (const cell of $$('[data-day]', calGrid)) {
    if (cell.querySelector('.prime-tag')) continue;
    const [y, m, d] = cell.dataset.day.split('-').map(Number);
    const b = best[new Date(y, m - 1, d).getDay()];
    if (b) $('.num', cell)?.insertAdjacentHTML('afterend', `<span class="prime-tag" title="Jam terbaik ${DAYS_LONG[b.weekday]}: rata-rata ${Math.round(b.avg_views).toLocaleString('id-ID')} views">⚡${pad(b.hour)}</span>`);
  }
}
async function drawCal() {
  const alt = $('#cal-alt');
  $$('[data-calv]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.calv === cal.view)));
  if (!alt) return;
  calGrid.hidden = cal.view !== 'month';
  alt.hidden = cal.view === 'month';
  if (cal.view === 'month') return;
  const days = [];
  const base = new Date(cal.cursor.getFullYear(), cal.cursor.getMonth(), cal.cursor.getDate());
  if (cal.view === 'week') {
    const mon = new Date(base);
    mon.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    for (let i = 0; i < 7; i++) days.push(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
  } else days.push(base);
  const from = days[0];
  const to = new Date(days[days.length - 1].getTime() + DAY);
  cal.title = $('#cal-title').textContent = cal.view === 'day'
    ? base.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${from.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  alt.innerHTML = '<div class="spinner"></div>';
  const [posts, plans, best] = await Promise.all([
    api(`/api/posts?from=${from.toISOString()}&to=${to.toISOString()}`).catch(() => []),
    api(`/api/content?from=${from.toISOString()}&to=${to.toISOString()}`).catch(() => []),
    bestTimes(),
  ]);
  const prime = primeSet(best);
  const items = [
    ...posts.map((p) => ({ d: new Date(p.scheduled_at || p.created_at), html: `<button class="chip st-${esc(p.status)}" data-post="${p.id}" title="${esc(p.caption || '')}">${esc((p.caption || 'Post').slice(0, 40))}</button>` })),
    ...plans.filter((c) => !c.post_id && c.planned_at).map((c) => ({ d: new Date(c.planned_at), html: `<button class="chip plan" draggable="true" data-drag-content="${c.id}" data-content="${c.id}" title="${esc(c.title)}">${esc(c.title)}</button>` })),
  ];
  const H0 = 6;
  const H1 = 23;
  const today = new Date().toDateString();
  const nowH = new Date().getHours();
  let html = `<div class="tgrid" style="--days:${days.length}"><div class="tg-corner"></div>${days.map((d) => `<div class="tg-head ${d.toDateString() === today ? 'today' : ''}"><span>${DAYS[d.getDay()]}</span><b>${d.getDate()}</b></div>`).join('')}`;
  for (let h = H0; h <= H1; h++) {
    html += `<div class="tg-hour">${pad(h)}:00</div>`;
    for (const d of days) {
      const slot = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h);
      const here = items.filter((it) => it.d.toDateString() === d.toDateString() && it.d.getHours() === h);
      const isPrime = prime.has(`${d.getDay()}-${h}`);
      html += `<div class="tg-cell ${isPrime ? 'prime' : ''} ${d.toDateString() === today && h === nowH ? 'now' : ''}" data-slot="${slot.toISOString()}" ${isPrime ? 'title="Jam tayang terbaik"' : ''}>${isPrime ? '<span class="prime-mark">⚡</span>' : ''}${here.map((x) => x.html).join('')}</div>`;
    }
  }
  // Konten di luar jam 06–23 tetap ditampilkan di baris terpisah supaya tidak hilang.
  const outside = items.filter((it) => days.some((d) => d.toDateString() === it.d.toDateString()) && (it.d.getHours() < H0 || it.d.getHours() > H1));
  html += '</div>';
  if (outside.length) html += `<p class="hint">Di luar jam 06–23: ${outside.map((x) => x.html).join(' ')}</p>`;
  alt.innerHTML = html;
  // Gulir vertikal saja ke jam sekarang / jam prime pertama (jangan geser kolom hari).
  const grid = alt.querySelector('.tgrid');
  const focus = alt.querySelector('.tg-cell.now') || alt.querySelector('.tg-cell.prime');
  if (grid && focus) grid.scrollTop = Math.max(0, focus.offsetTop - 60);
}
const baseCal = S.viewHooks.calendar;
S.viewHooks.calendar = () => {
  baseCal?.();
  drawQueue();
  if (cal.view !== 'month') drawCal(); else { $$('[data-calv]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.calv === 'month'))); calGrid.hidden = false; $('#cal-alt').hidden = true; }
};

// =====================================================================
// 3) ANALITIK — tabel "Semua konten": cari, urutkan, ekspor CSV
// =====================================================================
const anTable = $('#an-table');
const an = { sort: null, dir: 1, q: '' };
function parseCell(t) {
  const s = t.trim();
  if (!s || s === '–') return null;
  const n = s.replace(/^Rp/, '').replace(/[%x]$/, '').replace(/\./g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : s.toLowerCase();
}
function enhanceAnTable() {
  const table = $('table', anTable);
  const card = anTable.closest('.card');
  if (!card) return;
  let bar = $('.an-tools', card);
  if (!table) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'an-tools';
    bar.innerHTML = '<input class="search" id="an-q" placeholder="Cari judul, pilar, platform…" aria-label="Cari konten"><span class="hint" id="an-count"></span><button class="ghost small" id="an-csv">Ekspor CSV</button>';
    anTable.before(bar);
    $('#an-q', bar).addEventListener('input', (e) => { an.q = e.target.value.toLowerCase(); applyAn(); });
    $('#an-csv', bar).addEventListener('click', exportAn);
    $('#an-q', bar).value = an.q;
  }
  $$('thead th', table).forEach((th, i) => {
    if (th.dataset.sortable || !th.textContent.trim()) return;
    th.dataset.sortable = '1';
    th.tabIndex = 0;
    th.addEventListener('click', () => { an.dir = an.sort === i ? -an.dir : -1; an.sort = i; applyAn(); });
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter') th.click(); });
  });
  applyAn();
}
function applyAn() {
  const table = $('table', anTable);
  if (!table) return;
  const tbody = $('tbody', table);
  const rows = $$('tr', tbody);
  let shown = 0;
  for (const r of rows) {
    const hit = !an.q || r.textContent.toLowerCase().includes(an.q);
    r.hidden = !hit;
    if (hit) shown++;
  }
  if (an.sort != null) {
    const val = (r) => parseCell(r.children[an.sort]?.textContent || '');
    rows.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null) return 1;
      if (y == null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * an.dir;
    });
    obs.disconnect();
    rows.forEach((r) => tbody.append(r));
    obs.observe(anTable, { childList: true, subtree: true });
  }
  $$('thead th', table).forEach((th, i) => {
    th.classList.remove('sorted', 'asc', 'desc');
    if (i === an.sort) th.classList.add('sorted', an.dir > 0 ? 'asc' : 'desc');
  });
  const c = $('#an-count');
  if (c) c.textContent = `${shown} dari ${rows.length} konten`;
}
function exportAn() {
  const table = $('table', anTable);
  if (!table) return;
  const head = $$('thead th', table).map((th) => th.textContent.trim()).filter(Boolean);
  const rows = $$('tbody tr', table).filter((r) => !r.hidden).map((r) => $$('td', r).slice(0, head.length).map((td) => td.textContent.trim()));
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob([`﻿${[head, ...rows].map((r) => r.map(q).join(',')).join('\n')}`], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `analitik-konten-${ymd(new Date())}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  S.toast(`CSV diunduh (${rows.length} baris)`);
}
let anTimer = null;
const obs = new MutationObserver(() => { clearTimeout(anTimer); anTimer = setTimeout(enhanceAnTable, 30); });
if (anTable) obs.observe(anTable, { childList: true, subtree: true });

// =====================================================================
// 4) RIWAYAT — timeline status + retry langsung + log error
// =====================================================================
const history = $('#history');
const STEPS = [['scheduled', 'Terjadwal'], ['publishing', 'Mengirim'], ['done', 'Selesai']];
function enhanceHistory() {
  for (const item of $$('.post-item', history)) {
    if (item.querySelector('.ptl')) continue;
    const st = [...(item.querySelector('.status')?.classList || [])].find((c) => c.startsWith('st-'))?.slice(3) || '';
    const final = ['done', 'partial', 'failed'].includes(st);
    const idx = st === 'scheduled' ? 0 : st === 'publishing' ? 1 : final ? 2 : -1;
    const endLabel = st === 'partial' ? 'Sebagian' : st === 'failed' ? 'Gagal' : 'Selesai';
    const errs = $$('.dot.st-failed', item).map((d) => `${d.textContent.trim()}: ${d.title}`).filter((x) => !x.endsWith(': '));
    const tl = document.createElement('div');
    tl.className = `ptl end-${st}`;
    tl.innerHTML = STEPS.map(([k, l], i) => `<span class="ptl-step ${i < idx ? 'past' : i === idx ? 'cur' : ''}"><i></i>${i === 2 ? endLabel : l}</span>`).join('<span class="ptl-line"></span>');
    $('.post-body', item)?.append(tl);
    if (errs.length) $('.post-body', item)?.insertAdjacentHTML('beforeend', `<div class="ptl-err">⚠ ${esc(errs[0])}${errs.length > 1 ? ` <span class="hint">(+${errs.length - 1} akun lain)</span>` : ''}</div>`);
    if (['failed', 'partial'].includes(st)) item.insertAdjacentHTML('beforeend', `<button class="ghost small retry-btn" data-retry-inline="${item.dataset.post}">↻ Retry publish</button>`);
  }
}
if (history) {
  new MutationObserver(enhanceHistory).observe(history, { childList: true });
  history.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-retry-inline]');
    if (!b) return;
    e.stopPropagation();
    b.disabled = true;
    b.textContent = 'Mengirim ulang…';
    try {
      await api(`/api/posts/${b.dataset.retryInline}/retry`, { method: 'POST' });
      S.toast('Retry dikirim. Status diperbarui otomatis.');
      S.show('history');
      setTimeout(() => { if ($('#view-history.active')) S.show('history'); }, 2000);
    } catch (ex) { b.disabled = false; b.textContent = '↻ Retry publish'; S.toast(ex.message); }
  });
}

// =====================================================================
// 5) AKUN — kartu koneksi per platform + kesehatan token
// =====================================================================
const CONNECT = [
  ['tiktok', 'TikTok', '#111'], ['instagram', 'Instagram', '#e1306c'], ['facebook', 'Facebook Page', '#1877f2'],
  ['youtube', 'YouTube', '#ff0000'], ['threads', 'Threads', '#000'],
];
const accList = $('#account-list');
const health = store.get('timai.accHealth', {});
function tokenState(a) {
  const exp = a.expires_at || a.token_expires_at || a.details?.expires_at || a.details?.['Token kedaluwarsa'];
  const checked = health[a.id];
  if (checked && !checked.ok) return ['bad', 'Reconnect needed', checked.msg];
  if (exp) {
    const days = (new Date(exp) - Date.now()) / DAY;
    if (Number.isFinite(days)) {
      if (days < 0) return ['bad', 'Reconnect needed', 'Token sudah kedaluwarsa'];
      if (days < 7) return ['warn', 'Expiring soon', `Token habis ${Math.ceil(days)} hari lagi`];
    }
  }
  if (checked?.ok) return ['ok', 'Connected', `Dicek ${new Date(checked.at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}`];
  return ['ok', 'Connected', 'Belum dicek. Klik "Cek token".'];
}
// Pilihan "Pindah brand" (pemilik/admin, kalau brand-nya lebih dari satu); ditangani listener change di app.js.
const moveSelect = (a) => (['owner', 'admin'].includes(state.me?.user.role) && state.brands.length > 1
  ? `<select class="ghost small" data-move-account="${a.id}" title="Pindah ke brand lain"><option value="">Pindah brand…</option>${state.brands.filter((b) => b.id !== state.brandId).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>`
  : '');
let drawingAcc = false;
function drawAccounts() {
  if (!accList || drawingAcc) return;
  drawingAcc = true;
  const platforms = state.platforms || {};
  const ids = [...new Set([...CONNECT.map((c) => c[0]), ...state.accounts.map((a) => a.platform)])];
  accList.innerHTML = `<div class="acc-cards">${ids.map((id) => {
    const meta = CONNECT.find((c) => c[0] === id) || [id, platforms[id]?.label || id, platforms[id]?.color || '#888'];
    const accs = state.accounts.filter((a) => a.platform === id);
    const supported = !!platforms[id];
    const worst = accs.map(tokenState).sort((a, b) => ['bad', 'warn', 'ok'].indexOf(a[0]) - ['bad', 'warn', 'ok'].indexOf(b[0]))[0];
    return `<div class="acc-card2 ${accs.length ? `has ${worst[0]}` : ''}">
      <div class="ac-head"><span class="ac-logo" style="background:${esc(meta[2])}">${esc(meta[1][0])}</span><div><b>${esc(meta[1])}</b>
        <span class="hint">${accs.length ? `${accs.length} akun terhubung` : supported ? 'Belum terhubung' : 'Belum didukung server'}</span></div>
        ${accs.length ? `<span class="pill ${worst[0]}">${worst[1]}</span>` : ''}</div>
      ${accs.map((a) => { const [tone, label, note] = tokenState(a); return `<div class="ac-acc">
        <div class="grow"><b>${esc(a.name)}</b><div class="hint"><span class="hdot ${tone}"></span>${esc(label)} · ${esc(note)}</div><div class="acc-check" id="acc-check-${a.id}"></div></div>
        <button class="ghost small" data-check-account="${a.id}">Cek token</button>${moveSelect(a)}<button class="danger small" data-del-account="${a.id}" title="Hapus akun">✕</button></div>`; }).join('')}
      ${supported ? `<button class="${accs.length ? 'link small' : 'primary small'} ac-connect" data-ac-connect="${esc(id)}">${accs.length ? '+ Tambah akun lain' : 'Hubungkan'}</button>` : ''}
    </div>`;
  }).join('')}</div>`;
  drawingAcc = false;
}
if (accList) {
  // renderAccounts() di app.js menulis daftar polos → ganti dengan kartu (tombol & id kotak cek tetap sama, jadi handler lama jalan).
  new MutationObserver(() => { if (!drawingAcc && !$('.acc-cards', accList)) drawAccounts(); }).observe(accList, { childList: true });
  // Hasil "Cek token" dari app.js → simpan sebagai status kesehatan.
  new MutationObserver(() => {
    let changed = false;
    for (const box of $$('.acc-check', accList)) {
      const r = box.querySelector('.check');
      if (!r || box.dataset.seen === r.className + r.textContent.length) continue;
      box.dataset.seen = r.className + r.textContent.length;
      const id = box.id.replace('acc-check-', '');
      health[id] = { ok: r.classList.contains('ok'), at: Date.now(), msg: r.querySelector('li b')?.textContent || 'Token tidak valid' };
      changed = true;
    }
    if (changed) {
      store.set('timai.accHealth', health);
      for (const box of $$('.acc-check', accList)) {
        const id = box.id.replace('acc-check-', '');
        const [tone, label, note] = tokenState({ id, ...state.accounts.find((a) => String(a.id) === id) });
        const line = box.previousElementSibling;
        if (line?.classList.contains('hint')) line.innerHTML = `<span class="hdot ${tone}"></span>${esc(label)} · ${esc(note)}`;
      }
    }
  }).observe(accList, { childList: true, subtree: true });
  accList.addEventListener('click', (e) => {
    const c = e.target.closest('[data-ac-connect]');
    if (!c) return;
    const sel = $('#acc-platform');
    sel.value = c.dataset.acConnect;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    $('.acc-add')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#acc-name')?.focus({ preventScroll: true });
  });
}

// ---------- Kait ke halaman ----------
const baseCompose = S.viewHooks.compose;
S.viewHooks.compose = () => { baseCompose?.(); drawPreview(); drawBest(); };
const baseAccounts = S.viewHooks.accounts;
S.viewHooks.accounts = () => { baseAccounts?.(); if (!$('.acc-cards', accList)) drawAccounts(); };
drawPreview();
if ($('#view-compose')?.classList.contains('active')) drawBest();
if (calSection?.classList.contains('active')) S.viewHooks.calendar();
