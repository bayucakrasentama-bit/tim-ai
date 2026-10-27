// Halaman Tim ADV (iklan Meta/TikTok/Google) & Tim MP (iklan marketplace) — lintas brand.
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel) => document.querySelector(sel);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const num = (n) => (n == null ? '–' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 }));
const rp = (n) => (n == null ? '–' : `Rp${Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`);
const rpc = (n) => (n == null ? '–' : `Rp${Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`);
const pct = (v) => (v == null ? '–' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`);
const x2 = (v) => (v == null ? '–' : `${Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 })}x`);
const since = (days) => new Date(Date.now() - days * 86400_000).toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const TITLE = {
  adv: ['Tim ADV', 'Iklan Meta, TikTok & Google dari semua brand: akun iklan, angka harian per kampanye, laporan, dan keputusan Master BCS.'],
  mp: ['Tim MP', 'Iklan marketplace (Shopee, TikTok Shop, Tokopedia, Lazada) dari semua brand: akun toko/iklan, GMV, ROAS/ACOS, laporan, dan keputusan Master BCS.'],
};
const ui = { adv: { tab: 'summary', days: 30, only: '' }, mp: { tab: 'summary', days: 30, only: '' } };
const cache = {};

const kpis = (items) => `<div class="kpi-row">${items.map((k) => `<div class="kpi"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div>${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>`).join('')}</div>`;
const table = (head, rows, empty = 'Belum ada data.') => (rows.length
  ? `<div class="table-wrap"><table class="data"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  : `<div class="empty">${empty}</div>`);
const metricCells = (g) => [rp(g.spend), num(g.impressions), num(g.clicks), pct(g.ctr), num(g.conversions), rp(g.cpa), rp(g.revenue), `<b>${x2(g.roas)}</b>`];
const METRIC_HEAD = ['Spend', 'Impresi', 'Klik', 'CTR', 'Konversi', 'CPA', 'Revenue/GMV', 'ROAS'];

function trend(daily) {
  const d = daily.slice(-30);
  if (!d.length) return '';
  const max = Math.max(...d.map((x) => Math.max(x.spend || 0, x.revenue || 0)), 1);
  const w = 100 / d.length;
  const bars = d.map((x, i) => {
    const hs = ((x.spend || 0) / max) * 100;
    const hr = ((x.revenue || 0) / max) * 100;
    return `<rect x="${i * w + w * 0.1}" y="${100 - hr}" width="${w * 0.4}" height="${hr}" class="tr-rev"><title>${x.day} revenue ${rp(x.revenue)}</title></rect>
      <rect x="${i * w + w * 0.5}" y="${100 - hs}" width="${w * 0.4}" height="${hs}" class="tr-spend"><title>${x.day} spend ${rp(x.spend)} · ROAS ${x2(x.roas)}</title></rect>`;
  }).join('');
  return `<div class="card"><div class="row-between"><div class="label">Tren harian</div><span class="hint"><span class="lg tr-rev"></span> Revenue/GMV <span class="lg tr-spend"></span> Spend</span></div>
    <svg class="ads-trend" viewBox="0 0 100 100" preserveAspectRatio="none">${bars}</svg>
    <div class="row-between hint"><span>${d[0].day}</span><span>${d[d.length - 1].day}</span></div></div>`;
}

