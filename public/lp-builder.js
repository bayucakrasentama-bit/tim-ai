// LP Builder (tab di Studio Visual): landing page dari blok-blok section.
// - Pratinjau langsung (desktop/HP) dan bisa diedit langsung dengan klik teks di pratinjau.
// - Hasil: HTML utuh (satu file, siap upload ke hosting mana pun) dan JSON (bisa diimpor lagi / diedit tim lain).
// - Bisa diisi AI dari brief, di-scrap dari link LP referensi, diimpor dari Launch Lab, dan diterbitkan di /p/<alamat>.
// - Template dari referensi: impor HTML atau tempel link landing page jadi (desain sendiri), edit teks/gambar/link, lalu AI menyesuaikan ke produk lain.
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const $ = (sel) => document.querySelector(sel);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const FONTS = ['Inter', 'Poppins', 'Plus Jakarta Sans', 'DM Sans', 'Montserrat', 'Playfair Display'];
const TYPES = {
  hero: 'Hero (judul utama)', problem: 'Masalah', benefits: 'Manfaat', features: 'Fitur', steps: 'Langkah / cara kerja',
  testimonials: 'Testimoni', offer: 'Penawaran & harga', faq: 'FAQ', cta: 'Ajakan (CTA)', text: 'Teks bebas', image: 'Gambar', html: 'HTML kustom',
};
const blank = (type) => ({ type, heading: '', subheading: '', body: '', items: [], cta_text: '', cta_url: '', image_url: '' });
const STARTER = () => ({
  title: 'Landing page baru',
  description: '',
  theme: { primary: '#5b4bdb', accent: '#f59e0b', background: '#ffffff', text: '#1c2030', font: 'Plus Jakarta Sans' },
  sections: [
    { ...blank('hero'), heading: 'Headline: hasil yang didapat pembeli', subheading: 'Satu-dua kalimat penjelas untuk siapa dan kenapa sekarang.', cta_text: 'Pesan Sekarang', cta_url: 'https://wa.me/' },
    { ...blank('problem'), heading: 'Masalah yang sering dialami', items: [{ title: 'Masalah 1', text: '' }, { title: 'Masalah 2', text: '' }, { title: 'Masalah 3', text: '' }] },
    { ...blank('benefits'), heading: 'Kenapa pilih kami', items: [{ title: 'Manfaat 1', text: 'Penjelasan singkat' }, { title: 'Manfaat 2', text: 'Penjelasan singkat' }, { title: 'Manfaat 3', text: 'Penjelasan singkat' }] },
    { ...blank('offer'), heading: 'Paket Hemat', subheading: 'Rp149.000', body: 'Harga normal Rp199.000 · Garansi 7 hari', items: [{ title: 'Isi paket 1', text: '' }, { title: 'Bonus', text: '' }], cta_text: 'Ambil Promo', cta_url: 'https://wa.me/' },
    { ...blank('faq'), heading: 'Pertanyaan yang sering ditanya', items: [{ title: 'Pertanyaan?', text: 'Jawaban.' }] },
    { ...blank('cta'), heading: 'Siap mulai hari ini?', subheading: 'Klik tombol di bawah, tim kami bantu sampai beres.', cta_text: 'Chat Sekarang', cta_url: 'https://wa.me/' },
  ],
});

let pages = [];
let cur = null; // { id, name, data, slug, published }
let dirty = false;
let device = 'desktop';
let editInPreview = true;
let openIdx = 0;

