import { executeConductorPlan, applyBrandScopedResponse } from './conductor-runner.js';
import { buildAdReferenceBrief } from './ad-reference.js';
// Agen AI per tim + CS AI Closing + Kantor AI (tim baru: Tim Founder).
// - Tim Digital & Konten → Agen Produk & Brand (dulu Brand Lab + Agen Produk Digital): blueprint produk, eBook,
//   LP storytelling, audit konversi LP, strategi logo, tagline & slogan, brand identity kit.
// - Tim ADV     → Agen Meta Ads: hook, iklan emosional, big concept, automated rules, CPL, retargeting, scaling, analyzer
//                 + kalkulator tanpa AI (rencana scaling budget & vonis SCALE/HOLD/OPTIMIZE/KILL).
// - Tim CS      → CS AI Closing ada di cs-closer.js (Kantor AI membaca datanya lewat window.timCs).
// - Tim Founder → Kantor AI: Conductor (perintah bahasa biasa → agen/kartu), Laporan Pagi (ke WA/Telegram), Struktur Tim.
// Semua AI lewat /api/ai/chat (model yang dipilih di AI & API Keys). Riwayat & aktivitas agen, kalkulator, jadwal,
// dan omzet riil disimpan per brand di server lewat store.js.
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const md = (t) => (window.timAi?.md ? window.timAi.md(t) : `<pre class="script">${esc(t)}</pre>`);
const N = (v) => Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0;
const rp = (n) => (n == null || !Number.isFinite(n) ? '–' : `Rp${Math.round(n).toLocaleString('id-ID')}`);
const x2 = (v) => (v == null || !Number.isFinite(v) ? '–' : `${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })}x`);
const pct = (v) => (v == null || !Number.isFinite(v) ? '–' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
const since = (days) => new Date(Date.now() - days * 86400_000).toISOString();
const brand = () => state.brands.find((b) => b.id === state.brandId);
const copy = (t, msg = 'Disalin') => navigator.clipboard?.writeText(t).then(() => toast(msg)).catch(() => toast('Gagal menyalin'));
// Data bersama per brand ada di server (store.js → kunci "agents.*"), jadi riwayat, aktivitas, dan isian Kantor AI sama di semua laptop.
const store = {
  get: (k, d) => window.timStore.get(`agents.${k}`, d),
  set: (k, v) => window.timStore.set(`agents.${k}`, v),
};

// ======================= AI =======================
let route = null;
async function aiRoute() {
  if (route) return route;
  const s = await api('/api/ai/status').catch(() => null);
  if (s?.routed) route = { provider: s.routed.provider, model: s.routed.model };
  else if (s?.enabled) route = { provider: s.provider, model: s.provider === 'gemini' ? s.gemini?.model : s.model };
  else route = { off: true };
  return route;
}
function brandCtx() {
  const b = brand();
  return b ? ` Brand yang sedang dikerjakan: ${b.name}.${b.description ? ` Profil brand: ${b.description}` : ''}` : '';
}
async function chat(system, prompt, { temperature = 0.7, max_tokens = 3000 } = {}) {
  const r = await aiRoute();
  if (r.off) throw new Error('AI belum aktif. Isi API key di Pengaturan → AI & API Keys.');
  const res = await api('/api/ai/chat', json('POST', { provider: r.provider, model: r.model, system, prompt, temperature, max_tokens }));
  return String(res.text || '').trim();
}
function parseJson(text) {
  const t = String(text).replace(/```json|```/g, '');
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start < 0 || end < start) throw new Error('Format jawaban AI tidak terbaca. Coba lagi.');
  return JSON.parse(t.slice(start, end + 1));
}
const BASE = 'Jawab dalam Bahasa Indonesia yang lugas dan praktis untuk bisnis Indonesia. Jangan membuat klaim yang tidak bisa dibuktikan, jangan menjanjikan hasil penjualan. Kalau data yang diberikan kurang, tulis bagian "DATA GAP" berisi data yang perlu dilengkapi. Pakai Markdown: heading ##, tabel, dan daftar bernomor.';

