// Motion Factory: antrean produksi video massal. Profil produk disusun/diedit di sini, render dikerjakan agen di Mac mini.
// Endpoint: /api/factory/* (server/factory). Semua teks user/AI di-escape dengan esc().
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel, el = document) => el.querySelector(sel);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const STATUS = { menunggu_profil: ['Nunggu profil', 'warn'], antre: ['Antre', 'info'], menyiapkan: ['Menyiapkan', 'info'], produksi: ['Produksi', 'info'], selesai: ['Selesai', 'ok'], dijeda: ['Dijeda', 'warn'], dibatalkan: ['Dibatalkan', 'bad'], gagal: ['Gagal', 'bad'] };
const CTA = { kerkun: 'Keranjang kuning', awareness: 'Tanpa keranjang', campur: 'Campur' };
const LIST_FIELDS = [
  ['story.daily_pain_points', 'Masalah sehari-hari'], ['story.physical_features', 'Ciri fisik produk'], ['story.safe_benefits', 'Manfaat aman'],
  ['story.usage_moments', 'Momen pemakaian'], ['angles', 'Angle konten'], ['cta_variants', 'Variasi CTA'],
  ['badge_texts', 'Teks badge'], ['compliance.banned_phrases', 'Frasa terlarang'],
];
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const setPath = (o, p, v) => { const ks = p.split('.'); let c = o; ks.slice(0, -1).forEach((k) => { if (typeof c[k] !== 'object' || c[k] == null) c[k] = {}; c = c[k]; }); c[ks.at(-1)] = v; };
const isAdmin = () => ['owner', 'admin'].includes(state.me?.user?.role);
const viewEl = () => $('#view-factory');
const num = (n) => Number(n || 0).toLocaleString('id-ID');
const fmtDur = (sec) => { const m = Math.round(sec / 60); return m < 60 ? `${m} menit` : m < 2880 ? `${(m / 60).toFixed(1).replace('.', ',')} jam` : `${(m / 1440).toFixed(1).replace('.', ',')} hari`; };
const fmtSize = (mb) => (mb < 1024 ? `${num(mb)} MB` : `${(mb / 1024).toFixed(1).replace('.', ',')} GB`);
const fmtEta = (t) => (t ? new Date(t).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '–');

let products = [];
let jobs = [];
let agent = null;
let timer = null;
let formState = { product_id: '', target: 100, cta: 'kerkun', footage_url: '' };

async function loadAll() {
  const [p, j] = await Promise.all([api('/api/factory/products'), api('/api/factory/jobs')]);
  products = p.products || [];
  jobs = j.jobs || [];
  agent = j.agent || null;
}

function agentCard() {
  const a = agent || {};
  const on = !!a.online;
  const leg = a.legacy && typeof a.legacy === 'object'
    ? Object.entries(a.legacy).map(([k, v]) => `${esc(k)} ${typeof v === 'object' && v ? `${num(v.done)}/${num(v.quota)}` : esc(v)}`).join(' · ') : '';
  return `<div class="card fx-agent ${on ? 'on' : 'off'}">
    <div><span class="fx-dot" aria-hidden="true"></span> <b>${on ? `Mac mini online — sedang ${esc(a.state || 'siaga')}` : 'Mac mini offline — produksi nunggu Mac nyala'}</b></div>
    ${a.drive_free_gb != null ? `<div class="hint">Ruang kosong: ${esc(num(a.drive_free_gb))} GB</div>` : ''}
    ${leg ? `<div class="hint">Produksi lama: ${leg}</div>` : ''}
  </div>`;
}

function formCard() {
  const f = formState;
  const opts = products.map((p) => `<option value="${esc(p.id)}" ${String(p.id) === String(f.product_id) ? 'selected' : ''}>${esc(p.name)}${p.status === 'approved' ? '' : ' (draft)'}</option>`).join('');
  return `<div class="card"><div class="label">Request produksi baru</div>
    <form id="fx-form">
      <div class="fx-grid">
        <div><label class="label" for="fx-product">Produk</label>
          <select id="fx-product" name="product_id"><option value="">Pilih produk…</option>${opts}<option value="__new">+ Produk baru</option></select>
          <button type="button" class="ghost small" id="fx-edit-product" ${f.product_id ? '' : 'hidden'}>Edit profil</button></div>
        <div><label class="label" for="fx-target">Target video (1–20.000)</label>
          <input id="fx-target" name="target" type="number" min="1" max="20000" value="${esc(f.target)}"></div>
      </div>
      <div class="label">CTA</div>
      <div class="fx-radios">${Object.entries(CTA).map(([k, v]) => `<label><input type="radio" name="cta" value="${k}" ${f.cta === k ? 'checked' : ''}> ${v}</label>`).join('')}</div>
      <label class="label" for="fx-footage">Link folder Drive footage</label>
      <input id="fx-footage" name="footage_url" type="url" placeholder="https://drive.google.com/drive/folders/…" value="${esc(f.footage_url)}">
      <div class="hint">Share folder ke bayucakrasentama@gmail.com dulu.</div>
      <div class="hint" id="fx-est"></div>
      <div class="btn-row"><button type="submit" class="primary">Antrekan produksi</button></div>
    </form></div>`;
}

