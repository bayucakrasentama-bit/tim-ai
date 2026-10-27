// CS AI Closing (Tim CS): agen CS WhatsApp yang menjual sampai closing, ala Komchat AI.
// - Multi agent: tiap agent = 1 nomor WhatsApp, persona sendiri, maks. 5 produk (product knowledge + foto/video/testimoni).
// - Ongkir per ekspedisi & zona (hitung otomatis dari alamat + berat), promo terstruktur (diskon %, potongan, bundling, gratis ongkir).
// - Simulator chat sampai closing → order direkap, total dihitung ulang dari harga/promo/ongkir (koreksi kalau AI salah hitung).
// - Data Order AI + struk (receipt) WhatsApp, follow-up otomatis, broadcast WhatsApp, export CSV, prompt siap pasang di Inbox.
// Pengaturan, order, dan broadcast disimpan per brand di server (store.js), jadi sama di semua laptop.
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const md = (t) => (window.timAi?.md ? window.timAi.md(t) : `<pre class="script">${esc(t)}</pre>`);
const N = (v) => Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0;
const rp = (n) => (n == null || !Number.isFinite(n) ? '–' : `Rp${Math.round(n).toLocaleString('id-ID')}`);
const pct = (v) => (v == null || !Number.isFinite(v) ? '–' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
const brand = () => state.brands.find((b) => b.id === state.brandId);
const copy = (t, msg = 'Disalin') => navigator.clipboard?.writeText(t).then(() => toast(msg)).catch(() => toast('Gagal menyalin'));
// Data bersama per brand ada di server (store.js → kunci "cs.*"). Simulator chat & tanda terkirim broadcast tetap per browser.
const LOCAL_ONLY = /^(sim\.|bc\.sent$)/;
const store = {
  key: (k) => `timai.cs.${state.brandId || 0}.${k}`,
  get(k, d) {
    if (!LOCAL_ONLY.test(k)) return window.timStore.get(`cs.${k}`, d);
    try { return JSON.parse(localStorage.getItem(this.key(k))) ?? d; } catch { return d; }
  },
  set(k, v) {
    if (!LOCAL_ONLY.test(k)) return window.timStore.set(`cs.${k}`, v);
    try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch { /* mode privat */ }
  },
};
const waPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^0/, '62');
const waLink = (phone, text) => `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;
const today = () => new Date().toISOString().slice(0, 10);

// ======================= AI =======================
let route = null;
async function chat(system, prompt, { temperature = 0.6, max_tokens = 1200 } = {}) {
  if (!route) {
    const s = await api('/api/ai/status').catch(() => null);
    if (s?.routed) route = { provider: s.routed.provider, model: s.routed.model };
    else if (s?.enabled) route = { provider: s.provider, model: s.provider === 'gemini' ? s.gemini?.model : s.model };
    else route = { off: true };
  }
  if (route.off) throw new Error('AI belum aktif. Isi API key di Pengaturan → AI & API Keys.');
  const res = await api('/api/ai/chat', json('POST', { provider: route.provider, model: route.model, system, prompt, temperature, max_tokens }));
  return String(res.text || '').trim();
}

// ======================= DATA =======================
const MAX_PRODUCTS = 5;
const PAY = ['COD', 'Transfer bank', 'QRIS', 'E-wallet', 'Virtual account'];
const OSTATUS = { baru: 'Baru', dibayar: 'Dibayar', dikirim: 'Dikirim', selesai: 'Selesai', batal: 'Batal' };
const PROMO_TYPES = { pct: 'Diskon %', nominal: 'Potongan Rp', bundle: 'Bundling (beli banyak)', ongkir: 'Gratis / subsidi ongkir' };
const blankProduct = () => ({ name: '', variant: '', price: '', stock: '', weight: '250', desc: '', image: '', video: '', testi: '' });
const blankAgent = (n = 1) => ({ id: Date.now() + n, agent: n === 1 ? 'Nadia' : `CS ${n}`, number: '', active: true,
  tone: 'ramah, santai, sopan, panggil pelanggan "Kak", emoji secukupnya', lang: 'ikuti bahasa pelanggan (Indonesia, Jawa, Sunda, Inggris)',
  greeting: '', payment: ['COD', 'Transfer bank'], rules: '', products: [blankProduct()] });
const DEFAULT_SHIP = {
  origin: 'Jakarta',
  couriers: [
    { courier: 'JNE', service: 'REG', zone: 'Jabodetabek', match: 'jakarta, bogor, depok, tangerang, bekasi', rate: '9000', eta: '1-2 hari' },
    { courier: 'J&T', service: 'EZ', zone: 'Jabodetabek', match: 'jakarta, bogor, depok, tangerang, bekasi', rate: '8000', eta: '1-2 hari' },
    { courier: 'JNE', service: 'REG', zone: 'Jawa & Bali', match: 'jawa, bandung, semarang, surabaya, yogyakarta, jogja, solo, malang, bali, denpasar, cirebon, purwokerto', rate: '14000', eta: '2-4 hari' },
    { courier: 'J&T', service: 'EZ', zone: 'Luar Jawa', match: '*', rate: '28000', eta: '3-7 hari' },
  ],
};
function agents() {
  let list = store.get('agents', null);
  if (!list) {
    // Pindahkan pengaturan versi pertama (satu agent di agents.js) kalau ada.
    let old = null;
    try { old = JSON.parse(localStorage.getItem(`timai.agents.${state.brandId || 0}.cs.cfg`)); } catch { /* kosong */ }
    list = [old ? { ...blankAgent(), ...old, products: (old.products || []).map((p) => ({ ...blankProduct(), ...p })) } : blankAgent()];
    store.set('agents', list);
  }
  return list;
}
const ship = () => store.get('ship', DEFAULT_SHIP);
const promos = () => store.get('promos', []);
const orders = () => store.get('orders', []);
const cs = { tab: 'agent', agentId: null, busy: false, bc: null };
const current = () => agents().find((a) => a.id === cs.agentId) || agents()[0];
const saveAgent = (a) => store.set('agents', agents().map((x) => (x.id === a.id ? a : x)));

// ======================= ONGKIR & PROMO (deterministik) =======================
const kg = (gram) => Math.max(1, Math.ceil(N(gram) / 1000));
function ongkirOptions(address, weightGram) {
  const addr = String(address || '').toLowerCase();
  const rows = ship().couriers.filter((c) => c.courier && N(c.rate));
  const hit = rows.filter((c) => c.match.split(',').map((m) => m.trim().toLowerCase()).some((m) => m && m !== '*' && addr.includes(m)));
  const use = hit.length ? hit : rows.filter((c) => c.match.trim() === '*');
  return use.map((c) => ({ ...c, cost: N(c.rate) * kg(weightGram) })).sort((a, b) => a.cost - b.cost);
}
const activePromo = (p) => (!p.start || p.start <= today()) && (!p.end || p.end >= today());
// items: [{name, qty, price}] → subtotal, diskon terbaik (tidak ditumpuk), subsidi ongkir.
function pricing(items, shippingCost) {
  const subtotal = items.reduce((s, it) => s + N(it.price) * (N(it.qty) || 1), 0);
  const qtyOf = (name) => items.filter((it) => !name || it.name.toLowerCase().includes(name.toLowerCase())).reduce((s, it) => s + (N(it.qty) || 1), 0);
  let best = { amount: 0, label: '' };
  let shipCut = { amount: 0, label: '' };
  for (const p of promos().filter(activePromo)) {
    if (N(p.min) && subtotal < N(p.min)) continue;
    if (p.type === 'ongkir') {
      const cut = Math.min(shippingCost, N(p.value) || shippingCost);
      if (cut > shipCut.amount) shipCut = { amount: cut, label: p.label || 'Promo ongkir' };
      continue;
    }
    let amount = 0;
    if (p.type === 'pct') amount = (subtotal * N(p.value)) / 100;
    if (p.type === 'nominal') amount = N(p.value);
    if (p.type === 'bundle' && qtyOf(p.product) >= (N(p.qty) || 2)) amount = N(p.value);
    if (amount > best.amount) best = { amount: Math.min(amount, subtotal), label: p.label || PROMO_TYPES[p.type] };
  }
  return { subtotal, discount: best.amount, discountLabel: best.label, shipping: shippingCost, shippingCut: shipCut.amount, shippingLabel: shipCut.label,
    total: subtotal - best.amount + shippingCost - shipCut.amount };
}
function promoText(p) {
  const v = p.type === 'pct' ? `${N(p.value)}%` : rp(N(p.value));
  const what = { pct: `diskon ${v}`, nominal: `potongan ${v}`, bundle: `beli ${N(p.qty) || 2}${p.product ? ` ${p.product}` : ' item'} potongan ${v}`, ongkir: `gratis ongkir${N(p.value) ? ` s/d ${v}` : ''}` }[p.type];
  return `${p.label ? `${p.label}: ` : ''}${what}${N(p.min) ? `, min. belanja ${rp(N(p.min))}` : ''}${p.end ? `, berlaku s/d ${p.end}` : ''}`;
}
// Hitung ulang order dari AI: harga dari knowledge produk, promo, ongkir dari alamat. Koreksi kalau AI salah hitung.
function settle(order, a) {
  const items = (order.items || []).map((it) => {
    const p = a.products.find((x) => x.name && it.name && (x.name.toLowerCase() === it.name.toLowerCase() || it.name.toLowerCase().includes(x.name.toLowerCase())));
    return { name: it.name, variant: it.variant || '', qty: N(it.qty) || 1, price: p ? N(p.price) : N(it.price), weight: p ? N(p.weight) : 250 };
  });
  const weight = items.reduce((s, it) => s + it.weight * it.qty, 0);
  const opts = ongkirOptions(order.address, weight);
  const pick = opts.find((o) => order.courier && `${o.courier} ${o.service}`.toLowerCase().includes(String(order.courier).toLowerCase())) || opts[0];
  const pr = pricing(items, pick ? pick.cost : N(order.shipping));
  return { ...order, items, weight, courier: pick ? `${pick.courier} ${pick.service}` : order.courier || '', eta: pick?.eta || '', ...pr,
    ai_total: N(order.total), corrected: N(order.total) > 0 && Math.abs(N(order.total) - pr.total) >= 1 };
}

// ======================= PROMPT AGENT =======================
function systemPrompt(a = current()) {
  const b = brand();
  const sh = ship();
  const products = a.products.filter((p) => p.name).map((p) => {
    const media = [p.image && `[[foto:${p.image}]]`, p.video && `[[video:${p.video}]]`, p.testi && `[[testimoni:${p.testi}]]`].filter(Boolean).join(' ');
    return `- ${p.name}${p.variant ? ` (varian: ${p.variant})` : ''} — harga ${rp(N(p.price))}${p.stock !== '' && p.stock != null ? `, stok ${p.stock}` : ''}, berat ${N(p.weight) || 250} gram${p.desc ? `. ${p.desc}` : ''}${media ? `\n  Media: ${media}` : ''}`;
  }).join('\n') || '- (belum ada produk — minta pelanggan menunggu admin)';
  const rates = sh.couriers.filter((c) => c.courier).map((c) => `- ${c.courier} ${c.service} · ${c.zone} (${c.match.trim() === '*' ? 'daerah lainnya' : c.match}) · ${rp(N(c.rate))}/kg · ${c.eta}`).join('\n');
  const pr = promos().filter(activePromo);
  return `Kamu "${a.agent}", Customer Service sekaligus sales WhatsApp untuk ${b?.name || 'toko ini'}.${b?.description ? ` Tentang brand: ${b.description}` : ''}