// ======================= KATALOG AGEN =======================
// f: field form. opts = pilihan, rows = textarea, req = wajib, def = isi awal (boleh fungsi).
const F = {
  product: { k: 'product', label: 'Produk / penawaran', ph: 'mis. serum vitamin C 20ml, Rp89rb', req: true },
  audience: { k: 'audience', label: 'Target audiens', ph: 'mis. wanita 20-30, kulit kusam, kerja kantoran' },
  pain: { k: 'pain', label: 'Masalah utama audiens', ph: 'mis. muka kusam padahal sudah skincare-an' },
  business: { k: 'business', label: 'Bisnis / produk', ph: 'mis. brand minuman herbal kemasan untuk pekerja', req: true, def: () => brand()?.description || '' },
  name: { k: 'name', label: 'Nama brand', def: () => brand()?.name || '' },
  data: { k: 'data', label: 'Data iklan (tempel dari Ads Manager / CSV)', rows: 6, req: true, ph: 'nama iklan, spend, hasil, CPA/CPL, ROAS, CTR, CPM, frekuensi …' },
};
const AGENTS = [
  // ---------- Tim Digital ----------
  { id: 'produk', team: 'digital', icon: '🧩', name: 'Product Builder', role: 'Ide → paket produk digital siap jual',
    desc: 'Outline isi, worksheet, bonus, tier harga, dan rencana launching 14 hari.',
    fields: [{ k: 'idea', label: 'Ide produk', rows: 3, req: true, ph: 'mis. template konten 30 hari untuk UMKM kuliner' }, F.audience,
      { k: 'format', label: 'Format', opts: ['eBook', 'Template / toolkit', 'Kelas video', 'Worksheet / planner', 'Bundle'] }, { k: 'price', label: 'Rencana harga', ph: 'mis. Rp49rb–99rb' }],
    sys: 'Kamu product strategist produk digital (eBook, template, kelas) untuk pasar Indonesia.',
    out: '## Positioning (janji utama 1 kalimat + untuk siapa)\n## Isi paket (tabel: Modul | Isi | Hasil untuk pembeli)\n## Worksheet / lembar kerja\n## 3 bonus pendukung\n## Tier harga (tabel) + alasan\n## Rencana launching 14 hari (tabel: Hari | Aksi | Kanal)\n## Cara validasi sebelum produksi penuh' },
  { id: 'ebook', team: 'digital', icon: '📘', name: 'eBook Creator', role: 'Struktur bab, naskah, worksheet, arahan cover',
    desc: 'Dari topik jadi kerangka eBook lengkap + draft bab pertama.',
    fields: [{ k: 'topic', label: 'Topik eBook', req: true, ph: 'mis. jualan di TikTok Shop tanpa modal iklan' }, F.audience,
      { k: 'chapters', label: 'Jumlah bab', opts: ['7', '5', '10'] }, { k: 'tone', label: 'Gaya bahasa', opts: ['Santai & praktis', 'Profesional', 'Storytelling'] }],
    sys: 'Kamu penulis & editor eBook non-fiksi bisnis berbahasa Indonesia.',
    out: '## 5 alternatif judul + subjudul (tandai yang terbaik)\n## Outline per bab (poin-poin + hasil yang dibawa pulang pembaca)\n## Draft lengkap Bab 1 (±600 kata)\n## Worksheet pendamping\n## Arahan cover: konsep, warna, font + 1 prompt gambar cover dalam Bahasa Inggris (blok kode)' },
  { id: 'lpstory', team: 'digital', icon: '📖', name: 'LP Storytelling', role: 'Fitur → cerita yang menjual di landing page',
    desc: 'Alur masalah → titik balik → solusi → bukti → penawaran, siap ditempel ke LP Builder.',
    fields: [F.product, { k: 'features', label: 'Fitur / isi produk', rows: 4, req: true, ph: 'satu fitur per baris' }, F.audience, { k: 'offer', label: 'Penawaran & harga', ph: 'mis. diskon 40% s/d Jumat, bonus template' }],
    sys: 'Kamu copywriter landing page direct-response dengan pendekatan storytelling.',
    out: 'Tulis per section landing page: ## Hero (headline, subheadline, CTA) ## Masalah ## Agitasi ## Titik balik ## Solusi (ubah tiap fitur jadi manfaat) ## Bukti yang perlu dikumpulkan ## Penawaran & harga ## FAQ (5) ## CTA penutup' },
  { id: 'lpaudit', team: 'digital', icon: '🔍', name: 'Audit Konversi LP', role: 'Cek headline, struktur, UX, CTA, bukti',
    desc: 'Skor per aspek, 5 perbaikan prioritas, dan draft headline/CTA baru.',
    fields: [{ k: 'url', label: 'URL landing page (opsional)', ph: 'https://…' }, { k: 'content', label: 'Isi landing page (tempel teksnya)', rows: 7, req: true },
      { k: 'goal', label: 'Tujuan halaman', opts: ['Pembelian langsung', 'Leads WhatsApp', 'Isi form', 'Daftar webinar'] }, { k: 'traffic', label: 'Sumber traffic', opts: ['Meta Ads', 'TikTok Ads', 'Organik / bio', 'Google Ads'] }],
    sys: 'Kamu spesialis CRO (conversion rate optimization) landing page.',
    out: '## Skor (tabel: Aspek | Skor 0-10 | Temuan) untuk Headline, Penawaran, Struktur, Bukti, CTA, UX mobile, Friksi\n## Skor total /100\n## 5 perbaikan prioritas (tabel: Perbaikan | Dampak | Usaha)\n## 3 headline baru\n## 3 CTA baru' },
  // ---------- Tim Konten (Brand Lab) ----------
  { id: 'logo', team: 'konten', icon: '✒️', name: 'Strategi Logo', role: 'Arah logo, simbol, warna, font, design brief',
    desc: '3 konsep logo lengkap dengan makna, palet HEX, font, dan prompt gambar.',
    fields: [F.name, F.business, { k: 'values', label: 'Nilai / kepribadian brand', ph: 'mis. jujur, hangat, modern' }, F.audience,
      { k: 'style', label: 'Gaya', opts: ['Minimalis modern', 'Playful', 'Premium / mewah', 'Tradisional modern', 'Bebas'] }],
    sys: 'Kamu brand designer & strategist identitas visual.',
    out: '## 3 konsep logo (per konsep: nama konsep, simbol & maknanya, gaya, palet warna HEX, font yang disarankan)\n## Design brief untuk desainer\n## Prompt gambar per konsep (Bahasa Inggris, blok kode)\n## Do & don\'t pemakaian logo' },
  { id: 'tagline', team: 'konten', icon: '💬', name: 'Tagline & Slogan', role: 'Tagline, slogan, catchphrase + evaluasinya',
    desc: 'Banyak pilihan dengan angle berbeda, dinilai, lalu diberi 3 rekomendasi.',
    fields: [F.name, F.business, { k: 'usp', label: 'Keunggulan utama', ph: 'mis. tanpa gula, resep keluarga' },
      { k: 'tone', label: 'Nada', opts: ['Hangat', 'Berani', 'Lucu', 'Premium', 'Inspiratif'] }, { k: 'n', label: 'Jumlah', opts: ['15', '10', '25'] }],
    sys: 'Kamu copywriter brand yang ahli tagline pendek dan mudah diingat.',
    out: '## Daftar tagline (tabel: # | Tagline | Angle | Kenapa kuat | Skor 1-10)\n## 3 rekomendasi teratas + pemakaian (logo, bio, iklan)\n## 5 catchphrase untuk konten/video' },
  { id: 'identity', team: 'konten', icon: '🎨', name: 'Brand Identity Kit', role: 'Warna, tipografi, tone of voice, moodboard',
    desc: 'Mini brand guideline supaya semua konten tim tetap konsisten.',
    fields: [F.name, F.business, { k: 'personality', label: 'Kepribadian brand', ph: 'mis. sahabat yang paham kesehatan' }, F.audience, { k: 'competitors', label: 'Kompetitor (opsional)' }],
    sys: 'Kamu brand strategist yang menyusun brand guideline ringkas untuk tim konten.',
    out: '## Brand essence & archetype\n## Palet warna (tabel: Nama | HEX | Pemakaian)\n## Tipografi (heading, body, aksen)\n## Tone of voice (do / don\'t + 5 contoh kalimat)\n## Kata kunci moodboard + 1 prompt moodboard (Bahasa Inggris, blok kode)\n## Checklist konsistensi sebelum posting' },
  // ---------- Tim ADV (kreatif) ----------
  { id: 'hook', team: 'adv', group: 'kreatif', icon: '🎣', name: 'Hook & Headline', role: 'Hook Reels 3 detik, headline, copy pendek',
    desc: 'Variasi siap uji A/B dengan angle berbeda.',
    fields: [F.product, F.audience, F.pain, { k: 'n', label: 'Jumlah variasi', opts: ['10', '6', '15'] }],
    sys: 'Kamu creative strategist Meta Ads (Facebook & Instagram) untuk pasar Indonesia.',
    out: '## Variasi (tabel: # | Angle | Hook 3 detik (teks layar/ucapan) | Headline | Primary text ≤125 karakter)\n## 3 variasi yang diuji duluan + alasannya' },
  { id: 'emosi', team: 'adv', group: 'kreatif', icon: '🧠', name: 'Iklan Emosional', role: 'Konflik, emosi, dan dialog batin audiens',
    desc: 'Konsep iklan berbasis emosi lengkap dengan script per scene.',
    fields: [F.product, F.audience, { ...F.pain, req: true }, { k: 'format', label: 'Format', opts: ['Reels 30 detik', 'Reels 15 detik', 'Carousel', 'Single image'] }],
    sys: 'Kamu penulis iklan berbasis psikologi audiens (konflik, emosi, dialog batin) tanpa manipulasi atau klaim palsu.',
    out: '## Konflik inti & emosi yang disentuh\n## Dialog batin audiens (5 kalimat)\n## Script (tabel: Detik/Slide | Visual | Teks/VO)\n## Primary text\n## 3 variasi CTA' },
  { id: 'concept', team: 'adv', group: 'kreatif', icon: '💡', name: 'Big Concept Kreatif', role: 'Big idea, visual hook, prompt gambar, storyboard',
    desc: 'Paket creative direction untuk satu campaign.',
    fields: [F.product, F.audience, { k: 'goal', label: 'Tujuan campaign', opts: ['Penjualan', 'Leads', 'Awareness', 'Launching produk'] }],
    sys: 'Kamu creative director iklan digital.',
    out: '## 3 big concept (per konsep: nama, insight, visual hook, headline, prompt gambar Bahasa Inggris dalam blok kode)\n## Storyboard Reels 5 scene untuk konsep terbaik (tabel)\n## Cara uji ketiganya di Meta Ads' },
  { id: 'adref', team: 'adv', group: 'kreatif', icon: '🧭', name: 'Riset Referensi Iklan', role: 'Bedah iklan referensi → konsep video original',
    desc: 'Petakan hook, demo, offer, CTA dari bahan referensi lalu buat script baru yang relevan; URL saja tidak dianggap bukti.',
    fields: [F.product, F.audience, { k: 'sourceUrl', label: 'URL Meta Ads Library / video (opsional)', ph: 'Tempel URL iklan publik' },
      { k: 'reference', label: 'Bukti referensi: caption, transkrip, atau deskripsi adegan', rows: 7, ph: 'Tempel caption iklan dan ringkasan adegan/teks layar. Tanpa bahan ini, agen tidak mengklaim sudah menonton URL.' },
      { k: 'offer', label: 'Offer dan bukti produk yang tersedia', rows: 2, ph: 'Harga, bonus, testimoni/data sah yang boleh dipakai' },
      { k: 'format', label: 'Format output', opts: ['Reels 30 detik', 'Reels 15 detik', 'Reels 60 detik', 'UGC testimonial'] }],
    sys: 'Kamu analis creative performance Meta Ads. Pisahkan bukti dari hipotesis. Jangan mengarang performa hanya dari iklan yang aktif di Ads Library. Hormati orisinalitas dan kepatuhan klaim.',
    out: '## Peta referensi (OBSERVASI terverifikasi vs HIPOTESIS)\n## Struktur kreatif: hook → masalah → demo/bukti → manfaat → offer → CTA\n## Yang bisa dipelajari (prinsip, bukan salinan)\n## 3 konsep video original untuk produk ini\n## Script konsep terbaik (tabel: detik | visual/aksi | teks layar | VO/dialog | bukti yang perlu disiapkan)\n## Caption + headline + CTA\n## Klaim/data gap & checklist compliance\n## Rencana uji A/B (variabel tunggal, hipotesis, metrik)' },
  // ---------- Tim ADV (performa) ----------
  { id: 'rules', team: 'adv', group: 'performa', icon: '⚙️', name: 'Automated Rules', role: 'Aturan pause, scale, recovery, kontrol budget',
    desc: 'Blueprint rules Meta Ads Manager sesuai target CPA/CPL kamu.',
    fields: [{ k: 'objective', label: 'Tujuan', opts: ['Purchase', 'Leads (form/WA)', 'Klik ke WhatsApp', 'Traffic'] }, { k: 'target', label: 'Target CPA / CPL (Rp)', req: true, ph: 'mis. 45000' },
      { k: 'aov', label: 'Nilai pesanan rata-rata (Rp)', ph: 'mis. 150000' }, { k: 'budget', label: 'Budget harian total (Rp)', ph: 'mis. 500000' }, { k: 'risk', label: 'Profil risiko', opts: ['Konservatif', 'Seimbang', 'Agresif'] }],
    sys: 'Kamu media buyer senior Meta Ads yang menyusun automated rules di Ads Manager.',
    out: '## Rules (tabel: Nama rule | Level | Kondisi IF | Aksi | Rentang waktu | Frekuensi cek) — minimal: stop loss, kill tanpa hasil, scale pemenang, recovery, frekuensi tinggi, kontrol budget harian\n## Guardrail (batas yang tidak boleh dilanggar)\n## Langkah setel di Ads Manager' },
  { id: 'leads', team: 'adv', group: 'performa', icon: '🧲', name: 'Lead Gen & CPL', role: 'Evaluasi CPL dan guardrail campaign leads',
    desc: 'Hitung CPL maksimum yang masih untung, evaluasi, dan perbaikan.',
    fields: [{ k: 'channel', label: 'Kanal leads', opts: ['WhatsApp', 'Form instan Meta', 'Landing page + email'] }, { ...F.data, req: false, label: 'Data campaign leads (opsional)' },
      { k: 'aov', label: 'Nilai pesanan rata-rata (Rp)', req: true }, { k: 'margin', label: 'Margin kotor (%)', ph: 'mis. 40' }, { k: 'close', label: 'Closing rate leads → order (%)', ph: 'mis. 15' }],
    sys: 'Kamu spesialis lead generation & performance marketing.',
    out: '## CPL maksimum layak (tunjukkan hitungan: AOV × margin × closing rate)\n## Evaluasi data (kalau ada)\n## Guardrail & rules campaign leads (tabel)\n## Perbaikan form / script WA pertama untuk menaikkan closing' },
  { id: 'retarget', team: 'adv', group: 'performa', icon: '🔁', name: 'Retargeting Funnel', role: 'Audience window, frequency cap, fatigue',
    desc: 'Struktur retargeting per tahap funnel lengkap dengan pesannya.',
    fields: [F.product, { k: 'traffic', label: 'Traffic / pengunjung per bulan', ph: 'mis. 20.000 pengunjung LP' }, { k: 'freq', label: 'Frekuensi retargeting sekarang', ph: 'mis. 4,2' }, { k: 'notes', label: 'Catatan', rows: 2 }],
    sys: 'Kamu strategist retargeting funnel Meta Ads.',
    out: '## Segmen (tabel: Segmen | Window hari | Pesan | Format | Frequency cap)\n## Exclusion yang wajib\n## Tanda fatigue & rules penanganannya\n## Urutan pesan 7 hari untuk yang belum checkout' },
  { id: 'scaling', team: 'adv', group: 'performa', icon: '📈', name: 'Scaling Strategist', role: 'Kapan naik, tahan, turun, atau stop budget',
    desc: 'Decision tree scaling + rekomendasi per ad set dari datamu.',
    fields: [F.data, { k: 'target', label: 'Target ROAS atau CPA', ph: 'mis. ROAS 2,5 atau CPA 40000' }],
    sys: 'Kamu media buyer yang ahli scaling budget Meta Ads tanpa merusak learning phase.',
    out: '## Decision tree scaling (naik / tahan / turun / stop dengan ambang angka)\n## Rekomendasi per ad set (tabel: Ad set | Kondisi | Keputusan | Budget baru)\n## Jadwal cek 7 hari' },
  { id: 'metrica', team: 'adv', group: 'performa', icon: '📊', name: 'Performance Analyzer', role: 'Baca KPI → SCALE / HOLD / OPTIMIZE / KILL',
    desc: 'Bandingkan iklan & ad set, lalu beri vonis dan tindakannya.',
    fields: [F.data, { k: 'target', label: 'Target ROAS atau CPA', ph: 'mis. ROAS 2,5' }],
    sys: 'Kamu analis performa Meta Ads yang tegas mengambil keputusan dari angka.',
    out: '## Ringkasan akun (3 kalimat)\n## Vonis per iklan (tabel: Iklan | KPI kunci | Vonis SCALE/HOLD/OPTIMIZE/KILL | Alasan | Tindakan)\n## Pola pemenang (kreatif, audiens, placement)\n## 3 tindakan hari ini' },
];
const byId = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
const CORE_AGENT_COUNT = AGENTS.length;
const AGENT_VIEW = { konten: 'agents-digital', digital: 'agents-digital', adv: 'agents-adv' };
function replaceCustomCatalog(catalog) {
  AGENTS.splice(CORE_AGENT_COUNT);
  for (const id of (fo.dynamicTeamIds || [])) delete TEAM[id];
  for (const id of Object.keys(byId)) if (id.startsWith('custom-')) delete byId[id];
  fo.dynamicTeamIds = [];
  for (const team of catalog.teams || []) {
    TEAM[team.id] = { label: team.label, icon: team.icon || '🧩', views: [['founder', 'Kantor AI']] };
    fo.dynamicTeamIds.push(team.id);
  }
  for (const agent of catalog.agents || []) {
    const item = { ...agent, icon: '🤖', custom: true };
    AGENTS.push(item); byId[item.id] = item;
  }
  fo.catalogCanManage = !!catalog.canManage;
}
async function loadConductorCatalog(force = false) {
  if (!force && fo.catalogBrandId === state.brandId) return;
  if (fo.catalogLoading) return fo.catalogLoading;
  const brandId = state.brandId;
  fo.catalogLoading = (async () => {
    try {
      const catalog = await api('/api/conductor/catalog');
      if (state.brandId !== brandId) return;
      replaceCustomCatalog(catalog);
      fo.catalogBrandId = brandId; fo.catalogError = '';
    } catch (ex) {
      if (state.brandId === brandId) { replaceCustomCatalog({}); fo.catalogBrandId = brandId; fo.catalogError = ex.message; }
    } finally {
      fo.catalogLoading = null;
      if (state.brandId !== brandId) { loadConductorCatalog(); return; }
      if (document.getElementById('view-founder')?.classList.contains('active')) renderFounder();
    }
  })();
  return fo.catalogLoading;
}

