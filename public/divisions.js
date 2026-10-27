// Tab tambahan untuk workspace divisi (Tahap 3): ADV, MP, KOL, Affiliate, CS.
// Dipasang lewat titik sambung yang sudah ada: window.timOps.adsTabs (ads.js), window.timPX (partners.js),
// dan tab #cs-tabs (teams.js). Tab bawaan tidak diubah.
// Data yang belum punya endpoint backend (toko omnichannel, live, lead CS harian) disimpan per brand di browser ini.
const S = window.siarin;
const { api, esc, state } = S;
const $ = (sel, el = document) => el.querySelector(sel);
const DAY = 86400_000;
const num = (n) => (n == null || !Number.isFinite(Number(n)) ? '–' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 }));
const cpt = (n) => (n == null ? '–' : Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const rp = (n) => (n == null || !Number.isFinite(Number(n)) ? '–' : `Rp${Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`);
const rpc = (n) => (n == null ? '–' : `Rp${cpt(Number(n))}`);
const pct = (v, d = 2) => (v == null || !Number.isFinite(v) ? '–' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: d })}%`);
const x2 = (v) => (v == null || !Number.isFinite(v) ? '–' : `${Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 })}x`);
const div = (a, b) => (b ? a / b : null);
const since = (days) => new Date(Date.now() - days * DAY).toISOString();
const todayStr = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const fmtDay = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }) : '–');
const uid = () => Math.random().toString(36).slice(2, 10);
const brand = () => state.brands.find((b) => b.id === state.brandId);

// Penyimpanan lokal per brand (sampai ada endpoint backend).
const local = {
  key: (k) => `timai.local.${state.brandId || 0}.${k}`,
  get(k) { try { return JSON.parse(localStorage.getItem(this.key(k))) || []; } catch { return []; } },
  set(k, v) { try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch { S.toast('Gagal menyimpan di browser (mode privat?)'); } },
};
const localNote = () => `<p class="hint local-note">💾 Data tab ini tersimpan di browser ini untuk brand <b>${esc(brand()?.name || '-')}</b> (belum di database tim). Ekspor CSV untuk dibagikan.</p>`;

const kpis = (items) => `<div class="kpi-row">${items.map((k) => `<div class="kpi"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div>${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>`).join('')}</div>`;
const tbl = (head, rows, empty) => (rows.length
  ? `<div class="table-wrap"><table class="data"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<div class="empty">${empty}</div>`);
function csv(name, head, rows) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob([`﻿${[head, ...rows].map((r) => r.map(q).join(',')).join('\n')}`], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${name}-${todayStr()}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  S.toast('CSV diunduh');
}
const formData = (form) => Object.fromEntries(new FormData(form));

// Menyisipkan tombol tab tambahan setiap kali modul asli menggambar ulang barisan tab.
function injectTabs(viewId, tabsSel, attr, extra, isActive) {
  const view = document.getElementById(viewId);
  if (!view) return;
  const apply = () => {
    const bar = $(tabsSel, view);
    if (!bar || bar.querySelector('[data-x-tab]')) return;
    for (const [k, l] of extra) {
      const b = document.createElement('button');
      b.setAttribute(attr, k);
      b.dataset.xTab = k;
      b.innerHTML = `${l} <span class="x-new">baru</span>`;
      if (isActive?.(k)) { bar.querySelectorAll('button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); }
      bar.append(b);
    }
  };
  new MutationObserver(apply).observe(view, { childList: true, subtree: true });
  apply();
}
const markActive = (view, attr, k) => document.querySelectorAll(`#${view} [${attr}]`).forEach((b) => b.classList.toggle('active', b.getAttribute(attr) === k));

