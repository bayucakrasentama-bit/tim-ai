// Halaman Tim KOL & Tim Affiliate — roster mitra lintas brand, hasil per konten, laporan & Master BCS.
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel) => document.querySelector(sel);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const num = (n) => (n == null ? '–' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 }));
const cpt = (n) => (n == null ? '–' : Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const rp = (n) => (n == null ? '–' : `Rp${Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`);
const rpc = (n) => (n == null ? '–' : `Rp${cpt(n)}`);
const pct = (v) => (v == null ? '–' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`);
const x2 = (v) => (v == null ? '–' : `${Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 })}x`);
const since = (days) => new Date(Date.now() - days * 86400_000).toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const STATUS = { prospek: 'Prospek', negosiasi: 'Negosiasi', deal: 'Deal', aktif: 'Aktif', selesai: 'Selesai', ditolak: 'Ditolak' };
const STATUS_KOL = { hunting: '1. List / Hunting', negosiasi: '2. Negosiasi & Deal', sampel: '3. Kirim Sampel', draft: '4. Menunggu Draft', tayang: '5. Sudah Tayang', evaluasi: '6. Evaluasi & Scoring', ditolak: 'Ditolak' };
const ST = (team) => (team === 'kol' ? STATUS_KOL : STATUS);
const BADGE = { repeat: '<span class="tag ok">🟢 Worth to Repeat</span>', nego: '<span class="tag warn">🟡 Nego Ulang Ratecard</span>', blacklist: '<span class="tag bad">🔴 Blacklist / Overpriced</span>', nodata: '<span class="tag">⏳ Belum ada data</span>' };
const PLATFORM = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook', x: 'X', tiktok_shop: 'TikTok Shop', shopee: 'Shopee', tokopedia: 'Tokopedia', lazada: 'Lazada', lainnya: 'Lainnya' };
const COPY = {
  kol: { title: 'Tim KOL', who: 'KOL', intro: 'Roster KOL & influencer dari semua brand: pipeline deal, ratecard, hasil tiap konten, CPV & viral dependency, lalu keputusan Master BCS (CORE / TEST / REJECT).', rate: 'Ratecard per konten (Rp)' },
  affiliate: { title: 'Tim Affiliate', who: 'Kreator', intro: 'Kreator afiliasi TikTok Shop, Shopee, Tokopedia & Lazada dari semua brand: GMV, pesanan, komisi, ROAS per kreator, lalu keputusan Master BCS.', rate: 'Komisi (%)' },
};
const ui = { kol: { tab: 'summary', days: 30, only: '' }, affiliate: { tab: 'summary', days: 30, only: '' } };
const TABS = {
  kol: [['summary', 'Ringkasan & Master BCS'], ['roster', 'Pipeline KOL'], ['campaigns', 'Campaign'], ['schedule', 'Jadwal'], ['samples', 'Sampel & Resi'], ['content', 'Analisa Konten'], ['research', 'Riset Kreator'], ['posts', 'Input hasil']],
  affiliate: [['summary', 'Ringkasan & Master BCS'], ['roster', 'Kreator'], ['research', 'Riset & Banding Kreator'], ['samples', 'Sampel Massal'], ['brief', 'AI Brief & Link'], ['products', 'Produk'], ['videos', 'Video'], ['live', 'Livestream'], ['posts', 'Input hasil']],
};
const cache = {};

const kpis = (items) => `<div class="kpi-row">${items.map((k) => `<div class="kpi"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div>${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>`).join('')}</div>`;
const table = (head, rows, empty = 'Belum ada data.') => (rows.length
  ? `<div class="table-wrap"><table class="data"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  : `<div class="empty">${empty}</div>`);
const vd = (v) => (v == null ? '–' : `<span class="${v > 3 ? 'error-inline' : ''}">${x2(v)}${v > 3 ? ' 🚩' : ''}</span>`);

