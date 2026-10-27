// Studio Visual (12 tool → prompt builder) & template AI Studio (Tahap 5).
// Tampil di 3 tempat: tab "Prompt Builder" di Studio Visual, tab "Template Konten" di AI Studio,
// dan drawer geser di dalam kartu Planner (hasilnya langsung masuk ke kolom kartu yang sedang dibuka).
const S = window.siarin;
const { api, esc, state } = S;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* mode privat */ } },
};
const brand = () => state.brands.find((b) => b.id === state.brandId);
const copy = (text, msg = 'Disalin') => navigator.clipboard?.writeText(text).then(() => S.toast(msg)).catch(() => S.toast('Gagal menyalin'));

// =====================================================================
// 12 TOOL DESAIN
// =====================================================================
const STYLES = {
  minimal: 'clean minimalist, soft studio lighting, lots of negative space',
  bold: 'bold playful Gen-Z aesthetic, vibrant saturated colors, dynamic composition',
  premium: 'premium luxury look, dramatic soft shadows, elegant, high-end editorial',
  natural: 'natural organic feel, warm daylight, earthy textures, botanical props',
  korean: 'soft Korean aesthetic, pastel tones, dreamy glow, airy',
};
const STYLE_LABEL = { minimal: 'Minimalis clean', bold: 'Bold & playful', premium: 'Premium / luxury', natural: 'Natural / organik', korean: 'Soft Korean' };
const RATIOS = [['9:16', 'Story / Reels'], ['4:5', 'Feed'], ['1:1', 'Kotak'], ['16:9', 'Thumbnail YT']];
const F = {
  product: { k: 'product', label: 'Produk', ph: 'mis. Serum Vitamin C 30ml botol kaca amber', req: true },
  text: { k: 'text', label: 'Teks di gambar', ph: 'mis. GLOWING DALAM 14 HARI' },
  sub: { k: 'sub', label: 'Teks kecil / subjudul', ph: 'mis. Diskon 25% s/d Minggu' },
  scene: { k: 'scene', label: 'Latar / suasana', ph: 'mis. meja marmer putih, daun monstera, cahaya pagi' },
};
const TOOLS = [
  { id: 'product', icon: '📸', name: 'Product Shot', desc: 'Foto produk ala katalog', ratio: '4:5', fields: [F.product, F.scene, { k: 'angle', label: 'Sudut kamera', opts: ['eye-level hero shot', '45° three-quarter angle', 'top-down flat lay', 'macro close-up of texture'] }],
    build: (v) => `Professional product photography of ${v.product}, ${v.angle || 'eye-level hero shot'}, placed on ${v.scene || 'a seamless backdrop'}, sharp focus on the product, realistic reflections, commercial catalog quality` },
  { id: 'carousel', icon: '🗂', name: 'Carousel Cover', desc: 'Slide pertama yang bikin swipe', ratio: '4:5', fields: [F.text, F.sub, { k: 'topic', label: 'Topik carousel', ph: 'mis. 5 kesalahan pakai sunscreen' }],
    build: (v) => `Instagram carousel cover slide about "${v.topic || v.text}", big bold headline text "${v.text || v.topic}", small subtitle "${v.sub || 'Geser →'}", swipe arrow cue on the right edge, scroll-stopping layout, clear typographic hierarchy` },
  { id: 'beforeafter', icon: '↔️', name: 'Before-After', desc: 'Perbandingan sebelum & sesudah', ratio: '4:5', fields: [F.product, { k: 'before', label: 'Kondisi sebelum', ph: 'mis. kulit kusam, pori besar' }, { k: 'after', label: 'Kondisi sesudah', ph: 'mis. kulit cerah, halus' }, { k: 'days', label: 'Durasi', ph: 'mis. 14 hari' }],
    build: (v) => `Split-screen before and after comparison, left side labeled "SEBELUM" showing ${v.before || 'the problem'}, right side labeled "SESUDAH" showing ${v.after || 'the result'}${v.days ? ` after ${v.days}` : ''}, ${v.product} shown small in the corner, consistent lighting and pose on both sides, honest realistic look (no exaggerated retouching)` },
  { id: 'testimonial', icon: '💬', name: 'Testimonial Card', desc: 'Review pelanggan jadi visual', ratio: '1:1', fields: [{ k: 'quote', label: 'Kutipan review', ph: 'mis. "Bekas jerawatku pudar dalam 2 minggu!"', req: true }, { k: 'name', label: 'Nama / inisial', ph: 'mis. Rina, 24th · Bandung' }, { k: 'stars', label: 'Bintang', opts: ['5', '4'] }, F.product],
    build: (v) => `Customer testimonial social media card, large quotation marks, quote text ${v.quote}, reviewer name "${v.name || 'Pelanggan setia'}", ${v.stars || 5} gold stars rating, ${v.product ? `small product image of ${v.product}, ` : ''}trustworthy friendly design, readable typography` },
  { id: 'promo', icon: '🏷', name: 'Promo Banner', desc: 'Diskon, bundling, voucher', ratio: '1:1', fields: [F.product, { k: 'offer', label: 'Penawaran', ph: 'mis. DISKON 25% / Beli 2 Gratis 1', req: true }, { k: 'deadline', label: 'Batas waktu', ph: 'mis. s/d 31 Okt' }, { k: 'cta', label: 'CTA', ph: 'mis. Checkout sekarang' }],
    build: (v) => `Promotional sale banner for ${v.product || 'the product'}, huge offer text "${v.offer}", ${v.deadline ? `deadline badge "${v.deadline}", ` : ''}call-to-action button "${v.cta || 'Beli Sekarang'}", product hero image, high contrast, urgency, marketplace-ready layout` },
  { id: 'thumbnail', icon: '▶️', name: 'Thumbnail Hook', desc: 'Thumbnail / cover video', ratio: '16:9', fields: [F.text, { k: 'face', label: 'Ekspresi', opts: ['shocked surprised face', 'excited pointing', 'skeptical raised eyebrow', 'no person, product only'] }, F.product],
    build: (v) => `Video thumbnail, ${v.face || 'shocked surprised face'}${v.product ? ` next to ${v.product}` : ''}, giant 3-4 word hook text "${v.text || 'GAK NYANGKA!'}" with thick outline, high saturation, strong rim light, readable at small size, curiosity gap` },
  { id: 'infographic', icon: '📊', name: 'Infographic', desc: 'Edukasi poin per poin', ratio: '4:5', fields: [{ k: 'title', label: 'Judul', ph: 'mis. Urutan skincare pagi', req: true }, { k: 'points', label: 'Poin (1 per baris)', ph: 'Cleanser\nToner\nSerum Vit C\nMoisturizer\nSunscreen', area: true }],
    build: (v) => `Clean educational infographic titled "${v.title}", ${String(v.points || '').split('\n').filter(Boolean).length || 'several'} numbered steps: ${String(v.points || '').split('\n').filter(Boolean).map((p, i) => `${i + 1}. ${p.trim()}`).join(', ')}, simple icons for each step, vertical flow, generous spacing, easy to read on mobile` },
  { id: 'poll', icon: '🗳', name: 'Story Poll', desc: 'Background story interaktif', ratio: '9:16', fields: [{ k: 'question', label: 'Pertanyaan', ph: 'mis. Kamu tim kulit berminyak atau kering?', req: true }, { k: 'a', label: 'Pilihan A', ph: 'Berminyak' }, { k: 'b', label: 'Pilihan B', ph: 'Kering' }],
    build: (v) => `Instagram story background for an interactive poll, question text "${v.question}" in the upper third, two answer areas "${v.a || 'Ya'}" vs "${v.b || 'Tidak'}", leave empty space in the middle for the native poll sticker, playful engaging design` },
  { id: 'compare', icon: '⚖️', name: 'Comparison Table', desc: 'Produk kita vs yang lain', ratio: '4:5', fields: [F.product, { k: 'rival', label: 'Pembanding', ph: 'mis. Serum biasa', req: true }, { k: 'rows', label: 'Aspek (1 per baris)', ph: 'Kandungan Vit C 15%\nTekstur ringan\nHarga per ml', area: true }],
    build: (v) => `Side-by-side comparison table graphic, column "${v.product || 'Produk Kami'}" with green check marks vs column "${v.rival}" with grey crosses, rows: ${String(v.rows || '').split('\n').filter(Boolean).join('; ')}, our column highlighted, fair and factual tone, clean grid` },
  { id: 'packaging', icon: '📦', name: 'Packaging Mockup', desc: 'Mockup kemasan realistis', ratio: '1:1', fields: [F.product, { k: 'pack', label: 'Jenis kemasan', opts: ['dropper bottle', 'pouch standing bag', 'box carton', 'jar', 'tube'] }, { k: 'label', label: 'Teks di label', ph: 'mis. GLOWRIA · Vitamin C Serum' }],
    build: (v) => `Photorealistic packaging mockup of a ${v.pack || 'dropper bottle'} for ${v.product}, label text "${v.label || brand()?.name || 'BRAND'}", accurate materials and reflections, studio product lighting, front three-quarter view` },
  { id: 'lifestyle', icon: '🌿', name: 'Lifestyle Scene', desc: 'Produk dipakai sehari-hari', ratio: '4:5', fields: [F.product, { k: 'who', label: 'Model / persona', ph: 'mis. perempuan Indonesia 20-an, hijab' }, F.scene],
    build: (v) => `Authentic lifestyle photo of ${v.who || 'a young Indonesian woman'} using ${v.product} in ${v.scene || 'a cozy bedroom in the morning'}, candid natural moment, UGC-style realism, Indonesian setting, product clearly visible` },
  { id: 'flashsale', icon: '⚡', name: 'Flash Sale Poster', desc: 'Twin-date & flash sale', ratio: '9:16', fields: [{ k: 'event', label: 'Event', ph: 'mis. 11.11 / Payday / Flash Sale 12.00', req: true }, { k: 'offer', label: 'Penawaran', ph: 'mis. Up to 50% + Gratis Ongkir' }, { k: 'time', label: 'Jam / tanggal', ph: 'mis. Mulai 00.00 WIB' }, F.product],
    build: (v) => `Flash sale poster for "${v.event}", countdown clock motif, lightning bolt accents, giant text "${v.offer || 'DISKON BESAR'}", time badge "${v.time || 'Hari ini saja'}", ${v.product ? `${v.product} hero image, ` : ''}energetic red-orange-yellow urgency palette, marketplace campaign style` },
];