function updateEstimate() {
  const t = Number($('#fx-target')?.value) || 0;
  const el = $('#fx-est');
  if (el) el.textContent = t > 0 ? `Perkiraan durasi ${fmtDur(t * 23)} · ruang ${fmtSize(t * 18)}` : '';
}

function actionsFor(j) {
  const b = (a, label, cls = 'ghost small') => `<button class="${cls}" data-fx-act="${a}" data-id="${esc(j.id)}">${label}</button>`;
  const out = [];
  if (['antre', 'menyiapkan', 'produksi'].includes(j.status)) out.push(b('pause', 'Jeda'));
  if (j.status === 'dijeda') out.push(b('resume', 'Lanjut'));
  if (['antre', 'menyiapkan', 'produksi', 'dijeda', 'menunggu_profil'].includes(j.status)) out.push(b('cancel', 'Batalkan'));
  if (j.status === 'gagal') out.push(b('retry', 'Coba lagi'));
  if (isAdmin() && ['antre', 'dijeda'].includes(j.status)) out.push(b('prio', '▲ Prioritas'));
  return out.join(' ');
}

function jobsCard() {
  if (!jobs.length) return '<div class="card"><div class="label">Request produksi</div><div class="empty">Belum ada request.</div></div>';
  const rows = jobs.map((j) => {
    const [label, cls] = STATUS[j.status] || [j.status, 'info'];
    const target = Number(j.target) || 0;
    const pct = target ? Math.min(100, Math.round(((j.done || 0) / target) * 100)) : 0;
    return `<tr>
      <td><b>${esc(j.product_name || j.product_id)}</b>${j.queue_position ? `<div class="hint">Antrean #${esc(j.queue_position)}</div>` : ''}</td>
      <td>${num(target)}</td><td>${esc(CTA[j.cta] || j.cta)}</td>
      <td><span class="pill ${cls}">${esc(label)}</span></td>
      <td class="fx-prog"><div class="fx-bar"><i style="width:${pct}%"></i></div><span class="hint">${num(j.done)}/${num(target)}${j.failed ? ` · gagal ${num(j.failed)}` : ''}</span></td>
      <td>${esc(fmtEta(j.eta_at))}</td>
      <td>${j.drive_url ? (String(j.drive_url).startsWith('https://') ? `<a href="${esc(j.drive_url)}" target="_blank" rel="noopener">Drive</a>` : esc(j.drive_url)) : '–'}</td>
      <td class="fx-msg">${esc(j.message || '')}</td>
      <td class="fx-acts">${actionsFor(j)}</td></tr>`;
  }).join('');
  return `<div class="card"><div class="label">Request produksi</div><div class="table-wrap"><table class="data">
    <thead><tr><th>Produk</th><th>Target</th><th>CTA</th><th>Status</th><th>Progres</th><th>ETA</th><th>Drive</th><th>Pesan</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

function draw() {
  const v = viewEl();
  if (!v) return;
  v.innerHTML = `<div class="head"><h2>Motion Factory</h2><div class="hint">Produksi video massal otomatis di Mac mini.</div></div>
    <div id="fx-top">${agentCard()}</div><div id="fx-formwrap">${formCard()}</div><div id="fx-jobs">${jobsCard()}</div>`;
  updateEstimate();
}

// Refresh berkala hanya mengganti kartu status & tabel, supaya isian form tidak hilang.
function redrawLive() {
  if ($('#fx-top')) $('#fx-top').innerHTML = agentCard();
  if ($('#fx-jobs')) $('#fx-jobs').innerHTML = jobsCard();
}

function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
function startTimer() {
  stopTimer();
  timer = setInterval(async () => {
    if (!viewEl()?.classList.contains('active')) { stopTimer(); return; }
    if (!$('#modal').hidden) return;
    try { await loadAll(); redrawLive(); } catch { /* coba lagi di putaran berikut */ }
  }, 15000);
}

S.viewHooks.factory = async () => {
  const v = viewEl();
  if (!v) return;
  if (!v.innerHTML.trim()) v.innerHTML = '<div class="spinner"></div>';
  try { await loadAll(); draw(); startTimer(); } catch (ex) { toast(ex.message); }
};

function readForm() {
  const f = $('#fx-form');
  if (!f) return;
  formState = { product_id: f.product_id.value === '__new' ? '' : f.product_id.value, target: f.target.value, cta: f.cta.value || 'kerkun', footage_url: f.footage_url.value };
}

// ---------- Aksi ----------
document.addEventListener('change', (e) => {
  if (e.target.id === 'fx-product') {
    const val = e.target.value;
    readForm();
    if (val === '__new') { e.target.value = ''; openProfile(null); } else $('#fx-edit-product').hidden = !val;
  }
});
document.addEventListener('input', (e) => { if (e.target.id === 'fx-target') updateEstimate(); });

document.addEventListener('click', async (e) => {
  const v = viewEl();
  if (!v || !v.contains(e.target)) return;
  if (e.target.id === 'fx-edit-product') { readForm(); const p = products.find((x) => String(x.id) === String(formState.product_id)); if (p) openProfile(p); return; }
  const btn = e.target.closest('[data-fx-act]');
  if (!btn) return;
  const { fxAct: act, id } = btn.dataset;
  if (act === 'cancel' && !confirm('Batalkan request ini?')) return;
  btn.disabled = true;
  try {
    if (act === 'prio') {
      const j = jobs.find((x) => String(x.id) === String(id));
      await api(`/api/factory/jobs/${id}/priority`, json('POST', { priority: (Number(j?.priority) || 0) + 1 }));
    } else await api(`/api/factory/jobs/${id}/${act}`, { method: 'POST' });
  } catch (ex) { toast(ex.message); }
  try { await loadAll(); redrawLive(); } catch (ex) { toast(ex.message); }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'fx-form') return;
  e.preventDefault();
  readForm();
  const f = formState;
  const target = Number(f.target);
  if (!f.product_id) return toast('Pilih produk dulu');
  if (!Number.isInteger(target) || target < 1 || target > 20000) return toast('Target harus 1–20.000');
  if (!f.footage_url.trim()) return toast('Link folder Drive footage wajib diisi');
  const sbtn = e.target.querySelector('button[type=submit]');
  sbtn.disabled = true;
  try {
    await api('/api/factory/jobs', json('POST', { product_id: f.product_id, target, cta: f.cta, footage_url: f.footage_url.trim() }));
    toast('Request masuk antrean');
    await loadAll(); redrawLive();
  } catch (ex) { toast(ex.message); }
  sbtn.disabled = false;
});

// ---------- Modal profil produk ----------
let editing = null; // produk yang sedang diedit (null = baru)
let imgs = { product_image: '', label_image: '' };

function profileModal() {
  const p = editing;
  const prof = p?.profile || {};
  const base = `<div class="fx-grid">
    <div><label class="label">Nama produk</label><input id="fxp-name" value="${esc(p?.name || '')}" ${p ? 'disabled' : ''}></div>
    <div><label class="label">Kategori</label><input id="fxp-cat" value="${esc(prof.story?.category || '')}" ${p ? 'disabled' : ''} placeholder="mis. madu, skincare"></div></div>
    <label class="label">Klaim resmi di label</label><textarea id="fxp-claim" rows="2" ${p ? 'disabled' : ''}>${esc(prof.official_claim || '')}</textarea>
    <label class="label">Catatan (opsional)</label><textarea id="fxp-notes" rows="2" ${p ? 'disabled' : ''}>${esc(prof.notes || '')}</textarea>
    <div class="fx-grid">
      ${['product_image:Foto produk', 'label_image:Foto label'].map((s) => { const [k, l] = s.split(':'); return `<div><label class="label">${l}</label>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-fx-up="${k}">
        <div class="fx-thumb" id="fxp-${k}">${imgs[k] ? `<img src="${esc(imgs[k])}" alt="">` : '<span class="hint">Belum ada</span>'}</div></div>`; }).join('')}
    </div>`;
  const editor = p ? `<div class="label">Profil (satu item per baris)</div>
    ${LIST_FIELDS.map(([path, label]) => `<label class="label">${label}</label><textarea rows="4" data-fx-list="${path}">${esc((getPath(prof, path) || []).join('\n'))}</textarea>`).join('')}` : '';
  return `<h3>${p ? `Profil: ${esc(p.name)}` : 'Produk baru'} ${p ? `<span class="pill ${p.status === 'approved' ? 'ok' : 'warn'}">${p.status === 'approved' ? 'Disetujui' : 'Draft'}</span>` : ''}</h3>
    ${base}${editor}
    <div class="btn-row">
      <button class="ghost" data-close>Tutup</button>
      ${p ? `<button class="ghost" id="fxp-ai">Susun pakai AI</button><button class="primary" id="fxp-save">Simpan profil</button>${isAdmin() ? '<button class="primary" id="fxp-approve">Setujui profil</button>' : ''}`
        : '<button class="primary" id="fxp-create">Buat produk</button>'}
    </div>`;
}

function openProfile(p) {
  editing = p;
  imgs = { product_image: p?.product_image || '', label_image: p?.label_image || '' };
  openModal(`<div class="fx-modal">${profileModal()}</div>`);
}

function collectProfile() {
  const prof = JSON.parse(JSON.stringify(editing.profile || {}));
  document.querySelectorAll('#modal-box [data-fx-list]').forEach((t) => {
    setPath(prof, t.dataset.fxList, t.value.split('\n').map((s) => s.trim()).filter(Boolean));
  });
  return prof;
}

function upsert(product) {
  const i = products.findIndex((x) => String(x.id) === String(product.id));
  if (i >= 0) products[i] = product; else products.push(product);
  editing = product;
}
function refreshAfterProduct(product) {
  upsert(product);
  formState.product_id = String(product.id);
  readFormSafe();
  const w = $('#fx-formwrap');
  if (w) { w.innerHTML = formCard(); updateEstimate(); }
}
const readFormSafe = () => { /* formState sudah diisi; tidak membaca DOM lama */ };

document.addEventListener('change', async (e) => {
  const inp = e.target.closest?.('[data-fx-up]');
  if (!inp || !inp.files?.[0]) return;
  const k = inp.dataset.fxUp;
  const fd = new FormData();
  fd.append('file', inp.files[0]);
  try {
    const r = await api('/api/factory/upload', { method: 'POST', body: fd });
    imgs[k] = r.url;
    $(`#fxp-${k}`).innerHTML = `<img src="${esc(r.url)}" alt="">`;
    if (editing) { upsert(await api(`/api/factory/products/${editing.id}`, json('PUT', { profile: collectProfile(), [k]: r.url })).then((x) => x.product)); }
    toast('Foto terunggah');
  } catch (ex) { toast(ex.message); }
});

document.addEventListener('click', async (e) => {
  const id = e.target.id;
  if (!['fxp-create', 'fxp-ai', 'fxp-save', 'fxp-approve'].includes(id)) return;
  const btn = e.target;
  btn.disabled = true;
  try {
    if (id === 'fxp-create') {
      const name = $('#fxp-name').value.trim(), category = $('#fxp-cat').value.trim(), official_claim = $('#fxp-claim').value.trim();
      if (!name || !category || !official_claim) { toast('Nama, kategori, dan klaim label wajib diisi'); btn.disabled = false; return; }
      const body = { name, category, official_claim, notes: $('#fxp-notes').value.trim() };
      if (imgs.product_image) body.product_image = imgs.product_image;
      if (imgs.label_image) body.label_image = imgs.label_image;
      const { product } = await api('/api/factory/products', json('POST', body));
      refreshAfterProduct(product);
      openModal(`<div class="fx-modal">${profileModal()}</div>`);
      toast('Produk dibuat. Susun profil pakai AI atau isi manual.');
    } else if (id === 'fxp-ai') {
      btn.textContent = 'Menyusun…';
      const { product } = await api(`/api/factory/products/${editing.id}/draft`, { method: 'POST' });
      refreshAfterProduct(product);
      openModal(`<div class="fx-modal">${profileModal()}</div>`);
      toast('Profil disusun AI. Periksa lalu simpan.');
    } else if (id === 'fxp-save') {
      const { product } = await api(`/api/factory/products/${editing.id}`, json('PUT', { profile: collectProfile(), product_image: imgs.product_image || undefined, label_image: imgs.label_image || undefined }));
      refreshAfterProduct(product);
      openModal(`<div class="fx-modal">${profileModal()}</div>`);
      toast('Profil disimpan');
    } else if (id === 'fxp-approve') {
      await api(`/api/factory/products/${editing.id}`, json('PUT', { profile: collectProfile() }));
      const { product } = await api(`/api/factory/products/${editing.id}/approve`, { method: 'POST' });
      refreshAfterProduct(product);
      openModal(`<div class="fx-modal">${profileModal()}</div>`);
      toast('Profil disetujui');
      loadAll().then(redrawLive).catch(() => {});
    }
  } catch (ex) { toast(ex.message); if (btn.isConnected) { btn.disabled = false; if (id === 'fxp-ai') btn.textContent = 'Susun pakai AI'; } }
});