Gaya bicara: ${a.tone}. Bahasa: ${a.lang}. Balasan pendek seperti chat WhatsApp (maks 3-4 kalimat), satu pertanyaan per pesan. Bicara natural seperti CS manusia.
${a.greeting ? `Sapaan pembuka: ${a.greeting}\n` : ''}
PRODUK (hanya jual & jelaskan yang ada di sini, jangan mengarang harga/stok/klaim):
${products}
Kalau pelanggan minta foto, video, atau bukti/testimoni, kirim kode media produk itu persis seperti tertulis (mis. [[foto:...]]) di baris sendiri.

ONGKIR (dikirim dari ${sh.origin}; berat dibulatkan ke atas per kg, minimal 1 kg; ongkir = tarif/kg × kg):
${rates || '- tanya admin'}
PROMO AKTIF (pakai satu diskon terbaik, promo ongkir boleh digabung):
${pr.map((p) => `- ${promoText(p)}`).join('\n') || '- tidak ada promo aktif'}
PEMBAYARAN: ${a.payment.join(', ') || 'tanya admin'}
${a.rules ? `ATURAN TAMBAHAN: ${a.rules}\n` : ''}
ALUR CLOSING:
1. Sapa, gali kebutuhan, rekomendasikan produk yang cocok (sebut promo kalau relevan).
2. Pastikan produk, varian, dan jumlah. Cek stok.
3. Minta nama penerima, nomor HP, dan alamat lengkap (kelurahan, kecamatan, kota, kode pos).
4. Hitung ongkir dari tabel di atas, tawarkan ekspedisi termurah + estimasi.
5. Tawarkan metode pembayaran.
6. Kirim RINGKASAN PESANAN (produk, jumlah, harga, diskon, ongkir, total, alamat, ekspedisi, pembayaran) dan minta pelanggan membalas "setuju".
7. HANYA setelah pelanggan jelas setuju, ucapkan terima kasih lalu di baris paling akhir tambahkan blok berikut (sistem yang membaca, pelanggan tidak):
\`\`\`order
{"customer":"","phone":"","items":[{"name":"","variant":"","qty":1,"price":0}],"courier":"","shipping":0,"total":0,"address":"","payment":""}
\`\`\`
Kalau pelanggan marah, komplain, atau minta refund/retur, minta maaf dan bilang akan diteruskan ke admin manusia.`;
}

