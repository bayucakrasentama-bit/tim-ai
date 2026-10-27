// Hari Ini (beranda Mode Fokus): satu daftar tindakan untuk hari ini, diambil dari Planner, jadwal posting, Inbox,
// tiket CS, order CS AI, dan vonis iklan 7 hari terakhir. Ceklis "selesai" disimpan per brand per tanggal (store.js),
// jadi sama di semua laptop. Setiap item punya tombol yang langsung membuka halaman tempat mengerjakannya.
const S = window.siarin;
const { api, esc, state } = S;
const $ = (sel, el = document) => el.querySelector(sel);
const rp = (n) => (n == null || !Number.isFinite(n) ? '–' : `Rp${Math.round(n).toLocaleString('id-ID')}`);
const x2 = (v) => (v == null || !Number.isFinite(v) ? '–' : `${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })}x`);
const wib = () => new Date(Date.now() + 7 * 3600e3);
const today = () => wib().toISOString().slice(0, 10);
const dayStartUtc = () => new Date(`${today()}T00:00:00+07:00`);
const view = document.getElementById('view-today');
const T = { data: null, loading: false, at: 0, brand: null };

const doneKey = () => `today.done.${today()}`;
const done = () => new Set(window.timStore.get(doneKey(), []));

async function collect() {
  const start = dayStartUtc();
  const end = new Date(start.getTime() + 86400e3);
  const safe = (p, d) => p.catch(() => d);
  const [content, posts, inbox, tickets, adv, founder] = await Promise.all([
    safe(api('/api/content'), []),
    safe(api(`/api/posts?from=${encodeURIComponent(new Date(start.getTime() - 2 * 86400e3).toISOString())}&to=${encodeURIComponent(end.toISOString())}`), []),
    safe(api('/api/inbox/summary'), null),
    safe(api('/api/cs/tickets?open=1'), []),
    safe(api(`/api/reports/team/adv?from=${encodeURIComponent(new Date(Date.now() - 7 * 86400e3).toISOString())}`), null),
    safe(api('/api/founder/settings'), null),
  ]);
  return { content, posts, inbox, tickets, adv, founder, start, end };
}