// Dipakai juga oleh halaman Laporan (tab Tim ADV / Tim MP).
function reportHtml(r) {
  const t = r.totals;
  const acos = t.revenue ? t.spend / t.revenue : null;
  return `${kpis([
    { label: 'Spend iklan', value: rpc(t.spend), sub: `${r.accounts.length} akun · ${r.byBrand.length} brand` },
    { label: 'Revenue / GMV', value: rpc(t.revenue) },
    { label: 'ROAS', value: x2(t.roas), sub: `ACOS ${pct(acos)}` },
    { label: 'Konversi', value: num(t.conversions), sub: `CPA ${rp(t.cpa)}` },
    { label: 'CTR', value: pct(t.ctr), sub: `CPC ${rp(t.cpc)}` },
    { label: 'CVR klik → konversi', value: pct(t.cvr) },
  ])}
  ${trend(r.daily)}
  <h3>Per brand</h3>${table(['Brand', ...METRIC_HEAD], r.byBrand.map((g) => [esc(g.key), ...metricCells(g)]), 'Belum ada angka iklan. Tambah akun iklan lalu impor CSV / tarik data.')}
  <h3>Per akun iklan</h3>${table(['Akun', 'Brand', 'Platform', ...METRIC_HEAD], r.byAccount.map((g) => [esc(g.key), esc(g.brand), esc(g.platform), ...metricCells(g)]))}
  <h3>Per platform</h3>${table(['Platform', ...METRIC_HEAD], r.byPlatform.map((g) => [esc(g.key), ...metricCells(g)]))}
  <h3>Kampanye dengan spend terbesar</h3>${table(['Kampanye', 'Akun', 'Brand', ...METRIC_HEAD], r.campaigns.map((g) => [esc(g.key), esc(g.account), esc(g.brand), ...metricCells(g)]))}`;
}

async function loadAccounts(team) {
  cache[team] = await api(`/api/ads/${team}/accounts`);
  return cache[team];
}