// ======================= RENDER =======================
const TABS = [['agent', 'Setting Agent'], ['ship', 'Ongkir & Promo'], ['sim', 'Simulator Chat'], ['orders', 'Data Order AI'], ['followup', 'Follow-up'], ['broadcast', 'Broadcast WA'], ['prompt', 'Pasang di Inbox']];
function render() {
  const root = document.getElementById('view-closer');
  const list = agents();
  if (!list.some((a) => a.id === cs.agentId)) cs.agentId = list[0].id;
  const os = orders();
  const live = os.filter((o) => o.status !== 'batal');
  const omzet = live.reduce((s, o) => s + N(o.total), 0);
  const sessions = store.get('sessions', 0);
  root.innerHTML = `<div class="row-between"><h1>CS AI Closing</h1><div class="btn-row">
      <select data-cs-agent aria-label="Pilih agent">${list.map((a) => `<option value="${a.id}" ${a.id === cs.agentId ? 'selected' : ''}>🤖 ${esc(a.agent)}${a.number ? ` · ${esc(a.number)}` : ''}${a.active ? '' : ' (nonaktif)'}</option>`).join('')}</select>
      <button class="ghost small" data-cs-newagent>+ Agent</button></div></div>
    <p class="hint"><b>Tim CS</b>: CS AI 24/7 yang membalas WhatsApp sampai closing — jawab pertanyaan, kirim foto/video/testimoni produk, hitung ongkir, pakai promo, konfirmasi order, lalu rekap otomatis. 1 nomor WhatsApp = 1 agent, maks. ${MAX_PRODUCTS} produk per agent.</p>
    <div class="kpi-row">${[['Order AI', os.length], ['Omzet order AI', rp(omzet)], ['AOV', rp(live.length ? omzet / live.length : null)], ['Belum dibayar', os.filter((o) => o.status === 'baru').length], ['Closing rate simulasi', sessions ? pct(os.filter((o) => o.source === 'simulator').length / sessions) : '–']]
      .map(([l, v]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div></div>`).join('')}</div>
    <div class="tabs">${TABS.map(([k, l]) => `<button data-cs-tab="${k}" class="${cs.tab === k ? 'active' : ''}">${l}${k === 'orders' && os.length ? ` (${os.length})` : ''}</button>`).join('')}</div>
    <div data-cs-body></div>`;
  ({ agent: tabAgent, ship: tabShip, sim: tabSim, orders: tabOrders, followup: tabFollowup, broadcast: tabBroadcast, prompt: tabPrompt })[cs.tab]($('[data-cs-body]', root));
}

function tabAgent(body) {
  const a = current();
  body.innerHTML = `<form data-cs-cfg>
    <div class="grid-2"><div class="card"><div class="label">Personality CS AI</div>
      <label class="label">Nama agent</label><input name="agent" value="${esc(a.agent)}">
      <label class="label">Nomor WhatsApp agent</label><input name="number" value="${esc(a.number)}" placeholder="mis. 0812xxxx (WA pribadi atau Business)">
      <label class="label">Gaya bicara</label><input name="tone" value="${esc(a.tone)}">
      <label class="label">Bahasa</label><input name="lang" value="${esc(a.lang)}">
      <label class="label">Sapaan pembuka (opsional)</label><textarea name="greeting" rows="2" placeholder="mis. Halo Kak! ${esc(a.agent)} di sini dari ${esc(brand()?.name || '')}…">${esc(a.greeting)}</textarea>
      <label class="toggle"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}> Agent aktif 24/7</label></div>
    <div class="card"><div class="label">Pembayaran & aturan</div>
      <label class="label">Metode pembayaran</label><div class="checks">${PAY.map((p) => `<label><input type="checkbox" name="pay" value="${p}" ${a.payment.includes(p) ? 'checked' : ''}> ${p}</label>`).join('')}</div>
      <label class="label">Aturan tambahan</label><textarea name="rules" rows="4" placeholder="mis. COD hanya Jabodetabek. Pesanan tidak bisa dibatalkan setelah setuju. Resi diinfokan admin.">${esc(a.rules)}</textarea>
      <p class="hint">Ongkir & promo diatur sekali untuk semua agent di tab <b>Ongkir & Promo</b>.</p></div></div>
    <div class="card"><div class="row-between"><div class="label">Product knowledge (${a.products.filter((p) => p.name).length}/${MAX_PRODUCTS})</div><button type="button" class="ghost small" data-cs-addp ${a.products.length >= MAX_PRODUCTS ? 'disabled' : ''}>+ Produk</button></div>
      <div class="cs-plist">${a.products.map((p, i) => `<div class="cs-prod" data-i="${i}">
        <div class="ag-fields">
          <div><label class="label">Nama produk</label><input name="p_name" value="${esc(p.name)}" placeholder="mis. Herbal Jahe"></div>
          <div><label class="label">Varian</label><input name="p_variant" value="${esc(p.variant)}" placeholder="Normal / Free sugar"></div>
          <div><label class="label">Harga (Rp)</label><input name="p_price" value="${esc(p.price)}" placeholder="13500"></div>
          <div><label class="label">Stok</label><input name="p_stock" value="${esc(p.stock)}" placeholder="kosong = tidak dicek"></div>
          <div><label class="label">Berat (gram)</label><input name="p_weight" value="${esc(p.weight)}"></div>
          <div class="ag-wide"><label class="label">Deskripsi, manfaat, FAQ</label><textarea name="p_desc" rows="2">${esc(p.desc)}</textarea></div>
          <div><label class="label">URL foto produk</label><input name="p_image" value="${esc(p.image)}" placeholder="https://…jpg"></div>
          <div><label class="label">URL video produk</label><input name="p_video" value="${esc(p.video)}" placeholder="https://…mp4"></div>
          <div><label class="label">URL gambar testimoni</label><input name="p_testi" value="${esc(p.testi)}" placeholder="https://…jpg"></div>
        </div><div class="btn-row"><button type="button" class="link" data-cs-delp="${i}">Hapus produk</button></div></div>`).join('')}</div></div>
    <div class="btn-row">${agents().length > 1 ? '<button type="button" class="ghost" data-cs-delagent>Hapus agent</button>' : ''}<button type="button" class="ghost" data-cs-tab="sim">Uji di simulator →</button><button class="primary">Simpan agent</button></div></form>`;
}
function readAgent(form) {
  const f = new FormData(form);
  const col = (k) => f.getAll(k).map(String);
  return {
    ...current(), agent: f.get('agent') || 'CS', number: f.get('number'), tone: f.get('tone'), lang: f.get('lang'), greeting: f.get('greeting'),
    rules: f.get('rules'), active: f.get('active') === 'on', payment: col('pay'),
    products: col('p_name').map((name, i) => ({ name, variant: col('p_variant')[i], price: col('p_price')[i], stock: col('p_stock')[i], weight: col('p_weight')[i],
      desc: col('p_desc')[i], image: col('p_image')[i], video: col('p_video')[i], testi: col('p_testi')[i] })),
  };
}

function tabShip(body) {
  const sh = ship();
  const pr = promos();
  const q = cs.quote || { address: '', weight: '500', subtotal: '' };
  const opts = q.address ? ongkirOptions(q.address, q.weight) : [];
  body.innerHTML = `<div class="grid-2"><div class="card"><form data-cs-ship>
      <div class="row-between"><div class="label">Tarif ongkir per ekspedisi</div><button type="button" class="ghost small" data-cs-addc>+ Tarif</button></div>
      <label class="label">Kota asal pengiriman</label><input name="origin" value="${esc(sh.origin)}">
      <div class="table-wrap"><table class="data cs-products"><thead><tr><th>Ekspedisi</th><th>Layanan</th><th>Zona</th><th>Kata kunci alamat (* = lainnya)</th><th>Rp/kg</th><th>Estimasi</th><th></th></tr></thead><tbody>
      ${sh.couriers.map((c, i) => `<tr><td><input name="c_courier" value="${esc(c.courier)}"></td><td><input name="c_service" value="${esc(c.service)}"></td><td><input name="c_zone" value="${esc(c.zone)}"></td>
        <td><input name="c_match" value="${esc(c.match)}"></td><td><input name="c_rate" value="${esc(c.rate)}"></td><td><input name="c_eta" value="${esc(c.eta)}"></td><td><button type="button" class="link" data-cs-delc="${i}">Hapus</button></td></tr>`).join('')}
      </tbody></table></div><div class="btn-row"><button class="primary">Simpan tarif</button></div></form></div>
    <div class="card"><div class="label">Cek ongkir</div>
      <form class="ag-fields" data-cs-quote><div class="ag-wide"><label class="label">Alamat tujuan</label><input name="address" value="${esc(q.address)}" placeholder="mis. Cipayung, Cikarang Timur, Bekasi"></div>
      <div><label class="label">Berat (gram)</label><input name="weight" value="${esc(q.weight)}"></div><div><label class="label">Subtotal belanja (Rp)</label><input name="subtotal" value="${esc(q.subtotal)}" placeholder="untuk cek promo"></div></form>
      <div class="btn-row"><button class="ghost" data-cs-doquote>Hitung</button></div>
      ${q.address ? (opts.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Ekspedisi</th><th>Zona</th><th>Ongkir</th><th>Setelah promo</th><th>Estimasi</th></tr></thead><tbody>${opts.map((o) => { const p = pricing([{ name: '', qty: 1, price: N(q.subtotal) }], o.cost); return `<tr><td><b>${esc(o.courier)} ${esc(o.service)}</b></td><td>${esc(o.zone)}</td><td>${rp(o.cost)}</td><td>${rp(o.cost - p.shippingCut)}${p.shippingLabel ? `<div class="hint">${esc(p.shippingLabel)}</div>` : ''}</td><td>${esc(o.eta)}</td></tr>`; }).join('')}</tbody></table></div><p class="hint">${kg(q.weight)} kg (dibulatkan ke atas).</p>` : '<div class="check bad">Tidak ada tarif yang cocok. Tambah baris dengan kata kunci <b>*</b> untuk daerah lainnya.</div>') : ''}</div></div>
    <div class="card"><div class="row-between"><div class="label">Promo (diskon, bundling, gratis ongkir)</div><button class="ghost small" data-cs-addpromo>+ Promo</button></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Promo</th><th>Aturan</th><th>Periode</th><th>Status</th><th></th></tr></thead><tbody>
      ${pr.map((p, i) => `<tr><td><b>${esc(p.label || PROMO_TYPES[p.type])}</b><div class="hint">${PROMO_TYPES[p.type]}</div></td><td>${esc(promoText({ ...p, label: '' }))}</td><td class="hint">${esc(p.start || '…')} – ${esc(p.end || '…')}</td>
        <td>${activePromo(p) ? '<span class="tag v-ok">Aktif</span>' : '<span class="tag v-ghost">Tidak aktif</span>'}</td><td><button class="link" data-cs-delpromo="${i}">Hapus</button></td></tr>`).join('') || '<tr><td colspan="5" class="hint">Belum ada promo. CS AI akan menawarkan promo aktif dan menghitungnya otomatis di total order.</td></tr>'}
      </tbody></table></div><p class="hint">Diskon tidak ditumpuk: dipakai satu diskon terbesar yang memenuhi syarat. Promo ongkir boleh digabung dengan diskon.</p></div>`;
}
function promoModal() {
  openModal(`<form id="cs-pform"><h3>+ Promo</h3>
    <label class="label">Jenis</label><select name="type">${Object.entries(PROMO_TYPES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
    <label class="label">Nama promo</label><input name="label" placeholder="mis. Promo Gajian">
    <label class="label">Nilai (persen untuk Diskon %, rupiah untuk lainnya; kosongkan = gratis ongkir penuh)</label><input name="value" placeholder="mis. 10 atau 15000">
    <div class="ag-fields"><div><label class="label">Min. belanja (Rp)</label><input name="min" placeholder="opsional"></div>
    <div><label class="label">Bundling: min. jumlah</label><input name="qty" placeholder="mis. 3"></div>
    <div><label class="label">Bundling: produk</label><input name="product" placeholder="kosong = semua produk"></div>
    <div><label class="label">Mulai</label><input type="date" name="start"></div><div><label class="label">Sampai</label><input type="date" name="end"></div></div>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan promo</button></div></form>`);
  $('#cs-pform').onsubmit = (e) => {
    e.preventDefault();
    store.set('promos', [...promos(), Object.fromEntries(new FormData(e.target))]);
    closeModal();
    render();
  };
}

// Kode media [[foto:url]] / [[video:url]] / [[testimoni:url]] → tampil seperti kiriman WhatsApp.
function media(text) {
  const safe = (u) => (/^https?:\/\//i.test(u) ? esc(u) : '');
  return md(text).replace(/\[\[(foto|video|testimoni):([^\]\s]+)\]\]/g, (_m, kind, url) => {
    const u = safe(url.replace(/&amp;/g, '&'));
    if (!u) return '';
    return kind === 'video' ? `<video class="cs-media" src="${u}" controls preload="metadata"></video>`
      : `<figure class="cs-media-wrap"><img class="cs-media" src="${u}" alt="${kind}" loading="lazy">${kind === 'testimoni' ? '<figcaption class="hint">Testimoni pelanggan</figcaption>' : ''}</figure>`;
  });
}
const simLog = () => store.get(`sim.${cs.agentId}`, []);
function tabSim(body) {
  const a = current();
  const log = simLog();
  const ready = a.products.some((p) => p.name);
  body.innerHTML = `<div class="card cs-sim"><div class="row-between"><div><b>${esc(a.agent)}</b> <span class="hint">· simulasi chat WhatsApp${a.number ? ` ke ${esc(a.number)}` : ''}</span></div>
      <div class="btn-row"><button class="ghost small" data-cs-reset>Chat baru</button></div></div>
    ${ready ? '' : '<div class="check bad">Isi minimal 1 produk di <b>Setting Agent</b> dulu supaya CS AI punya bahan jualan.</div>'}
    <div class="chat cs-chat">${log.map((m) => `<div class="msg ${m.role}">${m.role === 'assistant' ? media(m.content) : esc(m.content)}${m.order ? `<div class="tag v-ok">✓ Order ${esc(m.order)} tersimpan ke Data Order AI</div>` : ''}</div>`).join('') || '<div class="hint">Mulai sebagai pelanggan, mis. "halo kak, ada foto produknya?"</div>'}
    ${cs.busy ? `<div class="msg assistant"><span class="spinner inline"></span> ${esc(a.agent)} sedang mengetik…</div>` : ''}</div>
    <form class="chat-form" data-cs-send><textarea rows="2" placeholder="Ketik sebagai pelanggan… (Enter kirim, Shift+Enter baris baru)" ${cs.busy ? 'disabled' : ''}></textarea><button class="primary" ${cs.busy ? 'disabled' : ''}>Kirim</button></form></div>`;
  const ch = $('.cs-chat', body);
  ch.scrollTop = ch.scrollHeight;
  $('textarea', body)?.focus();
}
const invNo = (o) => `INV-${String(o.at).slice(2, 10).replace(/-/g, '')}-${String(o.id).slice(-4)}`;
async function send(text) {
  const a = current();
  const key = `sim.${a.id}`;
  const log = store.get(key, []);
  if (!log.length) store.set('sessions', store.get('sessions', 0) + 1);
  log.push({ role: 'user', content: text });
  store.set(key, log);
  cs.busy = true;
  render();
  try {
    const convo = log.map((m) => `${m.role === 'user' ? 'PELANGGAN' : 'CS'}: ${m.content}`).join('\n');
    let reply = await chat(systemPrompt(a), `Percakapan WhatsApp sejauh ini:\n${convo}\n\nTulis balasan CS berikutnya saja (tanpa awalan "CS:").`);
    let raw = null;
    const m = /```order\s*([\s\S]*?)```/.exec(reply);
    if (m) {
      try { raw = JSON.parse(m[1]); } catch { raw = null; }
      reply = reply.replace(m[0], '').trim();
    }
    const entry = { role: 'assistant', content: reply.replace(/^CS:\s*/i, '') };
    if (raw) {
      const o = { id: Date.now(), at: new Date().toISOString(), status: 'baru', source: 'simulator', agent: a.agent, ...settle(raw, a) };
      window.timStore.push('cs.orders', o);
      entry.order = invNo(o);
      toast(o.corrected ? `Closing! Total dikoreksi ke ${rp(o.total)} (AI: ${rp(o.ai_total)})` : 'Closing! Order masuk ke Data Order AI');
    }
    log.push(entry);
  } catch (ex) {
    log.push({ role: 'assistant', content: `⚠️ ${ex.message}` });
  }
  store.set(key, log);
  cs.busy = false;
  if (document.getElementById('view-closer').classList.contains('active')) render();
}

const itemsText = (o) => (o.items || []).map((it) => `${it.name}${it.variant ? ` (${it.variant})` : ''} ×${it.qty || 1}`).join(', ');
function receipt(o) {
  const line = '------------------------------';
  return [`🧾 *STRUK PESANAN — ${brand()?.name || 'Toko'}*`, `No: ${invNo(o)}`, `Tanggal: ${new Date(o.at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`,
    `Pelanggan: ${o.customer || '-'}${o.phone ? ` (${o.phone})` : ''}`, line,
    ...(o.items || []).map((it) => `${it.name}${it.variant ? ` (${it.variant})` : ''} x${it.qty || 1} = ${rp(N(it.price) * (N(it.qty) || 1))}`), line,
    `Subtotal: ${rp(N(o.subtotal ?? o.total))}`,
    ...(N(o.discount) ? [`Diskon${o.discountLabel ? ` (${o.discountLabel})` : ''}: -${rp(N(o.discount))}`] : []),
    `Ongkir${o.courier ? ` (${o.courier}${o.eta ? `, ${o.eta}` : ''})` : ''}: ${rp(N(o.shipping))}`,
    ...(N(o.shippingCut) ? [`Promo ongkir${o.shippingLabel ? ` (${o.shippingLabel})` : ''}: -${rp(N(o.shippingCut))}`] : []),
    `*TOTAL: ${rp(N(o.total))}*`, `Pembayaran: ${o.payment || '-'}`, `Alamat: ${o.address || '-'}`, line,
    o.payment === 'COD' ? 'Siapkan uang pas saat kurir datang ya Kak. Resi kami kirim setelah paket diserahkan ke kurir. 🙏' : 'Mohon kirim bukti pembayaran di chat ini ya Kak. Terima kasih 🙏'].join('\n');
}
function tabOrders(body) {
  const os = orders();
  body.innerHTML = `<div class="card"><div class="row-between"><div class="label">Data Order (AI)</div>
    <div class="btn-row"><button class="ghost small" data-cs-addo>+ Order manual</button><button class="ghost small" data-cs-csv ${os.length ? '' : 'disabled'}>Export CSV</button></div></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Pelanggan</th><th>Produk</th><th>Total</th><th>Kirim & bayar</th><th>Status</th><th></th></tr></thead><tbody>
    ${os.map((o) => `<tr><td><b>${esc(invNo(o))}</b><div class="hint">${esc(new Date(o.at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }))} · ${esc(o.agent || o.source)}</div></td>
      <td><b>${esc(o.customer || '–')}</b><div class="hint">${esc(o.phone || '')}</div></td><td>${esc(itemsText(o))}</td>
      <td>${rp(N(o.total))}${N(o.discount) ? `<div class="hint">diskon ${rp(N(o.discount))}</div>` : ''}${o.corrected ? `<div class="tag v-warn" title="Total dari AI ${rp(o.ai_total)}">dikoreksi sistem</div>` : ''}</td>
      <td>${esc(o.courier || '–')} · ${rp(N(o.shipping) - N(o.shippingCut))}<div class="hint">${esc(o.payment || '')} · ${esc(o.address || '')}</div></td>
      <td><select data-cs-ost="${o.id}">${Object.entries(OSTATUS).map(([k, l]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td class="nowrap"><button class="link" data-cs-receipt="${o.id}">Struk</button> · <button class="link" data-cs-fu="${o.id}">Follow-up</button> · <button class="link" data-cs-delo="${o.id}">Hapus</button></td></tr>`).join('') || '<tr><td colspan="7" class="hint">Belum ada order. Uji simulator sampai pelanggan bilang "setuju" — order tersimpan otomatis dan totalnya dihitung ulang sistem.</td></tr>'}
    </tbody></table></div><p class="hint">Tersimpan di server untuk brand ini, sama di semua laptop. Export CSV untuk diimpor ke aggregator ekspedisi / spreadsheet.</p></div>`;
}
function receiptModal(o) {
  const text = receipt(o);
  openModal(`<div><h3>🧾 Struk ${esc(invNo(o))}</h3><pre class="fo-wa">${esc(text)}</pre>
    <div class="modal-actions"><button class="ghost" data-close>Tutup</button><button class="ghost" id="cs-rcopy">Salin</button>
    ${o.phone ? `<a class="btn primary-link" target="_blank" rel="noopener" href="${waLink(o.phone, text)}">Kirim ke WhatsApp ${esc(o.phone)}</a>` : ''}</div></div>`);
  $('#cs-rcopy').onclick = () => copy(text, 'Struk disalin');
}
function exportCsv() {
  const rows = [['no_order', 'waktu', 'agent', 'pelanggan', 'hp', 'produk', 'subtotal', 'diskon', 'ekspedisi', 'ongkir', 'total', 'pembayaran', 'alamat', 'status']]
    .concat(orders().map((o) => [invNo(o), o.at, o.agent, o.customer, o.phone, itemsText(o), N(o.subtotal), N(o.discount), o.courier, N(o.shipping) - N(o.shippingCut), N(o.total), o.payment, o.address, OSTATUS[o.status]]));
  download(`order-ai-${slug()}-${today()}.csv`, rows);
}
const slug = () => (brand()?.name || 'brand').toLowerCase().replace(/\W+/g, '-');
function download(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function addOrderModal() {
  const a = current();
  openModal(`<form id="cs-oform"><h3>+ Order manual</h3>
    <input name="customer" placeholder="Nama pelanggan" required><input name="phone" placeholder="No. HP">
    <select name="item">${a.products.filter((p) => p.name).map((p) => `<option>${esc(p.name)}</option>`).join('')}</select><input name="qty" placeholder="Jumlah" value="1">
    <select name="payment">${PAY.map((p) => `<option>${p}</option>`).join('')}</select>
    <textarea name="address" rows="2" placeholder="Alamat lengkap (untuk hitung ongkir)" required></textarea>
    <p class="hint">Harga, promo, dan ongkir dihitung otomatis dari pengaturan.</p>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  $('#cs-oform').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const o = { id: Date.now(), at: new Date().toISOString(), status: 'baru', source: 'manual', agent: 'manual',
      ...settle({ customer: f.customer, phone: f.phone, items: [{ name: f.item, qty: N(f.qty) || 1 }], payment: f.payment, address: f.address }, a) };
    window.timStore.push('cs.orders', o).then(render);
    closeModal();
    render();
  };
}

const FU_STAGES = [['checkout', 'Tanya-tanya tapi belum checkout'], ['unpaid', 'Sudah order, belum bayar'], ['shipped', 'Paket dikirim (info resi)'], ['delivered', 'Paket sampai → minta testimoni & repeat order'], ['dormant', 'Pelanggan lama tidak belanja 30+ hari']];
function tabFollowup(body, order = null) {
  const unpaid = orders().filter((o) => o.status === 'baru' && o.payment !== 'COD');
  body.innerHTML = `${unpaid.length ? `<div class="check bad"><b>${unpaid.length} order belum dibayar</b> (non-COD): ${unpaid.slice(0, 5).map((o) => `<button class="link" data-cs-fu="${o.id}">${esc(o.customer || invNo(o))}</button>`).join(', ')}</div>` : ''}
    <div class="card"><div class="label">Follow-up otomatis</div>
    <p class="hint">Urutan pesan follow-up sesuai persona ${esc(current().agent)}. Pakai sebagai template / pengingat di Inbox, atau kirim lewat Broadcast WA.</p>
    <form class="ag-fields" data-cs-fuform>
      <div><label class="label">Tahap pelanggan</label><select name="stage">${FU_STAGES.map(([k, l]) => `<option value="${k}" ${order && k === 'unpaid' ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="label">Jumlah pesan berurutan</label><select name="n"><option>3</option><option>2</option><option>4</option></select></div>
      <div class="ag-wide"><label class="label">Konteks (opsional)</label><textarea name="ctx" rows="2">${order ? esc(`Pelanggan ${order.customer || ''}, order ${invNo(order)}: ${itemsText(order)}, total ${rp(N(order.total))}, bayar ${order.payment || ''}.`) : ''}</textarea></div>
    </form><div class="btn-row">${order?.phone ? `<span class="hint">Kirim ke ${esc(order.phone)} setelah pesan jadi</span>` : ''}<button class="primary" data-cs-fugo>Buat pesan follow-up</button></div><div data-cs-fuout></div></div>`;
  body.dataset.phone = order?.phone || '';
}
async function followupRun(body) {
  const f = Object.fromEntries(new FormData($('[data-cs-fuform]', body)));
  const out = $('[data-cs-fuout]', body);
  out.innerHTML = '<div class="spinner"></div>';
  try {
    const stage = FU_STAGES.find(([k]) => k === f.stage)[1];
    const text = await chat(systemPrompt(), `Buat ${f.n} pesan follow-up WhatsApp berurutan untuk tahap: "${stage}". ${f.ctx ? `Konteks: ${f.ctx}.` : ''}
Untuk tiap pesan tulis: ## Pesan N — kirim kapan (mis. +1 jam, +1 hari), lalu isi pesannya dalam blok kode supaya mudah disalin. Pakai {nama} untuk nama pelanggan. Sopan, tidak memaksa; sebut promo hanya kalau memang ada promo aktif.`, { temperature: 0.7, max_tokens: 1500 });
    const msgs = [...text.matchAll(/```[a-z]*\n?([\s\S]*?)```/g)].map((m) => m[1].trim());
    const phone = body.dataset.phone;
    out.innerHTML = `<div class="md">${md(text)}</div><div class="btn-row"><button class="ghost small" data-cs-fucopy>Salin semua</button>
      ${phone && msgs[0] ? `<a class="btn small" target="_blank" rel="noopener" href="${waLink(phone, msgs[0].replace(/\{nama\}/g, ''))}">Kirim pesan 1 ke ${esc(phone)}</a>` : ''}
      ${msgs.length ? '<button class="ghost small" data-cs-tobc>Pakai di Broadcast WA →</button>' : ''}</div>`;
    out.dataset.text = text;
    cs.lastFu = msgs[0] || '';
  } catch (ex) { out.innerHTML = `<div class="check bad">⚠️ ${esc(ex.message)}</div>`; }
}

// Broadcast WhatsApp: penerima dari Data Order (atau tempel daftar), pesan dengan {nama}/{produk}, kirim satu per satu atau export ke gateway.
function recipients(f) {
  const map = new Map();
  for (const o of orders()) {
    if (!o.phone) continue;
    if (f.status && o.status !== f.status) continue;
    if (f.product && !itemsText(o).toLowerCase().includes(f.product.toLowerCase())) continue;
    if (!map.has(waPhone(o.phone))) map.set(waPhone(o.phone), { name: o.customer || '', phone: o.phone, product: (o.items || [])[0]?.name || '' });
  }
  for (const l of String(f.extra || '').split('\n').map((x) => x.trim()).filter(Boolean)) {
    const [a, b] = l.split(/[,;\t]/).map((x) => x.trim());
    const phone = /\d{8,}/.test(a?.replace(/\D/g, '')) && !b ? a : b;
    const name = phone === a ? '' : a;
    if (phone && !map.has(waPhone(phone))) map.set(waPhone(phone), { name, phone, product: '' });
  }
  return [...map.values()];
}
const fill = (msg, r) => msg.replace(/\{nama\}/g, r.name || 'Kak').replace(/\{produk\}/g, r.product || 'produk kami');
function tabBroadcast(body) {
  const f = cs.bc || store.get('bc', { status: '', product: '', extra: '', msg: 'Halo {nama}! Ada promo spesial minggu ini untuk {produk}. Mau dibantu pesan lagi? 😊', goal: '' });
  cs.bc = f;
  const list = recipients(f);
  const sent = new Set(store.get('bc.sent', []));
  body.innerHTML = `<div class="grid-2"><div class="card"><div class="label">Pesan broadcast</div>
      <form data-cs-bcform>
      <label class="label">Tujuan broadcast (untuk ditulis AI)</label><input name="goal" value="${esc(f.goal)}" placeholder="mis. umumkan promo gajian, ajak repeat order">
      <div class="btn-row"><button type="button" class="ghost small" data-cs-bcai>✨ Tulis pakai AI</button></div>
      <label class="label">Isi pesan — {nama} & {produk} diganti otomatis</label><textarea name="msg" rows="6">${esc(f.msg)}</textarea>
      <div class="label">Penerima</div>
      <div class="ag-fields"><div><label class="label">Dari Data Order, status</label><select name="status"><option value="">Semua status</option>${Object.entries(OSTATUS).map(([k, l]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="label">Pernah beli produk</label><input name="product" value="${esc(f.product)}" placeholder="kosong = semua"></div>
      <div class="ag-wide"><label class="label">Tambah nomor lain (satu per baris: nama, nomor)</label><textarea name="extra" rows="3" placeholder="Budi, 081234567890">${esc(f.extra)}</textarea></div></div>
      </form></div>
    <div class="card"><div class="row-between"><div class="label">${list.length} penerima · ${list.filter((r) => sent.has(waPhone(r.phone))).length} terkirim</div>
      <div class="btn-row"><button class="ghost small" data-cs-bccsv ${list.length ? '' : 'disabled'}>Export CSV (gateway)</button><button class="ghost small" data-cs-bcreset>Reset tanda terkirim</button></div></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Penerima</th><th>Pratinjau</th><th></th></tr></thead><tbody>
      ${list.map((r) => `<tr><td><b>${esc(r.name || '–')}</b><div class="hint">${esc(r.phone)}</div></td><td class="hint">${esc(fill(f.msg, r).slice(0, 90))}…</td>
        <td>${sent.has(waPhone(r.phone)) ? '<span class="tag v-ok">✓</span>' : `<a class="btn small" target="_blank" rel="noopener" data-cs-bcsend="${esc(waPhone(r.phone))}" href="${waLink(r.phone, fill(f.msg, r))}">Kirim</a>`}</td></tr>`).join('') || '<tr><td colspan="3" class="hint">Belum ada penerima. Order yang punya nomor HP otomatis masuk di sini.</td></tr>'}
      </tbody></table></div>
      <p class="hint">Tombol Kirim membuka WhatsApp dengan pesan terisi, satu per satu. Untuk broadcast massal tanpa klik, export CSV lalu unggah ke gateway WhatsApp (Fonnte, Wablas, dsb.) yang tersambung di Integrasi Cepat. Kirim hanya ke pelanggan yang sudah pernah chat/beli supaya nomor tidak diblokir.</p></div></div>`;
}
function readBc(root) {
  const form = $('[data-cs-bcform]', root);
  if (form) { cs.bc = Object.fromEntries(new FormData(form)); store.set('bc', cs.bc); }
  return cs.bc;
}
async function broadcastAi(root) {
  const f = readBc(root);
  const ta = $('[data-cs-bcform] [name=msg]', root);
  ta.value = '✨ menulis…';
  try {
    const text = await chat(systemPrompt(), `Tulis SATU pesan broadcast WhatsApp untuk pelanggan lama. Tujuan: ${f.goal || 'ajak repeat order'}. Maks 400 karakter, hangat, tidak spam, ada ajakan jelas. Pakai {nama} untuk nama pelanggan dan {produk} untuk produk yang pernah dibeli. Tulis isi pesannya saja.`, { temperature: 0.8, max_tokens: 400 });
    ta.value = text.replace(/^```[a-z]*\n?|```$/g, '').trim();
  } catch (ex) { ta.value = f.msg; toast(ex.message); }
  readBc(root);
  render();
}

function tabPrompt(body) {
  body.innerHTML = `<div class="card"><div class="label">System prompt CS AI — ${esc(current().agent)}</div>
    <p class="hint">Salin ke <b>Inbox → Pengaturan → aturan balas otomatis (AI)</b> untuk nomor ${esc(current().number || 'WhatsApp agent ini')}, atau ke bot/gateway WhatsApp kamu. Blok <code>order</code> di akhir balasan bisa dibaca sistem untuk merekap pesanan. Ikut berubah setiap pengaturan disimpan.</p>
    <textarea rows="18" readonly class="mono">${esc(systemPrompt())}</textarea>
    <div class="btn-row"><button class="ghost" data-cs-tab="agent">Ubah setting</button><button class="primary" data-cs-copysys>Salin prompt</button></div></div>`;
}

// ======================= EVENT =======================
const root = document.getElementById('view-closer');
root.addEventListener('click', (e) => {
  const btn = e.target.closest('button, a[data-cs-bcsend]');
  if (!btn) return;
  const d = btn.dataset;
  const body = $('[data-cs-body]', root);
  if (d.csTab) { if (cs.tab === 'broadcast') readBc(root); cs.tab = d.csTab; render(); }
  if (d.csNewagent !== undefined) { const a = blankAgent(agents().length + 1); store.set('agents', [...agents(), a]); cs.agentId = a.id; cs.tab = 'agent'; render(); }
  if (d.csDelagent !== undefined && confirm(`Hapus agent ${current().agent}?`)) { store.set('agents', agents().filter((a) => a.id !== cs.agentId)); cs.agentId = null; render(); }
  if (d.csAddp !== undefined || d.csDelp !== undefined) {
    const a = readAgent($('[data-cs-cfg]', root));
    if (d.csAddp !== undefined) a.products.push(blankProduct());
    else a.products.splice(Number(d.csDelp), 1);
    if (!a.products.length) a.products.push(blankProduct());
    saveAgent(a);
    render();
  }
  if (d.csAddc !== undefined || d.csDelc !== undefined) {
    const sh = readShip($('[data-cs-ship]', root));
    if (d.csAddc !== undefined) sh.couriers.push({ courier: '', service: '', zone: '', match: '', rate: '', eta: '' });
    else sh.couriers.splice(Number(d.csDelc), 1);
    store.set('ship', sh);
    render();
  }
  if (d.csDoquote !== undefined) { cs.quote = Object.fromEntries(new FormData($('[data-cs-quote]', root))); render(); }
  if (d.csAddpromo !== undefined) promoModal();
  if (d.csDelpromo) { const p = promos(); p.splice(Number(d.csDelpromo), 1); store.set('promos', p); render(); }
  if (d.csReset !== undefined) { store.set(`sim.${cs.agentId}`, []); render(); }
  if (d.csCsv !== undefined) exportCsv();
  if (d.csAddo !== undefined) addOrderModal();
  if (d.csDelo) { window.timStore.remove('cs.orders', d.csDelo); render(); }
  if (d.csReceipt) receiptModal(orders().find((o) => String(o.id) === d.csReceipt));
  if (d.csFu) { const o = orders().find((x) => String(x.id) === d.csFu); cs.tab = 'followup'; render(); tabFollowup($('[data-cs-body]', root), o); }
  if (d.csFugo !== undefined) followupRun(body);
  if (d.csFucopy !== undefined) copy($('[data-cs-fuout]', root).dataset.text || '');
  if (d.csTobc !== undefined) { cs.bc = { ...(cs.bc || store.get('bc', {})), msg: cs.lastFu }; store.set('bc', cs.bc); cs.tab = 'broadcast'; render(); }
  if (d.csBcai !== undefined) broadcastAi(root);
  if (d.csBccsv !== undefined) { const f = readBc(root); download(`broadcast-${slug()}-${today()}.csv`, [['nama', 'nomor', 'pesan'], ...recipients(f).map((r) => [r.name, waPhone(r.phone), fill(f.msg, r)])]); }
  if (d.csBcreset !== undefined) { store.set('bc.sent', []); render(); }
  if (d.csBcsend) { store.set('bc.sent', [...new Set([...store.get('bc.sent', []), d.csBcsend])]); setTimeout(render, 300); }
  if (d.csCopysys !== undefined) copy(systemPrompt(), 'Prompt CS AI disalin');
});
function readShip(form) {
  const f = new FormData(form);
  const col = (k) => f.getAll(k).map(String);
  return { origin: f.get('origin') || '', couriers: col('c_courier').map((courier, i) => ({ courier, service: col('c_service')[i], zone: col('c_zone')[i], match: col('c_match')[i], rate: col('c_rate')[i], eta: col('c_eta')[i] })) };
}
root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-cs-agent]')) { cs.agentId = Number(t.value); render(); }
  if (t.dataset.csOst) window.timStore.patch('cs.orders', t.dataset.csOst, { status: t.value });
  if (t.closest('[data-cs-bcform]') && t.name !== 'goal') { readBc(root); render(); }
});
root.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.matches('[data-cs-cfg]')) {
    const a = readAgent(form);
    a.products = a.products.filter((p) => p.name.trim()).slice(0, MAX_PRODUCTS);
    if (!a.products.length) a.products.push(blankProduct());
    saveAgent(a);
    toast(`Agent ${a.agent} tersimpan`);
    render();
  }
  if (form.matches('[data-cs-ship]')) { const sh = readShip(form); sh.couriers = sh.couriers.filter((c) => c.courier.trim()); store.set('ship', sh); toast('Tarif ongkir tersimpan'); render(); }
  if (form.matches('[data-cs-quote]')) $('[data-cs-doquote]', root).click();
  if (form.matches('[data-cs-send]')) {
    const t = $('textarea', form).value.trim();
    if (t && !cs.busy) send(t);
  }
});
root.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && e.target.closest('[data-cs-send]')) { e.preventDefault(); e.target.closest('form').requestSubmit(); }
});

S.viewHooks.closer = window.timStore.withStore(render);
// Dipakai Kantor AI (agents.js): ringkasan order & nama agent untuk Laporan Pagi dan Struktur Tim.
window.timCs = { orders, agents, systemPrompt, pricing, ongkirOptions };
