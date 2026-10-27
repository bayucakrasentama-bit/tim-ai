// Inbox CS omnichannel (ala Desty Chat): Shopee, TikTok Shop/Tokopedia, Lazada, WhatsApp, Instagram dalam satu layar.
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel) => document.querySelector(sel);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const view = $('#view-inbox');

const PLATFORM = {
  simulasi: { label: 'Simulasi', short: 'SIM', color: '#64748b' },
  shopee: { label: 'Shopee', short: 'S', color: '#ee4d2d' },
  tiktokshop: { label: 'TikTok Shop', short: 'TT', color: '#111111' },
  tokopedia: { label: 'Tokopedia', short: 'TP', color: '#03ac0e' },
  lazada: { label: 'Lazada', short: 'LZ', color: '#0f146d' },
  whatsapp: { label: 'WhatsApp', short: 'WA', color: '#25d366' },
  instagram: { label: 'Instagram', short: 'IG', color: '#e1306c' },
};
const FILTERS = [['open', 'Semua'], ['unread', 'Belum dibaca'], ['unreplied', 'Belum dibalas'], ['mine', 'Saya'], ['closed', 'Selesai']];
const ORDER_LABEL = { unpaid: 'Belum dibayar', paid: 'Diproses', shipped: 'Dikirim', delivered: 'Sampai', completed: 'Selesai', cancelled: 'Batal', failed: 'Gagal kirim' };