function shell(team) {
  const u = ui[team];
  const [title, intro] = TITLE[team];
  $(`#view-${team}`).innerHTML = `
  <div class="page-head"><div><h1>${title}</h1><p class="hint">${intro}</p></div>
  <div class="btn-row">
    <select data-ads-only aria-label="Brand"><option value="">Semua brand</option>${state.brands.map((b) => `<option value="${b.id}" ${String(b.id) === u.only ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
    <select data-ads-days aria-label="Periode">${[[7, '7 hari'], [30, '30 hari'], [90, '90 hari'], [365, '1 tahun']].map(([v, l]) => `<option value="${v}" ${v === u.days ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="ghost" data-ads-import>Impor CSV</button><button class="ghost" data-ads-manual>+ Input manual</button><button class="primary" data-ads-add>+ Akun iklan</button>
  </div></div>
  <div class="tabs" data-ads-tabs>${(team === 'adv' ? [['summary', 'Ringkasan & Master BCS'], ['testing', 'Kanban Testing Iklan'], ['profit', 'Kalkulator BEP ROAS'], ['health', 'ROAS Gabungan'], ['strategy', 'Bank Strategi'], ['accounts', 'Akun iklan'], ['rows', 'Data harian']] : [['summary', 'Ringkasan & Master BCS'], ['profit', 'Kalkulator BEP ROAS'], ['health', 'Kesehatan Toko'], ['campaign', 'Kalender Campaign'], ['listing', 'AI Listing & SEO'], ['audit', 'Audit Toko'], ['strategy', 'Bank Strategi'], ['accounts', 'Akun iklan'], ['rows', 'Data harian']]).map(([k, l]) => `<button data-ads-tab="${k}" class="${k === u.tab ? 'active' : ''}">${l}</button>`).join('')}</div>
  <div data-ads-body><div class="spinner"></div></div>`;
}

// Akun Meta yang datanya lewat 6 jam ditarik otomatis saat halaman dibuka (paling sering tiap 10 menit per tab).
const STALE_MS = 6 * 3600e3;
const lastAuto = {};
async function autoSync(team, accounts, body) {
  const stale = accounts.filter((a) => a.platform === 'meta' && a.has_token && (!a.synced_at || Date.now() - new Date(a.synced_at) >= STALE_MS));
  if (!stale.length || Date.now() - (lastAuto[team] || 0) < 600e3) return;
  lastAuto[team] = Date.now();
  body.insertAdjacentHTML('afterbegin', `<div class="check small-note" data-ads-autosync>⏳ Menarik data terbaru dari Meta untuk ${stale.length} akun iklan… Angka di bawah akan diperbarui otomatis.</div>`);
  try {
    const r = await api(`/api/ads/${team}/sync-stale`, { method: 'POST' });
    toast(r.failed ? `Data iklan diperbarui (${r.failed} akun gagal, cek tab Akun iklan)` : 'Data iklan terbaru sudah masuk');
  } catch (ex) { toast(ex.message); }
  if ($(`#view-${team}`)?.classList.contains('active')) draw(team).catch((ex) => toast(ex.message));
}

async function draw(team) {
  const u = ui[team];
  shell(team);
  const body = $(`#view-${team} [data-ads-body]`);
  const { platforms, accounts } = await loadAccounts(team);
  const ext = window.timOps?.adsTabs?.[u.tab];
  if (ext) { await ext(team, body, u); return; }
  if (u.tab === 'summary') {
    const q = `from=${encodeURIComponent(since(u.days))}${u.only ? `&only=${u.only}` : ''}`;
    const r = await api(`/api/reports/team/${team}?${q}`);
    body.innerHTML = `${accounts.length ? '' : `<div class="check small-note">Belum ada akun iklan. Cara paling cepat: <button class="link" data-goto="integrations">Integrasi Cepat</button>${team === 'adv' ? ' → Meta Ads (login Facebook atau scan QR)' : ''}, atau klik <b>+ Akun iklan</b> lalu <b>Impor CSV</b> hasil export dashboard iklan.</div>`}
      <div class="row-between"><span></span><a class="btn small" href="/api/reports/team/${team}/export.csv?brand=${state.brandId}&${q}">Download CSV</a></div>
      ${reportHtml(r)}`;
    window.timOps?.campaignBanner?.(body);
    window.timAi?.mount(body, team, { days: u.days });
    autoSync(team, accounts, body);
  } else if (u.tab === 'accounts') {
    const brandName = (id) => state.brands.find((b) => b.id === id)?.name || `#${id}`;
    body.innerHTML = table(['Brand', 'Akun', 'Platform', 'ID akun', 'Sinkron', ''], accounts.map((a) => [
      esc(brandName(a.brand_id)), `<b>${esc(a.name)}</b>${a.error ? `<div class="error-inline">${esc(a.error)}</div>` : ''}`, esc(platforms[a.platform] || a.platform),
      `<code>${esc(a.external_id || '–')}</code>${a.platform === 'meta' ? `<div class="hint">${a.has_token ? 'token tersimpan' : 'belum ada token'}</div>` : ''}`,
      a.synced_at ? new Date(a.synced_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : (a.platform === 'meta' ? 'belum' : 'impor CSV'),
      `<div class="btn-row">${a.platform === 'meta' ? `<button class="ghost small" data-ads-sync="${a.id}">Tarik data</button>` : ''}
        <button class="ghost small" data-ads-import="${a.id}">Impor CSV</button><button class="ghost small" data-ads-edit="${a.id}">Edit</button>
        <button class="asset-del static" data-ads-del="${a.id}" aria-label="Hapus">✕</button></div>`,
    ]), 'Belum ada akun iklan.');
  } else {
    const acc = accounts.find((a) => String(a.id) === String(u.account)) || accounts[0];
    u.account = acc?.id;
    const rows = acc ? await api(`/api/ads/${team}/rows?account_id=${acc.id}`) : [];
    body.innerHTML = `<div class="btn-row left"><select data-ads-account aria-label="Akun">${accounts.map((a) => `<option value="${a.id}" ${a.id === acc?.id ? 'selected' : ''}>${esc(a.name)} · ${esc(platforms[a.platform] || a.platform)}</option>`).join('')}</select></div>
      ${table(['Tanggal', 'Kampanye', 'Spend', 'Impresi', 'Klik', 'Konversi', 'Revenue', 'Sumber', ''], rows.map((x) => [x.day, esc(x.campaign || '–'), rp(x.spend), num(x.impressions), num(x.clicks), num(x.conversions), rp(x.revenue), esc(x.source),
        `<button class="asset-del static" data-ads-delrow="${x.id}" aria-label="Hapus">✕</button>`]), acc ? 'Belum ada data untuk akun ini.' : 'Tambah akun iklan dulu.')}`;
  }
}

function accountForm(team, a = null) {
  const { platforms } = cache[team];
  openModal(`<form id="ads-acc-form"><h3>${a ? 'Edit akun iklan' : 'Akun iklan baru'}</h3>
    <label class="label" for="aa-brand">Brand</label><select id="aa-brand" name="brand_id">${state.brands.map((b) => `<option value="${b.id}" ${b.id === (a ? a.brand_id : state.brandId) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
    ${a ? '' : `<label class="label" for="aa-plat">Platform</label><select id="aa-plat" name="platform">${Object.entries(platforms).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>`}
    <label class="label" for="aa-name">Nama akun / toko</label><input id="aa-name" name="name" required value="${esc(a?.name || '')}" placeholder="mis. Zestmag - Shopee Official">
    <label class="label" for="aa-ext">ID akun iklan (opsional)</label><input id="aa-ext" name="external_id" value="${esc(a?.external_id || '')}" placeholder="Meta: act_1234567890 · Shopee: ID toko">
    ${team === 'adv' ? `<label class="label" for="aa-tok">Token akses Meta (opsional, khusus Meta Ads)</label><input id="aa-tok" name="access_token" type="password" autocomplete="new-password" placeholder="${a?.has_token ? 'tersimpan — isi untuk mengganti' : 'kosongkan kalau pakai Integrasi Cepat'}">
    <p class="hint">Paling gampang: menu <b>Integrasi Cepat → Meta Ads</b>, login Facebook (atau kirim QR ke pemilik akun). Semua akun iklannya masuk otomatis beserta tokennya.</p>` : '<p class="hint">Data marketplace masuk lewat <b>Impor CSV</b> dari menu iklan/laporan di Seller Center (Shopee Iklan, TikTok Shop Ads, TopAds, Lazada Sponsored) atau input manual.</p>'}
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  $('#ads-acc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    try {
      await api(a ? `/api/ads/${team}/accounts/${a.id}` : `/api/ads/${team}/accounts`, json(a ? 'PATCH' : 'POST', v));
      closeModal();
      toast('Akun iklan tersimpan');
      draw(team);
    } catch (ex) { toast(ex.message); }
  });
}

const accountOptions = (team, selected) => cache[team].accounts.map((a) => {
  const b = state.brands.find((x) => x.id === a.brand_id)?.name || '';
  return `<option value="${a.id}" ${String(a.id) === String(selected) ? 'selected' : ''}>${esc(a.name)} · ${esc(b)} · ${esc(cache[team].platforms[a.platform] || a.platform)}</option>`;
}).join('');

function importForm(team, accountId) {
  if (!cache[team].accounts.length) return toast('Tambah akun iklan dulu');
  openModal(`<form id="ads-imp-form"><h3>Impor CSV laporan iklan</h3>
    <ol class="steps"><li>Buka dashboard iklan (Meta Ads Manager, TikTok Ads, Google Ads, Shopee Iklan Saya, TikTok Shop Ads, TopAds, Lazada Sponsored).</li>
    <li>Pilih periode, rincian <b>per hari</b> kalau bisa, lalu <b>Export/Unduh</b> sebagai CSV (file Excel: Simpan Sebagai → CSV).</li>
    <li>Upload di sini. Kolom dikenali otomatis: tanggal, kampanye/produk, biaya, impresi, klik, pesanan/konversi, penjualan/GMV.</li></ol>
    <label class="label" for="ai-acc">Masuk ke akun</label><select id="ai-acc">${accountOptions(team, accountId)}</select>
    <label class="label" for="ai-day">Tanggal (dipakai kalau file tidak punya kolom tanggal)</label><input id="ai-day" type="date" value="${today()}">
    <label class="dropzone"><input type="file" id="ai-file" accept=".csv,.txt,text/csv" hidden><div id="ai-file-label">Pilih file .csv</div></label>
    <details class="manual"><summary>atau tempel isi CSV</summary><textarea id="ai-text" rows="6" placeholder="Tanggal,Kampanye,Biaya,Impresi,Klik,Pesanan,Penjualan"></textarea></details>
    <div id="ai-result"></div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Tutup</button><button class="primary">Impor</button></div></form>`);
  $('#modal-box').classList.add('wide');
  $('#ai-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $('#ai-text').value = await f.text();
    $('#ai-file-label').textContent = f.name;
  });
  $('#ads-imp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api(`/api/ads/${team}/import`, json('POST', { account_id: Number($('#ai-acc').value), day: $('#ai-day').value, csv: $('#ai-text').value }));
      $('#ai-result').innerHTML = `<div class="check ok">✓ ${r.rows} baris masuk (${r.days.length} hari: ${esc(r.days[0] || '')}${r.days.length > 1 ? ` – ${esc(r.days[r.days.length - 1])}` : ''}). Kolom terbaca: ${r.columns.map(esc).join(', ')}.</div>`;
      draw(team);
    } catch (ex) { $('#ai-result').innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; }
  });
}

function manualForm(team) {
  if (!cache[team].accounts.length) return toast('Tambah akun iklan dulu');
  openModal(`<form id="ads-man-form"><h3>Input manual</h3>
    <div class="form-grid">
      <div class="span-2"><label class="label" for="am-acc">Akun</label><select id="am-acc" name="account_id">${accountOptions(team)}</select></div>
      <div><label class="label" for="am-day">Tanggal</label><input id="am-day" name="day" type="date" value="${today()}" required></div>
      <div><label class="label" for="am-camp">Kampanye / produk</label><input id="am-camp" name="campaign" placeholder="opsional"></div>
      <div><label class="label" for="am-spend">Spend (Rp)</label><input id="am-spend" name="spend" inputmode="decimal"></div>
      <div><label class="label" for="am-imp">Impresi</label><input id="am-imp" name="impressions" inputmode="numeric"></div>
      <div><label class="label" for="am-clk">Klik</label><input id="am-clk" name="clicks" inputmode="numeric"></div>
      <div><label class="label" for="am-conv">Konversi / pesanan</label><input id="am-conv" name="conversions" inputmode="numeric"></div>
      <div><label class="label" for="am-rev">Revenue / GMV (Rp)</label><input id="am-rev" name="revenue" inputmode="decimal"></div>
    </div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  $('#ads-man-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/ads/${team}/rows`, json('POST', Object.fromEntries(new FormData(e.target))));
      closeModal();
      toast('Tersimpan');
      draw(team);
    } catch (ex) { toast(ex.message); }
  });
}