// ---------------- Renderer (dipakai pratinjau, unduh HTML, dan halaman terbit) ----------------
const safeUrl = (u) => (/^(https?:|mailto:|tel:|#)/i.test(String(u || '').trim()) ? String(u).trim() : '#');
const safeImg = (u) => (/^(https?:|data:image\/)/i.test(String(u || '').trim()) ? String(u).trim() : '');
const hex = (c, d) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : d);

function renderLp(data, { editable = false } = {}) {
  const t = { primary: '#5b4bdb', accent: '#f59e0b', background: '#ffffff', text: '#1c2030', font: 'Plus Jakarta Sans', ...(data.theme || {}) };
  const font = FONTS.includes(t.font) ? t.font : 'Plus Jakarta Sans';
  const ed = (path) => (editable ? ` data-edit="${path}"` : '');
  const txt = (v, path, tag = 'span', cls = '') => (v || editable ? `<${tag}${cls ? ` class="${cls}"` : ''}${ed(path)}>${esc(v || '')}</${tag}>` : '');
  const cta = (s, i) => (s.cta_text ? `<a class="btn" href="${esc(safeUrl(s.cta_url))}"${ed(`s.${i}.cta_text`)}>${esc(s.cta_text)}</a>` : '');
  const items = (s, i, cls) => `<div class="${cls}">${(s.items || []).map((it, j) => `<div class="item">${txt(it.title, `s.${i}.items.${j}.title`, 'h3')}${txt(it.text, `s.${i}.items.${j}.text`, 'p')}</div>`).join('')}</div>`;
  const sec = (s, i) => {
    const head = `${txt(s.heading, `s.${i}.heading`, 'h2')}${txt(s.subheading, `s.${i}.subheading`, 'p', 'sub')}`;
    switch (s.type) {
      case 'hero': return `<header class="hero"><div class="wrap">${txt(s.heading, `s.${i}.heading`, 'h1')}${txt(s.subheading, `s.${i}.subheading`, 'p', 'sub')}${txt(s.body, `s.${i}.body`, 'p')}${cta(s, i)}${safeImg(s.image_url) ? `<img class="hero-img" src="${esc(safeImg(s.image_url))}" alt="">` : ''}</div></header>`;
      case 'problem': return `<section class="problem"><div class="wrap">${head}<ul class="x-list">${(s.items || []).map((it, j) => `<li>${txt(it.title, `s.${i}.items.${j}.title`, 'b')} ${txt(it.text, `s.${i}.items.${j}.text`)}</li>`).join('')}</ul>${txt(s.body, `s.${i}.body`, 'p', 'note')}</div></section>`;
      case 'benefits': case 'features': return `<section class="${s.type}"><div class="wrap">${head}${items(s, i, 'grid')}${cta(s, i)}</div></section>`;
      case 'steps': return `<section class="steps"><div class="wrap">${head}${items(s, i, 'grid numbered')}${cta(s, i)}</div></section>`;
      case 'testimonials': return `<section class="testi"><div class="wrap">${head}<div class="grid">${(s.items || []).map((it, j) => `<figure class="item">${txt(it.text, `s.${i}.items.${j}.text`, 'blockquote')}${txt(it.title, `s.${i}.items.${j}.title`, 'figcaption')}</figure>`).join('')}</div></div></section>`;
      case 'offer': return `<section class="offer"><div class="wrap"><div class="offer-card">${txt(s.heading, `s.${i}.heading`, 'h2')}${txt(s.subheading, `s.${i}.subheading`, 'div', 'price')}${txt(s.body, `s.${i}.body`, 'p', 'note')}<ul class="v-list">${(s.items || []).map((it, j) => `<li>${txt(it.title, `s.${i}.items.${j}.title`, 'b')} ${txt(it.text, `s.${i}.items.${j}.text`)}</li>`).join('')}</ul>${cta(s, i)}</div></div></section>`;
      case 'faq': return `<section class="faq"><div class="wrap">${head}${(s.items || []).map((it, j) => `<details${editable ? ' open' : ''}><summary${ed(`s.${i}.items.${j}.title`)}>${esc(it.title)}</summary>${txt(it.text, `s.${i}.items.${j}.text`, 'p')}</details>`).join('')}</div></section>`;
      case 'cta': return `<section class="cta"><div class="wrap">${head}${txt(s.body, `s.${i}.body`, 'p')}${cta(s, i)}</div></section>`;
      case 'image': return `<section class="image"><div class="wrap">${safeImg(s.image_url) ? `<img src="${esc(safeImg(s.image_url))}" alt="${esc(s.heading)}">` : (editable ? '<div class="ph">Isi link gambar di panel kiri</div>' : '')}${txt(s.heading, `s.${i}.heading`, 'p', 'caption')}</div></section>`;
      case 'html': return `<section class="custom">${s.body || ''}</section>`;
      default: return `<section class="text"><div class="wrap">${head}${String(s.body || '').split(/\n{2,}/).map((p, j) => (j === 0 ? txt(p, `s.${i}.body`, 'p') : `<p>${esc(p)}</p>`)).join('')}</div></section>`;
    }
  };
  const css = `*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:'${font}',system-ui,sans-serif;background:${hex(t.background, '#fff')};color:${hex(t.text, '#1c2030')};line-height:1.6}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}section,header{padding:64px 0}h1{font-size:clamp(30px,5vw,52px);line-height:1.1;margin:0 0 16px;letter-spacing:-.02em}
h2{font-size:clamp(24px,3.4vw,36px);line-height:1.2;margin:0 0 12px;letter-spacing:-.01em}h3{margin:0 0 6px;font-size:18px}.sub{font-size:18px;opacity:.8;margin:0 0 24px}
.hero{background:linear-gradient(160deg,${hex(t.primary, '#5b4bdb')}18,transparent 60%);text-align:center;padding:96px 0 72px}.hero .sub{max-width:680px;margin:0 auto 28px}
.hero-img{display:block;max-width:100%;margin:36px auto 0;border-radius:18px;box-shadow:0 20px 60px -20px rgba(0,0,0,.35)}
.btn{display:inline-block;background:${hex(t.primary, '#5b4bdb')};color:#fff;text-decoration:none;font-weight:700;padding:15px 30px;border-radius:999px;margin-top:8px;box-shadow:0 10px 30px -10px ${hex(t.primary, '#5b4bdb')};transition:transform .15s}.btn:hover{transform:translateY(-2px)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px;margin:24px 0}.item{background:rgba(127,127,127,.07);border:1px solid rgba(127,127,127,.15);border-radius:16px;padding:22px}
.item p{margin:0;opacity:.85}.numbered{counter-reset:n}.numbered .item:before{counter-increment:n;content:counter(n);display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:${hex(t.accent, '#f59e0b')};color:#fff;font-weight:800;margin-bottom:10px}
.x-list,.v-list{list-style:none;padding:0;margin:20px 0}.x-list li,.v-list li{padding:10px 0 10px 34px;position:relative;border-bottom:1px solid rgba(127,127,127,.15)}
.x-list li:before{content:'✕';position:absolute;left:4px;color:#e04848;font-weight:800}.v-list li:before{content:'✓';position:absolute;left:4px;color:#17915a;font-weight:800}
.problem,.steps{background:rgba(127,127,127,.05)}.testi blockquote{margin:0 0 12px;font-size:16px}.testi figcaption{font-weight:700;opacity:.8}.testi figure{margin:0}
.offer-card{max-width:560px;margin:0 auto;text-align:center;border:2px solid ${hex(t.primary, '#5b4bdb')};border-radius:24px;padding:36px 28px;background:rgba(127,127,127,.04)}
.price{font-size:44px;font-weight:800;color:${hex(t.primary, '#5b4bdb')};margin:6px 0}.offer .v-list{text-align:left}.note{opacity:.75}
.faq details{border-bottom:1px solid rgba(127,127,127,.2);padding:14px 0}.faq summary{font-weight:700;cursor:pointer}.faq p{margin:8px 0 0;opacity:.85}
.cta{text-align:center;background:${hex(t.primary, '#5b4bdb')};color:#fff}.cta .btn{background:#fff;color:${hex(t.primary, '#5b4bdb')}}.image img{width:100%;border-radius:18px}.caption{text-align:center;opacity:.7}
.ph{border:2px dashed rgba(127,127,127,.4);border-radius:16px;padding:60px;text-align:center;opacity:.6}footer{text-align:center;padding:28px;font-size:13px;opacity:.6}
@media(max-width:640px){section,header{padding:44px 0}.hero{padding:64px 0 48px}.price{font-size:36px}}
${editable ? '[data-edit]{outline:1px dashed transparent;border-radius:4px;transition:outline-color .15s}[data-edit]:hover{outline-color:rgba(91,75,219,.6)}[data-edit]:focus{outline:2px solid #5b4bdb;outline-offset:2px}' : ''}`;
  const edScript = editable ? `<script>
document.querySelectorAll('[data-edit]').forEach(function(el){el.contentEditable='true';el.spellcheck=false;
el.addEventListener('input',function(){parent.postMessage({lpEdit:el.dataset.edit,value:el.innerText},'*')});
el.addEventListener('blur',function(){parent.postMessage({lpEditDone:true},'*')});
el.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&el.tagName!=='P'&&el.tagName!=='BLOCKQUOTE'){e.preventDefault();el.blur()}})});
document.addEventListener('click',function(e){var a=e.target.closest('a,summary');if(a)e.preventDefault()},true);
</script>` : '';
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.title || 'Landing page')}</title>
<meta name="description" content="${esc(data.description || '')}">
<meta name="generator" content="TIM-AI LP Builder">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;600;700;800&display=swap">
<style>${css}</style>
</head>
<body>
${(data.sections || []).map(sec).join('\n')}
<footer>© ${new Date().getFullYear()} ${esc(data.title || '')}</footer>
<script type="application/json" id="lp-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
${edScript}
</body>
</html>`;
}

// ---------------- Data helpers ----------------
function setPath(path, value) {
  const parts = path.split('.');
  let o = cur.data;
  if (parts[0] === 's') { o = cur.data.sections; parts.shift(); }
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
}
const itemsToText = (items) => (items || []).map((it) => (it.text ? `${it.title} | ${it.text}` : it.title)).join('\n');
const textToItems = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [title, ...rest] = l.split('|'); return { title: title.trim(), text: rest.join('|').trim() }; });
function normalize(d) {
  if (isTpl(d)) return { kind: 'template', title: String(d.title || ''), description: String(d.description || ''), html: String(d.html || '') };
  const base = STARTER();
  return {
    title: String(d?.title || base.title), description: String(d?.description || ''),
    theme: { ...base.theme, ...(d?.theme || {}) },
    sections: (Array.isArray(d?.sections) ? d.sections : base.sections).map((s) => ({ ...blank(TYPES[s?.type] ? s.type : 'text'), ...s, items: Array.isArray(s?.items) ? s.items.map((it) => ({ title: String(it?.title ?? ''), text: String(it?.text ?? '') })) : [] })),
  };
}
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const fileBase = () => (cur.slug || cur.name || 'landing-page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'landing-page';

// ---------------- Template dari referensi (HTML desain sendiri) ----------------
// data = { kind: 'template', title, description, html }. Desain & HTML asli tidak diubah: yang diedit cuma teks, gambar, dan link.
// tplDoc = HTML yang sudah di-parse (skrip tidak jalan); tiap elemen berteks diberi data-tpl, tiap gambar data-tpl-img.
let tplDoc = null;
const isTpl = (d) => d?.kind === 'template';
const SVG_NS = 'http://www.w3.org/2000/svg';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TEMPLATE', 'IFRAME']);

function parseTemplate(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let n = 0;
  let m = 0;
  const walk = (el, inside) => {
    for (const c of el.children) {
      if (SKIP_TAGS.has(c.tagName) || c.namespaceURI === SVG_NS) continue;
      if (c.tagName === 'IMG') c.setAttribute('data-tpl-img', m++);
      const hasText = [...c.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim());
      if (!inside && hasText) { c.setAttribute('data-tpl', n++); walk(c, true); } else walk(c, inside);
    }
  };
  walk(doc.body, false);
  return doc;
}
// HTML bersih (tanpa penanda editor) untuk disimpan, diunduh, dan diterbitkan.
function tplHtml() {
  const root = tplDoc.documentElement.cloneNode(true);
  root.querySelectorAll('[data-tpl], [data-tpl-img]').forEach((el) => { el.removeAttribute('data-tpl'); el.removeAttribute('data-tpl-img'); });
  return `<!doctype html>\n${root.outerHTML}`;
}
function syncTpl() {
  cur.data.html = tplHtml();
  cur.data.title = tplDoc.title;
  markDirty();
}
// Impor HTML referensi: buang bagian khusus tampilan pembuatnya (panel ekspor, modal) seperti saat referensi itu diekspor.
function templateFromHtml(html, name) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('[data-noexport]:not([data-noexport="keep-in-export"])').forEach((el) => el.remove());
  return { kind: 'template', title: doc.title || name, description: doc.querySelector('meta[name=description]')?.content || '', html: `<!doctype html>\n${doc.documentElement.outerHTML}` };
}

// Pratinjau editor: HTML bertanda + skrip kecil untuk edit teks (contenteditable) dan klik gambar.
const TPL_EDIT_SCRIPT = `<script>(function(){
var st=document.createElement('style');st.textContent='[data-tpl]{outline:1px dashed transparent;outline-offset:2px;border-radius:3px;transition:outline-color .15s}[data-tpl]:hover{outline-color:rgba(91,75,219,.65)}[data-tpl]:focus{outline:2px solid #5b4bdb}[data-tpl-img]{cursor:pointer}[data-tpl-img]:hover{outline:3px solid #f59e0b;outline-offset:-3px}';document.head.appendChild(st);
document.querySelectorAll('[data-tpl]').forEach(function(el){el.contentEditable='true';el.spellcheck=false;
el.addEventListener('input',function(){parent.postMessage({tplEdit:+el.getAttribute('data-tpl'),html:el.innerHTML},'*')});});
document.addEventListener('click',function(e){var img=e.target.closest('[data-tpl-img]');if(img){e.preventDefault();e.stopPropagation();parent.postMessage({tplImg:+img.getAttribute('data-tpl-img')},'*');return}
if(e.target.closest('a'))e.preventDefault()},true);
window.addEventListener('message',function(e){if(e.data&&e.data.setImg!=null){var im=document.querySelector('[data-tpl-img="'+e.data.setImg+'"]');if(im){im.src=e.data.src;im.removeAttribute('srcset')}}});
})();<\/script>`;
function tplPreviewHtml() {
  const html = `<!doctype html>\n${tplDoc.documentElement.outerHTML}`;
  if (!editInPreview) return tplHtml();
  return html.includes('</body>') ? html.replace(/<\/body>(?![\s\S]*<\/body>)/, `${TPL_EDIT_SCRIPT}</body>`) : html + TPL_EDIT_SCRIPT;
}

// Link tombol (WA, marketplace, checkout): dikelompokkan per alamat supaya sekali ganti, semua tombol ikut.
const linkKind = (h) => (/wa\.me|whatsapp\.com/i.test(h) ? 'WhatsApp' : /shopee/i.test(h) ? 'Shopee' : /tokopedia/i.test(h) ? 'Tokopedia' : /tiktok/i.test(h) ? 'TikTok Shop' : /lazada/i.test(h) ? 'Lazada' : /^tel:/i.test(h) ? 'Telepon' : /^mailto:/i.test(h) ? 'Email' : 'Link');
function tplLinks() {
  const map = new Map();
  tplDoc.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href');
    if (!h || h.startsWith('#') || /^javascript:/i.test(h)) return;
    map.set(h, (map.get(h) || 0) + 1);
  });
  return [...map.entries()];
}
function replaceLink(from, to) {
  tplDoc.querySelectorAll('a[href]').forEach((a) => { if (a.getAttribute('href') === from) a.setAttribute('href', to); });
}

function drawTemplateEditor() {
  const d = cur.data;
  const imgs = [...tplDoc.querySelectorAll('[data-tpl-img]')];
  const links = tplLinks();
  $('#lpb-side').innerHTML = `
    <div class="lpb-group"><span class="tag">Template dari referensi</span>
      <p class="hint">Desain asli dipertahankan. Klik teks di pratinjau untuk mengedit, klik gambar untuk mengganti.</p>
      <button class="primary ai" id="tpl-ai" type="button">✨ Sesuaikan ke produk lain (AI)</button></div>
    <div class="lpb-group"><label class="label" for="lpb-name">Nama halaman</label><input id="lpb-name" value="${esc(cur.name)}">
      <label class="label" for="tpl-title">Judul tab browser / SEO</label><input id="tpl-title" value="${esc(tplDoc.title)}">
      <label class="label" for="tpl-desc">Deskripsi SEO</label><input id="tpl-desc" value="${esc(tplDoc.querySelector('meta[name=description]')?.content || '')}"></div>
    <details class="lpb-group" open><summary class="label">Link tombol (${links.length})</summary>
      ${links.map(([h, n], i) => `<label class="label" for="tpl-link-${i}">${linkKind(h)} · ${n} tombol</label><input id="tpl-link-${i}" data-tpl-link="${esc(h)}" value="${esc(h)}" spellcheck="false">`).join('') || '<p class="hint">Tidak ada link.</p>'}</details>
    <details class="lpb-group"><summary class="label">Gambar (${imgs.length})</summary>
      <div class="tpl-imgs">${imgs.map((im) => `<button type="button" class="tpl-img" data-tpl-pick="${im.getAttribute('data-tpl-img')}" title="${esc(im.getAttribute('alt') || 'Ganti gambar')}"><img src="${esc(im.getAttribute('src') || '')}" alt=""></button>`).join('')}</div></details>
    <div class="btn-row left"><button class="ghost small" id="tpl-dup" type="button">⧉ Duplikat jadi halaman baru</button><button class="ghost small" id="tpl-code" type="button">&lt;/&gt; Edit HTML</button></div>`;
}

// Ganti gambar: link https, atau upload (diperkecil & dikompres jadi WebP tertanam).
async function shrinkImage(file, max = 1400) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.82);
}
function imageModal(i) {
  const im = tplDoc.querySelector(`[data-tpl-img="${i}"]`);
  if (!im) return;
  const alt = im.getAttribute('alt') || '';
  openModal(`<form id="tpl-img-form"><h3>Ganti gambar</h3>
    <img class="tpl-img-big" src="${esc(im.getAttribute('src') || '')}" alt="">
    <label class="label" for="tpl-img-file">Upload gambar baru</label><input id="tpl-img-file" type="file" accept="image/*">
    <label class="label" for="tpl-img-url">…atau link gambar (https://)</label><input id="tpl-img-url" placeholder="https://">
    <label class="label" for="tpl-img-alt">Teks alt (deskripsi gambar)</label><input id="tpl-img-alt" value="${esc(alt)}">
    <p class="hint">Belum punya gambarnya? ${S.gemini?.button('image', { text: `Foto produk untuk landing page: ${alt}`, label: 'Buat di Gemini Images', cls: 'link' }) || ''}</p>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Pakai</button></div></form>`);
  $('#tpl-img-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = $('#tpl-img-file').files[0];
    const url = $('#tpl-img-url').value.trim();
    let src = '';
    try {
      if (file) src = await shrinkImage(file);
      else if (url) {
        if (!/^https:\/\//i.test(url)) throw new Error('Link gambar harus https://');
        src = url;
      }
    } catch (ex) { return toast(ex.message); }
    if (src) { im.setAttribute('src', src); im.removeAttribute('srcset'); $('#lpb-frame')?.contentWindow?.postMessage({ setImg: i, src }, '*'); }
    im.setAttribute('alt', $('#tpl-img-alt').value);
    syncTpl();
    closeModal();
    drawTemplateEditor();
  });
}

function codeModal() {
  openModal(`<form id="tpl-code-form" class="wide"><h3>Edit HTML template</h3>
    <textarea id="tpl-code-area" rows="22" class="mono" spellcheck="false">${esc(tplHtml())}</textarea>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary">Terapkan</button></div></form>`);
  $('#tpl-code-form').addEventListener('submit', (e) => {
    e.preventDefault();
    tplDoc = parseTemplate($('#tpl-code-area').value);
    syncTpl();
    closeModal();
    drawShell();
  });
}

