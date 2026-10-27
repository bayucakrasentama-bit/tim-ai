// Operasional lintas divisi (frontend Fase 3 & 4):
// Planner (komentar, log revisi, Approve / Request Revision, metadata wajib, notifikasi), Push to Tim ADV dari Analitik,
// Publishing Kit untuk post gagal, lampirkan hasil AI ke kartu Planner, Kanban testing iklan ADV,
// kalender campaign / listing SEO / audit toko (MP), sampel & AI brief (KOL/Affiliate), objection bank + Ctrl/Cmd+K & follow-up (CS).
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const rp = (n) => (n == null || n === '' ? '–' : `Rp${Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`);
const x2 = (v) => (v == null ? '–' : `${Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 })}x`);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDay = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const canApprove = () => ['owner', 'admin', 'lead'].includes(state.me?.user?.role);
const canManage = () => ['owner', 'admin'].includes(state.me?.user?.role);
const copy = (t, msg = 'Disalin') => navigator.clipboard?.writeText(t).then(() => toast(msg));
const waLink = (t) => `https://wa.me/?text=${encodeURIComponent(t)}`;
const brandOpts = (sel) => state.brands.map((b) => `<option value="${b.id}" ${b.id === (sel ?? state.brandId) ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
const brandName = (id) => state.brands.find((b) => b.id === id)?.name || '';

// ======================= PLANNER =======================
const PILLARS = ['Edukasi', 'Masalah / Pain Point', 'Testimoni', 'Hard Selling', 'Entertainment'];
const KIND = { comment: '💬', revision: '✏️ Revisi', approve: '✅ Approve', status: '↪' };
let lastContentId = null;
document.addEventListener('click', (e) => {
  const card = e.target.closest?.('[data-content]');
  if (card && !e.target.closest('button:not([data-content])')) lastContentId = Number(card.dataset.content);
  if (e.target.matches?.('[data-add-content]') || e.target.id === 'planner-add') lastContentId = null;
}, true);

async function enhanceContentForm(form) {
  if (form.dataset.enhanced) return;
  form.dataset.enhanced = '1';
  const id = lastContentId;
  const dl = $('#pillar-list', form);
  if (dl) { const have = new Set($$('option', dl).map((o) => o.value)); dl.insertAdjacentHTML('afterbegin', PILLARS.filter((p) => !have.has(p)).map((p) => `<option value="${p}">`).join('')); }
  const checks = $('.checks', form);
  if (checks && !$('input[value=shopee]', checks)) {
    checks.insertAdjacentHTML('beforeend', '<label><input type="checkbox" name="platforms" value="shopee"> Shopee Video</label>');
    $$('label', checks).forEach((l) => { l.lastChild.textContent = l.lastChild.textContent.replace(/^ Instagram$/, ' Instagram (Reels)').replace(/^ YouTube$/, ' YouTube (Shorts)'); });
  }
  for (const [sel, txt] of [['label[for=cf-pillar]', 'Pilar *'], ['label[for=cf-hook]', 'Hook (3 detik pertama) *']]) { const l = $(sel, form); if (l) l.textContent = txt; }
  $$('.label', form).filter((l) => l.textContent.trim() === 'Platform').forEach((l) => { l.textContent = 'Target platform *'; });
  const hook = $('#cf-hook', form);
  let item = null;
  if (id) item = await api(`/api/content/${id}`).catch(() => null);
  hook.insertAdjacentHTML('afterend', `<label class="label" for="cf-ref">Link referensi / hook (opsional kalau hook sudah diisi)</label>
    <input id="cf-ref" name="ref_link" value="${esc(item?.ref_link || '')}" placeholder="https://www.tiktok.com/@.../video/...">
    <p class="hint">* Wajib sebelum kartu masuk Review: pilar, target platform, dan hook atau link referensi.</p>`);
  if (!id) return;
  const actions = $('.modal-actions', form);
  actions.insertAdjacentHTML('beforebegin', '<div class="cf-log" id="cf-log"><div class="label">Komentar & log revisi</div><div class="spinner"></div></div>');
  const log = $('#cf-log', form);
  const draw = async () => {
    const r = await api(`/api/content/${id}/comments`);
    const it = await api(`/api/content/${id}`);
    log.innerHTML = `<div class="row-between"><div class="label">Komentar & log revisi</div>${it.approved_by ? `<span class="tag ok">✅ Approved oleh ${esc(it.approved_by)}</span>` : ''}</div>
      ${it.status === 'review' && r.can_approve ? `<div class="approve-bar"><b>Kartu menunggu review.</b>
        <button type="button" class="primary small" data-approve>✅ Approve → Siap</button><button type="button" class="danger small" data-revise>❌ Request Revision → Draft</button></div>` : ''}
      <div class="cf-thread">${r.comments.map((c) => `<div class="cmt cmt-${c.kind}"><div class="cmt-head"><b>${esc(c.author)}</b> <span class="hint">${KIND[c.kind] || ''} · ${new Date(c.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span></div><div>${esc(c.body).replace(/\n/g, '<br>')}</div></div>`).join('') || '<p class="hint">Belum ada komentar.</p>'}</div>
      <div class="cmt-form"><textarea id="cf-cmt" rows="2" placeholder="Tulis komentar / catatan revisi…"></textarea><button type="button" class="ghost small" data-cmt-send>Kirim</button></div>`;
  };
  await draw().catch((ex) => { log.innerHTML = `<p class="error">${esc(ex.message)}</p>`; });
  log.addEventListener('click', async (e) => {
    try {
      if (e.target.matches('[data-cmt-send]')) {
        const body = $('#cf-cmt', log).value.trim();
        if (!body) return;
        await api(`/api/content/${id}/comments`, json('POST', { body }));
        await draw();
      }
      if (e.target.matches('[data-approve]')) {
        await api(`/api/content/${id}/approve`, json('POST', { note: $('#cf-cmt', log).value.trim() }));
        closeModal(); toast('Approved → Siap'); S.show('planner');
      }
      if (e.target.matches('[data-revise]')) {
        const note = $('#cf-cmt', log).value.trim();
        if (!note) { toast('Tulis catatan revisinya dulu di kolom komentar'); $('#cf-cmt', log).focus(); return; }
        await api(`/api/content/${id}/revision`, json('POST', { note }));
        closeModal(); toast('Dikembalikan ke Draft dengan catatan revisi'); S.show('planner');
      }
    } catch (ex) { toast(ex.message); }
  });
}

function enhanceKanban(root) {
  if (!canApprove()) return;
  $$('.kcol[data-col=review] .kcard', root).forEach((card) => {
    if ($('.kcard-approve', card)) return;
    card.insertAdjacentHTML('beforeend', `<div class="kcard-approve"><button class="ok-btn" data-kapprove="${card.dataset.content}" title="Approve → Siap">✅ Approve</button><button class="bad-btn" data-krevise="${card.dataset.content}" title="Minta revisi → Draft">❌ Revisi</button></div>`);
  });
}
document.addEventListener('click', async (e) => {
  const a = e.target.dataset?.kapprove;
  const v = e.target.dataset?.krevise;
  if (!a && !v) return;
  e.stopPropagation();
  try {
    if (a) { await api(`/api/content/${a}/approve`, json('POST', {})); toast('Approved → Siap'); }
    if (v) {
      const note = prompt('Catatan revisi untuk pembuat konten:');
      if (!note) return;
      await api(`/api/content/${v}/revision`, json('POST', { note }));
      toast('Dikembalikan ke Draft');
    }
    S.show('planner');
  } catch (ex) { toast(ex.message); }
}, true);

async function notifyModal() {
  const c = await api('/api/notify');
  const ed = c.can_edit;
  openModal(`<form id="nt-form"><h3>🔔 Notifikasi alur kerja</h3>
    <p class="hint">Dikirim saat kartu masuk Review / Siap, diminta revisi, di-approve, dan saat post gagal terkirim. Brand: <b>${esc(brandName(state.brandId))}</b>.</p>
    <details class="manual" open><summary><b>Telegram</b></summary>
      <ol class="hint"><li>Chat <b>@BotFather</b> → /newbot → salin token.</li><li>Masukkan bot ke grup tim, kirim satu pesan di grup.</li><li>Chat ID grup: buka <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>, cari <code>"chat":{"id":-100…}</code>.</li></ol>
      <input name="telegram_token" type="password" autocomplete="new-password" data-lpignore="true" placeholder="${c.telegram_token ? `${c.telegram_token} tersimpan` : 'Bot token'}" ${ed ? '' : 'disabled'}>
      <input name="telegram_chat" value="${esc(c.telegram_chat)}" placeholder="Chat ID (mis. -1001234567890)" ${ed ? '' : 'disabled'}></details>
    <details class="manual"><summary><b>WhatsApp / webhook</b> (gateway WA seperti Fonnte, Wablas, atau Zapier/Make/n8n)</summary>
      <p class="hint">TIM-AI mengirim POST JSON: <code>{event, text, message, target, data}</code>. Untuk gateway WA, isi URL kirim pesan, nomor/grup tujuan, dan header Authorization (token gateway).</p>
      <input name="webhook_url" value="${esc(c.webhook_url)}" placeholder="https://… (wajib https)" ${ed ? '' : 'disabled'}>
      <input name="webhook_target" value="${esc(c.webhook_target)}" placeholder="Tujuan, mis. 62812xxxx atau ID grup" ${ed ? '' : 'disabled'}>
      <input name="webhook_auth" type="password" autocomplete="new-password" data-lpignore="true" placeholder="${c.webhook_auth ? 'Authorization tersimpan' : 'Header Authorization (opsional)'}" ${ed ? '' : 'disabled'}></details>
    <div class="label">Kirim untuk</div><div class="checks">${Object.entries(c.events).map(([k, l]) => `<label><input type="checkbox" name="ev_${k}" ${c.enabled[k] === false ? '' : 'checked'} ${ed ? '' : 'disabled'}> ${esc(l)}</label>`).join('')}</div>
    <div class="modal-actions"><button type="button" class="ghost" id="nt-test">Kirim tes</button><button type="button" class="ghost" data-close>Tutup</button>${ed ? '<button class="primary">Simpan</button>' : ''}</div></form>`);
  $('#modal-box').classList.add('wide');
  $('#nt-test').onclick = async () => { const r = await api('/api/notify/test', json('POST', {})).catch((ex) => ({ errors: [ex.message] })); toast(r.sent ? `Terkirim ke ${r.sent} kanal` : `Belum terkirim${r.errors?.length ? `: ${r.errors.join('; ')}` : ' (belum ada kanal aktif)'}`); };
  $('#nt-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { telegram_chat: f.get('telegram_chat'), webhook_url: f.get('webhook_url'), webhook_target: f.get('webhook_target'),
      events: Object.fromEntries(Object.keys(c.events).map((k) => [k, f.get(`ev_${k}`) === 'on'])) };
    if (f.get('telegram_token')) body.telegram_token = f.get('telegram_token');
    if (f.get('webhook_auth')) body.webhook_auth = f.get('webhook_auth');
    try { await api('/api/notify', json('PUT', body)); toast('Notifikasi tersimpan'); closeModal(); } catch (ex) { toast(ex.message); }
  };
}
$('#planner-notify')?.addEventListener('click', () => notifyModal().catch((ex) => toast(ex.message)));

// ======================= ANALITIK → TIM ADV =======================
function enhanceAnalytics(root) {
  const head = $('thead tr', root);
  if (head && !$('th.adv-th', head)) head.insertAdjacentHTML('beforeend', '<th class="adv-th">Tim ADV</th>');
  $$('tbody tr[data-metric]', root).forEach((tr) => {
    if ($('.adv-push', tr)) return;
    tr.insertAdjacentHTML('beforeend', `<td><button class="ghost small adv-push" data-push-adv="${tr.dataset.metric}" title="Jadikan materi iklan di antrean Tim ADV">🚀 Push</button></td>`);
  });
}
document.addEventListener('click', async (e) => {
  const id = e.target.dataset?.pushAdv;
  if (!id) return;
  e.stopPropagation();
  e.target.disabled = true;
  try { await api('/api/adv/push-metric', json('POST', { metric_id: Number(id) })); e.target.textContent = '✓ Antrean ADV'; toast('Masuk antrean Tim ADV (Kanban Testing)'); } catch (ex) { toast(ex.message); e.target.disabled = false; }
}, true);

// ======================= PUBLISHING KIT (post gagal) =======================
function enhancePostModal(box) {
  const retry = $('[data-retry]', box);
  if (!retry || $('[data-kit]', box)) return;
  retry.insertAdjacentHTML('beforebegin', `<button class="primary" data-kit="${retry.dataset.retry}">📦 Publishing Kit (posting manual)</button>`);
}
async function kitModal(id) {
  const p = await api(`/api/posts/${id}`);
  const caps = { utama: p.caption || '', ...(p.captions || {}) };
  const failed = p.targets.filter((t) => t.status !== 'success');
  openModal(`<h3>📦 Publishing Kit</h3><p class="hint center">Untuk akun yang gagal / tidak didukung API: unduh media, salin caption, posting manual, lalu tandai selesai.</p>
    ${p.media_url ? `<div class="kit-media">${p.media_type === 'video' ? `<video src="${esc(p.media_url)}" controls></video>` : `<img src="${esc(p.media_url)}" alt="">`}
      <a class="btn" href="${esc(p.media_url)}" download target="_blank" rel="noopener">⬇ Unduh media</a></div>` : '<p class="hint">Post teks (tanpa media).</p>'}
    ${Object.entries(caps).filter(([, v]) => v).map(([k, v]) => `<div class="label">Caption ${k === 'utama' ? '' : `(${esc(k)})`}</div><div class="kit-cap"><pre class="script">${esc(v)}</pre><button class="ghost small" data-kit-copy="${esc(k)}">Salin caption + hashtag</button></div>`).join('')}
    <div class="label">Akun yang belum tayang</div>
    ${failed.map((t) => `<div class="kit-target"><div><b>${esc(t.account_name)}</b> <span class="hint">${esc(t.platform)}</span>${t.error ? `<div class="error-inline">${esc(t.error)}</div>` : ''}</div>
      <input data-kit-url="${t.id}" placeholder="Link postingan (opsional)"><button class="primary small" data-kit-done="${t.id}">Tandai sudah diposting</button></div>`).join('') || '<p class="hint">Semua akun sudah tayang.</p>'}
    <div class="modal-actions"><button class="ghost" data-close>Tutup</button></div>`);
  $('#modal-box').classList.add('wide');
  $('#modal-box').onclick = async (e) => {
    const k = e.target.dataset.kitCopy;
    if (k) copy(caps[k], 'Caption disalin');
    const tid = e.target.dataset.kitDone;
    if (tid) {
      try {
        const r = await api(`/api/posts/${id}/targets/${tid}/manual`, json('POST', { remote_url: $(`[data-kit-url="${tid}"]`).value.trim() }));
        toast(r.status === 'done' ? 'Semua akun selesai ✓' : 'Ditandai sudah diposting');
        kitModal(id);
      } catch (ex) { toast(ex.message); }
    }
  };
}
document.addEventListener('click', (e) => { const id = e.target.dataset?.kit; if (id) { e.stopPropagation(); kitModal(id).catch((ex) => toast(ex.message)); } }, true);

// ======================= HASIL AI → LAMPIRAN PLANNER =======================
function enhanceGenCards(root) {
  $$('.gen-card[data-status=done]', root).forEach((c) => {
    if ($('[data-attach]', c)) return;
    const url = $('[data-copy-url]', c)?.dataset.copyUrl;
    if (url) $('.btn-row', c).insertAdjacentHTML('afterbegin', `<button class="primary small" data-attach="${esc(url)}">📎 Lampirkan ke Planner</button>`);
  });
}
async function attachModal(url) {
  const items = (await api('/api/content')).filter((i) => i.status !== 'tayang');
  openModal(`<form id="at-form"><h3>📎 Lampirkan ke kartu Planner</h3>
    <label class="label" for="at-card">Kartu</label><select id="at-card"><option value="">+ Kartu baru di kolom Ide</option>${items.map((i) => `<option value="${i.id}">${esc(i.title)} · ${esc(i.status)}</option>`).join('')}</select>
    <input id="at-title" placeholder="Judul kartu baru">
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Lampirkan</button></div></form>`);
  $('#at-card').onchange = (e) => { $('#at-title').hidden = !!e.target.value; };
  $('#at-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      let id = $('#at-card').value;
      if (!id) id = (await api('/api/content', json('POST', { title: $('#at-title').value.trim() || 'Visual dari AI', status: 'ide' }))).id;
      await api(`/api/content/${id}/assets`, json('POST', { url, name: url.split('/').pop().slice(0, 80) }));
      closeModal(); toast('Terlampir di kartu Planner ✓');
    } catch (ex) { toast(ex.message); }
  };
}
document.addEventListener('click', (e) => { const u = e.target.dataset?.attach; if (u) { e.stopPropagation(); attachModal(u).catch((ex) => toast(ex.message)); } }, true);

// ======================= KALENDER CAMPAIGN (twin date, payday, event MP) =======================
let mpEvents = null;
async function loadEvents(force = false) { if (!mpEvents || force) mpEvents = await api('/api/mp/events').catch(() => []); return mpEvents; }
function twinDates(fromDay, days) {
  const out = [];
  const start = new Date(`${fromDay}T00:00:00`);
  for (let i = 0; i <= days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const m = d.getMonth() + 1;
    if (d.getDate() === m) out.push({ day: iso(d), title: `${m}.${m} Twin Date Sale`, type: 'twin' });
    if (d.getDate() === 25) out.push({ day: iso(d), title: 'Payday Sale (gajian)', type: 'payday' });
  }
  return out;
}
async function eventsBetween(from, to) {
  const days = Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400e3);
  const custom = (await loadEvents()).filter((e) => e.end_day >= from && e.start_day <= to)
    .flatMap((e) => { const list = []; const s = new Date(`${e.start_day}T00:00:00`); const en = new Date(`${e.end_day}T00:00:00`); for (let d = new Date(s); d <= en; d.setDate(d.getDate() + 1)) list.push({ day: iso(d), title: e.title, type: e.type, brand: brandName(e.brand_id), id: e.id }); return list; });
  return [...twinDates(from, days), ...custom];
}
async function decorateCalendar(el) {
  const cells = $$('[data-day]', el);
  if (!cells.length) return;
  const ev = await eventsBetween(cells[0].dataset.day, cells[cells.length - 1].dataset.day);
  for (const c of cells) {
    const hits = ev.filter((x) => x.day === c.dataset.day);
    if (!hits.length || c.querySelector('.cal-ev')) continue;
    c.classList.add('cal-campaign');
    $('.num', c)?.insertAdjacentHTML('afterend', hits.map((h) => `<span class="cal-ev ev-${h.type}" title="${esc(h.title)}">🔥 ${esc(h.title)}</span>`).join(''));
  }
}
async function campaignBanner(body) {
  const today = iso(new Date());
  const end = iso(new Date(Date.now() + 14 * 86400e3));
  const ev = (await eventsBetween(today, end)).filter((x, i, a) => a.findIndex((y) => y.title === x.title) === i).slice(0, 4);
  if (!ev.length || !body.isConnected) return;
  body.insertAdjacentHTML('afterbegin', `<div class="camp-banner">🔥 <b>Campaign 14 hari ke depan:</b> ${ev.map((x) => `${esc(x.title)} <span class="hint">(${fmtDay(x.day)})</span>`).join(' · ')}</div>`);
}

// ======================= TIM ADV: KANBAN TESTING =======================
const STAGES = [['antrean', 'Antrean Materi (dari organik/konten)'], ['testing', 'Sedang Testing (Fase 1)'], ['winning', 'Winning Campaign (Scale Up)'], ['fatigue', 'Fatigue / Matikan']];
const ADV_PLAT = { meta: 'Meta Ads', tiktok_ads: 'TikTok Ads', shopee_ads: 'Shopee Ads', google_ads: 'Google Ads' };
async function advTesting(team, body, u) {
  const list = await api(`/api/adv/creatives${u.only ? `?only=${u.only}` : ''}`);
  const tot = list.reduce((a, c) => ({ spend: a.spend + (Number(c.spend) || 0), revenue: a.revenue + (Number(c.revenue) || 0), results: a.results + (Number(c.results) || 0) }), { spend: 0, revenue: 0, results: 0 });
  body.innerHTML = `<div class="kpi-row">${[['Total ad spend', rp(tot.spend)], ['Total omzet iklan', rp(tot.revenue)], ['Average ROAS', x2(tot.spend ? tot.revenue / tot.spend : null)], ['Average CPA / CPR', rp(tot.results ? tot.spend / tot.results : null)], ['Materi', `${list.length} · ${list.filter((c) => c.stage === 'winning').length} winning`]].map(([l, v]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div></div>`).join('')}</div>
    <div class="row-between"><p class="hint">Konten organik yang menang di-push dari <b>Analitik → 🚀 Push</b>, diuji di sini, lalu di-scale atau dimatikan. Seret kartu antar kolom.</p><button class="primary" data-cr-new>+ Materi iklan</button></div>
    <div class="adv-kanban">${STAGES.map(([k, l]) => { const items = list.filter((c) => c.stage === k); return `<div class="kcol" data-stage="${k}"><div class="kcol-head"><span>${l}</span><span class="count">${items.length}</span></div><div class="kcol-body">${items.map((c) => `
      <div class="kcard cr-card" draggable="true" data-cr="${c.id}">${c.media_url ? (/\.(mp4|mov|webm)(\?|$)/i.test(c.media_url) ? `<video src="${esc(c.media_url)}" muted></video>` : `<img src="${esc(c.media_url)}" alt="" loading="lazy">`) : ''}
        <div class="kcard-title">${esc(c.title)}</div><div class="kcard-meta"><span class="tag ghost">${esc(ADV_PLAT[c.platform] || c.platform)}</span><span class="tag ghost">${esc(brandName(c.brand_id))}</span>${c.angle ? `<span class="tag">${esc(c.angle.slice(0, 30))}</span>` : ''}</div>
        <div class="cr-nums mono">Budget ${rp(c.daily_budget)}/hr · Spend ${rp(c.spend)}<br>Omzet ${rp(c.revenue)} · <b class="${c.roas != null && c.roas >= 2 ? 'ok-t' : c.roas != null && c.roas < 1 ? 'bad-t' : ''}">ROAS ${x2(c.roas)}</b> · CPA ${rp(c.cpa)}</div></div>`).join('') || '<div class="kempty">Seret kartu ke sini</div>'}</div></div>`; }).join('')}</div>`;
  let drag = null;
  body.ondragstart = (e) => { const c = e.target.closest('[data-cr]'); if (c) { drag = c.dataset.cr; c.classList.add('dragging'); } };
  body.ondragover = (e) => { if (drag && e.target.closest('[data-stage]')) e.preventDefault(); };
  body.ondrop = async (e) => {
    const col = e.target.closest('[data-stage]');
    if (!col || !drag) return;
    e.preventDefault();
    const id = drag; drag = null;
    await api(`/api/adv/creatives/${id}`, json('PATCH', { stage: col.dataset.stage })).catch((ex) => toast(ex.message));
    advTesting(team, body, u);
  };
  body.onclick = (e) => {
    if (e.target.matches('[data-cr-new]')) return creativeForm(null, () => advTesting(team, body, u));
    const c = e.target.closest('[data-cr]');
    if (c) creativeForm(list.find((x) => x.id === Number(c.dataset.cr)), () => advTesting(team, body, u));
  };
}
function creativeForm(c, done) {
  const f = (k, l, ph = '', type = 'text') => `<div><label class="label" for="crf-${k}">${l}</label><input id="crf-${k}" name="${k}" type="${type}" value="${esc(c?.[k] ?? '')}" placeholder="${ph}" ${type === 'text' && /budget|spend|revenue|results/.test(k) ? 'inputmode="decimal"' : ''}></div>`;
  openModal(`<form id="crf"><h3>${c ? 'Materi iklan' : 'Materi iklan baru'}</h3><div class="form-grid">
    ${c ? '' : `<div class="span-2"><label class="label" for="crf-b">Brand</label><select id="crf-b" name="brand_id">${brandOpts()}</select></div>`}
    <div class="span-2">${f('title', 'Judul / nama materi')}</div>
    <div><label class="label" for="crf-st">Tahap</label><select id="crf-st" name="stage">${STAGES.map(([k, l]) => `<option value="${k}" ${k === (c?.stage || 'antrean') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label class="label" for="crf-pl">Platform</label><select id="crf-pl" name="platform">${Object.entries(ADV_PLAT).map(([k, l]) => `<option value="${k}" ${k === (c?.platform || 'meta') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="span-2">${f('media_url', 'Link video/visual', 'https://')}</div>
    ${f('spark_code', 'Spark Ads code / Post ID')}${f('source_url', 'Link konten organik', 'https://')}
    <div class="span-2">${f('angle', 'Angle iklan', 'mis. pain point susah tidur')}</div>
    <div class="span-2">${f('audience', 'Target audience', 'mis. ibu 25-40, minat parenting')}</div>
    ${f('daily_budget', 'Budget harian (Rp)')}${f('spend', 'Spend (Rp)')}${f('revenue', 'Omzet (Rp)')}${f('results', 'Hasil (pesanan/lead)')}
    <div class="span-2"><label class="label" for="crf-n">Catatan & hasil testing</label><textarea id="crf-n" name="notes" rows="3">${esc(c?.notes || '')}</textarea></div>
  </div><div class="modal-actions">${c ? '<button type="button" class="danger" id="crf-del">Hapus</button>' : ''}<button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  $('#modal-box').classList.add('wide');
  $('#crf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api(c ? `/api/adv/creatives/${c.id}` : '/api/adv/creatives', json(c ? 'PATCH' : 'POST', Object.fromEntries(new FormData(e.target)))); closeModal(); done(); } catch (ex) { toast(ex.message); }
  };
  $('#crf-del')?.addEventListener('click', async () => { if (!confirm('Hapus materi ini?')) return; await api(`/api/adv/creatives/${c.id}`, { method: 'DELETE' }); closeModal(); done(); });
}

// ======================= TIM MP =======================
async function mpCampaign(team, body) {
  const today = iso(new Date());
  const end = iso(new Date(Date.now() + 365 * 86400e3));
  const all = await eventsBetween(today, end);
  const custom = (await loadEvents(true));
  const twin = twinDates(today, 365);
  body.innerHTML = `<div class="grid-2"><div class="card"><div class="label">Kalender campaign 12 bulan</div>
    <p class="hint">Twin date (1.1 – 12.12) & payday (tgl 25) muncul otomatis, plus event toko di bawah. Semua tampil sebagai banner 🔥 di Kalender Tim Konten/Medsos dan di halaman Tim ADV.</p>
    <div class="table-wrap"><table class="data"><thead><tr><th>Tanggal</th><th>Campaign</th><th>Hitung mundur</th></tr></thead><tbody>
    ${[...twin, ...custom.map((e) => ({ day: e.start_day, end: e.end_day, title: e.title, type: e.type, brand: brandName(e.brand_id) }))].sort((a, b) => a.day.localeCompare(b.day)).filter((x) => (x.end || x.day) >= today).slice(0, 40)
      .map((x) => `<tr><td>${fmtDay(x.day)}${x.end && x.end !== x.day ? ` – ${fmtDay(x.end)}` : ''}</td><td>${esc(x.title)}${x.brand ? ` <span class="hint">· ${esc(x.brand)}</span>` : ''}</td><td>${Math.max(0, Math.round((new Date(`${x.day}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400e3))} hari</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="label">Tambah event toko (flash sale, campaign marketplace, brand day)</div>
      <form id="mpe" class="form-grid"><div class="span-2"><input name="title" placeholder="mis. Shopee 11.11 Big Sale / Flash Sale Toko" required></div>
      <div><label class="label">Mulai</label><input name="start_day" type="date" required></div><div><label class="label">Selesai</label><input name="end_day" type="date"></div>
      <div><label class="label">Jenis</label><select name="type"><option value="campaign">Campaign marketplace</option><option value="flash">Flash sale</option><option value="brand">Brand day</option><option value="live">Live event</option></select></div>
      <div><label class="label">Brand</label><select name="brand_id">${brandOpts()}</select></div>
      <div class="span-2"><input name="notes" placeholder="Catatan (voucher, target GMV, produk hero)"></div>
      <div class="span-2"><button class="primary">Tambah event</button></div></form>
      <div class="label">Event toko</div>${custom.map((e) => `<div class="row-between ev-row"><span><b>${esc(e.title)}</b> <span class="hint">${fmtDay(e.start_day)} – ${fmtDay(e.end_day)} · ${esc(brandName(e.brand_id))}</span></span><button class="asset-del static" data-ev-del="${e.id}" aria-label="Hapus">✕</button></div>`).join('') || '<p class="hint">Belum ada.</p>'}</div></div>`;
  $('#mpe', body).onsubmit = async (e) => { e.preventDefault(); try { await api('/api/mp/events', json('POST', Object.fromEntries(new FormData(e.target)))); toast('Event ditambahkan'); mpCampaign(team, body); } catch (ex) { toast(ex.message); } };
  body.onclick = async (e) => { const id = e.target.dataset.evDel; if (id && confirm('Hapus event?')) { await api(`/api/mp/events/${id}`, { method: 'DELETE' }); mpCampaign(team, body); } };
}
let lastListing = null;
async function mpListing(team, body) {
  const LIM = { shopee: 120, tokopedia: 70, tiktok_shop: 255, lazada: 255 };
  const draw = () => {
    body.innerHTML = `<form class="card form-grid" id="mpl">
      <div><label class="label">Marketplace</label><select name="marketplace"><option value="shopee">Shopee</option><option value="tiktok_shop">TikTok Shop</option><option value="tokopedia">Tokopedia</option><option value="lazada">Lazada</option></select></div>
      <div><label class="label">Harga & promo</label><input name="price" placeholder="mis. Rp89.000, beli 2 gratis ongkir"></div>
      <div class="span-2"><label class="label">Nama produk *</label><input name="product" required placeholder="mis. Madu Hutan Murni 500gr"></div>
      <div class="span-2"><label class="label">Kata kunci target</label><input name="keywords" placeholder="mis. madu asli, madu hutan, madu murni"></div>
      <div class="span-2"><label class="label">Fitur, spesifikasi, isi paket</label><textarea name="features" rows="3"></textarea></div>
      <div class="span-2"><label class="label">Target pembeli</label><input name="audience"></div>
      <div class="span-2"><button class="primary ai">✨ Optimasi listing</button> <span class="hint">Pakai model default di AI & API Keys.</span></div></form><div id="mpl-out"></div>`;
    const out = $('#mpl-out', body);
    const render = (r, mp) => {
      out.innerHTML = `<div class="card"><div class="label">Judul SEO (batas ${LIM[mp]} karakter)</div>${r.titles.map((t) => `<div class="lst-title"><div><b>${esc(t.title)}</b> <span class="mono hint ${t.title.length > LIM[mp] ? 'bad-t' : ''}">${t.title.length}/${LIM[mp]}</span><div class="hint">${esc(t.why)}</div></div><button class="ghost small" data-cp="${esc(t.title)}">Salin</button></div>`).join('')}
        <div class="row-between"><div class="label">Deskripsi</div><button class="ghost small" data-cp="${esc(r.description)}">Salin deskripsi</button></div><pre class="script">${esc(r.description)}</pre>
        <div class="label">Keunggulan</div><ul>${r.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        <div class="row-between"><div class="label">Kata kunci / tag</div><button class="ghost small" data-cp="${esc(r.keywords.join(', '))}">Salin</button></div><p>${r.keywords.map((k) => `<span class="tag ghost">${esc(k)}</span>`).join(' ')}</p>
        <div class="label">Ide gambar slide 1–7</div><div class="table-wrap"><table class="data"><thead><tr><th>Slide</th><th>Visual</th><th>Teks di gambar</th></tr></thead><tbody>${r.slides.map((s) => `<tr><td>${s.slide}</td><td>${esc(s.visual)}</td><td>${esc(s.text_on_image)}</td></tr>`).join('')}</tbody></table></div>
        ${r.warnings?.length ? `<div class="check bad"><b>Cek kepatuhan:</b><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}</div>`;
    };
    if (lastListing) render(lastListing.r, lastListing.mp);
    $('#mpl', body).onsubmit = async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target));
      out.innerHTML = '<div class="card"><div class="spinner"></div></div>';
      try { const r = await api('/api/mp/listing-ai', json('POST', v)); lastListing = { r, mp: v.marketplace }; render(r, v.marketplace); } catch (ex) { out.innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; }
    };
    body.onclick = (e) => { if (e.target.dataset.cp !== undefined) copy(e.target.dataset.cp); };
  };
  draw();
}
async function mpAudit(team, body) {
  const r = await api('/api/mp/audits?days=14');
  const today = iso(new Date());
  const shops = [...new Set(r.audits.map((a) => a.shop))];
  const cur = (shop) => r.audits.find((a) => a.day === today && a.shop === shop);
  const draw = (shop = shops[0] || '') => {
    const a = cur(shop);
    const items = a ? JSON.parse(a.items) : {};
    body.innerHTML = `<div class="grid-2"><form class="card" id="mpa"><div class="row-between"><div class="label">Audit toko hari ini · ${fmtDay(today)}</div>
      <input name="shop" list="mpa-shops" value="${esc(shop)}" placeholder="Nama toko (mis. Zestmag Official Shopee)" class="inline-input"><datalist id="mpa-shops">${shops.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
      <div class="audit-list">${Object.entries(r.items).map(([k, l]) => `<label class="audit-item"><input type="checkbox" name="${k}" ${items[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      <textarea name="notes" rows="2" placeholder="Catatan / masalah yang ditemukan">${esc(a?.notes || '')}</textarea>
      <button class="primary">Simpan audit</button></form>
      <div class="card"><div class="label">Riwayat 14 hari</div><div class="table-wrap"><table class="data"><thead><tr><th>Tanggal</th><th>Toko</th><th>Selesai</th><th>Oleh</th></tr></thead><tbody>
      ${r.audits.map((x) => { const it = JSON.parse(x.items); const n = Object.values(it).filter(Boolean).length; const t = Object.keys(r.items).length; return `<tr><td>${fmtDay(x.day)}</td><td>${esc(x.shop || '–')}</td><td><b class="${n === t ? 'ok-t' : n < t / 2 ? 'bad-t' : ''}">${n}/${t}</b></td><td>${esc(x.created_by)} <button class="asset-del static" data-audit-del="${x.id}" aria-label="Hapus">✕</button></td></tr>`; }).join('') || '<tr><td colspan="4" class="hint">Belum ada audit.</td></tr>'}</tbody></table></div></div></div>`;
    $('#mpa', body).onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try { await api('/api/mp/audits', json('PUT', { day: today, shop: f.get('shop'), notes: f.get('notes'), items: Object.fromEntries(Object.keys(r.items).map((k) => [k, f.get(k) === 'on'])) })); toast('Audit tersimpan'); mpAudit(team, body); } catch (ex) { toast(ex.message); }
    };
    $('[name=shop]', body).onchange = (e) => draw(e.target.value);
    body.onclick = async (e) => { const id = e.target.dataset.auditDel; if (id && confirm('Hapus catatan audit ini?')) { await api(`/api/mp/audits/${id}`, { method: 'DELETE' }); mpAudit(team, body); } };
  };
  draw();
}

// ======================= KOL & AFFILIATE: SAMPEL, AI BRIEF =======================
const SAMPLE_ST = { disiapkan: 'Disiapkan', dikirim: 'Dikirim', diterima: 'Diterima', konten_tayang: 'Konten tayang', tidak_ada_konten: 'Tidak ada konten', retur: 'Retur' };
async function samplesTab(team, body, ctx) {
  const rows = await api(`/api/samples/${team}`);
  const partners = ctx.cache.partners;
  const by = (k) => rows.filter((r) => r.status === k).length;
  body.innerHTML = `<div class="kpi-row">${Object.entries(SAMPLE_ST).map(([k, l]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${by(k)}</div></div>`).join('')}<div class="kpi"><div class="kpi-label">Total HPP sampel</div><div class="kpi-value">${rp(rows.reduce((a, r) => a + (Number(r.hpp) || 0), 0))}</div></div></div>
    <details class="card manual" ${rows.length ? '' : 'open'}><summary><b>+ Kirim sampel</b> (bisa ke banyak ${team === 'kol' ? 'KOL' : 'kreator'} sekaligus)</summary>
      <form id="smp" class="form-grid"><div class="span-2"><label class="label">Penerima</label><div class="checks smp-list">${partners.map((p) => `<label><input type="checkbox" name="pid" value="${p.id}"> ${esc(p.name)}${p.handle ? ` @${esc(p.handle)}` : ''} <span class="hint">${esc(ctx.brandName(p.brand_id))}</span></label>`).join('') || '<span class="hint">Tambah mitra dulu.</span>'}</div></div>
      <div><label class="label">Produk *</label><input name="product" required></div><div><label class="label">HPP per sampel (Rp)</label><input name="hpp" inputmode="decimal"></div>
      <div><label class="label">Kurir</label><input name="courier" list="smp-kurir" placeholder="JNE / J&T / SiCepat…"><datalist id="smp-kurir">${['JNE', 'J&T', 'SiCepat', 'AnterAja', 'Ninja Xpress', 'ID Express', 'Pos Indonesia', 'GoSend', 'GrabExpress', 'Lion Parcel'].map((k) => `<option value="${k}">`).join('')}</datalist></div>
      <div><label class="label">No. resi (kalau 1 penerima)</label><input name="resi"></div>
      <div><label class="label">Tanggal kirim</label><input name="sent_at" type="date" value="${iso(new Date())}"></div>
      <div><label class="label">Status</label><select name="status">${Object.entries(SAMPLE_ST).map(([k, l]) => `<option value="${k}" ${k === 'dikirim' ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="span-2"><button class="primary">Simpan pengiriman</button></div></form></details>
    <div class="table-wrap"><table class="data"><thead><tr><th>${team === 'kol' ? 'KOL' : 'Kreator'}</th><th>Produk</th><th>Kurir & resi</th><th>Kirim</th><th>HPP</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><b>${esc(r.partner_name)}</b>${r.handle ? `<div class="hint">@${esc(r.handle)}</div>` : ''}</td><td>${esc(r.product)}</td>
        <td>${esc(r.courier || '–')} <input class="inline-input smp-resi" data-smp-resi="${r.id}" value="${esc(r.resi)}" placeholder="isi resi">${r.resi ? ` <a href="https://cekresi.com/?noresi=${encodeURIComponent(r.resi)}" target="_blank" rel="noopener">lacak ↗</a>` : ''}</td>
        <td>${fmtDay(r.sent_at)}</td><td>${rp(r.hpp)}</td><td><select data-smp-st="${r.id}">${Object.entries(SAMPLE_ST).map(([k, l]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><button class="asset-del static" data-smp-del="${r.id}" aria-label="Hapus">✕</button></td></tr>`).join('') || '<tr><td colspan="7" class="hint">Belum ada pengiriman sampel.</td></tr>'}</tbody></table></div>`;
  $('#smp', body).onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const ids = f.getAll('pid').map(Number);
    if (!ids.length) return toast('Centang minimal satu penerima');
    try { const r = await api(`/api/samples/${team}`, json('POST', { partner_ids: ids, product: f.get('product'), hpp: f.get('hpp'), courier: f.get('courier'), resi: f.get('resi'), sent_at: f.get('sent_at'), status: f.get('status') })); toast(`${r.created} pengiriman dicatat`); samplesTab(team, body, ctx); } catch (ex) { toast(ex.message); }
  };
  body.onchange = async (e) => {
    const st = e.target.dataset.smpSt;
    const re = e.target.dataset.smpResi;
    if (st) await api(`/api/samples/${team}/${st}`, json('PATCH', { status: e.target.value })).then(() => toast('Status sampel diperbarui')).catch((ex) => toast(ex.message));
    if (re) await api(`/api/samples/${team}/${re}`, json('PATCH', { resi: e.target.value })).then(() => toast('Resi tersimpan')).catch((ex) => toast(ex.message));
  };
  body.onclick = async (e) => { const id = e.target.dataset.smpDel; if (id && confirm('Hapus data sampel?')) { await api(`/api/samples/${team}/${id}`, { method: 'DELETE' }); samplesTab(team, body, ctx); } };
}
let lastBrief = '';
async function briefTab(team, body) {
  body.innerHTML = `<form class="card form-grid" id="brf">
    <div class="span-2"><label class="label">Produk *</label><input name="product" required></div>
    <div class="span-2"><label class="label">Link produk / link affiliate</label><input name="link" placeholder="https://"></div>
    <div><label class="label">Komisi / fee</label><input name="commission" placeholder="mis. komisi 15% + bonus Rp50rb tiap 20 order"></div>
    <div><label class="label">Deadline / periode</label><input name="deadline"></div>
    <div class="span-2"><label class="label">Keunggulan utama</label><textarea name="usp" rows="3"></textarea></div>
    <div class="span-2"><label class="label">Target pembeli</label><input name="audience"></div>
    <div><label class="label">Wajib</label><textarea name="dos" rows="2"></textarea></div><div><label class="label">Dilarang</label><textarea name="donts" rows="2" placeholder="mis. klaim menyembuhkan, before-after ekstrem"></textarea></div>
    <div class="span-2"><button class="primary ai">✨ Buat brief</button></div></form><div id="brf-out"></div>`;
  const out = $('#brf-out', body);
  const show = (t) => { out.innerHTML = `<div class="card"><div class="row-between"><div class="label">Brief siap kirim</div><div class="btn-row"><button class="ghost small" data-brf-copy>Salin</button><a class="btn small" href="${waLink(t)}" target="_blank" rel="noopener">Kirim via WhatsApp</a></div></div><textarea rows="18" id="brf-text">${esc(t)}</textarea></div>`; };
  if (lastBrief) show(lastBrief);
  $('#brf', body).onsubmit = async (e) => {
    e.preventDefault();
    out.innerHTML = '<div class="card"><div class="spinner"></div></div>';
    try { lastBrief = (await api(`/api/partners/${team}/ai-brief`, json('POST', Object.fromEntries(new FormData(e.target))))).text; show(lastBrief); } catch (ex) { out.innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; }
  };
  body.onclick = (e) => { if (e.target.matches('[data-brf-copy]')) copy($('#brf-text', body).value, 'Brief disalin'); };
}

// ======================= TIM CS =======================
let tplCache = null;
async function loadTpl(force = false) { if (!tplCache || force) tplCache = await api('/api/cs/templates'); return tplCache; }
async function csObjections(body) {
  const all = await loadTpl(true);
  const list = all.filter((t) => ['keberatan', 'pertanyaan', 'pengiriman', 'pembayaran', 'komplain_produk'].includes(t.category));
  body.innerHTML = `<div class="row-between"><input id="ob-q" class="search" placeholder="Cari skrip… (atau tekan Ctrl/Cmd + K di mana saja)"><div class="btn-row">${all.some((t) => t.category === 'keberatan') ? '' : '<button class="primary" data-ob-seed>Isi paket skrip keberatan standar</button>'}<button class="ghost" data-goto-tpl>+ Template</button></div></div>
    <div class="ob-grid" id="ob-grid"></div>`;
  const grid = $('#ob-grid', body);
  const draw = (q = '') => {
    const items = list.filter((t) => !q || `${t.title} ${t.body}`.toLowerCase().includes(q.toLowerCase()));
    grid.innerHTML = items.map((t) => `<div class="card ob-card"><div class="row-between"><b>${esc(t.title)}</b><span class="tag ghost">${esc(t.category.replace('_', ' '))}</span></div><p>${esc(t.body)}</p>
      <div class="btn-row left"><button class="primary small" data-ob-copy="${t.id}">Salin</button><a class="btn small" href="${waLink(t.body)}" target="_blank" rel="noopener" data-ob-wa="${t.id}">1-Click WhatsApp</a></div></div>`).join('') || '<div class="empty">Belum ada skrip. Klik "Isi paket skrip keberatan standar" lalu sesuaikan [placeholder]-nya.</div>';
  };
  draw();
  $('#ob-q', body).oninput = (e) => draw(e.target.value);
  body.onclick = async (e) => {
    const d = e.target.dataset;
    if (d.obCopy) { const t = list.find((x) => x.id === Number(d.obCopy)); copy(t.body, 'Skrip disalin'); api(`/api/cs/templates/${t.id}`, json('PATCH', { used: true })).catch(() => {}); }
    if (d.obSeed !== undefined) { const r = await api('/api/cs/objections/seed', json('POST', {})); toast(`${r.added} skrip ditambahkan, edit [placeholder]-nya di tab Template balasan`); csObjections(body); }
    if (d.gotoTpl !== undefined) $('#cs-tabs [data-cs=templates]')?.click();
  };
}
async function csFollowup(body) {
  const presets = await api('/api/ai/presets').catch(() => []);
  body.innerHTML = `<form class="card form-grid" id="fu">
    <div class="span-2"><label class="label">Produk *</label><input name="product" required></div>
    <div class="span-2"><label class="label">Konteks pelanggan</label><input name="context" placeholder="mis. sudah checkout COD tapi belum konfirmasi / tanya harga lalu diam"></div>
    <div class="span-2"><label class="label">Promo yang boleh dipakai</label><input name="offer"></div>
    <div class="span-2"><label class="label">Brand voice</label><select name="voice"><option value="">Bawaan (ramah, sopan)</option>${presets.map((p) => `<option value="${esc(p.system)}">${esc(p.name)}</option>`).join('')}</select><p class="hint">Preset dibuat di AI Studio → Playground → "Simpan sebagai preset". Model mengikuti model default di AI & API Keys.</p></div>
    <div class="span-2"><button class="primary ai">✨ Buat urutan follow-up</button></div></form><div id="fu-out"></div>`;
  const out = $('#fu-out', body);
  let msgs = [];
  $('#fu', body).onsubmit = async (e) => {
    e.preventDefault();
    out.innerHTML = '<div class="card"><div class="spinner"></div></div>';
    try {
      msgs = (await api('/api/cs/followup-ai', json('POST', Object.fromEntries(new FormData(e.target))))).messages;
      out.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Jadwal</th><th>Tujuan</th><th>Pesan WhatsApp</th><th></th></tr></thead><tbody>${msgs.map((m, i) => `<tr><td><b>${esc(m.step)}</b></td><td>${esc(m.goal)}</td><td class="fu-text">${esc(m.text).replace(/\n/g, '<br>')}</td>
        <td><div class="btn-row"><button class="ghost small" data-fu-copy="${i}">Salin</button><a class="btn small" href="${waLink(m.text)}" target="_blank" rel="noopener">WA</a><button class="ghost small" data-fu-save="${i}">Simpan template</button></div></td></tr>`).join('')}</tbody></table></div>`;
    } catch (ex) { out.innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; }
  };
  body.onclick = async (e) => {
    const d = e.target.dataset;
    if (d.fuCopy !== undefined) copy(msgs[Number(d.fuCopy)].text);
    if (d.fuSave !== undefined) { const m = msgs[Number(d.fuSave)]; await api('/api/cs/templates', json('POST', { title: m.step, category: 'follow_up', body: m.text })).then(() => { toast('Disimpan ke Template balasan'); e.target.disabled = true; }).catch((ex) => toast(ex.message)); }
  };
}
// Ctrl/Cmd + K: cari skrip CS dari halaman mana pun, Enter = salin.
document.addEventListener('keydown', async (e) => {
  if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) return;
  e.preventDefault();
  const all = await loadTpl().catch(() => []);
  openModal(`<div class="palette-box"><input id="pk-q" placeholder="Cari skrip CS… (Enter = salin, Esc = tutup)" autofocus><div id="pk-list" class="pk-list"></div></div>`);
  let hits = all;
  const draw = (q) => {
    hits = all.filter((t) => !q || `${t.title} ${t.body}`.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
    $('#pk-list').innerHTML = hits.map((t, i) => `<button class="pk-item ${i === 0 ? 'on' : ''}" data-pk="${t.id}"><b>${esc(t.title)}</b><span>${esc(t.body.slice(0, 120))}</span></button>`).join('') || '<p class="hint">Tidak ada skrip. Tambah di Tiket & Template.</p>';
  };
  draw('');
  $('#pk-q').focus();
  $('#pk-q').oninput = (ev) => draw(ev.target.value);
  $('#pk-q').onkeydown = (ev) => { if (ev.key === 'Enter' && hits[0]) { copy(hits[0].body, `Disalin: ${hits[0].title}`); closeModal(); } if (ev.key === 'Escape') closeModal(); };
  $('#pk-list').onclick = (ev) => { const b = ev.target.closest('[data-pk]'); if (b) { const t = all.find((x) => x.id === Number(b.dataset.pk)); copy(t.body, `Disalin: ${t.title}`); closeModal(); } };
});

// ======================= Pengamat DOM =======================
new MutationObserver(() => {
  const form = $('#modal-box #content-form');
  if (form) enhanceContentForm(form).catch((ex) => console.error(ex));
  enhancePostModal($('#modal-box'));
}).observe($('#modal-box'), { childList: true });
const kb = $('#kanban');
if (kb) new MutationObserver(() => enhanceKanban(kb)).observe(kb, { childList: true });
const an = $('#an-table');
if (an) new MutationObserver(() => enhanceAnalytics(an)).observe(an, { childList: true, subtree: true });
new MutationObserver(() => enhanceGenCards(document)).observe(document.querySelector('main'), { childList: true, subtree: true });

window.timOps = {
  decorateCalendar: (el) => decorateCalendar(el).catch(() => {}),
  campaignBanner: (b) => campaignBanner(b).catch(() => {}),
  adsTabs: { testing: advTesting, campaign: mpCampaign, listing: mpListing, audit: mpAudit },
  csObjections: (b) => csObjections(b).catch((ex) => toast(ex.message)),
  csFollowup: (b) => csFollowup(b).catch((ex) => toast(ex.message)),
};
if (window.timPX) Object.assign(window.timPX, { samples: samplesTab, brief: briefTab });
