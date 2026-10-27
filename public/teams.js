// Halaman per tim: Scraper TikTok (medsos), Launch Lab (konten), Layanan Pelanggan (CS), dan Laporan per tim.
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel) => document.querySelector(sel);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const num = (n) => (n == null ? '–' : Number(n).toLocaleString('id-ID'));
const compact = (n) => (n == null ? '–' : Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const pct = (v) => (v == null ? '–' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' }) : '–');
const since = (days) => new Date(Date.now() - days * 86400_000).toISOString();
const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const kpis = (items) => `<div class="kpi-row">${items.map((k) => `<div class="kpi"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div>${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>`).join('')}</div>`;
const table = (head, rows, empty = 'Belum ada data.') => (rows.length
  ? `<div class="table-wrap"><table class="data"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  : `<div class="empty">${empty}</div>`);
const manage = () => ['owner', 'admin'].includes(state.me?.user.role);
const myTeam = () => state.me?.user.team || 'semua';
const aiOn = () => !!state.config.ai;
const aiOff = '<span class="hint">AI belum aktif (atur di AI Studio → Pengaturan AI). Bagian ini tetap bisa diisi manual.</span>';

// ======================================================================
// SCRAPER TIKTOK (tim medsos & riset konten)
// ======================================================================
const LABEL_NAME = { sendiri: 'Akun sendiri', pesaing: 'Pesaing', referensi: 'Referensi' };
let ttRows = [];
let ttBusy = false;

function ttShell() {
  $('#view-tiktok').innerHTML = `
    <div class="row-between"><h1>Scraper TikTok</h1>
      <div class="btn-row">
        <select id="tt-filter" aria-label="Filter label"><option value="">Semua label</option>${Object.entries(LABEL_NAME).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <button class="ghost" id="tt-own">Tarik video akun sendiri (API resmi)</button>
        <button class="ghost" id="tt-all">Perbarui semua</button>
        <a class="btn" id="tt-csv">Download CSV</a>
      </div></div>
    <div class="check bad small-note"><b>Catatan:</b> data link akun orang lain diambil lewat layanan pihak ketiga (tikwm), bukan API resmi TikTok.
      Bisa berhenti atau berubah sewaktu-waktu. Video akun sendiri sebaiknya ditarik lewat API resmi (tombol di atas).</div>
    <div class="card">
      <label class="label" for="tt-urls">Tempel link TikTok (boleh banyak, satu per baris)</label>
      <textarea id="tt-urls" rows="3" placeholder="https://vt.tiktok.com/ZSbxqbck5/&#10;https://www.tiktok.com/@akun/video/123..."></textarea>
      <div class="btn-row"><select id="tt-label" aria-label="Label link">${Object.entries(LABEL_NAME).map(([k, v]) => `<option value="${k}" ${k === 'referensi' ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="primary" id="tt-add">Tambah & ambil data</button></div>
      <div id="tt-progress" class="hint"></div>
    </div>
    <div id="tt-kpis"></div>
    <div class="card"><div id="tt-table" class="table-wrap"></div></div>`;
  $('#tt-add').addEventListener('click', ttAdd);
  $('#tt-all').addEventListener('click', () => ttRefresh(ttRows.filter((r) => r.source === 'tikwm')));
  $('#tt-own').addEventListener('click', ttOwn);
  $('#tt-filter').addEventListener('change', ttLoad);
  $('#tt-table').addEventListener('click', ttAction);
  $('#tt-table').addEventListener('change', async (e) => {
    const id = Number(e.target.dataset.ttLabel);
    if (!id) return;
    await api(`/api/tiktok/${id}`, json('PATCH', { label: e.target.value })).catch((ex) => toast(ex.message));
    ttLoad();
  });
}

async function ttLoad() {
  const label = $('#tt-filter').value;
  ttRows = await api(`/api/tiktok${label ? `?label=${label}` : ''}`);
  $('#tt-csv').href = `/api/tiktok/export.csv?brand=${state.brandId}`;
  const withViews = ttRows.filter((r) => r.views != null);
  const totalViews = withViews.reduce((a, r) => a + r.views, 0);
  const eng = withViews.reduce((a, r) => a + (r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.saves || 0), 0);
  $('#tt-kpis').innerHTML = kpis([
    { label: 'Video dipantau', value: num(ttRows.length), sub: `${ttRows.filter((r) => r.error).length} gagal diambil` },
    { label: 'Total views', value: compact(totalViews) },
    { label: 'Rata-rata views', value: compact(withViews.length ? totalViews / withViews.length : null) },
    { label: 'ER rata-rata', value: pct(totalViews ? eng / totalViews : null), sub: '(like+komen+share+save)/views' },
  ]);
  $('#tt-table').innerHTML = ttRows.length ? `<table class="data tt"><thead><tr><th></th><th>Akun & caption</th><th>Upload</th><th>Durasi</th><th>Views</th><th>Like</th><th>Komen</th><th>Share</th><th>Save</th><th>ER</th><th>Label</th><th>Update</th><th></th></tr></thead><tbody>
    ${ttRows.map((r) => `<tr>
      <td>${r.thumbnail_url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener"><img class="tt-thumb" src="${esc(r.thumbnail_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>` : ''}</td>
      <td class="tt-cap"><a href="${esc(r.url)}" target="_blank" rel="noopener"><b>@${esc(r.username || '?')}</b></a>
        <span class="src ${r.source === 'official' ? 'src-api' : ''}">${r.source === 'official' ? 'Resmi' : 'Pihak ketiga'}</span>
        <div>${esc(String(r.caption || '').replace(/\*\*/g, '').slice(0, 110))}</div>${r.music ? `<div class="hint">♫ ${esc(r.music)}</div>` : ''}${r.error ? `<div class="error-inline">${esc(r.error)}</div>` : ''}</td>
      <td>${day(r.posted_at)}</td><td>${r.duration ? `${r.duration}s` : '–'}</td>
      <td><b>${num(r.views)}</b></td><td>${num(r.likes)}</td><td>${num(r.comments)}</td><td>${num(r.shares)}</td><td>${num(r.saves)}</td><td>${pct(r.er)}</td>
      <td><select data-tt-label="${r.id}" aria-label="Label">${Object.entries(LABEL_NAME).map(([k, v]) => `<option value="${k}" ${k === r.label ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td class="hint">${r.updated_at ? new Date(r.updated_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : 'belum'}</td>
      <td class="tt-act">${r.source === 'tikwm' ? `<button class="ghost small" data-tt-refresh="${r.id}" title="Perbarui">↻</button>` : ''}
        ${r.video_url ? `<a class="btn small" href="${esc(r.video_url)}" target="_blank" rel="noopener" title="Video (link sementara)">⬇</a>` : ''}
        <button class="ghost small" data-tt-idea="${r.id}" title="Jadikan referensi di Planner">+ Ide</button>
        <button class="asset-del static" data-tt-del="${r.id}" aria-label="Hapus">✕</button></td></tr>`).join('')}
  </tbody></table>` : '<div class="empty">Belum ada link. Tempel link TikTok di atas.</div>';
}

async function ttRefresh(rows) {
  if (ttBusy || !rows.length) return;
  ttBusy = true;
  for (const [i, r] of rows.entries()) {
    $('#tt-progress').textContent = `Mengambil data ${i + 1}/${rows.length}…`;
    await api(`/api/tiktok/${r.id}/refresh`, { method: 'POST' }).catch(() => {});
    if (i < rows.length - 1) await new Promise((res) => setTimeout(res, 1100)); // layanan gratis: ±1 permintaan/detik
  }
  ttBusy = false;
  $('#tt-progress').textContent = `Selesai. ${rows.length} link diperbarui. Selanjutnya diperbarui otomatis tiap 6 jam.`;
  ttLoad();
}

async function ttAdd() {
  try {
    const r = await api('/api/tiktok', json('POST', { urls: $('#tt-urls').value, label: $('#tt-label').value }));
    $('#tt-urls').value = '';
    toast(`${r.added.length} link ditambah${r.skipped ? `, ${r.skipped} dilewati (dobel/sudah ada)` : ''}`);
    await ttLoad();
    ttRefresh(r.added);
  } catch (ex) { toast(ex.message); }
}

async function ttOwn() {
  $('#tt-progress').textContent = 'Menarik video akun sendiri lewat API resmi TikTok…';
  try {
    const r = await api('/api/tiktok/own', { method: 'POST' });
    $('#tt-progress').textContent = `${r.imported} video akun sendiri diperbarui.${r.errors.length ? ` Gagal: ${r.errors.join(' · ')}` : ''}`;
    ttLoad();
  } catch (ex) { $('#tt-progress').textContent = ex.message; }
}

async function ttAction(e) {
  const t = e.target.dataset;
  if (t.ttRefresh) ttRefresh([{ id: Number(t.ttRefresh) }]);
  if (t.ttDel && confirm('Hapus link ini dari daftar?')) {
    await api(`/api/tiktok/${t.ttDel}`, { method: 'DELETE' });
    ttLoad();
  }
  if (t.ttIdea) {
    const r = ttRows.find((x) => x.id === Number(t.ttIdea));
    try {
      await api('/api/content', json('POST', {
        title: `Bikin versi kita: ${String(r.caption || '').slice(0, 60) || `@${r.username}`}`, status: 'ide', format: 'Video pendek', platforms: ['tiktok'],
        notes: `Referensi TikTok @${r.username}: ${r.url}\n${num(r.views)} views · ER ${pct(r.er)}${r.music ? ` · musik: ${r.music}` : ''}\n\nCaption asli:\n${r.caption || ''}`,
      }));
      toast('Masuk ke Planner (kolom Ide)');
    } catch (ex) { toast(ex.message); }
  }
}

S.viewHooks.tiktok = () => {
  if (!$('#tt-table')) ttShell();
  ttLoad().catch((ex) => toast(ex.message));
};

// ======================================================================
// LAUNCH LAB (tim konten): riset -> brand -> copy -> visual -> landing -> mentor
// ======================================================================
const STEPS = [['research', '1. Riset'], ['brand', '2. Brand & angle'], ['copy', '3. Copy'], ['visual', '4. Visual'], ['landing', '5. Landing page'], ['mentor', 'AI Mentor']];
let lp = null; // proyek yang dibuka
let lpStep = 'research';
let mentorLog = [];

async function launchList() {
  const items = await api('/api/launch');
  $('#view-launch').innerHTML = `
    <div class="row-between"><h1>Launch Lab</h1><button class="primary" id="lp-new">+ Proyek baru</button></div>
    <p class="hint">Dari 1 ide sampai produk siap dijual: riset & validasi → brand & angle → copy (hook, script, iklan, caption) → brief visual → landing page → AI mentor.
      Hook & script bisa langsung dikirim ke Planner, visual dibikin di Studio Visual / Video Motion.</p>
    <div class="lp-grid">${items.map((p) => `<button class="card lp-card" data-lp-open="${p.id}">
      <b>${esc(p.name)}</b><span class="hint">${esc(p.niche || '')}</span>
      <span class="tag">${esc(p.stage)}</span>${p.published ? ` <span class="tag ghost">terbit: /lp/${esc(p.slug)}</span>` : ''}</button>`).join('') || '<div class="empty">Belum ada proyek.</div>'}</div>`;
  $('#lp-new').addEventListener('click', () => {
    openModal(`<form id="lp-form"><h3>Proyek baru</h3>
      <label class="label" for="lp-name">Nama produk / proyek</label><input id="lp-name" required placeholder="mis. HargaPas">
      <label class="label" for="lp-niche">Ide / niche</label><textarea id="lp-niche" rows="2" placeholder="mis. kalkulator harga jual buat seller online"></textarea>
      <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Buat</button></div></form>`);
    $('#lp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const p = await api('/api/launch', json('POST', { name: $('#lp-name').value, niche: $('#lp-niche').value }));
        closeModal();
        openProject(p.id);
      } catch (ex) { toast(ex.message); }
    });
  });
}

async function openProject(id) {
  lp = await api(`/api/launch/${id}`);
  mentorLog = [];
  lpStep = { riset: 'research', brand: 'brand', copy: 'copy', visual: 'visual', landing: 'landing', launch: 'landing' }[lp.stage] || 'research';
  drawProject();
}

function drawProject() {
  const d = lp.data;
  $('#view-launch').innerHTML = `
    <div class="row-between"><div><button class="link" id="lp-back">← Semua proyek</button><h1>${esc(lp.name)}</h1><div class="hint">${esc(lp.niche || '')}</div></div>
      <div class="btn-row">${lp.published ? `<a class="btn" href="/lp/${esc(lp.slug)}" target="_blank" rel="noopener">Landing page live ↗</a>` : ''}
        <button class="danger small" id="lp-del">Hapus proyek</button></div></div>
    <div class="tabs" id="lp-steps">${STEPS.map(([k, l]) => `<button data-step="${k}" class="${k === lpStep ? 'active' : ''}">${l}${k !== 'mentor' && d[k] && Object.keys(d[k]).length ? ' ✓' : ''}</button>`).join('')}</div>
    <div class="card" id="lp-body"></div>`;
  $('#lp-back').addEventListener('click', launchList);
  $('#lp-del').addEventListener('click', async () => {
    if (!confirm(`Hapus proyek "${lp.name}" beserta landing page-nya?`)) return;
    await api(`/api/launch/${lp.id}`, { method: 'DELETE' });
    launchList();
  });
  $('#lp-steps').addEventListener('click', (e) => { if (e.target.dataset.step) { lpStep = e.target.dataset.step; drawProject(); } });
  ({ research: drawResearch, brand: drawBrand, copy: drawCopy, visual: drawVisual, landing: drawLanding, mentor: drawMentor })[lpStep]();
}

const aiButton = (step, label) => `<button class="primary" data-lp-ai="${step}" ${aiOn() ? '' : 'disabled'}>✨ ${label}</button> ${aiOn() ? '' : aiOff}`;
async function runAi(step, body = {}) {
  const btn = document.querySelector(`[data-lp-ai="${step}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'AI lagi kerja… (bisa 30–90 detik)'; }
  try {
    lp = await api(`/api/launch/${lp.id}/ai/${step}`, json('POST', body));
    drawProject();
  } catch (ex) {
    toast(ex.message);
    if (btn) { btn.disabled = false; btn.textContent = '✨ Coba lagi'; }
  }
}
async function saveSection(section, value, msg = 'Tersimpan') {
  lp = await api(`/api/launch/${lp.id}`, json('PATCH', { [section]: value }));
  toast(msg);
}
document.addEventListener('click', (e) => {
  const step = e.target.dataset?.lpAi;
  if (step) runAi(step, step === 'research' ? { idea: $('#lp-idea')?.value } : {});
  const open = e.target.closest?.('[data-lp-open]');
  if (open) openProject(Number(open.dataset.lpOpen));
});

function drawResearch() {
  const r = lp.data.research || {};
  const concepts = r.concepts || [];
  $('#lp-body').innerHTML = `
    <label class="label" for="lp-idea">Ide yang mau divalidasi</label>
    <input id="lp-idea" value="${esc(r.idea || lp.niche || '')}">
    <div class="btn-row left">${aiButton('research', 'Riset pasar & 5 konsep (pakai pencarian web)')}</div>
    ${r.summary ? `<p>${esc(r.summary)}</p>` : ''}
    <div class="concepts">${concepts.map((c, i) => `<label class="concept ${i === (r.chosen ?? 0) ? 'on' : ''}">
      <input type="radio" name="lp-chosen" value="${i}" ${i === (r.chosen ?? 0) ? 'checked' : ''}>
      <div class="row-between"><b>${esc(c.name)}</b><span class="score" title="Skor permintaan">${c.demand_score ?? '–'}</span></div>
      <div>${esc(c.description)}</div><div class="hint">${esc(c.format || '')} · ${esc(c.price || '')} · ${esc(c.audience || '')}</div>
      ${c.why ? `<div class="hint">${esc(c.why)}</div>` : ''}
      ${(c.evidence || []).map((ev) => `<div class="evidence">↳ ${esc(ev.source)}: ${esc(ev.note)} ${/^https?:/.test(ev.url || '') ? `<a href="${esc(ev.url)}" target="_blank" rel="noopener">sumber</a>` : ''}</div>`).join('')}
    </label>`).join('')}</div>
    <details class="manual"><summary>+ Tambah konsep manual</summary>
      <div class="form-grid"><input id="lc-name" placeholder="Nama konsep"><input id="lc-price" placeholder="Harga (mis. Rp79rb)">
      <input id="lc-format" placeholder="Format (ebook, tool, fisik…)"><input id="lc-aud" placeholder="Target pembeli"></div>
      <textarea id="lc-desc" rows="2" placeholder="Deskripsi singkat"></textarea><button class="ghost" id="lc-add">Tambah</button></details>`;
  document.querySelectorAll('[name=lp-chosen]').forEach((x) => x.addEventListener('change', () => saveSection('research', { chosen: Number(x.value) }, 'Konsep dipilih').then(drawProject)));
  $('#lp-idea').addEventListener('change', () => saveSection('research', { idea: $('#lp-idea').value }));
  $('#lc-add').addEventListener('click', async () => {
    if (!$('#lc-name').value.trim()) return toast('Isi nama konsep');
    const c = { name: $('#lc-name').value, description: $('#lc-desc').value, price: $('#lc-price').value, format: $('#lc-format').value, audience: $('#lc-aud').value, demand_score: null, evidence: [] };
    await saveSection('research', { concepts: [...concepts, c] }, 'Konsep ditambah');
    drawProject();
  });
}

function drawBrand() {
  const b = lp.data.brand || {};
  $('#lp-body').innerHTML = `
    <div class="btn-row left">${aiButton('brand', 'Bikin brand, palet & angle')}</div>
    <div class="form-grid">
      <div class="span-2"><label class="label" for="lb-names">Usulan nama (satu per baris, baris pertama dipakai)</label><textarea id="lb-names" rows="3">${esc((b.names || []).join('\n'))}</textarea></div>
      <div class="span-2"><label class="label" for="lb-tag">Tagline</label><input id="lb-tag" value="${esc(b.tagline || '')}"></div>
      <div class="span-2"><label class="label" for="lb-pos">Positioning</label><input id="lb-pos" value="${esc(b.positioning || '')}"></div>
      <div class="span-2"><label class="label" for="lb-tone">Tone bahasa</label><input id="lb-tone" value="${esc(b.tone || '')}"></div>
    </div>
    <div class="label">Palet warna</div>
    <div class="palette" id="lb-pal">${(b.palette?.length ? b.palette : [{ role: 'primary', hex: '#7c3aed' }, { role: 'accent', hex: '#f59e0b' }]).map((c) => `<label class="swatch"><input type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#888888')}" data-role="${esc(c.role)}"><span>${esc(c.role)}</span></label>`).join('')}</div>
    <label class="label" for="lb-angles">Angle jualan (satu per baris: angle | alasan)</label>
    <textarea id="lb-angles" rows="5">${esc((b.angles || []).map((x) => `${x.angle} | ${x.why || ''}`).join('\n'))}</textarea>
    <button class="primary" id="lb-save">Simpan</button>`;
  $('#lb-save').addEventListener('click', () => saveSection('brand', {
    names: lines($('#lb-names').value), tagline: $('#lb-tag').value, positioning: $('#lb-pos').value, tone: $('#lb-tone').value,
    palette: [...document.querySelectorAll('#lb-pal input')].map((x) => ({ role: x.dataset.role, hex: x.value })),
    angles: lines($('#lb-angles').value).map((l) => { const [angle, why = ''] = l.split('|').map((x) => x.trim()); return { angle, why, hook_example: '' }; }),
  }).then(drawProject));
}

function drawCopy() {
  const c = lp.data.copy || {};
  const scripts = c.scripts || [];
  $('#lp-body').innerHTML = `
    <div class="btn-row left">${aiButton('copy', 'Tulis 20 hook, 5 script, 6 iklan, 6 caption')}</div>
    <div class="grid-2">
      <div><label class="label" for="lcp-hooks">Hook (satu per baris)</label><textarea id="lcp-hooks" rows="10">${esc((c.hooks || []).join('\n'))}</textarea></div>
      <div><label class="label" for="lcp-caps">Caption (pisahkan dengan baris kosong)</label><textarea id="lcp-caps" rows="10">${esc((c.captions || []).join('\n\n'))}</textarea></div>
    </div>
    <div class="label">Script video (${scripts.length})</div>
    ${scripts.map((sc, i) => `<details class="manual"><summary><input type="checkbox" data-script="${i}" aria-label="Pilih script ${i + 1}"> ${esc(sc.title)} <span class="hint">${esc(sc.duration || '')}</span></summary>
      <p><b>Hook:</b> ${esc(sc.hook)}</p><pre class="script">${esc(sc.body)}</pre><p><b>CTA:</b> ${esc(sc.cta)}</p></details>`).join('') || '<p class="hint">Belum ada script.</p>'}
    ${(c.ads || []).length ? `<div class="label">Iklan Meta</div>${table(['Headline', 'Primary text', 'CTA'], c.ads.map((x) => [esc(x.headline), esc(x.primary_text), esc(x.cta)]))}` : ''}
    <div class="btn-row left"><button class="primary" id="lcp-save">Simpan</button>
      <button class="ghost" id="lcp-planner">Kirim hook & script terpilih ke Planner</button></div>
    <p class="hint">Hook dikirim semua (1 kartu per hook) kalau tidak ada script yang dicentang.</p>`;
  $('#lcp-save').addEventListener('click', () => saveSection('copy', { hooks: lines($('#lcp-hooks').value), captions: $('#lcp-caps').value.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean) }));
  $('#lcp-planner').addEventListener('click', async () => {
    const picked = [...document.querySelectorAll('[data-script]:checked')].map((x) => scripts[Number(x.dataset.script)]);
    const items = picked.length
      ? picked.map((sc) => ({ title: sc.title, hook: sc.hook, script: `${sc.body}\n\nCTA: ${sc.cta}`, format: 'Reels' }))
      : lines($('#lcp-hooks').value).slice(0, 20).map((h, i) => ({ title: `${lp.name}: hook ${i + 1}`, hook: h, format: 'Video pendek' }));
    if (!items.length) return toast('Belum ada hook/script');
    try {
      await api(`/api/launch/${lp.id}/to-planner`, json('POST', { items }));
      toast(`${items.length} kartu masuk ke Planner (kolom Ide)`);
    } catch (ex) { toast(ex.message); }
  });
}

function drawVisual() {
  const d = lp.data;
  const c = d.research?.concepts?.[d.research?.chosen ?? 0];
  const auto = [
    `Produk: ${d.brand?.names?.[0] || lp.name}${c ? ` (${c.format}, ${c.price})` : ''}`,
    d.brand?.tagline && `Tagline: ${d.brand.tagline}`,
    d.brand?.tone && `Tone: ${d.brand.tone}`,
    d.brand?.palette?.length && `Warna: ${d.brand.palette.map((x) => `${x.role} ${x.hex}`).join(', ')}`,
    c?.audience && `Target: ${c.audience}`,
    d.copy?.hooks?.[0] && `Headline/hook utama: ${d.copy.hooks[0]}`,
  ].filter(Boolean).join('\n');
  $('#lp-body').innerHTML = `
    <p>Brief ini dipakai buat bikin cover, iklan gambar, logo, dan mockup di <b>Studio Visual</b>, serta video di <b>Video Motion</b>.</p>
    <textarea id="lv-brief" rows="8">${esc(d.visual?.brief || auto)}</textarea>
    <div class="btn-row left"><button class="ghost" id="lv-copy">Salin brief</button><button class="ghost" id="lv-save">Simpan</button>
      <button class="primary" data-goto="studio">Buka Studio Visual →</button><button class="ghost" data-goto="motion">Buka Video Motion →</button></div>
    <p class="hint">Avatar AI ngomong (video tanpa nongol muka) butuh layanan video AI berbayar terpisah. Belum termasuk di TIM-AI.</p>`;
  $('#lv-copy').addEventListener('click', () => navigator.clipboard?.writeText($('#lv-brief').value).then(() => toast('Brief disalin')));
  $('#lv-save').addEventListener('click', () => saveSection('visual', { brief: $('#lv-brief').value }));
}

function drawLanding() {
  const L = lp.data.landing || {};
  const pairs = (arr, a, b) => (arr || []).map((x) => `${x[a]} | ${x[b]}`).join('\n');
  $('#lp-body').innerHTML = `
    <div class="btn-row left">${aiButton('landing', 'Susun isi landing page')}
      <a class="btn" href="/api/launch/${lp.id}/preview?brand=${state.brandId}" target="_blank" rel="noopener">Pratinjau ↗</a></div>
    <div class="form-grid">
      <div class="span-2"><label class="label" for="ll-h">Headline</label><input id="ll-h" value="${esc(L.headline || '')}"></div>
      <div class="span-2"><label class="label" for="ll-sh">Subheadline</label><input id="ll-sh" value="${esc(L.subheadline || '')}"></div>
      <div class="span-2"><label class="label" for="ll-pr">Masalah calon pembeli (satu per baris)</label><textarea id="ll-pr" rows="3">${esc((L.problems || []).join('\n'))}</textarea></div>
      <div class="span-2"><label class="label" for="ll-so">Solusi</label><textarea id="ll-so" rows="2">${esc(L.solution || '')}</textarea></div>
      <div class="span-2"><label class="label" for="ll-be">Manfaat (satu per baris: judul | penjelasan)</label><textarea id="ll-be" rows="4">${esc(pairs(L.benefits, 'title', 'desc'))}</textarea></div>
      <div><label class="label" for="ll-price">Harga</label><input id="ll-price" value="${esc(L.offer?.price || '')}"></div>
      <div><label class="label" for="ll-strike">Harga coret</label><input id="ll-strike" value="${esc(L.offer?.strike_price || '')}"></div>
      <div class="span-2"><label class="label" for="ll-bonus">Bonus (satu per baris)</label><textarea id="ll-bonus" rows="2">${esc((L.offer?.bonuses || []).join('\n'))}</textarea></div>
      <div class="span-2"><label class="label" for="ll-gar">Garansi</label><input id="ll-gar" value="${esc(L.offer?.guarantee || '')}"></div>
      <div class="span-2"><label class="label" for="ll-faq">FAQ (satu per baris: pertanyaan | jawaban)</label><textarea id="ll-faq" rows="4">${esc(pairs(L.faq, 'q', 'a'))}</textarea></div>
      <div><label class="label" for="ll-cta">Teks tombol</label><input id="ll-cta" value="${esc(L.cta_text || '')}"></div>
      <div><label class="label" for="ll-url">Link checkout (Scalev/Mayar/WA)</label><input id="ll-url" value="${esc(L.cta_url || '')}" placeholder="https://"></div>
    </div>
    <button class="primary" id="ll-save">Simpan</button>
    <div class="card inset"><div class="label">Publikasikan</div>
      <div class="btn-row left"><span class="hint">${location.origin}/lp/</span><input id="ll-slug" class="inline-input" value="${esc(lp.slug || lp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">
        <button class="primary" id="ll-pub">${lp.published ? 'Perbarui alamat' : 'Terbitkan'}</button>
        ${lp.published ? '<button class="ghost" id="ll-unpub">Tarik dari publik</button>' : ''}</div></div>`;
  const split = (t, a, b) => lines(t).map((l) => { const [x, y = ''] = l.split('|').map((v) => v.trim()); return { [a]: x, [b]: y }; });
  const read = () => ({
    headline: $('#ll-h').value, subheadline: $('#ll-sh').value, problems: lines($('#ll-pr').value), solution: $('#ll-so').value,
    benefits: split($('#ll-be').value, 'title', 'desc'), faq: split($('#ll-faq').value, 'q', 'a'),
    offer: { price: $('#ll-price').value, strike_price: $('#ll-strike').value, bonuses: lines($('#ll-bonus').value), guarantee: $('#ll-gar').value },
    cta_text: $('#ll-cta').value, cta_url: $('#ll-url').value.trim(),
  });
  $('#ll-save').addEventListener('click', () => saveSection('landing', read()));
  $('#ll-pub').addEventListener('click', async () => {
    try {
      await saveSection('landing', read(), 'Tersimpan');
      lp = await api(`/api/launch/${lp.id}/publish`, json('POST', { slug: $('#ll-slug').value }));
      toast(`Live di /lp/${lp.slug}`);
      drawProject();
    } catch (ex) { toast(ex.message); }
  });
  $('#ll-unpub')?.addEventListener('click', async () => {
    lp = await api(`/api/launch/${lp.id}/publish`, json('POST', { publish: false }));
    drawProject();
  });
}

function drawMentor() {
  $('#lp-body').innerHTML = `
    <p class="hint">Tanya strategi Meta Ads, TikTok, marketplace, harga, funnel, atau cara launch. Jawabannya menyesuaikan proyek ini.</p>
    <div class="chat" id="lm-log">${mentorLog.map((m) => `<div class="msg ${m.role}">${esc(m.content).replace(/\n/g, '<br>')}</div>`).join('') || '<p class="hint">Belum ada percakapan.</p>'}</div>
    <form id="lm-form" class="chat-form"><textarea id="lm-q" rows="2" placeholder="mis. Budget iklan Rp100rb/hari, mulai dari mana?" ${aiOn() ? '' : 'disabled'}></textarea>
      <button class="primary" ${aiOn() ? '' : 'disabled'}>Kirim</button></form>${aiOn() ? '' : aiOff}`;
  $('#lm-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#lm-q').value.trim();
    if (!q) return;
    mentorLog.push({ role: 'user', content: q });
    drawMentor();
    try {
      const { answer } = await api(`/api/launch/${lp.id}/mentor`, json('POST', { messages: mentorLog }));
      mentorLog.push({ role: 'assistant', content: answer });
    } catch (ex) { mentorLog.push({ role: 'assistant', content: `⚠ ${ex.message}` }); }
    drawMentor();
  });
}

S.viewHooks.launch = () => (lp ? openProject(lp.id) : launchList()).catch((ex) => toast(ex.message));

// ======================================================================
// LAYANAN PELANGGAN (tim CS)
// ======================================================================
const CH = { shopee: 'Shopee', tokopedia: 'Tokopedia', tiktok: 'TikTok Shop', lazada: 'Lazada', whatsapp: 'WhatsApp', instagram: 'Instagram', lainnya: 'Lainnya' };
const CAT = { pertanyaan: 'Pertanyaan produk', keberatan: 'Keberatan / objection', komplain_produk: 'Komplain produk', pengiriman: 'Pengiriman', retur_refund: 'Retur / refund', pembayaran: 'Pembayaran', follow_up: 'Follow-up', lainnya: 'Lainnya' };
const ST = { baru: 'Baru', diproses: 'Diproses', menunggu: 'Menunggu pelanggan', selesai: 'Selesai' };
const PR = { urgent: 'Urgent (2 jam)', tinggi: 'Tinggi (4 jam)', normal: 'Normal (24 jam)', rendah: 'Rendah (48 jam)' };
const DESTY = 'https://www.desty.chat/chat?platform=0';
let csTab = 'tickets';
let csAssignees = [];
const opts = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v}</option>`).join('');

function csShell() {
  $('#view-cs').innerHTML = `
    <div class="page-head"><div><h1>Tiket &amp; Template</h1>
      <p class="hint">Komplain/retur dicatat sampai selesai dengan batas waktu, template balasan dipakai di Inbox (ketik /), dan impor laporan Desty kalau masih dipakai.</p></div>
      <div class="btn-row"><button class="primary" data-goto="inbox">💬 Buka Inbox</button><a class="btn" href="${DESTY}" target="_blank" rel="noopener">Desty Chat ↗</a></div></div>
    <div class="tabs" id="cs-tabs"><button data-cs="tickets">Tiket</button><button data-cs="objections">Objection Bank (Ctrl+K)</button><button data-cs="followup">Follow-up Generator</button><button data-cs="templates">Template balasan</button><button data-cs="import">Impor laporan Desty</button></div>
    <div id="cs-body"></div>`;
  $('#cs-tabs').addEventListener('click', (e) => { if (e.target.dataset.cs) { csTab = e.target.dataset.cs; csDraw(); } });
}

async function csDraw() {
  document.querySelectorAll('#cs-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.cs === csTab));
  if (csTab === 'tickets') return csTickets();
  if (csTab === 'templates') return csTemplates();
  if (csTab === 'objections') return window.timOps.csObjections($('#cs-body'));
  if (csTab === 'followup') return window.timOps.csFollowup($('#cs-body'));
  return csImport();
}

function slaBadge(t) {
  if (t.status === 'selesai') return `<span class="status st-done">${t.resolved_at && t.resolved_at <= t.due_at ? 'Selesai tepat waktu' : 'Selesai (lewat batas)'}</span>`;
  const left = (new Date(t.due_at) - Date.now()) / 3600_000;
  if (left < 0) return `<span class="status st-failed">Lewat ${Math.ceil(-left)} jam</span>`;
  return `<span class="status ${left < 2 ? 'st-partial' : 'st-scheduled'}">Sisa ${left < 1 ? `${Math.max(1, Math.round(left * 60))} menit` : `${Math.round(left)} jam`}</span>`;
}

async function csTickets() {
  const filter = $('#cs-filter')?.value ?? 'open';
  const [rows, people] = await Promise.all([api(`/api/cs/tickets${filter === 'open' ? '?open=1' : filter ? `?status=${filter}` : ''}`), api('/api/assignees').catch(() => [])]);
if (csTab !== 'tickets') return;
  csAssignees = people;
  const who = (id) => people.find((p) => p.id === id)?.username || '–';
  $('#cs-body').innerHTML = `
    <div class="row-between"><select id="cs-filter" aria-label="Filter tiket"><option value="open" ${filter === 'open' ? 'selected' : ''}>Belum selesai</option><option value="" ${filter === '' ? 'selected' : ''}>Semua</option>${opts(ST, filter)}</select>
      <button class="primary" id="cs-new">+ Tiket baru</button></div>
    <div class="ticket-list">${rows.map((t) => `<div class="ticket card" data-ticket="${t.id}">
      <div class="row-between"><b>${esc(t.customer)}</b>${slaBadge(t)}</div>
      <div class="hint">${CH[t.channel] || t.channel}${t.shop ? ` · ${esc(t.shop)}` : ''}${t.order_id ? ` · #${esc(t.order_id)}` : ''} · ${CAT[t.category] || t.category} · PIC ${esc(who(t.assignee_id))}</div>
      <div>${esc(t.summary || '(tanpa ringkasan)')}</div>
      <div class="btn-row left"><select data-ticket-status="${t.id}" aria-label="Status">${opts(ST, t.status)}</select>
        <button class="ghost small" data-ticket-edit="${t.id}">Edit</button>
        ${t.content_id ? '<span class="tag ghost">sudah jadi ide konten</span>' : `<button class="ghost small" data-ticket-idea="${t.id}">→ Ide konten</button>`}</div>
    </div>`).join('') || '<div class="empty">Tidak ada tiket di filter ini.</div>'}</div>`;
  $('#cs-filter').addEventListener('change', csTickets);
  $('#cs-new').addEventListener('click', () => ticketForm());
  $('#cs-body').onclick = async (e) => {
    const d = e.target.dataset;
    if (d.ticketEdit) ticketForm(rows.find((t) => t.id === Number(d.ticketEdit)));
    if (d.ticketIdea) {
      await api(`/api/cs/tickets/${d.ticketIdea}/to-content`, json('POST', {})).then(() => toast('Masuk ke Planner tim konten (kolom Ide)')).catch((ex) => toast(ex.message));
      csTickets();
    }
  };
  $('#cs-body').onchange = async (e) => {
    const id = e.target.dataset.ticketStatus;
    if (!id) return;
    await api(`/api/cs/tickets/${id}`, json('PATCH', { status: e.target.value })).catch((ex) => toast(ex.message));
    csTickets();
  };
}

function ticketForm(t = null) {
  openModal(`<form id="tk-form"><h3>${t ? 'Edit tiket' : 'Tiket baru'}</h3>
    <div class="form-grid">
      <div><label class="label" for="tk-cust">Pelanggan *</label><input id="tk-cust" name="customer" value="${esc(t?.customer || '')}" required placeholder="username / nama"></div>
      <div><label class="label" for="tk-ch">Kanal</label><select id="tk-ch" name="channel">${opts(CH, t?.channel || 'shopee')}</select></div>
      <div><label class="label" for="tk-shop">Toko</label><input id="tk-shop" name="shop" value="${esc(t?.shop || '')}"></div>
      <div><label class="label" for="tk-order">No. pesanan</label><input id="tk-order" name="order_id" value="${esc(t?.order_id || '')}"></div>
      <div><label class="label" for="tk-prod">Produk</label><input id="tk-prod" name="product" value="${esc(t?.product || '')}"></div>
      <div><label class="label" for="tk-cat">Kategori</label><select id="tk-cat" name="category">${opts(CAT, t?.category || 'pertanyaan')}</select></div>
      <div><label class="label" for="tk-pr">Prioritas (batas waktu)</label><select id="tk-pr" name="priority">${opts(PR, t?.priority || 'normal')}</select></div>
      <div><label class="label" for="tk-who">PIC</label><select id="tk-who" name="assignee_id">${csAssignees.map((p) => `<option value="${p.id}" ${p.id === (t?.assignee_id ?? state.me.user.id) ? 'selected' : ''}>${esc(p.username)}</option>`).join('')}</select></div>
      <div class="span-2"><label class="label" for="tk-sum">Masalah</label><textarea id="tk-sum" name="summary" rows="3">${esc(t?.summary || '')}</textarea></div>
      ${t ? `<div class="span-2"><label class="label" for="tk-res">Penyelesaian</label><textarea id="tk-res" name="resolution" rows="2">${esc(t.resolution || '')}</textarea></div>` : ''}
    </div>
    <div class="modal-actions">${t ? '<button type="button" class="danger" id="tk-del">Hapus</button>' : ''}<button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  $('#modal-box').classList.add('wide');
  $('#tk-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    v.assignee_id = v.assignee_id === '' ? null : Number(v.assignee_id);
    try {
      await api(t ? `/api/cs/tickets/${t.id}` : '/api/cs/tickets', json(t ? 'PATCH' : 'POST', v));
      closeModal();
      csTickets();
    } catch (ex) { toast(ex.message); }
  });
  $('#tk-del')?.addEventListener('click', async () => {
    if (!confirm('Hapus tiket ini?')) return;
    await api(`/api/cs/tickets/${t.id}`, { method: 'DELETE' });
    closeModal();
    csTickets();
  });
}

async function csTemplates() {
  const rows = await api('/api/cs/templates');
  if (csTab !== 'templates') return;
  $('#cs-body').innerHTML = `
    <div class="row-between"><p class="hint">Klik <b>Salin</b> lalu tempel di Desty Chat. Template yang sering dipakai bisa juga disimpan di Desty → Pengaturan → Template Chat.</p>
      <button class="primary" id="tp-new">+ Template</button></div>
    ${Object.entries(CAT).map(([k, label]) => {
    const list = rows.filter((r) => r.category === k);
    return list.length ? `<div class="label">${label}</div><div class="tpl-grid">${list.map((r) => `<div class="card tpl">
      <div class="row-between"><b>${esc(r.title)}</b><span class="hint">dipakai ${r.uses}×</span></div>
      <pre class="script">${esc(r.body)}</pre>
      <div class="btn-row left"><button class="primary small" data-tpl-copy="${r.id}">Salin</button><button class="ghost small" data-tpl-edit="${r.id}">Edit</button></div></div>`).join('')}</div>` : '';
  }).join('') || '<div class="empty">Belum ada template. Bikin template buat pertanyaan yang sering muncul (ongkir, cara pakai, retur, dll).</div>'}`;
  $('#tp-new').addEventListener('click', () => tplForm());
  $('#cs-body').onchange = null;
  $('#cs-body').onclick = async (e) => {
    const d = e.target.dataset;
    const r = rows.find((x) => x.id === Number(d.tplCopy || d.tplEdit));
    if (d.tplCopy) {
      await navigator.clipboard?.writeText(r.body);
      api(`/api/cs/templates/${r.id}`, json('PATCH', { used: true })).catch(() => {});
      toast('Disalin, tinggal tempel di Desty Chat');
    }
    if (d.tplEdit) tplForm(r);
  };
}

function tplForm(t = null) {
  openModal(`<form id="tp-form"><h3>${t ? 'Edit template' : 'Template baru'}</h3>
    <label class="label" for="tp-title">Judul</label><input id="tp-title" name="title" value="${esc(t?.title || '')}" required>
    <label class="label" for="tp-cat">Kategori</label><select id="tp-cat" name="category">${opts(CAT, t?.category || 'pertanyaan')}</select>
    <label class="label" for="tp-body">Isi balasan</label><textarea id="tp-body" name="body" rows="7" required>${esc(t?.body || '')}</textarea>
    <div class="modal-actions">${t ? '<button type="button" class="danger" id="tp-del">Hapus</button>' : ''}<button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  $('#tp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(t ? `/api/cs/templates/${t.id}` : '/api/cs/templates', json(t ? 'PATCH' : 'POST', Object.fromEntries(new FormData(e.target))));
      closeModal();
      csTemplates();
    } catch (ex) { toast(ex.message); }
  });
  $('#tp-del')?.addEventListener('click', async () => {
    await api(`/api/cs/templates/${t.id}`, { method: 'DELETE' });
    closeModal();
    csTemplates();
  });
}

function csImport() {
  $('#cs-body').onclick = null;
  $('#cs-body').onchange = null;
  $('#cs-body').innerHTML = `<div class="card">
    <ol class="steps">
      <li><b class="step-title">Buka Desty Chat</b>Pengaturan (ikon ⚙ kiri bawah) → <b>Data Analisis</b>.</li>
      <li><b class="step-title">Unduh laporan</b>Buka <b>Performa Staf</b> dan <b>Performa Toko</b>, pilih tanggal, klik <b>Unduh</b>.</li>
      <li><b class="step-title">Upload di sini</b>Boleh dua file sekaligus. Upload ulang hari yang sama tidak bikin data dobel.</li>
    </ol>
    <label class="dropzone"><input type="file" id="cs-files" accept=".xlsx" multiple hidden><div>Pilih file Staff_Performance / Store_Performance (.xlsx)</div></label>
    <div id="cs-import-result"></div></div>`;
  $('#cs-files').addEventListener('change', async (e) => {
    const out = [];
    for (const f of e.target.files) {
      const fd = new FormData();
      fd.set('file', f);
      try {
        const r = await api('/api/cs/import', { method: 'POST', body: fd });
        out.push(`<li>✓ ${esc(f.name)}: ${r.rows} baris ${r.type === 'staff' ? 'performa staf' : 'performa toko'} (${r.days.map(esc).join(', ')})</li>`);
      } catch (ex) { out.push(`<li class="error-inline">✕ ${esc(f.name)}: ${esc(ex.message)}</li>`); }
    }
    e.target.value = '';
    $('#cs-import-result').innerHTML = `<ul>${out.join('')}</ul><button class="primary" data-goto="reports">Lihat Laporan CS →</button>`;
    reportTab = 'cs';
  });
}

S.viewHooks.cs = () => {
  if (!$('#cs-tabs')) csShell();
  csDraw().catch((ex) => toast(ex.message));
};

// ======================================================================
// LAPORAN PER TIM
// ======================================================================
const TEAMS = [['konten', 'Tim Konten'], ['medsos', 'Tim Medsos'], ['digital', 'Tim Digital'], ['adv', 'Tim ADV'], ['mp', 'Tim MP'], ['kol', 'Tim KOL'], ['affiliate', 'Tim Affiliate'], ['cs', 'Tim CS']];
const MULTI_BRAND = ['adv', 'mp', 'kol', 'affiliate'];
let reportTab = null;

async function drawReports() {
  const team = myTeam();
  const allowed = team === 'semua' || manage() ? TEAMS : TEAMS.filter(([k]) => k === team);
  reportTab = allowed.some(([k]) => k === reportTab) ? reportTab : allowed[0][0];
  const days = Number($('#rp-range')?.value || 30);
  $('#view-reports').innerHTML = `
    <div class="row-between no-print"><h1>Laporan</h1>
      <div class="btn-row"><select id="rp-range" aria-label="Periode">${[[7, '7 hari'], [30, '30 hari'], [90, '90 hari'], [365, '1 tahun']].map(([v, l]) => `<option value="${v}" ${v === days ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <a class="btn" id="rp-csv">Download CSV</a><button class="primary" id="rp-print">Cetak / PDF</button></div></div>
    <div class="tabs no-print" id="rp-tabs">${allowed.map(([k, l]) => `<button data-rp="${k}" class="${k === reportTab ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div id="rp-body" class="report"><div class="spinner"></div></div>`;
  $('#rp-tabs').addEventListener('click', (e) => { if (e.target.dataset.rp) { reportTab = e.target.dataset.rp; drawReports(); } });
  $('#rp-range').addEventListener('change', drawReports);
  $('#rp-print').addEventListener('click', () => window.print());
  const q = `from=${encodeURIComponent(since(days))}`;
  $('#rp-csv').href = `/api/reports/team/${reportTab}/export.csv?brand=${state.brandId}&${q}`;
  const r = await api(`/api/reports/team/${reportTab}?${q}`);
  const brand = state.brands.find((b) => b.id === state.brandId)?.name || '';
  const head = `<h2 class="report-title">Laporan ${TEAMS.find(([k]) => k === reportTab)[1]}</h2><p class="hint">${MULTI_BRAND.includes(reportTab) ? 'Semua brand' : esc(brand)} · ${new Date(since(days)).toLocaleDateString('id-ID', { dateStyle: 'medium' })} – ${new Date().toLocaleDateString('id-ID', { dateStyle: 'medium' })}</p>`;
  $('#rp-body').innerHTML = head + ({ konten: reportKonten, medsos: reportMedsos, digital: reportDigital, adv: (x) => window.timAds.reportHtml(x), mp: (x) => window.timAds.reportHtml(x), kol: (x) => window.timPartners.reportHtml(x), affiliate: (x) => window.timPartners.reportHtml(x), cs: reportCs })[reportTab](r);
window.timAi?.mount($('#rp-body'), reportTab, { days });
}

function reportKonten(r) {
  const c = r.content;
  return `${kpis([
    { label: 'Konten direncanakan', value: num(c.total) },
    { label: 'Sudah tayang', value: num(c.byStatus.tayang || 0) },
    { label: 'Tepat waktu', value: pct(c.on_time_rate), sub: `${c.on_time} tepat · ${c.late} telat` },
    { label: 'Lewat jadwal', value: num(c.overdue) },
    { label: 'Aset visual/video', value: num(r.assets.total), sub: `${r.assets.motion} Video Motion` },
      ])}
  <h3>Per tahap</h3><p>${['ide', 'draft', 'review', 'siap', 'terjadwal', 'tayang'].map((k) => `${k} <b>${c.byStatus[k] || 0}</b>`).join(' · ')}</p>
  <h3>Produktivitas per PIC</h3>${table(['PIC', 'Konten', 'Tayang', 'Tepat waktu', 'Telat', 'Lewat jadwal'], r.people.map((p) => [esc(p.name), p.total, p.tayang, p.on_time, p.late, p.overdue]))}
  <h3>Aset yang diupload</h3>${table(['Anggota', 'Gambar', 'Video', 'Video Motion'], r.assets.byPerson.map((p) => [esc(p.name), p.images, p.videos, p.motion]))}`;
}

function reportDigital(r) {
const L = r.launch;
const P = r.pages;
return `${kpis([
{ label: 'Proyek Launch Lab', value: num(L.total), sub: `${L.active} aktif di periode ini` },
{ label: 'Landing Launch Lab terbit', value: num(L.published) },
{ label: 'Halaman LP Builder', value: num(P.total), sub: `${P.published} terbit · ${P.updated} diubah` },
])}
<h3>Per tahap</h3><p>${['riset', 'brand', 'copy', 'visual', 'landing', 'launch'].map((k) => `${k} <b>${L.byStage[k] || 0}</b>`).join(' · ')}</p>
<h3>Proyek Launch Lab</h3>${table(['Proyek', 'Tahap', 'Konsep terpilih', 'Hook / script / iklan', 'Landing', 'PIC'], L.projects.map((p) => [esc(p.name), esc(p.stage), p.concept ? `${esc(p.concept.name)} · ${esc(p.concept.price || '')} · skor ${p.concept.demand_score ?? '–'}` : '–', `${p.hooks} / ${p.scripts} / ${p.ads}`, p.published ? `<a href="/lp/${esc(p.slug)}" target="_blank" rel="noopener">/lp/${esc(p.slug)}</a>` : (p.landing_ready ? 'draft' : '–'), esc(p.by || '-')]))}
<h3>Halaman LP Builder</h3>${table(['Halaman', 'Status', 'PIC', 'Diubah'], P.list.map((p) => [esc(p.name), p.published ? `<a href="/p/${esc(p.slug)}" target="_blank" rel="noopener">/p/${esc(p.slug)}</a>` : 'draft', esc(p.by || '-'), day(p.updated_at)]))}`;
}

function reportMedsos(r) {
  const t = r.performance.totals;
  const dist = r.distribution;
  return `${kpis([
    { label: 'Post', value: num(dist.posts), sub: Object.entries(dist.byStatus).map(([k, v]) => `${S.STATUS_LABEL[k] || k} ${v}`).join(' · ') },
    { label: 'Views', value: compact(t.views), sub: `${t.contents} konten` },
    { label: 'Engagement rate', value: pct(t.engagement_rate) },
    { label: 'Profile visit', value: compact(t.profile_visits) },
    { label: 'Leads → Sales', value: `${num(t.leads)} → ${num(t.sales)}` },
    { label: 'Video TikTok dipantau', value: num(r.tiktok.videos), sub: `${r.tiktok.errors} gagal diambil` },
  ])}
  <h3>Distribusi per platform</h3>${table(['Platform', 'Berhasil', 'Gagal', 'Menunggu'], dist.byPlatform.map((g) => [esc(g.platform), g.success, g.failed, g.pending]))}
  <h3>Performa per platform</h3>${table(['Platform', 'Konten', 'Rata-rata views', 'ER', 'Sales'], r.performance.byPlatform.map((g) => [esc(g.key), g.contents, num(g.avg_views), pct(g.engagement_rate), num(g.sales)]))}
  <h3>Funnel</h3><p>${r.performance.funnel.map((f) => `${f.label} <b>${num(f.value)}</b>${f.conversion != null ? ` (${pct(f.conversion)})` : ''}`).join(' → ')}</p>
  <h3>TikTok: akun sendiri vs pesaing vs referensi</h3>${table(['Label', 'Video', 'Rata-rata views', 'ER'], r.tiktok.byLabel.map((g) => [LABEL_NAME[g.label] || g.label, g.videos, num(g.avg_views), pct(g.er)]))}
  <h3>10 video TikTok teratas</h3>${table(['Akun', 'Caption', 'Label', 'Views', 'ER'], r.tiktok.top.map((v) => [`<a href="${esc(v.url)}" target="_blank" rel="noopener">@${esc(v.username || '?')}</a>`, esc(v.caption), LABEL_NAME[v.label] || v.label, num(v.views), pct(v.er)]))}`;
}

function reportCs(r) {
  const c = r.chat;
  const tk = r.tickets;
  return `${c.imported ? '' : '<div class="check bad">Belum ada laporan Desty yang diimpor di periode ini. Buka <b>Layanan Pelanggan → Impor laporan Desty</b>.</div>'}
  ${kpis([
    { label: 'Pelanggan chat', value: num(c.customers), sub: `${num(c.customers_replied)} dibalas` },
    { label: 'Tingkat respons', value: pct(c.response_rate) },
    { label: 'Dibalas ≤ 5 menit', value: pct(c.within_5m) },
    { label: 'Rata-rata respons pertama', value: c.avg_first_response == null ? '–' : `${Math.round(c.avg_first_response)} mnt` },
    { label: 'Pelanggan jadi beli', value: num(c.converted), sub: `konversi ${pct(c.conversion_rate)}` },
    { label: 'Tiket', value: num(tk.total), sub: `${tk.overdue} lewat batas · SLA ${pct(tk.sla_rate)}` },
  ])}
  ${c.last_day ? `<p class="hint">Data Desty terakhir: ${esc(c.last_day)}</p>` : ''}
  <h3>Performa staf (Desty)</h3>${table(['Staf', 'Hari', 'Pelanggan', 'Dibalas', 'Tingkat respons', '≤ 5 menit', 'Rata-rata respons (mnt)'], r.staff.map((s) => [esc(s.key), s.days, s.customers, s.customers_replied, pct(s.response_rate), pct(s.within_5m), s.avg_first_response == null ? '–' : Math.round(s.avg_first_response)]))}
  <h3>Performa toko (Desty)</h3>${table(['Toko', 'Marketplace', 'Pelanggan', 'Dibalas', 'Tingkat respons', 'Jadi beli', 'Rata-rata respons (mnt)'], r.shops.map((s) => [esc(s.key), esc(s.marketplace), s.customers, s.customers_replied, pct(s.response_rate), `${s.converted} (${pct(s.conversion_rate)})`, s.avg_first_response == null ? '–' : Math.round(s.avg_first_response)]))}
  <h3>Tiket per PIC</h3>${table(['PIC', 'Tiket', 'Selesai', 'Tepat waktu', 'Lewat batas (belum selesai)'], tk.byAgent.map((a) => [esc(a.key), a.total, a.selesai, a.sla_met, a.overdue]))}
  <h3>Tiket per kategori</h3><p>${Object.entries(tk.byCategory).map(([k, v]) => `${CAT[k] || k} <b>${v}</b>`).join(' · ') || '–'}</p>
  <p class="hint">Rata-rata waktu penyelesaian tiket: ${tk.avg_resolution_hours == null ? '–' : `${tk.avg_resolution_hours.toFixed(1)} jam`}</p>`;
}

S.viewHooks.reports = () => drawReports().catch((ex) => toast(ex.message));