const I = {
  filter: 'open', channel: '', q: '', convs: [], channels: [], current: null, panel: 'customer', tab: 'inbox', settingsTab: 'channels',
  people: [], templates: [], pending: null, timer: null, platforms: null, lastSig: '',
};

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};
const waitingMin = (c) => (c.waiting_since ? Math.round((Date.now() - new Date(c.waiting_since)) / 60000) : null);
const platformOf = (c) => (c.channel?.platform === 'tiktokshop' && c.customer_platform === 'tokopedia' ? 'tokopedia' : c.channel?.platform);
const badge = (p) => `<span class="pf-badge" style="--pf:${PLATFORM[p]?.color || '#888'}" title="${esc(PLATFORM[p]?.label || p)}">${esc(PLATFORM[p]?.short || '?')}</span>`;
const avatar = (c) => (c.customer_avatar
  ? `<img class="ib-avatar" src="${esc(c.customer_avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
  : `<span class="ib-avatar">${esc((c.customer_name || '?').trim()[0]?.toUpperCase() || '?')}</span>`);

// ======================================================================
// Kerangka
// ======================================================================
function shell() {
  view.innerHTML = `
    <div class="page-head"><div><h1>Inbox</h1><p class="hint">Semua chat marketplace & DM dalam satu tempat. Balas langsung dari TIM-AI.</p></div>
      <div class="tabs" id="ib-tabs"><button data-ibtab="inbox">Percakapan</button><button data-ibtab="settings">Pengaturan</button></div></div>
    <div id="ib-body"></div>`;
  $('#ib-tabs').addEventListener('click', (e) => { if (e.target.dataset.ibtab) { I.tab = e.target.dataset.ibtab; draw(); } });
}

async function draw() {
  document.querySelectorAll('#ib-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.ibtab === I.tab));
  if (I.tab === 'settings') return drawSettings();
  $('#ib-body').innerHTML = `
    <div class="inbox">
      <aside class="ib-list">
        <div class="ib-search"><input id="ib-q" placeholder="Cari pembeli atau pesan…" value="${esc(I.q)}"></div>
        <div class="ib-filters" id="ib-filters"></div>
        <select id="ib-channel" class="ib-channel" aria-label="Filter channel"></select>
        <div id="ib-convs" class="ib-convs"></div>
      </aside>
      <section class="ib-chat" id="ib-chat"></section>
      <aside class="ib-side" id="ib-side"></aside>
    </div>`;
  $('#ib-q').addEventListener('input', debounce(() => { I.q = $('#ib-q').value.trim(); loadList(); }, 250));
  $('#ib-filters').addEventListener('click', (e) => { const f = e.target.closest('[data-f]')?.dataset.f; if (f) { I.filter = f; loadList(); } });
  $('#ib-channel').addEventListener('change', (e) => { I.channel = e.target.value; loadList(); });
  $('#ib-convs').addEventListener('click', (e) => { const id = e.target.closest('[data-conv]')?.dataset.conv; if (id) openConv(Number(id)); });
  await Promise.all([loadChannels(), loadPeople(), loadTemplates()]);
  await loadList();
  if (I.current) openConv(I.current.id, { quiet: true }); else drawEmptyChat();
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function loadChannels() {
  I.channels = await api('/api/inbox/channels').catch(() => []);
  const sel = $('#ib-channel');
  if (sel) sel.innerHTML = `<option value="">Semua channel (${I.channels.length})</option>${I.channels.map((c) => `<option value="${c.id}" ${String(c.id) === I.channel ? 'selected' : ''}>${esc(PLATFORM[c.platform]?.label || c.platform)} · ${esc(c.name)}</option>`).join('')}`;
}
async function loadPeople() { I.people = await api('/api/assignees').catch(() => []); }
async function loadTemplates() { I.templates = await api('/api/cs/templates').catch(() => []); }

async function loadList() {
  const q = new URLSearchParams({ filter: I.filter });
  if (I.channel) q.set('channel', I.channel);
  if (I.q) q.set('q', I.q);
  const [convs, sum] = await Promise.all([api(`/api/inbox/conversations?${q}`), api('/api/inbox/summary')]);
  I.convs = convs;
  const counts = { unread: sum.unread, unreplied: sum.unreplied, mine: sum.mine };
  $('#ib-filters').innerHTML = FILTERS.map(([k, l]) => `<button data-f="${k}" class="chip-f ${k === I.filter ? 'on' : ''}">${l}${counts[k] ? ` <b>${counts[k]}</b>` : ''}</button>`).join('');
  S.setNavBadge?.('inbox', sum.unread);
  if (!I.channels.length) {
    $('#ib-convs').innerHTML = `<div class="ib-empty-list"><p>Belum ada channel tersambung.</p><button class="primary" data-ibgo="channels">+ Sambungkan toko</button><p class="hint">Mau nyoba dulu? Tambah channel <b>Simulasi</b>.</p></div>`;
    return;
  }
  $('#ib-convs').innerHTML = convs.map((c) => {
    const w = waitingMin(c);
    return `<button class="ib-conv ${I.current?.id === c.id ? 'on' : ''}" data-conv="${c.id}">
      <span class="ib-av-wrap">${avatar(c)}${badge(platformOf(c))}</span>
      <span class="ib-conv-main">
        <span class="ib-row"><b class="ib-name">${esc(c.customer_name || c.customer_id || 'Pembeli')}</b><span class="ib-time">${fmtTime(c.last_message_at)}</span></span>
        <span class="ib-row"><span class="ib-prev">${c.last_from === 'staff' ? '<span class="ib-you">Kamu: </span>' : ''}${esc(c.last_preview || '')}</span>
          ${c.unread ? `<span class="ib-unread">${c.unread}</span>` : w !== null && w >= 5 ? `<span class="ib-wait ${w >= 60 ? 'late' : ''}" title="Menunggu dibalas">${w >= 60 ? `${Math.floor(w / 60)}j` : `${w}m`}</span>` : ''}</span>
        <span class="ib-meta">${esc(c.channel?.name || '')}${c.tags.length ? ` · ${c.tags.map((t) => `#${esc(t)}`).join(' ')}` : ''}</span>
      </span></button>`;
  }).join('') || '<div class="empty">Tidak ada percakapan di filter ini.</div>';
}

function drawEmptyChat() {
  $('#ib-chat').innerHTML = `<div class="ib-placeholder"><div class="ib-ph-icon">💬</div><b>Pilih percakapan</b><p class="hint">Pesan dari Shopee, TikTok Shop, Tokopedia, Lazada, WhatsApp, dan Instagram muncul di sini.</p></div>`;
  $('#ib-side').innerHTML = '';
}

// ======================================================================
// Percakapan
// ======================================================================
async function openConv(id, { quiet = false } = {}) {
  const c = await api(`/api/inbox/conversations/${id}?read=1`);
  const sig = `${c.id}:${c.messages.length}:${c.messages.at(-1)?.id}:${c.assignee}:${c.status}`;
  if (quiet && I.current?.id === id && sig === I.lastSig) return;
  const same = I.current?.id === id;
  const draft = same ? $('#ib-text')?.value : '';
  I.current = c;
  I.lastSig = sig;
  document.querySelectorAll('.ib-conv').forEach((b) => b.classList.toggle('on', Number(b.dataset.conv) === id));
  const p = platformOf(c);
  const meta24 = ['whatsapp', 'instagram'].includes(c.channel?.platform);
  const lastIn = [...c.messages].reverse().find((m) => m.direction === 'in');
  const expired = meta24 && lastIn && Date.now() - new Date(lastIn.sent_at) > 24 * 3600_000;
  $('#ib-chat').innerHTML = `
    <header class="ib-head">
      <button class="icon-btn ib-back" id="ib-back" aria-label="Kembali ke daftar">←</button>
      <span class="ib-av-wrap">${avatar(c)}${badge(p)}</span>
      <div class="ib-head-main"><b>${esc(c.customer_name || c.customer_id || 'Pembeli')}</b><span class="hint">${esc(PLATFORM[p]?.label || '')} · ${esc(c.channel?.name || '')}</span></div>
      <select id="ib-assign" aria-label="PIC"><option value="">Belum ditugaskan</option>${I.people.map((u) => `<option value="${u.id}" ${u.id === c.assignee_id ? 'selected' : ''}>${esc(u.username)}</option>`).join('')}</select>
      <button class="ghost small" id="ib-refresh" title="Ambil pesan terbaru dari platform">↻</button>
      <button class="${c.status === 'closed' ? 'ghost' : 'primary'} small" id="ib-close">${c.status === 'closed' ? 'Buka lagi' : '✓ Selesai'}</button>
    </header>
    <div class="ib-msgs" id="ib-msgs">${drawMessages(c.messages)}</div>
    <footer class="ib-compose">
      ${!c.can_reply ? '<div class="ib-warn">Platform tidak mengizinkan membalas percakapan ini.</div>' : expired ? '<div class="ib-warn">Lewat 24 jam sejak pesan terakhir pelanggan. Meta tidak mengizinkan balasan biasa sampai pelanggan menulis lagi.</div>' : ''}
      <div class="ib-tools">
        <button class="ib-tool" id="ib-tpl" title="Template cepat (ketik / di kotak pesan)">⚡ Template</button>
        <label class="ib-tool" title="Kirim gambar">🖼 Gambar<input type="file" id="ib-img" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
        <button class="ib-tool ai" id="ib-suggest" title="Saran balasan dari AI">✨ Saran balasan</button>
        <span class="ib-pending" id="ib-pending"></span>
      </div>
      <div class="ib-input"><textarea id="ib-text" rows="2" placeholder="Tulis balasan… (Enter kirim, Shift+Enter baris baru, / untuk template)"></textarea>
        <button class="primary" id="ib-send">Kirim</button></div>
      <div class="ib-tpl-pop" id="ib-tpl-pop" hidden></div>
    </footer>`;
  $('.inbox')?.classList.add('chat-open');
  $('#ib-back').onclick = () => $('.inbox')?.classList.remove('chat-open');
  const box = $('#ib-msgs');
  box.scrollTop = box.scrollHeight;
  $('#ib-text').value = draft || '';
  bindChat();
  drawSide();
  if (!quiet) loadList();
}

function drawMessages(msgs) {
  let lastDay = '';
  return msgs.map((m) => {
    const d = new Date(m.sent_at);
    const dayStr = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    const sep = dayStr !== lastDay ? `<div class="ib-day">${dayStr}</div>` : '';
    lastDay = dayStr;
    if (m.type === 'system') return `${sep}<div class="ib-sys">${esc(m.text)}</div>`;
    const body = m.type === 'image' && m.media_url ? `<a href="${esc(m.media_url)}" target="_blank" rel="noopener"><img class="ib-img" src="${esc(m.media_url)}" alt="Gambar" referrerpolicy="no-referrer"></a>${m.text ? `<div>${esc(m.text)}</div>` : ''}`
      : m.type === 'product' || m.type === 'order' ? `<div class="ib-card">${m.type === 'product' ? '🛍' : '📦'} ${esc(m.text || (m.type === 'product' ? 'Produk' : 'Pesanan'))}</div>`
        : m.type === 'image' ? '<i>[Gambar]</i>' : m.type === 'other' && !m.text ? '<i>[Pesan tidak didukung, cek di aplikasi platform]</i>' : esc(m.text).replace(/\n/g, '<br>');
    const who = m.direction === 'out' ? esc(m.staff || m.sender || 'Toko') : '';
    return `${sep}<div class="ib-msg ${m.direction} ${m.status === 'failed' ? 'failed' : ''} ${m.staff_id === null && m.direction === 'out' ? 'auto' : ''}">
      <div class="ib-bubble">${body}</div>
      <div class="ib-foot">${who ? `${who} · ` : ''}${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
        ${m.status === 'failed' ? ` · <span class="err">Gagal: ${esc(m.error || '')}</span> <button class="link" data-retry-msg="${m.id}">Kirim ulang</button>` : m.direction === 'out' ? ' ✓' : ''}
        ${m.response_seconds !== null && m.response_seconds !== undefined ? ` · dibalas ${m.response_seconds < 60 ? `${m.response_seconds} dtk` : `${Math.round(m.response_seconds / 60)} mnt`}` : ''}</div></div>`;
  }).join('') || '<div class="ib-sys">Belum ada pesan.</div>';
}

function bindChat() {
  const c = I.current;
  const text = $('#ib-text');
  const send = async () => {
    const value = text.value.trim();
    if (!value && !I.pending) return;
    $('#ib-send').disabled = true;
    try {
      let msg;
      if (I.pending) {
        const fd = new FormData();
        fd.set('image', I.pending);
        if (value) fd.set('text', value);
        msg = await api(`/api/inbox/conversations/${c.id}/messages`, { method: 'POST', body: fd }).catch((ex) => ({ error: ex.message, status: 'failed' }));
      } else {
        msg = await api(`/api/inbox/conversations/${c.id}/messages`, json('POST', { text: value })).catch((ex) => ({ error: ex.message, status: 'failed' }));
      }
      if (msg?.status === 'failed') toast(`Gagal kirim: ${msg.error}`);
      text.value = '';
      I.pending = null;
      $('#ib-pending').textContent = '';
      await openConv(c.id);
    } finally {
      $('#ib-send').disabled = false;
      text.focus();
    }
  };
  $('#ib-send').addEventListener('click', send);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  text.addEventListener('input', () => {
    if (text.value.startsWith('/')) showTemplates(text.value.slice(1));
    else $('#ib-tpl-pop').hidden = true;
  });
  $('#ib-tpl').addEventListener('click', () => ($('#ib-tpl-pop').hidden ? showTemplates('') : ($('#ib-tpl-pop').hidden = true)));
  $('#ib-img').addEventListener('change', (e) => {
    I.pending = e.target.files[0] || null;
    $('#ib-pending').innerHTML = I.pending ? `🖼 ${esc(I.pending.name)} <button class="link" id="ib-unpend">batal</button>` : '';
    $('#ib-unpend')?.addEventListener('click', () => { I.pending = null; $('#ib-pending').textContent = ''; $('#ib-img').value = ''; });
  });
  $('#ib-suggest').addEventListener('click', async () => {
    const b = $('#ib-suggest');
    b.disabled = true;
    b.textContent = '✨ Lagi mikir…';
    try {
      const { suggestion } = await api(`/api/inbox/conversations/${c.id}/suggest`, { method: 'POST' });
      text.value = suggestion;
      text.focus();
    } catch (ex) { toast(ex.message); } finally {
      b.disabled = false;
      b.textContent = '✨ Saran balasan';
    }
  });
  $('#ib-assign').addEventListener('change', async (e) => {
    await api(`/api/inbox/conversations/${c.id}`, json('PATCH', { assignee_id: e.target.value === '' ? null : Number(e.target.value) }));
    toast('PIC diperbarui');
    loadList();
  });
  $('#ib-close').addEventListener('click', async () => {
    await api(`/api/inbox/conversations/${c.id}`, json('PATCH', { status: c.status === 'closed' ? 'open' : 'closed' }));
    toast(c.status === 'closed' ? 'Percakapan dibuka lagi' : 'Ditandai selesai');
    if (c.status !== 'closed') { I.current = null; drawEmptyChat(); loadList(); } else openConv(c.id);
  });
  $('#ib-refresh').addEventListener('click', async () => {
    try {
      const r = await api(`/api/inbox/conversations/${c.id}/refresh`, { method: 'POST' });
      toast(r.added ? `${r.added} pesan baru` : 'Sudah yang terbaru');
      openConv(c.id);
    } catch (ex) { toast(ex.message); }
  });
  $('#ib-msgs').addEventListener('click', async (e) => {
    const id = Number(e.target.dataset.retryMsg);
    if (!id) return;
    const m = c.messages.find((x) => x.id === id);
    if (m?.text) { text.value = m.text; send(); }
  });
}

function showTemplates(q) {
  const pop = $('#ib-tpl-pop');
  const list = I.templates.filter((t) => !q || `${t.title} ${t.body}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  pop.innerHTML = list.length ? list.map((t) => `<button data-tpl="${t.id}"><b>${esc(t.title)}</b><span>${esc(t.body.slice(0, 90))}</span></button>`).join('')
    : '<div class="hint">Belum ada template. Bikin di menu Tiket & Template → Template balasan.</div>';
  pop.hidden = false;
  pop.onclick = (e) => {
    const t = I.templates.find((x) => x.id === Number(e.target.closest('[data-tpl]')?.dataset.tpl));
    if (!t) return;
    $('#ib-text').value = t.body.replace(/\{nama\}/g, I.current.customer_name || 'Kak');
    pop.hidden = true;
    $('#ib-text').focus();
    api(`/api/cs/templates/${t.id}`, json('PATCH', { used: true })).catch(() => {});
  };
}

// ---- Panel kanan ----
async function drawSide() {
  const c = I.current;
  const tabs = [['customer', 'Pelanggan'], ['orders', 'Pesanan'], ['templates', 'Template']];
  $('#ib-side').innerHTML = `<div class="tabs small-tabs" id="ib-side-tabs">${tabs.map(([k, l]) => `<button data-side="${k}" class="${k === I.panel ? 'active' : ''}">${l}</button>`).join('')}</div><div id="ib-side-body"></div>`;
  $('#ib-side-tabs').addEventListener('click', (e) => { if (e.target.dataset.side) { I.panel = e.target.dataset.side; drawSide(); } });
  const body = $('#ib-side-body');
  if (I.panel === 'customer') {
    body.innerHTML = `
      <div class="ib-cust">${avatar(c)}<div><b>${esc(c.customer_name || '-')}</b><div class="hint">${esc(PLATFORM[platformOf(c)]?.label || '')} · ID ${esc(c.customer_id || '-')}</div></div></div>
      <label class="label" for="ib-tags">Label</label>
      <input id="ib-tags" value="${esc(c.tags.join(', '))}" placeholder="mis. reseller, komplain, vip">
      <label class="label" for="ib-notes">Catatan internal</label>
      <textarea id="ib-notes" rows="4" placeholder="Cuma kelihatan oleh tim">${esc(c.notes || '')}</textarea>
      <button class="ghost small" id="ib-save-cust">Simpan</button>
      <div class="label">Tindakan</div>
      <div class="btn-col"><button class="ghost" id="ib-ticket">🎫 Buat tiket komplain/retur</button></div>`;
    $('#ib-save-cust').addEventListener('click', async () => {
      I.current = { ...I.current, ...(await api(`/api/inbox/conversations/${c.id}`, json('PATCH', { tags: $('#ib-tags').value.split(',').map((x) => x.trim()).filter(Boolean), notes: $('#ib-notes').value }))) };
      toast('Tersimpan');
      loadList();
    });
    $('#ib-ticket').addEventListener('click', async () => {
      try {
        await api(`/api/inbox/conversations/${c.id}/ticket`, json('POST', {}));
        toast('Tiket dibuat di Tiket & Template');
      } catch (ex) { toast(ex.message); }
    });
  }
  if (I.panel === 'orders') {
    body.innerHTML = '<div class="spinner"></div>';
    const draw = async (refresh) => {
      const r = await api(`/api/inbox/conversations/${c.id}/orders${refresh ? '?refresh=1' : ''}`).catch((ex) => ({ orders: [], error: ex.message }));
      body.innerHTML = `<div class="row-between"><span class="hint">30 hari terakhir</span><button class="link" id="ib-ord-refresh">↻ Ambil dari ${esc(PLATFORM[c.channel?.platform]?.label || 'platform')}</button></div>
        ${r.error ? `<div class="error-inline">${esc(r.error)}</div>` : ''}
        ${r.orders.map((o) => `<div class="ib-order"><div class="row-between"><b>#${esc(o.external_id)}</b><span class="status st-${{ completed: 'done', delivered: 'done', cancelled: 'failed', failed: 'failed', unpaid: 'partial' }[o.status] || 'scheduled'}">${ORDER_LABEL[o.status] || o.status}</span></div>
          <div class="hint">${o.items.map((i) => esc(i.name)).join(', ')}</div><div>${esc(o.total || '')} · ${o.ordered_at ? new Date(o.ordered_at).toLocaleDateString('id-ID') : ''}</div></div>`).join('') || '<p class="hint">Belum ada pesanan dari pembeli ini.</p>'}`;
      $('#ib-ord-refresh').addEventListener('click', () => draw(true));
    };
    draw(false);
  }
  if (I.panel === 'templates') {
    body.innerHTML = I.templates.map((t) => `<button class="ib-tpl-item" data-use-tpl="${t.id}"><b>${esc(t.title)}</b><span>${esc(t.body.slice(0, 120))}</span></button>`).join('')
      || '<p class="hint">Belum ada template. Bikin di Tiket & Template → Template balasan.</p>';
    body.onclick = (e) => {
      const t = I.templates.find((x) => x.id === Number(e.target.closest('[data-use-tpl]')?.dataset.useTpl));
      if (t) { $('#ib-text').value = t.body.replace(/\{nama\}/g, c.customer_name || 'Kak'); $('#ib-text').focus(); }
    };
  }
}

// ======================================================================
// Pengaturan: channel, auto-reply, pengingat pesanan, simulasi
// ======================================================================
const SET_TABS = [['channels', 'Channel'], ['rules', 'Auto-reply'], ['reminders', 'Pengingat pesanan'], ['simulate', 'Simulasi']];

async function drawSettings() {
  I.platforms ??= await api('/api/inbox/platforms');
  $('#ib-body').innerHTML = `<div class="settings">
    <nav class="settings-nav" id="ib-set-nav">${SET_TABS.map(([k, l]) => `<button data-set="${k}" class="${k === I.settingsTab ? 'active' : ''}">${l}</button>`).join('')}</nav>
    <div class="settings-body card" id="ib-set-body"></div></div>`;
  $('#ib-set-nav').addEventListener('click', (e) => { if (e.target.dataset.set) { I.settingsTab = e.target.dataset.set; drawSettings(); } });
  ({ channels: setChannels, rules: setRules, reminders: setReminders, simulate: setSimulate })[I.settingsTab]();
}

async function setChannels() {
  await loadChannels();
  const body = $('#ib-set-body');
  body.innerHTML = `<div class="row-between"><div><h2>Channel tersambung</h2><p class="hint">Tiap toko/akun = 1 channel. Chat baru dicek tiap menit, atau seketika kalau webhook dipasang.</p></div>
      <button class="primary" id="ch-add">+ Tambah channel</button></div>
    <div class="ch-list">${I.channels.map((c) => `<div class="ch-row">
      ${badge(c.platform)}<div class="grow"><b>${esc(c.name)}</b> <span class="hint">${esc(PLATFORM[c.platform]?.label || c.platform)}${c.shop_name ? ` · ${esc(c.shop_name)}` : ''}</span>
        <div class="hint">${c.connected ? `<span class="dot-ok">●</span> ${c.status === 'error' ? 'Error' : 'Aktif'}` : '<span class="dot-bad">●</span> Belum terhubung'}${c.synced_at ? ` · sinkron ${new Date(c.synced_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</div>
        ${c.error ? `<div class="error-inline">${esc(c.error)}</div>` : ''}
        ${c.platform !== 'simulasi' ? `<div class="hint">Webhook: <code class="copy">${location.origin}/api/chat/webhook/${esc(c.webhook_token)}</code></div>` : ''}</div>
      ${I.platforms.platforms.find((p) => p.id === c.platform)?.oauth ? `<button class="${c.connected ? 'ghost' : 'primary'} small" data-ch-connect="${c.id}">${c.connected ? 'Hubungkan ulang' : 'Hubungkan'}</button>` : ''}
      ${c.platform !== 'simulasi' && c.platform !== 'whatsapp' ? `<button class="ghost small" data-ch-sync="${c.id}">Sinkron</button>` : ''}
      <button class="ghost small" data-ch-edit="${c.id}">Kredensial</button>
      <button class="danger small" data-ch-del="${c.id}">Hapus</button></div>`).join('') || '<div class="empty">Belum ada channel.</div>'}</div>`;
  $('#ch-add').addEventListener('click', () => channelForm());
  body.onclick = async (e) => {
    const d = e.target.dataset;
    if (d.chConnect) {
      try { location.href = (await api(`/api/inbox/channels/${d.chConnect}/connect`, { method: 'POST' })).authUrl; } catch (ex) { toast(ex.message); }
    }
    if (d.chSync) {
      e.target.disabled = true;
      const r = await api(`/api/inbox/channels/${d.chSync}/sync`, { method: 'POST' }).catch((ex) => ({ error: ex.message }));
      toast(r.error ? `Gagal: ${r.error}` : `${r.fetched} pesan baru`);
      setChannels();
    }
    if (d.chEdit) channelForm(I.channels.find((c) => c.id === Number(d.chEdit)));
    if (d.chDel && confirm('Hapus channel ini beserta riwayat chatnya di TIM-AI? (Chat di marketplace tidak terhapus)')) {
      await api(`/api/inbox/channels/${d.chDel}`, { method: 'DELETE' });
      setChannels();
    }
  };
}

function channelForm(existing = null) {
  const plats = I.platforms.platforms;
  let p = plats.find((x) => x.id === (existing?.platform || 'simulasi'));
  const render = () => {
    const fill = (s) => s.replaceAll('{{REDIRECT}}', `<code class="copy">${location.origin}/api/inbox/oauth/${p.id}/callback</code>`)
      .replaceAll('{{WEBHOOK}}', existing ? `<code class="copy">${location.origin}/api/chat/webhook/${esc(existing.webhook_token)}</code>` : '<i>(muncul setelah channel disimpan)</i>');
    openModal(`<form id="ch-form"><h3>${existing ? `Kredensial ${esc(existing.name)}` : 'Tambah channel'}</h3>
      ${existing ? '' : `<div class="pf-pick">${plats.map((x) => `<button type="button" class="pf-opt ${x.id === p.id ? 'on' : ''}" data-pf="${x.id}">${badge(x.id)} ${esc(x.label)}</button>`).join('')}</div>`}
      <div class="guide-box"><b>${esc(p.label)}</b><p>${esc(p.guide.intro)}</p>${p.guide.steps.length ? `<ol>${p.guide.steps.map((s) => `<li>${fill(esc(s))}</li>`).join('')}</ol>` : ''}
        ${(p.guide.links || []).map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join(' · ')}</div>
      <label class="label" for="ch-name">Nama channel</label><input id="ch-name" value="${esc(existing?.name || '')}" placeholder="mis. ${p.id === 'shopee' ? 'Zestmag Official Store' : p.id === 'whatsapp' ? 'WA CS Zestmag' : 'Gurah Fit'}">
      ${p.fields.map((f) => `<label class="label" for="ch-${f.key}">${esc(f.label)}</label><input id="ch-${f.key}" name="${f.key}" type="${f.secret ? 'password' : 'text'}" autocomplete="${f.secret ? 'new-password' : 'off'}" value="${esc(existing?.details?.[f.key] || '')}" placeholder="${existing && f.secret ? '(tersimpan, isi untuk mengganti)' : ''}">`).join('')}
      <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">${existing ? 'Simpan' : p.oauth ? 'Simpan & hubungkan' : 'Simpan'}</button></div></form>`);
    $('#modal-box').classList.add('wide');
    document.querySelectorAll('[data-pf]').forEach((b) => b.addEventListener('click', () => { p = plats.find((x) => x.id === b.dataset.pf); render(); }));
    $('#ch-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const credentials = Object.fromEntries(p.fields.map((f) => [f.key, $(`#ch-${f.key}`).value.trim()]).filter(([, v]) => v));
      try {
        const saved = existing
          ? await api(`/api/inbox/channels/${existing.id}`, json('PATCH', { name: $('#ch-name').value, credentials }))
          : await api('/api/inbox/channels', json('POST', { platform: p.id, name: $('#ch-name').value, credentials }));
        closeModal();
        if (!existing && p.oauth) { location.href = (await api(`/api/inbox/channels/${saved.id}/connect`, { method: 'POST' })).authUrl; return; }
        toast('Channel tersimpan');
        I.settingsTab = 'channels';
        drawSettings();
      } catch (ex) { toast(ex.message); }
    });
  };
  render();
}