// Potongan teks untuk AI. Ikon SVG di dalam teks diganti penanda ⟦n⟧ (hemat token & tidak dirusak AI), lalu dipasang lagi.
function tplSegments() {
  const segs = [];
  const icons = {};
  tplDoc.querySelectorAll('[data-tpl]').forEach((el) => {
    const id = `s${el.getAttribute('data-tpl')}`;
    const clone = el.cloneNode(true);
    const svgs = [];
    clone.querySelectorAll('svg').forEach((svg) => { svg.replaceWith(`⟦${svgs.length}⟧`); svgs.push(svg.outerHTML); });
    clone.querySelectorAll('[data-tpl-img]').forEach((x) => x.removeAttribute('data-tpl-img'));
    const html = clone.innerHTML.trim();
    if (!clone.textContent.replace(/⟦\d+⟧/g, '').trim()) return;
    icons[id] = svgs;
    segs.push({ id, html });
  });
  segs.push({ id: 'title', html: tplDoc.title });
  const desc = tplDoc.querySelector('meta[name=description]');
  if (desc?.content) segs.push({ id: 'description', html: desc.content });
  tplDoc.querySelectorAll('[data-tpl-img]').forEach((im) => { if (im.getAttribute('alt')) segs.push({ id: `alt${im.getAttribute('data-tpl-img')}`, html: im.getAttribute('alt') }); });
  const wa = tplLinks().map(([h]) => h).find((h) => /wa\.me|whatsapp\.com/i.test(h));
  const waText = wa && new URL(wa, location.href).searchParams.get('text');
  if (waText) segs.push({ id: 'wa', html: waText });
  return { segs, icons };
}
const cleanAiHtml = (h) => String(h || '').replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?(<\/\s*\1\s*>|$)/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '');