// Dipakai juga oleh halaman Laporan (tab Tim KOL / Tim Affiliate).
function reportHtml(r) {
  const t = r.totals;
  const aff = r.team === 'affiliate';
  return `${kpis([
    { label: aff ? 'Kreator' : 'KOL', value: num(t.partners), sub: `${num(t.active)} deal/aktif` },
    { label: 'Konten / laporan', value: num(t.posts) },
    { label: 'Views', value: cpt(t.views), sub: `median ${cpt(t.median_views)} · ER ${pct(t.er)}` },
    { label: aff ? 'GMV / omzet' : 'Omzet ter-atribusi', value: rpc(t.revenue), sub: `${num(t.orders)} pesanan` },
    { label: aff ? 'Komisi + fee' : 'Fee + komisi', value: rpc(t.cost), sub: `CPV ${t.cpv == null ? '–' : rp(t.cpv)}` },
    { label: 'ROAS', value: x2(t.roas), sub: `biaya/pesanan ${rp(t.cpo)}` },
  ])}
  <p class="hint">Pipeline: ${Object.entries(ST(r.team)).map(([k, l]) => `${l} <b>${r.byStatus[k] || 0}</b>`).join(' · ')}</p>
  <h3>Per ${aff ? 'kreator' : 'KOL'}</h3>${table([aff ? 'Kreator' : 'KOL', 'Brand', 'Status', 'Konten', 'Median views', 'Viral dep.', 'ER', 'Biaya', 'CPV', 'Pesanan', 'Omzet', 'ROAS'],
    r.partners.map((p) => [`<b>${esc(p.name)}</b>${p.handle ? `<div class="hint">@${esc(p.handle)} · ${esc(PLATFORM[p.platform] || p.platform)}</div>` : ''}`, esc(p.brand), `${esc(ST(r.team)[p.status] || p.status)}<div>${BADGE[p.badge] || ''}</div>`, num(p.posts), cpt(p.median_views), vd(p.viral_dependency), pct(p.er), rp(p.cost), p.cpv == null ? '–' : rp(p.cpv), num(p.orders), rp(p.revenue), `<b>${x2(p.roas)}</b>`]),
    'Belum ada mitra. Tambah atau impor CSV.')}
  ${r.campaigns?.length ? `<h3>Campaign</h3>${table(['Campaign', 'Brand', 'Status', 'Deliverable tayang', 'Telat', 'Budget', 'Fee', 'Views', 'CPV', 'ROAS'], r.campaigns.map((c) => [esc(c.name), esc(c.brand), esc(c.status), `${c.posted}/${c.deliverables}`, c.late ? `<span class="error-inline">${c.late}</span>` : '0', rp(c.budget), rp(c.fee), cpt(c.views), c.cpv == null ? '–' : rp(c.cpv), x2(c.roas)]))}` : ''}
  ${r.products?.length ? `<h3>Produk teratas</h3>${table(['Produk', 'Kreator', 'Konten', 'Pesanan', 'Omzet', 'Porsi omzet', 'ROAS'], r.products.slice(0, 10).map((g) => [esc(g.key), num(g.creators), num(g.posts), num(g.orders), rp(g.revenue), pct(g.share), x2(g.roas)]))}` : ''}
  ${r.live?.sessions ? `<h3>Livestream</h3>${kpis([{ label: 'Sesi live', value: num(r.live.sessions), sub: `${(r.live.hours || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam` }, { label: 'GMV live', value: rpc(r.live.revenue), sub: `${num(r.live.orders)} pesanan` }, { label: 'GPM', value: rp(r.live.gpm), sub: 'GMV per 1.000 penonton' }, { label: 'GMV per jam', value: rpc(r.live.revenue_per_hour) }])}` : ''}
  <h3>Per brand</h3>${table(['Brand', 'Konten', 'Views', 'Biaya', 'Pesanan', 'Omzet', 'ROAS'], r.byBrand.map((g) => [esc(g.key), num(g.posts), cpt(g.views), rp(g.cost), num(g.orders), rp(g.revenue), x2(g.roas)]))}
  <h3>Per platform</h3>${table(['Platform', 'Konten', 'Views', 'ER', 'Biaya', 'Omzet', 'ROAS'], r.byPlatform.map((g) => [esc(PLATFORM[g.key] || g.key), num(g.posts), cpt(g.views), pct(g.er), rp(g.cost), rp(g.revenue), x2(g.roas)]))}
  <h3>Konten / laporan teratas</h3>${table(['Tanggal', aff ? 'Kreator' : 'KOL', 'Brand', 'Konten', 'Views', 'Pesanan', 'Omzet', 'Biaya'], r.top.map((x) => [x.day, esc(x.partner), esc(x.brand), x.url && /^https?:/.test(x.url) ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || 'link')}</a>` : esc(x.title || '–'), cpt(x.views), num(x.orders), rp(x.revenue), rp(x.cost)]))}`;
}

const brandName = (id) => state.brands.find((b) => b.id === id)?.name || `#${id}`;
const partnerOptions = (team, sel) => cache[team].partners.map((p) => `<option value="${p.id}" ${String(p.id) === String(sel) ? 'selected' : ''}>${esc(p.name)} · ${esc(brandName(p.brand_id))}</option>`).join('');