// ======================= RUNNER AGEN (dipakai 3 halaman) =======================
const ui = { 'agents-digital': { agent: 'produk' }, 'agents-adv': { tab: 'kreatif', agent: 'hook' } };
const usage = () => store.get('usage', {});
const history = (id) => store.get(`hist.${id}`, []);

function agentForm(a, values = {}) {
  return `<form class="ag-form" data-ag-form="${a.id}">
    <div class="ag-head"><span class="ag-ic">${a.icon}</span><div><h3>${esc(a.name)}</h3><div class="hint">${esc(a.desc)}</div></div></div>
    <div class="ag-fields">${a.fields.map((f) => {
      const v = values[f.k] ?? (typeof f.def === 'function' ? f.def() : f.def) ?? '';
      const lab = `<label class="label" for="ag-${f.k}">${esc(f.label)}${f.req ? ' *' : ''}</label>`;
      if (f.opts) return `<div>${lab}<select id="ag-${f.k}" name="${f.k}">${f.opts.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
      if (f.rows) return `<div class="ag-wide">${lab}<textarea id="ag-${f.k}" name="${f.k}" rows="${f.rows}" placeholder="${esc(f.ph || '')}" ${f.req ? 'required' : ''}>${esc(v)}</textarea></div>`;
      return `<div>${lab}<input id="ag-${f.k}" name="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph || '')}" ${f.req ? 'required' : ''}></div>`;
    }).join('')}</div>
    <div class="btn-row"><button class="primary">Jalankan ${esc(a.name)}</button></div></form>
    <div class="ag-out" data-ag-out></div>
    ${history(a.id).length ? `<div class="label">Riwayat (${history(a.id).length})</div><div class="ag-hist">${history(a.id).map((h, i) => `<button class="ghost small" data-ag-hist="${i}">${esc(new Date(h.at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }))} · ${esc(Object.values(h.values).find(Boolean)?.slice(0, 40) || '')}</button>`).join('')}</div>` : ''}`;
}
function outHtml(a, text) {
  return `<div class="card ag-result"><div class="row-between"><div class="label">Hasil ${esc(a.name)}</div>
    <div class="btn-row"><button class="ghost small" data-ag-copy>Salin</button><button class="ghost small" data-ag-plan>Jadikan kartu Planner</button></div></div>
    <div class="md">${md(text)}</div><p class="hint">Hasil AI adalah draft. Cek ulang angka, klaim, dan kesesuaian brand sebelum dipakai.</p></div>`;
}
async function runAgent(box, a, values) {
  const out = $('[data-ag-out]', box);
  const missing = a.fields.filter((f) => f.req && !String(values[f.k] || '').trim());
  if (missing.length) return toast(`Isi dulu: ${missing.map((f) => f.label).join(', ')}`);
  out.innerHTML = `<div class="card"><span class="spinner inline"></span> ${esc(a.name)} lagi bekerja… (20–60 detik)</div><div class="spinner"></div>`;
  try {
    const text = await generate(a, values);
    out.innerHTML = outHtml(a, text);
    out.dataset.text = text;
  } catch (ex) {
    out.innerHTML = `<div class="check bad">⚠️ ${esc(ex.message)}</div>`;
  }
}
// Jalankan satu agen dan catat riwayat, pemakaian, dan aktivitasnya. Dipakai halaman agen dan Asisten AI (assistant.js).
async function generate(a, values) {
  const activeBrand = state.brandId;
  const brief = a.fields.filter((f) => String(values[f.k] || '').trim()).map((f) => `- ${f.label}: ${values[f.k]}`).join('\n');
  const act = logActivity({ agent: a.id, status: 'running', title: String(Object.values(values).find(Boolean) || '').slice(0, 60) });
  try {
    const prompt = a.id === 'adref' ? buildAdReferenceBrief(values, a.out) : `Brief:\n${brief}\n\nSusun hasil dengan format berikut:\n${a.out}`;
    const text = await chat(`${a.sys}${brandCtx()} ${BASE}`, prompt);
    if (state.brandId !== activeBrand) throw new Error('Brand berganti saat agen bekerja. Hasil tidak disimpan ke brand lain.');
    store.set(`hist.${a.id}`, [{ at: Date.now(), values, text }, ...history(a.id)].slice(0, 8));
    const u = usage(); u[a.id] = (u[a.id] || 0) + 1; store.set('usage', u);
    logActivity({ ...act, status: 'done', end: Date.now() });
    return text;
  } catch (ex) {
    logActivity({ ...act, status: 'failed', end: Date.now(), error: ex.message });
    throw ex;
  }
}
// Log aktivitas agen (dipakai Kantor Virtual): satu baris per tugas, statusnya berjalan → selesai / gagal.
const activity = () => store.get('activity', []);
function logActivity(entry) {
  const e = { id: entry.id || Date.now(), at: entry.at || Date.now(), ...entry };
  window.timStore.push('agents.activity', e, 60);
  if (document.getElementById('view-founder')?.classList.contains('active') && fo.tab === 'office') renderFounder();
  return e;
}
async function toPlanner(title, notes) {
  try {
    await api('/api/content', json('POST', { title: title.slice(0, 80), status: 'ide', notes }));
    toast('Masuk ke kolom Ide di Planner ✓');
  } catch (ex) { toast(ex.message); }
}
function readForm(form) { return Object.fromEntries(new FormData(form).entries()); }

function agentGrid(list, active) {
  const u = usage();
  return `<div class="ag-grid">${list.map((a) => `<button class="ag-card ${a.id === active ? 'active' : ''}" data-ag-pick="${a.id}">
    <span class="ag-ic">${a.icon}</span><span><b>${esc(a.name)}</b><span class="hint">${esc(a.role)}</span>${u[a.id] ? `<span class="tag ghost">${u[a.id]}× dipakai</span>` : ''}</span></button>`).join('')}</div>`;
}
function renderAgents(view, { title, intro, list, extraTabs = '', extra = null }) {
  const root = document.getElementById(`view-${view}`);
  const st = ui[view];
  const items = st.tab ? list.filter((a) => a.group === st.tab) : list;
  if (items.length && !items.some((a) => a.id === st.agent)) st.agent = items[0].id;
  // Gambar ulang agen yang sama (mis. data server disegarkan) tidak boleh menghapus isian & hasil yang sedang tampil.
  const oldForm = $(`[data-ag-form="${st.agent}"]`, root);
  const kept = oldForm ? { values: readForm(oldForm), out: $('[data-ag-out]', root) } : null;
  root.innerHTML = `<div class="row-between"><h1>${title}</h1><span class="tag">${list.length} agen AI</span></div><p class="hint">${intro}</p>
    ${extraTabs}<div data-ag-body></div>`;
  const body = $('[data-ag-body]', root);
  if (extra && st.tab === extra.tab) { extra.render(body); return; }
  const a = byId[st.agent];
  body.innerHTML = `${agentGrid(items, st.agent)}<div class="card ag-run">${agentForm(a, st.prefill || kept?.values || {})}</div>`;
  if (kept?.out && !st.prefill) $('[data-ag-out]', body).replaceWith(kept.out);
  if (st.prefill?.autorun) { delete st.prefill.autorun; runAgent(body, a, st.prefill); }
  delete st.prefill;
}
function bindAgents(view, rerender) {
  const root = document.getElementById(`view-${view}`);
  root.addEventListener('click', (e) => {
    const d = e.target.closest('button')?.dataset || {};
    const st = ui[view];
    if (d.agPick) { st.agent = d.agPick; rerender(); }
    if (d.agTab) { st.tab = d.agTab; rerender(); }
    if (d.agCopy !== undefined) copy($('[data-ag-out]', root).dataset.text || '');
    if (d.agPlan !== undefined) {
      const a = byId[st.agent];
      toPlanner(`${a.name}: ${Object.values(readForm($('[data-ag-form]', root))).find(Boolean) || brand()?.name || ''}`, `Dari agen ${a.name} (${TEAM[a.team].label}):\n\n${$('[data-ag-out]', root).dataset.text || ''}`);
    }
    if (d.agHist !== undefined) {
      const h = history(st.agent)[Number(d.agHist)];
      const out = $('[data-ag-out]', root);
      out.innerHTML = outHtml(byId[st.agent], h.text);
      out.dataset.text = h.text;
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  root.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-ag-form]');
    if (!form) return;
    e.preventDefault();
    runAgent(root, byId[form.dataset.agForm], readForm(form));
  });
}
// Buka agen dari halaman lain (Conductor, kalkulator, Struktur Tim). values.autorun = langsung jalan.
function openAgent(id, values = {}) {
  const a = byId[id];
  if (!a) return;
  if (a.custom) {
    fo.tab = 'conductor';
    S.show('founder');
    conduct(`Gunakan agen ${a.name} untuk tugas ini. ${String(Object.entries(values).filter(([k]) => k !== 'autorun').map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Bantu saya menentukan brief yang perlu diisi.')}`);
    return;
  }
  const view = AGENT_VIEW[a.team];
  ui[view].agent = id;
  if (a.group) ui[view].tab = a.group;
  ui[view].prefill = values;
  S.show(view);
  document.getElementById(`view-${view}`).scrollIntoView({ block: 'start' });
}