function applyAi(items, icons, { wa, shop }) {
  const byId = Object.fromEntries(items.map((x) => [x.id, x.html]));
  tplDoc.querySelectorAll('[data-tpl]').forEach((el) => {
    const id = `s${el.getAttribute('data-tpl')}`;
    if (byId[id] === undefined) return;
    const svgs = icons[id] || [];
    let html = cleanAiHtml(byId[id]);
    const used = new Set();
    html = html.replace(/⟦(\d+)⟧/g, (_, n) => { used.add(Number(n)); return svgs[n] || ''; });
    // Ikon yang hilang dari jawaban AI dipasang lagi di depan teks.
    const lost = svgs.filter((_, n) => !used.has(n)).join('');
    const imgs = [...el.querySelectorAll('[data-tpl-img]')].map((x) => x.outerHTML).join('');
    el.innerHTML = lost + html + (html.includes('<img') ? '' : imgs);
  });
  if (byId.title) tplDoc.title = cleanAiHtml(byId.title).replace(/<[^>]+>/g, '');
  const desc = tplDoc.querySelector('meta[name=description]');
  if (desc && byId.description) desc.setAttribute('content', byId.description.replace(/<[^>]+>/g, '').slice(0, 300));
  tplDoc.querySelectorAll('[data-tpl-img]').forEach((im) => { const a = byId[`alt${im.getAttribute('data-tpl-img')}`]; if (a !== undefined) im.setAttribute('alt', a.replace(/<[^>]+>/g, '')); });
  // Link: nomor WA baru (+ pesan otomatis baru), dan link marketplace/checkout baru.
  const waText = byId.wa ? byId.wa.replace(/<[^>]+>/g, '') : '';
  tplLinks().forEach(([h]) => {
    if (/wa\.me|whatsapp\.com/i.test(h)) {
      const u = new URL(h, location.href);
      const num = wa ? wa.replace(/\D/g, '').replace(/^0/, '62') : (u.pathname.match(/\d{6,}/)?.[0] || u.searchParams.get('phone') || '');
      const text = waText || u.searchParams.get('text') || '';
      replaceLink(h, `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`);
    } else if (shop && /shopee|tokopedia|tiktok|lazada|blibli|bukalapak/i.test(h)) replaceLink(h, shop);
  });
}