async function draw(team) {
  const u = ui[team];
  // Render yang lebih baru (ganti tab/filter) membatalkan render lama yang masih menunggu data.
  const token = (u.token = (u.token || 0) + 1);
  const stale = () => token !== u.token;
  const c = COPY[team];
  $(`#view-${team}`).innerHTML = `
  <div class="page-head"><div><h1>${c.title}</h1><p class="hint">${c.intro}</p></div>
  <div class="btn-row">
    <select data-p-only aria-label="Brand"><option value="">Semua brand</option>${state.brands.map((b) => `<option value="${b.id}" ${String(b.id) === u.only ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
    <select data-p-days aria-label="Periode">${[[7, '7 hari'], [30, '30 hari'], [90, '90 hari'], [365, '1 tahun']].map(([v, l]) => `<option value="${v}" ${v === u.days ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="ghost" data-p-import>Impor CSV</button><button class="ghost" data-p-result>+ Hasil konten</button><button class="primary" data-p-add>+ ${c.who}</button>
  </div></div>
  <div class="tabs">${TABS[team].map(([k, l]) => `<button data-p-tab="${k}" class="${k === u.tab ? 'active' : ''}">${l}</button>`).join('')}</div>
  <div data-p-body><div class="spinner"></div></div>`;
  const body = $(`#view-${team} [data-p-body]`);
  const fresh = await api(`/api/partners/${team}`);
  if (stale()) return;
  cache[team] = fresh;
  const { partners } = cache[team];
  const extra = window.timPX?.[u.tab];
  if (extra) {
    body.innerHTML = '<div class="spinner"></div>';
    await extra(team, body, { u, cache: cache[team], brandName, redraw: () => draw(team), helpers: { kpis, table, num, cpt, rp, rpc, pct, x2, vd, today, since, json, STATUS, PLATFORM } });
  } else if (u.tab === 'summary') {
    const q = `from=${encodeURIComponent(since(u.days))}${u.only ? `&only=${u.only}` : ''}`;
    const r = await api(`/api/reports/team/${team}?${q}`);
    if (stale()) return;
    body.innerHTML = `<div class="row-between"><span></span><a class="btn small" href="/api/reports/team/${team}/export.csv?brand=${state.brandId}&${q}">Download CSV</a></div>${reportHtml(r)}`;
    window.timAi?.mount(body, team, { days: u.days });
  } else if (u.tab === 'roster') {
    const list = partners.filter((p) => !u.only || String(p.brand_id) === u.only);
    body.innerHTML = `<div class="p-kanban" style="grid-template-columns: repeat(${Object.keys(ST(team)).length}, minmax(190px, 1fr))">${Object.entries(ST(team)).map(([k, l]) => {
      const items = list.filter((p) => p.status === k || (k === Object.keys(ST(team))[0] && !ST(team)[p.status]));
      return `<div class="p-col"><div class="p-col-head">${l} <span class="hint">${items.length}</span></div>${items.map((p) => `<div class="card p-card" data-p-edit="${p.id}">
        <b>${esc(p.name)}</b>${p.handle ? ` <span class="hint">@${esc(p.handle)}</span>` : ''}
        <div class="hint">${esc(PLATFORM[p.platform] || p.platform)}${p.tier ? ` · ${esc(p.tier)}` : ''}${p.followers ? ` · ${cpt(p.followers)} followers` : ''}</div>
        <div class="hint">${esc(brandName(p.brand_id))}${p.rate != null ? ` · ${team === 'affiliate' ? `${p.rate}%` : rp(p.rate)}` : ''}</div>
        ${(() => { const s = p.stats ? JSON.parse(p.stats).metrics : null; return s ? `<div class="p-stats">median ${cpt(s.median_views)} · ER ${pct(s.er)} · VD ${vd(s.viral_dependency)}${team === 'kol' && s.fair_fee_low ? `<br>fee wajar ${rpc(s.fair_fee_low)}–${rpc(s.fair_fee_high)}` : ''}</div>` : ''; })()}
        <div class="p-score">${BADGE[p.perf?.badge] || ''}${p.perf?.views ? `<span class="hint mono"> CPV ${p.perf.cpv_total == null ? '–' : rp(p.perf.cpv_total)} · CPE ${p.perf.cpe == null ? '–' : rp(p.perf.cpe)} · ER ${pct(p.perf.er)} · ROAS ${x2(p.perf.roas_total)}</span>` : ''}</div>
        ${p.last_sample ? `<div class="hint">📦 ${esc(p.last_sample.product)} · ${esc(p.last_sample.status.replace('_', ' '))}${p.last_sample.resi ? ` · ${esc(p.last_sample.courier)} ${esc(p.last_sample.resi)}` : ''}</div>` : ''}
        ${p.handle && /tiktok/.test(p.platform) ? `<button class="link small" data-p-enrich="${p.id}">${p.stats ? '↻ perbarui data TikTok' : '⤓ tarik data TikTok'}</button>` : ''}
        <select data-p-status="${p.id}" aria-label="Status">${Object.entries(ST(team)).map(([s, sl]) => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${sl}</option>`).join('')}</select></div>`).join('')}</div>`;
    }).join('')}</div>`;
  } else {
    const p = partners.find((x) => String(x.id) === String(u.partner)) || partners[0];
    u.partner = p?.id;
    const rows = p ? await api(`/api/partners/${team}/posts?partner_id=${p.id}`) : [];
    body.innerHTML = `<div class="btn-row left"><select data-p-partner aria-label="Mitra">${partnerOptions(team, p?.id)}</select></div>
      ${table(['Tanggal', 'Konten', 'Views', 'Like', 'Komen', 'Share', 'Save', 'Klik', 'Pesanan', 'Omzet', 'Fee', 'Komisi', ''], rows.map((x) => [x.day,
        x.url && /^https?:/.test(x.url) ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || 'link')}</a>` : esc(x.title || '–'),
        cpt(x.views), cpt(x.likes), cpt(x.comments), cpt(x.shares), cpt(x.saves), cpt(x.clicks), num(x.orders), rp(x.revenue), rp(x.fee), rp(x.commission),
        `${/tiktok\.com/i.test(x.url || '') ? `<button class="ghost small" data-p-refresh="${x.id}" title="${x.error ? esc(x.error) : `Dipantau otomatis${x.refreshed_at ? ` · update ${esc(x.refreshed_at.slice(0, 16).replace('T', ' '))}` : ''}`}">↻</button>` : ''}<button class="asset-del static" data-p-delpost="${x.id}" aria-label="Hapus">✕</button>`]), p ? 'Belum ada hasil untuk mitra ini.' : `Tambah ${COPY[team].who} dulu.`)}`;
  }
}

function partnerForm(team, p = null) {
  const c = COPY[team];
  const { meta } = cache[team];
  openModal(`<form id="p-form"><h3>${p ? `Edit ${esc(p.name)}` : `${c.who} baru`}</h3>
    <div class="form-grid">
      ${p ? '' : `<div class="span-2"><label class="label" for="pf-brand">Brand</label><select id="pf-brand" name="brand_id">${state.brands.map((b) => `<option value="${b.id}" ${b.id === state.brandId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>`}
      <div><label class="label" for="pf-name">Nama</label><input id="pf-name" name="name" required value="${esc(p?.name || '')}"></div>
      <div><label class="label" for="pf-handle">Username</label><input id="pf-handle" name="handle" value="${esc(p?.handle || '')}" placeholder="@akun"></div>
      <div><label class="label" for="pf-plat">Platform</label><select id="pf-plat" name="platform">${meta.platforms.map((k) => `<option value="${k}" ${k === p?.platform ? 'selected' : ''}>${PLATFORM[k] || k}</option>`).join('')}</select></div>
      <div><label class="label" for="pf-tier">Tier</label><select id="pf-tier" name="tier">${['', 'Nano (<10rb)', 'Micro (10–100rb)', 'Mid (100–500rb)', 'Macro (500rb–1jt)', 'Mega (>1jt)'].map((t) => `<option ${t === (p?.tier || '') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div><label class="label" for="pf-fol">Followers</label><input id="pf-fol" name="followers" inputmode="numeric" value="${p?.followers ?? ''}"></div>
      <div><label class="label" for="pf-rate">${c.rate}</label><input id="pf-rate" name="rate" inputmode="decimal" value="${p?.rate ?? ''}"></div>
      <div><label class="label" for="pf-status">Status</label><select id="pf-status" name="status">${Object.entries(ST(team)).map(([k, l]) => `<option value="${k}" ${k === (p?.status || Object.keys(ST(team))[0]) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="label" for="pf-contact">Kontak (WA/email/manajer)</label><input id="pf-contact" name="contact" value="${esc(p?.contact || '')}"></div>
      <div class="span-2"><label class="label" for="pf-notes">Catatan (deliverable, deadline, brief, riwayat endorse)</label><textarea id="pf-notes" name="notes" rows="3">${esc(p?.notes || '')}</textarea></div>
    </div>
    <div class="modal-actions">${p ? '<button type="button" class="danger" id="pf-del">Hapus</button>' : ''}<button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  $('#modal-box').classList.add('wide');
  $('#p-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(p ? `/api/partners/${team}/${p.id}` : `/api/partners/${team}`, json(p ? 'PATCH' : 'POST', Object.fromEntries(new FormData(e.target))));
      closeModal();
      toast('Tersimpan');
      draw(team);
    } catch (ex) { toast(ex.message); }
  });
  $('#pf-del')?.addEventListener('click', async () => {
    if (!confirm(`Hapus ${p.name} beserta semua hasilnya?`)) return;
    await api(`/api/partners/${team}/${p.id}`, { method: 'DELETE' });
    closeModal();
    draw(team);
  });
}

function resultForm(team) {
  if (!cache[team].partners.length) return toast(`Tambah ${COPY[team].who} dulu`);
  const n = (k, l) => `<div><label class="label" for="pr-${k}">${l}</label><input id="pr-${k}" name="${k}" inputmode="decimal"></div>`;
  openModal(`<form id="pr-form"><h3>Hasil konten / periode</h3>
    <div class="form-grid">
      <div class="span-2"><label class="label" for="pr-p">${COPY[team].who}</label><select id="pr-p" name="partner_id">${partnerOptions(team, ui[team].partner)}</select></div>
      <div><label class="label" for="pr-day">Tanggal tayang</label><input id="pr-day" name="day" type="date" value="${today()}" required></div>
      <div><label class="label" for="pr-title">Judul konten</label><input id="pr-title" name="title"></div>
      <div><label class="label" for="pr-prod">Produk</label><input id="pr-prod" name="product"></div>
      <div class="span-2"><label class="label" for="pr-url">Link konten</label><input id="pr-url" name="url" placeholder="https://"><p class="hint">Link TikTok otomatis dipantau: views, like, komen, share, save diperbarui tiap 6 jam (kolom angka di bawah boleh dikosongkan).</p></div>
      ${n('views', 'Views')}${n('likes', 'Like')}${n('comments', 'Komen')}${n('shares', 'Share')}${n('saves', 'Save')}${n('clicks', 'Klik link')}
      ${n('orders', 'Pesanan')}${n('revenue', 'Omzet / GMV (Rp)')}${n('fee', 'Fee (Rp)')}${n('commission', 'Komisi (Rp)')}
    </div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  $('#modal-box').classList.add('wide');
  $('#pr-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/partners/${team}/posts`, json('POST', Object.fromEntries(new FormData(e.target))));
      closeModal();
      toast('Tersimpan');
      draw(team);
    } catch (ex) { toast(ex.message); }
  });
}

function importForm(team) {
  const { meta } = cache[team];
  openModal(`<form id="pi-form"><h3>Impor CSV ${COPY[team].title}</h3>
    <ol class="steps">${team === 'affiliate'
      ? '<li>TikTok Shop Seller Center → Affiliate → <b>Analisis kreator / Data pesanan afiliasi</b> → Ekspor. Shopee: Seller Centre → Program Affiliate → <b>Performa Affiliate</b> → Ekspor.</li>'
      : '<li>Rekap KOL dari spreadsheet tim: satu baris per konten (nama/username KOL, tanggal, link, views, like, komen, share, save, klik, pesanan, omzet, fee).</li>'}
    <li>Simpan sebagai CSV lalu upload. Kreator yang belum ada otomatis ditambahkan ke daftar (status Aktif).</li></ol>
    <div class="form-grid">
      <div><label class="label" for="pi-brand">Brand</label><select id="pi-brand">${state.brands.map((b) => `<option value="${b.id}" ${b.id === state.brandId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
      <div><label class="label" for="pi-plat">Platform</label><select id="pi-plat">${meta.platforms.map((k) => `<option value="${k}">${PLATFORM[k] || k}</option>`).join('')}</select></div>
      <div><label class="label" for="pi-day">Tanggal (kalau file tanpa kolom tanggal)</label><input id="pi-day" type="date" value="${today()}"></div>
    </div>
    <label class="dropzone"><input type="file" id="pi-file" accept=".csv,.txt,text/csv" hidden><div id="pi-label">Pilih file .csv</div></label>
    <details class="manual"><summary>atau tempel isi CSV</summary><textarea id="pi-text" rows="6" placeholder="Kreator,Tanggal,Views,Pesanan,GMV,Komisi"></textarea></details>
    <div id="pi-result"></div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Tutup</button><button class="primary">Impor</button></div></form>`);
  $('#modal-box').classList.add('wide');
  $('#pi-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) { $('#pi-text').value = await f.text(); $('#pi-label').textContent = f.name; }
  });
  $('#pi-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api(`/api/partners/${team}/import`, json('POST', { brand_id: Number($('#pi-brand').value), platform: $('#pi-plat').value, day: $('#pi-day').value, csv: $('#pi-text').value }));
      $('#pi-result').innerHTML = `<div class="check ok">✓ ${r.rows} baris masuk, ${r.created} ${COPY[team].who.toLowerCase()} baru. Kolom terbaca: ${r.columns.map(esc).join(', ')}.</div>`;
      draw(team);
    } catch (ex) { $('#pi-result').innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; }
  });
}

function bind(team) {
  const root = $(`#view-${team}`);
  root.addEventListener('click', async (e) => {
    if (e.target.matches('select')) return;
    const d = e.target.dataset;
    if (d.pEnrich) {
      e.target.textContent = 'menarik…';
      try { await api(`/api/partners/${team}/${d.pEnrich}/enrich`, { method: 'POST' }); toast('Data TikTok diperbarui'); } catch (ex) { toast(ex.message); }
      draw(team);
      return;
    }
    const u = ui[team];
    if (d.pTab) { u.tab = d.pTab; draw(team).catch((ex) => toast(ex.message)); }
    if (d.pAdd !== undefined) partnerForm(team);
    if (d.pResult !== undefined) resultForm(team);
    if (d.pImport !== undefined) importForm(team);
    const card = e.target.closest('[data-p-edit]');
    if (card) partnerForm(team, cache[team].partners.find((p) => p.id === Number(card.dataset.pEdit)));
    if (d.pRefresh) {
      e.target.disabled = true;
      await api(`/api/partners/${team}/posts/${d.pRefresh}/refresh`, { method: 'POST' }).then(() => toast('Angka diperbarui dari TikTok')).catch((ex) => toast(ex.message));
      draw(team);
    }
    if (d.pDelpost) {
      await api(`/api/partners/${team}/posts/${d.pDelpost}`, { method: 'DELETE' }).catch((ex) => toast(ex.message));
      draw(team);
    }
  });
  root.addEventListener('change', async (e) => {
    const u = ui[team];
    const t = e.target;
    if (t.dataset.pStatus) {
      await api(`/api/partners/${team}/${t.dataset.pStatus}`, json('PATCH', { status: t.value })).catch((ex) => toast(ex.message));
    } else if (t.matches('[data-p-days]')) u.days = Number(t.value);
    else if (t.matches('[data-p-only]')) u.only = t.value;
    else if (t.matches('[data-p-partner]')) u.partner = t.value;
    else return;
    draw(team).catch((ex) => toast(ex.message));
  });
}

for (const team of ['kol', 'affiliate']) {
  bind(team);
  S.viewHooks[team] = () => draw(team).catch((ex) => toast(ex.message));
}

window.timPartners = { reportHtml };
