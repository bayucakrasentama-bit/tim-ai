// Dashboard eksekutif (bento grid). Menggantikan render Dashboard dari suite.js lewat viewHooks.
// Sumber data sama dengan halaman lain: /api/analytics/summary, /api/metrics, /api/content,
// /api/posts, /api/reports/team/{adv,mp}. Tidak ada angka karangan: tile tanpa data menampilkan empty state.
const S = window.siarin;
const { api, esc, state } = S;
const $ = (sel, el = document) => el.querySelector(sel);

const DAY = 86400_000;
const num = (n) => (n == null ? '–' : Number(n).toLocaleString('id-ID'));
const compact = (n) => (n == null ? '–' : Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? '–' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: d })}%`);
const rpc = (n) => `Rp${compact(Number(n || 0))}`;
const x2 = (n) => (n == null || !Number.isFinite(n) ? '–' : `${Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 })}x`);
const since = (days) => new Date(Date.now() - days * DAY).toISOString();
const wibDay = (d) => new Date(new Date(d).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* mode privat */ } },
};

const STAGES = [
  { id: 'ide', label: 'Ide', tone: 'info' }, { id: 'draft', label: 'Draft', tone: 'info' },
  { id: 'review', label: 'Review', tone: 'warn' }, { id: 'siap', label: 'Siap', tone: 'ok' },
  { id: 'terjadwal', label: 'Terjadwal', tone: 'warn' }, { id: 'tayang', label: 'Tayang', tone: 'ok' },
];
const PLATFORMS = [
  { id: 'tiktok', label: 'TikTok', color: 'var(--c1)' }, { id: 'instagram', label: 'IG Reels', color: 'var(--c2)' },
  { id: 'youtube', label: 'YT Shorts', color: 'var(--c3)' }, { id: 'facebook', label: 'Facebook', color: 'var(--c4)' },
];
const RANGES = [[7, '7 hari'], [30, '30 hari'], [90, '90 hari'], [365, '1 tahun']];

const ui = {
  days: store.get('timai.dashDays', 30),
  platforms: new Set(store.get('timai.dashPlatforms', PLATFORMS.map((p) => p.id))),
  data: null,
};
const brandKey = () => `timai.target.${state.brandId || 0}`;

// ---------- Kerangka ----------
const view = $('#view-dashboard');
view.classList.add('bento-view');
view.innerHTML = `
  <div class="row-between">
    <div><h1 id="dash-title">Dashboard</h1><div class="hint bento-sub" id="bn-sync"></div></div>
    <div class="btn-row">
      <div class="seg" id="bn-range" role="tablist" aria-label="Periode">${RANGES.map(([d, l]) => `<button role="tab" data-days="${d}">${l}</button>`).join('')}</div>
      <button class="ghost" id="bn-refresh" title="Muat ulang data">↻</button>
    </div>
  </div>
  <div class="bento" id="bento">
    <div class="tile kpi-tile" id="bn-views"></div>
    <div class="tile kpi-tile" id="bn-er"></div>
    <div class="tile kpi-tile" id="bn-target"></div>
    <div class="tile kpi-tile" id="bn-ads"></div>
    <div class="tile span-7" id="bn-funnel"></div>
    <div class="tile span-5" id="bn-pipeline"></div>
    <div class="tile span-8" id="bn-chart"></div>
    <div class="tile span-4" id="bn-upcoming"></div>
  </div>`;
const skeleton = () => view.querySelectorAll('.tile').forEach((t) => { t.innerHTML = '<div class="sk sk-l"></div><div class="sk sk-xl"></div><div class="sk sk-m"></div>'; });

// ---------- Komponen kecil ----------
function delta(cur, prev, { inverse = false } = {}) {
  if (!prev || cur == null) return '<span class="delta flat">– vs periode lalu</span>';
  const d = (cur - prev) / prev;
  const up = d >= 0;
  const good = inverse ? !up : up;
  const flat = Math.abs(d) < 0.005;
  return `<span class="delta ${flat ? 'flat' : good ? 'up' : 'down'}">${flat ? '=' : up ? '▲' : '▼'} ${pct(Math.abs(d))} <span>vs ${ui.days} hari lalu</span></span>`;
}
function spark(values, cls = '') {
  if (values.length < 2 || !values.some(Boolean)) return '<div class="spark-empty"></div>';
  const W = 120;
  const H = 36;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - (v / max) * (H - 6)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return `<svg class="spark ${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path class="spark-area" d="${line} L${W} ${H} L0 ${H} Z"></path><path class="spark-line" d="${line}"></path></svg>`;
}
function ring(ratio) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = Math.min(Math.max(ratio || 0, 0), 1);
  return `<svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="ring-bg"></circle>
    <circle cx="32" cy="32" r="${r}" class="ring-fg ${ratio >= 1 ? 'done' : ''}" stroke-dasharray="${(v * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"></circle></svg>`;
}
const empty = (msg, cta = '') => `<div class="tile-empty"><span>${msg}</span>${cta}</div>`;
const head = (label, extra = '') => `<div class="tile-head"><span class="tile-label">${label}</span>${extra}</div>`;