function tplAiModal() {
  openModal(`<form id="tpl-ai-form"><h3>✨ Sesuaikan template ke produk lain</h3>
    <p class="hint">AI menulis ulang semua teks halaman ini untuk produkmu, desain & tata letak tetap sama. Gambar produk ganti sendiri setelahnya (klik gambar di pratinjau).</p>
    <label class="label" for="tai-name">Nama produk</label><input id="tai-name" required placeholder="mis. Madu Habbatussauda Zestbee">
    <label class="label" for="tai-brief">Brief produk</label>
    <textarea id="tai-brief" rows="6" required placeholder="Untuk siapa, masalah yang diselesaikan, kandungan/fitur, cara pakai, isi paket, harga & promo, izin (BPOM/Halal) kalau ada, garansi. Makin lengkap makin sedikit placeholder [..]."></textarea>
    <div class="form-grid"><div><label class="label" for="tai-wa">Nomor WhatsApp admin</label><input id="tai-wa" placeholder="62812xxxx (kosong = tetap)"></div>
      <div><label class="label" for="tai-shop">Link marketplace / checkout</label><input id="tai-shop" placeholder="https://shopee.co.id/... (kosong = tetap)"></div></div>
    <label class="label" for="tai-tone">Gaya bahasa (opsional)</label><input id="tai-tone" placeholder="mis. santai ke ibu muda, atau formal ke profesional">
    <label class="toggle"><input type="checkbox" id="tai-new" checked> Simpan sebagai halaman baru (referensi asli tetap utuh)</label>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary" id="tai-go">Buat</button></div></form>`);
  $('#tpl-ai-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#tai-go');
    btn.disabled = true;
    btn.textContent = 'AI lagi nulis… (±30-90 detik)';
    const { segs, icons } = tplSegments();
    try {
      const r = await api('/api/lp-pages/ai-rewrite', json('POST', {
        product: $('#tai-name').value, brief: $('#tai-brief').value, tone: $('#tai-tone').value, old_product: tplDoc.title, segments: segs,
      }));
      const asNew = $('#tai-new').checked;
      const product = $('#tai-name').value.trim();
      if (asNew && dirty) await save(true);
      applyAi(r.items, icons, { wa: $('#tai-wa').value.trim(), shop: $('#tai-shop').value.trim() });
      const data = { ...cur.data, html: tplHtml(), title: tplDoc.title, description: tplDoc.querySelector('meta[name=description]')?.content || '' };
      closeModal();
      if (asNew) {
        const p = await api('/api/lp-pages', json('POST', { name: `LP ${product}`, data }));
        await loadPages(p.id);
      } else {
        cur.data = data;
        markDirty();
        drawShell();
      }
      const ph = (data.html.match(/\[[^\]<>]{3,60}\]/g) || []).length;
      toast(`Draft untuk ${product} siap${ph ? ` · ${ph} placeholder [..] perlu diisi` : ''}. Ganti gambar produknya, lalu Simpan.`);
    } catch (ex) {
      toast(ex.message);
      btn.disabled = false;
      btn.textContent = 'Coba lagi';
    }
  });
}

const pageHtml = () => (isTpl(cur.data) ? tplHtml() : renderLp(cur.data));
function ensureTpl() {
  if (isTpl(cur.data) && tplDoc?.forData !== cur.data) {
    tplDoc = parseTemplate(cur.data.html);
    tplDoc.forData = cur.data;
  }
}

// ---------------- UI ----------------
function preview() {
  const f = $('#lpb-frame');
  if (!f) return;
  f.srcdoc = isTpl(cur.data) ? tplPreviewHtml() : renderLp(cur.data, { editable: editInPreview });
}
const markDirty = () => {
  dirty = true;
  const b = $('#lpb-save');
  if (b) b.textContent = 'Simpan *';
};