// =====================================================================
// TIM ADV — Daily Ads Tracker (metrik turunan + bendera)
// =====================================================================
const THRESH = { roas: 1.5, ctr: 0.01, cpm: 60000 };
async function advTracker(team, body, u) {
  markActive(`view-${team}`, 'data-ads-tab', 'tracker');
  const q = `from=${encodeURIComponent(since(u.days))}${u.only ? `&only=${u.only}` : ''}`;
  const r = await api(`/api/reports/team/${team}?${q}`);
  const days = [...(r.daily || [])].sort((a, b) => String(b.day).localeCompare(String(a.day)));
  const t = days.reduce((a, d) => {
    for (const k of ['spend', 'impressions', 'clicks', 'conversions', 'revenue']) a[k] += Number(d[k]) || 0;
    return a;
  }, { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
  const m = (d) => ({
    cpm: div(d.spend * 1000, d.impressions), ctr: div(d.clicks, d.impressions), cpc: div(d.spend, d.clicks),
    cpr: div(d.spend, d.conversions), roas: div(d.revenue, d.spend), cvr: div(d.conversions, d.clicks),
  });
  const tm = m(t);
  const flag = (k, v) => {
    if (v == null) return '';
    if (k === 'roas') return v < 1 ? 'bad' : v < THRESH.roas ? 'warn' : 'ok';
    if (k === 'ctr') return v < THRESH.ctr / 2 ? 'bad' : v < THRESH.ctr ? 'warn' : 'ok';
    if (k === 'cpm') return v > THRESH.cpm * 1.5 ? 'bad' : v > THRESH.cpm ? 'warn' : '';
    return '';
  };
  const cell = (k, v, f) => `<td class="${flag(k, v) ? `m-${flag(k, v)}` : ''}" data-num>${f(v)}</td>`;
  const bad = days.filter((d) => { const x = m(d); return (x.roas != null && x.roas < 1) || (x.ctr != null && x.ctr < THRESH.ctr / 2); });
  body.innerHTML = `
    ${kpis([
    { label: 'Spend', value: rpc(t.spend), sub: `${days.length} hari data` },
    { label: 'CPM', value: rp(tm.cpm), sub: `${cpt(t.impressions)} impresi` },
    { label: 'CTR', value: pct(tm.ctr), sub: `CPC ${rp(tm.cpc)}` },
    { label: 'Leads / checkout', value: num(t.conversions), sub: `CPR ${rp(tm.cpr)}` },
    { label: 'Revenue', value: rpc(t.revenue), sub: `CVR ${pct(tm.cvr)}` },
    { label: 'ROAS', value: x2(tm.roas), sub: tm.roas != null && tm.roas < 1 ? '⚠️ rugi' : 'target ≥ 1,5x' },
  ])}
    ${bad.length ? `<div class="x-alert bad">🚩 <b>${bad.length} hari</b> dengan ROAS &lt; 1x atau CTR &lt; 0,5%: ${bad.slice(0, 5).map((d) => fmtDay(d.day)).join(', ')}${bad.length > 5 ? '…' : ''}. Cek kreatif & audiens di Kanban Testing Iklan.</div>` : ''}
    <div class="row-between"><div class="label">Tracker harian</div>
      <div class="btn-row"><span class="hint"><span class="lg m-ok"></span> sehat <span class="lg m-warn"></span> waspada <span class="lg m-bad"></span> merah</span>
      <button class="ghost small" data-x-csv>Ekspor CSV</button></div></div>
    ${tbl(['Tanggal', 'Spend', 'Impresi', 'CPM', 'Klik', 'CTR', 'CPC', 'Leads/CO', 'CPR', 'Revenue', 'ROAS'],
    days.map((d) => { const x = m(d); return `<tr><td>${fmtDay(d.day)}</td><td data-num>${rp(d.spend)}</td><td data-num>${num(d.impressions)}</td>${cell('cpm', x.cpm, rp)}<td data-num>${num(d.clicks)}</td>${cell('ctr', x.ctr, pct)}<td data-num>${rp(x.cpc)}</td><td data-num>${num(d.conversions)}</td><td data-num>${rp(x.cpr)}</td><td data-num>${rp(d.revenue)}</td>${cell('roas', x.roas, x2)}</tr>`; }),
    'Belum ada data harian. Impor CSV atau hubungkan akun iklan di Integrasi Cepat.')}
    <p class="hint">Metrik turunan dihitung dari angka harian: CPM = spend ÷ impresi × 1.000 · CTR = klik ÷ impresi · CPC = spend ÷ klik · CPR = spend ÷ leads/checkout · ROAS = revenue ÷ spend.</p>`;
  $('[data-x-csv]', body).onclick = () => csv(`tracker-${team}`, ['Tanggal', 'Spend', 'Impresi', 'CPM', 'Klik', 'CTR', 'CPC', 'Leads', 'CPR', 'Revenue', 'ROAS'],
    days.map((d) => { const x = m(d); return [d.day, d.spend, d.impressions, x.cpm?.toFixed(0), d.clicks, x.ctr?.toFixed(4), x.cpc?.toFixed(0), d.conversions, x.cpr?.toFixed(0), d.revenue, x.roas?.toFixed(2)]; }));
}

// =====================================================================
// TIM MP — Toko Omnichannel & Live Command Center
// =====================================================================
const MPS = [['shopee', 'Shopee'], ['tiktok_shop', 'TikTok Shop'], ['tokopedia', 'Tokopedia'], ['lazada', 'Lazada']];
const mpName = (k) => MPS.find((m) => m[0] === k)?.[1] || k;
async function mpStore(team, body, u) {
  markActive(`view-${team}`, 'data-ads-tab', 'store');
  const rows = local.get('mpStore');
  const from = todayStr().slice(0, 10);
  const cutoff = new Date(Date.now() - u.days * DAY).toISOString().slice(0, 10);
  const inRange = rows.filter((r) => r.day >= cutoff && r.day <= from);
  const sum = (list) => list.reduce((a, r) => ({ gmv: a.gmv + Number(r.gmv || 0), orders: a.orders + Number(r.orders || 0), visitors: a.visitors + Number(r.visitors || 0) }), { gmv: 0, orders: 0, visitors: 0 });
  const t = sum(inRange);
  const per = MPS.map(([k, l]) => ({ k, l, ...sum(inRange.filter((r) => r.mp === k)) }));
  const maxG = Math.max(1, ...per.map((p) => p.gmv));
  body.innerHTML = `
    ${kpis([
    { label: 'GMV', value: rpc(t.gmv), sub: `${u.days} hari · semua marketplace` },
    { label: 'Pesanan', value: num(t.orders) },
    { label: 'Pengunjung', value: cpt(t.visitors) },
    { label: 'CVR', value: pct(div(t.orders, t.visitors)), sub: 'pesanan ÷ pengunjung' },
    { label: 'AOV', value: rp(div(t.gmv, t.orders)), sub: 'GMV ÷ pesanan' },
  ])}
    <div class="x-grid">
      <div class="card"><div class="label">Per marketplace</div>
        <div class="mp-bars">${per.map((p, i) => `<div class="mp-row"><span class="mp-name">${p.l}</span>
          <div class="mini-track"><div class="mini-bar" style="width:${(p.gmv / maxG) * 100}%; background: var(--c${i + 1})"></div></div>
          <span data-num>${rpc(p.gmv)}</span><span class="hint" data-num>${num(p.orders)} order · CVR ${pct(div(p.orders, p.visitors), 1)} · AOV ${rpc(div(p.gmv, p.orders))}</span></div>`).join('')}</div>
      </div>
      <form class="card" id="mp-in"><div class="label">Input harian toko</div>
        <div class="form-grid">
          <div><label class="label">Tanggal</label><input name="day" type="date" value="${todayStr()}" required></div>
          <div><label class="label">Marketplace</label><select name="mp">${MPS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div><label class="label">GMV (Rp)</label><input name="gmv" type="number" min="0" required></div>
          <div><label class="label">Pesanan</label><input name="orders" type="number" min="0" required></div>
          <div><label class="label">Pengunjung</label><input name="visitors" type="number" min="0" required></div>
          <div class="x-actions"><button class="primary">Simpan</button></div>
        </div><p class="hint">Input ulang tanggal + marketplace yang sama = menimpa angka lama.</p></form>
    </div>
    <div class="row-between"><div class="label">Riwayat</div><button class="ghost small" data-x-csv>Ekspor CSV</button></div>
    ${tbl(['Tanggal', 'Marketplace', 'GMV', 'Pesanan', 'Pengunjung', 'CVR', 'AOV', ''],
    [...inRange].sort((a, b) => b.day.localeCompare(a.day)).map((r) => `<tr><td>${fmtDay(r.day)}</td><td>${mpName(r.mp)}</td><td data-num>${rp(r.gmv)}</td><td data-num>${num(r.orders)}</td><td data-num>${num(r.visitors)}</td><td data-num>${pct(div(r.orders, r.visitors))}</td><td data-num>${rp(div(r.gmv, r.orders))}</td><td><button class="asset-del static" data-x-del="${r.id}" aria-label="Hapus">✕</button></td></tr>`),
    'Belum ada angka toko. Isi form di atas tiap hari (atau tiap akhir shift).')}
    ${localNote()}`;
  $('#mp-in', body).onsubmit = (e) => {
    e.preventDefault();
    const v = formData(e.target);
    const all = local.get('mpStore').filter((r) => !(r.day === v.day && r.mp === v.mp));
    all.push({ id: uid(), ...v, gmv: Number(v.gmv), orders: Number(v.orders), visitors: Number(v.visitors) });
    local.set('mpStore', all);
    S.toast(`Tersimpan: ${mpName(v.mp)} ${fmtDay(v.day)}`);
    mpStore(team, body, u);
  };
  body.onclick = (e) => {
    if (e.target.closest('[data-x-csv]')) csv('toko-omnichannel', ['Tanggal', 'Marketplace', 'GMV', 'Pesanan', 'Pengunjung'], inRange.map((r) => [r.day, mpName(r.mp), r.gmv, r.orders, r.visitors]));
    const del = e.target.closest('[data-x-del]');
    if (del && confirm('Hapus baris ini?')) { local.set('mpStore', local.get('mpStore').filter((r) => r.id !== del.dataset.xDel)); S.toast('Baris dihapus'); mpStore(team, body, u); }
  };
}

async function mpLive(team, body, u) {
  markActive(`view-${team}`, 'data-ads-tab', 'live');
  const all = local.get('mpLive').sort((a, b) => `${a.day}${a.start}`.localeCompare(`${b.day}${b.start}`));
  const today = todayStr();
  const upcoming = all.filter((s) => s.day >= today && !s.gmv);
  const done = all.filter((s) => s.gmv || s.day < today).reverse();
  const doneRange = done.filter((s) => s.day >= new Date(Date.now() - u.days * DAY).toISOString().slice(0, 10));
  const tot = doneRange.reduce((a, s) => ({ gmv: a.gmv + Number(s.gmv || 0), hours: a.hours + hoursOf(s), peak: Math.max(a.peak, Number(s.peak || 0)), orders: a.orders + Number(s.orders || 0) }), { gmv: 0, hours: 0, peak: 0, orders: 0 });
  const hosts = {};
  for (const s of doneRange) for (const h of [s.host, s.cohost].filter(Boolean)) { hosts[h] ||= { gmv: 0, n: 0, hours: 0 }; hosts[h].gmv += Number(s.gmv || 0) / (s.cohost ? 2 : 1); hosts[h].n++; hosts[h].hours += hoursOf(s); }
  const hostRank = Object.entries(hosts).sort((a, b) => b[1].gmv - a[1].gmv);
  body.innerHTML = `
    ${kpis([
    { label: 'Sesi live', value: num(doneRange.length), sub: `${tot.hours.toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam · ${u.days} hari` },
    { label: 'GMV live', value: rpc(tot.gmv), sub: `${num(tot.orders)} pesanan` },
    { label: 'GMV per jam', value: rpc(div(tot.gmv, tot.hours)) },
    { label: 'Viewer peak tertinggi', value: cpt(tot.peak) },
    { label: 'Jadwal mendatang', value: num(upcoming.length) },
  ])}
    <div class="x-grid">
      <div class="card"><div class="row-between"><div class="label">Jadwal shift live</div><span class="hint">klik "Isi hasil" setelah live selesai</span></div>
        ${upcoming.length ? `<div class="live-list">${upcoming.slice(0, 8).map((s) => `<div class="live-item ${s.day === today ? 'today' : ''}">
          <div class="live-when"><b>${s.day === today ? 'Hari ini' : fmtDay(s.day)}</b><span data-num>${esc(s.start)}–${esc(s.end)}</span></div>
          <div class="live-who"><b>${esc(mpName(s.mp))}</b><span>🎙 ${esc(s.host || '–')}${s.cohost ? ` + ${esc(s.cohost)}` : ''}</span></div>
          <button class="ghost small" data-live-result="${s.id}">Isi hasil</button></div>`).join('')}</div>`
    : '<div class="empty">Belum ada jadwal live. Tambah shift di samping.</div>'}
      </div>
      <form class="card" id="live-in"><div class="label">+ Jadwalkan shift</div>
        <div class="form-grid">
          <div><label class="label">Tanggal</label><input name="day" type="date" value="${today}" required></div>
          <div><label class="label">Platform</label><select name="mp">${MPS.map(([k, l]) => `<option value="${k}" ${k === 'tiktok_shop' ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div><label class="label">Mulai</label><input name="start" type="time" value="19:00" required></div>
          <div><label class="label">Selesai</label><input name="end" type="time" value="21:00" required></div>
          <div><label class="label">Host</label><input name="host" required placeholder="nama host"></div>
          <div><label class="label">Co-host</label><input name="cohost" placeholder="opsional"></div>
          <div class="span-2"><label class="label">Fokus / SKU unggulan</label><input name="focus" placeholder="mis. Serum Vit C 30ml + bundling"></div>
          <div class="x-actions"><button class="primary">Simpan jadwal</button></div>
        </div></form>
    </div>
    ${hostRank.length ? `<div class="label">Performa host</div>${tbl(['Host', 'Sesi', 'Jam', 'GMV (dibagi co-host)', 'GMV/jam'], hostRank.map(([h, v]) => `<tr><td><b>${esc(h)}</b></td><td data-num>${v.n}</td><td data-num>${v.hours.toLocaleString('id-ID', { maximumFractionDigits: 1 })}</td><td data-num>${rp(v.gmv)}</td><td data-num>${rp(div(v.gmv, v.hours))}</td></tr>`), '')}` : ''}
    <div class="row-between"><div class="label">Riwayat sesi</div><button class="ghost small" data-x-csv>Ekspor CSV</button></div>
    ${tbl(['Tanggal', 'Platform', 'Host', 'Durasi', 'GMV', 'Pesanan', 'Viewer peak', 'GMV/jam', 'SKU terlaris', ''],
    done.map((s) => `<tr><td>${fmtDay(s.day)}<div class="hint" data-num>${esc(s.start)}–${esc(s.end)}</div></td><td>${esc(mpName(s.mp))}</td><td>${esc(s.host || '–')}${s.cohost ? `<div class="hint">+ ${esc(s.cohost)}</div>` : ''}</td><td data-num>${hoursOf(s).toLocaleString('id-ID', { maximumFractionDigits: 1 })} j</td><td data-num>${s.gmv ? rp(s.gmv) : '<span class="hint">belum diisi</span>'}</td><td data-num>${num(s.orders)}</td><td data-num>${num(s.peak)}</td><td data-num>${rp(div(Number(s.gmv), hoursOf(s)))}</td><td>${esc(s.sku || '–')}</td>
      <td class="nowrap"><button class="link small" data-live-result="${s.id}">Edit</button> <button class="asset-del static" data-x-del="${s.id}" aria-label="Hapus">✕</button></td></tr>`),
    'Belum ada sesi selesai.')}
    ${localNote()}`;
  $('#live-in', body).onsubmit = (e) => {
    e.preventDefault();
    const v = formData(e.target);
    local.set('mpLive', [...local.get('mpLive'), { id: uid(), ...v }]);
    S.toast(`Shift live dijadwalkan: ${fmtDay(v.day)} ${v.start}`);
    mpLive(team, body, u);
  };
  body.onclick = (e) => {
    if (e.target.closest('[data-x-csv]')) csv('live-sesi', ['Tanggal', 'Mulai', 'Selesai', 'Platform', 'Host', 'Co-host', 'GMV', 'Pesanan', 'Viewer peak', 'SKU terlaris'], done.map((s) => [s.day, s.start, s.end, mpName(s.mp), s.host, s.cohost, s.gmv, s.orders, s.peak, s.sku]));
    const del = e.target.closest('[data-x-del]');
    if (del && confirm('Hapus sesi ini?')) { local.set('mpLive', local.get('mpLive').filter((s) => s.id !== del.dataset.xDel)); S.toast('Sesi dihapus'); mpLive(team, body, u); return; }
    const res = e.target.closest('[data-live-result]');
    if (!res) return;
    const s = local.get('mpLive').find((x) => x.id === res.dataset.liveResult);
    S.openModal(`<form id="lr-form"><h3>Hasil live · ${esc(fmtDay(s.day))} ${esc(s.start)}</h3>
      <div class="form-grid">
        <div><label class="label">GMV (Rp)</label><input name="gmv" type="number" min="0" value="${esc(s.gmv || '')}" required></div>
        <div><label class="label">Pesanan</label><input name="orders" type="number" min="0" value="${esc(s.orders || '')}"></div>
        <div><label class="label">Viewer peak</label><input name="peak" type="number" min="0" value="${esc(s.peak || '')}"></div>
        <div><label class="label">SKU terlaris</label><input name="sku" value="${esc(s.sku || s.focus || '')}"></div>
      </div>
      <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan hasil</button></div></form>`);
    $('#lr-form').onsubmit = (ev) => {
      ev.preventDefault();
      const v = formData(ev.target);
      local.set('mpLive', local.get('mpLive').map((x) => (x.id === s.id ? { ...x, ...v } : x)));
      S.closeModal();
      S.toast('Hasil live tersimpan');
      mpLive(team, body, u);
    };
  };
}
function hoursOf(s) {
  const [h1, m1] = String(s.start || '0:0').split(':').map(Number);
  const [h2, m2] = String(s.end || '0:0').split(':').map(Number);
  let d = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
  if (d <= 0) d += 24; // lewat tengah malam
  return d;
}

// =====================================================================
// TIM KOL — Kalkulator CPM & ROI
// =====================================================================
async function kolRoi(team, body, ctx) {
  const { u } = ctx;
  const q = `from=${encodeURIComponent(since(u.days))}${u.only ? `&only=${u.only}` : ''}`;
  const r = await api(`/api/reports/team/${team}?${q}`).catch(() => ({ partners: [] }));
  const rows = (r.partners || []).map((p) => {
    const views = p.views ?? (p.median_views != null && p.posts ? p.median_views * p.posts : null);
    const eng = views != null && p.er != null ? views * p.er : null;
    return { ...p, views, cpm: div(p.cost * 1000, views), cpe: div(p.cost, eng), roi: p.cost ? (Number(p.revenue || 0) - p.cost) / p.cost : null };
  }).filter((p) => p.cost || p.views);
  const cpms = rows.map((p) => p.cpm).filter((v) => v != null).sort((a, b) => a - b);
  const medCpm = cpms.length ? cpms[Math.floor(cpms.length / 2)] : null;
  const verdict = (p) => {
    if (p.roi != null && p.roi >= 1) return ['ok', '🟢 Repeat order'];
    if (p.cpm != null && medCpm != null && p.cpm <= medCpm && (p.roi == null || p.roi >= 0)) return ['ok', '🟢 CPM efisien'];
    if (p.roi != null && p.roi < -0.5) return ['bad', '🔴 Overpriced'];
    return ['warn', '🟡 Nego ulang'];
  };
  rows.sort((a, b) => (b.roi ?? -9) - (a.roi ?? -9) || (a.cpm ?? 9e9) - (b.cpm ?? 9e9));
  body.innerHTML = `
    <div class="x-grid">
      <form class="card calc" id="roi-calc"><div class="label">Kalkulator cepat</div>
        <div class="form-grid">
          <div><label class="label">Biaya KOL (Rp)</label><input name="cost" type="number" min="0" value="2500000"></div>
          <div><label class="label">Views</label><input name="views" type="number" min="0" value="180000"></div>
          <div><label class="label">Engagement (like+komen+share+save)</label><input name="eng" type="number" min="0" value="9200"></div>
          <div><label class="label">Pesanan</label><input name="orders" type="number" min="0" value="64"></div>
          <div><label class="label">Omzet ter-atribusi (Rp)</label><input name="revenue" type="number" min="0" value="7680000"></div>
          <div><label class="label">Followers (opsional)</label><input name="followers" type="number" min="0" value=""></div>
        </div>
        <div class="calc-out" id="roi-out"></div>
      </form>
      <div class="card"><div class="label">Patokan membaca hasil</div>
        <ul class="x-list">
          <li><b>CPM</b> = biaya ÷ views × 1.000. Bandingkan dengan CPM iklan (Tim ADV): KOL layak kalau CPM-nya ≤ CPM iklan atau membawa penjualan.</li>
          <li><b>CPE</b> = biaya ÷ engagement. Cocok untuk campaign awareness.</li>
          <li><b>ROI</b> = (omzet − biaya) ÷ biaya. ROI ≥ 100% → masuk daftar repeat order.</li>
          <li><b>ER by views</b> rendah (&lt; 2%) + views tinggi = curiga views tidak organik.</li>
        </ul>
        ${medCpm != null ? `<p class="hint">Median CPM roster periode ini: <b data-num>${rp(medCpm)}</b></p>` : ''}
      </div>
    </div>
    <div class="row-between"><div class="label">Peringkat KOL (${u.days} hari) — dihitung otomatis dari hasil konten</div><button class="ghost small" data-x-csv>Ekspor CSV</button></div>
    ${tbl(['#', 'KOL', 'Brand', 'Biaya', 'Views', 'CPM', 'CPE', 'Pesanan', 'Omzet', 'ROI', 'Rekomendasi'],
    rows.map((p, i) => { const [tone, label] = verdict(p); return `<tr><td data-num>${i + 1}</td><td><b>${esc(p.name)}</b>${p.handle ? `<div class="hint">@${esc(p.handle)}</div>` : ''}</td><td>${esc(p.brand || '')}</td><td data-num>${rp(p.cost)}</td><td data-num>${cpt(p.views)}</td><td data-num>${rp(p.cpm)}</td><td data-num>${rp(p.cpe)}</td><td data-num>${num(p.orders)}</td><td data-num>${rp(p.revenue)}</td><td data-num class="${p.roi == null ? '' : p.roi >= 0 ? 'm-ok' : 'm-bad'}">${pct(p.roi, 0)}</td><td><span class="pill ${tone}">${label}</span></td></tr>`; }),
    'Belum ada KOL dengan biaya / hasil konten. Isi lewat tab "Input hasil".')}`;
  const calc = () => {
    const v = Object.fromEntries(Object.entries(formData($('#roi-calc', body))).map(([k, x]) => [k, Number(x) || 0]));
    const roi = v.cost ? (v.revenue - v.cost) / v.cost : null;
    const items = [
      ['CPM', rp(div(v.cost * 1000, v.views))], ['CPE', rp(div(v.cost, v.eng))], ['ER by views', pct(div(v.eng, v.views))],
      ['Biaya / pesanan', rp(div(v.cost, v.orders))], ['ROAS', x2(div(v.revenue, v.cost))], ['ROI', pct(roi, 0)],
    ];
    if (v.followers) items.push(['Views ÷ followers', pct(div(v.views, v.followers), 0)]);
    const tone = roi == null ? 'info' : roi >= 1 ? 'ok' : roi >= 0 ? 'warn' : 'bad';
    $('#roi-out', body).innerHTML = `${items.map(([l, x]) => `<div><span class="hint">${l}</span><b data-num>${x}</b></div>`).join('')}
      <div class="span-all"><span class="pill ${tone}">${roi == null ? 'Isi biaya dulu' : roi >= 1 ? '🟢 Layak repeat order' : roi >= 0 ? '🟡 Balik modal, nego ratecard' : '🔴 Rugi di level penjualan'}</span></div>`;
  };
  $('#roi-calc', body).oninput = calc;
  $('#roi-calc', body).onsubmit = (e) => e.preventDefault();
  calc();
  $('[data-x-csv]', body).onclick = () => csv('kol-roi', ['KOL', 'Brand', 'Biaya', 'Views', 'CPM', 'CPE', 'Pesanan', 'Omzet', 'ROI'], rows.map((p) => [p.name, p.brand, p.cost, p.views, p.cpm?.toFixed(0), p.cpe?.toFixed(0), p.orders, p.revenue, p.roi?.toFixed(3)]));
}

// =====================================================================
// TIM AFFILIATE — Leaderboard & sampel terlambat
// =====================================================================
const OVERDUE_DAYS = 7;
async function affLeaderboard(team, body, ctx) {
  const { u } = ctx;
  const q = `from=${encodeURIComponent(since(u.days))}${u.only ? `&only=${u.only}` : ''}`;
  const [r, samples] = await Promise.all([
    api(`/api/reports/team/${team}?${q}`).catch(() => ({ partners: [], top: [] })),
    api(`/api/samples/${team}`).catch(() => []),
  ]);
  // Sampel sudah diterima (atau dikirim) tapi belum ada konten. Tanggal acuan: diterima → kirim + 3 hari estimasi kurir.
  const now = Date.now();
  const overdue = samples.filter((s) => ['diterima', 'dikirim'].includes(s.status)).map((s) => {
    const base = s.received_at ? new Date(s.received_at).getTime() : s.sent_at ? new Date(s.sent_at).getTime() + 3 * DAY : null;
    return { ...s, age: base ? Math.floor((now - base) / DAY) : null, estimated: !s.received_at };
  }).filter((s) => s.age != null && s.age > OVERDUE_DAYS).sort((a, b) => b.age - a.age);
  const ranked = [...(r.partners || [])].filter((p) => p.revenue || p.orders).sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
  const tier = (p) => {
    const g = Number(p.revenue || 0);
    return g >= 50_000_000 ? ['💎', 'Diamond'] : g >= 15_000_000 ? ['🥇', 'Gold'] : g >= 5_000_000 ? ['🥈', 'Silver'] : ['🥉', 'Bronze'];
  };
  const topVideos = (r.top || []).filter((x) => x.url && /^https?:/.test(x.url)).slice(0, 6);
  body.innerHTML = `
    ${overdue.length ? `<div class="x-alert bad"><b>⏰ ${overdue.length} kreator</b> sudah pegang sampel &gt; ${OVERDUE_DAYS} hari tapi belum upload video.
      <button class="link" data-x-copyfu>Salin pesan follow-up</button></div>
      ${tbl(['Kreator', 'Produk', 'Status sampel', 'Sejak diterima', 'Resi', ''], overdue.map((s) => `<tr class="row-bad"><td><b>${esc(s.partner_name)}</b>${s.handle ? `<div class="hint">@${esc(s.handle)}</div>` : ''}</td><td>${esc(s.product)}</td><td>${esc(s.status === 'diterima' ? 'Diterima' : 'Dikirim')}</td><td data-num><b class="m-bad">${s.age} hari</b>${s.estimated ? '<div class="hint">estimasi</div>' : ''}</td><td>${esc(s.resi || '–')}</td><td><button class="ghost small" data-x-fu="${s.id}">Salin follow-up</button></td></tr>`), '')}`
    : `<div class="x-alert ok">✅ Tidak ada sampel yang telat konten (&gt; ${OVERDUE_DAYS} hari).</div>`}
    <div class="row-between"><div class="label">Leaderboard kreator (${u.days} hari)</div><button class="ghost small" data-x-csv>Ekspor CSV</button></div>
    ${ranked.length ? `<div class="podium">${ranked.slice(0, 3).map((p, i) => `<div class="podium-card p${i + 1}"><span class="podium-rank">${['🥇', '🥈', '🥉'][i]}</span><b>${esc(p.name)}</b>${p.handle ? `<span class="hint">@${esc(p.handle)}</span>` : ''}<div class="kpi-big sm" data-num>${rpc(p.revenue)}</div><span class="hint">${num(p.orders)} pesanan · ROAS ${x2(p.roas)}</span></div>`).join('')}</div>` : ''}
    ${tbl(['#', 'Kreator', 'Tier', 'Komisi', 'Konten', 'Pesanan', 'GMV', 'ROAS'], ranked.map((p, i) => { const [ic, tl] = tier(p); return `<tr><td data-num>${i + 1}</td><td><b>${esc(p.name)}</b>${p.handle ? `<div class="hint">@${esc(p.handle)}</div>` : ''}</td><td>${ic} ${tl}</td><td data-num>${p.rate != null ? `${p.rate}%` : '–'}</td><td data-num>${num(p.posts)}</td><td data-num>${num(p.orders)}</td><td data-num><b>${rp(p.revenue)}</b></td><td data-num>${x2(p.roas)}</td></tr>`; }),
    'Belum ada GMV kreator di periode ini. Isi lewat "Input hasil" atau impor CSV.')}
    <p class="hint">Tier GMV per periode: Bronze &lt; Rp5 jt · Silver ≥ Rp5 jt · Gold ≥ Rp15 jt · Diamond ≥ Rp50 jt.</p>
    ${topVideos.length ? `<div class="label">Video pemenang (jadikan brief untuk kreator lain)</div>
      <div class="win-list">${topVideos.map((x) => `<div class="win-card"><a href="${esc(x.url)}" target="_blank" rel="noopener"><b>${esc(x.title || 'Video')}</b></a><span class="hint">${esc(x.partner)} · ${cpt(x.views)} views · ${num(x.orders)} order</span>
        <button class="ghost small" data-x-brief="${esc(x.url)}" data-title="${esc(x.title || '')}" data-partner="${esc(x.partner)}">Salin sebagai brief</button></div>`).join('')}</div>` : ''}`;
  const fuText = (s) => `Halo kak ${s.partner_name}! 🙏 Sampel ${s.product} sudah sampai sekitar ${s.age} hari lalu ya. Boleh dibantu upload videonya minggu ini? Kalau butuh brief/angle, aku kirimin ya kak. Terima kasih! ✨`;
  body.onclick = (e) => {
    const fu = e.target.closest('[data-x-fu]');
    if (fu) { const s = overdue.find((x) => String(x.id) === fu.dataset.xFu); navigator.clipboard?.writeText(fuText(s)).then(() => S.toast('Pesan follow-up disalin')); }
    if (e.target.closest('[data-x-copyfu]')) navigator.clipboard?.writeText(overdue.map(fuText).join('\n\n')).then(() => S.toast(`${overdue.length} pesan follow-up disalin`));
    const br = e.target.closest('[data-x-brief]');
    if (br) navigator.clipboard?.writeText(`BRIEF (replikasi video pemenang)\nReferensi: ${br.dataset.xBrief}\nKreator asal: ${br.dataset.partner}\nJudul/hook: ${br.dataset.title}\n\nTiru struktur: hook 3 detik pertama → demo produk → bukti/testimoni → CTA keranjang kuning. Pakai gaya bahasamu sendiri.`).then(() => S.toast('Brief disalin'));
    if (e.target.closest('[data-x-csv]')) csv('affiliate-leaderboard', ['Peringkat', 'Kreator', 'Handle', 'Tier', 'Komisi %', 'Konten', 'Pesanan', 'GMV', 'ROAS'], ranked.map((p, i) => [i + 1, p.name, p.handle, tier(p)[1], p.rate, p.posts, p.orders, p.revenue, p.roas]));
  };
}

// =====================================================================
// TIM CS — Input lead & closing harian
// =====================================================================
const CHANNELS = [['wa', 'WhatsApp'], ['ig', 'Instagram DM'], ['shopee', 'Shopee Chat'], ['tiktok', 'TikTok Shop'], ['lain', 'Lainnya']];
function csDaily(bodyEl) {
  const body = bodyEl || $('#cs-body');
  const rows = local.get('csDaily');
  const me = state.me?.user?.username || 'saya';
  const cutoff = new Date(Date.now() - 13 * DAY).toISOString().slice(0, 10);
  const recent = rows.filter((r) => r.day >= cutoff);
  const today = rows.filter((r) => r.day === todayStr());
  const sum = (list) => list.reduce((a, r) => ({ chats: a.chats + Number(r.chats || 0), fu: a.fu + Number(r.fu || 0), closing: a.closing + Number(r.closing || 0), value: a.value + Number(r.value || 0) }), { chats: 0, fu: 0, closing: 0, value: 0 });
  const t = sum(today);
  const t14 = sum(recent);
  const agents = {};
  for (const r of recent) { agents[r.agent] ||= []; agents[r.agent].push(r); }
  const days = [...new Set(recent.map((r) => r.day))].sort().reverse();
  body.innerHTML = `
    ${kpis([
    { label: 'Chat masuk hari ini', value: num(t.chats), sub: `${num(t.fu)} follow-up` },
    { label: 'Closing hari ini', value: num(t.closing), sub: `closing rate ${pct(div(t.closing, t.chats), 1)}` },
    { label: 'Nilai order hari ini', value: rpc(t.value), sub: `AOV ${rp(div(t.value, t.closing))}` },
    { label: 'Closing rate 14 hari', value: pct(div(t14.closing, t14.chats), 1), sub: `${num(t14.closing)} dari ${num(t14.chats)} chat` },
  ])}
    <div class="x-grid">
      <form class="card" id="csd-in"><div class="label">Input cepat (akhir shift)</div>
        <div class="form-grid">
          <div><label class="label">Tanggal</label><input name="day" type="date" value="${todayStr()}" required></div>
          <div><label class="label">Agent</label><input name="agent" value="${esc(me)}" required></div>
          <div><label class="label">Channel</label><select name="channel">${CHANNELS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div><label class="label">Chat masuk</label><input name="chats" type="number" min="0" required inputmode="numeric"></div>
          <div><label class="label">Follow-up dikirim</label><input name="fu" type="number" min="0" value="0" inputmode="numeric"></div>
          <div><label class="label">Closing</label><input name="closing" type="number" min="0" required inputmode="numeric"></div>
          <div class="span-2"><label class="label">Total nilai order (Rp)</label><input name="value" type="number" min="0" value="0" inputmode="numeric"></div>
          <div class="x-actions"><button class="primary">Simpan</button></div>
        </div>
        <p class="hint">Tanggal + agent + channel yang sama = menimpa. Skrip balasan: tekan <kbd>Ctrl/⌘ K</kbd> lalu ketik kata kunci, Enter = salin.</p></form>
      <div class="card"><div class="label">Per agent (14 hari)</div>
        ${tbl(['Agent', 'Chat', 'Closing', 'Closing rate', 'Nilai order'], Object.entries(agents).map(([a, list]) => { const s = sum(list); return `<tr><td><b>${esc(a)}</b></td><td data-num>${num(s.chats)}</td><td data-num>${num(s.closing)}</td><td data-num class="${div(s.closing, s.chats) >= 0.2 ? 'm-ok' : div(s.closing, s.chats) < 0.1 ? 'm-bad' : ''}">${pct(div(s.closing, s.chats), 1)}</td><td data-num>${rp(s.value)}</td></tr>`; }), 'Belum ada input.')}
      </div>
    </div>
    <div class="row-between"><div class="label">Harian per channel</div><button class="ghost small" data-x-csv>Ekspor CSV</button></div>
    ${tbl(['Tanggal', 'Agent', 'Channel', 'Chat', 'Follow-up', 'Closing', 'Closing rate', 'Nilai order', ''],
    days.flatMap((d) => recent.filter((r) => r.day === d).map((r) => `<tr><td>${fmtDay(r.day)}</td><td>${esc(r.agent)}</td><td>${esc(CHANNELS.find((c) => c[0] === r.channel)?.[1] || r.channel)}</td><td data-num>${num(r.chats)}</td><td data-num>${num(r.fu)}</td><td data-num>${num(r.closing)}</td><td data-num>${pct(div(Number(r.closing), Number(r.chats)), 1)}</td><td data-num>${rp(r.value)}</td><td><button class="asset-del static" data-x-del="${r.id}" aria-label="Hapus">✕</button></td></tr>`)),
    'Belum ada input harian.')}
    ${localNote()}`;
  $('#csd-in', body).onsubmit = (e) => {
    e.preventDefault();
    const v = formData(e.target);
    const all = local.get('csDaily').filter((r) => !(r.day === v.day && r.agent === v.agent && r.channel === v.channel));
    all.push({ id: uid(), ...v });
    local.set('csDaily', all);
    S.toast(`Tersimpan: ${v.closing} closing dari ${v.chats} chat`);
    csDaily(body);
  };
  body.onclick = (e) => {
    if (e.target.closest('[data-x-csv]')) csv('cs-harian', ['Tanggal', 'Agent', 'Channel', 'Chat', 'Follow-up', 'Closing', 'Nilai order'], recent.map((r) => [r.day, r.agent, r.channel, r.chats, r.fu, r.closing, r.value]));
    const del = e.target.closest('[data-x-del]');
    if (del && confirm('Hapus baris ini?')) { local.set('csDaily', local.get('csDaily').filter((r) => r.id !== del.dataset.xDel)); S.toast('Baris dihapus'); csDaily(body); }
  };
}

// ---------- Pemasangan ----------
const lastTab = {};
const wrapAds = (key, fn) => async (team, body, u) => { lastTab[team] = key; await fn(team, body, u); };
if (window.timOps?.adsTabs) Object.assign(window.timOps.adsTabs, { tracker: wrapAds('tracker', advTracker), store: wrapAds('store', mpStore), live: wrapAds('live', mpLive) });
injectTabs('view-adv', '[data-ads-tabs]', 'data-ads-tab', [['tracker', 'Tracker Harian']], (k) => lastTab.adv === k);
injectTabs('view-mp', '[data-ads-tabs]', 'data-ads-tab', [['store', 'Toko Omnichannel'], ['live', 'Live Command Center']], (k) => lastTab.mp === k);
// Klik tab lain di ADV/MP: lupakan tab tambahan terakhir.
for (const v of ['adv', 'mp']) document.getElementById(`view-${v}`)?.addEventListener('click', (e) => { const b = e.target.closest('[data-ads-tab]'); if (b && !b.dataset.xTab) lastTab[v] = null; }, true);

if (window.timPX) {
  window.timPX.roi = async (team, body, ctx) => { await kolRoi(team, body, ctx); markActive(`view-${team}`, 'data-p-tab', 'roi'); };
  window.timPX.leaderboard = async (team, body, ctx) => { await affLeaderboard(team, body, ctx); markActive(`view-${team}`, 'data-p-tab', 'leaderboard'); };
}
const pActive = {};
injectTabs('view-kol', '.page-head ~ .tabs', 'data-p-tab', [['roi', 'Kalkulator CPM & ROI']], (k) => pActive.kol === k);
injectTabs('view-affiliate', '.page-head ~ .tabs', 'data-p-tab', [['leaderboard', 'Leaderboard & Alert']], (k) => pActive.affiliate === k);
for (const v of ['kol', 'affiliate']) document.getElementById(`view-${v}`)?.addEventListener('click', (e) => { const b = e.target.closest('[data-p-tab]'); if (b) pActive[v] = b.dataset.xTab || null; }, true);

// CS: tab tambahan dirender sendiri (csDraw di teams.js tidak mengenal tab ini).
const csView = document.getElementById('view-cs');
if (csView) {
  let csLocalOn = false;
  injectTabs('view-cs', '#cs-tabs', 'data-cs-x', [['daily', 'Lead & Closing Harian']], () => false);
  csView.addEventListener('click', (e) => {
    const mine = e.target.closest('[data-cs-x]');
    const other = e.target.closest('#cs-tabs [data-cs]');
    if (other) { csLocalOn = false; return; }
    if (!mine) return;
    csLocalOn = true;
    csView.querySelectorAll('#cs-tabs button').forEach((b) => b.classList.toggle('active', b === mine));
    csDaily();
  });
  // teams.js menggambar ulang tab aktifnya sendiri saat halaman dibuka lagi; tab kita tidak ikut ditandai.
  new MutationObserver(() => { if (csLocalOn && !$('#csd-in', csView)) csLocalOn = false; }).observe(csView, { childList: true, subtree: true });
}