const DAY = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const KIND = { welcome: 'Sambutan (pesan pertama)', keyword: 'Kata kunci', away: 'Di luar jam kerja' };

async function setRules() {
  const rules = await api('/api/inbox/rules');
  const body = $('#ib-set-body');
  body.innerHTML = `<div class="row-between"><div><h2>Auto-reply</h2><p class="hint">Dikirim otomatis dari TIM-AI. Kalau auto-reply di Seller Center marketplace juga nyala, matikan salah satu supaya pembeli tidak dapat balasan dobel.</p></div>
      <button class="primary" id="rl-add">+ Auto-reply</button></div>
    ${rules.map((r) => `<div class="rule-row"><label class="switch"><input type="checkbox" data-rl-toggle="${r.id}" ${r.active ? 'checked' : ''}><span></span></label>
      <div class="grow"><b>${KIND[r.kind]}${r.name ? ` · ${esc(r.name)}` : ''}</b>
        ${r.kind === 'keyword' ? `<div class="hint">Kata kunci: ${esc(r.keywords)}</div>` : ''}
        ${r.kind === 'away' ? `<div class="hint">Jam kerja: ${(r.hours.days || []).map((d) => DAY[d - 1]).join(', ') || '-'} ${esc(r.hours.start || '')}–${esc(r.hours.end || '')} WIB</div>` : ''}
        <div class="rule-reply">${esc(r.reply)}</div></div>
      <button class="danger small" data-rl-del="${r.id}">Hapus</button></div>`).join('') || '<div class="empty">Belum ada auto-reply.</div>'}`;
  $('#rl-add').addEventListener('click', ruleForm);
  body.onchange = async (e) => {
    if (e.target.dataset.rlToggle) await api(`/api/inbox/rules/${e.target.dataset.rlToggle}`, json('PATCH', { active: e.target.checked }));
  };
  body.onclick = async (e) => {
    if (e.target.dataset.rlDel && confirm('Hapus auto-reply ini?')) { await api(`/api/inbox/rules/${e.target.dataset.rlDel}`, { method: 'DELETE' }); setRules(); }
  };
}