function sectionEditor(s, i) {
  const field = (k, label, tag = 'input', extra = '') => (tag === 'textarea'
    ? `<label class="label">${label}</label><textarea rows="3" data-f="${k}" ${extra}>${esc(s[k] || '')}</textarea>`
    : `<label class="label">${label}</label><input data-f="${k}" value="${esc(s[k] || '')}" ${extra}>`);
  const withItems = ['problem', 'benefits', 'features', 'steps', 'testimonials', 'offer', 'faq'].includes(s.type);
  const itemHint = { testimonials: 'Satu per baris: Nama, kota | kutipan', faq: 'Satu per baris: Pertanyaan | Jawaban', offer: 'Isi paket / bonus, satu per baris', problem: 'Satu masalah per baris (opsional: | penjelasan)' }[s.type] || 'Satu per baris: Judul | penjelasan';
  return `<details class="lpb-sec" data-i="${i}" ${i === openIdx ? 'open' : ''}><summary><span class="tag">${esc(TYPES[s.type] || s.type)}</span> ${esc((s.heading || s.cta_text || '').slice(0, 40)) || '<span class="hint">(kosong)</span>'}
    <span class="lpb-sec-act"><button type="button" class="icon-btn" data-sec-up="${i}" title="Naik">↑</button><button type="button" class="icon-btn" data-sec-down="${i}" title="Turun">↓</button>
    <button type="button" class="icon-btn" data-sec-dup="${i}" title="Duplikat">⧉</button><button type="button" class="icon-btn" data-sec-del="${i}" title="Hapus">✕</button></span></summary>
    <label class="label">Jenis blok</label><select data-f="type">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${k === s.type ? 'selected' : ''}>${l}</option>`).join('')}</select>
    ${s.type === 'html' ? field('body', 'HTML kustom (boleh &lt;style&gt; &amp; &lt;script&gt;, jalan di halaman terbit)', 'textarea', 'rows="8" spellcheck="false" class="mono"') : `
    ${s.type !== 'image' ? field('heading', s.type === 'offer' ? 'Nama paket' : 'Judul') : field('heading', 'Keterangan gambar')}
    ${['image'].includes(s.type) ? '' : field('subheading', s.type === 'offer' ? 'Harga' : 'Subjudul')}
    ${['hero', 'problem', 'offer', 'cta', 'text'].includes(s.type) ? field('body', s.type === 'offer' ? 'Harga coret / garansi' : 'Paragraf', 'textarea') : ''}
    ${withItems ? `<label class="label">Isi (${itemHint})</label><textarea rows="5" data-items>${esc(itemsToText(s.items))}</textarea>` : ''}
    ${['hero', 'image'].includes(s.type) ? field('image_url', 'Link gambar (https://…)') : ''}
    ${['hero', 'benefits', 'features', 'steps', 'offer', 'cta'].includes(s.type) ? `<div class="form-grid">${field('cta_text', 'Teks tombol')}${field('cta_url', 'Link tombol (WA/checkout)')}</div>` : ''}`}
  </details>`;
}

function drawEditor() {
  if (isTpl(cur.data)) return drawTemplateEditor();
  const d = cur.data;
  $('#lpb-side').innerHTML = `
    <div class="lpb-group"><label class="label" for="lpb-name">Nama halaman</label><input id="lpb-name" value="${esc(cur.name)}">
      <label class="label" for="lpb-title">Judul tab browser / SEO</label><input id="lpb-title" value="${esc(d.title)}">
      <label class="label" for="lpb-desc">Deskripsi SEO</label><input id="lpb-desc" value="${esc(d.description)}"></div>
    <details class="lpb-group"><summary class="label">Tema: warna &amp; font</summary>
      <div class="palette">${[['primary', 'Utama'], ['accent', 'Aksen'], ['background', 'Latar'], ['text', 'Teks']].map(([k, l]) => `<label class="swatch"><input type="color" data-theme="${k}" value="${esc(hex(d.theme[k], '#888888'))}"><span>${l}</span></label>`).join('')}</div>
      <select data-theme="font">${FONTS.map((f) => `<option ${f === d.theme.font ? 'selected' : ''}>${f}</option>`).join('')}</select></details>
    <div class="label">Blok halaman (${d.sections.length})</div>
    <div id="lpb-secs">${d.sections.map(sectionEditor).join('')}</div>
    <div class="btn-row left"><select id="lpb-addtype">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="ghost" id="lpb-add">+ Tambah blok</button></div>`;
}

function drawShell() {
  ensureTpl();
  const live = cur.published && cur.slug;
  $('#studio-lp').innerHTML = `
  <div class="lpb-bar">
    <select id="lpb-pick" aria-label="Pilih halaman">${pages.map((p) => `<option value="${p.id}" ${p.id === cur.id ? 'selected' : ''}>${esc(p.name)}${p.published ? ' · terbit' : ''}</option>`).join('')}</select>
    <button class="ghost small" id="lpb-new">+ Baru</button>
    <button class="primary small" id="lpb-save">Simpan</button>
    <span class="lpb-sep"></span>
    <button class="ghost small" id="lpb-ai">✨ ${isTpl(cur.data) ? 'Sesuaikan produk (AI)' : 'Isi dengan AI'}</button>
    <button class="ghost small" id="lpb-scrape" title="Tempel link landing page referensi">🔗 Scrap dari link</button>
    ${isTpl(cur.data) ? '' : '<button class="ghost small" id="lpb-launch">Ambil dari Launch Lab</button>'}
    <label class="btn small" title="HTML landing page jadi (referensi) atau file JSON/HTML dari LP Builder">Impor referensi HTML / JSON<input type="file" id="lpb-import" accept=".json,.html,application/json,text/html" hidden></label>
    <span class="lpb-sep"></span>
    <button class="ghost small" id="lpb-dl-html">⬇ HTML</button>
    <button class="ghost small" id="lpb-dl-json">⬇ JSON</button>
    <button class="ghost small" id="lpb-pub">${live ? 'Terbit ✓' : 'Terbitkan'}</button>
    ${live ? `<a class="btn small" href="/p/${esc(cur.slug)}" target="_blank" rel="noopener">/p/${esc(cur.slug)} ↗</a>` : ''}
    <button class="danger small" id="lpb-del" title="Hapus halaman">Hapus</button>
  </div>
  <div class="lpb">
    <aside class="lpb-side card" id="lpb-side"></aside>
    <div class="lpb-main">
      <div class="row-between lpb-viewbar"><div class="tabs" id="lpb-device"><button data-dev="desktop" class="${device === 'desktop' ? 'active' : ''}">Desktop</button><button data-dev="mobile" class="${device === 'mobile' ? 'active' : ''}">HP</button></div>
        <label class="toggle"><input type="checkbox" id="lpb-inline" ${editInPreview ? 'checked' : ''}> Edit langsung di pratinjau (klik teksnya)</label></div>
      <div class="lpb-stage ${device}"><iframe id="lpb-frame" title="Pratinjau landing page" sandbox="allow-scripts"></iframe></div>
    </div>
  </div>`;
  drawEditor();
  preview();
}

async function loadPages(selectId) {
  pages = await api('/api/lp-pages');
  if (!pages.length) pages = [await api('/api/lp-pages', json('POST', { name: 'Landing page pertama', data: STARTER() }))];
  const p = pages.find((x) => x.id === selectId) || pages[0];
  cur = { ...p, data: normalize(p.data) };
  dirty = false;
  drawShell();
}

async function save(quiet = false) {
  cur.name = $('#lpb-name')?.value.trim() || cur.name;
  const body = { name: cur.name, data: cur.data };
  if (cur.published) body.html = pageHtml();
  const saved = await api(`/api/lp-pages/${cur.id}`, json('PATCH', body));
  pages = pages.map((p) => (p.id === saved.id ? saved : p));
  dirty = false;
  if (!quiet) toast(cur.published ? 'Tersimpan & halaman terbit ikut diperbarui' : 'Tersimpan');
  const b = $('#lpb-save');
  if (b) b.textContent = 'Simpan';
}

function aiModal() {
  openModal(`<form id="lpb-ai-form"><h3>✨ Isi landing page dengan AI</h3>
    <label class="label" for="lai-brief">Brief produk/jasa</label>
    <textarea id="lai-brief" rows="6" required placeholder="Produk apa, untuk siapa, masalah yang diselesaikan, keunggulan, harga & promo, bukti (testimoni/izin), garansi."></textarea>
    <label class="label" for="lai-style">Gaya visual (opsional)</label><input id="lai-style" placeholder="mis. hijau herbal, hangat, terpercaya">
    <label class="label" for="lai-url">Link tombol (WA/checkout)</label><input id="lai-url" placeholder="https://wa.me/62...">
    <p class="hint">Isi halaman ini akan diganti hasil AI (tetap bisa diedit sebelum disimpan).</p>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary" id="lai-go">Buat</button></div></form>`);
  $('#lpb-ai-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#lai-go').disabled = true;
    $('#lai-go').textContent = 'AI lagi nulis… (±30-60 detik)';
    try {
      const d = await api('/api/lp-pages/ai', json('POST', { brief: $('#lai-brief').value, style: $('#lai-style').value, cta_url: $('#lai-url').value }));
      cur.data = normalize(d);
      openIdx = 0;
      closeModal();
      markDirty();
      drawShell();
      toast('Draft AI siap. Cek, edit, lalu Simpan.');
    } catch (ex) {
      toast(ex.message);
      $('#lai-go').disabled = false;
      $('#lai-go').textContent = 'Coba lagi';
    }
  });
}

function scrapeModal() {
  openModal(`<form id="lpb-sc-form"><h3>🔗 Scrap landing page dari link</h3>
    <label class="label" for="lsc-url">Link landing page referensi</label>
    <input id="lsc-url" type="url" required placeholder="https://contoh.com/promo" autocomplete="off">
    <label class="label">Hasilnya mau jadi apa</label>
    <label class="toggle"><input type="radio" name="lsc-mode" value="copy" checked> Salin desain persis jadi template (edit teks/gambar/link, lalu ✨ Sesuaikan produk)</label>
    <label class="toggle"><input type="radio" name="lsc-mode" value="rewrite"> Jadi blok LP Builder: tiru struktur &amp; warna, tulis ulang untuk brand saya (AI)</label>
    <label class="toggle"><input type="radio" name="lsc-mode" value="keep"> Jadi blok LP Builder: pakai teks aslinya apa adanya (AI)</label>
    <div id="lsc-ai-opts" hidden>
      <div id="lsc-brief-wrap"><label class="label" for="lsc-brief">Brief produk saya (opsional)</label>
        <textarea id="lsc-brief" rows="4" placeholder="Produk apa, untuk siapa, harga & promo, keunggulan. Kosongkan = pakai profil brand."></textarea></div>
      <label class="label" for="lsc-cta">Link tombol (WA/checkout, opsional)</label><input id="lsc-cta" placeholder="https://wa.me/62...">
      <label class="toggle"><input type="checkbox" id="lsc-img" checked> Pakai gambar dari halaman asli (link ke website sumber)</label>
      <p class="hint">Isi halaman yang sedang dibuka akan diganti hasil scrap.</p></div>
    <p class="hint" id="lsc-copy-hint">Jadi halaman baru; halaman yang sedang dibuka tidak tertimpa. Gambar, CSS, dan font tetap diambil dari website sumber.</p>
    <p class="hint">Halaman yang dirender JavaScript atau dikunci login kadang tidak terbaca. Pastikan kamu berhak memakai desain, teks &amp; gambar halaman sumber.</p>
    <div class="modal-actions"><button type="button" class="ghost" data-close>Batal</button><button class="primary" id="lsc-go">Scrap</button></div></form>`);
  const form = $('#lpb-sc-form');
  const mode = () => form.querySelector('[name=lsc-mode]:checked').value;
  form.addEventListener('change', () => {
    $('#lsc-ai-opts').hidden = mode() === 'copy';
    $('#lsc-copy-hint').hidden = mode() !== 'copy';
    $('#lsc-brief-wrap').hidden = mode() === 'keep';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const go = $('#lsc-go');
    go.disabled = true;
    try {
      if (mode() === 'copy') {
        go.textContent = 'Lagi ambil halaman…';
        const r = await api('/api/lp-pages/fetch-html', json('POST', { url: $('#lsc-url').value }));
        const host = new URL(r.url).hostname;
        const data = templateFromHtml(r.html, host);
        if (data.html.length > 3_400_000) throw new Error('Halaman ini terlalu besar untuk dijadikan template (maks ±3,4 MB).');
        const p = await api('/api/lp-pages', json('POST', { name: `Referensi ${data.title || host}`.slice(0, 120), data }));
        closeModal();
        await loadPages(p.id);
        return toast(`Desain ${host} jadi template. Klik teks/gambar untuk edit, atau ✨ Sesuaikan produk (AI).`);
      }
      go.textContent = 'Lagi baca halaman & nyusun blok… (±30-90 detik)';
      const d = await api('/api/lp-pages/scrape', json('POST', {
        url: $('#lsc-url').value, mode: form.querySelector('[name=lsc-mode]:checked').value,
        brief: $('#lsc-brief').value, cta_url: $('#lsc-cta').value, images: $('#lsc-img').checked,
      }));
      const { source, ...data } = d;
      cur.data = normalize(data);
      openIdx = 0;
      closeModal();
      markDirty();
      drawShell();
      toast(`Hasil scrap dari ${new URL(source.url).hostname} siap. Cek, edit, lalu Simpan.`);
    } catch (ex) {
      toast(ex.message);
      go.disabled = false;
      go.textContent = 'Coba lagi';
    }
  });
}

