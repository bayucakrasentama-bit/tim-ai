// Tab tambahan Tim KOL (ala KingKOL: database influencer, campaign, jadwal, analisa konten)
// dan Tim Affiliate (ala Kalodata: riset & banding kreator, produk, video, livestream).
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel) => document.querySelector(sel);
const DSTATUS = { brief: 'Brief', draft: 'Draft', revisi: 'Revisi', approved: 'Approved', tayang: 'Tayang', dibayar: 'Dibayar', batal: 'Batal' };
const CSTATUS = { rencana: 'Rencana', berjalan: 'Berjalan', selesai: 'Selesai', batal: 'Batal' };
const TYPES = ['video', 'story', 'live', 'foto/carousel', 'bundle'];
const bar = (v) => `<div class="pbar"><span style="width:${Math.max(0, Math.min(100, (v || 0) * 100)).toFixed(1)}%"></span></div>`;
const isoDay = (d) => d.toISOString().slice(0, 10);
const brandOptions = (sel) => state.brands.map((b) => `<option value="${b.id}" ${b.id === (sel ?? state.brandId) ? 'selected' : ''}>${esc(b.name)}</option>`).join('');

// ======================= RISET & BANDING KREATOR =======================
const research = { last: null, compare: null, sort: 'median_views' };
function flags(m, H) {
  const out = [];
  if (m.viral_dependency > 3) out.push('<span class="tag bad">🚩 Viral dependency &gt;3</span>');
  if (m.er != null && m.er < 0.02) out.push('<span class="tag bad">ER rendah (&lt;2%)</span>');
  if (m.er != null && m.er >= 0.06) out.push('<span class="tag ok">ER kuat (≥6%)</span>');
  if (m.view_rate != null && m.view_rate < 0.03) out.push('<span class="tag bad">Views jauh di bawah followers</span>');
  if (m.posts_per_week != null && m.posts_per_week < 1) out.push('<span class="tag">Jarang posting</span>');
  if (m.last_post && Date.now() - new Date(m.last_post) > 30 * 86400e3) out.push('<span class="tag bad">Tidak aktif &gt;30 hari</span>');
  return out.join(' ') || `<span class="tag ok">Tidak ada red flag dari ${H.num(m.sample)} video terakhir</span>`;
}
function profileCard(c, team, H) {
  const m = c.metrics || {};
  return `<div class="card creator">
    <div class="creator-head">${c.avatar ? `<img src="${esc(c.avatar)}" alt="" referrerpolicy="no-referrer">` : ''}
      <div><div class="creator-name">${esc(c.nickname || c.username)} ${c.verified ? '✔️' : ''}</div><a class="hint" href="https://www.tiktok.com/@${esc(c.username)}" target="_blank" rel="noopener">@${esc(c.username)} ↗</a>
      <div class="hint">${esc(c.tier || '')}${c.cached ? ' · data cache ≤24 jam' : ''}${c.source === 'videos' ? ` · dihitung dari ${c.metrics.sample} link video` : ''}</div></div>
      <div class="btn-row"><select id="rs-brand" aria-label="Brand">${brandOptions()}</select><button class="primary small" data-rs-add="${esc(c.username)}">+ Tambah ke ${team === 'kol' ? 'Database KOL' : 'daftar kreator'}</button></div></div>
    ${c.bio ? `<p class="hint">${esc(c.bio)}</p>` : ''}
    ${H.kpis([
      { label: 'Followers', value: H.cpt(c.followers), sub: `${H.cpt(c.likes)} likes · ${H.num(c.video_count)} video` },
      { label: 'Median views', value: H.cpt(m.median_views), sub: `mean ${H.cpt(m.mean_views)} · ${H.num(m.sample)} video reguler` },
      { label: 'Viral dependency', value: H.vd(m.viral_dependency), sub: 'mean ÷ median (>3 = 🚩)' },
      { label: 'ER by views', value: H.pct(m.er), sub: `view rate ${H.pct(m.view_rate)}` },
      { label: 'Posting', value: m.posts_per_week == null ? '–' : `${m.posts_per_week.toLocaleString('id-ID', { maximumFractionDigits: 1 })}/minggu`, sub: `durasi median ${m.avg_duration ?? '–'} dtk` },
      { label: 'Fee wajar / konten', value: m.fair_fee_low ? `${H.rpc(m.fair_fee_low)}–${H.rpc(m.fair_fee_high)}` : '–', sub: 'median views × CPV Rp15–50 (⚠️ asumsi)' },
    ])}
    <div class="creator-flags">${flags(m, H)}</div>
    <div class="label">12 video reguler terakhir</div>
    <div class="vid-grid">${(c.videos || []).map((v) => `<a class="vid" href="${esc(v.url)}" target="_blank" rel="noopener">${v.cover ? `<img src="${esc(v.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="vid-ph"></div>'}
      <span class="vid-views">▶ ${H.cpt(v.views)}</span><span class="vid-cap">${esc(v.title || '')}</span></a>`).join('') || '<div class="empty">Tidak ada video publik.</div>'}</div>
  </div>`;
}
function compareTable(list, team, H) {
  const cols = [['followers', 'Followers'], ['median_views', 'Median views'], ['viral_dependency', 'Viral dep.'], ['er', 'ER'], ['view_rate', 'View rate'], ['posts_per_week', 'Posting/minggu'], ['fair_fee_low', 'Fee wajar']];
  const val = (c, k) => (k === 'followers' ? c.followers : c.metrics?.[k]);
  const rows = [...list].sort((a, b) => (val(b, research.sort) ?? -1) - (val(a, research.sort) ?? -1));
  return `<div class="table-wrap"><table class="data"><thead><tr><th>Kreator</th>${cols.map(([k, l]) => `<th><button class="link" data-rs-sort="${k}">${l}${research.sort === k ? ' ▼' : ''}</button></th>`).join('')}<th>Catatan</th><th></th></tr></thead><tbody>
    ${rows.map((c) => (c.error ? `<tr><td>@${esc(c.username)}</td><td colspan="9" class="error-inline">${esc(c.error)}</td></tr>` : `<tr>
      <td><b>${esc(c.nickname || c.username)}</b><div class="hint">@${esc(c.username)} · ${esc(c.tier || '')}</div></td>
      <td>${H.cpt(c.followers)}</td><td><b>${H.cpt(c.metrics.median_views)}</b></td><td>${H.vd(c.metrics.viral_dependency)}</td><td>${H.pct(c.metrics.er)}</td><td>${H.pct(c.metrics.view_rate)}</td>
      <td>${c.metrics.posts_per_week == null ? '–' : c.metrics.posts_per_week.toLocaleString('id-ID', { maximumFractionDigits: 1 })}</td>
      <td>${c.metrics.fair_fee_low ? `${H.rpc(c.metrics.fair_fee_low)}–${H.rpc(c.metrics.fair_fee_high)}` : '–'}</td>
      <td>${flags(c.metrics, H)}</td>
      <td><button class="ghost small" data-rs-open="${esc(c.username)}">Detail</button> <button class="primary small" data-rs-add="${esc(c.username)}">+ Tambah</button></td></tr>`)).join('')}
  </tbody></table></div>`;
}
async function researchTab(team, body, ctx) {
  const H = ctx.helpers;
  const draw = () => {
    body.innerHTML = `<div class="card"><div class="label">Cek satu kreator TikTok</div>
      <form class="btn-row left" id="rs-one"><input id="rs-user" class="inline-input" placeholder="@username atau link profil" value="${esc(research.last?.username || '')}"><button class="primary">Analisa</button></form>
      <details class="manual" ${research.videoMode ? 'open' : ''}><summary><b>Analisa dari link video</b> (kalau cek profil sedang ditolak sumber datanya)</summary>
        <form id="rs-vid"><textarea id="rs-urls" rows="3" placeholder="Tempel 3–12 link video TikTok dari kreator yang sama, satu per baris"></textarea>
        <div class="btn-row left"><input id="rs-fol" class="inline-input" inputmode="numeric" placeholder="Followers (opsional)"><input id="rs-name" class="inline-input" placeholder="@username (opsional)"><button class="primary">Analisa video</button></div></form></details>
      <div class="label">Banding banyak kreator (maks 10, pisah spasi/baris)</div>
      <form id="rs-many"><textarea id="rs-users" rows="2" placeholder="@kreator1 @kreator2 @kreator3"></textarea><button class="ghost">Bandingkan</button></form>
      <p class="hint">Data publik TikTok (followers, 12 video reguler terakhir) dihitung dengan rumus soul.md: median views, viral dependency, ER by views, dan fee wajar. Sumber: layanan pihak ketiga (tikwm), bukan API resmi; data pasar/penjualan kreator seperti Kalodata butuh langganan API Kalodata.</p></div>
      <div id="rs-out">${research.compare ? compareTable(research.compare, team, H) : ''}${research.last ? profileCard(research.last, team, H) : ''}</div>`;
  };
  draw();
  body.onsubmit = async (e) => {
    e.preventDefault();
    const out = body.querySelector('#rs-out');
    if (e.target.id === 'rs-one') {
      out.innerHTML = '<div class="spinner"></div>';
      try { research.last = await api(`/api/creators/lookup?u=${encodeURIComponent(body.querySelector('#rs-user').value)}`); } catch (ex) { toast(ex.message); }
      draw();
    }
    if (e.target.id === 'rs-vid') {
      research.videoMode = true;
      out.innerHTML = '<div class="spinner"></div><p class="hint center">Membaca tiap video (±1 detik per link)…</p>';
      try {
        const c = await api('/api/creators/from-videos', H.json('POST', { urls: body.querySelector('#rs-urls').value, followers: body.querySelector('#rs-fol').value.replace(/[^0-9]/g, '') || null }));
        if (body.querySelector('#rs-name')?.value.trim()) c.username = body.querySelector('#rs-name').value.trim().replace(/^@/, '');
        research.last = c;
        if (c.mixed_accounts) toast(`Perhatian: link berasal dari beberapa akun (${c.mixed_accounts.join(', ')})`);
      } catch (ex) { toast(ex.message); }
      draw();
    }
    if (e.target.id === 'rs-many') {
      out.innerHTML = '<div class="spinner"></div><p class="hint center">Mengambil data tiap kreator (±2 detik per akun)…</p>';
      try { research.compare = await api('/api/creators/compare', H.json('POST', { usernames: body.querySelector('#rs-users').value })); } catch (ex) { toast(ex.message); }
      draw();
    }
  };
  body.onclick = async (e) => {
    const d = e.target.dataset;
    if (d.rsSort) { research.sort = d.rsSort; draw(); }
    if (d.rsOpen) { research.last = await api(`/api/creators/lookup?u=${encodeURIComponent(d.rsOpen)}`).catch((ex) => toast(ex.message)) || research.last; draw(); window.scrollTo({ top: body.offsetTop + 400, behavior: 'smooth' }); }
    if (d.rsAdd) {
      try {
        const fromVideos = research.last?.source === 'videos' && research.last.username === d.rsAdd ? research.last : null;
        await api(`/api/partners/${team}/from-creator`, H.json('POST', { username: d.rsAdd, creator: fromVideos, brand_id: Number(body.querySelector('#rs-brand')?.value || state.brandId) }));
        toast(`@${d.rsAdd} masuk daftar (status Prospek)`);
      } catch (ex) { toast(ex.message); }
    }
  };
}

// ======================= CAMPAIGN (KOL) =======================
let openCampaign = null;
function campaignForm(c, done) {
  openModal(`<form id="cf-form"><h3>${c ? 'Edit campaign' : 'Campaign baru'}</h3><div class="form-grid">
    ${c ? '' : `<div class="span-2"><label class="label" for="cf-brand">Brand</label><select id="cf-brand" name="brand_id">${brandOptions()}</select></div>`}
    <div class="span-2"><label class="label" for="cf-name">Nama campaign</label><input id="cf-name" name="name" required value="${esc(c?.name || '')}" placeholder="mis. Launching Madu Kids - Nov"></div>
    <div><label class="label" for="cf-obj">Objektif</label><select id="cf-obj" name="objective">${['Awareness', 'Engagement', 'Traffic', 'Penjualan', 'Launching produk'].map((o) => `<option ${o === c?.objective ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
    <div><label class="label" for="cf-status">Status</label><select id="cf-status" name="status">${Object.entries(CSTATUS).map(([k, l]) => `<option value="${k}" ${k === (c?.status || 'rencana') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label class="label" for="cf-budget">Budget (Rp)</label><input id="cf-budget" name="budget" inputmode="decimal" value="${c?.budget ?? ''}"></div>
    <div><label class="label" for="cf-tv">Target views</label><input id="cf-tv" name="target_views" inputmode="numeric" value="${c?.target_views ?? ''}"></div>
    <div><label class="label" for="cf-to">Target pesanan</label><input id="cf-to" name="target_orders" inputmode="numeric" value="${c?.target_orders ?? ''}"></div>
    <div><label class="label" for="cf-start">Mulai</label><input id="cf-start" name="start_day" type="date" value="${esc(c?.start_day || '')}"></div>
    <div><label class="label" for="cf-end">Selesai</label><input id="cf-end" name="end_day" type="date" value="${esc(c?.end_day || '')}"></div>
    <div class="span-2"><label class="label" for="cf-brief">Brief untuk KOL (pesan utama, do & don't, hook wajib, CTA, link, hashtag, disclosure)</label><textarea id="cf-brief" name="brief" rows="6">${esc(c?.brief || '')}</textarea></div>
  </div><div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  $('#modal-box').classList.add('wide');
  $('#cf-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    try {
      const row = await api(c ? `/api/kol/campaigns/${c.id}` : '/api/kol/campaigns', { method: c ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
      closeModal();
      done(row);
    } catch (ex) { toast(ex.message); }
  });
}
function deliverableForm(campaign, partners, H, done, d = null) {
  openModal(`<form id="df-form"><h3>${d ? 'Edit deliverable' : 'Tambah KOL ke campaign'}</h3><div class="form-grid">
    ${d ? `<div class="span-2"><b>${esc(d.partner_name)}</b></div>` : `<div class="span-2"><label class="label" for="df-p">KOL</label><select id="df-p" name="partner_id">${partners.filter((p) => p.brand_id === campaign.brand_id && p.status !== 'ditolak').map((p) => `<option value="${p.id}" data-rate="${p.rate ?? ''}">${esc(p.name)}${p.handle ? ` (@${esc(p.handle)})` : ''}${p.rate != null ? ` · ${H.rp(p.rate)}` : ''}</option>`).join('')}</select>
      <p class="hint">Hanya KOL brand campaign ini. Belum ada? Tambah di Database KOL / Riset Kreator.</p></div>`}
    <div><label class="label" for="df-type">Jenis</label><select id="df-type" name="type">${TYPES.map((t) => `<option ${t === (d?.type || 'video') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label class="label" for="df-fee">Fee (Rp, kosong = ratecard)</label><input id="df-fee" name="fee" inputmode="decimal" value="${d?.fee ?? ''}"></div>
    <div><label class="label" for="df-due">Tenggat tayang</label><input id="df-due" name="due_day" type="date" value="${esc(d?.due_day || campaign.start_day || '')}"></div>
    <div><label class="label" for="df-st">Status</label><select id="df-st" name="status">${Object.entries(DSTATUS).map(([k, l]) => `<option value="${k}" ${k === (d?.status || 'brief') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="span-2"><label class="label" for="df-url">Link konten (setelah tayang — TikTok dipantau otomatis)</label><input id="df-url" name="url" value="${esc(d?.url || '')}" placeholder="https://www.tiktok.com/@kol/video/..."></div>
    <div class="span-2"><label class="label" for="df-notes">Catatan (revisi, draft, pembayaran)</label><textarea id="df-notes" name="notes" rows="2">${esc(d?.notes || '')}</textarea></div>
  </div><div class="modal-actions">${d ? '<button type="button" class="danger" id="df-del">Hapus</button>' : ''}<button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  $('#modal-box').classList.add('wide');
  const send = (url, method, body) => api(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  $('#df-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    if (v.fee === '') delete v.fee;
    try {
      e.submitter && (e.submitter.disabled = true);
      await (d ? send(`/api/kol/deliverables/${d.id}`, 'PATCH', v) : send(`/api/kol/campaigns/${campaign.id}/deliverables`, 'POST', v));
      closeModal();
      done();
    } catch (ex) { toast(ex.message); e.submitter && (e.submitter.disabled = false); }
  });
  $('#df-del')?.addEventListener('click', async () => {
    if (!confirm('Hapus deliverable ini?')) return;
    await send(`/api/kol/deliverables/${d.id}`, 'DELETE');
    closeModal();
    done();
  });
}
async function campaignsTab(team, body, ctx) {
  const H = ctx.helpers;
  const partners = ctx.cache.partners;
  async function list() {
    const rows = await api('/api/kol/campaigns');
    body.innerHTML = `<div class="row-between"><p class="hint">Pantau campaign seperti KingKOL: budget vs fee terpakai, target vs hasil, progres deliverable tiap KOL, dan konten yang dipantau otomatis.</p><button class="primary" id="cp-new">+ Campaign</button></div>
      <div class="cp-grid">${rows.map((c) => `<button class="card cp-card" data-cp-open="${c.id}">
        <div class="row-between"><b>${esc(c.name)}</b><span class="tag">${CSTATUS[c.status] || c.status}</span></div>
        <div class="hint">${esc(ctx.brandName(c.brand_id))} · ${esc(c.objective || '')} · ${esc(c.start_day || '?')} – ${esc(c.end_day || '?')}</div>
        <div class="cp-line"><span>Deliverable ${c.summary.posted}/${c.summary.deliverables}${c.summary.late ? ` · <b class="error-inline">${c.summary.late} telat</b>` : ''}</span>${bar(c.summary.deliverables ? c.summary.posted / c.summary.deliverables : 0)}</div>
        <div class="cp-line"><span>Budget ${H.rpc(c.summary.fee)} / ${H.rpc(c.budget)}</span>${bar(c.budget ? c.summary.fee / c.budget : 0)}</div>
        <div class="cp-line"><span>Views ${H.cpt(c.summary.views)} / ${H.cpt(c.target_views)}</span>${bar(c.summary.views_progress)}</div>
        <div class="hint">CPV ${c.summary.cpv == null ? '–' : H.rp(c.summary.cpv)} · ER ${H.pct(c.summary.er)} · ROAS ${H.x2(c.summary.roas)}</div></button>`).join('') || '<div class="empty">Belum ada campaign.</div>'}</div>`;
    body.querySelector('#cp-new').onclick = () => campaignForm(null, (row) => { openCampaign = row.id; detail(); });
  }
  async function detail() {
    const c = await api(`/api/kol/campaigns/${openCampaign}`);
    const s = c.summary;
    body.innerHTML = `<div class="row-between"><div><button class="link" id="cp-back">← Semua campaign</button><h2>${esc(c.name)}</h2>
      <div class="hint">${esc(ctx.brandName(c.brand_id))} · ${esc(c.objective)} · ${esc(c.start_day || '?')} – ${esc(c.end_day || '?')} · ${CSTATUS[c.status] || c.status}</div></div>
      <div class="btn-row"><button class="ghost small" id="cp-brief">Salin brief</button><button class="ghost small" id="cp-edit">Edit</button><button class="danger small" id="cp-del">Hapus</button><button class="primary" id="cp-add">+ KOL / deliverable</button></div></div>
      ${H.kpis([
        { label: 'Budget terpakai', value: `${H.rpc(s.fee)}`, sub: `dari ${H.rpc(c.budget)} · sisa ${H.rpc(s.budget_left)}` },
        { label: 'Deliverable tayang', value: `${s.posted}/${s.deliverables}`, sub: `${s.kol} KOL · ${s.late} telat` },
        { label: 'Views', value: H.cpt(s.views), sub: `target ${H.cpt(c.target_views)} (${H.pct(s.views_progress)})` },
        { label: 'CPV / CPM', value: s.cpv == null ? '–' : H.rp(s.cpv), sub: `CPM ${H.rp(s.cpm)}` },
        { label: 'ER by views', value: H.pct(s.er) },
        { label: 'Pesanan / omzet', value: `${H.num(s.orders)} / ${H.rpc(s.revenue)}`, sub: `ROAS ${H.x2(s.roas)}` },
      ])}
      <p class="hint">Status: ${Object.entries(DSTATUS).map(([k, l]) => `${l} <b>${s.byStatus[k] || 0}</b>`).join(' · ')}</p>
      ${H.table(['KOL', 'Jenis', 'Tenggat', 'Status', 'Fee', 'Konten', 'Views', 'ER', 'Pesanan', 'Omzet', ''], c.deliverables.map((d) => {
        const late = d.due_day && d.due_day < isoDay(new Date()) && !['tayang', 'dibayar', 'batal'].includes(d.status);
        const er = Number(d.views) ? ((Number(d.likes) || 0) + (Number(d.comments) || 0) + (Number(d.shares) || 0) + (Number(d.saves) || 0)) / Number(d.views) : null;
        return [`<b>${esc(d.partner_name)}</b>${d.handle ? `<div class="hint">@${esc(d.handle)}</div>` : ''}`, esc(d.type), `<span class="${late ? 'error-inline' : ''}">${esc(d.due_day || '–')}${late ? ' ⏰' : ''}</span>`,
          `<select data-dl-status="${d.id}" aria-label="Status">${Object.entries(DSTATUS).map(([k, l]) => `<option value="${k}" ${k === d.status ? 'selected' : ''}>${l}</option>`).join('')}</select>`,
          H.rp(d.fee), d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">${d.thumbnail ? `<img class="tt-thumb" src="${esc(d.thumbnail)}" alt="" referrerpolicy="no-referrer">` : 'link'}</a>${d.track_error ? `<div class="error-inline" title="${esc(d.track_error)}">gagal dipantau</div>` : ''}` : '<span class="hint">belum ada</span>',
          H.cpt(d.views), H.pct(er), H.num(d.orders), H.rp(d.revenue), `<button class="ghost small" data-dl-edit="${d.id}">Edit</button>`];
      }), 'Belum ada KOL di campaign ini.')}
      ${c.brief ? `<details class="manual"><summary>Brief campaign</summary><pre class="script">${esc(c.brief)}</pre></details>` : ''}`;
    body.querySelector('#cp-back').onclick = () => { openCampaign = null; list(); };
    body.querySelector('#cp-edit').onclick = () => campaignForm(c, () => detail());
    body.querySelector('#cp-add').onclick = () => deliverableForm(c, partners, H, () => detail());
    body.querySelector('#cp-brief').onclick = () => navigator.clipboard?.writeText(`*${c.name}*\n${c.brief || ''}`).then(() => toast('Brief disalin, tinggal kirim ke KOL'));
    body.querySelector('#cp-del').onclick = async () => { if (!confirm(`Hapus campaign "${c.name}"?`)) return; await api(`/api/kol/campaigns/${c.id}`, { method: 'DELETE' }); openCampaign = null; list(); };
    body.onclick = (e) => { const id = e.target.dataset.dlEdit; if (id) deliverableForm(c, partners, H, () => detail(), c.deliverables.find((x) => x.id === Number(id))); };
    body.onchange = async (e) => {
      const id = e.target.dataset.dlStatus;
      if (!id) return;
      await api(`/api/kol/deliverables/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: e.target.value }) }).catch((ex) => toast(ex.message));
      detail();
    };
  }
  body.onclick = (e) => { const b = e.target.closest('[data-cp-open]'); if (b) { openCampaign = Number(b.dataset.cpOpen); detail().catch((ex) => toast(ex.message)); } };
  body.onchange = null;
  return openCampaign ? detail() : list();
}

// ======================= JADWAL (KOL) =======================
let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
async function scheduleTab(team, body) {
  const start = new Date(calMonth);
  start.setDate(1 - ((calMonth.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 41);
  const items = await api(`/api/kol/schedule?from=${isoDay(start)}&to=${isoDay(end)}`);
  const today = isoDay(new Date());
  const byDay = {};
  for (const d of items) (byDay[d.due_day] ||= []).push(d);
  const late = items.filter((d) => d.due_day < today && !['tayang', 'dibayar', 'batal'].includes(d.status));
  let html = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => `<div class="cal-head">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const k = isoDay(day);
    html += `<div class="cal-day ${day.getMonth() !== calMonth.getMonth() ? 'other' : ''} ${k === today ? 'today' : ''}"><span class="num">${day.getDate()}</span>
      ${(byDay[k] || []).map((d) => `<button class="chip dl-${d.status} ${k < today && !['tayang', 'dibayar', 'batal'].includes(d.status) ? 'dl-late' : ''}" title="${esc(`${d.partner_name} · ${d.campaign} · ${DSTATUS[d.status]}`)}" data-sc="${d.id}">${esc(d.partner_name)} · ${esc(d.type)}</button>`).join('')}</div>`;
  }
  body.innerHTML = `<div class="row-between"><div class="cal-nav"><button id="sc-prev" aria-label="Bulan sebelumnya">‹</button><strong>${calMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</strong><button id="sc-next" aria-label="Bulan berikutnya">›</button></div>
    <span class="hint">${Object.entries(DSTATUS).map(([k, l]) => `<span class="chip dl-${k}">${l}</span>`).join(' ')}</span></div>
    ${late.length ? `<div class="check bad small-note">⏰ ${late.length} deliverable lewat tenggat: ${late.slice(0, 6).map((d) => `${esc(d.partner_name)} (${esc(d.campaign)}, ${esc(d.due_day)})`).join(', ')}${late.length > 6 ? '…' : ''}</div>` : ''}
    <div class="calendar">${html}</div>`;
  body.querySelector('#sc-prev').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); scheduleTab(team, body); };
  body.querySelector('#sc-next').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); scheduleTab(team, body); };
  body.onclick = (e) => {
    const d = items.find((x) => x.id === Number(e.target.dataset.sc));
    if (!d) return;
    openModal(`<h3>${esc(d.partner_name)} · ${esc(d.type)}</h3><p class="hint">${esc(d.campaign)} · tenggat ${esc(d.due_day)}</p>
      <label class="label" for="sc-st">Status</label><select id="sc-st">${Object.entries(DSTATUS).map(([k, l]) => `<option value="${k}" ${k === d.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="label" for="sc-due">Tenggat</label><input id="sc-due" type="date" value="${esc(d.due_day)}">
      <label class="label" for="sc-url">Link konten</label><input id="sc-url" value="${esc(d.url || '')}" placeholder="https://">
      <div class="modal-actions"><button class="ghost" data-close>Tutup</button><button class="primary" id="sc-save">Simpan</button></div>`);
    $('#sc-save').onclick = async () => {
      try {
        await api(`/api/kol/deliverables/${d.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: $('#sc-st').value, due_day: $('#sc-due').value, url: $('#sc-url').value }) });
        closeModal();
        scheduleTab(team, body);
      } catch (ex) { toast(ex.message); }
    };
  };
  body.onchange = null;
}

// ======================= ANALISA KONTEN / VIDEO =======================
const vidSort = { key: 'revenue' };
async function contentTab(team, body, ctx) {
  const H = ctx.helpers;
  const u = ctx.u;
  const r = await api(`/api/reports/team/${team}?from=${encodeURIComponent(H.since(u.days))}${u.only ? `&only=${u.only}` : ''}`);
  const list = r.content.map((x) => ({ ...x, er: x.views ? ((x.likes || 0) + (x.comments || 0) + (x.shares || 0) + (x.saves || 0)) / x.views : null, cpv: x.views ? x.cost / x.views : null }));
  const withViews = list.filter((x) => x.views);
  const bucket = (fn, labels) => labels.map(([l, test]) => { const g = withViews.filter((x) => test(fn(x))); return [l, g.length, g.length ? g.reduce((a, x) => a + x.views, 0) / g.length : null, g.length ? g.reduce((a, x) => a + (x.er || 0), 0) / g.length : null]; });
  const durRows = bucket((x) => x.duration, [['< 15 dtk', (d) => d != null && d < 15], ['15–30 dtk', (d) => d >= 15 && d < 30], ['30–60 dtk', (d) => d >= 30 && d < 60], ['≥ 60 dtk', (d) => d >= 60], ['tidak diketahui', (d) => d == null]]);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayRows = days.map((l, i) => { const g = withViews.filter((x) => new Date(x.posted_at || x.day).getDay() === i); return [l, g.length, g.length ? g.reduce((a, x) => a + x.views, 0) / g.length : null, g.length ? g.reduce((a, x) => a + (x.er || 0), 0) / g.length : null]; });
  const sorted = [...list].sort((a, b) => (vidSort.key === 'day' ? String(b.day).localeCompare(String(a.day)) : (b[vidSort.key] ?? -1) - (a[vidSort.key] ?? -1)));
  body.innerHTML = `${H.kpis([
    { label: 'Konten', value: H.num(list.length), sub: `${r.tracked.links} dipantau otomatis${r.tracked.errors ? ` · ${r.tracked.errors} gagal` : ''}` },
    { label: 'Median views', value: H.cpt(r.totals.median_views), sub: `VD ${H.x2(r.totals.viral_dependency)}` },
    { label: 'ER by views', value: H.pct(r.totals.er) },
    { label: 'CPV', value: r.totals.cpv == null ? '–' : H.rp(r.totals.cpv) },
    { label: 'Pesanan / omzet', value: `${H.num(r.totals.orders)} / ${H.rpc(r.totals.revenue)}` },
  ])}
  <div class="grid-2"><div class="card"><div class="label">Durasi vs performa</div>${H.table(['Durasi', 'Konten', 'Rata-rata views', 'Rata-rata ER'], durRows.filter((x) => x[1]).map(([l, n, v, e]) => [l, n, H.cpt(v), H.pct(e)]))}</div>
  <div class="card"><div class="label">Hari tayang vs performa</div>${H.table(['Hari', 'Konten', 'Rata-rata views', 'Rata-rata ER'], dayRows.filter((x) => x[1]).map(([l, n, v, e]) => [l, n, H.cpt(v), H.pct(e)]))}</div></div>
  <div class="row-between"><h3>${team === 'affiliate' ? 'Video kreator' : 'Semua konten KOL'}</h3>
    <div class="btn-row"><select id="vs-sort" aria-label="Urutkan">${[['revenue', 'Omzet tertinggi'], ['views', 'Views tertinggi'], ['er', 'ER tertinggi'], ['orders', 'Pesanan terbanyak'], ['day', 'Terbaru']].map(([k, l]) => `<option value="${k}" ${k === vidSort.key ? 'selected' : ''}>${l}</option>`).join('')}</select>
    ${team === 'affiliate' ? '<button class="ghost small" data-goto="tiktok">Lacak video kompetitor/inspirasi →</button>' : ''}</div></div>
  <div class="vid-grid wide">${sorted.slice(0, 60).map((x) => `<a class="vid" ${x.url ? `href="${esc(x.url)}" target="_blank" rel="noopener"` : ''}>${x.thumbnail ? `<img src="${esc(x.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="vid-ph"></div>'}
    <span class="vid-views">▶ ${H.cpt(x.views)} · ER ${H.pct(x.er)}</span>
    <span class="vid-cap"><b>${esc(x.partner)}</b> · ${esc(x.day)}${x.product ? `<br>${esc(x.product)}` : ''}<br>${x.orders ? `${H.num(x.orders)} pesanan · ` : ''}${x.revenue ? H.rpc(x.revenue) : ''}${x.cpv != null ? ` · CPV ${H.rp(x.cpv)}` : ''}</span></a>`).join('') || '<div class="empty">Belum ada konten. Isi link konten di campaign / Input hasil / impor CSV.</div>'}</div>`;
  body.querySelector('#vs-sort').onchange = (e) => { vidSort.key = e.target.value; contentTab(team, body, ctx); };
  body.onclick = null;
  body.onchange = null;
}

// ======================= PRODUK (AFFILIATE) =======================
async function productsTab(team, body, ctx) {
  const H = ctx.helpers;
  const u = ctx.u;
  const r = await api(`/api/reports/team/${team}?from=${encodeURIComponent(H.since(u.days))}${u.only ? `&only=${u.only}` : ''}`);
  const top = r.products[0];
  body.innerHTML = `${H.kpis([
    { label: 'Produk terjual lewat afiliasi', value: H.num(r.products.length) },
    { label: 'GMV', value: H.rpc(r.totals.revenue), sub: `${H.num(r.totals.orders)} pesanan · AOV ${H.rp(r.totals.aov)}` },
    { label: 'Produk #1', value: top ? esc(top.key.slice(0, 24)) : '–', sub: top ? `${H.pct(top.share)} dari GMV` : '' },
    { label: 'Komisi', value: H.rpc(r.totals.commission), sub: `ROAS ${H.x2(r.totals.roas)}` },
  ])}
  ${H.table(['Produk', 'Porsi GMV', 'Kreator', 'Konten', 'Views', 'Pesanan', 'GMV', 'Komisi + fee', 'ROAS'], r.products.map((g) => [`<b>${esc(g.key)}</b>`, `${H.pct(g.share)}${bar(g.share)}`, H.num(g.creators), H.num(g.posts), H.cpt(g.views), H.num(g.orders), H.rp(g.revenue), H.rp(g.cost), H.x2(g.roas)]),
    'Belum ada data produk. Impor CSV afiliasi yang punya kolom Produk/Nama Produk, atau isi kolom Produk di Input hasil.')}
  ${r.products.length && r.products[0].share > 0.6 ? '<div class="check bad small-note">⚠️ Lebih dari 60% GMV dari satu produk — risiko konsentrasi. Uji produk kedua dengan kreator terbaik.</div>' : ''}`;
  body.onclick = null;
  body.onchange = null;
}

// ======================= LIVESTREAM (AFFILIATE) =======================
async function liveTab(team, body, ctx) {
  const H = ctx.helpers;
  const u = ctx.u;
  const [sessions, r] = await Promise.all([api(`/api/partners/${team}/live`), api(`/api/reports/team/${team}?from=${encodeURIComponent(H.since(u.days))}${u.only ? `&only=${u.only}` : ''}`)]);
  const L = r.live;
  body.innerHTML = `<div class="row-between"><p class="hint">Catat tiap sesi live kreator (dari dashboard LIVE TikTok Shop / Shopee Live). GPM = GMV per 1.000 penonton.</p><button class="primary" id="lv-add">+ Sesi live</button></div>
  ${H.kpis([
    { label: 'Sesi', value: H.num(L.sessions), sub: `${(L.hours || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam` },
    { label: 'Penonton', value: H.cpt(L.views), sub: `puncak ${H.cpt(L.peak)}` },
    { label: 'GMV live', value: H.rpc(L.revenue), sub: `${H.num(L.orders)} pesanan` },
    { label: 'GPM', value: H.rp(L.gpm) },
    { label: 'GMV per jam', value: H.rpc(L.revenue_per_hour) },
  ])}
  <h3>Per kreator</h3>${H.table(['Kreator', 'Brand', 'Sesi', 'Jam', 'Penonton', 'Pesanan', 'GMV', 'GPM', 'GMV/jam'], (L.byCreator || []).map((g) => [esc(g.key), esc(g.brand), g.sessions, (g.hours || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 }), H.cpt(g.views), H.num(g.orders), H.rp(g.revenue), H.rp(g.gpm), H.rpc(g.revenue_per_hour)]))}
  <h3>Riwayat sesi</h3>${H.table(['Tanggal', 'Kreator', 'Durasi', 'Penonton', 'Puncak', 'Pesanan', 'GMV', 'Komisi', 'Produk', ''], sessions.map((s) => [s.day, esc(s.partner_name), s.duration_min ? `${s.duration_min} mnt` : '–', H.cpt(s.views), H.cpt(s.peak_viewers), H.num(s.orders), H.rp(s.revenue), H.rp(s.commission), esc(s.products || ''), `<button class="asset-del static" data-lv-del="${s.id}" aria-label="Hapus">✕</button>`]))}`;
  body.querySelector('#lv-add').onclick = () => {
    if (!ctx.cache.partners.length) return toast('Tambah kreator dulu');
    const f = (k, l, t = 'text') => `<div><label class="label" for="lv-${k}">${l}</label><input id="lv-${k}" name="${k}" type="${t}" ${t === 'text' ? 'inputmode="decimal"' : ''}></div>`;
    openModal(`<form id="lv-form"><h3>Sesi live</h3><div class="form-grid">
      <div class="span-2"><label class="label" for="lv-p">Kreator</label><select id="lv-p" name="partner_id">${ctx.cache.partners.map((p) => `<option value="${p.id}">${esc(p.name)} · ${esc(ctx.brandName(p.brand_id))}</option>`).join('')}</select></div>
      <div><label class="label" for="lv-day">Tanggal</label><input id="lv-day" name="day" type="date" value="${H.today()}" required></div>
      ${f('duration_min', 'Durasi (menit)')}${f('views', 'Total penonton')}${f('peak_viewers', 'Penonton puncak')}${f('orders', 'Pesanan')}${f('revenue', 'GMV (Rp)')}${f('commission', 'Komisi (Rp)')}
      <div class="span-2"><label class="label" for="lv-products">Produk yang dijual</label><input id="lv-products" name="products"></div>
    </div><div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
    $('#modal-box').classList.add('wide');
    $('#lv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api(`/api/partners/${team}/live`, H.json('POST', Object.fromEntries(new FormData(e.target))));
        closeModal();
        liveTab(team, body, ctx);
      } catch (ex) { toast(ex.message); }
    });
  };
  body.onclick = async (e) => {
    if (!e.target.dataset.lvDel) return;
    await api(`/api/partners/${team}/live/${e.target.dataset.lvDel}`, { method: 'DELETE' }).catch((ex) => toast(ex.message));
    liveTab(team, body, ctx);
  };
  body.onchange = null;
}

window.timPX = { research: researchTab, campaigns: campaignsTab, schedule: scheduleTab, content: contentTab, videos: contentTab, products: productsTab, live: liveTab };