// ---------- Agen Produk & Brand (Tim Digital & Konten; gabungan Brand Lab + Agen Produk Digital) ----------
const renderDigital = () => renderAgents('agents-digital', {
  title: 'Agen Produk & Brand', list: AGENTS.filter((a) => a.team === 'digital' || a.team === 'konten'),
  intro: '<b>Tim Digital &amp; Konten</b>: dari ide produk, brand (logo, tagline, identity), sampai landing page siap launching. Untuk proyek bertahap riset → copy → visual → LP, pakai tab <b>Launch Lab</b>. Hasil bisa langsung jadi kartu Planner.',
});

// ======================= AGEN META ADS (Tim ADV) + KALKULATOR =======================
const ADV_TABS = [['kreatif', 'Agen Kreatif'], ['performa', 'Agen Performa'], ['kalkulator', 'Kalkulator (tanpa AI)']];
const renderAdv = () => renderAgents('agents-adv', {
  title: 'Agen Meta Ads', list: AGENTS.filter((a) => a.team === 'adv'),
  intro: '<b>Tim ADV</b>: agen kreatif untuk bahan uji, agen performa untuk keputusan budget. Agen tidak mengubah akun iklan — semua keputusan tetap dieksekusi tim di Ads Manager.',
  extraTabs: `<div class="tabs">${ADV_TABS.map(([k, l]) => `<button data-ag-tab="${k}" class="${ui['agents-adv'].tab === k ? 'active' : ''}">${l}</button>`).join('')}</div>`,
  extra: { tab: 'kalkulator', render: renderCalc },
});