async function launchModal() {
  const list = await api('/api/launch');
  openModal(`<h3>Ambil dari Launch Lab</h3><p class="hint">Isi landing page (langkah 5) & palet brand proyek Launch Lab diubah jadi blok LP Builder.</p>
    ${list.map((p) => `<button class="card lp-card" data-lpb-from="${p.id}"><b>${esc(p.name)}</b><span class="hint">${esc(p.niche || '')} · ${esc(p.stage)}</span></button>`).join('') || '<div class="empty">Belum ada proyek Launch Lab.</div>'}
    <div class="modal-actions"><button class="ghost" data-close>Tutup</button></div>`);
}

async function fromLaunch(id) {
  const p = await api(`/api/launch/${id}`);
  const L = p.data.landing || {};
  const pal = Object.fromEntries((p.data.brand?.palette || []).map((c) => [c.role, c.hex]));
  const url = L.cta_url || 'https://wa.me/';
  cur.data = normalize({
    title: p.data.brand?.names?.[0] || p.name,
    description: L.subheadline || p.data.brand?.tagline || '',
    theme: { primary: pal.primary || '#5b4bdb', accent: pal.accent || '#f59e0b' },
    sections: [
      { type: 'hero', heading: L.headline || p.name, subheading: L.subheadline || '', cta_text: L.cta_text || 'Pesan Sekarang', cta_url: url },
      L.problems?.length && { type: 'problem', heading: 'Masalah yang sering dialami', items: L.problems.map((x) => ({ title: x, text: '' })) },
      L.solution && { type: 'text', heading: 'Solusinya', body: L.solution },
      L.benefits?.length && { type: 'benefits', heading: 'Yang kamu dapat', items: L.benefits.map((b) => ({ title: b.title, text: b.desc })) },
      (L.offer?.price || L.offer?.bonuses?.length) && { type: 'offer', heading: p.data.brand?.names?.[0] || p.name, subheading: L.offer.price || '', body: [L.offer.strike_price && `Harga normal ${L.offer.strike_price}`, L.offer.guarantee].filter(Boolean).join(' · '), items: (L.offer.bonuses || []).map((x) => ({ title: x, text: '' })), cta_text: L.cta_text || 'Ambil Sekarang', cta_url: url },
      L.faq?.length && { type: 'faq', heading: 'Pertanyaan yang sering ditanya', items: L.faq.map((f) => ({ title: f.q, text: f.a })) },
      { type: 'cta', heading: 'Siap mulai?', subheading: p.data.brand?.tagline || '', cta_text: L.cta_text || 'Pesan Sekarang', cta_url: url },
    ].filter(Boolean),
  });
  closeModal();
  markDirty();
  drawShell();
  toast('Diambil dari Launch Lab. Jangan lupa Simpan.');
}

function publishModal() {
  const suggested = cur.slug || fileBase();
  openModal(`<form id="lpb-pub-form"><h3>Terbitkan landing page</h3>
    <label class="label" for="lpp-slug">Alamat</label>
    <div class="btn-row left"><span class="hint">${location.origin}/p/</span><input id="lpp-slug" class="inline-input" value="${esc(suggested)}"></div>
    <p class="hint">Halaman terbit selalu sama dengan versi tersimpan terakhir. Mau pakai domain sendiri? Unduh HTML lalu upload ke hosting/Netlify/Vercel.</p>
    <div class="modal-actions">${cur.published ? '<button type="button" class="ghost" id="lpp-off">Tarik dari publik</button>' : ''}<button type="button" class="ghost" data-close>Batal</button><button class="primary">${cur.published ? 'Perbarui' : 'Terbitkan'}</button></div></form>`);
  $('#lpb-pub-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await save(true);
      const p = await api(`/api/lp-pages/${cur.id}/publish`, json('POST', { slug: $('#lpp-slug').value, html: pageHtml() }));
      Object.assign(cur, { slug: p.slug, published: p.published });
      pages = pages.map((x) => (x.id === p.id ? p : x));
      closeModal();
      drawShell();
      toast(`Live di /p/${p.slug}`);
    } catch (ex) { toast(ex.message); }
  });
  $('#lpp-off')?.addEventListener('click', async () => {
    const p = await api(`/api/lp-pages/${cur.id}/publish`, json('POST', { publish: false }));
    Object.assign(cur, { published: p.published });
    closeModal();
    drawShell();
  });
}

async function importFile(f) {
  const text = await f.text();
  let data;
  try {
    if (/\.html?$/i.test(f.name) || /^\s*</.test(text)) {
      const m = /<script type="application\/json" id="lp-data">([\s\S]*?)<\/script>/.exec(text);
      // HTML hasil LP Builder dibuka lagi sebagai blok; HTML lain (landing page jadi) jadi template referensi.
      data = m ? JSON.parse(m[1]) : templateFromHtml(text, f.name.replace(/\.html?$/i, ''));
    } else data = JSON.parse(text);
  } catch (ex) { return toast(ex.message.startsWith('File') ? ex.message : 'File tidak bisa dibaca sebagai JSON LP Builder'); }
  if (isTpl(data)) {
    // Referensi selalu jadi halaman baru supaya halaman yang sedang dibuka tidak tertimpa.
    if (data.html.length > 3_400_000) return toast('File terlalu besar (maks ±3,4 MB). Kecilkan gambar tertanamnya dulu.');
    const p = await api('/api/lp-pages', json('POST', { name: `Referensi ${data.title || f.name}`.slice(0, 120), data }));
    await loadPages(p.id);
    return toast('Referensi diimpor jadi template. Klik teks/gambar untuk edit, atau ✨ Sesuaikan produk (AI).');
  }
  cur.data = normalize(data);
  markDirty();
  drawShell();
  toast('Diimpor. Klik Simpan untuk menyimpan.');
}

