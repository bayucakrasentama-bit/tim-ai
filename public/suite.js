// Dashboard, Planner (kanban), Analitik, AI Studio, dan Tim & Brand.
// Helper bersama (api, modal, toast, state) datang dari app.js lewat window.siarin.
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel) => document.querySelector(sel);

const COLUMNS = [
  { id: 'ide', label: 'Ide' },
  { id: 'draft', label: 'Draft' },
  { id: 'review', label: 'Review' },
  { id: 'siap', label: 'Siap' },
  { id: 'terjadwal', label: 'Terjadwal' },
  { id: 'tayang', label: 'Tayang' },
];
const FORMATS = ['Reels', 'Video pendek', 'Video panjang', 'Carousel', 'Foto', 'Story', 'Live', 'Teks/Thread'];
const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' }, { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' }, { id: 'facebook', label: 'Facebook' },
];
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DAYS_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const METRIC_LABEL = {
  views: 'Views', reach: 'Reach', likes: 'Likes', comments: 'Komentar', shares: 'Share', saves: 'Simpan',
  profile_visits: 'Profile visit', link_clicks: 'Klik link', follows: 'Follower baru', leads: 'Leads', sales: 'Sales', revenue: 'Omzet (Rp)',
};

const num = (n) => (n == null ? '–' : Number(n).toLocaleString('id-ID'));
const compact = (n) => (n == null ? '–' : Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const pct = (v) => (v == null ? '–' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
const rupiah = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`;
const rupiahShort = (n) => `Rp${compact(Number(n || 0))}`;
const since = (days) => new Date(Date.now() - days * 86400_000).toISOString();
const platformName = (id) => state.platforms[id]?.label || PLATFORMS.find((p) => p.id === id)?.label || id;
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const canManage = () => ['owner', 'admin'].includes(state.me?.user.role);
const brand = () => state.brands.find((b) => b.id === state.brandId);

// ---------- Tooltip (hover & fokus) untuk semua elemen ber-data-tip ----------
const tip = $('#tooltip');
function showTip(e) {
  const el = e.target.closest?.('[data-tip]');
  if (!el) return;
  tip.innerHTML = el.dataset.tip;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90);
  tip.style.left = `${x}px`;
  tip.style.top = `${r.top + window.scrollY - 8}px`;
}
document.addEventListener('mouseover', showTip);
document.addEventListener('focusin', showTip);
document.addEventListener('mouseout', (e) => e.target.closest?.('[data-tip]') && (tip.hidden = true));
document.addEventListener('focusout', () => (tip.hidden = true));

// ---------- Komponen grafik kecil (tanpa library) ----------
function kpis(items) {
  return items.map((k) => `<div class="kpi"><div class="kpi-label">${k.label}</div>
    <div class="kpi-value">${k.value}</div>${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>`).join('');
}

// Funnel: satu warna (magnitudo), lebar relatif ke tahap pertama, konversi antar tahap ditulis sebagai teks.
function funnel(steps) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  if (!steps[0].value && !steps.some((s) => s.value)) return '<div class="empty">Belum ada data di periode ini.</div>';
  return `<div class="funnel">${steps.map((s) => `
    <div class="funnel-row" tabindex="0" data-tip="<b>${esc(s.label)}</b><br>${num(s.value)}${s.conversion != null ? `<br>${pct(s.conversion)} dari tahap sebelumnya` : ''}">
      <div class="funnel-label">${esc(s.label)}</div>
      <div class="funnel-track"><div class="funnel-bar" style="width:${Math.max((s.value / max) * 100, s.value ? 1.5 : 0)}%"></div></div>
      <div class="funnel-num">${compact(s.value)}${s.conversion != null ? `<span class="hint"> · ${pct(s.conversion)}</span>` : ''}</div>
    </div>`).join('')}</div>`;
}

// Bar harian: SVG, batang tipis dengan ujung membulat, satu seri.
function timeline(rows, days) {
  if (!rows.length) return '<div class="empty">Belum ada konten tayang di periode ini.</div>';
  const byDay = Object.fromEntries(rows.map((r) => [r.day, r]));
  const list = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() + 7 * 3600_000 - i * 86400_000).toISOString().slice(0, 10);
    list.push(byDay[d] || { day: d, views: 0, contents: 0, engagement: 0 });
  }
  const W = 720;
  const H = 160;
  const max = Math.max(...list.map((r) => r.views), 1);
  const step = W / list.length;
  const bw = Math.max(Math.min(step - 2, 18), 2);
  const bars = list.map((r, i) => {
    const h = r.views ? Math.max((r.views / max) * (H - 24), 3) : 0;
    const x = i * step + (step - bw) / 2;
    const label = new Date(`${r.day}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    return `<g class="tl-col" data-tip="<b>${label}</b><br>${num(r.views)} views · ${r.contents} konten<br>${num(r.engagement)} engagement">
      <rect x="${i * step}" y="0" width="${step}" height="${H - 18}" fill="transparent"></rect>
      ${h ? `<rect class="tl-bar" x="${x}" y="${H - 18 - h}" width="${bw}" height="${h}" rx="${Math.min(4, bw / 2)}"></rect>` : ''}
    </g>`;
  }).join('');
  // Label tanggal di HTML (bukan di SVG) supaya tidak ikut melar/terpotong di layar sempit.
  const ticks = [0, Math.floor(list.length / 2), list.length - 1].map((i) => `<span>${new Date(`${list[i].day}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>`).join('');
  return `<svg class="timeline" viewBox="0 0 ${W} ${H - 18}" preserveAspectRatio="none" role="img" aria-label="Views harian">
    <line x1="0" x2="${W}" y1="${H - 18}" y2="${H - 18}" class="tl-axis"></line>${bars}</svg>
    <div class="tl-ticks">${ticks}</div>
    <div class="hint">Puncak: ${num(max)} views/hari</div>`;
}

// Heatmap hari x jam: satu hue, makin pekat makin banyak views.
function heatmap(times) {
  if (!times.length) return '<div class="empty">Belum cukup data. Butuh beberapa konten tayang dengan angka views.</div>';
  const grid = {};
  for (const t of times) grid[`${t.weekday}-${t.hour}`] = t;
  const hours = [...Array(24).keys()].filter((h) => h >= 5 || times.some((t) => t.hour === h));
  const max = Math.max(...times.map((t) => t.avg_views), 1);
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `<div class="heat" style="--cols:${hours.length}">
    <div></div>${hours.map((h) => `<div class="heat-h">${h % 3 === 0 ? h : ''}</div>`).join('')}
    ${order.map((d) => `<div class="heat-d">${DAYS[d]}</div>${hours.map((h) => {
    const t = grid[`${d}-${h}`];
    if (!t) return '<div class="heat-c"></div>';
    const level = Math.ceil((t.avg_views / max) * 4);
    return `<div class="heat-c l${level}" tabindex="0" data-tip="<b>${DAYS_LONG[d]} ${h}:00</b><br>rata-rata ${num(t.avg_views)} views<br>${t.posts} konten"></div>`;
  }).join('')}`).join('')}
  </div>
  <div class="heat-legend hint">Sedikit <span class="heat-c l1"></span><span class="heat-c l2"></span><span class="heat-c l3"></span><span class="heat-c l4"></span> Banyak</div>
  <p class="hint">Terbaik: ${times.slice(0, 3).map((t) => `<b>${DAYS_LONG[t.weekday]} ${t.hour}:00</b>`).join(', ')}</p>`;
}

// Perbandingan per kategori: satu ukuran (rata-rata views), label teks, bukan warna.
function compareBars(groups, empty = 'Belum ada data.') {
  if (!groups.length) return `<div class="empty">${empty}</div>`;
  const max = Math.max(...groups.map((g) => g.avg_views), 1);
  return `<table class="compare"><thead><tr><th></th><th>Rata-rata views</th><th>ER</th><th>Konten</th><th>Sales</th></tr></thead><tbody>
    ${groups.map((g) => `<tr>
      <td class="compare-name">${esc(platformName(g.key))}</td>
      <td><div class="mini-track" data-tip="${esc(platformName(g.key))}: total ${num(g.views)} views"><div class="mini-bar" style="width:${(g.avg_views / max) * 100}%"></div><span>${compact(g.avg_views)}</span></div></td>
      <td>${pct(g.engagement_rate)}</td><td>${g.contents}</td><td>${num(g.sales)}</td></tr>`).join('')}
  </tbody></table>`;
}

// ======================================================================
// DASHBOARD
// ======================================================================
async function renderDashboard() {
  const days = Number($('#dash-range').value);
  $('#dash-title').textContent = brand() ? `Dashboard · ${brand().name}` : 'Dashboard';
  const [s, content, upcoming] = await Promise.all([
    api(`/api/analytics/summary?from=${since(days)}`),
    api('/api/content'),
    api('/api/posts?status=scheduled'),
  ]);
  const t = s.totals;
  $('#dash-kpis').innerHTML = kpis([
    { label: 'Views', value: compact(t.views), sub: `${t.contents} konten` },
    { label: 'Engagement rate', value: pct(t.engagement_rate), sub: `${compact(t.engagement)} interaksi` },
    { label: 'Profile visit', value: compact(t.profile_visits) },
    { label: 'Leads', value: num(t.leads) },
    { label: 'Sales', value: num(t.sales) },
    { label: 'Omzet', value: rupiahShort(t.revenue), sub: rupiah(t.revenue) },
  ]);
  $('#dash-funnel').innerHTML = funnel(s.funnel);
  const counts = Object.fromEntries(COLUMNS.map((c) => [c.id, 0]));
  for (const c of content) counts[c.status]++;
  $('#dash-pipeline').innerHTML = `<div class="pipeline">${COLUMNS.map((c) => `<button class="pipe" data-goto="planner"><b>${counts[c.id]}</b>${c.label}</button>`).join('')}</div>`;
  const next = upcoming.reverse().slice(0, 5);
  $('#dash-upcoming').innerHTML = next.length
    ? next.map((p) => `<div class="mini-item" data-post="${p.id}"><span>${esc(S.fmtDate(p.scheduled_at))}</span><span class="grow">${esc((p.caption || '(tanpa caption)').slice(0, 60))}</span></div>`).join('')
    : '<div class="empty small">Belum ada post terjadwal.</div>';
  $('#dash-timeline').innerHTML = timeline(s.timeline, days);
  $('#dash-sync').textContent = s.lastSync ? `Data API terakhir ditarik ${S.fmtDate(s.lastSync)}` : '';
}
$('#dash-range').addEventListener('change', renderDashboard);
S.viewHooks.dashboard = () => renderDashboard().catch((e) => toast(e.message));

// ======================================================================
// PLANNER
// ======================================================================
let plannerItems = [];
let assignees = [];

async function renderPlanner() {
  [plannerItems, assignees] = await Promise.all([api('/api/content'), api('/api/assignees')]);
  drawKanban();
}
function drawKanban() {
  const q = $('#planner-search').value.trim().toLowerCase();
  const mine = $('#planner-mine').checked;
  const items = plannerItems.filter((i) => (!q || `${i.title} ${i.pillar} ${i.hook}`.toLowerCase().includes(q))
    && (!mine || i.assignee_id === state.me.user.id));
  const who = (id) => assignees.find((a) => a.id === id)?.username;
  $('#kanban').innerHTML = COLUMNS.map((col) => {
    const list = items.filter((i) => i.status === col.id);
    return `<div class="kcol" data-col="${col.id}">
      <div class="kcol-head"><span>${col.label}</span><span class="count">${list.length}</span></div>
      <div class="kcol-body">
        ${list.map((i) => `<div class="kcard" draggable="true" data-content="${i.id}" tabindex="0">
          <div class="kcard-title">${esc(i.title)}</div>
          <div class="kcard-meta">
            ${i.pillar ? `<span class="tag">${esc(i.pillar)}</span>` : ''}${i.format ? `<span class="tag ghost">${esc(i.format)}</span>` : ''}
            ${i.platforms.map((p) => `<span class="tag ghost">${esc(platformName(p))}</span>`).join('')}
          </div>
          <div class="kcard-foot">
            <span>${i.planned_at ? `🗓 ${esc(new Date(i.planned_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }))}` : ''}${i.assets?.length ? ` · 📎${i.assets.length}` : ''}</span>
            ${i.assignee_id != null && who(i.assignee_id) ? `<span class="who">@${esc(who(i.assignee_id))}</span>` : ''}
          </div>
          ${i.post ? `<div class="kcard-post">${S.statusPill(i.post.status)}</div>` : ''}
          <div class="kcard-move">
            ${col.id !== 'ide' ? `<button class="move" data-move="${i.id}" data-dir="-1" aria-label="Pindah ke kolom sebelumnya">◀</button>` : '<span></span>'}
            ${col.id !== 'tayang' ? `<button class="move" data-move="${i.id}" data-dir="1" aria-label="Pindah ke kolom berikutnya">▶</button>` : ''}
          </div>
        </div>`).join('') || '<div class="kempty">Seret kartu ke sini</div>'}
      </div>
      ${col.id === 'ide' ? '<button class="link kadd" data-add-content>+ Tambah ide</button>' : ''}
    </div>`;
  }).join('');
}
$('#planner-search').addEventListener('input', drawKanban);
$('#planner-mine').addEventListener('change', drawKanban);

// Drag & drop antar kolom.
let dragId = null;
$('#kanban').addEventListener('dragstart', (e) => {
  const card = e.target.closest('.kcard');
  if (!card) return;
  dragId = Number(card.dataset.content);
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
$('#kanban').addEventListener('dragend', (e) => e.target.closest?.('.kcard')?.classList.remove('dragging'));
$('#kanban').addEventListener('dragover', (e) => {
  const col = e.target.closest('.kcol');
  if (!col || dragId == null) return;
  e.preventDefault();
  document.querySelectorAll('.kcol.over').forEach((c) => c !== col && c.classList.remove('over'));
  col.classList.add('over');
});
$('#kanban').addEventListener('drop', async (e) => {
  const col = e.target.closest('.kcol');
  document.querySelectorAll('.kcol.over').forEach((c) => c.classList.remove('over'));
  if (!col || dragId == null) return;
  e.preventDefault();
  const id = dragId;
  dragId = null;
  moveCard(id, col.dataset.col);
});
$('#kanban').addEventListener('dragend', () => document.querySelectorAll('.kcol.over').forEach((c) => c.classList.remove('over')));

async function moveCard(id, status) {
  const item = plannerItems.find((i) => i.id === id);
  if (!item || item.status === status) return;
  item.status = status;
  drawKanban();
  try {
    await api(`/api/content/${item.id}`, json('PATCH', { status }));
    if (status === 'siap') toast('Siap! Buka kartunya buat langsung dijadwalkan.');
  } catch (ex) {
    toast(ex.message);
    renderPlanner();
  }
}
// Tombol ◀ ▶ di kartu: alternatif seret untuk layar sentuh & keyboard.
$('#kanban').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-move]');
  if (!btn) return;
  e.stopPropagation();
  const item = plannerItems.find((i) => i.id === Number(btn.dataset.move));
  const idx = COLUMNS.findIndex((c) => c.id === item.status) + Number(btn.dataset.dir);
  if (COLUMNS[idx]) moveCard(item.id, COLUMNS[idx].id);
});

document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-content]');
  if (card && !e.target.closest('button:not([data-content])')) openContent(Number(card.dataset.content));
  if (e.target.matches('[data-add-content]') || e.target.id === 'planner-add') openContent(null);
});
$('#kanban').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.kcard')) openContent(Number(e.target.dataset.content));
});

async function openContent(id) {
  const item = id ? await api(`/api/content/${id}`) : { title: '', status: 'ide', platforms: [], pillar: '', format: '', hook: '', script: '', caption: '', notes: '', planned_at: null, assignee_id: null };
  if (!assignees.length) assignees = await api('/api/assignees').catch(() => []);
  const pillars = [...new Set(plannerItems.map((i) => i.pillar).filter(Boolean))];
  openModal(`<form id="content-form" class="content-form">
    <div class="row-between"><h3>${id ? 'Edit konten' : 'Konten baru'}</h3>${item.post ? S.statusPill(item.post.status) : ''}</div>
    <label class="label" for="cf-title">Judul</label>
    <input id="cf-title" name="title" value="${esc(item.title)}" placeholder="mis. 3 kesalahan seduh kopi di rumah" required>
    <div class="form-grid">
      <div><label class="label" for="cf-status">Status</label>
        <select id="cf-status" name="status">${COLUMNS.map((c) => `<option value="${c.id}" ${c.id === item.status ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>
      <div><label class="label" for="cf-pillar">Pilar</label>
        <input id="cf-pillar" name="pillar" list="pillar-list" value="${esc(item.pillar)}" placeholder="Edukasi, Hiburan, Promo...">
        <datalist id="pillar-list">${pillars.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></div>
      <div><label class="label" for="cf-format">Format</label>
        <select id="cf-format" name="format"><option value="">–</option>${FORMATS.map((f) => `<option ${f === item.format ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
      <div><label class="label" for="cf-date">Rencana tayang</label>
        <input id="cf-date" name="planned_at" type="datetime-local" value="${item.planned_at ? S.toLocalInput(new Date(item.planned_at)) : ''}"></div>
      <div><label class="label" for="cf-who">PIC</label>
        <select id="cf-who" name="assignee_id"><option value="">–</option>${assignees.map((a) => `<option value="${a.id}" ${a.id === item.assignee_id ? 'selected' : ''}>${esc(a.username)}</option>`).join('')}</select></div>
    </div>
    <div class="label">Platform</div>
    <div class="checks">${PLATFORMS.map((p) => `<label><input type="checkbox" name="platforms" value="${p.id}" ${item.platforms.includes(p.id) ? 'checked' : ''}> ${p.label}</label>`).join('')}</div>
    <div class="row-between"><label class="label" for="cf-hook">Hook (3 detik pertama)</label>
      <span><button type="button" class="link" id="cf-ai">✨ Lengkapi hook, script & caption pakai AI</button> · ${S.gemini.button('text', { label: 'Tulis di Gemini', cls: 'link', form: 'Lengkapi konten ini: tulis hook 3 detik pertama, script video, dan caption (dengan CTA & hashtag) dalam Bahasa Indonesia.' })}</span></div>
    <textarea id="cf-hook" name="hook" rows="2">${esc(item.hook)}</textarea>
    <label class="label" for="cf-script">Script</label>
    <textarea id="cf-script" name="script" rows="6">${esc(item.script)}</textarea>
    <label class="label" for="cf-caption">Caption</label>
    <textarea id="cf-caption" name="caption" rows="4">${esc(item.caption)}</textarea>
    <label class="label" for="cf-notes">Catatan</label>
    <textarea id="cf-notes" name="notes" rows="2">${esc(item.notes)}</textarea>
    <div class="row-between"><div class="label">Lampiran visual</div>
      <span><button type="button" class="link" data-goto-studio>🎨 Studio Visual</button> ·
      <button type="button" class="link" data-goto-motion>🎬 Video Motion</button></span></div>
    <div id="cf-assets" class="assets">${assetsHtml(item.assets || [])}</div>
    <label class="ghost btn small upload-btn">+ Upload gambar / video
      <input type="file" id="cf-file" accept="image/*,video/*" multiple hidden></label>
    <span class="hint" id="cf-upload-status"></span>
    <div id="cf-error" class="error" hidden></div>
    <div class="modal-actions">
      ${id ? '<button type="button" class="danger" id="cf-delete">Hapus</button>' : ''}
      <button type="button" class="ghost" data-close>Batal</button>
      ${['ide', 'draft'].includes(item.status) ? '<button type="button" class="ghost" id="cf-review">Kirim ke Review</button>' : ''}
      ${['siap', 'review', 'draft', 'ide'].includes(item.status) && !item.post ? '<button type="button" class="ghost" id="cf-compose">Simpan & jadwalkan →</button>' : ''}
      <button type="submit" class="primary">Simpan</button>
    </div>
  </form>`);
  $('#modal-box').classList.add('wide');

  // Lampiran butuh kartu yang sudah tersimpan, jadi kartu baru disimpan dulu otomatis.
  $('#cf-file').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    try {
      if (!id) await save();
      for (const [n, file] of files.entries()) {
        $('#cf-upload-status').textContent = `Mengunggah ${n + 1}/${files.length}...`;
        await uploadAsset(id, file, (pct) => { $('#cf-upload-status').textContent = `Mengunggah ${n + 1}/${files.length}... ${pct}%`; });
      }
      $('#cf-upload-status').textContent = '';
      const fresh = await api(`/api/content/${id}`);
      item.assets = fresh.assets;
      $('#cf-assets').innerHTML = assetsHtml(fresh.assets);
      refreshPlannerBehind();
    } catch (ex) { $('#cf-upload-status').textContent = ''; fail(ex); }
  });
  $('#cf-assets').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-asset]');
    if (!del || !confirm('Hapus lampiran ini?')) return;
    try {
      await api(`/api/content/${id}/assets/${del.dataset.delAsset}`, { method: 'DELETE' });
      item.assets = item.assets.filter((a) => a.id !== Number(del.dataset.delAsset));
      $('#cf-assets').innerHTML = assetsHtml(item.assets);
      refreshPlannerBehind();
    } catch (ex) { fail(ex); }
  });
  $('#content-form').addEventListener('click', async (e) => {
    if (e.target.matches('[data-goto-motion]')) {
      try {
        if (!$('#cf-title').value.trim()) throw new Error('Isi judul kartu dulu');
        const saved = await save();
        closeModal();
        S.motionFromCard(await api(`/api/content/${saved.id}`));
      } catch (ex) { fail(ex); }
      return;
    }
    if (!e.target.matches('[data-goto-studio]')) return;
    try {
      if ($('#cf-title').value.trim()) await save();
      closeModal();
      S.show('studio');
      toast('Generate di Studio, terus upload hasilnya ke kartu ini (bagian Lampiran).');
    } catch (ex) { fail(ex); }
  });

  const read = () => {
    const f = $('#content-form');
    const v = Object.fromEntries(new FormData(f));
    v.platforms = [...f.querySelectorAll('input[name=platforms]:checked')].map((x) => x.value);
    v.planned_at = v.planned_at ? new Date(v.planned_at).toISOString() : null;
    v.assignee_id = v.assignee_id === '' ? null : Number(v.assignee_id);
    return v;
  };
  const save = async () => {
    const saved = id ? await api(`/api/content/${id}`, json('PATCH', read())) : await api('/api/content', json('POST', read()));
    id = saved.id;
    return saved;
  };
  const fail = (ex) => { $('#cf-error').textContent = ex.message; $('#cf-error').hidden = false; };

  $('#content-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await save();
      closeModal();
      toast('Konten tersimpan');
      refreshPlannerViews();
    } catch (ex) { fail(ex); }
  });
  $('#cf-compose')?.addEventListener('click', async () => {
    try {
      const saved = await save();
      if (saved.status !== 'siap') await api(`/api/content/${saved.id}`, json('PATCH', { status: 'siap' }));
      closeModal();
      S.composeFrom({ ...saved, status: 'siap' });
    } catch (ex) { fail(ex); }
  });
  $('#cf-review')?.addEventListener('click', async () => {
    try {
      await save();
      await api(`/api/content/${id}`, json('PATCH', { status: 'review' }));
      closeModal();
      toast('Kartu dikirim ke Review');
      refreshPlannerViews();
    } catch (ex) { fail(ex); }
  });
  $('#cf-delete')?.addEventListener('click', async () => {
    if (!confirm('Hapus kartu ini dari planner? Post yang sudah dibuat dari kartu ini tetap ada.')) return;
    try {
      await api(`/api/content/${id}`, { method: 'DELETE' });
      closeModal();
      toast('Konten dihapus');
      refreshPlannerViews();
    } catch (ex) { fail(ex); }
  });
  $('#cf-ai').addEventListener('click', async () => {
    const v = read();
    if (!v.title.trim()) return fail(new Error('Isi judul dulu, nanti AI yang lengkapi sisanya'));
    const btn = $('#cf-ai');
    btn.disabled = true;
    btn.textContent = 'AI lagi nulis...';
    try {
      const { ideas } = await api('/api/ai/ideas', json('POST', {
        brief: `${v.title}${v.notes ? `\nCatatan: ${v.notes}` : ''}${v.hook ? `\nHook awal: ${v.hook}` : ''}`,
        pillar: v.pillar, platform: v.platforms.map(platformName).join(', '), count: 1,
      }));
      const idea = ideas[0];
      if (idea) {
        $('#cf-hook').value = idea.hook;
        $('#cf-script').value = idea.script;
        $('#cf-caption').value = `${idea.caption}${idea.cta ? `\n\n${idea.cta}` : ''}${idea.hashtags.length ? `\n\n${idea.hashtags.join(' ')}` : ''}`;
        if (!v.pillar && idea.pillar) $('#cf-pillar').value = idea.pillar;
        if (!v.format && FORMATS.includes(idea.format)) $('#cf-format').value = idea.format;
        if (idea.angle && !$('#cf-notes').value) $('#cf-notes').value = `Angle: ${idea.angle}`;
      }
    } catch (ex) { fail(ex); } finally {
      btn.disabled = false;
      btn.textContent = '✨ Lengkapi hook, script & caption pakai AI';
    }
  });
}
function assetsHtml(assets) {
  if (!assets.length) return '<p class="hint">Belum ada lampiran. Upload hasil dari Studio Visual / desainer di sini.</p>';
  return assets.map((a) => `<div class="asset">
    <a href="${esc(a.url)}" target="_blank" rel="noopener">${a.kind === 'video' ? `<video src="${esc(a.url)}" muted></video>` : `<img src="${esc(a.url)}" alt="${esc(a.name)}">`}</a>
    <div class="asset-meta"><span title="${esc(a.name)}">${esc(a.name)}</span><span class="hint">${esc(a.created_by)}</span></div>
    <button type="button" class="asset-del" data-del-asset="${a.id}" aria-label="Hapus lampiran ${esc(a.name)}">✕</button>
  </div>`).join('');
}

// Lokal: kirim file ke server. Online: upload langsung ke Vercel Blob, server cuma dapat URL-nya.
async function uploadAsset(contentId, file, onProgress) {
  if (!/^(image|video)\//.test(file.type)) throw new Error(`${file.name}: harus gambar atau video`);
  if (state.config.storage === 'blob') {
    const { upload } = await import('/vendor/blob-client.js');
    const blob = await upload(file.name, file, {
      access: 'public', handleUploadUrl: '/api/blob-upload', multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
    });
    return api(`/api/content/${contentId}/assets`, json('POST', { url: blob.url, name: file.name }));
  }
  const fd = new FormData();
  fd.set('file', file);
  return api(`/api/content/${contentId}/assets`, { method: 'POST', body: fd });
}

// Kanban di belakang modal ikut diperbarui tanpa menutup modal.
function refreshPlannerBehind() {
  if (document.querySelector('.view.active')?.id === 'view-planner') api('/api/content').then((r) => { plannerItems = r; drawKanban(); }).catch(() => {});
}

S.uploadAsset = (...args) => uploadAsset(...args);

function refreshPlannerViews() {
  const active = document.querySelector('.view.active').id.replace('view-', '');
  if (['planner', 'calendar', 'dashboard'].includes(active)) S.show(active);
}
S.viewHooks.planner = () => renderPlanner().catch((e) => toast(e.message));
// Modal ditutup: kembalikan lebar normal.
new MutationObserver(() => $('#modal').hidden && $('#modal-box').classList.remove('wide')).observe($('#modal'), { attributes: true, attributeFilter: ['hidden'] });

// ======================================================================
// STUDIO VISUAL (Ngonten Dibantu AI, dipasang di /studio)
// ======================================================================
S.viewHooks.studio = () => {
  const frame = $('#studio-frame');
  if (!frame.getAttribute('src')) frame.src = '/studio/';
};

// ======================================================================
// ANALITIK
// ======================================================================
let anRows = [];
let anSummary = null;

async function renderAnalytics() {
  const days = Number($('#an-range').value);
  [anSummary, anRows] = await Promise.all([
    api(`/api/analytics/summary?from=${since(days)}`),
    api(`/api/metrics?from=${since(days)}`),
  ]);
  const t = anSummary.totals;
  $('#an-kpis').innerHTML = kpis([
    { label: 'Konten', value: num(t.contents) },
    { label: 'Views', value: compact(t.views), sub: `Reach ${compact(t.reach)}` },
    { label: 'Engagement rate', value: pct(t.engagement_rate), sub: `${compact(t.likes)} likes · ${compact(t.comments)} komentar` },
    { label: 'Profile visit', value: compact(t.profile_visits), sub: `${compact(t.follows)} follower baru` },
    { label: 'Leads → Sales', value: `${num(t.leads)} → ${num(t.sales)}`, sub: t.leads ? `closing ${pct(t.sales / t.leads)}` : '' },
    { label: 'Omzet', value: rupiahShort(t.revenue), sub: rupiah(t.revenue) },
  ]);
  $('#an-funnel').innerHTML = funnel(anSummary.funnel);
  $('#an-heatmap').innerHTML = heatmap(anSummary.bestTimes);
  $('#an-platform').innerHTML = compareBars(anSummary.byPlatform);
  $('#an-pillar').innerHTML = compareBars(anSummary.byPillar.filter((g) => g.key !== '(tanpa label)').length ? anSummary.byPillar : [], 'Belum ada konten yang tersambung ke pilar. Konten dari Planner otomatis punya pilar.');
  $('#an-table').innerHTML = anRows.length ? `<table class="data">
    <thead><tr><th>Tanggal</th><th>Konten</th><th>Platform</th><th>Views</th><th>ER</th><th>Profile visit</th><th>Klik</th><th>Leads</th><th>Sales</th><th>Omzet</th><th></th></tr></thead>
    <tbody>${anRows.map((r) => {
    const eng = (r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.saves || 0);
    return `<tr data-metric="${r.id}" tabindex="0">
      <td>${r.posted_at ? esc(new Date(r.posted_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })) : '–'}</td>
      <td class="t-title">${esc(r.title || '(tanpa judul)')}${r.pillar ? ` <span class="tag">${esc(r.pillar)}</span>` : ''}${r.sync_error ? ` <span class="warn-dot" data-tip="${esc(r.sync_error)}">!</span>` : ''}</td>
      <td>${esc(platformName(r.platform))}</td><td>${num(r.views)}</td><td>${r.views ? pct(eng / r.views) : '–'}</td>
      <td>${num(r.profile_visits)}</td><td>${num(r.link_clicks)}</td><td>${num(r.leads)}</td><td>${num(r.sales)}</td><td>${r.revenue ? rupiah(r.revenue) : '–'}</td>
      <td><span class="src src-${r.source}">${{ api: 'API', manual: 'Manual', ai: 'AI' }[r.source] || r.source}</span></td></tr>`;
  }).join('')}</tbody></table>`
    : '<div class="empty">Belum ada data. Klik <b>Tarik data dari API</b> (buat post yang tayang lewat TIM-AI), <b>Input manual</b>, atau <b>Dari screenshot</b>.</div>';
}
$('#an-range').addEventListener('change', () => renderAnalytics().catch((e) => toast(e.message)));
S.viewHooks.analytics = () => renderAnalytics().catch((e) => toast(e.message));

$('#an-sync').addEventListener('click', async () => {
  const btn = $('#an-sync');
  btn.disabled = true;
  btn.textContent = 'Menarik data...';
  try {
    const r = await api('/api/metrics/sync', { method: 'POST' });
    const errs = [...new Set(r.errors.map((e) => `${platformName(e.platform)}: ${e.message}`))];
    $('#an-sync-result').innerHTML = `<div class="check ${errs.length ? 'bad' : 'ok'}"><div class="head">${r.updated} dari ${r.checked} post diperbarui</div>
      ${r.skipped.length ? `<div class="hint">${esc(r.skipped.join(', '))} belum bisa ditarik otomatis, jadi isi manual atau pakai screenshot.</div>` : ''}
      ${errs.length ? `<ul>${errs.slice(0, 5).map((e) => `<li>${esc(e)}</li>`).join('')}</ul><div class="hint">Biasanya karena izin insights belum dicentang (Instagram: instagram_manage_insights · Facebook: read_insights & pages_read_engagement). Sambungkan ulang akunnya dengan izin itu.</div>` : ''}</div>`;
    await renderAnalytics();
  } catch (ex) { toast(ex.message); } finally {
    btn.disabled = false;
    btn.textContent = 'Tarik data dari API';
  }
});

// Form input/edit metrik (manual).
async function openMetric(row = null) {
  const content = await api('/api/content').catch(() => []);
  const fields = Object.keys(METRIC_LABEL);
  const r = row || { platform: 'instagram', title: '', posted_at: new Date().toISOString(), content_id: null };
  const fromApi = r.source === 'api';
  openModal(`<form id="metric-form">
    <h3>${row ? 'Edit data konten' : 'Input data konten manual'}</h3>
    ${fromApi ? '<p class="hint">Angka views/likes ditarik dari API dan diperbarui otomatis. Klik link, leads, sales, dan omzet diisi manual.</p>' : ''}
    <div class="form-grid">
      <div><label class="label" for="mf-platform">Platform</label>
        <select id="mf-platform" name="platform" ${fromApi ? 'disabled' : ''}>${[...PLATFORMS, { id: 'lainnya', label: 'Lainnya' }, ...(fromApi ? [{ id: r.platform, label: platformName(r.platform) }] : [])].map((p) => `<option value="${p.id}" ${p.id === r.platform ? 'selected' : ''}>${p.label}</option>`).join('')}</select></div>
      <div><label class="label" for="mf-date">Tanggal tayang</label>
        <input id="mf-date" name="posted_at" type="datetime-local" value="${r.posted_at ? S.toLocalInput(new Date(r.posted_at)) : ''}"></div>
      <div class="span-2"><label class="label" for="mf-title">Judul / caption singkat</label><input id="mf-title" name="title" value="${esc(r.title)}"></div>
      <div class="span-2"><label class="label" for="mf-content">Kartu planner (biar pilar & format ikut terbaca)</label>
        <select id="mf-content" name="content_id"><option value="">–</option>${content.map((c) => `<option value="${c.id}" ${c.id === r.content_id ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></div>
      ${fields.map((f) => `<div><label class="label" for="mf-${f}">${METRIC_LABEL[f]}</label>
        <input id="mf-${f}" name="${f}" inputmode="numeric" value="${r[f] ?? ''}" placeholder="–"></div>`).join('')}
    </div>
    <div id="mf-error" class="error" hidden></div>
    <div class="modal-actions">
      ${row ? '<button type="button" class="danger" id="mf-delete">Hapus</button>' : ''}
      <button type="button" class="ghost" data-close>Batal</button>
      <button class="primary" type="submit">Simpan</button>
    </div></form>`);
  $('#modal-box').classList.add('wide');
  $('#metric-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    v.posted_at = v.posted_at ? new Date(v.posted_at).toISOString() : null;
    v.content_id = v.content_id ? Number(v.content_id) : null;
    for (const f of fields) if (v[f] === '') v[f] = null;
    try {
      if (row) await api(`/api/metrics/${row.id}`, json('PATCH', v));
      else await api('/api/metrics', json('POST', v));
      closeModal();
      toast('Data tersimpan');
      renderAnalytics();
    } catch (ex) { $('#mf-error').textContent = ex.message; $('#mf-error').hidden = false; }
  });
  $('#mf-delete')?.addEventListener('click', async () => {
    if (!confirm('Hapus data ini dari analitik?')) return;
    await api(`/api/metrics/${row.id}`, { method: 'DELETE' });
    closeModal();
    renderAnalytics();
  });
}
$('#an-add').addEventListener('click', () => openMetric());
$('#an-table').addEventListener('click', (e) => {
  const tr = e.target.closest('[data-metric]');
  if (tr) openMetric(anRows.find((r) => r.id === Number(tr.dataset.metric)));
});
$('#an-table').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-metric]')) openMetric(anRows.find((r) => r.id === Number(e.target.dataset.metric)));
});