const calc = { rows: null };
const SAMPLE = 'Iklan A - Testimoni,850000,14,2380000,1.9,1.8\nIklan B - Promo,620000,3,390000,0.7,3.9\nIklan C - UGC,300000,0,0,1.1,1.4\nIklan D - Before/After,410000,6,1020000,1.4,2.2';
// Vonis per iklan dari angka (logika sama dengan agen Performance Analyzer, tapi deterministik).
function verdict(r, t) {
  const roas = r.spend ? r.revenue / r.spend : null;
  const cpa = r.conv ? r.spend / r.conv : null;
  const byRoas = !t.cpa; // target CPA diisi → dinilai pakai CPA, selain itu pakai ROAS
  const tRoas = t.roas || 1;
  const hit = byRoas ? roas >= tRoas : cpa != null && cpa <= t.cpa;
  // Spend minimum sebelum boleh menilai: target CPA, atau CPA impas (AOV ÷ target ROAS).
  const minSpend = t.cpa || (r.conv && r.revenue ? r.revenue / r.conv / tRoas : 50000);
  if (!r.conv && r.spend >= 2 * minSpend) return ['KILL', `Spend ${rp(r.spend)} tanpa hasil (≥2× batas ${rp(minSpend)})`];
  if (r.spend < minSpend) return ['DATA KURANG', `Spend baru ${rp(r.spend)} — tunggu minimal ${rp(minSpend)}`];
  const deep = byRoas ? roas < tRoas * 0.7 : cpa > t.cpa * 1.4;
  if (deep && r.spend >= 3 * minSpend) return ['KILL', byRoas ? `ROAS ${x2(roas)} jauh di bawah target ${x2(tRoas)}` : `CPA ${rp(cpa)} jauh di atas target ${rp(t.cpa)}`];
  const fatigue = r.freq >= 3.5 || (r.ctr > 0 && r.ctr < 0.8);
  const strong = byRoas ? roas >= tRoas * 1.2 : cpa <= t.cpa * 0.85;
  if (hit && strong && r.conv >= 3 && !fatigue) return ['SCALE', `${byRoas ? `ROAS ${x2(roas)}` : `CPA ${rp(cpa)}`}, ${r.conv} konversi, frekuensi ${r.freq || '–'}`];
  if (hit) return fatigue ? ['OPTIMIZE', `Masih sesuai target tapi ${r.freq >= 3.5 ? `frekuensi ${r.freq}` : `CTR ${r.ctr}%`} → siapkan kreatif baru`] : ['HOLD', 'Sesuai target — tahan budget, pantau 48 jam'];
  return ['OPTIMIZE', `${fatigue ? 'Kreatif lelah / CTR rendah. ' : ''}Di bawah target — ganti hook/kreatif atau audiens`];
}
const VCLASS = { SCALE: 'ok', HOLD: 'info', OPTIMIZE: 'warn', KILL: 'bad', 'DATA KURANG': 'ghost' };
function parseRows(text) {
  return String(text).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const c = l.split(/[;\t]|,(?=\s*[\d.])/).map((x) => x.trim());
    return { name: c[0], spend: N(c[1]), conv: N(c[2]), revenue: N(c[3]), ctr: N(c[4]), freq: N(c[5]) };
  }).filter((r) => r.name && !/^nama/i.test(r.name));
}
function scalePlan(p) {
  const step = { konservatif: 0.2, agresif: 0.35 }[p.mode];
  const every = p.mode === 'konservatif' ? 2 : 1;
  const out = [];
  let b = p.budget;
  for (let d = 1; d <= p.days; d++) {
    const up = d > 1 && (d - 1) % every === 0;
    if (up) b = Math.round((b * (1 + step)) / 1000) * 1000;
    out.push({ d, b, up });
  }
  return out;
}
function renderCalc(body) {
  const t = store.get('calc.target', { roas: 2.5, cpa: '' });
  const p = store.get('calc.plan', { budget: 300000, days: 7, mode: 'konservatif', roas: '' });
  const rows = parseRows(calc.rows ?? store.get('calc.rows', SAMPLE));
  const tg = { roas: N(t.roas) || null, cpa: N(t.cpa) || null };
  const plan = scalePlan({ budget: N(p.budget) || 0, days: Math.min(7, Math.max(3, N(p.days) || 7)), mode: p.mode });
  const total = plan.reduce((s, x) => s + x.b, 0);
  body.innerHTML = `<div class="grid-2">
    <div class="card"><div class="label">Rencana scaling budget 3–7 hari</div>
      <form class="ag-fields" data-calc-plan>
        <div><label class="label">Budget harian sekarang (Rp)</label><input name="budget" value="${esc(p.budget)}"></div>
        <div><label class="label">Lama (hari)</label><select name="days">${[3, 4, 5, 6, 7].map((d) => `<option ${d === N(p.days) ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="ag-wide"><label class="label">Mode</label><select name="mode"><option value="konservatif" ${p.mode === 'konservatif' ? 'selected' : ''}>Konservatif · naik 20% tiap 48 jam</option><option value="agresif" ${p.mode === 'agresif' ? 'selected' : ''}>Agresif · naik 35% tiap 24 jam</option></select></div>
      </form>
      <div class="table-wrap"><table class="data"><thead><tr><th>Hari</th><th>Budget</th><th>Syarat sebelum naik</th></tr></thead><tbody>
      ${plan.map((x) => `<tr><td>H${x.d}</td><td><b>${rp(x.b)}</b>${x.up ? ' <span class="tag">naik</span>' : ''}</td><td class="hint">${x.d === 1 ? 'Budget awal, jangan edit iklan' : x.up ? `ROAS ≥ target 2 hari terakhir, frekuensi &lt; 3, CPA tidak naik &gt;20%` : 'Tahan, biarkan learning stabil'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="hint">Total spend ${plan.length} hari: <b>${rp(total)}</b>. Kalau syarat tidak terpenuhi: tahan di budget terakhir; kalau ROAS turun &gt;30% dari target, turunkan ke budget hari sebelumnya.</p></div>
    <div class="card"><div class="label">Vonis cepat SCALE / HOLD / OPTIMIZE / KILL</div>
      <form class="ag-fields" data-calc-target>
        <div><label class="label">Target ROAS</label><input name="roas" value="${esc(t.roas)}" placeholder="mis. 2,5"></div>
        <div><label class="label">atau target CPA (Rp)</label><input name="cpa" value="${esc(t.cpa)}" placeholder="kosongkan kalau pakai ROAS"></div>
        <div class="ag-wide"><label class="label">Data per iklan — satu baris: nama, spend, konversi, omzet, CTR %, frekuensi</label>
        <textarea name="rows" rows="5" spellcheck="false" class="mono">${esc(calc.rows ?? store.get('calc.rows', SAMPLE))}</textarea></div>
      </form>
      <div class="table-wrap"><table class="data"><thead><tr><th>Iklan</th><th>Spend</th><th>ROAS</th><th>CPA</th><th>Vonis</th></tr></thead><tbody>
      ${rows.map((r) => { const [v, why] = verdict(r, tg); return `<tr><td>${esc(r.name)}</td><td>${rp(r.spend)}</td><td>${x2(r.spend ? r.revenue / r.spend : null)}</td><td>${r.conv ? rp(r.spend / r.conv) : '–'}</td><td><span class="tag v-${VCLASS[v]}">${v}</span><div class="hint">${esc(why)}</div></td></tr>`; }).join('') || '<tr><td colspan="5" class="hint">Belum ada baris data.</td></tr>'}
      </tbody></table></div>
      <div class="btn-row"><button class="ghost small" data-calc-ai>Minta analisa lengkap ke Performance Analyzer →</button></div></div></div>`;
  const save = () => {
    const fp = Object.fromEntries(new FormData($('[data-calc-plan]', body)));
    const ft = Object.fromEntries(new FormData($('[data-calc-target]', body)));
    store.set('calc.plan', fp);
    store.set('calc.target', { roas: ft.roas, cpa: ft.cpa });
    calc.rows = ft.rows;
    store.set('calc.rows', ft.rows);
  };
  body.querySelectorAll('select, input').forEach((el) => el.addEventListener('change', () => { save(); renderCalc(body); }));
  $('textarea', body).addEventListener('change', () => { save(); renderCalc(body); });
  $('[data-calc-ai]', body).addEventListener('click', () => {
    save();
    const ft = store.get('calc.target', {});
    openAgent('metrica', { data: `nama, spend, konversi, omzet, CTR %, frekuensi\n${calc.rows}`, target: ft.cpa ? `CPA ${ft.cpa}` : `ROAS ${ft.roas}`, autorun: true });
  });
}

// ======================= KANTOR AI (Tim Founder — tim baru) =======================
const TEAM = {
  founder: { label: 'Tim Founder', icon: '🏢', views: [['founder', 'Kantor AI']] },
  konten: { label: 'Tim Konten', icon: '✍️', views: [['planner', 'Planner'], ['studio', 'Studio'], ['agents-digital', 'Agen Produk & Brand']] },
  digital: { label: 'Tim Digital', icon: '🚀', views: [['launch', 'Launch Lab'], ['agents-digital', 'Agen Produk & Brand']] },
  medsos: { label: 'Tim Medsos', icon: '📱', views: [['calendar', 'Kalender'], ['compose', 'Buat Post'], ['analytics', 'Analitik'], ['tiktok', 'Scraper TikTok']] },
  adv: { label: 'Tim ADV', icon: '📣', views: [['adv', 'Iklan ADV'], ['agents-adv', 'Agen Meta Ads']] },
  mp: { label: 'Tim MP', icon: '🛒', views: [['mp', 'Iklan Marketplace']] },
  kol: { label: 'Tim KOL', icon: '⭐', views: [['kol', 'KOL & Influencer']] },
  affiliate: { label: 'Tim Affiliate', icon: '🔗', views: [['affiliate', 'Kreator Affiliate']] },
  cs: { label: 'Tim CS', icon: '💬', views: [['inbox', 'Inbox'], ['cs', 'Tiket & Template'], ['closer', 'CS AI Closing']] },
};
const REPORT_TEAMS = ['adv', 'mp', 'medsos', 'konten', 'digital', 'kol', 'affiliate', 'cs'];
const fo = { tab: 'conductor', plan: null, busy: false, brief: '' };
function renderFounder() {
  const root = document.getElementById('view-founder');
  if (fo.catalogBrandId !== state.brandId) {
    root.innerHTML = `<div class="card"><span class="spinner inline"></span> Memuat katalog divisi & agen…</div>`;
    loadConductorCatalog();
    return;
  }
  if (fo.catalogError) {
    root.innerHTML = `<div class="check bad">Katalog Conductor gagal dimuat: ${esc(fo.catalogError)} <button class="ghost small" data-fo-catalog-retry>Coba lagi</button></div>`;
    return;
  }
  const financeOnly = S.state.me?.user.team === 'keuangan' && !['owner', 'admin'].includes(S.state.me?.user.role);
  if (financeOnly) fo.tab = 'finance';
  root.innerHTML = `<div class="row-between"><h1>${financeOnly ? 'Tim Keuangan' : 'Kantor AI'}</h1><span class="tag">${financeOnly ? 'Tim Keuangan' : 'Tim Founder'}</span></div>
    <p class="hint">${financeOnly ? 'Pantau iklan vs omzet dan ringkasan keuangan per brand.' : '<b>Tim Founder</b> (owner / manajer): perintah dalam bahasa biasa ke <b>Conductor</b>, kantor virtual berisi semua agen AI, keuangan iklan vs omzet, laporan pagi otomatis ke WhatsApp/Telegram, dan struktur tim.'}</p>
    <div class="tabs">${(financeOnly ? [['finance', 'Keuangan']] : [['conductor', 'Conductor'], ['office', 'Kantor Virtual'], ['finance', 'Keuangan'], ['brief', 'Laporan Pagi'], ['org', 'Struktur Tim']]).map(([k, l]) => `<button data-fo-tab="${k}" class="${fo.tab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div data-fo-body></div>`;
  const body = $('[data-fo-body]', root);
  ({ conductor: foConductor, office: foOffice, finance: foFinance, brief: foBrief, org: foOrg })[fo.tab](body);
}
const EXAMPLES = [
  'Minggu depan launching eBook resep diet, siapkan produk, landing page, dan iklannya',
  'ROAS iklan turun 3 hari terakhir, apa yang harus dicek tim ADV?',
  'Bikin identitas brand baru untuk lini produk kopi literan',
  'CS kewalahan balas chat malam hari, siapkan CS AI untuk closing',
];
function foConductor(body) {
  const p = fo.plan;
  const sched = store.get('fo.sched', []);
  body.innerHTML = `<div class="card"><div class="label">Perintah ke Conductor</div>
    <form data-fo-cmd class="chat-form"><textarea rows="3" placeholder="mis. ${esc(EXAMPLES[0])}" ${fo.busy ? 'disabled' : ''}>${esc(fo.cmd || '')}</textarea><button class="primary" ${fo.busy ? 'disabled' : ''}>Susun rencana</button></form>
    <div class="btn-row left">${EXAMPLES.map((x, i) => `<button class="ghost small" data-fo-ex="${i}">${esc(x.slice(0, 42))}…</button>`).join('')}</div></div>
    ${fo.busy ? '<div class="card"><span class="spinner inline"></span> Conductor membagi tugas ke tim & agen…</div><div class="spinner"></div>' : ''}
    ${p ? `<div class="card"><div class="md">${md(p.summary || '')}</div>
      ${(p.proposals?.teams?.length || p.proposals?.agents?.length) ? `<div class="card"><div class="label">🧩 Usulan divisi & agen baru — menunggu approval</div><p class="hint">Belum aktif dan belum bisa dijalankan sampai disetujui owner/admin. Setelah disetujui, definisi tersimpan per brand dan masuk ke katalog Conductor.</p>${(p.proposals.teams || []).map((t) => `<div class="fo-step"><span class="ag-ic">${esc(t.icon || '🧩')}</span><div><b>${esc(t.label || t.id)}</b><div class="hint">Divisi baru · ${esc(t.id || '')}</div></div></div>`).join('')}${(p.proposals.agents || []).map((a) => `<div class="fo-step"><span class="ag-ic">🤖</span><div><b>${esc(a.name || a.id)}</b> <span class="tag ghost">${esc(TEAM[a.team]?.label || a.team || '')}</span><div class="hint">${esc(a.role || '')} · ${esc(a.desc || '')}</div></div></div>`).join('')}${fo.catalogCanManage ? `<div class="btn-row"><button type="button" class="primary" data-fo-approve-agents ${fo.proposalSaving ? 'disabled' : ''}>${fo.proposalSaving ? 'Menyimpan approval…' : 'Setujui & tambahkan ke TIM-AI'}</button></div>` : '<p class="hint">Minta owner/admin menyetujui usulan ini.</p>'}</div>` : ''}
      ${(p.steps || []).length ? `<div class="label">Tugas untuk agen AI</div><div class="fo-steps">${p.steps.map((s, i) => { const a = byId[s.agent]; const r = fo.runs?.[i]; const status = { pending: 'Menunggu', running: 'Sedang mengerjakan…', done: 'Selesai', failed: 'Gagal', needs_input: `Butuh: ${r?.missing?.join(', ')}`, cancelled: 'Dibatalkan' }[r?.status]; return a ? `<div class="fo-step"><span class="ag-ic">${a.icon}</span><div><b>${esc(a.name)}</b> <span class="tag ghost">${esc(TEAM[a.team].label)}</span><div class="hint">${esc(s.why || '')}${status ? ` · ${esc(status)}` : ''}${r?.error ? ` · ${esc(r.error)}` : ''}</div>${r?.text ? `<details><summary>Lihat hasil agen</summary><pre class="fo-wa">${esc(r.text)}</pre><button type="button" class="ghost small" data-fo-result-plan="${i}">Simpan hasil ke Planner</button></details>` : ''}</div><button class="ghost small" data-fo-run="${i}" ${['running', 'done'].includes(r?.status) ? 'disabled' : ''}>${r?.status === 'running' ? 'Berjalan…' : r?.status === 'done' ? 'Selesai ✓' : 'Jalankan →'}</button></div>` : ''; }).join('')}</div><div class="btn-row"><button type="button" class="primary" data-fo-run-all ${fo.running ? 'disabled' : ''}>${fo.running ? 'Agen sedang bekerja…' : '▶ Jalankan semua agen'}</button></div>` : ''}
      ${(p.tasks || []).length ? `<div class="label">Tugas untuk tim (kartu Planner)</div><div class="fo-steps">${p.tasks.map((t, i) => `<div class="fo-step"><span class="ag-ic">${TEAM[t.team]?.icon || '📌'}</span><div><b>${esc(t.title)}</b> <span class="tag ghost">${esc(TEAM[t.team]?.label || t.team)}</span>${t.due ? ` <span class="hint">· ${esc(t.due)}</span>` : ''}<div class="hint">${esc(t.detail || '')}</div></div><button class="ghost small" data-fo-task="${i}">Buat kartu</button></div>`).join('')}</div>
        <div class="btn-row"><button class="ghost small" data-fo-alltasks>Buat semua kartu</button></div>` : ''}
      ${p.schedule?.what ? `<div class="label">Jadwal rutin</div><div class="fo-step"><span class="ag-ic">⏰</span><div><b>${esc(p.schedule.when || '')}</b><div class="hint">${esc(p.schedule.what)}</div></div><button class="ghost small" data-fo-sched>Simpan jadwal</button></div>` : ''}</div>` : ''}
    ${sched.length ? `<div class="card"><div class="label">Jadwal rutin tersimpan</div>${sched.map((s, i) => `<div class="fo-step"><span class="ag-ic">⏰</span><div><b>${esc(s.when)}</b><div class="hint">${esc(s.what)}</div></div><button class="link" data-fo-unsched="${i}">Hapus</button></div>`).join('')}
      <p class="hint">Jadwal ini pengingat di browser. Laporan pagi yang terkirim otomatis tiap hari diatur di tab <b>Laporan Pagi</b>.</p></div>` : ''}`;
}
function conductorAgents() { return Object.fromEntries(AGENTS.map((a) => [a.id, a])); }
async function runConductorSteps(indices) {
  if (fo.running || !fo.plan?.steps?.length) return;
  fo.running = true;
  const activeBrand = state.brandId;
  const agents = conductorAgents();
  if (!fo.runs) fo.runs = fo.plan.steps.map(() => ({ status: 'pending' }));
  renderFounder();
  try {
    await executeConductorPlan(indices.map((i) => fo.plan.steps[i]), agents, async (id, values) => {
      const result = await generate(agents[id], values);
      if (state.brandId !== activeBrand) throw new Error('Brand berganti. Eksekusi dihentikan.');
      return result;
    }, (rows) => {
      indices.forEach((i, j) => { fo.runs[i] = rows[j]; });
      if (fo.tab === 'conductor' && state.brandId === activeBrand) renderFounder();
    }, () => state.brandId === activeBrand);
  } finally {
    fo.running = false;
    if (state.brandId === activeBrand && fo.tab === 'conductor') renderFounder();
  }
}
async function conduct(cmd) {
  fo.cmd = cmd; fo.busy = true; fo.plan = null; fo.runs = null; renderFounder();
  const catalog = AGENTS.map((a) => `${a.id} | ${TEAM[a.team]?.label || a.team} | ${a.name}: ${a.desc} | field: ${a.fields.map((f) => f.k).join(', ')}`).join('\n');
  try {
    const text = await chat(`Kamu Conductor, kepala operasional AI yang membagi perintah owner ke tim dan agen AI.${brandCtx()} Jawab HANYA JSON valid.`,
      `Perintah owner: "${cmd}"

Tim yang ada: ${Object.entries(TEAM).map(([k, t]) => `${k} (${t.label}: ${t.views.map((v) => v[1]).join(', ')})`).join('; ')}.
Agen AI yang tersedia (id | tim | nama: fungsi | field brief):
${catalog}

Format JSON:
{"summary":"ringkasan rencana dalam Markdown (maks 6 baris, sebut urutan kerja)",
 "steps":[{"agent":"id agen dari daftar","why":"kenapa agen ini","values":{"field":"isi brief yang bisa disimpulkan dari perintah"}}],
 "tasks":[{"team":"kunci tim","title":"judul kartu singkat","detail":"apa yang dikerjakan","due":"mis. Senin"}],
 "schedule":{"when":"mis. Setiap Senin 09.00","what":"laporan/aksi rutin"} atau null,
 "proposals":{"teams":[{"id":"custom-<slug>","label":"nama divisi","icon":"emoji"}],"agents":[{"id":"custom-<slug>","team":"id tim yang ada atau usulan","name":"nama agen","role":"fungsi singkat","desc":"kapabilitas","fields":[{"k":"slug","label":"label input","req":true,"rows":3,"ph":"petunjuk"}],"sys":"instruksi kerja Bahasa Indonesia yang aman dan relevan","out":"format output Markdown"}]}}
Aturan usulan: proposals harus {"teams":[],"agents":[]} kecuali perintah jelas meminta divisi/agen baru. Kalau bikin agen baru, buat definisi utuh agar bisa langsung dipakai; ID harus prefix custom-. Jangan masukkan usulan ke steps sebelum disetujui. Jangan mengarang id agen lama.
Pilih 1-5 agen yang paling relevan dan 0-6 tugas tim.`, { temperature: 0.4, max_tokens: 4000 });
    fo.plan = parseJson(text);
  } catch (ex) {
    fo.plan = { summary: `⚠️ ${ex.message}` };
  }
  fo.busy = false;
  renderFounder();
}
const taskCard = (t) => api('/api/content', json('POST', { title: `[${TEAM[t.team]?.label || t.team}] ${t.title}`.slice(0, 80), status: 'ide', notes: `Dari Conductor (Kantor AI)\nPerintah: ${fo.cmd}\n\n${t.detail || ''}${t.due ? `\nTenggat: ${t.due}` : ''}` }));

// ---------- Laporan Pagi: diatur & dikirim backend (src/founder.js) lewat /api/cron ----------
let foCfg = null;
async function foBrief(body) {
  if (!foCfg) {
    body.innerHTML = '<div class="spinner"></div>';
    try { foCfg = await api('/api/founder/settings'); } catch (ex) { body.innerHTML = `<div class="check bad">⚠️ ${esc(ex.message)}</div>`; return; }
    if (fo.tab === 'brief') renderFounder();
    return;
  }
  const c = foCfg;
  const ed = c.can_edit;
  body.innerHTML = `<div class="grid-2"><div class="card"><div class="label">Laporan pagi otomatis</div>
      <p class="hint">Setiap pagi server menyusun laporan dari tim yang dipilih (sama dengan halaman Laporan & Master BCS) + pipeline Planner, lalu mengirimnya ke kanal notifikasi brand ini (Telegram / gateway WhatsApp di <b>Planner → 🔔 Notifikasi</b>). Tetap jalan walaupun tidak ada yang membuka aplikasi.</p>
      <form data-fo-bcfg>
        <label class="toggle"><input type="checkbox" name="enabled" ${c.enabled ? 'checked' : ''} ${ed ? '' : 'disabled'}> Kirim laporan pagi otomatis setiap hari</label>
        <div class="ag-fields"><div><label class="label">Jam kirim (WIB)</label><select name="hour" ${ed ? '' : 'disabled'}>${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === c.hour ? 'selected' : ''}>${String(h).padStart(2, '0')}.00</option>`).join('')}</select></div>
        <div><label class="label">Periode data</label><select name="days" ${ed ? '' : 'disabled'}>${[[1, 'Kemarin (1 hari)'], [7, '7 hari'], [30, '30 hari']].map(([v, l]) => `<option value="${v}" ${v === c.days ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="label">Tim yang dilaporkan</div>
        <div class="checks">${c.teams_available.map((t) => `<label><input type="checkbox" name="team" value="${t}" ${c.teams.includes(t) ? 'checked' : ''} ${ed ? '' : 'disabled'}> ${esc(TEAM[t]?.label || t)}</label>`).join('')}</div>
        <p class="hint">Cron Vercel project ini berjalan sekali sehari pukul 06.00 WIB, jadi pilih jam 06.00 atau lebih awal (laporan terkirim di jam cron pertama setelah jam kirim). ${c.last_sent ? `Terakhir terkirim: <b>${esc(c.last_sent)}</b>.` : 'Belum pernah terkirim.'}</p>
        ${ed ? '<div class="btn-row"><button class="primary">Simpan jadwal</button></div>' : '<p class="hint">Cuma pemilik/admin yang bisa mengubah jadwal.</p>'}
      </form></div>
    <div class="card"><div class="label">Coba sekarang</div>
      <p class="hint">Susun laporan dengan pengaturan di samping. Kirim ke kanal notifikasi, atau bagikan manual.</p>
      <div class="btn-row left"><button class="ghost" data-fo-brief ${fo.busy ? 'disabled' : ''}>Susun pratinjau</button><button class="primary" data-fo-bsend ${fo.busy ? 'disabled' : ''}>Susun & kirim ke kanal notifikasi</button></div>
      ${fo.busy ? '<div class="spinner"></div>' : ''}
      ${fo.brief ? `<div class="row-between"><div class="label">Pratinjau pesan</div><div class="btn-row">
        <button class="ghost small" data-fo-bcopy>Salin</button><a class="btn small" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(fo.brief)}">WhatsApp</a>
        <a class="btn small" target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(location.origin)}&text=${encodeURIComponent(fo.brief)}">Telegram</a></div></div>
        <pre class="fo-wa">${esc(fo.brief)}</pre>` : ''}</div></div>`;
}
const readBriefCfg = (form) => {
  const f = new FormData(form);
  return { enabled: f.get('enabled') === 'on', hour: Number(f.get('hour')), days: Number(f.get('days')), teams: f.getAll('team') };
};
async function morningBrief(root, send) {
  const form = $('[data-fo-bcfg]', root);
  const c = form ? readBriefCfg(form) : foCfg;
  if (!c.teams.length) return toast('Pilih minimal satu tim');
  fo.busy = true; renderFounder();
  try {
    const r = await api('/api/founder/brief', json('POST', { teams: c.teams, days: c.days, send }));
    fo.brief = r.text;
    if (send) toast(r.sent?.sent ? `Terkirim ke ${r.sent.sent} kanal` : `Belum terkirim${r.sent?.errors?.length ? `: ${r.sent.errors.join('; ')}` : ' — atur kanal di Planner → 🔔 Notifikasi'}`);
  } catch (ex) {
    fo.brief = `⚠️ ${ex.message}`;
  }
  fo.busy = false;
  renderFounder();
}

// ---------- Keuangan: spend iklan vs omzet, ROAS per kanal, blended ROAS ----------
const fin = { days: 30, data: null, loading: false };
async function loadFinance() {
  fin.loading = true;
  const q = `from=${encodeURIComponent(since(fin.days))}`;
  const [adv, mp] = await Promise.all(['adv', 'mp'].map((t) => api(`/api/reports/team/${t}?${q}`).catch(() => null)));
  fin.data = { adv, mp, at: fin.days };
  fin.loading = false;
}
function foFinance(body) {
  if (!fin.data || fin.data.at !== fin.days) {
    body.innerHTML = '<div class="spinner"></div>';
    if (!fin.loading) loadFinance().then(() => fo.tab === 'finance' && renderFounder());
    return;
  }
  const { adv, mp } = fin.data;
  const t = (r) => r?.totals || { spend: 0, revenue: 0, conversions: 0 };
  const cutoff = Date.now() - fin.days * 86400_000;
  const csOrders = (window.timCs?.orders() || []).filter((o) => o.status !== 'batal' && Date.parse(o.at) >= cutoff);
  const csOmzet = csOrders.reduce((s, o) => s + N(o.total), 0);
  const manual = store.get(`fin.manual.${fin.days}`, '');
  const spend = t(adv).spend + t(mp).spend;
  const tracked = t(adv).revenue + t(mp).revenue + csOmzet;
  const real = N(manual) || tracked;
  const blended = spend ? real / spend : null;
  const rows = [...(adv?.byPlatform || []).map((p) => ({ ...p, team: 'Tim ADV' })), ...(mp?.byPlatform || []).map((p) => ({ ...p, team: 'Tim MP' }))];
  const daily = new Map();
  for (const d of [...(adv?.daily || []), ...(mp?.daily || [])]) {
    const x = daily.get(d.day) || { spend: 0, revenue: 0 };
    daily.set(d.day, { spend: x.spend + d.spend, revenue: x.revenue + d.revenue });
  }
  const days = [...daily].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-31);
  const max = Math.max(1, ...days.map(([, v]) => Math.max(v.spend, v.revenue)));
  body.innerHTML = `<div class="row-between"><p class="hint">Gabungan semua brand yang bisa kamu akses: iklan Meta/TikTok/Google (Tim ADV), iklan marketplace (Tim MP), dan order CS AI.</p>
      <select data-fin-days>${[[7, '7 hari'], [30, '30 hari'], [90, '90 hari']].map(([v, l]) => `<option value="${v}" ${v === fin.days ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="kpi-row">${[
      ['Total spend iklan', rp(spend), `ADV ${rp(t(adv).spend)} · MP ${rp(t(mp).spend)}`],
      ['ROAS iklan ADV', x2(t(adv).spend ? t(adv).revenue / t(adv).spend : null), `omzet pixel ${rp(t(adv).revenue)}`],
      ['ROAS marketplace', x2(t(mp).spend ? t(mp).revenue / t(mp).spend : null), `GMV ${rp(t(mp).revenue)}`],
      ['Omzet CS AI', rp(csOmzet), `${csOrders.length} order`],
      ['Blended ROAS', x2(blended), N(manual) ? 'dari omzet riil yang diisi' : 'dari omzet tercatat'],
    ].map(([l, v, s]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div><div class="kpi-sub">${s}</div></div>`).join('')}</div>
    <div class="grid-2"><div class="card"><div class="label">Spend vs omzet harian</div>
      ${days.length ? `<div class="fin-chart">${days.map(([d, v]) => `<div class="fin-day" title="${esc(d)} · spend ${rp(v.spend)} · omzet ${rp(v.revenue)}"><span class="fin-bar spend" style="height:${(v.spend / max) * 100}%"></span><span class="fin-bar rev" style="height:${(v.revenue / max) * 100}%"></span></div>`).join('')}</div>
        <div class="hint"><span class="fin-key spend"></span> spend <span class="fin-key rev"></span> omzet iklan · ${esc(days[0][0])} – ${esc(days.at(-1)[0])}</div>` : '<p class="hint">Belum ada data iklan harian. Hubungkan akun iklan di Tim ADV / Tim MP.</p>'}</div>
    <div class="card"><div class="label">Omzet riil (opsional)</div>
      <p class="hint">Pixel & marketplace hanya menangkap sebagian penjualan. Isi omzet riil periode ini (semua kanal: website, WhatsApp, marketplace, Lynk.id, dll.) supaya blended ROAS = omzet riil ÷ total spend.</p>
      <input data-fin-manual value="${esc(manual)}" placeholder="mis. 25000000">
      <table class="data"><tbody><tr><td>Omzet tercatat (pixel + GMV + CS AI)</td><td><b>${rp(tracked)}</b></td></tr><tr><td>Omzet riil dipakai</td><td><b>${rp(real)}</b></td></tr><tr><td>Total spend</td><td><b>${rp(spend)}</b></td></tr><tr><td>Laba kotor setelah iklan (sebelum HPP)</td><td><b>${rp(real - spend)}</b></td></tr></tbody></table></div></div>
    <div class="card"><div class="label">Per kanal iklan</div><div class="table-wrap"><table class="data"><thead><tr><th>Kanal</th><th>Tim</th><th>Spend</th><th>Omzet</th><th>ROAS</th><th>Konversi</th><th>CPA</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><b>${esc(r.key)}</b></td><td>${r.team}</td><td>${rp(r.spend)}</td><td>${rp(r.revenue)}</td><td>${x2(r.roas)}</td><td>${N(r.conversions).toLocaleString('id-ID')}</td><td>${rp(r.cpa)}</td></tr>`).join('') || '<tr><td colspan="7" class="hint">Belum ada akun iklan yang tersambung.</td></tr>'}
    </tbody></table></div></div>`;
}

// ---------- Kantor Virtual: ruang per tim, meja per agen, status dari log aktivitas ----------
const STATUS = { running: ['Berjalan', 'warn'], done: ['Selesai', 'ok'], failed: ['Gagal', 'bad'], idle: ['Siaga', 'ghost'] };
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'baru saja' : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };
function foOffice(body) {
  const log = activity();
  // Tugas "berjalan" yang tertinggal > 10 menit (tab ditutup di tengah jalan) dianggap gagal.
  const last = (id) => { const e = log.find((x) => x.agent === id); return e && e.status === 'running' && Date.now() - e.at > 600000 ? { ...e, status: 'failed', error: 'terputus' } : e; };
  const sel = fo.desk ? byId[fo.desk] : null;
  const rooms = Object.entries(TEAM).filter(([k]) => AGENTS.some((a) => a.team === k) || k === 'cs');
  const desk = (id, icon, name, sub, st, extra = '') => `<button class="vo-desk ${fo.desk === id ? 'active' : ''}" data-fo-desk="${id}" ${extra}>
      <span class="vo-avatar">${icon}<i class="vo-dot v-${STATUS[st][1]}"></i></span><b>${esc(name)}</b><span class="hint">${esc(sub)}</span></button>`;
  const running = log.filter((e) => e.status === 'running' && Date.now() - e.at <= 600000).length;
  body.innerHTML = `<div class="kpi-row">${[['Agen AI', AGENTS.length + (window.timCs?.agents() || []).length], ['Sedang berjalan', running], ['Tugas selesai', log.filter((e) => e.status === 'done').length], ['Gagal', log.filter((e) => e.status === 'failed').length]]
      .map(([l, v]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div></div>`).join('')}</div>
    <div class="vo-wrap"><div class="vo-floor">${rooms.map(([k, t]) => `<div class="vo-room"><div class="vo-room-head">${esc(t.icon)} ${esc(t.label)}</div><div class="vo-desks">
        ${AGENTS.filter((a) => a.team === k).map((a) => { const e = last(a.id); return desk(a.id, a.icon, a.name, e ? `${STATUS[e.status][0]} · ${ago(e.end || e.at)}` : 'Siaga', e?.status || 'idle'); }).join('')}
        ${k === 'cs' ? (window.timCs?.agents() || []).map((c) => desk(`cs:${c.id}`, '🤖', c.agent, c.active ? 'CS AI · aktif 24/7' : 'CS AI · nonaktif', c.active ? 'done' : 'idle', 'data-fo-go="closer"')).join('') : ''}
      </div></div>`).join('')}
      <div class="vo-room vo-meeting"><div class="vo-room-head">🎼 Ruang Conductor</div><div class="vo-desks">${desk('conductor', '🎼', 'Conductor', fo.plan ? 'Rencana terakhir siap' : 'Menunggu perintah', fo.busy ? 'running' : fo.plan ? 'done' : 'idle', 'data-fo-tab="conductor"')}</div></div></div>
    <div class="card vo-side">${sel ? `<div class="ag-head"><span class="ag-ic">${sel.icon}</span><div><h3>${esc(sel.name)}</h3><div class="hint">${esc(TEAM[sel.team].label)} · ${esc(sel.role)}</div></div></div>
        <div class="label">Tugas</div><p class="hint">${esc(sel.desc)}</p>
        <div class="label">Tools / input</div><div class="org-chips">${sel.fields.map((f) => `<span class="tag ghost">${esc(f.label)}</span>`).join('')}</div>
        <div class="label">Aktivitas</div>${log.filter((e) => e.agent === sel.id).slice(0, 8).map((e) => `<div class="vo-log"><span class="tag v-${STATUS[e.status][1]}">${STATUS[e.status][0]}</span> ${esc(e.title || '—')} <span class="hint">${ago(e.end || e.at)}${e.error ? ` · ${esc(e.error)}` : ''}</span></div>`).join('') || '<p class="hint">Belum ada aktivitas tercatat.</p>'}
        <div class="btn-row"><button class="primary" data-fo-agent="${sel.id}">Beri tugas →</button></div>`
      : `<div class="label">Log aktivitas terbaru</div>${log.slice(0, 12).map((e) => `<div class="vo-log"><span class="tag v-${STATUS[e.status][1]}">${STATUS[e.status][0]}</span> <b>${esc(byId[e.agent]?.name || e.agent)}</b> ${esc(e.title || '')} <span class="hint">${ago(e.end || e.at)}</span></div>`).join('') || '<p class="hint">Klik meja agen untuk melihat tugas, tools, dan aktivitasnya. Aktivitas muncul setelah agen dijalankan.</p>'}
        <p class="hint">Status mengikuti aktivitas yang tercatat untuk brand ini.</p>`}</div></div>`;
}

function foOrg(body) {
  const u = usage();
  const me = state.me?.user;
  body.innerHTML = `<div class="org">
    <div class="org-top"><div class="org-node lead"><span class="ag-ic">👤</span><div><b>${esc(me?.username || 'Owner')}</b><div class="hint">Operator / Founder</div></div></div>
      <div class="org-line"></div><div class="org-node conductor" data-fo-go="founder"><span class="ag-ic">🎼</span><div><b>Conductor</b><div class="hint">Membagi perintah ke tim & agen</div></div></div><div class="org-line"></div></div>
    <div class="org-teams">${Object.entries(TEAM).filter(([k]) => k !== 'founder').map(([k, t]) => {
      const agents = AGENTS.filter((a) => a.team === k);
      return `<div class="card org-team"><div class="org-th"><span class="ag-ic">${esc(t.icon)}</span><b>${esc(t.label)}</b>${k === 'cs' ? '<span class="tag">+ CS AI</span>' : ''}</div>
        <div class="label">Menu</div><div class="org-chips">${t.views.map(([v, l]) => `<button class="ghost small" data-fo-go="${v}">${esc(l)}</button>`).join('')}</div>
        ${agents.length ? `<div class="label">Agen AI (${agents.length})</div><div class="org-agents">${agents.map((a) => `<button class="org-agent" data-fo-agent="${a.id}"><span>${a.icon}</span> ${esc(a.name)}${u[a.id] ? ` <span class="hint">${u[a.id]}×</span>` : ''}</button>`).join('')}</div>` : ''}
        ${k === 'cs' ? `<div class="org-agents">${(window.timCs?.agents() || []).map((c) => `<button class="org-agent" data-fo-go="closer"><span>🤖</span> ${esc(c.agent)} (CS AI)</button>`).join('')}<span class="hint">${(window.timCs?.orders() || []).length} order AI</span></div>` : ''}
        <div class="hint">+ Master BCS (analisa laporan)</div></div>`;
    }).join('')}</div></div>`;
}
async function approveConductorProposal() {
  const proposalPlan = fo.plan;
  const proposals = proposalPlan?.proposals || {};
  if (!fo.catalogCanManage) return toast('Approval hanya untuk owner/admin');
  if (fo.proposalSaving) return;
  const requestBrandId = state.brandId;
  fo.proposalSaving = true; renderFounder();
  try {
    const catalog = await api('/api/conductor/catalog', json('POST', { teams: proposals.teams || [], agents: proposals.agents || [] }));
    const applied = await applyBrandScopedResponse(requestBrandId, () => state.brandId, catalog, (value) => {
      replaceCustomCatalog(value); fo.catalogBrandId = requestBrandId; fo.catalogError = '';
    }, async () => {
      fo.catalogBrandId = null; fo.catalogError = '';
      await loadConductorCatalog(true);
    });
    if (fo.plan === proposalPlan) proposalPlan.proposals = { teams: [], agents: [] };
    toast(applied ? 'Approval berhasil. Divisi dan agen tersedia di katalog brand ini.' : 'Approval tersimpan di brand sebelumnya; katalog brand aktif sudah dimuat ulang.');
  } catch (ex) { toast(ex.message); }
  finally { fo.proposalSaving = false; renderFounder(); }
}
function bindFounder() {
  const root = document.getElementById('view-founder');
  root.addEventListener('click', async (e) => {
    const d = e.target.closest('button')?.dataset || {};
    if (d.foTab) { fo.tab = d.foTab; renderFounder(); }
    if (d.foCatalogRetry !== undefined) { fo.catalogBrandId = null; fo.catalogError = ''; renderFounder(); }
    if (d.foApproveAgents !== undefined) approveConductorProposal();
    if (d.foEx) { const ta = $('[data-fo-cmd] textarea', root); ta.value = EXAMPLES[Number(d.foEx)]; ta.focus(); }
    if (d.foRun) { runConductorSteps([Number(d.foRun)]); }
    if (d.foRunAll !== undefined) runConductorSteps((fo.plan?.steps || []).map((_, i) => i));
    if (d.foResultPlan !== undefined) {
      const i = Number(d.foResultPlan); const step = fo.plan?.steps?.[i]; const result = fo.runs?.[i];
      if (result?.status === 'done' && result.text) taskCard({ team: byId[step.agent]?.team, title: `${byId[step.agent]?.name || 'Hasil agen'}: ${String(Object.values(step.values || {}).find(Boolean) || brand()?.name || 'hasil').slice(0, 45)}`, detail: `Dari Conductor (${byId[step.agent]?.name})\nPerintah: ${fo.cmd}\n\n${result.text}` }).then(() => toast('Hasil agen masuk ke Planner ✓')).catch((ex) => toast(ex.message));
    }
    if (d.foTask) { try { await taskCard(fo.plan.tasks[Number(d.foTask)]); toast('Kartu dibuat di kolom Ide ✓'); } catch (ex) { toast(ex.message); } }
    if (d.foAlltasks !== undefined) {
      try { for (const t of fo.plan.tasks) await taskCard(t); toast(`${fo.plan.tasks.length} kartu dibuat di Planner ✓`); } catch (ex) { toast(ex.message); }
    }
    if (d.foSched !== undefined) { store.set('fo.sched', [...store.get('fo.sched', []), fo.plan.schedule]); toast('Jadwal tersimpan'); renderFounder(); }
    if (d.foUnsched) { const s = store.get('fo.sched', []); s.splice(Number(d.foUnsched), 1); store.set('fo.sched', s); renderFounder(); }
    if (d.foBrief !== undefined) morningBrief(root, false);
    if (d.foBsend !== undefined) morningBrief(root, true);
    if (d.foDesk) { fo.desk = fo.desk === d.foDesk ? null : d.foDesk; if (!d.foDesk.startsWith('cs:') && d.foDesk !== 'conductor') renderFounder(); }
    if (d.foBcopy !== undefined) copy(fo.brief, 'Laporan pagi disalin');
    if (d.foGo) { if (d.foGo === 'founder') { fo.tab = 'conductor'; renderFounder(); } else S.show(d.foGo); }
    if (d.foAgent) openAgent(d.foAgent);
  });
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-fin-days]')) { fin.days = Number(e.target.value); renderFounder(); }
    if (e.target.matches('[data-fin-manual]')) { store.set(`fin.manual.${fin.days}`, e.target.value.trim()); renderFounder(); }
  });
  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.matches('[data-fo-bcfg]')) {
      try {
        foCfg = { ...foCfg, ...(await api('/api/founder/settings', json('PUT', readBriefCfg(e.target)))) };
        toast(foCfg.enabled ? `Laporan pagi aktif tiap ${String(foCfg.hour).padStart(2, '0')}.00 WIB` : 'Laporan pagi otomatis dimatikan');
        renderFounder();
      } catch (ex) { toast(ex.message); }
      return;
    }
    const t = $('textarea', e.target)?.value.trim();
    if (e.target.matches('[data-fo-cmd]') && t && !fo.busy) conduct(t);
  });
}

// ======================= PASANG =======================
const { viewHooks } = S;
const { withStore } = window.timStore;
viewHooks['agents-digital'] = withStore(renderDigital);
viewHooks['agents-adv'] = withStore(renderAdv);
viewHooks.founder = withStore(renderFounder);
bindAgents('agents-digital', renderDigital);
bindAgents('agents-adv', renderAdv);
bindFounder();
// Data per brand (CS AI, riwayat agen) ikut berganti sendiri: switchBrand memanggil show() → viewHooks di atas.

window.timAgents = { AGENTS, TEAM, openAgent, verdict, generate, chat, parseJson, brandCtx, toPlanner, loadConductorCatalog };