function ruleForm() {
  openModal(`<form id="rl-form"><h3>Auto-reply baru</h3>
    <label class="label" for="rl-kind">Jenis</label><select id="rl-kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
    <div id="rl-kw"><label class="label" for="rl-keywords">Kata kunci (pisahkan koma)</label><input id="rl-keywords" placeholder="ongkir, cod, ready, stok"></div>
    <div id="rl-hours" hidden><div class="label">Jam kerja (WIB)</div><div class="checks">${DAY.map((d, i) => `<label><input type="checkbox" value="${i + 1}" ${i < 6 ? 'checked' : ''}> ${d}</label>`).join('')}</div>
      <div class="form-grid"><div><label class="label" for="rl-start">Mulai</label><input id="rl-start" type="time" value="08:00"></div><div><label class="label" for="rl-end">Selesai</label><input id="rl-end" type="time" value="17:00"></div></div></div>
    <label class="label" for="rl-reply">Balasan ({nama} = nama pembeli)</label><textarea id="rl-reply" rows="4" required placeholder="Halo Kak {nama}! …"></textarea>
    <div class="label">Berlaku untuk channel</div><div class="checks">${I.channels.map((c) => `<label><input type="checkbox" class="rl-ch" value="${c.id}"> ${esc(c.name)}</label>`).join('') || '<span class="hint">Semua</span>'}</div>
    <p class="hint">Tidak dicentang = semua channel.</p>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  const sync = () => { const k = $('#rl-kind').value; $('#rl-kw').hidden = k !== 'keyword'; $('#rl-hours').hidden = k !== 'away'; };
  $('#rl-kind').addEventListener('change', sync);
  $('#rl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/inbox/rules', json('POST', {
        kind: $('#rl-kind').value, keywords: $('#rl-keywords').value, reply: $('#rl-reply').value,
        hours: { days: [...document.querySelectorAll('#rl-hours input[type=checkbox]:checked')].map((x) => Number(x.value)), start: $('#rl-start').value, end: $('#rl-end').value },
        channel_ids: [...document.querySelectorAll('.rl-ch:checked')].map((x) => Number(x.value)),
      }));
      closeModal();
      setRules();
    } catch (ex) { toast(ex.message); }
  });
}

async function setReminders() {
  const rows = await api('/api/inbox/reminders');
  $('#ib-set-body').innerHTML = `<h2>Pengingat pesanan otomatis</h2>
    <p class="hint">Dikirim lewat chat ke pembeli saat status pesanan berubah (dicek tiap 10 menit lewat API pesanan marketplace). Hanya ke pembeli yang sudah pernah chat dengan toko.
      Placeholder: {nama} {order_id} {produk} {total}.</p>
    ${rows.map((r) => `<div class="rem-row"><label class="switch"><input type="checkbox" data-rem="${r.event}" ${r.active ? 'checked' : ''}><span></span></label>
      <div class="grow"><b>${esc(r.label)}</b><textarea rows="2" data-rem-tpl="${r.event}">${esc(r.template)}</textarea></div></div>`).join('')}
    <button class="primary" id="rem-save">Simpan semua</button>`;
  $('#rem-save').addEventListener('click', async () => {
    for (const r of rows) {
      await api(`/api/inbox/reminders/${r.event}`, json('PUT', { active: document.querySelector(`[data-rem="${r.event}"]`).checked, template: document.querySelector(`[data-rem-tpl="${r.event}"]`).value }));
    }
    toast('Pengingat tersimpan');
  });
}

function setSimulate() {
  const sims = I.channels.filter((c) => c.platform === 'simulasi');
  $('#ib-set-body').innerHTML = `<h2>Simulasi</h2><p class="hint">Coba alur inbox, auto-reply, pengingat, dan laporan tanpa akun marketplace.</p>
    ${sims.length ? '' : '<div class="check bad">Belum ada channel Simulasi. Tambah di tab Channel → pilih Simulasi.</div>'}
    <div class="form-grid"><div><label class="label" for="sm-ch">Channel</label><select id="sm-ch">${sims.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div><label class="label" for="sm-cust">Nama pembeli</label><input id="sm-cust" value="pembeli_demo"></div>
      <div class="span-2"><label class="label" for="sm-text">Pesan pembeli</label><input id="sm-text" value="Halo kak, madunya ready? Ongkir ke Bandung berapa?"></div></div>
    <button class="primary" id="sm-send" ${sims.length ? '' : 'disabled'}>Kirim pesan masuk</button>
    <div class="label">Ubah status pesanan (memicu pengingat)</div>
    <div class="form-grid"><div><label class="label" for="sm-order">No. pesanan</label><input id="sm-order" value="SIM-0001"></div>
      <div><label class="label" for="sm-status">Status</label><select id="sm-status">${Object.entries(ORDER_LABEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div>
    <button class="ghost" id="sm-order-btn" ${sims.length ? '' : 'disabled'}>Ubah status</button>`;
  $('#sm-send')?.addEventListener('click', async () => {
    const r = await api('/api/inbox/simulate', json('POST', { channel_id: Number($('#sm-ch').value), customer: $('#sm-cust').value, text: $('#sm-text').value }));
    toast('Pesan masuk. Buka tab Percakapan');
    I.current = { id: r.conversation_id };
  });
  $('#sm-order-btn')?.addEventListener('click', async () => {
    const r = await api('/api/inbox/simulate-order', json('POST', { channel_id: Number($('#sm-ch').value), customer: $('#sm-cust').value, order_id: $('#sm-order').value, status: $('#sm-status').value }));
    toast(r.reminded ? 'Pengingat terkirim ke chat pembeli' : 'Status tersimpan (pengingat tidak aktif / sudah pernah dikirim / pembeli belum pernah chat)');
  });
}

document.addEventListener('click', (e) => {
  const go = e.target.dataset?.ibgo;
  if (go) { I.tab = 'settings'; I.settingsTab = go; draw(); }
});

// Polling ringan: daftar & percakapan terbuka diperbarui tiap 5 detik selama Inbox dibuka.
function startPolling() {
  clearInterval(I.timer);
  I.timer = setInterval(async () => {
    if (!view.classList.contains('active') || I.tab !== 'inbox' || document.hidden) return;
    await loadList().catch(() => {});
    if (I.current?.id) openConv(I.current.id, { quiet: true }).catch(() => {});
  }, 5000);
}

S.viewHooks.inbox = async () => {
  if (!$('#ib-tabs')) shell();
  const qs = new URLSearchParams(location.search);
  if (qs.get('inbox_oauth')) {
    toast(qs.get('msg') || (qs.get('inbox_oauth') === 'ok' ? 'Tersambung' : 'Gagal menghubungkan'));
    history.replaceState(null, '', '/');
    I.tab = 'settings';
    I.settingsTab = 'channels';
  }
  await draw().catch((ex) => toast(ex.message));
  startPolling();
};

// Badge belum dibaca di menu, diperbarui tiap 30 detik di halaman mana pun.
setInterval(() => {
  if (!state.brandId || document.hidden) return;
  api('/api/inbox/summary').then((s) => S.setNavBadge?.('inbox', s.unread)).catch(() => {});
}, 30000);