// Item: { key, area, title, meta, go, label, tone }
function build(d) {
  const items = [];
  const endIso = d.end.toISOString();
  const name = (c) => c.title || 'Tanpa judul';
  // ---- Konten ----
  for (const c of d.content) {
    if (c.planned_at && c.planned_at < endIso && !['terjadwal', 'tayang'].includes(c.status)) {
      const late = c.planned_at < d.start.toISOString();
      items.push({ key: `content:${c.id}:due`, area: 'Konten', tone: late ? 'bad' : 'warn', title: `${late ? 'Terlambat' : 'Tayang hari ini'}: ${name(c)}`,
        meta: `Status ${c.status} · rencana ${new Date(c.planned_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`, go: 'planner', label: 'Buka Planner' });
    }
  }
  const review = d.content.filter((c) => c.status === 'review');
  if (review.length) items.push({ key: `content:review:${review.map((c) => c.id).join('-')}`, area: 'Konten', tone: 'warn', title: `${review.length} konten menunggu review`, meta: review.slice(0, 3).map(name).join(' · '), go: 'planner', label: 'Review' });
  const ready = d.content.filter((c) => c.status === 'siap');
  if (ready.length) items.push({ key: `content:siap:${ready.map((c) => c.id).join('-')}`, area: 'Konten', tone: 'info', title: `${ready.length} konten siap, belum dijadwalkan`, meta: ready.slice(0, 3).map(name).join(' · '), go: 'calendar', label: 'Jadwalkan' });
  const failed = d.posts.filter((p) => ['failed', 'partial'].includes(p.status));
  if (failed.length) items.push({ key: `posts:failed:${failed.map((p) => p.id).join('-')}`, area: 'Konten', tone: 'bad', title: `${failed.length} posting gagal (2 hari terakhir)`, meta: 'Coba kirim ulang atau posting manual', go: 'history', label: 'Lihat riwayat' });
  const sched = d.posts.filter((p) => p.status === 'scheduled' && p.scheduled_at >= d.start.toISOString() && p.scheduled_at < endIso);
  if (sched.length) items.push({ key: `posts:today:${sched.length}`, area: 'Konten', tone: 'info', title: `${sched.length} posting terjadwal hari ini`, meta: sched.slice(0, 3).map((p) => new Date(p.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })).join(' · '), go: 'calendar', label: 'Kalender', info: true });
  // ---- CS ----
  if (d.inbox?.unreplied) items.push({ key: `inbox:unreplied:${today()}`, area: 'CS', tone: 'bad', title: `${d.inbox.unreplied} chat belum dibalas`, meta: `${d.inbox.unread} belum dibaca · ${d.inbox.open} percakapan terbuka`, go: 'inbox', label: 'Buka Inbox' });
  const lateTickets = d.tickets.filter((t) => t.due_at && t.due_at < new Date().toISOString());
  if (lateTickets.length) items.push({ key: `tickets:late:${lateTickets.map((t) => t.id).join('-')}`, area: 'CS', tone: 'bad', title: `${lateTickets.length} tiket komplain lewat SLA`, meta: lateTickets.slice(0, 3).map((t) => t.customer).join(' · '), go: 'cs', label: 'Tiket' });
  else if (d.tickets.length) items.push({ key: `tickets:open:${d.tickets.length}`, area: 'CS', tone: 'info', title: `${d.tickets.length} tiket masih terbuka`, meta: 'Belum lewat SLA', go: 'cs', label: 'Tiket' });
  const orders = window.timCs?.orders() || [];
  const unpaid = orders.filter((o) => o.status === 'baru' && o.payment !== 'COD');
  if (unpaid.length) items.push({ key: `orders:unpaid:${unpaid.map((o) => o.id).join('-')}`, area: 'CS', tone: 'warn', title: `${unpaid.length} order CS AI belum dibayar`, meta: `Total ${rp(unpaid.reduce((s, o) => s + Number(o.total || 0), 0))} · kirim pengingat pembayaran`, go: 'closer', label: 'Follow-up' });
  const toShip = orders.filter((o) => o.status === 'dibayar' || (o.status === 'baru' && o.payment === 'COD'));
  if (toShip.length) items.push({ key: `orders:ship:${toShip.map((o) => o.id).join('-')}`, area: 'CS', tone: 'warn', title: `${toShip.length} order siap dikirim`, meta: toShip.slice(0, 3).map((o) => o.customer || 'pelanggan').join(' · '), go: 'closer', label: 'Data Order' });
  // ---- Iklan ----
  const camps = d.adv?.campaigns || [];
  if (!d.adv?.accounts?.length) items.push({ key: 'ads:connect', area: 'Iklan', tone: 'info', title: 'Belum ada akun iklan tersambung', meta: 'Sambungkan atau impor CSV supaya Hari Ini bisa memberi vonis iklan', go: 'adv', label: 'Hubungkan' });
  else if (window.timAgents?.verdict) {
    const t = window.timStore.get('agents.calc.target', { roas: 2.5, cpa: '' });
    const target = { roas: Number(String(t.roas).replace(',', '.')) || null, cpa: Number(String(t.cpa).replace(/\D/g, '')) || null };
    for (const c of camps) {
      const [v, why] = window.timAgents.verdict({ name: c.key, spend: c.spend || 0, conv: c.conversions || 0, revenue: c.revenue || 0, ctr: c.ctr ? c.ctr * 100 : 0, freq: 0 }, target);
      if (v === 'KILL' || v === 'SCALE') items.push({ key: `ads:${v}:${c.key}:${today()}`, area: 'Iklan', tone: v === 'KILL' ? 'bad' : 'ok', title: `${v === 'KILL' ? 'Matikan' : 'Naikkan budget'}: ${c.key}`, meta: `${why} · spend 7 hari ${rp(c.spend)} · ROAS ${x2(c.roas)}`, go: 'adv', label: 'Buka Iklan' });
    }
  }
  if (d.founder && !d.founder.enabled) items.push({ key: 'founder:brief', area: 'Iklan', tone: 'info', title: 'Laporan pagi otomatis belum aktif', meta: 'Ringkasan semua tim terkirim ke WhatsApp/Telegram tiap pagi', go: 'founder', label: 'Atur', tab: 'brief' });
  return items;
}