const builderState = { tool: store.get('timai.sbTool', 'product'), ratio: null, values: {}, style: 'minimal', color: null, ref: null };

function buildPrompt(tool, v, ratio) {
  const b = brand();
  const color = v.color || b?.color;
  const parts = [
    tool.build(v),
    STYLES[v.style || 'minimal'],
    color ? `brand accent color ${color}` : '',
    'Indonesian market, all on-image text in Bahasa Indonesia, spelled exactly as written',
    `aspect ratio ${ratio}`,
    builderState.ref ? 'use the attached reference image for product shape, label and colors' : '',
    'no watermark, no distorted text, no extra fingers',
  ];
  return parts.filter(Boolean).join('. ').replace(/\s+/g, ' ').trim();
}

// Render builder ke container. ctx.card = { id, notes(el) } di drawer; null di halaman Studio.
function renderBuilder(root, ctx = {}) {
  const tool = TOOLS.find((t) => t.id === builderState.tool) || TOOLS[0];
  const ratio = builderState.ratio || tool.ratio;
  const v = builderState.values[tool.id] ||= { style: builderState.style, topic: ctx.card?.title || '', title: ctx.card?.title || '' };
  root.innerHTML = `<div class="sb ${ctx.compact ? 'compact' : ''}">
    <div class="sbx-list">${TOOLS.map((t) => `<button type="button" class="sb-tool ${t.id === tool.id ? 'on' : ''}" data-sb-tool="${t.id}"><span class="sb-ic">${t.icon}</span><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div>
    <div class="sb-form card">
      <div class="row-between"><h3>${tool.icon} ${tool.name}</h3><span class="hint">${tool.desc}</span></div>
      <div class="sb-grid">
        ${tool.fields.map((f) => `<div class="${f.area ? 'span-2' : ''}"><label class="label">${f.label}${f.req ? ' *' : ''}</label>
          ${f.opts ? `<select data-sb-f="${f.k}">${f.opts.map((o) => `<option ${o === v[f.k] ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : f.area ? `<textarea rows="4" data-sb-f="${f.k}" placeholder="${esc(f.ph || '')}">${esc(v[f.k] || '')}</textarea>`
      : `<input data-sb-f="${f.k}" value="${esc(v[f.k] || '')}" placeholder="${esc(f.ph || '')}">`}</div>`).join('')}
        <div><label class="label">Gaya visual</label><select data-sb-f="style">${Object.entries(STYLE_LABEL).map(([k, l]) => `<option value="${k}" ${k === (v.style || 'minimal') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="label">Warna brand</label><input type="color" data-sb-f="color" value="${esc(v.color || brand()?.color || '#6366f1')}"></div>
      </div>
      <div class="label">Rasio</div>
      <div class="seg sb-ratio">${RATIOS.map(([r, l]) => `<button type="button" data-sb-ratio="${r}" aria-selected="${r === ratio}">${r}<span>${l}</span></button>`).join('')}</div>
      <div class="label">Gambar referensi (opsional)</div>
      <label class="sb-drop ${builderState.ref ? 'has' : ''}" data-sb-drop>
        <input type="file" accept="image/*" hidden data-sb-file>
        ${builderState.ref ? `<img src="${builderState.ref.url}" alt=""><span>${esc(builderState.ref.file.name)} <button type="button" class="link small" data-sb-unref>hapus</button></span>` : '<span>Klik atau seret foto produk / referensi desain ke sini</span>'}
      </label>
    </div>
    <div class="sb-out card">
      <div class="row-between"><div class="label">Prompt siap pakai</div><span class="hint" data-sb-len></span></div>
      <textarea rows="${ctx.compact ? 6 : 7}" data-sb-prompt spellcheck="false"></textarea>
      <div class="btn-row sb-actions">
        <button type="button" class="primary" data-sb-copy>Salin prompt</button>
        <a class="btn" href="https://chatgpt.com/" target="_blank" rel="noopener" data-sb-chatgpt>Buka ChatGPT ↗</a>
        ${ctx.card ? '' : '<button type="button" class="ghost ai" data-sb-gen>✨ Generate di TIM-AI</button>'}
        <button type="button" class="ghost" data-sb-save>${ctx.card ? '↧ Masukkan ke kartu ini' : 'Simpan ke kartu Planner'}</button>
      </div>
      <p class="hint">${builderState.ref ? 'Upload juga gambar referensi di ChatGPT/AI pilihanmu. ' : ''}Hasil gambarnya upload ke kartu Planner (Lampiran) supaya ikut terbawa saat dijadwalkan.</p>
    </div>
  </div>`;
  const out = $('[data-sb-prompt]', root);
  let edited = false;
  const refresh = () => {
    if (!edited) out.value = buildPrompt(tool, v, builderState.ratio || tool.ratio);
    $('[data-sb-len]', root).textContent = `${out.value.length} karakter`;
  };
  refresh();
  out.addEventListener('input', () => { edited = true; refresh(); });
  root.oninput = (e) => {
    const f = e.target.closest('[data-sb-f]');
    if (!f) return;
    v[f.dataset.sbF] = f.value;
    if (f.dataset.sbF === 'style') builderState.style = f.value;
    edited = false;
    refresh();
  };
  root.onchange = (e) => {
    const file = e.target.closest('[data-sb-file]')?.files?.[0];
    if (file) setRef(file);
  };
  const setRef = (file) => {
    if (!file.type.startsWith('image/')) return S.toast('Referensi harus gambar');
    if (builderState.ref) URL.revokeObjectURL(builderState.ref.url);
    builderState.ref = { file, url: URL.createObjectURL(file) };
    renderBuilder(root, ctx);
  };
  const drop = $('[data-sb-drop]', root);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); const f = e.dataTransfer.files?.[0]; if (f) setRef(f); });
  root.onclick = async (e) => {
    const t = e.target.closest('[data-sb-tool]');
    if (t) { builderState.tool = t.dataset.sbTool; builderState.ratio = null; store.set('timai.sbTool', builderState.tool); renderBuilder(root, ctx); return; }
    const r = e.target.closest('[data-sb-ratio]');
    if (r) { builderState.ratio = r.dataset.sbRatio; $$('[data-sb-ratio]', root).forEach((b) => b.setAttribute('aria-selected', String(b === r))); edited = false; refresh(); return; }
    if (e.target.closest('[data-sb-unref]')) { e.preventDefault(); URL.revokeObjectURL(builderState.ref.url); builderState.ref = null; renderBuilder(root, ctx); return; }
    const missing = tool.fields.find((f) => f.req && !String(v[f.k] || '').trim());
    if (e.target.closest('[data-sb-copy], [data-sb-gen], [data-sb-save], [data-sb-chatgpt]') && missing) {
      e.preventDefault();
      S.toast(`Isi "${missing.label}" dulu`);
      $(`[data-sb-f="${missing.k}"]`, root)?.focus();
      return;
    }
    if (e.target.closest('[data-sb-copy]')) copy(out.value, 'Prompt disalin. Tempel di ChatGPT / Gemini / AI gambar pilihanmu.');
    if (e.target.closest('[data-sb-chatgpt]')) copy(out.value, 'Prompt disalin, tempel di ChatGPT');
    if (e.target.closest('[data-sb-gen]')) sendToGenerate(out.value, builderState.ratio || tool.ratio);
    if (e.target.closest('[data-sb-save]')) saveToCard(ctx, `[Studio · ${tool.name} · ${builderState.ratio || tool.ratio}]\n${out.value}`);
  };
}
// Kirim ke tab "✨ Generate AI" bawaan (ai-hub.js): isi prompt + rasio setelah panelnya tergambar.
function sendToGenerate(prompt, ratio) {
  const btn = $('#studio-tabs [data-studio=gen]');
  if (!btn) return S.toast('Tab Generate AI belum tersedia');
  btn.click();
  let n = 0;
  const fill = () => {
    const p = $('#md-prompt');
    if (!p) { if (n++ < 40) setTimeout(fill, 150); else S.toast('Generate AI butuh API key gambar (Pengaturan → AI & API Keys)'); return; }
    p.value = prompt;
    const a = $('#md-aspect');
    if (a && [...a.options].some((o) => o.value === ratio || o.text === ratio)) a.value = ratio;
    p.scrollIntoView({ behavior: 'smooth', block: 'center' });
    S.toast('Prompt dipindah ke Generate AI. Pilih model lalu klik Generate.');
  };
  setTimeout(fill, 100);
}
async function saveToCard(ctx, note) {
  if (ctx.card) {
    // Di drawer: tulis ke kolom Catatan di form yang terbuka (jangan PATCH supaya tombol Simpan tidak menimpa).
    const el = $('#cf-notes');
    if (el) { el.value = `${el.value ? `${el.value}\n\n` : ''}${note}`; el.dispatchEvent(new Event('input', { bubbles: true })); }
    if (builderState.ref && ctx.card.id && S.uploadAsset) {
      try { await S.uploadAsset(ctx.card.id, builderState.ref.file, () => {}); S.toast('Prompt masuk Catatan + referensi diunggah ke Lampiran. Klik Simpan di kartu.'); } catch (ex) { S.toast(ex.message); }
    } else S.toast('Prompt dimasukkan ke Catatan kartu. Klik Simpan di kartu.');
    return;
  }
  const cards = await api('/api/content').catch(() => []);
  const open = cards.filter((c) => !['tayang'].includes(c.status));
  S.openModal(`<form id="sb-card-form"><h3>Simpan ke kartu Planner</h3>
    <label class="label" for="sb-card">Kartu</label>
    <select id="sb-card"><option value="new">+ Buat kartu baru (Ide)</option>${open.map((c) => `<option value="${c.id}">${esc(c.title)} · ${esc(c.status)}</option>`).join('')}</select>
    <label class="label" for="sb-title">Judul kartu baru</label><input id="sb-title" placeholder="mis. Banner promo payday serum">
    <p class="hint">Prompt ditambahkan ke Catatan kartu${builderState.ref ? ', gambar referensi diunggah ke Lampiran' : ''}.</p>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  const sel = $('#sb-card');
  const syncTitle = () => { $('#sb-title').closest('form').querySelector('label[for=sb-title]').hidden = $('#sb-title').hidden = sel.value !== 'new'; };
  sel.addEventListener('change', syncTitle);
  syncTitle();
  $('#sb-card-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      let id = sel.value === 'new' ? null : Number(sel.value);
      if (!id) {
        const title = $('#sb-title').value.trim();
        if (!title) return S.toast('Isi judul kartu');
        id = (await api('/api/content', json('POST', { title, status: 'ide', platforms: [], notes: note }))).id;
      } else {
        const c = await api(`/api/content/${id}`);
        await api(`/api/content/${id}`, json('PATCH', { notes: `${c.notes ? `${c.notes}\n\n` : ''}${note}` }));
      }
      if (builderState.ref && S.uploadAsset) await S.uploadAsset(id, builderState.ref.file, () => {});
      S.closeModal();
      S.toast('Tersimpan ke kartu Planner');
    } catch (ex) { S.toast(ex.message); }
  };
}

// =====================================================================
// TEMPLATE AI STUDIO
// =====================================================================
let aiCfg = null;
async function aiRoute() {
  if (aiCfg) return aiCfg;
  const s = await api('/api/ai/status').catch(() => null);
  if (s?.routed) aiCfg = { provider: s.routed.provider, model: s.routed.model };
  else if (s?.enabled) aiCfg = { provider: s.provider, model: s.provider === 'gemini' ? s.gemini?.model : s.model };
  else aiCfg = { off: true };
  return aiCfg;
}
async function ask(prompt) {
  const r = await aiRoute();
  if (r.off) throw new Error('AI belum aktif. Isi API key di Pengaturan → AI & API Keys.');
  const b = brand();
  const system = `Kamu copywriter & content strategist media sosial Indonesia (TikTok, Instagram, YouTube Shorts). Bahasa Indonesia santai sesuai target audiens, tidak lebay, tidak membuat klaim medis/berlebihan yang tidak bisa dibuktikan.${b ? ` Brand: ${b.name}.` : ''}${b?.description ? ` Profil brand: ${b.description}` : ''} Jawab HANYA dengan JSON valid sesuai format yang diminta, tanpa teks lain.`;
  const res = await api('/api/ai/chat', json('POST', { provider: r.provider, model: r.model, system, prompt, temperature: 0.9, max_tokens: 2000 }));
  return parseJson(res.text || '');
}
function parseJson(text) {
  const t = String(text).replace(/```json|```/g, '');
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start < 0 || end < start) throw new Error('Format jawaban AI tidak terbaca. Coba lagi.');
  return JSON.parse(t.slice(start, end + 1));
}
const TEMPLATES = [
  { id: 'hook', icon: '🎣', name: 'Hook 3 Detik', desc: 'Kalimat pembuka yang bikin berhenti scroll',
    fields: [{ k: 'topic', label: 'Topik / produk', ph: 'mis. serum vit C untuk kulit kusam', req: true }, { k: 'audience', label: 'Target audiens', ph: 'mis. mahasiswi 18-24, kulit berminyak' }, { k: 'platform', label: 'Platform', opts: ['TikTok', 'Instagram Reels', 'YouTube Shorts'] }, { k: 'n', label: 'Jumlah', opts: ['8', '5', '12'] }],
    prompt: (v) => `Buat ${v.n || 8} hook 3 detik pertama untuk video ${v.platform || 'TikTok'} tentang: ${v.topic}. Target: ${v.audience || 'umum'}. Variasikan jenisnya (Pertanyaan, POV, Angka/Listicle, Kontroversial, Rahasia/Curiosity, Before-After, Kesalahan umum, Relatable). Format: {"hooks":[{"type":"...","hook":"kalimat yang diucapkan ≤ 12 kata","visual":"apa yang terlihat di 3 detik pertama","text_overlay":"teks di layar ≤ 6 kata"}]}`,
    render: (r) => (r.hooks || []).map((h, i) => ({ title: h.hook, meta: h.type, body: `🎬 ${h.visual || ''}${h.text_overlay ? `\n🔤 ${h.text_overlay}` : ''}`, use: { hook: h.hook }, i })) },
  { id: 'story', icon: '📖', name: 'Storytelling Script', desc: 'Script lengkap per adegan',
    fields: [{ k: 'topic', label: 'Topik / produk', ph: 'mis. pengalaman pertama pakai serum vit C', req: true }, { k: 'framework', label: 'Kerangka', opts: ['PAS (Problem-Agitate-Solution)', 'Before-After-Bridge', 'AIDA', "Hero's Journey mini", 'Hook-Story-Offer'] }, { k: 'duration', label: 'Durasi', opts: ['30 detik', '15 detik', '60 detik'] }, { k: 'cta', label: 'CTA', ph: 'mis. klik keranjang kuning' }],
    prompt: (v) => `Tulis script video vertikal ${v.duration || '30 detik'} dengan kerangka ${v.framework || 'PAS'} tentang: ${v.topic}. CTA: ${v.cta || 'cek link di bio'}. Format: {"title":"judul konten","hook":"kalimat 3 detik pertama","scenes":[{"time":"0-3s","say":"narasi/dialog","visual":"shot & aksi","text":"teks di layar"}],"cta":"kalimat penutup","caption":"caption singkat + 3-5 hashtag"}`,
    render: (r) => [{ title: r.title || 'Script', meta: 'script lengkap', body: [`🎣 HOOK: ${r.hook || ''}`, ...(r.scenes || []).map((s) => `[${s.time}] ${s.say}\n   🎬 ${s.visual || ''}${s.text ? `  🔤 ${s.text}` : ''}`), `📣 CTA: ${r.cta || ''}`].join('\n\n'), use: { hook: r.hook, script: [...(r.scenes || []).map((s) => `[${s.time}] ${s.say}\n(visual: ${s.visual || '-'}${s.text ? ` · teks: ${s.text}` : ''})`), `CTA: ${r.cta || ''}`].join('\n\n'), caption: r.caption, title: r.title }, i: 0 }] },
  { id: 'caption', icon: '✍️', name: 'Caption & Hashtag', desc: 'Optimasi caption + set hashtag',
    fields: [{ k: 'draft', label: 'Draft caption / poin utama', ph: 'mis. serum baru, tekstur ringan, cocok kulit berminyak, promo 25%', area: true, req: true }, { k: 'platform', label: 'Platform', opts: ['Instagram', 'TikTok', 'YouTube Shorts'] }, { k: 'goal', label: 'Tujuan', opts: ['Penjualan', 'Engagement (komen & share)', 'Edukasi / save'] }],
    prompt: (v) => `Optimalkan caption ${v.platform || 'Instagram'} dengan tujuan ${v.goal || 'Penjualan'} dari draft ini: """${v.draft}""". Buat 3 variasi (pendek, storytelling, listicle). Baris pertama harus hook kuat. Format: {"variants":[{"style":"...","caption":"caption lengkap dengan emoji secukupnya dan CTA"}],"hashtags":{"broad":["#..."],"niche":["#..."],"brand":["#..."]},"first_comment":"komentar pertama untuk memancing diskusi"}`,
    render: (r) => {
      const tags = r.hashtags ? [...(r.hashtags.broad || []), ...(r.hashtags.niche || []), ...(r.hashtags.brand || [])].join(' ') : '';
      return [...(r.variants || []).map((x, i) => ({ title: x.caption.split('\n')[0], meta: x.style, body: `${x.caption}${tags ? `\n\n${tags}` : ''}`, use: { caption: `${x.caption}${tags ? `\n\n${tags}` : ''}` }, i })),
        ...(r.first_comment ? [{ title: 'Komentar pertama', meta: 'first comment', body: r.first_comment, use: null, i: 99 }] : []),
        ...(r.hashtags ? [{ title: 'Set hashtag', meta: 'broad · niche · brand', body: `Broad: ${(r.hashtags.broad || []).join(' ')}\nNiche: ${(r.hashtags.niche || []).join(' ')}\nBrand: ${(r.hashtags.brand || []).join(' ')}`, use: null, i: 98 }] : [])];
    } },
  { id: 'remix', icon: '🔀', name: 'Angle Remix', desc: '1 topik menang → 5 angle baru',
    fields: [{ k: 'topic', label: 'Konten / topik yang menang', ph: 'mis. video "3 kesalahan pakai sunscreen" 400rb views', req: true }, { k: 'why', label: 'Kenapa menang (opsional)', ph: 'mis. banyak yang komen merasa relate, banyak save' }],
    prompt: (v) => `Konten ini performanya bagus: ${v.topic}.${v.why ? ` Alasannya: ${v.why}.` : ''} Remix jadi 5 konten baru dengan ANGLE berbeda (mis. POV, mitos vs fakta, storytelling pelanggan, tutorial, perbandingan/eksperimen, trend audio) supaya tidak terasa repetitif tapi tetap memanfaatkan topik yang sama. Format: {"angles":[{"angle":"nama angle","title":"judul kartu","hook":"hook 3 detik","format":"Reels|Video pendek|Carousel|Story|Live","pillar":"Edukasi|Hiburan|Inspirasi|Promo","why":"kenapa angle ini berpotensi"}]}`,
    render: (r) => (r.angles || []).map((a, i) => ({ title: a.title, meta: `${a.angle} · ${a.format || ''} · ${a.pillar || ''}`, body: `🎣 ${a.hook}\n💡 ${a.why || ''}`, use: { hook: a.hook, title: a.title }, card: { title: a.title, hook: a.hook, format: a.format, pillar: a.pillar, notes: `Angle: ${a.angle}\n${a.why || ''}`, status: 'ide', platforms: [] }, i })) },
];
const tplState = { id: store.get('timai.tpl', 'hook'), values: {}, results: {} };

function renderTemplates(root, ctx = {}) {
  const tpl = TEMPLATES.find((t) => t.id === tplState.id) || TEMPLATES[0];
  const v = tplState.values[tpl.id] ||= { topic: ctx.card?.title || '', draft: ctx.card?.caption || '' };
  root.innerHTML = `<div class="tp ${ctx.compact ? 'compact' : ''}">
    <div class="tp-tabs">${TEMPLATES.map((t) => `<button type="button" class="tp-tab ${t.id === tpl.id ? 'on' : ''}" data-tp="${t.id}"><span>${t.icon}</span><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}</div>
    <form class="card tp-form" data-tp-form>
      <div class="sb-grid">${tpl.fields.map((f) => `<div class="${f.area ? 'span-2' : ''}"><label class="label">${f.label}${f.req ? ' *' : ''}</label>
        ${f.opts ? `<select data-tp-f="${f.k}">${f.opts.map((o) => `<option ${o === v[f.k] ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : f.area ? `<textarea rows="3" data-tp-f="${f.k}" placeholder="${esc(f.ph || '')}">${esc(v[f.k] || '')}</textarea>`
      : `<input data-tp-f="${f.k}" value="${esc(v[f.k] || '')}" placeholder="${esc(f.ph || '')}">`}</div>`).join('')}</div>
      <div class="row-between"><span class="hint" data-tp-route></span><button class="primary ai" data-tp-run>✨ Buat dengan AI</button></div>
    </form>
    <div data-tp-out></div>
  </div>`;
  aiRoute().then((r) => { const el = $('[data-tp-route]', root); if (el) el.innerHTML = r.off ? '<span class="status st-failed">AI belum aktif</span> <button type="button" class="link" data-goto="aikeys">Isi API key</button>' : `Pakai ${esc(r.provider)} · <code>${esc(r.model || '')}</code>`; });
  const out = $('[data-tp-out]', root);
  const draw = () => {
    const list = tplState.results[tpl.id];
    if (!list) { out.innerHTML = ''; return; }
    out.innerHTML = `${tpl.id === 'remix' && !ctx.card ? `<div class="row-between tp-bulk"><span class="hint">${list.length} angle siap</span><button type="button" class="primary" data-tp-bulk>Buat ${list.length} kartu Ide di Planner</button></div>` : ''}
      <div class="tp-results">${list.map((x, i) => `<div class="tp-res card"><div class="tp-res-head"><span class="pill info">${esc(x.meta || '')}</span>
        <div class="btn-row"><button type="button" class="ghost small" data-tp-copy="${i}">Salin</button>
        ${x.use ? `<button type="button" class="ghost small" data-tp-use="${i}">${ctx.card ? '↧ Pakai di kartu' : '+ Kartu baru'}</button>` : ''}</div></div>
        <b class="tp-res-title">${esc(x.title || '')}</b><pre class="tp-res-body">${esc(x.body || '')}</pre></div>`).join('')}</div>`;
  };
  draw();
  root.oninput = (e) => { const f = e.target.closest('[data-tp-f]'); if (f) v[f.dataset.tpF] = f.value; };
  root.onchange = root.oninput;
  root.onsubmit = async (e) => {
    e.preventDefault();
    const missing = tpl.fields.find((f) => f.req && !String(v[f.k] || '').trim());
    if (missing) { S.toast(`Isi "${missing.label}" dulu`); $(`[data-tp-f="${missing.k}"]`, root)?.focus(); return; }
    const btn = $('[data-tp-run]', root);
    btn.disabled = true;
    btn.textContent = 'AI lagi menulis…';
    out.innerHTML = '<div class="tp-results">' + '<div class="tp-res card"><div class="sk sk-l"></div><div class="sk sk-xl"></div><div class="sk sk-m"></div></div>'.repeat(3) + '</div>';
    try {
      tplState.results[tpl.id] = tpl.render(await ask(tpl.prompt(v)));
      if (!tplState.results[tpl.id].length) throw new Error('AI tidak mengembalikan hasil. Coba lagi.');
      S.toast('Hasil AI siap');
    } catch (ex) { out.innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; btn.disabled = false; btn.textContent = '✨ Buat dengan AI'; return; }
    btn.disabled = false;
    btn.textContent = '↻ Buat ulang';
    draw();
  };
  root.onclick = async (e) => {
    const t = e.target.closest('[data-tp]');
    if (t) { tplState.id = t.dataset.tp; store.set('timai.tpl', tplState.id); renderTemplates(root, ctx); return; }
    const list = tplState.results[tpl.id] || [];
    const c = e.target.closest('[data-tp-copy]');
    if (c) copy(list[Number(c.dataset.tpCopy)].body);
    const u = e.target.closest('[data-tp-use]');
    if (u) useResult(list[Number(u.dataset.tpUse)], ctx, u);
    const bulk = e.target.closest('[data-tp-bulk]');
    if (bulk) {
      bulk.disabled = true;
      try {
        await api('/api/content/bulk', json('POST', { items: list.map((x) => x.card).filter(Boolean) }));
        bulk.textContent = 'Tersimpan ✓';
        S.toast(`${list.length} kartu Ide dibuat di Planner`);
      } catch (ex) { bulk.disabled = false; S.toast(ex.message); }
    }
  };
}
async function useResult(x, ctx, btn) {
  if (ctx.card) {
    // Drawer: isi kolom form kartu yang terbuka (hook/script/caption), judul hanya kalau masih kosong.
    const map = { hook: '#cf-hook', script: '#cf-script', caption: '#cf-caption' };
    const done = [];
    for (const [k, sel] of Object.entries(map)) {
      const el = $(sel);
      if (x.use[k] && el) { el.value = x.use[k]; el.dispatchEvent(new Event('input', { bubbles: true })); done.push(k); }
    }
    if (x.use.title && $('#cf-title') && !$('#cf-title').value.trim()) { $('#cf-title').value = x.use.title; done.push('judul'); }
    S.toast(`Masuk ke kartu: ${done.join(', ')}. Klik Simpan di kartu.`);
    btn.textContent = 'Terpakai ✓';
    return;
  }
  btn.disabled = true;
  try {
    const body = x.card || { title: x.use.title || x.title.slice(0, 80), hook: x.use.hook || '', script: x.use.script || '', caption: x.use.caption || '', status: 'ide', platforms: [] };
    await api('/api/content', json('POST', body));
    btn.textContent = 'Kartu dibuat ✓';
    S.toast('Kartu Ide dibuat di Planner');
  } catch (ex) { btn.disabled = false; S.toast(ex.message); }
}

// =====================================================================
// PEMASANGAN
// =====================================================================
// 1) Studio Visual: tab "Prompt Builder" (default), iframe lama tetap ada sebagai "Studio klasik".
const studioTabs = $('#studio-tabs');
if (studioTabs) {
  const oldTab = $('[data-studio=tools]', studioTabs);
  if (oldTab) oldTab.textContent = 'Studio klasik';
  studioTabs.insertAdjacentHTML('afterbegin', '<button data-studio="builder">🧰 12 Tool · Prompt Builder</button>');
  const host = document.createElement('div');
  host.id = 'studio-builder';
  $('#studio-tools').before(host);
  const panes = () => ['#studio-tools', '#studio-lp', '#studio-gen'].map((s) => $(s)).filter(Boolean);
  const openBuilder = () => {
    $$('button', studioTabs).forEach((b) => b.classList.toggle('active', b.dataset.studio === 'builder'));
    panes().forEach((p) => { p.hidden = true; });
    host.hidden = false;
    renderBuilder(host);
  };
  studioTabs.addEventListener('click', (e) => {
    const t = e.target.closest('[data-studio]')?.dataset.studio;
    if (!t) return;
    if (t === 'builder') { e.stopImmediatePropagation(); openBuilder(); store.set('timai.studioTab', 'builder'); return; }
    host.hidden = true;
    store.set('timai.studioTab', t);
    if (t === 'tools') { const f = $('#studio-frame'); if (f && !f.getAttribute('src')) f.src = '/studio/'; }
  }, true);
  $('#studio-tools .hint')?.insertAdjacentHTML('afterbegin', '<b>Studio klasik</b> (app terpisah). Versi baru yang terhubung ke Planner ada di tab <b>12 Tool · Prompt Builder</b>. ');
  const baseStudio = S.viewHooks.studio;
  S.viewHooks.studio = () => {
    if (store.get('timai.studioTab', 'builder') === 'builder') openBuilder(); else baseStudio?.();
  };
  if ($('#view-studio')?.classList.contains('active')) S.viewHooks.studio();
}

// 2) AI Studio: tab "Template Konten".
const aiTabs = $('#ai-tabs');
if (aiTabs) {
  aiTabs.insertAdjacentHTML('afterbegin', '<button data-tpl-tab>🧲 Template Konten</button>');
  aiTabs.addEventListener('click', (e) => {
    const mine = e.target.closest('[data-tpl-tab]');
    if (!mine) return;
    e.stopImmediatePropagation();
    $$('button', aiTabs).forEach((b) => b.classList.toggle('active', b === mine));
    $('#ai-output').innerHTML = '';
    renderTemplates($('#ai-panel'));
  }, true);
}

// 3) Drawer di kartu Planner.
const drawer = document.createElement('aside');
drawer.className = 'cdrawer';
drawer.hidden = true;
drawer.setAttribute('aria-label', 'Studio & AI untuk kartu ini');
drawer.innerHTML = `<div class="cd-head"><div class="seg" id="cd-seg"><button type="button" data-cd="studio">🎨 Studio Visual</button><button type="button" data-cd="ai">✨ Template AI</button></div>
  <button type="button" class="icon-btn" data-cd-close aria-label="Tutup">✕</button></div>
  <div class="cd-sub hint" id="cd-sub"></div><div class="cd-body" id="cd-body"></div>`;
document.body.append(drawer);
const cdState = { tab: 'ai' };
function cardCtx() {
  const form = $('#content-form');
  if (!form) return null;
  // id kartu: dari tombol hapus (hanya ada untuk kartu tersimpan) atau dari kartu terakhir yang diklik.
  return { id: lastCardId, title: $('#cf-title')?.value || '', caption: $('#cf-caption')?.value || '' };
}
let lastCardId = null;
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-content]');
  if (c && !e.target.closest('#content-form')) lastCardId = Number(c.dataset.content) || null;
  if (e.target.matches('[data-add-content]') || e.target.id === 'planner-add') lastCardId = null;
}, true);
function openDrawer(tab) {
  const ctx = cardCtx();
  if (!ctx) return;
  cdState.tab = tab || cdState.tab;
  $$('[data-cd]', drawer).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cd === cdState.tab)));
  $('#cd-sub').textContent = ctx.title ? `Untuk kartu: ${ctx.title}` : 'Kartu baru (isi judul dulu supaya AI lebih paham konteksnya)';
  drawer.hidden = false;
  document.body.classList.add('cd-open');
  const body = $('#cd-body');
  if (cdState.tab === 'studio') renderBuilder(body, { card: ctx, compact: true });
  else renderTemplates(body, { card: ctx, compact: true });
}
function closeDrawer() { drawer.hidden = true; document.body.classList.remove('cd-open'); }
drawer.addEventListener('click', (e) => {
  if (e.target.closest('[data-cd-close]')) return closeDrawer();
  const t = e.target.closest('[data-cd]');
  if (t) openDrawer(t.dataset.cd);
});
// Esc menutup drawer dulu (sebelum modal kartu).
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden && !$('.ds-pop')) { e.stopImmediatePropagation(); closeDrawer(); } }, true);
// Tutup drawer kalau modal kartu ditutup.
const modal = $('#modal');
new MutationObserver(() => { if (modal.hidden || !$('#content-form')) closeDrawer(); }).observe(modal, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: false });
// Sisipkan tombol di form kartu setiap kali modal kartu dibuka.
new MutationObserver(() => {
  const form = $('#content-form');
  if (!form || form.querySelector('.cf-assist')) return;
  const head = form.querySelector('.row-between');
  head?.insertAdjacentHTML('afterend', `<div class="cf-assist"><span class="hint">Asisten:</span>
    <button type="button" class="ghost small ai" data-cd-open="ai">✨ Hook · Script · Caption</button>
    <button type="button" class="ghost small" data-cd-open="studio">🎨 Prompt visual</button></div>`);
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-cd-open]'); if (b) openDrawer(b.dataset.cdOpen); });
}).observe($('#modal-box'), { childList: true });