// ---------- Data ----------
function bucket(rows, from, to) {
  const out = { views: 0, eng: 0, contents: 0, byDay: {} };
  for (const r of rows) {
    const t = new Date(r.posted_at || r.day || 0).getTime();
    if (!(t >= from && t < to)) continue;
    const eng = (r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.saves || 0);
    out.views += r.views || 0;
    out.eng += eng;
    out.contents++;
    const d = wibDay(t);
    const day = (out.byDay[d] ||= { total: 0, eng: 0 });
    day.total += r.views || 0;
    day.eng += eng;
    day[r.platform] = (day[r.platform] || 0) + (r.views || 0);
  }
  return out;
}
async function load() {
  const days = ui.days;
  const [summary, rows, content, upcoming, adv, mp] = await Promise.all([
    api(`/api/analytics/summary?from=${since(days)}`),
    api(`/api/metrics?from=${since(days * 2)}`).catch(() => []),
    api('/api/content').catch(() => []),
    api('/api/posts?status=scheduled').catch(() => []),
    api(`/api/reports/team/adv?from=${encodeURIComponent(since(days))}`).catch(() => null),
    api(`/api/reports/team/mp?from=${encodeURIComponent(since(days))}`).catch(() => null),
  ]);
  const now = Date.now();
  const cur = bucket(rows, now - days * DAY, now + DAY);
  const prev = bucket(rows, now - 2 * days * DAY, now - days * DAY);
  ui.data = { summary, rows, content, upcoming, adv, mp, cur, prev };
}

