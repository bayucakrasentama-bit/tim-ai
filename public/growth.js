// Tab tambahan Tim MP & Tim ADV:
// - Kalkulator BEP ROAS: profit per pesanan setelah semua potongan marketplace → ROAS minimal biar tidak rugi + zona aman,
//   dibandingkan dengan ROAS aktual dari data iklan brand.
// - Kesehatan Toko / ROAS Gabungan: porsi omzet organik (target ≥ 40%), stok produk andalan, dan ROAS gabungan
//   (semua omzet marketplace ÷ semua biaya iklan) untuk iklan Meta/Google yang mengarah ke marketplace.
// - Bank Strategi: strategi marketing yang terbukti (rangkuman diskusi seller & marketer), bisa dijadikan kartu Planner.
const S = window.siarin;
const { api, esc, toast, state } = S;
const $ = (sel, root = document) => root.querySelector(sel);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const rp = (n) => (n == null || !Number.isFinite(n) ? '–' : `Rp${Math.round(n).toLocaleString('id-ID')}`);
const x2 = (v) => (v == null || !Number.isFinite(v) ? '–' : `${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })}x`);
const pct = (v) => (v == null || !Number.isFinite(v) ? '–' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
const N = (v) => Number(v) || 0;
const brandName = () => state.brands.find((b) => b.id === state.brandId)?.name || '';

// ======================= KALKULATOR BEP ROAS =======================
const MARKETS = ['Shopee', 'TikTok Shop / Tokopedia', 'Lazada', 'Website / WhatsApp', 'Lainnya'];
const FIELDS = [
  ['hpp', 'HPP / modal per produk (Rp)', '6300', 'Harga pokok: bahan + kemasan + produksi untuk 1 pesanan.'],
  ['price', 'Harga jual (Rp)', '34900', 'Harga yang dibayar pembeli (setelah diskon toko).'],
  ['admin_pct', 'Biaya admin / komisi marketplace (%)', '10.45', 'Lihat Seller Center → Biaya Layanan sesuai kategori & jenis toko.'],
  ['program_pct', 'Biaya program promo (%)', '4.5', 'Mis. Promo XTRA / Cashback XTRA. Kosongkan kalau tidak ikut.'],
  ['shipping_pct', 'Biaya program gratis ongkir (%)', '5.5', 'Mis. Gratis Ongkir XTRA. Kosongkan kalau tidak ikut.'],
  ['affiliate_pct', 'Komisi affiliate (%)', '7', 'Komisi rata-rata untuk kreator affiliate.'],
  ['tax_pct', 'Pajak dipotong marketplace (%)', '0.5', 'PPh 22 yang dipotong marketplace (biasanya 0,5%).'],
  ['process_fee', 'Biaya proses per pesanan (Rp)', '1250', 'Biaya tetap per pesanan.'],
  ['other_cost', 'Biaya lain per pesanan (Rp)', '0', 'Packing, bonus/freebies, dll.'],
  ['target_margin_pct', 'Target untung bersih (%)', '20', 'Untung bersih yang dianggap aman setelah iklan.'],
];

export function bep(p) {
  const price = N(p.price);
  const feesPct = N(p.admin_pct) + N(p.program_pct) + N(p.shipping_pct) + N(p.affiliate_pct) + N(p.tax_pct);
  const fees = (price * feesPct) / 100 + N(p.process_fee) + N(p.other_cost);
  const profit = price - N(p.hpp) - fees; // untung per pesanan sebelum iklan
  const roasAt = (m) => (profit - m * price > 0 ? price / (profit - m * price) : Infinity);
  const target = (N(p.target_margin_pct) || 20) / 100;
  return { price, fees, feesPct, profit, margin: price ? profit / price : null, bep: roasAt(0), thin: roasAt(Math.min(0.1, target / 2)), safe: roasAt(target), target };
}
function zone(r, b) {
  if (r == null || !Number.isFinite(r)) return ['nodata', 'Belum ada data'];
  if (r < b.bep) return ['bad', 'Rugi'];
  if (r < b.thin) return ['warn', 'Untung tipis'];
  if (r < b.safe) return ['ok', 'Aman'];
  return ['great', 'Prospektif (siap scale)'];
}
const verdict = (r, b, label) => {
  const [tone, name] = zone(r, b);
  if (tone === 'nodata') return `<span class="hint">${label}: belum ada data iklan 30 hari.</span>`;
  return `<span class="zone-pill ${tone}">${label} ${x2(r)} · ${name}</span>`;
};

function bar(b) {
  if (!Number.isFinite(b.bep)) return '';
  const max = Math.max(b.safe * 1.4, b.bep * 2, 4);
  const w = (v) => `${Math.min(100, (Math.min(v, max) / max) * 100)}%`;
  return `<div class="bep-bar"><span class="bad" style="width:${w(b.bep)}"></span><span class="warn" style="width:calc(${w(b.thin)} - ${w(b.bep)})"></span><span class="ok" style="width:calc(${w(b.safe)} - ${w(b.thin)})"></span><span class="great" style="flex:1"></span></div>
    <div class="bep-legend"><span>Rugi &lt; ${x2(b.bep)}</span><span>Tipis ${x2(b.bep)}–${x2(b.thin)}</span><span>Aman ${x2(b.thin)}–${x2(b.safe)}</span><span>Prospektif ≥ ${x2(b.safe)}</span></div>`;
}

async function profitTab(team, body) {
  const r = await api('/api/growth/products?days=30');
  let products = r.products;
  const actual = team === 'mp' ? r.actual.mp : r.actual.adv;
  const draw = (editId = null) => {
    const edit = products.find((p) => p.id === editId) || null;
    body.innerHTML = `<div class="check small-note">Hitung <b>ROAS minimal supaya iklan tidak rugi</b> untuk tiap produk ${esc(brandName())}, setelah semua potongan marketplace. ROAS aktual ${team === 'mp' ? 'iklan marketplace' : 'iklan Meta/Google'} brand ini 30 hari terakhir: <b>${x2(actual.roas)}</b> (spend ${rp(actual.spend)}).${team === 'adv' ? ' Kalau iklannya mengarah ke Shopee/Tokopedia, penjualannya tidak tercatat di Meta: lihat tab <b>ROAS Gabungan</b>.' : ''}</div>
    <div class="grid-2">
      <form class="card" id="bep-form"><div class="label">${edit ? `Edit: ${esc(edit.name)}` : '+ Produk baru'}</div>
        <div class="form-grid">
          <div><label class="label">Nama produk *</label><input name="name" required value="${esc(edit?.name || '')}" placeholder="mis. Madu Zestmag 250ml"></div>
          <div><label class="label">Jual di</label><select name="marketplace">${MARKETS.map((m) => `<option ${m === edit?.marketplace ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
          ${FIELDS.map(([k, l, ph, tip]) => `<div><label class="label" title="${esc(tip)}">${l}</label><input name="${k}" inputmode="decimal" value="${edit?.[k] ?? ''}" placeholder="contoh ${ph}"><div class="hint">${tip}</div></div>`).join('')}
        </div>
        <div class="bep-live" id="bep-live"></div>
        <div class="btn-row left"><button class="primary">${edit ? 'Simpan perubahan' : 'Simpan produk'}</button>${edit ? '<button type="button" class="ghost" data-bep-cancel>Batal</button>' : ''}</div>
        <p class="hint">Persentase biaya tiap marketplace sering berubah. Selalu cocokkan dengan menu biaya di Seller Center masing-masing.</p></form>
      <div class="card"><div class="label">Produk tersimpan</div>
        ${products.length ? products.map((p) => { const b = bep(p); return `<div class="bep-item">
          <div class="row-between"><b>${esc(p.name)}</b><span class="hint">${esc(p.marketplace || '')}</span></div>
          ${b.profit <= 0 ? `<div class="error-inline">Rugi ${rp(-b.profit)} per pesanan bahkan sebelum iklan. Naikkan harga, turunkan HPP, atau kurangi program promo.</div>`
            : `<div class="hint">Untung sebelum iklan ${rp(b.profit)}/pesanan (${pct(b.margin)}) · potongan marketplace ${rp(b.fees)}</div>
              <div class="bep-big">ROAS minimal: <b>${x2(b.bep)}</b> · aman mulai <b>${x2(b.safe)}</b></div>${bar(b)}<div>${verdict(actual.roas, b, 'ROAS aktual')}</div>`}
          <div class="btn-row left"><button class="ghost small" data-bep-edit="${p.id}">Edit</button><button class="asset-del static" data-bep-del="${p.id}" aria-label="Hapus">✕</button></div></div>`; }).join('')
          : '<p class="hint">Belum ada produk. Isi form di samping. Hasilnya langsung terlihat sambil kamu mengetik.</p>'}
      </div></div>`;
    const form = $('#bep-form', body);
    const live = () => {
      const v = Object.fromEntries(new FormData(form));
      const b = bep(v);
      $('#bep-live', body).innerHTML = !N(v.price) ? '' : b.profit <= 0
        ? `<div class="error-inline">Dengan angka ini rugi ${rp(-b.profit)} per pesanan sebelum iklan.</div>`
        : `<div class="bep-big">Untung sebelum iklan <b>${rp(b.profit)}</b> · ROAS minimal <b>${x2(b.bep)}</b> · aman ≥ <b>${x2(b.safe)}</b></div>${bar(b)}`;
    };
    form.oninput = live;
    live();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form));
      const next = edit ? products.map((p) => (p.id === edit.id ? { ...p, ...v } : p)) : [...products, v];
      try { products = await api('/api/growth/products', json('PUT', next)); toast('Produk tersimpan'); draw(); } catch (ex) { toast(ex.message); }
    };
    body.onclick = async (e) => {
      const d = e.target.dataset;
      if (d.bepEdit) draw(d.bepEdit);
      if (d.bepCancel !== undefined) draw();
      if (d.bepDel && confirm('Hapus produk ini dari kalkulator?')) {
        products = await api('/api/growth/products', json('PUT', products.filter((p) => p.id !== d.bepDel)));
        draw();
      }
    };
  };
  draw();
}

// ======================= KESEHATAN TOKO & ROAS GABUNGAN =======================
const SRC = [['ads', 'Dari iklan marketplace'], ['live', 'Dari live'], ['video', 'Dari video'], ['affiliate', 'Dari affiliate'], ['other', 'Organik lain (pencarian, toko)']];
const thisMonth = () => new Date().toISOString().slice(0, 7);
const totalOf = (h) => SRC.reduce((a, [k]) => a + N(h[k]), 0);

async function healthTab(team, body) {
  const r = await api('/api/growth/health');
  let heroes = r.heroes;
  const rows = [...r.health].sort((a, b) => b.month.localeCompare(a.month) || a.shop.localeCompare(b.shop));
  const shops = [...new Set(rows.map((h) => h.shop))];
  const organic = (h) => (totalOf(h) ? (totalOf(h) - N(h.ads)) / totalOf(h) : null);
  body.innerHTML = `
    <div class="check small-note"><b>ROAS gabungan</b> = semua omzet toko marketplace ÷ semua biaya iklan brand (Meta/Google di Tim ADV + iklan marketplace di Tim MP). Ini angka yang lebih jujur kalau iklan Meta/Google mengarahkan pembeli ke Shopee/Tokopedia, karena penjualannya tidak tercatat di Meta.</div>
    <div class="card"><div class="label">ROAS gabungan per bulan · ${esc(brandName())}</div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Bulan</th><th>Omzet marketplace</th><th>Iklan Meta/Google</th><th>Iklan marketplace</th><th>ROAS gabungan</th><th>ROAS versi Meta</th></tr></thead><tbody>
      ${r.blended.map((m) => `<tr><td>${m.month}</td><td>${rp(m.omzet)}</td><td>${rp(m.spend_adv)}</td><td>${rp(m.spend_mp)}</td><td><b>${x2(m.blended_roas)}</b></td><td class="hint">${x2(m.spend ? m.meta_reported / m.spend : null)}</td></tr>`).join('') || '<tr><td colspan="6" class="hint">Isi omzet toko bulanan di bawah dulu, nanti ROAS gabungannya muncul otomatis.</td></tr>'}
      </tbody></table></div></div>
    <div class="grid-2">
      <form class="card" id="hl-form"><div class="label">Omzet toko per bulan</div>
        <p class="hint">Angkanya ada di Seller Center (mis. Shopee: Data Bisnis → saluran penjualan). Toko yang omzet <b>organiknya</b> (live, video, affiliate, pencarian) di bawah <b>40%</b> biasanya paling terpukul saat algoritma marketplace berubah, dan ROAS iklannya ikut turun.</p>
        <div class="form-grid">
          <div><label class="label">Bulan</label><input type="month" name="month" value="${thisMonth()}" required></div>
          <div><label class="label">Nama toko *</label><input name="shop" list="hl-shops" required placeholder="mis. Zestmag Official Shopee"><datalist id="hl-shops">${shops.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
          ${SRC.map(([k, l]) => `<div><label class="label">${l} (Rp)</label><input name="${k}" inputmode="decimal" placeholder="0"></div>`).join('')}
        </div><button class="primary">Simpan</button></form>
      <div class="card"><div class="label">Porsi organik (target ≥ 40%)</div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Bulan</th><th>Toko</th><th>Omzet</th><th>Organik</th><th></th></tr></thead><tbody>
        ${rows.map((h) => { const o = organic(h); return `<tr><td>${h.month}</td><td>${esc(h.shop)}</td><td>${rp(totalOf(h))}</td><td><span class="zone-pill ${o == null ? 'nodata' : o < 0.4 ? 'bad' : o < 0.5 ? 'warn' : 'ok'}">${pct(o)}</span></td><td><button class="asset-del static" data-hl-del="${esc(h.month)}|${esc(h.shop)}" aria-label="Hapus">✕</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="hint">Belum ada data.</td></tr>'}
        </tbody></table></div>
        ${rows.some((h) => (organic(h) ?? 1) < 0.4) ? '<p class="error-inline">Ada toko dengan organik di bawah 40%. Tambah jadwal live, video pendek harian, dan ajak affiliate (lihat Bank Strategi).</p>' : ''}
      </div></div>
    <div class="card"><div class="label">Stok produk andalan (hero)</div>
      <p class="hint">Omzet sering turun karena produk andalan kehabisan stok, bukan karena iklannya. Isi stok & rata-rata terjual per hari, lalu cek sisa harinya.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Produk</th><th>Toko</th><th>Stok</th><th>Terjual/hari</th><th>Sisa</th><th></th></tr></thead><tbody id="hero-rows"></tbody></table></div>
      <form id="hero-form" class="btn-row left"><input name="name" placeholder="Nama produk" required><input name="shop" placeholder="Toko"><input name="stock" inputmode="numeric" placeholder="Stok"><input name="daily_sales" inputmode="decimal" placeholder="Terjual/hari"><button class="ghost">+ Tambah</button></form></div>`;
  const drawHeroes = () => {
    $('#hero-rows', body).innerHTML = heroes.map((h) => {
      const days = N(h.daily_sales) ? N(h.stock) / N(h.daily_sales) : null;
      return `<tr><td>${esc(h.name)}</td><td>${esc(h.shop || '')}</td><td>${h.stock ?? '–'}</td><td>${h.daily_sales ?? '–'}</td><td><span class="zone-pill ${days == null ? 'nodata' : days < 7 ? 'bad' : days < 14 ? 'warn' : 'ok'}">${days == null ? '–' : `${Math.floor(days)} hari`}</span></td><td><button class="asset-del static" data-hero-del="${h.id}" aria-label="Hapus">✕</button></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="hint">Belum ada produk andalan.</td></tr>';
  };
  drawHeroes();
  $('#hl-form', body).onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/growth/health', json('PUT', Object.fromEntries(new FormData(e.target)))); toast('Tersimpan'); healthTab(team, body); } catch (ex) { toast(ex.message); }
  };
  $('#hero-form', body).onsubmit = async (e) => {
    e.preventDefault();
    try { heroes = await api('/api/growth/heroes', json('PUT', [...heroes, Object.fromEntries(new FormData(e.target))])); e.target.reset(); drawHeroes(); } catch (ex) { toast(ex.message); }
  };
  body.onclick = async (e) => {
    const d = e.target.dataset;
    if (d.hlDel && confirm('Hapus data bulan ini untuk toko tersebut?')) {
      const [month, shop] = d.hlDel.split('|');
      await api(`/api/growth/health?month=${encodeURIComponent(month)}&shop=${encodeURIComponent(shop)}`, { method: 'DELETE' });
      healthTab(team, body);
    }
    if (d.heroDel) { heroes = await api('/api/growth/heroes', json('PUT', heroes.filter((h) => h.id !== d.heroDel))); drawHeroes(); }
  };
}

// ======================= BANK STRATEGI =======================
// Dirangkum dari diskusi ratusan seller & marketer Indonesia (Threads, Okt 2026). Tiap kartu: tim, kenapa berhasil, langkah.
const TEAMS = { konten: 'Konten', medsos: 'Medsos', adv: 'ADV', mp: 'MP', kol: 'KOL', affiliate: 'Affiliate', cs: 'CS', digital: 'Digital' };
const STRATEGIES = [
  ['Konten evergreen + UGC', ['konten', 'medsos'], 'Konten yang relevan sepanjang tahun terus ditonton, dan video asli dari pembeli terasa lebih jujur daripada iklan.', ['Daftar 10 pertanyaan pembeli yang selalu muncul', 'Jawab tiap pertanyaan jadi 1 video evergreen', 'Minta 5 pembeli kirim video pemakaian (beri bonus kecil)', 'Selang-seling evergreen & UGC tiap minggu']],
  ['Pajang testimoni di semua titik', ['konten', 'mp', 'cs'], 'Pembeli Indonesia sangat dipengaruhi pendapat orang lain, jadi bukti sosial mempercepat keputusan beli.', ['Kumpulkan screenshot ulasan & chat puas (minta izin)', 'Pasang di slide foto produk, highlight IG, dan balasan CS', 'Buat 1 konten testimoni per minggu']],
  ['Like & balas story pelanggan', ['cs'], 'Pelanggan yang merasa diperhatikan brand cenderung belanja lagi, dan ini murah sekali.', ['Simpan kontak pembeli di WA bisnis', 'Tiap hari luangkan 10 menit like/balas story pelanggan', 'Catat pelanggan yang kembali order setelah disapa']],
  ['Simpan kontak dengan nama brand', ['cs'], 'Di aplikasi cek nama kontak, pelanggan melihat nama brand kamu. Itu jadi pengingat gratis.', ['Format: [Nama Pelanggan] [BRAND]', 'Terapkan ke semua CS', 'Ajak pelanggan simpan nomor CS dengan nama brand']],
  ['Tiru pola iklan kompetitor yang paling awet', ['adv'], 'Iklan yang tayang berbulan-bulan hampir pasti menguntungkan, karena tidak ada brand yang mau bakar uang lama-lama.', ['Buka Meta Ad Library, cari kompetitor', 'Urutkan iklan yang aktif paling lama', 'Catat hook, format, dan penawarannya', 'Buat 3 variasi versi brand kamu lalu uji di Kanban Testing']],
  ['Video affiliate berisi produk toko sendiri', ['affiliate', 'mp'], 'Video di akun affiliate yang FYP mendatangkan trafik besar langsung ke keranjang toko sendiri.', ['Buat akun affiliate terpisah (cek aturan marketplace terbaru)', 'Rutin unggah video dengan keranjang produk toko sendiri', 'Ulangi format video yang FYP']],
  ['Jasa clipper untuk awareness', ['kol'], 'Banyak akun kecil (10–300rb followers) yang memotong konten sering lebih murah per view daripada KOL besar atau iklan.', ['Siapkan 1 video panjang/podcast berisi pesan brand', 'Bayar beberapa clipper per view atau per video', 'Lacak link-nya di Tim KOL']],
  ['Freebies kecil di tiap paket', ['mp', 'cs'], 'Hadiah kecil yang tak terduga membuat pembeli mengunggah unboxing secara gratis.', ['Pilih bonus murah yang relevan (sampel, stiker, kartu ucapan)', 'Sisipkan kartu ajakan tag akun brand', 'Repost unggahan pembeli']],
  ['Bundling produk', ['mp'], 'Paket bundling menaikkan nilai pesanan & profit per pesanan, jadi ROAS minimal iklan turun.', ['Pasangkan produk andalan dengan produk pelengkap', 'Hitung di Kalkulator BEP ROAS', 'Pasang sebagai paket di toko & iklan']],
  ['Panduan gratis yang berisi produk', ['digital', 'konten'], 'Ebook/panduan gratis menarik ribuan orang, dan contoh di dalamnya memakai produk kamu.', ['Pilih masalah yang dicari target pembeli', 'Buat panduan 10–20 halaman, sisipkan produk sebagai solusi', 'Bagikan lewat landing page (LP Builder) untuk kumpulkan kontak']],
  ['Retargeting bertahap', ['adv'], 'Bangun penonton murah dulu dengan iklan views, lalu targetkan iklan penjualan ke orang yang sama.', ['Fase 1: iklan video views/awareness', 'Fase 2: buat audiens penonton 50%+', 'Fase 3: iklan traffic/penjualan ke audiens itu']],
  ['Rayakan momen pelanggan', ['medsos', 'cs'], 'Ikut merayakan ulang tahun/wisuda pelanggan membuat mereka senang dan menjangkau teman-temannya.', ['Tanyakan tanggal spesial saat pembelian', 'Posting ucapan di story & tag pelanggan (dengan izin)', 'Beri voucher kecil di hari spesialnya']],
  ['Personal branding owner & komunitas', ['medsos'], 'Orang lebih percaya pada orang daripada logo. Owner yang aktif di komunitas sering mendatangkan rekomendasi.', ['Owner bercerita proses & nilai bisnis di akun pribadi', 'Aktif di 1–2 komunitas yang sesuai target pembeli', 'Jual proses, bukan cuma hasil']],
  ['Pasukan reseller/mitra', ['affiliate'], 'Banyak orang mencari penghasilan tambahan, dan reseller menambah tenaga jual tanpa biaya iklan.', ['Tentukan komisi/harga reseller yang tetap untung (cek BEP)', 'Siapkan materi jualan siap pakai', 'Rekap penjualan reseller di Tim Affiliate']],
  ['Organik marketplace minimal 40%', ['mp'], 'Toko yang hanya mengandalkan iklan paling terpukul saat algoritma berubah. Live, video, dan affiliate menstabilkan omzet & ROAS.', ['Cek porsi organik di tab Kesehatan Toko', 'Jadwalkan live rutin & video pendek harian', 'Ajak affiliate untuk produk andalan']],
  ['Uji iklan luar marketplace (Google CMN / Meta CPAS)', ['adv', 'mp'], 'Iklan di Google/YouTube/Meta yang mengarah ke toko marketplace menjangkau orang yang sedang mencari. Ini pintu baru, bukan jalan pintas.', ['Mulai dengan budget kecil untuk 1 produk andalan', 'Ukur dengan ROAS Gabungan (bukan ROAS versi Meta)', 'Lanjutkan kalau ROAS gabungan di atas ROAS minimal']],
  ['Bahasa ngobrol & perjalanan beli singkat', ['konten', 'cs'], 'Brand yang terdengar seperti teman lebih mudah didekati, dan langkah beli yang lebih sedikit menaikkan konversi.', ['Tulis ulang caption & skrip CS dengan gaya ngobrol', 'Kurangi langkah dari konten ke checkout (link langsung)', 'Perbanyak konten bukti sosial']],
  ['Jujur soal kekurangan produk', ['konten'], 'Konten yang ikut menyebut kekurangan produk terasa jujur dan membangun kepercayaan jangka panjang.', ['Buat konten "yang perlu kamu tahu sebelum beli"', 'Sebutkan untuk siapa produk ini cocok & tidak cocok', 'Tutup dengan solusi/garansi']],
];

async function strategyTab(team, body) {
  let filter = team;
  const draw = () => {
    const list = STRATEGIES.filter(([, teams]) => filter === 'all' || teams.includes(filter));
    body.innerHTML = `<div class="check small-note">Strategi yang terbukti berhasil, dirangkum dari diskusi ratusan seller & marketer Indonesia. Klik <b>Jadikan kartu Planner</b> untuk langsung mengerjakannya di brand ${esc(brandName())}.</div>
      <div class="tabs" data-st-chips><button data-st-filter="all" class="${filter === 'all' ? 'active' : ''}">Semua</button>${Object.entries(TEAMS).map(([k, l]) => `<button data-st-filter="${k}" class="${filter === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="strategy-grid">${list.map(([title, teams, why, steps]) => `<div class="card strategy">
        <div class="row-between"><b>${esc(title)}</b><span class="hint">${teams.map((t) => TEAMS[t]).join(' · ')}</span></div>
        <p class="hint">${esc(why)}</p><ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <button class="ghost small" data-st-plan="${esc(title)}">Jadikan kartu Planner</button></div>`).join('') || '<p class="hint">Belum ada strategi untuk tim ini.</p>'}</div>`;
  };
  draw();
  body.onclick = async (e) => {
    const d = e.target.dataset;
    if (d.stFilter) { filter = d.stFilter; draw(); }
    if (d.stPlan) {
      const s = STRATEGIES.find(([t]) => t === d.stPlan);
      try {
        await api('/api/content', json('POST', { title: `Strategi: ${s[0]}`, status: 'ide', notes: `${s[2]}\n\nLangkah:\n${s[3].map((x, i) => `${i + 1}. ${x}`).join('\n')}` }));
        e.target.textContent = '✓ Masuk Planner';
        e.target.disabled = true;
        toast('Kartu dibuat di Planner (kolom Ide)');
      } catch (ex) { toast(ex.message); }
    }
  };
}

if (window.timOps?.adsTabs) Object.assign(window.timOps.adsTabs, { profit: profitTab, health: healthTab, strategy: strategyTab });