const AREAS = [['Konten', '✍️'], ['CS', '💬'], ['Iklan', '📣']];
function render() {
  if (!T.data) {
    view.innerHTML = '<div class="spinner"></div>';
    if (!T.loading) load();
    return;
  }
  const items = build(T.data);
  const dn = done();
  const todo = items.filter((i) => !i.info);
  const finished = todo.filter((i) => dn.has(i.key)).length;
  const date = wib().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const pctDone = todo.length ? Math.round((finished / todo.length) * 100) : 100;
  view.innerHTML = `<div class="row-between"><div><h1>Hari Ini</h1><div class="hint">${esc(date)} · ${esc(state.brands.find((b) => b.id === state.brandId)?.name || '')}</div></div>
      <div class="btn-row"><span class="hint">Diperbarui ${new Date(T.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span><button class="ghost small" data-td-refresh>Muat ulang</button></div></div>
    <div class="card td-progress"><div class="row-between"><b>${todo.length ? `${finished} dari ${todo.length} tindakan selesai` : 'Tidak ada yang mendesak hari ini 🎉'}</b><span class="hint">${pctDone}%</span></div><div class="pbar"><span style="width:${pctDone}%"></span></div></div>
    <div class="td-grid">${AREAS.map(([area, icon]) => {
      const list = items.filter((i) => i.area === area);
      return `<div class="card td-col"><div class="td-head">${icon} <b>${area}</b> <span class="hint">${list.filter((i) => !i.info && !dn.has(i.key)).length} perlu tindakan</span></div>
        ${list.map((i) => `<div class="td-item ${dn.has(i.key) ? 'is-done' : ''} tone-${i.tone}">
          ${i.info ? '<span class="td-dot"></span>' : `<input type="checkbox" data-td-done="${esc(i.key)}" ${dn.has(i.key) ? 'checked' : ''} aria-label="Tandai selesai">`}
          <div class="td-body"><div class="td-title">${esc(i.title)}</div><div class="hint">${esc(i.meta || '')}</div></div>
          <button class="ghost small" data-td-go="${esc(i.go)}" ${i.tab ? `data-td-tab="${esc(i.tab)}"` : ''}>${esc(i.label)} →</button></div>`).join('') || '<p class="hint td-empty">Aman, tidak ada yang perlu dikerjakan.</p>'}</div>`;
    }).join('')}</div>`;
}
async function load() {
  T.loading = true;
  const brandId = state.brandId;
  try { T.data = await collect(); T.at = Date.now(); T.brand = brandId; } finally { T.loading = false; }
  if (view.classList.contains('active')) render();
}

view.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tdRefresh !== undefined) { T.data = null; render(); }
  if (b.dataset.tdGo) {
    if (b.dataset.tdTab && b.dataset.tdGo === 'founder') { S.show('founder'); setTimeout(() => document.querySelector(`#view-founder [data-fo-tab="${b.dataset.tdTab}"]`)?.click(), 50); }
    else S.show(b.dataset.tdGo);
  }
});
view.addEventListener('change', (e) => {
  const k = e.target.dataset.tdDone;
  if (!k) return;
  const dn = done();
  e.target.checked ? dn.add(k) : dn.delete(k);
  window.timStore.set(doneKey(), [...dn]);
  render();
});

// Data dimuat ulang setiap kali halaman dibuka (paling cepat tiap 60 detik), ceklis dari store.js.
S.viewHooks.today = window.timStore.withStore(() => {
  if (T.data && (Date.now() - T.at > 60_000 || T.brand !== state.brandId)) T.data = null;
  render();
});