// ---------------- Event ----------------
function bind() {
  const root = $('#studio-lp');
  root.addEventListener('click', async (e) => {
    const t = e.target;
    const d = t.dataset;
    try {
      if (t.id === 'lpb-save') await save();
      if (t.id === 'lpb-new') {
        if (dirty && !confirm('Perubahan belum disimpan. Lanjut bikin halaman baru?')) return;
        const p = await api('/api/lp-pages', json('POST', { name: `Landing page ${pages.length + 1}`, data: STARTER() }));
        await loadPages(p.id);
      }
      if (t.id === 'lpb-del' && confirm(`Hapus "${cur.name}"${cur.published ? ' (halaman terbitnya ikut hilang)' : ''}?`)) {
        await api(`/api/lp-pages/${cur.id}`, { method: 'DELETE' });
        await loadPages();
      }
      if (t.id === 'lpb-ai' || t.id === 'tpl-ai') (isTpl(cur.data) ? tplAiModal : aiModal)();
      if (t.id === 'lpb-scrape') scrapeModal();
      if (t.id === 'tpl-code') codeModal();
      if (t.closest?.('[data-tpl-pick]')) imageModal(Number(t.closest('[data-tpl-pick]').dataset.tplPick));
      if (t.id === 'tpl-dup') {
        if (dirty) await save(true);
        const p = await api('/api/lp-pages', json('POST', { name: `${cur.name} (salinan)`.slice(0, 120), data: cur.data }));
        await loadPages(p.id);
        toast('Salinan dibuat. Edit salinannya, referensi asli tetap utuh.');
      }
      if (t.id === 'lpb-launch') await launchModal();
      if (t.id === 'lpb-pub') publishModal();
      if (t.id === 'lpb-dl-html') download(`${fileBase()}.html`, pageHtml(), 'text/html;charset=utf-8');
      if (t.id === 'lpb-dl-json') download(`${fileBase()}.json`, JSON.stringify(cur.data, null, 2), 'application/json');
      if (t.id === 'lpb-add') {
        cur.data.sections.push(blank($('#lpb-addtype').value));
        openIdx = cur.data.sections.length - 1;
        markDirty(); drawEditor(); preview();
      }
      if (d.dev) { device = d.dev; drawShell(); }
      const move = (from, to) => {
        const arr = cur.data.sections;
        if (to < 0 || to >= arr.length) return;
        arr.splice(to, 0, arr.splice(from, 1)[0]);
        openIdx = to;
        markDirty(); drawEditor(); preview();
      };
      if (d.secUp) { e.preventDefault(); move(Number(d.secUp), Number(d.secUp) - 1); }
      if (d.secDown) { e.preventDefault(); move(Number(d.secDown), Number(d.secDown) + 1); }
      if (d.secDup) { e.preventDefault(); const i = Number(d.secDup); cur.data.sections.splice(i + 1, 0, structuredClone(cur.data.sections[i])); openIdx = i + 1; markDirty(); drawEditor(); preview(); }
      if (d.secDel) { e.preventDefault(); cur.data.sections.splice(Number(d.secDel), 1); markDirty(); drawEditor(); preview(); }
    } catch (ex) { toast(ex.message); }
  });
  root.addEventListener('toggle', (e) => { if (e.target.matches?.('.lpb-sec') && e.target.open) openIdx = Number(e.target.dataset.i); }, true);
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'lpb-name') { cur.name = t.value; markDirty(); return; }
    if (t.id === 'tpl-title') { tplDoc.title = t.value; syncTpl(); return; }
    if (t.id === 'tpl-desc') {
      let m = tplDoc.querySelector('meta[name=description]');
      if (!m) { m = tplDoc.createElement('meta'); m.name = 'description'; tplDoc.head.append(m); }
      m.setAttribute('content', t.value);
      syncTpl();
      return;
    }
    if (t.dataset.tplLink !== undefined) return;
    if (t.id === 'lpb-title') cur.data.title = t.value;
    else if (t.id === 'lpb-desc') cur.data.description = t.value;
    else if (t.dataset.theme) cur.data.theme[t.dataset.theme] = t.value;
    else {
      const secEl = t.closest('.lpb-sec');
      if (!secEl) return;
      const s = cur.data.sections[Number(secEl.dataset.i)];
      if (t.dataset.items !== undefined) s.items = textToItems(t.value);
      else if (t.dataset.f) s[t.dataset.f] = t.value;
    }
    markDirty();
    clearTimeout(bind.timer);
    bind.timer = setTimeout(preview, 250);
  });
  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'lpb-pick') {
      if (dirty && !confirm('Perubahan belum disimpan. Pindah halaman?')) { t.value = cur.id; return; }
      await loadPages(Number(t.value));
    }
    if (t.id === 'lpb-import' && t.files[0]) importFile(t.files[0]);
    if (t.id === 'lpb-inline') { editInPreview = t.checked; preview(); }
    if (t.dataset.tplLink !== undefined && t.value.trim() && t.value.trim() !== t.dataset.tplLink) {
      replaceLink(t.dataset.tplLink, t.value.trim());
      syncTpl();
      drawTemplateEditor();
      preview();
      toast('Link diganti di semua tombol yang memakainya');
    }
    if (t.dataset.f === 'type' || t.dataset.theme === 'font') { drawEditor(); preview(); }
  });
  // Edit langsung di pratinjau: iframe (sandbox, tanpa akses ke TIM-AI) mengirim perubahan teks lewat postMessage.
  window.addEventListener('message', (e) => {
    const f = $('#lpb-frame');
    if (!f || e.source !== f.contentWindow || !cur) return;
    if (typeof e.data?.lpEdit === 'string' && /^(s\.\d+\.(heading|subheading|body|cta_text|items\.\d+\.(title|text))|title)$/.test(e.data.lpEdit)) {
      setPath(e.data.lpEdit, String(e.data.value ?? '').replace(/\n+$/, ''));
      markDirty();
    }
    if (e.data?.lpEditDone && !isTpl(cur.data)) drawEditor();
    if (isTpl(cur.data) && typeof e.data?.tplEdit === 'number') {
      const el = tplDoc.querySelector(`[data-tpl="${e.data.tplEdit}"]`);
      if (el) { el.innerHTML = cleanAiHtml(e.data.html); syncTpl(); }
    }
    if (isTpl(cur.data) && typeof e.data?.tplImg === 'number') imageModal(e.data.tplImg);
  });
  $('#studio-lp').closest('.view')?.querySelector('#studio-tabs')?.addEventListener('click', async (e) => {
    const tab = e.target.dataset?.studio;
    if (!tab) return;
    document.querySelectorAll('#studio-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.studio === tab));
    $('#studio-tools').hidden = tab !== 'tools';
    $('#studio-lp').hidden = tab !== 'lp';
    $('#studio-newtab').hidden = tab !== 'tools';
    if (tab === 'lp' && !cur) loadPages().catch((ex) => toast(ex.message));
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });
}

bind();
window.timLp = { renderLp };