// AI Metrics Extractor: screenshot -> diperkecil di browser -> Claude -> tabel yang bisa dicek dulu.
function shrink(file, maxSide = 1568) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error(`${file.name} bukan gambar yang bisa dibaca`));
    img.src = URL.createObjectURL(file);
  });
}
$('#an-extract').addEventListener('click', () => {
  openModal(`<h3>📷 Ambil angka dari screenshot</h3>
    <p class="hint">Upload screenshot halaman insight (Instagram, TikTok, YouTube Studio, Facebook). Maksimal 6 gambar sekali proses.
    Punya screen record? Ambil screenshot dari bagian yang ada angkanya, karena AI belum bisa membaca video.</p>
    <div class="form-grid"><div><label class="label" for="ex-platform">Platform (opsional)</label>
      <select id="ex-platform"><option value="">Biar AI yang tebak</option>${PLATFORMS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}</select></div></div>
    <label class="dropzone"><input type="file" id="ex-files" accept="image/*" multiple hidden><div>Klik buat pilih screenshot</div></label>
    <div id="ex-thumbs" class="thumbs"></div>
    <div id="ex-out"></div>
    <div id="ex-error" class="error" hidden></div>
    <div class="modal-actions"><button class="ghost" data-close>Tutup</button><button class="primary" id="ex-run" disabled>Baca angkanya</button></div>`);
  $('#modal-box').classList.add('wide');
  let images = [];
  $('#ex-files').addEventListener('change', async (e) => {
    const files = [...e.target.files].slice(0, 6);
    try {
      images = await Promise.all(files.map((f) => shrink(f)));
      $('#ex-thumbs').innerHTML = images.map((src) => `<img src="${src}" alt="">`).join('');
      $('#ex-run').disabled = !images.length;
    } catch (ex) { $('#ex-error').textContent = ex.message; $('#ex-error').hidden = false; }
  });
  $('#ex-run').addEventListener('click', async () => {
    const btn = $('#ex-run');
    btn.disabled = true;
    btn.textContent = 'AI lagi membaca...';
    $('#ex-error').hidden = true;
    try {
      const r = await api('/api/ai/extract', json('POST', { images, platform: $('#ex-platform').value }));
      const cols = ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'profile_visits', 'link_clicks', 'follows'];
      $('#ex-out').innerHTML = r.items.length ? `<p class="hint">Cek dulu angkanya. Kolom bisa diedit, terus simpan yang dicentang.${r.notes ? ` Catatan AI: ${esc(r.notes)}` : ''}</p>
        <div class="table-wrap"><table class="data edit" id="ex-table"><thead><tr><th></th><th>Platform</th><th>Judul</th><th>Tanggal</th>${cols.map((c) => `<th>${METRIC_LABEL[c]}</th>`).join('')}</tr></thead>
        <tbody>${r.items.map((it, i) => `<tr data-i="${i}"><td><input type="checkbox" checked aria-label="Simpan baris ini"></td>
          <td><select data-f="platform">${[...PLATFORMS, { id: 'lainnya', label: 'Lainnya' }].map((p) => `<option value="${p.id}" ${p.id === it.platform ? 'selected' : ''}>${p.label}</option>`).join('')}</select></td>
          <td><input data-f="title" value="${esc(it.title)}"></td><td><input data-f="posted_at" type="date" value="${esc(it.posted_at || '')}"></td>
          ${cols.map((c) => `<td><input data-f="${c}" inputmode="numeric" value="${it[c] ?? ''}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">AI tidak menemukan angka di screenshot ini.</div>';
      btn.textContent = 'Simpan ke analitik';
      btn.disabled = !r.items.length;
      btn.onclick = saveExtracted;
    } catch (ex) {
      $('#ex-error').textContent = ex.message;
      $('#ex-error').hidden = false;
      btn.disabled = false;
      btn.textContent = 'Baca angkanya';
    }
  }, { once: true });
});
async function saveExtracted(e) {
  e.stopImmediatePropagation();
  const rows = [...document.querySelectorAll('#ex-table tbody tr')].filter((tr) => tr.querySelector('input[type=checkbox]').checked);
  let saved = 0;
  for (const tr of rows) {
    const v = { source: 'ai' };
    tr.querySelectorAll('[data-f]').forEach((el) => (v[el.dataset.f] = el.value === '' ? null : el.value));
    if (v.posted_at) v.posted_at = new Date(`${v.posted_at}T12:00:00`).toISOString();
    try {
      await api('/api/metrics', json('POST', v));
      saved++;
    } catch (ex) { toast(ex.message); }
  }
  closeModal();
  toast(`${saved} konten masuk ke analitik`);
  renderAnalytics();
}

// Laporan siap cetak / PDF + CSV.
const STATUS_NAME = Object.fromEntries(COLUMNS.map((c) => [c.id, c.label]));
function productionHtml(p) {
  const c = p.content;
  return `<h3>Produksi konten (tim konten)</h3>
    <div class="kpi-row">${kpis([
    { label: 'Konten direncanakan', value: num(c.total) },
    { label: 'Sudah tayang', value: num(c.byStatus.tayang || 0) },
    { label: 'Tepat waktu', value: pct(c.on_time_rate), sub: `${c.on_time} tepat · ${c.late} telat` },
    { label: 'Lewat jadwal, belum tayang', value: num(c.overdue) },
  ])}</div>
    <p class="hint">Per tahap: ${COLUMNS.map((col) => `${col.label} ${c.byStatus[col.id] || 0}`).join(' · ')}</p>
    ${p.people.length ? `<table class="data"><thead><tr><th>PIC</th><th>Konten</th><th>Tayang</th><th>Tepat waktu</th><th>Telat</th><th>Lewat jadwal</th></tr></thead>
      <tbody>${p.people.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.total}</td><td>${x.tayang}</td><td>${x.on_time}</td><td>${x.late}</td><td>${x.overdue}</td></tr>`).join('')}</tbody></table>` : ''}
    <h3>Distribusi (tim medsos)</h3>
    <p class="hint">${num(p.distribution.posts)} post · ${Object.entries(p.distribution.byStatus).map(([k, v]) => `${esc(S.STATUS_LABEL[k] || k)} ${v}`).join(' · ') || 'belum ada post'}</p>
    ${p.distribution.byPlatform.length ? `<table class="data"><thead><tr><th>Platform</th><th>Berhasil</th><th>Gagal</th><th>Menunggu</th></tr></thead>
      <tbody>${p.distribution.byPlatform.map((g) => `<tr><td>${esc(platformName(g.platform))}</td><td>${g.success}</td><td>${g.failed}</td><td>${g.pending}</td></tr>`).join('')}</tbody></table>` : ''}`;
}

$('#an-report').addEventListener('click', async () => {
  if (!anSummary) return;
  const days = Number($('#an-range').value);
  const t = anSummary.totals;
  let production = '';
  try {
    production = productionHtml(await api(`/api/reports/production?from=${since(days)}`));
  } catch (ex) { production = `<p class="error">${esc(ex.message)}</p>`; }
  const period = `${new Date(since(days)).toLocaleDateString('id-ID', { dateStyle: 'medium' })} – ${new Date().toLocaleDateString('id-ID', { dateStyle: 'medium' })}`;
  openModal(`<div class="report" id="report">
    <div class="row-between"><div><h2 class="report-title">Laporan Konten & Media Sosial</h2>
      <div class="hint">${esc(brand()?.name || '')} · ${period}</div></div><span class="logo">S</span></div>
    <div class="kpi-row">${kpis([
    { label: 'Konten', value: num(t.contents) }, { label: 'Views', value: num(t.views) },
    { label: 'Engagement rate', value: pct(t.engagement_rate) }, { label: 'Profile visit', value: num(t.profile_visits) },
    { label: 'Sales', value: num(t.sales) }, { label: 'Omzet', value: rupiah(t.revenue) },
  ])}</div>
    <h3>Funnel</h3>${funnel(anSummary.funnel)}
    <h3>Per platform</h3>${compareBars(anSummary.byPlatform)}
    <h3>10 konten teratas</h3>
    <table class="data"><thead><tr><th>Konten</th><th>Platform</th><th>Views</th><th>ER</th><th>Sales</th></tr></thead>
      <tbody>${anSummary.top.map((r) => `<tr><td>${esc(r.title || '-')}</td><td>${esc(platformName(r.platform))}</td><td>${num(r.views)}</td><td>${pct(r.engagement_rate)}</td><td>${num(r.sales)}</td></tr>`).join('')}</tbody></table>
    ${anSummary.bestTimes.length ? `<p>Jam tayang terbaik: ${anSummary.bestTimes.slice(0, 3).map((b) => `${DAYS_LONG[b.weekday]} ${b.hour}:00`).join(', ')} WIB.</p>` : ''}
    ${production}
  </div>
  <div class="modal-actions no-print">
    <button class="ghost" data-close>Tutup</button>
    <a class="ghost btn" href="/api/reports/export.csv?brand=${state.brandId}&from=${encodeURIComponent(since(days))}">Download CSV</a>
    <button class="primary" id="report-print">Cetak / Simpan PDF</button>
  </div>`);
  $('#modal-box').classList.add('wide');
  $('#report-print').addEventListener('click', () => {
    document.body.classList.add('printing');
    window.print();
    document.body.classList.remove('printing');
  });
});

// ======================================================================
// AI STUDIO
// ======================================================================
let aiTab = 'ideas';
let aiStatus = null;

async function renderAi() {
  aiStatus = await api('/api/ai/status');
  const b = brand();
  $('#ai-status').innerHTML = `${aiSettingsHtml()}
    <details class="card brand-profile" ${b?.description ? '' : 'open'}>
      <summary><b>Profil brand</b> <span class="hint">(dibaca AI di setiap permintaan)</span></summary>
      <textarea id="ai-brand-desc" rows="3" placeholder="mis. Kedai kopi susu di Bandung, target mahasiswa 18-24, gaya bahasa santai & lucu, produk andalan es kopi gula aren 18rb">${esc(b?.description || '')}</textarea>
      <button class="ghost" id="ai-brand-save">Simpan profil</button>
    </details>`;
  drawAiPanel();
}
const AI_SRC = { pribadi: 'key pribadi kamu', env: 'key workspace (server)', workspace: 'key workspace dari pemilik' };
function aiSettingsHtml() {
  const g = aiStatus.gemini;
  const manage = ['owner', 'admin'].includes(state.me?.user?.role);
  const head = aiStatus.routed
    ? `<span class="status success">AI aktif</span> <b>${esc(aiStatus.routed.provider)}</b> · <code>${esc(aiStatus.routed.model)}</code> <span class="hint">· model default dari <button class="link" data-goto="aikeys">AI & API Keys</button></span>`
    : aiStatus.enabled
    ? `<span class="status success">AI aktif</span> <b>${aiStatus.provider === 'gemini' ? 'Google Gemini' : 'Claude'}</b> · <code>${esc(aiStatus.model)}</code>${aiStatus.provider === 'gemini' && g.key_source ? ` <span class="hint">· pakai ${AI_SRC[g.key_source]}</span>` : ''}`
    : '<span class="status failed">AI belum aktif</span> Tempel API key Gemini kamu di bawah.';
  return `<details class="card ai-settings" ${aiStatus.enabled ? '' : 'open'}>
    <summary>${head}</summary>
    <div class="ai-set-grid">
      <div>
        <h3>Key Gemini pribadi</h3>
        <ol class="hint guide-steps">
          <li>Buka <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>, login pakai akun Google kamu.</li>
          <li>Klik <b>Create API key</b>, lalu salin key-nya (diawali <code>AIza</code>).</li>
          <li>Tempel di sini. Pemakaian AI kamu masuk ke kuota/billing akun Google kamu sendiri.</li>
        </ol>
        <p class="hint">Gemini 4 Argon cuma ada di tier berbayar Gemini API: aktifkan billing di Google AI Studio. Langganan Google AI Pro di aplikasi Gemini <b>tidak</b> otomatis berlaku untuk API.</p>
        <div class="row"><input id="ai-mykey" type="password" autocomplete="new-password" data-lpignore="true" placeholder="${g.personal ? '•••••• tersimpan (isi untuk ganti)' : 'AIza...'}">
          <button class="primary" id="ai-mykey-save">Simpan</button>${g.personal ? '<button class="ghost" id="ai-mykey-del">Hapus</button>' : ''}</div>
      </div>
      ${manage ? `<div>
        <h3>Workspace <span class="hint">(pemilik/admin)</span></h3>
        <label class="label" for="ai-provider">Provider untuk yang belum punya key pribadi</label>
        <select id="ai-provider"><option value="gemini" ${aiStatus.provider === 'gemini' || g.personal ? 'selected' : ''}>Google Gemini</option><option value="claude" ${aiStatus.provider === 'claude' && !g.personal ? 'selected' : ''}>Claude${aiStatus.claude.configured ? '' : ' (ANTHROPIC_API_KEY belum diisi)'}</option></select>
        <label class="label" for="ai-wskey">Key Gemini workspace (cadangan)</label>
        <input id="ai-wskey" type="password" autocomplete="new-password" data-lpignore="true" placeholder="${g.workspace ? '•••••• tersimpan (isi untuk ganti)' : 'opsional, AIza...'}">
        <label class="label" for="ai-model">Model Gemini</label>
        <input id="ai-model" value="${esc(g.model)}" list="ai-models"><datalist id="ai-models"><option value="gemini-4-argon"></datalist>
        <button class="ghost" id="ai-ws-save">Simpan pengaturan workspace</button>
      </div>` : ''}
    </div>
    <div class="row"><button class="ghost" id="ai-test">Tes koneksi AI</button><span class="hint" id="ai-test-out"></span></div>
  </details>`;
}

async function aiSettingsAction(id) {
  const reload = async (st) => { aiStatus = st; state.config.ai = st.enabled; await renderAi(); };
  if (id === 'ai-mykey-save') {
    const key = $('#ai-mykey').value.trim();
    if (!key) return toast('Tempel API key dulu');
    await reload(await api('/api/ai/my-key', json('PUT', { gemini_key: key })));
    toast('Key Gemini tersimpan');
  } else if (id === 'ai-mykey-del') {
    await reload(await api('/api/ai/my-key', { method: 'DELETE' }));
    toast('Key pribadi dihapus');
  } else if (id === 'ai-ws-save') {
    const body = { provider: $('#ai-provider').value, gemini_model: $('#ai-model').value };
    if ($('#ai-wskey').value.trim()) body.gemini_key = $('#ai-wskey').value.trim();
    await reload(await api('/api/ai/config', json('PUT', body)));
    toast('Pengaturan AI tersimpan');
  } else if (id === 'ai-test') {
    $('#ai-test-out').textContent = 'Mengetes...';
    const r = await api('/api/ai/test', json('POST', {}));
    $('#ai-test-out').textContent = `Tersambung ke ${r.model}: "${r.answer}"`;
  }
}
document.addEventListener('click', (e) => {
  if (!['ai-mykey-save', 'ai-mykey-del', 'ai-ws-save', 'ai-test'].includes(e.target.id)) return;
  aiSettingsAction(e.target.id).catch((ex) => {
    if (e.target.id === 'ai-test') $('#ai-test-out').textContent = ex.message;
    else toast(ex.message);
  });
});

function drawAiPanel() {
  document.querySelectorAll('#ai-tabs button').forEach((t) => t.classList.toggle('active', t.dataset.tab === aiTab));
  const pillars = [...new Set(plannerItems.map((i) => i.pillar).filter(Boolean))];
  const forms = {
    ideas: `<form id="ai-form" class="form-grid">
      <div class="span-2"><label class="label" for="ai-brief">Topik / brief</label>
        <textarea id="ai-brief" name="brief" rows="3" placeholder="mis. promo menu baru matcha latte minggu depan, pengen yang relate sama anak kos"></textarea></div>
      <div><label class="label" for="ai-pillar">Pilar</label><input id="ai-pillar" name="pillar" list="ai-pillars" placeholder="opsional">
        <datalist id="ai-pillars">${pillars.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></div>
      <div><label class="label" for="ai-platform">Platform</label><select id="ai-platform" name="platform"><option value="">Bebas</option>${PLATFORMS.map((p) => `<option>${p.label}</option>`).join('')}</select></div>
      <div><label class="label" for="ai-goal">Tujuan</label><select id="ai-goal" name="goal"><option>Awareness & views</option><option>Engagement</option><option>Follower baru</option><option>Leads & penjualan</option></select></div>
      <div><label class="label" for="ai-count">Jumlah ide</label><select id="ai-count" name="count"><option>3</option><option selected>5</option><option>8</option><option>10</option></select></div>
      <div class="span-2 btn-row left"><button class="primary" type="submit">✨ Bikin ide, hook & script</button>${S.gemini.button('text', { label: 'Bikin di Gemini', form: 'Buat ide konten media sosial untuk pasar Indonesia. Tiap ide lengkap dengan judul, hook 3 detik, script, caption, CTA, dan hashtag.' })}</div></form>`,
    analyze: `<form id="ai-form" class="form-grid">
      <div><label class="label" for="ai-days">Periode data</label><select id="ai-days" name="days"><option value="7">7 hari</option><option value="30" selected>30 hari</option><option value="90">90 hari</option></select></div>
      <div class="span-2"><p class="hint">AI membaca data di menu Analitik (views, engagement, funnel, pilar, jam tayang) lalu bilang apa yang jalan, apa yang bocor, dan apa yang harus dikerjakan minggu ini.</p>
      <button class="primary" type="submit">✨ Analisa performa</button></div></form>`,
    strategy: `<form id="ai-form" class="form-grid">
      <div class="span-2"><label class="label" for="ai-sgoal">Tujuan utama</label>
        <input id="ai-sgoal" name="goal" placeholder="mis. naikkan penjualan online 30% dalam sebulan"></div>
      <div><label class="label" for="ai-splat">Platform</label><input id="ai-splat" name="platforms" placeholder="mis. Instagram & TikTok"></div>
      <div><label class="label" for="ai-start">Mulai tanggal</label><input id="ai-start" name="startDate" type="date" value="${new Date(Date.now() + 86400_000).toISOString().slice(0, 10)}"></div>
      <div><label class="label" for="ai-weeks">Durasi</label><select id="ai-weeks" name="weeks"><option value="1">1 minggu</option><option value="2">2 minggu</option><option value="4" selected>4 minggu</option></select></div>
      <div><label class="label" for="ai-ppw">Konten per minggu</label><select id="ai-ppw" name="postsPerWeek">${[3, 4, 5, 7, 10, 14].map((n) => `<option ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="span-2 btn-row left"><button class="primary" type="submit">✨ Susun strategi & kalender</button>${S.gemini.button('text', { label: 'Susun di Gemini', form: 'Susun strategi konten media sosial (positioning, pilar konten, jadwal posting, kalender konten per tanggal, dan KPI).' })}</div></form>`,
  };
  $('#ai-panel').innerHTML = forms[aiTab];
  $('#ai-form').addEventListener('submit', runAi);
}
$('#ai-tabs').addEventListener('click', (e) => {
  if (!e.target.dataset.tab) return;
  aiTab = e.target.dataset.tab;
  $('#ai-output').innerHTML = '';
  drawAiPanel();
});
document.addEventListener('click', async (e) => {
  if (e.target.id !== 'ai-brand-save') return;
  try {
    const updated = await api(`/api/brands/${state.brandId}`, json('PATCH', { description: $('#ai-brand-desc').value }));
    Object.assign(brand(), updated);
    toast('Profil brand tersimpan');
  } catch (ex) { toast(ex.message); }
});

let aiResult = null;
async function runAi(e) {
  e.preventDefault();
  const v = Object.fromEntries(new FormData(e.target));
  const btn = e.target.querySelector('button[type=submit]');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'AI lagi mikir... (bisa 20-60 detik)';
  $('#ai-output').innerHTML = '<div class="card"><div class="spinner"></div></div>';
  try {
    aiResult = await api(`/api/ai/${aiTab}`, json('POST', v));
    $('#ai-output').innerHTML = { ideas: ideasHtml, analyze: analyzeHtml, strategy: strategyHtml }[aiTab](aiResult);
  } catch (ex) {
    $('#ai-output').innerHTML = `<div class="check bad"><div class="head">${esc(ex.message)}</div></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
const ideaToContent = (i, extra = {}) => ({
  title: i.title, pillar: i.pillar, format: FORMATS.find((f) => f.toLowerCase() === String(i.format).toLowerCase()) || i.format,
  platforms: PLATFORMS.filter((p) => String(i.platform).toLowerCase().includes(p.id)).map((p) => p.id),
  hook: i.hook, script: i.script || '', notes: [i.angle && `Angle: ${i.angle}`].filter(Boolean).join('\n'),
  caption: i.caption ? `${i.caption}${i.cta ? `\n\n${i.cta}` : ''}${i.hashtags?.length ? `\n\n${i.hashtags.join(' ')}` : ''}` : '',
  status: 'ide', ...extra,
});
function ideasHtml(r) {
  return `<div class="row-between"><h2>${r.ideas.length} ide</h2><button class="primary" data-save-ideas="all">Simpan semua ke Planner</button></div>
    <div class="idea-grid">${r.ideas.map((i, n) => `<div class="card idea">
      <div class="row-between"><b>${esc(i.title)}</b><button class="ghost small" data-save-ideas="${n}">+ Planner</button></div>
      <div class="kcard-meta"><span class="tag">${esc(i.pillar)}</span><span class="tag ghost">${esc(i.format)}</span><span class="tag ghost">${esc(i.platform)}</span></div>
      <div class="label">Hook</div><p class="hook">“${esc(i.hook)}”</p>
      <div class="label">Angle</div><p>${esc(i.angle)}</p>
      <details><summary>Script</summary><pre class="script">${esc(i.script)}</pre></details>
      <details><summary>Caption</summary><pre class="script">${esc(i.caption)}\n\n${esc(i.cta)}\n\n${esc(i.hashtags.join(' '))}</pre></details>
    </div>`).join('')}</div>`;
}
function analyzeHtml(r) {
  const prio = { tinggi: 'st-failed', sedang: 'st-partial', rendah: 'st-scheduled' };
  return `<div class="card"><h2 class="headline">${esc(r.headline)}</h2>
    <div class="grid-2"><div>${r.insights.map((i) => `<div class="insight"><b>${esc(i.title)}</b><p>${esc(i.detail)}</p></div>`).join('')}</div>
    <div><div class="label">Pola yang berhasil</div><ul>${r.winning_patterns.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <div class="label">Masalah</div><ul>${r.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div></div>
    <div class="label">Yang harus dikerjakan</div>
    ${r.recommendations.map((x) => `<div class="reco"><span class="status ${prio[x.priority] || ''}">${esc(x.priority)}</span><div><b>${esc(x.action)}</b><div class="hint">${esc(x.why)}</div></div></div>`).join('')}
  </div>`;
}
function strategyHtml(r) {
  return `<div class="card"><div class="label">Positioning</div><p>${esc(r.positioning)}</p>
    <div class="label">Pilar konten</div>
    <div class="pillars">${r.pillars.map((p) => `<div class="pillar"><div class="row-between"><b>${esc(p.name)}</b><span>${p.share_percent}%</span></div>
      <div class="mini-track"><div class="mini-bar" style="width:${Math.min(p.share_percent, 100)}%"></div></div>
      <p class="hint">${esc(p.why)}</p><ul>${p.examples.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>
    <div class="label">Jadwal mingguan</div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Hari</th><th>Jam</th><th>Platform</th><th>Format</th><th>Pilar</th></tr></thead>
      <tbody>${r.schedule.map((s) => `<tr><td>${esc(s.day)}</td><td>${esc(s.time)}</td><td>${esc(s.platform)}</td><td>${esc(s.format)}</td><td>${esc(s.pillar)}</td></tr>`).join('')}</tbody></table></div>
    <div class="label">KPI</div><ul>${r.kpis.map((k) => `<li><b>${esc(k.metric)}: ${esc(k.target)}</b> · <span class="hint">${esc(k.why)}</span></li>`).join('')}</ul>
  </div>
  <div class="card"><div class="row-between"><div class="label">Rencana konten (${r.plan.length})</div>
    <button class="primary" data-save-plan>Masukkan semua ke Planner & Kalender</button></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Tanggal</th><th>Judul</th><th>Pilar</th><th>Format</th><th>Platform</th><th>Hook</th></tr></thead>
      <tbody>${r.plan.map((p) => `<tr><td>${esc(new Date(`${p.date}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }))}</td><td>${esc(p.title)}</td><td>${esc(p.pillar)}</td><td>${esc(p.format)}</td><td>${esc(p.platform)}</td><td>${esc(p.hook)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
document.addEventListener('click', async (e) => {
  const ideasKey = e.target.dataset.saveIdeas;
  if (ideasKey !== undefined && aiResult?.ideas) {
    const items = ideasKey === 'all' ? aiResult.ideas : [aiResult.ideas[Number(ideasKey)]];
    try {
      await api('/api/content/bulk', json('POST', { items: items.map((i) => ideaToContent(i)) }));
      e.target.disabled = true;
      e.target.textContent = 'Tersimpan ✓';
      toast(`${items.length} ide masuk ke Planner (kolom Ide)`);
    } catch (ex) { toast(ex.message); }
  }
  if (e.target.matches('[data-save-plan]') && aiResult?.plan) {
    // Jam diambil dari jadwal mingguan untuk hari yang sama kalau ada, selain itu 19:00.
    const timeFor = (date) => {
      const day = DAYS_LONG[new Date(`${date}T00:00:00`).getDay()].toLowerCase();
      const slot = aiResult.schedule.find((s) => s.day.toLowerCase().startsWith(day.slice(0, 3)));
      return /^\d{1,2}[.:]\d{2}/.test(slot?.time || '') ? slot.time.slice(0, 5).replace('.', ':').padStart(5, '0') : '19:00';
    };
    const items = aiResult.plan.map((p) => ideaToContent({ ...p, script: '', caption: '', angle: '' }, {
      planned_at: new Date(`${p.date}T${timeFor(p.date)}:00`).toISOString(),
    }));
    try {
      await api('/api/content/bulk', json('POST', { items }));
      e.target.disabled = true;
      e.target.textContent = 'Masuk ✓';
      toast(`${items.length} rencana masuk ke Planner & Kalender`);
    } catch (ex) { toast(ex.message); }
  }
});
S.viewHooks.ai = () => {
  if (!plannerItems.length) api('/api/content').then((r) => { plannerItems = r; }).catch(() => {});
  renderAi().catch((e) => toast(e.message));
};

// ======================================================================
// TIM & BRAND
// ======================================================================
async function renderTeam() {
  const manage = canManage();
  $('#brand-add').hidden = !manage;
  $('#user-add').hidden = !manage || !state.config.auth;
  $('#brand-list').innerHTML = state.brands.map((b) => `<div class="acc-row">
    <span class="avatar" style="background:${esc(b.color)}">${esc(b.name[0]?.toUpperCase() || '?')}</span>
    <div class="grow"><div class="acc-name">${esc(b.name)} ${b.id === state.brandId ? '<span class="tag">aktif</span>' : ''}</div>
      <div class="hint">${esc(b.description || 'Profil belum diisi')}</div></div>
    ${b.id !== state.brandId ? `<button class="ghost small" data-use-brand="${b.id}">Buka</button>` : ''}
    <button class="ghost small" data-edit-brand="${b.id}">Edit</button></div>`).join('');

  if (!state.config.auth) {
    $('#user-list').innerHTML = `<div class="empty">Login lagi nonaktif (TIM-AI jalan tanpa <code>APP_PASSWORD</code>).
      Isi <code>APP_PASSWORD</code> dulu, baru bisa nambah anggota tim dengan login masing-masing.</div>`;
    return;
  }
  if (!manage) {
    $('#user-list').innerHTML = `<div class="empty">Kamu login sebagai <b>${esc(state.me.user.username)}</b> (anggota). Pengelolaan tim cuma bisa dilakukan pemilik/admin.</div>`;
    return;
  }
  const users = await api('/api/users');
  const brandName = (id) => state.brands.find((b) => b.id === id)?.name;
  $('#user-list').innerHTML = `<div class="acc-row"><span class="avatar">★</span><div class="grow"><div class="acc-name">${esc(state.me.user.role === 'owner' ? state.me.user.username : 'Pemilik')}</div><div class="hint">Pemilik · semua brand · login dari APP_USERNAME/APP_PASSWORD${state.me.user.role === 'owner' && state.me.user.email ? ` atau Google (${esc(state.me.user.email)})` : ''}</div></div></div>
    ${users.map((u) => `<div class="acc-row"><span class="avatar">${esc(u.username[0].toUpperCase())}</span>
      <div class="grow"><div class="acc-name">${esc(u.username)}${u.email ? ` <span class="hint">· ${esc(u.email)}</span>` : ''}</div>
        <div class="hint">${esc(S.TEAM_LABEL[u.team] || '')} · ${u.role === 'admin' ? 'Admin · semua brand' : `Anggota · ${u.brandIds.map(brandName).filter(Boolean).map(esc).join(', ') || '<b class="warn-text">menunggu akses brand</b>'}`}</div></div>
      <button class="ghost small" data-edit-user="${u.id}">Edit</button>
      <button class="danger small" data-del-user="${u.id}">Hapus</button></div>`).join('') || ''}
    ${users.length ? '' : '<p class="hint">Belum ada anggota. Klik <b>+ Anggota</b> buat ngundang tim, terus kasih username & password-nya ke mereka.</p>'}`;
  state.teamUsers = users;
}
S.viewHooks.team = () => renderTeam().catch((e) => toast(e.message));

function brandForm(b = null) {
  const manage = canManage();
  openModal(`<form id="brand-form"><h3>${b ? 'Edit brand' : 'Brand baru'}</h3>
    <label class="label" for="bf-name">Nama brand</label><input id="bf-name" name="name" value="${esc(b?.name || '')}" ${manage ? '' : 'disabled'} required>
    <label class="label" for="bf-color">Warna</label><input id="bf-color" name="color" type="color" value="${esc(b?.color || '#7c6cf0')}" ${manage ? '' : 'disabled'}>
    <label class="label" for="bf-desc">Profil brand (niche, target audiens, produk, gaya bahasa)</label>
    <textarea id="bf-desc" name="description" rows="4">${esc(b?.description || '')}</textarea>
    <div id="bf-error" class="error" hidden></div>
    <div class="modal-actions">
      ${b && manage && state.brands.length > 1 ? '<button type="button" class="danger" id="bf-delete">Hapus brand</button>' : ''}
      <button type="button" class="ghost" data-close>Batal</button><button class="primary" type="submit">Simpan</button></div></form>`);
  $('#brand-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    try {
      const saved = b ? await api(`/api/brands/${b.id}`, json('PATCH', v)) : await api('/api/brands', json('POST', v));
      closeModal();
      await S.loadMe();
      if (!b) await S.switchBrand(saved.id);
      else renderTeam();
      toast(b ? 'Brand tersimpan' : `Brand "${saved.name}" dibuat dan dibuka`);
    } catch (ex) { $('#bf-error').textContent = ex.message; $('#bf-error').hidden = false; }
  });
  $('#bf-delete')?.addEventListener('click', async () => {
    const typed = prompt(`Ini menghapus SEMUA akun, post, planner, dan data analitik brand "${b.name}" di TIM-AI, dan tidak bisa dibatalkan. Ketik nama brand-nya buat lanjut:`);
    if (typed !== b.name) return;
    try {
      await api(`/api/brands/${b.id}`, { method: 'DELETE' });
      closeModal();
      await S.loadMe();
      await S.switchBrand(state.brands[0].id);
      toast('Brand dihapus');
    } catch (ex) { $('#bf-error').textContent = ex.message; $('#bf-error').hidden = false; }
  });
}
function userForm(u = null) {
  openModal(`<form id="user-form"><h3>${u ? `Edit ${esc(u.username)}` : 'Anggota baru'}</h3>
    ${u ? '' : '<label class="label" for="uf-name">Username</label><input id="uf-name" name="username" autocomplete="off" placeholder="mis. rina" required>'}
    <label class="label" for="uf-email">Email Google (untuk Masuk dengan Google & Gemini)</label>
    <input id="uf-email" name="email" type="email" autocomplete="off" placeholder="rina@gmail.com" value="${esc(u?.email || '')}">
    <label class="label" for="uf-pass">${u ? 'Password baru (kosongkan kalau tidak diganti)' : 'Password (opsional kalau pakai email Google, min. 8 karakter)'}</label>
    <input id="uf-pass" name="password" type="password" autocomplete="new-password">
    <label class="label" for="uf-role">Peran</label>
    <select id="uf-role" name="role"><option value="member" ${!['admin', 'lead'].includes(u?.role) ? 'selected' : ''}>Anggota: cuma brand yang dicentang</option>
<option value="lead" ${u?.role === 'lead' ? 'selected' : ''}>Lead / Supervisor: approve & revisi kartu, brand yang dicentang</option>
      <option value="admin" ${u?.role === 'admin' ? 'selected' : ''}>Admin: semua brand + kelola tim</option></select>
    <label class="label" for="uf-team">Tim</label>
    <select id="uf-team" name="team">${[['konten', 'Tim Konten: planner, Studio Visual, Video Motion, AI'], ['medsos', 'Tim Medsos: jadwal, posting, analitik, Scraper TikTok'], ['digital', 'Tim Digital: Launch Lab, LP Builder'], ['adv', 'Tim ADV: iklan Meta/TikTok/Google lintas brand'], ['mp', 'Tim MP: iklan & laporan marketplace lintas brand'], ['kol', 'Tim KOL: roster KOL, deal, performa & CPV lintas brand'], ['affiliate', 'Tim Affiliate: kreator afiliasi, komisi & GMV lintas brand'], ['cs', 'Tim CS: tiket, template balasan, laporan Desty'], ['semua', 'Semua tim']].map(([v, l]) => `<option value="${v}" ${(u?.team || 'semua') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="label">Akses brand</div>
    <div class="checks">${state.brands.map((b) => `<label><input type="checkbox" name="brandIds" value="${b.id}" ${u?.brandIds.includes(b.id) || (!u && b.id === state.brandId) ? 'checked' : ''}> ${esc(b.name)}</label>`).join('')}</div>
    <div id="uf-error" class="error" hidden></div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary" type="submit">Simpan</button></div></form>`);
  $('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const v = { email: f.email.value, password: f.password.value, role: f.role.value, team: f.team.value, brandIds: [...f.querySelectorAll('[name=brandIds]:checked')].map((x) => Number(x.value)) };
    if (!u) v.username = f.username.value;
    try {
      if (u) await api(`/api/users/${u.id}`, json('PATCH', v));
      else await api('/api/users', json('POST', v));
      closeModal();
      toast(u ? 'Tersimpan' : v.email ? 'Anggota ditambahkan. Dia bisa langsung Masuk dengan Google pakai email itu.' : 'Anggota ditambahkan. Kasih tahu username & password-nya ke dia.');
      renderTeam();
    } catch (ex) { $('#uf-error').textContent = ex.message; $('#uf-error').hidden = false; }
  });
}
document.addEventListener('click', async (e) => {
  const d = e.target.dataset;
  if (e.target.id === 'brand-add') brandForm();
  if (e.target.id === 'user-add') userForm();
  if (d.editBrand) brandForm(state.brands.find((b) => b.id === Number(d.editBrand)));
  if (d.useBrand) await S.switchBrand(Number(d.useBrand));
  if (d.editUser) userForm(state.teamUsers.find((u) => u.id === Number(d.editUser)));
  if (d.delUser && confirm('Hapus anggota ini? Dia langsung tidak bisa login lagi.')) {
    await api(`/api/users/${d.delUser}`, { method: 'DELETE' }).catch((ex) => toast(ex.message));
    renderTeam();
  }
});