// ---------- Render ----------
function dayList(byDay) {
  const out = [];
  for (let i = ui.days - 1; i >= 0; i--) {
    const d = wibDay(Date.now() - i * DAY);
    out.push({ day: d, ...(byDay[d] || { total: 0, eng: 0 }) });
  }
  return out;
}
function renderKpis() {
  const { summary, cur, prev, rows, content, adv, mp } = ui.data;
  const t = summary.totals || {};
  const hasRows = rows.length > 0;
  // Views: utamakan baris metrik (bisa dibandingkan dengan periode lalu); kalau kosong pakai ringkasan.
  const views = hasRows ? cur.views : t.views;
  const series = hasRows ? dayList(cur.byDay).map((d) => d.total) : (summary.timeline || []).map((r) => r.views).reverse();
  $('#bn-views').innerHTML = `${head('Total views')}
    <div class="kpi-big" data-num>${compact(views)}</div>${hasRows ? delta(cur.views, prev.views) : `<span class="delta flat">${num(t.contents)} konten</span>`}
    ${spark(series)}`;

  const er = hasRows ? (cur.views ? cur.eng / cur.views : null) : t.engagement_rate;
  const erPrev = prev.views ? prev.eng / prev.views : null;
  $('#bn-er').innerHTML = `${head('Engagement rate')}
    <div class="kpi-big" data-num>${pct(er, 2)}</div>${hasRows ? delta(er, erPrev) : `<span class="delta flat">${compact(t.engagement)} interaksi</span>`}
    ${spark(hasRows ? dayList(cur.byDay).map((d) => (d.total ? d.eng / d.total : 0)) : [], 'alt')}`;

  // Target konten tayang: disimpan per brand di browser, klik angka target untuk mengubah.
  const published = content.filter((c) => c.status === 'tayang' && (!c.planned_at || new Date(c.planned_at) >= new Date(since(ui.days)))).length;
  const target = Math.max(1, Math.round((store.get(brandKey(), 30) * ui.days) / 30));
  $('#bn-target').innerHTML = `${head('Konten tayang vs target', `<button class="link small" id="bn-target-edit" title="Ubah target bulanan">Atur</button>`)}
    <div class="target-row">${ring(published / target)}<div><div class="kpi-big" data-num>${published}<span class="kpi-of">/${target}</span></div>
    <span class="delta ${published >= target ? 'up' : 'flat'}">${pct(published / target, 0)} dari target ${ui.days} hari</span></div></div>`;

  const spend = (adv?.totals?.spend || 0) + (mp?.totals?.spend || 0);
  const gmv = (adv?.totals?.revenue || 0) + (mp?.totals?.revenue || 0);
  $('#bn-ads').innerHTML = spend || gmv
    ? `${head('Ads spend vs GMV', '<button class="link small" data-goto="adv">Detail</button>')}
      <div class="kpi-big" data-num>${x2(spend ? gmv / spend : null)}<span class="kpi-of"> ROAS</span></div>
      <div class="ads-split"><div><span class="hint">Spend</span><b data-num>${rpc(spend)}</b></div><div><span class="hint">GMV</span><b data-num>${rpc(gmv)}</b></div></div>
      <div class="ads-bar"><span style="width:${gmv ? Math.min(100, (spend / gmv) * 100) : 100}%"></span></div>
      <span class="hint">ADV ${x2(adv?.totals?.roas)} · MP ${x2(mp?.totals?.roas)}</span>`
    : `${head('Ads spend vs GMV')}${empty('Belum ada angka iklan di periode ini.', '<button class="ghost small" data-goto="integrations">Hubungkan akun iklan</button>')}`;
}
function renderFunnel() {
  const steps = (ui.data.summary.funnel || []).filter((s) => s && s.label);
  const el = $('#bn-funnel');
  if (!steps.length || !steps.some((s) => s.value)) { el.innerHTML = `${head('Full funnel')}${empty('Belum ada data funnel di periode ini.', '<button class="ghost small" data-goto="analytics">Input metrik</button>')}`; return; }
  const max = Math.max(...steps.map((s) => s.value), 1);
  const overall = steps[0].value ? steps[steps.length - 1].value / steps[0].value : null;
  el.innerHTML = `${head('Full funnel', `<span class="hint">Konversi total <b data-num>${pct(overall, 2)}</b></span>`)}
    <div class="fn">${steps.map((s, i) => {
    // Lebar pakai skala akar supaya tahap bawah tetap terbaca (views bisa 1000x sales).
    const w = Math.max(6, Math.sqrt(s.value / max) * 100);
    return `<div class="fn-step" style="--w:${w}%; --i:${i}" data-tip="<b>${esc(s.label)}</b><br>${num(s.value)}">
        <div class="fn-bar"><span class="fn-name">${esc(s.label)}</span><span class="fn-val" data-num>${compact(s.value)}</span></div>
        ${i ? `<div class="fn-conv" data-num>${pct(s.conversion ?? (steps[i - 1].value ? s.value / steps[i - 1].value : null), 1)}</div>` : '<div class="fn-conv"></div>'}
      </div>`;
  }).join('')}</div>`;
}
function renderPipeline() {
  const { content } = ui.data;
  const counts = Object.fromEntries(STAGES.map((s) => [s.id, 0]));
  for (const c of content) if (counts[c.status] != null) counts[c.status]++;
  const review = content.filter((c) => c.status === 'review').slice(0, 4);
  S.setNavBadge?.('planner', counts.review);
  $('#bn-pipeline').innerHTML = `${head('Pipeline konten', '<button class="link small" data-goto="planner">Buka planner</button>')}
    <div class="pipe-bar">${STAGES.map((s) => (counts[s.id] ? `<span class="pb-${s.tone}" style="flex:${counts[s.id]}" data-tip="${s.label}: ${counts[s.id]}"></span>` : '')).join('') || '<span class="pb-none" style="flex:1"></span>'}</div>
    <div class="pipe-stages">${STAGES.map((s) => `<button class="pstage" data-planner-stage="${s.id}"><b data-num>${counts[s.id]}</b><span>${s.label}</span></button>`).join('')}</div>
    <div class="tile-sublabel">Menunggu review <span class="count">${counts.review}</span></div>
    ${review.length ? `<div class="approve-list">${review.map((c) => `<div class="approve-item">
        <button class="ai-title" data-content="${c.id}" title="Buka kartu">${esc(c.title || '(tanpa judul)')}</button>
        ${c.pillar ? `<span class="tag">${esc(c.pillar)}</span>` : ''}
        <button class="ghost small ok-btn" data-approve="${c.id}" title="Setujui → Siap">✓ Setujui</button></div>`).join('')}</div>`
    : '<div class="hint">Tidak ada kartu yang menunggu review. 🎉</div>'}`;
}
function renderChart() {
  const { rows, summary, cur } = ui.data;
  const el = $('#bn-chart');
  const hasRows = rows.length > 0;
  const list = hasRows ? dayList(cur.byDay) : dayList(Object.fromEntries((summary.timeline || []).map((r) => [r.day, { total: r.views }])));
  const totals = Object.fromEntries(PLATFORMS.map((p) => [p.id, list.reduce((n, d) => n + (d[p.id] || 0), 0)]));
  const toggles = hasRows ? `<div class="pf-toggles">${PLATFORMS.map((p) => `<button class="pf-t ${ui.platforms.has(p.id) ? 'on' : ''}" data-pf="${p.id}" style="--pf:${p.color}"><i></i>${p.label}<span data-num>${compact(totals[p.id])}</span></button>`).join('')}</div>` : '';
  if (!list.some((d) => d.total)) { el.innerHTML = `${head('Views harian')}${empty('Belum ada konten tayang di periode ini.', '<button class="ghost small" data-goto="analytics">Tarik data analitik</button>')}`; return; }
  // Seri yang digambar: per platform aktif (ditumpuk) kalau ada baris metrik, kalau tidak satu seri total.
  const series = hasRows ? PLATFORMS.filter((p) => ui.platforms.has(p.id)) : [{ id: 'total', color: 'var(--c1)' }];
  const W = 760;
  const H = 220;
  const pad = 6;
  const stack = list.map((d) => { let acc = 0; return series.map((s) => (acc += d[s.id] || 0)); });
  const max = Math.max(1, ...stack.map((s) => s[s.length - 1] || 0));
  const x = (i) => (list.length === 1 ? W / 2 : (i / (list.length - 1)) * W);
  const y = (v) => H - pad - (v / max) * (H - pad * 3);
  const smooth = (pts) => pts.map((p, i) => {
    if (!i) return `M${p[0]} ${p[1]}`;
    const [px, py] = pts[i - 1];
    const cx = (px + p[0]) / 2;
    return `C${cx} ${py} ${cx} ${p[1]} ${p[0]} ${p[1]}`;
  }).join(' ');
  const paths = series.map((s, si) => {
    const top = stack.map((v, i) => [x(i), y(v[si])]);
    const base = stack.map((v, i) => [x(i), y(si ? v[si - 1] : 0)]).reverse();
    const line = smooth(top);
    const back = smooth(base).replace(/^M/, 'L');
    return `<path class="ar-fill" style="--pf:${s.color}" d="${line} ${back} Z"></path><path class="ar-line" style="--pf:${s.color}" d="${line}"></path>`;
  }).join('');
  const grid = [0.25, 0.5, 0.75, 1].map((f) => `<line x1="0" x2="${W}" y1="${y(max * f)}" y2="${y(max * f)}" class="ar-grid"></line>`).join('');
  const peak = list.reduce((a, b) => (b.total > a.total ? b : a), list[0]);
  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  el.innerHTML = `${head('Views harian', `<span class="hint">Puncak <b data-num>${compact(peak.total)}</b> · ${fmt(peak.day)}</span>`)}
    ${toggles}
    <div class="ar-wrap"><svg class="area" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Grafik views harian">${grid}${paths}
      <line class="ar-cursor" id="ar-cursor" x1="0" x2="0" y1="0" y2="${H}" hidden></line></svg>
      <div class="ar-tip" id="ar-tip" hidden></div></div>
    <div class="tl-ticks">${[0, Math.floor(list.length / 2), list.length - 1].map((i) => `<span>${fmt(list[i].day)}</span>`).join('')}</div>`;
  const wrap = $('.ar-wrap', el);
  wrap.onmousemove = (e) => {
    const r = wrap.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (list.length - 1));
    const d = list[Math.max(0, Math.min(list.length - 1, i))];
    const cx = x(list.indexOf(d));
    const cur = $('#ar-cursor', el);
    cur.hidden = false;
    cur.setAttribute('x1', cx);
    cur.setAttribute('x2', cx);
    const tip = $('#ar-tip', el);
    tip.hidden = false;
    tip.innerHTML = `<b>${fmt(d.day)}</b><div data-num>${num(d.total)} views</div>${hasRows ? series.map((s) => `<div class="tip-row"><i style="background:${s.color}"></i>${s.label}<span data-num>${compact(d[s.id] || 0)}</span></div>`).join('') : ''}`;
    const left = (cx / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left, 70), r.width - 70)}px`;
  };
  wrap.onmouseleave = () => { $('#ar-cursor', el).hidden = true; $('#ar-tip', el).hidden = true; };
}
function renderUpcoming() {
  const { upcoming, content } = ui.data;
  const now = Date.now();
  const posts = upcoming.filter((p) => p.scheduled_at).map((p) => ({ kind: 'post', id: p.id, at: p.scheduled_at, title: p.caption || '(tanpa caption)', status: 'Terjadwal', tone: 'warn' }));
  const cards = content.filter((c) => ['siap', 'terjadwal', 'review'].includes(c.status) && c.planned_at && new Date(c.planned_at).getTime() > now - DAY && !c.post)
    .map((c) => ({ kind: 'content', id: c.id, at: c.planned_at, title: c.title, status: STAGES.find((s) => s.id === c.status)?.label, tone: c.status === 'siap' ? 'ok' : 'warn', pillar: c.pillar, platforms: c.platforms || [], raw: c }));
  const list = [...posts, ...cards].sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 6);
  const when = (iso) => {
    const d = new Date(iso);
    const diff = Math.round((new Date(d.toDateString()) - new Date(new Date().toDateString())) / DAY);
    const day = diff === 0 ? 'Hari ini' : diff === 1 ? 'Besok' : d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${day} · ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  };
  $('#bn-upcoming').innerHTML = `${head('Akan tayang', '<button class="link small" data-goto="calendar">Kalender</button>')}
    ${list.length ? `<div class="up-list">${list.map((u) => `<div class="up-card" ${u.kind === 'post' ? `data-post="${u.id}"` : `data-content="${u.id}"`} tabindex="0">
        <div class="up-when" data-num>${when(u.at)}</div>
        <div class="up-title">${esc(u.title.slice(0, 80))}</div>
        <div class="up-meta"><span class="pill ${u.tone}">${esc(u.status || '')}</span>${u.pillar ? `<span class="tag">${esc(u.pillar)}</span>` : ''}
          ${u.kind === 'content' && u.raw.status === 'review' ? `<button class="link small" data-approve="${u.id}">Setujui</button>` : ''}
          ${u.kind === 'content' && u.raw.status === 'siap' ? `<button class="link small" data-schedule="${u.id}">Jadwalkan →</button>` : ''}</div>
      </div>`).join('')}</div>`
    : empty('Belum ada yang dijadwalkan.', '<button class="ghost small" data-goto="compose">Buat post</button>')}`;
}

async function render({ quiet = false } = {}) {
  view.querySelectorAll('#bn-range [data-days]').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.days) === ui.days)));
  const b = state.brands.find((x) => x.id === state.brandId);
  $('#dash-title').textContent = b ? `Dashboard · ${b.name}` : 'Dashboard';
  if (!quiet || !ui.data) skeleton();
  try {
    await load();
  } catch (ex) {
    view.querySelectorAll('.tile').forEach((t) => { t.innerHTML = empty(esc(ex.message)); });
    return;
  }
  const s = ui.data.summary;
  $('#bn-sync').textContent = s.lastSync ? `Data API terakhir ditarik ${S.fmtDate(s.lastSync)}` : 'Ringkasan semua tim';
  renderKpis();
  renderFunnel();
  renderPipeline();
  renderChart();
  renderUpcoming();
}

// ---------- Interaksi ----------
view.addEventListener('click', async (e) => {
  const range = e.target.closest('[data-days]');
  if (range) { ui.days = Number(range.dataset.days); store.set('timai.dashDays', ui.days); render(); return; }
  if (e.target.closest('#bn-refresh')) { render(); S.toast('Data dashboard diperbarui'); return; }
  const pf = e.target.closest('[data-pf]');
  if (pf) {
    const id = pf.dataset.pf;
    if (ui.platforms.has(id) && ui.platforms.size === 1) return S.toast('Minimal satu platform aktif');
    ui.platforms.has(id) ? ui.platforms.delete(id) : ui.platforms.add(id);
    store.set('timai.dashPlatforms', [...ui.platforms]);
    renderChart();
    return;
  }
  const stage = e.target.closest('[data-planner-stage]');
  if (stage) { store.set('timai.plannerStage', stage.dataset.plannerStage); S.show('planner'); return; }
  const approve = e.target.closest('[data-approve]');
  if (approve) {
    e.stopPropagation();
    approve.disabled = true;
    try {
      await api(`/api/content/${approve.dataset.approve}`, json('PATCH', { status: 'siap' }));
      S.toast('Disetujui → Siap. Tim medsos tinggal jadwalkan.');
      render({ quiet: true });
    } catch (ex) { approve.disabled = false; S.toast(ex.message); }
    return;
  }
  const sched = e.target.closest('[data-schedule]');
  if (sched) {
    e.stopPropagation();
    const c = ui.data.content.find((x) => x.id === Number(sched.dataset.schedule));
    if (c) S.composeFrom(await api(`/api/content/${c.id}`).catch(() => c));
    return;
  }
  if (e.target.closest('#bn-target-edit')) {
    const cur = store.get(brandKey(), 30);
    S.openModal(`<form id="tg-form"><h3>Target konten tayang</h3>
      <p class="hint">Jumlah konten tayang per bulan untuk brand ini. Dipakai untuk menghitung progres di dashboard (otomatis disesuaikan dengan periode yang dipilih).</p>
      <label class="label" for="tg-n">Konten / bulan</label><input id="tg-n" type="number" min="1" max="999" value="${cur}" required>
      <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
    $('#tg-n').select();
    $('#tg-form').onsubmit = (ev) => {
      ev.preventDefault();
      store.set(brandKey(), Math.max(1, Number($('#tg-n').value) || 30));
      S.closeModal();
      S.toast('Target tersimpan');
      renderKpis();
    };
  }
});
view.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.up-card')) e.target.click();
});

S.viewHooks.dashboard = () => render();
// Kalau dashboard sudah tampil sebelum modul ini dimuat, gambar ulang.
if (view.classList.contains('active')) render();