function bind(team) {
  const root = $(`#view-${team}`);
  root.addEventListener('click', async (e) => {
    const d = e.target.dataset;
    const u = ui[team];
    if (d.adsTab) { u.tab = d.adsTab; draw(team).catch((ex) => toast(ex.message)); }
    if (d.adsAdd !== undefined) accountForm(team);
    if (d.adsManual !== undefined) manualForm(team);
    if (d.adsImport !== undefined) importForm(team, d.adsImport);
    if (d.adsEdit) accountForm(team, cache[team].accounts.find((a) => a.id === Number(d.adsEdit)));
    if (d.adsDel && confirm('Hapus akun iklan ini beserta semua angkanya?')) {
      await api(`/api/ads/${team}/accounts/${d.adsDel}`, { method: 'DELETE' }).catch((ex) => toast(ex.message));
      draw(team);
    }
    if (d.adsDelrow) {
      await api(`/api/ads/${team}/rows/${d.adsDelrow}`, { method: 'DELETE' }).catch((ex) => toast(ex.message));
      draw(team);
    }
    if (d.adsSync) {
      e.target.disabled = true;
      e.target.textContent = 'Menarik…';
      try {
        const r = await api(`/api/ads/${team}/accounts/${d.adsSync}/sync`, json('POST', { days: 30 }));
        toast(`${r.rows} baris kampanye harian diperbarui`);
      } catch (ex) { toast(ex.message); }
      draw(team);
    }
  });
  root.addEventListener('change', (e) => {
    const u = ui[team];
    if (e.target.matches('[data-ads-days]')) u.days = Number(e.target.value);
    else if (e.target.matches('[data-ads-only]')) u.only = e.target.value;
    else if (e.target.matches('[data-ads-account]')) u.account = e.target.value;
    else return;
    draw(team).catch((ex) => toast(ex.message));
  });
}

for (const team of ['adv', 'mp']) {
  bind(team);
  S.viewHooks[team] = () => draw(team).catch((ex) => toast(ex.message));
}

window.timAds = { reportHtml };
