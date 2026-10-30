// Free Tools: kumpulan alat kecil untuk semua tim (daftar alat mengikuti socialecho.net/free-tools).
// - Hampir semua jalan di browser: kalkulator, checker teks/link, editor gambar (canvas), olah video/audio (MediaRecorder).
// - Tool AI teks → /api/free-tools/ai (model default di AI & API Keys). Tool suara → /api/ai/tts (ElevenLabs).
// - Tool yang butuh server pihak ketiga (downloader, pemisah musik, monitor X/Telegram) ditandai "belum tersedia".
const S = window.siarin;
const { api, esc, toast, state } = S;
const $ = (sel, root = document) => root.querySelector(sel);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const fmt = (n, d = 0) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('id-ID', { maximumFractionDigits: d }));
const rp = (n) => (n == null || !Number.isFinite(n) ? '–' : `Rp${Math.round(n).toLocaleString('id-ID')}`);
const pct = (v) => (v == null || !Number.isFinite(v) ? '–' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`);
const size = (b) => (b < 1048576 ? `${fmt(b / 1024)} KB` : `${fmt(b / 1048576, 1)} MB`);
const N = (v) => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;
const seg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('id', { granularity: 'grapheme' }) : null;
const glen = (s) => (seg ? [...seg.segment(s)].length : [...s].length);
const slug = (s, sep = '_') => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^${sep}+|${sep}+$`, 'g'), '');

// ---------- UI kecil ----------
const field = (label, html, hint = '') => `<div><label class="label">${label}</label>${html}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
const input = (name, ph = '', val = '', type = 'text') => `<input name="${name}" type="${type}" placeholder="${esc(ph)}" value="${esc(val)}">`;
const area = (name, ph = '', rows = 5, val = '') => `<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(val)}</textarea>`;
const select = (name, opts, sel) => `<select name="${name}">${opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
const fileIn = (name, accept, multiple = false) => `<input name="${name}" type="file" accept="${accept}" ${multiple ? 'multiple' : ''}>`;
const kpis = (list) => `<div class="kpi-row">${list.map((k) => `<div class="kpi"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div>${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}</div>`).join('')}</div>`;
const checks = (list) => list.map(([ok, text]) => `<div class="ft-check ${ok === true ? 'ok' : ok === false ? 'bad' : 'warn'}">${ok === true ? '✓' : ok === false ? '✕' : '!'} ${text}</div>`).join('');
const copyBox = (text, rows = 6) => `<div class="ft-copy"><textarea readonly rows="${rows}">${esc(text)}</textarea><button type="button" class="ghost small" data-ft-copy>Salin</button></div>`;
const vals = (root) => Object.fromEntries(new FormData($('form', root) || document.createElement('form')));
function live(root, fn) { // hitung ulang tiap kali form berubah
  const f = $('form', root);
  const run = () => { try { fn(vals(root)); } catch (ex) { $('.ft-out', root).innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; } };
  f.addEventListener('input', run);
  f.addEventListener('change', run);
  f.addEventListener('submit', (e) => e.preventDefault());
  run();
}
const out = (root, html) => { $('.ft-out', root).innerHTML = html; };
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
const canvasBlob = (c, type = 'image/png', q = 0.92) => new Promise((r) => c.toBlob(r, type, q));
function loadImg(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar tidak bisa dibuka'));
    img.src = URL.createObjectURL(file);
  });
}
function drawCover(ctx, img, w, h, fit = 'cover', bg = '#ffffff') {
  const s = fit === 'cover' ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  if (fit !== 'cover') { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
function wrapText(ctx, text, maxW) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
  }
  return lines;
}

// ---------- Data platform (bisa berubah sewaktu-waktu; cocokkan dengan pusat bantuan tiap platform) ----------
const LIMITS = {
  Instagram: { caption: 2200, bio: 150, name: 30, username: 30, hashtags: 30, mentions: 20, fold: 125 },
  TikTok: { caption: 4000, bio: 80, name: 30, username: 24, fold: 100 },
  'X / Twitter': { caption: 280, bio: 160, name: 50, username: 15 },
  Facebook: { caption: 63206, bio: 101, fold: 125 },
  Threads: { caption: 500, bio: 150, username: 30 },
  LinkedIn: { caption: 3000, bio: 220, fold: 210 },
  YouTube: { caption: 5000, title: 100, bio: 1000, fold: 150 },
  Pinterest: { caption: 500, title: 100, bio: 160 },
};
const PLATFORMS = Object.keys(LIMITS);
const IMG_PRESETS = [
  ['ig-square', 'Instagram feed kotak 1:1', 1080, 1080], ['ig-portrait', 'Instagram feed portrait 4:5', 1080, 1350], ['ig-land', 'Instagram landscape 1.91:1', 1080, 566],
  ['story', 'IG/FB Story & Reels 9:16', 1080, 1920], ['tiktok', 'TikTok video/cover 9:16', 1080, 1920], ['yt-thumb', 'YouTube thumbnail 16:9', 1280, 720],
  ['yt-banner', 'YouTube banner', 2560, 1440], ['fb-post', 'Facebook post link', 1200, 630], ['fb-cover', 'Facebook cover', 851, 315],
  ['x-post', 'X / Twitter post 16:9', 1600, 900], ['x-header', 'X / Twitter header', 1500, 500], ['li-post', 'LinkedIn post', 1200, 627],
  ['li-banner', 'LinkedIn banner', 1584, 396], ['pin', 'Pinterest pin 2:3', 1000, 1500], ['mp', 'Foto produk Shopee/Tokopedia 1:1', 1000, 1000], ['wa', 'Status WhatsApp 9:16', 1080, 1920],
];
const VIDEO_SPECS = [
  { id: 'reels', name: 'Instagram Reels', ratio: 9 / 16, maxSec: 180, minH: 720 },
  { id: 'tiktok', name: 'TikTok', ratio: 9 / 16, maxSec: 600, minH: 720 },
  { id: 'shorts', name: 'YouTube Shorts', ratio: 9 / 16, maxSec: 180, minH: 720 },
  { id: 'youtube', name: 'YouTube (video biasa)', ratio: 16 / 9, maxSec: 43200, minH: 720 },
  { id: 'fbreels', name: 'Facebook Reels', ratio: 9 / 16, maxSec: 90, minH: 540 },
  { id: 'x', name: 'X / Twitter', ratio: null, maxSec: 140, minH: 360, maxMB: 512 },
  { id: 'linkedin', name: 'LinkedIn', ratio: null, maxSec: 600, minH: 360, maxMB: 5120 },
];

// ======================= TEKS & CAPTION =======================
function textStats(t) {
  return {
    chars: glen(t), words: (t.match(/[\p{L}\p{N}'’-]+/gu) || []).length, lines: t ? t.split('\n').length : 0,
    hashtags: t.match(/#[\p{L}\p{N}_]+/gu) || [], mentions: t.match(/@[\w.]+/g) || [], emojis: (t.match(/\p{Extended_Pictographic}/gu) || []).length,
    links: t.match(/https?:\/\/\S+|www\.\S+/gi) || [],
  };
}
const limitBar = (n, max, label) => `<div class="ft-limit"><div class="row-between"><span>${label}</span><span class="${n > max ? 'error-inline' : 'hint'}">${fmt(n)} / ${fmt(max)}</span></div><div class="pbar"><span style="width:${Math.min(100, (n / max) * 100)}%;${n > max ? 'background:var(--bad)' : ''}"></span></div></div>`;

function characterCounter(root) {
  root.innerHTML = `<form>${area('t', 'Tempel caption / teks di sini…', 8)}</form><div class="ft-out"></div>`;
  live(root, ({ t }) => {
    const s = textStats(t);
    out(root, kpis([{ label: 'Karakter', value: fmt(s.chars), sub: `${fmt(t.replace(/\s/g, '').length)} tanpa spasi` }, { label: 'Kata', value: fmt(s.words) }, { label: 'Baris', value: fmt(s.lines) },
      { label: 'Hashtag', value: fmt(s.hashtags.length) }, { label: 'Mention', value: fmt(s.mentions.length) }, { label: 'Emoji', value: fmt(s.emojis) }])
      + `<div class="card">${PLATFORMS.map((p) => limitBar(s.chars, LIMITS[p].caption, `${p} (caption)`)).join('')}</div>`);
  });
}

function captionLength(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Platform', select('p', PLATFORMS, 'Instagram'))}</div>${area('t', 'Tempel caption…', 8)}</form><div class="ft-out"></div>`;
  live(root, ({ p, t }) => {
    const L = LIMITS[p];
    const s = textStats(t);
    const fold = L.fold;
    const firstLine = t.split('\n')[0] || '';
    out(root, `<div class="card">${limitBar(s.chars, L.caption, 'Panjang caption')}
      ${L.hashtags ? limitBar(s.hashtags.length, L.hashtags, 'Hashtag') : ''}${L.mentions ? limitBar(s.mentions.length, L.mentions, 'Mention') : ''}
      ${checks([
        [s.chars <= L.caption, s.chars <= L.caption ? 'Masih di bawah batas maksimal.' : `Kelebihan ${fmt(s.chars - L.caption)} karakter, caption akan ditolak/terpotong.`],
        ...(fold ? [[glen(firstLine) <= fold ? true : null, `Bagian yang terlihat sebelum "…selengkapnya" ±${fold} karakter. Baris pertama kamu ${glen(firstLine)} karakter.`]] : []),
        [s.words >= 5 ? true : null, s.words >= 5 ? 'Ada cukup konteks.' : 'Caption sangat pendek. Tambahkan konteks atau CTA.'],
      ])}
      ${fold && t ? `<div class="label">Yang terlihat di feed</div><div class="ft-preview-cap">${esc([...t].slice(0, fold).join(''))}${glen(t) > fold ? '<span class="hint">… selengkapnya</span>' : ''}</div>` : ''}</div>`);
  });
}

function readability(root) {
  root.innerHTML = `<form>${area('t', 'Tempel caption / naskah…', 8)}</form><div class="ft-out"></div>`;
  live(root, ({ t }) => {
    if (!t.trim()) return out(root, '<p class="hint">Mulai ketik untuk melihat skor.</p>');
    const sentences = t.split(/[.!?…\n]+/).map((x) => x.trim()).filter(Boolean);
    const words = t.match(/[\p{L}\p{N}'’-]+/gu) || [];
    const syl = (w) => (w.toLowerCase().match(/[aiueoy]+/g) || ['']).length;
    const avg = words.length / Math.max(1, sentences.length);
    const longW = words.filter((w) => syl(w) >= 4).length / Math.max(1, words.length);
    const longS = sentences.filter((x) => (x.match(/\S+/g) || []).length > 20).length;
    const paras = t.split(/\n\s*\n/).filter((p) => p.trim());
    const longP = paras.filter((p) => p.length > 300).length;
    const score = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, avg - 10) * 3 - longW * 120 - longP * 5)));
    const grade = score >= 80 ? ['Sangat mudah dibaca', 'ok'] : score >= 60 ? ['Cukup mudah', 'ok'] : score >= 40 ? ['Agak berat', 'warn'] : ['Sulit dibaca di HP', 'bad'];
    out(root, kpis([{ label: 'Skor keterbacaan', value: `${score}/100`, sub: grade[0] }, { label: 'Kata / kalimat', value: fmt(avg, 1), sub: 'ideal ≤ 15' }, { label: 'Kata panjang', value: pct(longW), sub: '≥ 4 suku kata' }, { label: 'Kalimat', value: fmt(sentences.length) }])
      + `<div class="card">${checks([
        [avg <= 15 ? true : null, avg <= 15 ? 'Panjang kalimat pas untuk dibaca sambil scroll.' : 'Kalimat rata-rata terlalu panjang. Pecah jadi kalimat pendek.'],
        [longS === 0 ? true : null, longS === 0 ? 'Tidak ada kalimat lebih dari 20 kata.' : `${longS} kalimat lebih dari 20 kata.`],
        [longP === 0 ? true : null, longP === 0 ? 'Paragraf sudah ringkas.' : `${longP} paragraf terlalu padat. Beri baris kosong tiap 1–3 kalimat.`],
        [longW < 0.15 ? true : null, longW < 0.15 ? 'Pilihan kata sederhana.' : 'Banyak kata panjang/formal. Ganti dengan kata sehari-hari.'],
      ])}</div>`);
  });
}

function hashtagDensity(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Platform', select('p', PLATFORMS, 'Instagram'))}</div>${area('t', 'Tempel caption beserta hashtag…', 8)}</form><div class="ft-out"></div>`;
  live(root, ({ p, t }) => {
    const s = textStats(t);
    const tags = s.hashtags.map((h) => h.toLowerCase());
    const dup = [...new Set(tags.filter((h, i) => tags.indexOf(h) !== i))];
    const density = s.hashtags.length / Math.max(1, s.words);
    const ideal = { Instagram: [3, 8], TikTok: [3, 6], 'X / Twitter': [1, 2], LinkedIn: [3, 5], Facebook: [1, 3], Threads: [1, 1], YouTube: [2, 5], Pinterest: [2, 5] }[p];
    const long = s.hashtags.filter((h) => h.length > 25);
    out(root, kpis([{ label: 'Hashtag', value: fmt(s.hashtags.length), sub: `ideal ${ideal[0]}–${ideal[1]} untuk ${p}` }, { label: 'Kepadatan', value: pct(density), sub: 'hashtag ÷ kata' }, { label: 'Duplikat', value: fmt(dup.length) }])
      + `<div class="card">${checks([
        [s.hashtags.length >= ideal[0] && s.hashtags.length <= ideal[1] ? true : null, `Jumlah hashtag ${s.hashtags.length}${s.hashtags.length > ideal[1] ? ': terlalu banyak, terlihat spam' : s.hashtags.length < ideal[0] ? ': bisa ditambah' : ': pas'}.`],
        [LIMITS[p].hashtags ? s.hashtags.length <= LIMITS[p].hashtags : true, LIMITS[p].hashtags ? `Batas keras ${p}: ${LIMITS[p].hashtags} hashtag.` : 'Tidak ada batas keras jumlah hashtag.'],
        [density <= 0.3 ? true : null, density <= 0.3 ? 'Proporsi hashtag terhadap teks wajar.' : 'Hashtag lebih dominan dari isi caption.'],
        [dup.length === 0, dup.length ? `Hashtag ganda: ${dup.map(esc).join(', ')}` : 'Tidak ada hashtag ganda.'],
        [long.length === 0 ? true : null, long.length ? `Hashtag terlalu panjang: ${long.map(esc).join(', ')}` : 'Panjang hashtag wajar.'],
      ])}${s.hashtags.length ? `<div class="label">Daftar hashtag</div>${copyBox(s.hashtags.join(' '), 3)}` : ''}</div>`);
  });
}

function bioLength(root) {
  root.innerHTML = `<form>${area('t', 'Tulis bio kamu…', 4)}</form><div class="ft-out"></div>`;
  live(root, ({ t }) => out(root, `<div class="card">${PLATFORMS.map((p) => limitBar(glen(t), LIMITS[p].bio, p)).join('')}</div>`));
}

const CTA_WORDS = ['klik', 'cek', 'order', 'beli', 'dm', 'daftar', 'download', 'unduh', 'shop', 'belanja', 'pesan', 'chat', 'wa', 'whatsapp', 'gabung', 'join', 'link', 'kunjungi', 'tap', 'konsultasi', 'promo', 'diskon'];
function linkInBioCta(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Platform', select('p', PLATFORMS, 'Instagram'))}${field('Link di kolom website', input('url', 'https://…'))}</div>${area('t', 'Tulis bio kamu…', 4)}</form><div class="ft-out"></div>`;
  live(root, ({ p, t, url }) => {
    const low = t.toLowerCase();
    const cta = CTA_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(low));
    const pointer = /👇|⬇️|⤵️|🔗|👉|➡️/.test(t);
    const res = [
      [cta.length > 0, cta.length ? `Ada kata ajakan: ${cta.join(', ')}.` : 'Belum ada ajakan jelas (mis. "Order di link 👇", "DM untuk konsultasi").'],
      [pointer ? true : null, pointer ? 'Ada emoji penunjuk ke link.' : 'Tambahkan 👇 atau 🔗 agar mata langsung ke link.'],
      [!!url, url ? 'Kolom link terisi.' : 'Kolom link/website kosong.'],
      [url ? /^https:\/\//.test(url) : null, url && !/^https:\/\//.test(url) ? 'Link sebaiknya https.' : 'Link aman (https).'],
      [glen(t) <= LIMITS[p].bio, `${glen(t)} / ${LIMITS[p].bio} karakter.`],
      [/\d|%|ribu|rb|k\b|terbukti|resmi|bpom|halal|garansi/i.test(t) ? true : null, /\d|%|ribu|rb|terbukti|resmi|bpom|halal|garansi/i.test(t) ? 'Ada bukti/kredibilitas (angka, sertifikat, garansi).' : 'Tambahkan bukti singkat: jumlah pelanggan, BPOM/halal, garansi.'],
      [['Instagram', 'TikTok', 'Threads'].includes(p) && /https?:\/\//.test(t) ? false : true, ['Instagram', 'TikTok', 'Threads'].includes(p) && /https?:\/\//.test(t) ? `Link yang ditulis di teks bio ${p} tidak bisa diklik. Pindahkan ke kolom website.` : 'Penempatan link sesuai.'],
    ];
    const score = Math.round((res.filter((r) => r[0] === true).length / res.length) * 100);
    out(root, kpis([{ label: 'Skor CTA bio', value: `${score}/100` }]) + `<div class="card">${checks(res)}</div>`);
  });
}

const LINK_RULES = {
  Instagram: 'Link di caption & komentar TIDAK bisa diklik. Taruh di kolom link bio (maks 5 link), stiker Link di Story, atau tombol di Reels iklan.',
  TikTok: 'Link di caption tidak bisa diklik. Link di bio butuh akun bisnis atau ±1.000 followers (akun pribadi). Untuk produk pakai keranjang kuning/Showcase.',
  'X / Twitter': 'Link di post bisa diklik dan dihitung 23 karakter. Post dengan link luar cenderung jangkauannya lebih kecil; banyak akun menaruh link di balasan pertama.',
  Facebook: 'Link di post bisa diklik dan memunculkan pratinjau. Gambar pratinjau diambil dari og:image halaman tujuan.',
  Threads: 'Link di post bisa diklik (maks 5 link per post) dan di bio.',
  LinkedIn: 'Link di post bisa diklik. Banyak kreator menaruh link di komentar pertama untuk menjaga jangkauan.',
  YouTube: 'Link di deskripsi bisa diklik. Di Shorts, gunakan fitur "Video terkait" atau link di komentar sematan.',
  Pinterest: 'Setiap pin bisa punya satu link tujuan (kolom Link). Link di deskripsi tidak diklik.',
};
function bioLinkPlacement(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Platform', select('p', PLATFORMS, 'Instagram'))}</div>${area('t', 'Tempel caption/bio yang berisi link…', 5)}</form><div class="ft-out"></div>`;
  live(root, ({ p, t }) => {
    const links = textStats(t).links;
    const noClick = ['Instagram', 'TikTok', 'Pinterest'].includes(p);
    out(root, `<div class="card"><div class="check">${LINK_RULES[p]}</div>${checks([
      [links.length ? !noClick : null, links.length ? (noClick ? `${links.length} link di teks tidak akan bisa diklik di ${p}. Ganti dengan "link di bio 👆".` : `${links.length} link akan bisa diklik.`) : 'Tidak ada link di teks.'],
      [links.every((l) => /^https:/.test(l) || /^www\./.test(l)) ? true : null, 'Gunakan https.'],
      [links.some((l) => /utm_/.test(l)) ? true : null, links.some((l) => /utm_/.test(l)) ? 'Link sudah memakai UTM.' : 'Tambahkan UTM supaya klik dari platform ini terlacak (pakai UTM Builder).'],
    ])}</div>`);
  });
}

// Huruf "font" Instagram = karakter Unicode, jadi bisa ditempel di mana saja.
const MATH = { bold: [0x1d400, 0x1d41a, 0x1d7ce], italic: [0x1d434, 0x1d44e], boldItalic: [0x1d468, 0x1d482], script: [0x1d4d0, 0x1d4ea], fraktur: [0x1d56c, 0x1d586],
  double: [0x1d538, 0x1d552, 0x1d7d8], sans: [0x1d5a0, 0x1d5ba, 0x1d7e2], sansBold: [0x1d5d4, 0x1d5ee, 0x1d7ec], sansItalic: [0x1d608, 0x1d622], sansBoldItalic: [0x1d63c, 0x1d656], mono: [0x1d670, 0x1d68a, 0x1d7f6] };
const MATH_HOLES = { italic: { h: 'ℎ' }, double: { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' } };
const SMALL = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ';
const FONT_STYLES = {
  ...Object.fromEntries(Object.entries(MATH).map(([k, [up, lo, dig]]) => [k, (ch) => {
    if (MATH_HOLES[k]?.[ch]) return MATH_HOLES[k][ch];
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(up + c - 65);
    if (c >= 97 && c <= 122) return String.fromCodePoint(lo + c - 97);
    if (dig && c >= 48 && c <= 57) return String.fromCodePoint(dig + c - 48);
    return ch;
  }])),
  circled: (ch) => { const c = ch.charCodeAt(0); if (c >= 65 && c <= 90) return String.fromCodePoint(0x24b6 + c - 65); if (c >= 97 && c <= 122) return String.fromCodePoint(0x24d0 + c - 97); if (c === 48) return '⓪'; if (c >= 49 && c <= 57) return String.fromCodePoint(0x2460 + c - 49); return ch; },
  squared: (ch) => { const c = ch.toUpperCase().charCodeAt(0); return c >= 65 && c <= 90 ? String.fromCodePoint(0x1f130 + c - 65) : ch; },
  blackSquared: (ch) => { const c = ch.toUpperCase().charCodeAt(0); return c >= 65 && c <= 90 ? String.fromCodePoint(0x1f170 + c - 65) : ch; },
  smallCaps: (ch) => { const c = ch.toLowerCase().charCodeAt(0); return c >= 97 && c <= 122 ? SMALL[c - 97] : ch; },
  wide: (ch) => { const c = ch.charCodeAt(0); return c > 32 && c < 127 ? String.fromCharCode(c + 0xfee0) : ch === ' ' ? '　' : ch; },
  strike: (ch) => `${ch}̶`,
  underline: (ch) => `${ch}̲`,
};
const FONT_LABEL = { bold: 'Bold serif', italic: 'Italic serif', boldItalic: 'Bold italic', script: 'Script / tulisan tangan', fraktur: 'Gothic', double: 'Outline', sans: 'Sans', sansBold: 'Sans bold', sansItalic: 'Sans italic', sansBoldItalic: 'Sans bold italic', mono: 'Mesin ketik', circled: 'Lingkaran', squared: 'Kotak', blackSquared: 'Kotak hitam', smallCaps: 'Small caps', wide: 'Lebar (aesthetic)', strike: 'Coret', underline: 'Garis bawah' };
function fontGenerator(root) {
  root.innerHTML = `<form>${input('t', 'Ketik teks…', 'Promo Spesial 12.12')}</form><div class="ft-out"></div>`;
  live(root, ({ t }) => out(root, `<div class="ft-list">${Object.entries(FONT_STYLES).map(([k, fn]) => { const v = [...t].map(fn).join(''); return `<div class="ft-row"><span class="hint">${FONT_LABEL[k]}</span><span class="ft-big" data-ft-val="${esc(v)}">${esc(v)}</span><button type="button" class="ghost small" data-ft-copyval="${esc(v)}">Salin</button></div>`; }).join('')}</div><p class="hint">Huruf khusus kadang tidak terbaca pembaca layar & tidak ikut pencarian. Pakai secukupnya, misalnya di nama atau judul.</p>`));
}

const SYMBOLS = {
  'Bintang & kilau': '✦ ✧ ★ ☆ ✩ ✪ ✫ ✬ ✭ ✮ ✯ ✰ ⋆ ✨ ❋ ❊ ❉ ✺ ✹ ✸ ✷ ✶ ✵ ✴ ✳ ⁂ ⁎ ✱',
  'Hati': '♡ ♥ ❤ ❥ ❣ ❦ ❧ ღ 💕 💗 💖 💘 💝 🤍 🖤 🤎 💜 💙 💚 💛 🧡',
  'Bunga & alam': '❀ ❁ ✿ ✾ ❃ ✽ ✼ ⚘ 𖧷 ☘ 🌸 🌷 🌹 🌿 🍃 🌙 ☾ ☽ ☀ ☁ ☂ ❄ ☃ ⛅',
  'Panah': '→ ← ↑ ↓ ↗ ↘ ↙ ↖ ⇢ ⇠ ➜ ➝ ➞ ➟ ➠ ➤ ➥ ➦ ⤷ ⤶ ↳ ↲ ⟶ ⟵ ▸ ◂ ▹ ◃ ➺ ➻',
  'Garis & pemisah': '─ ━ │ ┃ ┄ ┅ ┈ ┉ ═ ║ ╭ ╮ ╰ ╯ ⋯ ⋮ ⁘ ⁙ · • ◦ ‣ ⁃ ⦁ ⊹ ˚ ༄ ┊ ┆',
  'Kurung & bingkai': '「 」 『 』 【 】 〖 〗 《 》 〈 〉 ⟨ ⟩ ⦅ ⦆ ⌜ ⌝ ⌞ ⌟ ꒰ ꒱ ⁅ ⁆ ❮ ❯ ❰ ❱',
  'Bentuk': '● ○ ◎ ◉ ■ □ ▪ ▫ ◆ ◇ ◈ ▲ △ ▼ ▽ ◢ ◣ ◤ ◥ ⬟ ⬢ ⬡ ⭐ ⬤ ◯ ⧫',
  'Centang & tanda': '✓ ✔ ☑ ✗ ✘ ☒ ⚠ ⓘ ‼ ⁉ ※ ⌘ ⚑ ⚐ ⌛ ⏳ ☏ ✆ ✉ ✎ ✏ ✂ ⚡ ⚙',
  'Mata uang & angka': '₹ ¥ € £ $ ¢ ₩ ₿ % ‰ № ½ ⅓ ¼ ¾ ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ¹ ² ³',
  'Kaomoji': '(◕‿◕) (｡♥‿♥｡) (╯°□°)╯ ʕ•ᴥ•ʔ (づ｡◕‿‿◕｡)づ ¯\\_(ツ)_/¯ (ᵔᴥᵔ) (≧▽≦) ٩(◕‿◕)۶ (✿◠‿◠) ( ˘͈ ᵕ ˘͈♡)',
};
function aestheticSymbols(root) {
  root.innerHTML = `<p class="hint">Klik simbol untuk menyalin.</p>${Object.entries(SYMBOLS).map(([g, s]) => `<div class="card"><div class="label">${g}</div><div class="ft-symbols">${s.split(' ').map((x) => `<button type="button" data-ft-copyval="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>`).join('')}`;
}

const BAIT = ['like jika', 'like kalau', 'tag 3', 'tag teman', 'share ke', 'komen ya', 'ketik amin', 'follow untuk', 'like & share', 'vote dengan'];
const RISKY = ['100% sembuh', 'dijamin sembuh', 'obat segala', 'tanpa efek samping', 'pasti kaya', 'cepat kaya', 'judi', 'slot', 'pinjol', 'turun 10 kg', 'langsing dalam', 'investasi pasti'];
function contentRules(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Platform', select('p', PLATFORMS, 'Instagram'))}</div>${area('t', 'Tempel caption yang mau diposting…', 8)}</form><div class="ft-out"></div>`;
  live(root, ({ p, t }) => {
    if (!t.trim()) return out(root, '<p class="hint">Tempel caption untuk dicek.</p>');
    const L = LIMITS[p];
    const s = textStats(t);
    const low = t.toLowerCase();
    const bait = BAIT.filter((b) => low.includes(b));
    const risky = RISKY.filter((b) => low.includes(b));
    const letters = t.replace(/[^A-Za-z]/g, '');
    const caps = letters.length ? letters.replace(/[^A-Z]/g, '').length / letters.length : 0;
    out(root, `<div class="card">${checks([
      [s.chars <= L.caption, `Panjang ${fmt(s.chars)} / ${fmt(L.caption)} karakter.`],
      [L.hashtags ? s.hashtags.length <= L.hashtags : true, `${s.hashtags.length} hashtag${L.hashtags ? ` (maks ${L.hashtags})` : ''}.`],
      [L.mentions ? s.mentions.length <= L.mentions : true, `${s.mentions.length} mention${L.mentions ? ` (maks ${L.mentions})` : ''}.`],
      [bait.length ? false : true, bait.length ? `Terdeteksi engagement bait (${bait.join(', ')}). Meta & TikTok bisa menurunkan jangkauan konten seperti ini.` : 'Tidak ada engagement bait.'],
      [risky.length ? false : true, risky.length ? `Klaim berisiko ditolak/diturunkan: ${risky.join(', ')}. Hindari klaim kesehatan/keuangan berlebihan.` : 'Tidak ada klaim berisiko yang umum.'],
      [caps < 0.5 ? true : null, caps < 0.5 ? 'Penggunaan huruf kapital wajar.' : 'Terlalu banyak HURUF KAPITAL, terasa seperti spam.'],
      [s.links.length && ['Instagram', 'TikTok'].includes(p) ? null : true, s.links.length && ['Instagram', 'TikTok'].includes(p) ? `Link di caption ${p} tidak bisa diklik.` : 'Penempatan link aman.'],
      [/#ad\b|#iklan|#sponsored|paid partnership|kerja sama berbayar/i.test(t) ? true : null, 'Kalau ini konten berbayar/endorse, aktifkan label "Paid partnership"/"Konten berbayar" di aplikasi.'],
    ])}<p class="hint">Pengecekan otomatis sederhana. Aturan lengkap ada di Community Guidelines tiap platform.</p></div>`);
  });
}

function platformLimits(root) {
  const rows = [['caption', 'Caption / post'], ['bio', 'Bio'], ['username', 'Username'], ['name', 'Nama tampilan'], ['title', 'Judul'], ['hashtags', 'Hashtag maks'], ['mentions', 'Mention maks'], ['fold', 'Terpotong "…selengkapnya" ±']];
  root.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th></th>${PLATFORMS.map((p) => `<th>${p}</th>`).join('')}</tr></thead><tbody>${rows.map(([k, l]) => `<tr><td><b>${l}</b></td>${PLATFORMS.map((p) => `<td>${LIMITS[p][k] ? fmt(LIMITS[p][k]) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="label">Ukuran gambar</div><div class="table-wrap"><table class="data"><tbody>${IMG_PRESETS.map(([, l, w, h]) => `<tr><td>${l}</td><td>${w} × ${h} px</td></tr>`).join('')}</tbody></table></div>
    <div class="label">Video</div><div class="table-wrap"><table class="data"><thead><tr><th>Platform</th><th>Rasio</th><th>Durasi maks</th><th>Resolusi min</th></tr></thead><tbody>${VIDEO_SPECS.map((v) => `<tr><td>${v.name}</td><td>${v.ratio ? (v.ratio < 1 ? '9:16' : '16:9') : 'bebas'}</td><td>${v.maxSec >= 3600 ? `${v.maxSec / 3600} jam` : `${Math.round(v.maxSec / 60 * 10) / 10} menit`}</td><td>${v.minH}p</td></tr>`).join('')}</tbody></table></div>
    <p class="hint">Batas di atas bisa berubah. Cocokkan dengan pusat bantuan tiap platform sebelum kampanye besar.</p>`;
}

function postPreview(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Platform', select('p', ['Instagram', 'TikTok', 'X / Twitter', 'Facebook', 'LinkedIn', 'Threads']))}${field('Nama akun', input('name', '', 'tim.ai'))}${field('Gambar', fileIn('img', 'image/*'))}</div>${area('t', 'Caption…', 5, 'Caption kamu di sini ✨\n\nBaris kedua biasanya tersembunyi di balik "selengkapnya".')}</form><div class="ft-out"></div>`;
  let src = '';
  $('[name=img]', root).addEventListener('change', (e) => { src = e.target.files[0] ? URL.createObjectURL(e.target.files[0]) : ''; });
  live(root, ({ p, name, t }) => {
    const fold = LIMITS[p].fold;
    const cut = fold && glen(t) > fold ? `${esc([...t].slice(0, fold).join(''))}<span class="hint">… selengkapnya</span>` : esc(t);
    const media = src ? `<img src="${src}" alt="">` : '<div class="ft-ph">Gambar</div>';
    const vertical = p === 'TikTok';
    out(root, `<div class="ft-mock ${vertical ? 'tall' : ''}"><div class="ft-mock-head"><span class="ub-avatar">${esc((name || '?')[0].toUpperCase())}</span><b>${esc(name)}</b><span class="hint">${esc(p)}</span></div>
      ${p === 'X / Twitter' || p === 'Threads' || p === 'LinkedIn' || p === 'Facebook' ? `<div class="ft-mock-cap">${cut}</div>${media}` : `${media}<div class="ft-mock-cap"><b>${esc(name)}</b> ${cut}</div>`}
      <div class="hint">${glen(t)} karakter${LIMITS[p].caption < glen(t) ? ` · <span class="error-inline">melebihi batas ${LIMITS[p].caption}</span>` : ''}</div></div>`);
  });
}

// ======================= AI TEKS =======================
const AI_FORMS = {
  'hashtag-generator': { ph: 'Topik / produk, mis. "madu anak untuk daya tahan tubuh"', extra: ['platform', 'count'] },
  'caption-hook-generator': { ph: 'Topik konten, mis. "cara memilih skincare untuk kulit berminyak"', extra: ['platform', 'tone'] },
  'instagram-bio-generator': { ph: 'Siapa kamu/brand-mu, untuk siapa, keunggulan, CTA. Mis. "Toko madu murni dari Sumbawa, untuk keluarga, sudah BPOM, order via WA"', extra: ['tone'] },
  'ai-auto-reply': { ph: 'Tempel komentar atau DM pelanggan…', extra: ['tone', 'brand'] },
  'ai-auto-rewrite': { ph: 'Tempel teks yang mau ditulis ulang…', extra: ['platform', 'tone'] },
  'cross-platform-post-adapter': { ph: 'Tempel postingan asli…', extra: [] },
  'ai-content-label-checker': { ph: 'Jelaskan kontennya: apakah memakai gambar/suara AI, wajah orang asli, endorse berbayar, dll.', extra: [] },
};
function aiTool(id) {
  return (root) => {
    const f = AI_FORMS[id];
    const ex = { platform: field('Platform', select('platform', PLATFORMS, 'Instagram')), tone: field('Gaya bahasa', select('tone', ['santai & akrab', 'profesional', 'lucu', 'persuasif / jualan', 'edukatif', 'mewah / premium'])),
      count: field('Jumlah', select('count', ['10', '20', '30'], '20')), brand: field('Nama brand', input('brand', '', state.brands?.find((b) => b.id === state.brandId)?.name || '')) };
    root.innerHTML = `<form><div class="form-grid">${f.extra.map((k) => ex[k]).join('')}${field('Bahasa', select('lang', ['Bahasa Indonesia', 'English', 'Bahasa Melayu']))}</div>${area('text', f.ph, 5)}
      <div class="btn-row left"><button class="primary ai">✨ Buat dengan AI</button></div></form><div class="ft-out"></div>`;
    $('form', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button.primary', root);
      btn.disabled = true;
      out(root, '<div class="spinner"></div>');
      try {
        const r = await api('/api/free-tools/ai', json('POST', { tool: id, ...vals(root) }));
        out(root, `<div class="card">${copyBox(r.text, 14)}</div>`);
      } catch (ex2) { out(root, `<div class="check bad">${esc(ex2.message)}${/API key|belum aktif/i.test(ex2.message) ? ' <button class="ghost small" data-ft-go="aikeys">Buka AI &amp; API Keys</button>' : ''}</div>`); }
      btn.disabled = false;
    });
  };
}

// ======================= SUARA AI (ElevenLabs) =======================
// Tiap preset = filter suara (berdasarkan label ElevenLabs) + contoh naskah.
const TTS = {
  'ai-voice-generator': { kw: [], sample: 'Halo! Ini contoh suara AI dari TIM-AI. Ketik naskahmu sendiri di sini.' },
  'female-ai-voice': { kw: ['female', 'woman'], sample: 'Halo kak, makasih sudah mampir. Yuk cek promo spesial minggu ini!' },
  'male-ai-voice': { kw: ['male', 'man'], not: ['female'], sample: 'Selamat datang. Di video ini saya akan bahas tiga cara meningkatkan penjualan.' },
  'deep-voice-generator': { kw: ['deep', 'low', 'gravelly', 'raspy', 'male'], not: ['female'], sample: 'Di dunia yang terus berubah… hanya yang siap yang akan bertahan.' },
  'kid-voice-generator': { kw: ['child', 'kid', 'young', 'childish'], sample: 'Hore! Hari ini aku mau cerita tentang mainan baruku!' },
  'narrator-voice-generator': { kw: ['narration', 'narrative', 'audiobook', 'story', 'documentary'], sample: 'Pada suatu pagi di sebuah desa kecil, seorang perajin memulai harinya.' },
  'podcast-intro-voice': { kw: ['podcast', 'conversational', 'radio', 'warm'], sample: 'Kamu sedang mendengarkan Podcast Bisnis Kita, tempat ngobrol santai soal jualan online.' },
  'instagram-reels-voice': { kw: ['social media', 'energetic', 'upbeat', 'young'], sample: 'Stop scroll! Ini tiga trik yang bikin konten kamu langsung naik.' },
  'tiktok-voice-generator': { kw: ['social media', 'energetic', 'upbeat', 'young', 'female'], sample: 'Guys, aku nemu barang yang beneran ngebantu banget. Cek sampai habis ya!' },
  'youtube-voice-generator': { kw: ['narration', 'informative', 'educational', 'conversational'], sample: 'Halo semuanya, selamat datang kembali di channel ini.' },
  'whatsapp-voice-message-generator': { kw: ['conversational', 'casual', 'warm', 'friendly'], sample: 'Halo kak, pesanannya sudah kami kirim hari ini ya. Terima kasih banyak!' },
  'spanish-text-to-speech': { kw: ['spanish'], sample: '¡Hola! Bienvenidos a nuestra tienda. Hoy tenemos ofertas especiales para ti.' },
  'mexican-spanish-voice': { kw: ['mexican', 'latin', 'spanish'], sample: '¡Qué onda! Hoy te traigo algo increíble, quédate hasta el final.' },
  'argentine-spanish-voice': { kw: ['argentin', 'latin', 'spanish'], sample: '¡Che, mirá esto! Te va a encantar lo que tenemos para vos.' },
  'colombian-spanish-voice': { kw: ['colombian', 'latin', 'spanish'], sample: '¡Hola parce! Hoy te cuento cómo mejorar tus ventas en redes.' },
  'castilian-spanish-voice': { kw: ['castilian', 'spain', 'peninsular', 'spanish'], sample: '¡Hola a todos! Hoy os traigo las mejores ofertas de la temporada.' },
  'portuguese-text-to-speech': { kw: ['portuguese', 'brazil'], sample: 'Olá! Seja bem-vindo à nossa loja. Confira as ofertas de hoje.' },
};
let voiceCache = null;
function ttsTool(id) {
  return async (root) => {
    const p = TTS[id];
    root.innerHTML = '<div class="spinner"></div>';
    try { voiceCache ??= (await api('/api/ai/voices')).voices; } catch (ex) {
      root.innerHTML = `<div class="check bad">${esc(ex.message)} <button class="ghost small" data-ft-go="aikeys">Isi key ElevenLabs di AI &amp; API Keys</button></div>`;
      return;
    }
    const text = (v) => `${v.name} ${JSON.stringify(v.labels || {})} ${v.description || ''}`.toLowerCase();
    const score = (v) => (p.not?.some((k) => text(v).includes(k)) ? -1 : p.kw.filter((k) => text(v).includes(k)).length);
    const voices = [...voiceCache].sort((a, b) => score(b) - score(a));
    const opt = (v) => `<option value="${esc(v.id)}">${score(v) > 0 && p.kw.length ? '★ ' : ''}${esc(v.name)}${v.labels?.gender ? ` · ${esc(v.labels.gender)}` : ''}${v.labels?.accent ? ` · ${esc(v.labels.accent)}` : ''}${v.labels?.age ? ` · ${esc(v.labels.age)}` : ''}</option>`;
    root.innerHTML = `<form><div class="form-grid">${field('Suara', `<select name="voice">${voices.map(opt).join('')}</select>`, p.kw.length ? '★ = paling cocok untuk preset ini' : '')}
      ${field('Model', select('model', [['eleven_multilingual_v2', 'Multilingual v2 (paling natural)'], ['eleven_turbo_v2_5', 'Turbo v2.5 (cepat, murah)'], ['eleven_flash_v2_5', 'Flash v2.5 (tercepat)']]))}</div>
      ${area('text', 'Naskah…', 6, p.sample)}<div class="row-between"><span class="hint mono" data-ft-count></span><button class="primary ai">🎙 Buat suara</button></div></form><div class="ft-out"></div>`;
    const count = () => { $('[data-ft-count]', root).textContent = `${$('[name=text]', root).value.length} / 5.000 karakter`; };
    $('[name=text]', root).addEventListener('input', count);
    count();
    $('form', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = vals(root);
      const btn = $('button.primary', root);
      btn.disabled = true;
      $('.ft-out', root).insertAdjacentHTML('afterbegin', '<div class="spinner" data-ft-spin></div>');
      try {
        const r = await api('/api/ai/tts', json('POST', { text: v.text, voice_id: v.voice, model: v.model }));
        $('.ft-out', root).insertAdjacentHTML('afterbegin', `<div class="card"><audio src="${esc(r.url)}" controls style="width:100%"></audio><div class="btn-row left"><a class="btn small" href="${esc(r.url)}" download="${id}.mp3" target="_blank" rel="noopener">Unduh MP3</a></div></div>`);
      } catch (ex) { toast(ex.message); }
      $('[data-ft-spin]', root)?.remove();
      btn.disabled = false;
    });
  };
}

// ======================= KALKULATOR =======================
function engagementRate(root) {
  root.innerHTML = `<form><div class="form-grid">${[['followers', 'Followers', '12000'], ['likes', 'Likes', '540'], ['comments', 'Komentar', '32'], ['shares', 'Share', '18'], ['saves', 'Save', '25'], ['views', 'Views / reach (opsional)', '9000'], ['posts', 'Jumlah post yang dijumlahkan', '1']].map(([k, l, ph]) => field(l, input(k, ph, '', 'text'))).join('')}</div></form><div class="ft-out"></div>`;
  live(root, (v) => {
    const eng = N(v.likes) + N(v.comments) + N(v.shares) + N(v.saves);
    const posts = Math.max(1, N(v.posts));
    const byF = N(v.followers) ? eng / posts / N(v.followers) : null;
    const byV = N(v.views) ? eng / N(v.views) : null;
    const tier = byF == null ? '' : byF >= 0.06 ? 'Sangat tinggi' : byF >= 0.03 ? 'Bagus' : byF >= 0.01 ? 'Rata-rata' : 'Rendah';
    out(root, kpis([{ label: 'ER per followers', value: pct(byF), sub: tier }, { label: 'ER per views', value: pct(byV), sub: 'lebih adil untuk TikTok/Reels' }, { label: 'Interaksi / post', value: fmt(eng / posts) }])
      + '<p class="hint">Patokan umum ER per followers: &lt;1% rendah · 1–3% rata-rata · 3–6% bagus · &gt;6% sangat tinggi. Akun kecil wajar lebih tinggi.</p>');
  });
}

function moneyCalc(kind) {
  return (root) => {
    const F = {
      tiktok: [['views', 'Views per bulan (video > 1 menit)', '500000'], ['rpm_low', 'RPM bawah (USD / 1.000 views)', '0.4'], ['rpm_high', 'RPM atas (USD / 1.000 views)', '1'], ['followers', 'Followers (untuk estimasi endorse)', '50000'], ['kurs', 'Kurs USD → Rp', '16300']],
      youtube: [['views', 'Views video panjang per bulan', '200000'], ['shorts', 'Views Shorts per bulan', '1000000'], ['rpm_low', 'RPM video panjang bawah (USD)', '0.5'], ['rpm_high', 'RPM video panjang atas (USD)', '2'], ['kurs', 'Kurs USD → Rp', '16300']],
      instagram: [['followers', 'Followers', '30000'], ['er', 'Engagement rate (%)', '3'], ['posts', 'Post sponsor per bulan', '4'], ['reels_views', 'Rata-rata views Reels', '15000']],
    }[kind];
    root.innerHTML = `<form><div class="form-grid">${F.map(([k, l, ph]) => field(l, input(k, ph, ph))).join('')}</div></form><div class="ft-out"></div>`;
    live(root, (v) => {
      if (kind === 'tiktok') {
        const lo = (N(v.views) / 1000) * N(v.rpm_low) * N(v.kurs);
        const hi = (N(v.views) / 1000) * N(v.rpm_high) * N(v.kurs);
        out(root, kpis([{ label: 'Creator Rewards / bulan', value: `${rp(lo)} – ${rp(hi)}`, sub: 'hanya views yang memenuhi syarat' }, { label: 'Estimasi tarif endorse / video', value: `${rp(N(v.followers) * 5)} – ${rp(N(v.followers) * 20)}`, sub: 'Rp5–20 per follower (pasar Indonesia, asumsi)' }]));
      } else if (kind === 'youtube') {
        const k = N(v.kurs);
        const lo = ((N(v.views) / 1000) * N(v.rpm_low) + (N(v.shorts) / 1000) * 0.03) * k;
        const hi = ((N(v.views) / 1000) * N(v.rpm_high) + (N(v.shorts) / 1000) * 0.08) * k;
        out(root, kpis([{ label: 'AdSense / bulan', value: `${rp(lo)} – ${rp(hi)}`, sub: 'Shorts dihitung RPM $0,03–0,08' }, { label: 'Per tahun', value: `${rp(lo * 12)} – ${rp(hi * 12)}` }]) + '<p class="hint">Syarat YPP: 1.000 subscriber + 4.000 jam tayang (12 bulan) atau 10 juta views Shorts (90 hari).</p>');
      } else {
        const erF = Math.max(0.3, Math.min(2, N(v.er) / 3));
        const lo = N(v.followers) * 8 * erF;
        const hi = N(v.followers) * 25 * erF;
        const reels = N(v.reels_views) * 30;
        out(root, kpis([{ label: 'Tarif 1 post feed', value: `${rp(lo)} – ${rp(hi)}`, sub: `disesuaikan ER (${fmt(erF, 2)}× patokan 3%)` }, { label: 'Tarif 1 Reels (CPV Rp30)', value: rp(reels) }, { label: 'Potensi / bulan', value: `${rp(lo * N(v.posts))} – ${rp(hi * N(v.posts))}` }]) + '<p class="hint">Estimasi kasar pasar Indonesia. Tarif nyata dipengaruhi niche, kualitas audiens, dan hak pakai konten.</p>');
      }
    });
  };
}

function kolRate(root) {
  const TYPES = [['video', 'Video feed / TikTok', 1], ['reels', 'Reels', 1], ['story', 'Story (3 frame)', 0.4], ['carousel', 'Foto / carousel', 0.7], ['live', 'Live 1 jam', 1.5], ['bundle', 'Bundle (video + story + live)', 2.2]];
  root.innerHTML = `<form><div class="form-grid">${field('Median views per konten', input('views', '20000', '20000'))}${field('Followers', input('followers', '50000', '50000'))}${field('Engagement rate (%)', input('er', '4', '4'))}
    ${field('Jenis konten', select('type', TYPES.map(([k, l]) => [k, l]), 'video'))}${field('Hak pakai iklan (whitelisting)', select('usage', [['0', 'Tidak'], ['0.3', '+30% (1 bulan)'], ['0.6', '+60% (3 bulan)']]))}${field('Eksklusif kategori', select('excl', [['0', 'Tidak'], ['0.2', '+20%']]))}</div></form><div class="ft-out"></div>`;
  live(root, (v) => {
    const mult = TYPES.find(([k]) => k === v.type)[2] * (1 + N(v.usage) + N(v.excl));
    const erAdj = Math.max(0.7, Math.min(1.4, N(v.er) / 4 || 1));
    const lo = N(v.views) * 15 * mult * erAdj;
    const hi = N(v.views) * 50 * mult * erAdj;
    const tier = N(v.followers) >= 1e6 ? 'Mega' : N(v.followers) >= 100e3 ? 'Macro' : N(v.followers) >= 10e3 ? 'Micro' : 'Nano';
    out(root, kpis([{ label: 'Fee wajar', value: `${rp(lo)} – ${rp(hi)}`, sub: 'median views × CPV Rp15–50 (asumsi)' }, { label: 'Tier', value: tier }, { label: 'CPM setara', value: `${rp((lo / Math.max(1, N(v.views))) * 1000)} – ${rp((hi / Math.max(1, N(v.views))) * 1000)}` }])
      + '<p class="hint">Pakai <b>median</b> views (bukan rata-rata) supaya satu video viral tidak menggelembungkan harga. Riset kreator lengkap ada di menu KOL &amp; Influencer.</p>');
  });
}

// ======================= GAMBAR =======================
function imageResizer(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Gambar', fileIn('img', 'image/*', true), 'Bisa pilih beberapa sekaligus')}${field('Ukuran tujuan', select('preset', IMG_PRESETS.map(([k, l, w, h]) => [k, `${l} (${w}×${h})`]).concat([['custom', 'Ukuran sendiri']])))}
    ${field('Lebar (ukuran sendiri)', input('w', '1080'))}${field('Tinggi (ukuran sendiri)', input('h', '1080'))}${field('Cara menyesuaikan', select('fit', [['cover', 'Isi penuh (potong tepi)'], ['contain', 'Utuh (tambah latar)']]))}${field('Warna latar', input('bg', '', '#ffffff', 'color'))}${field('Format', select('fmt', [['image/jpeg', 'JPG'], ['image/png', 'PNG'], ['image/webp', 'WebP']]))}</div>
    <div class="btn-row left"><button class="primary">Ubah ukuran & unduh</button></div></form><div class="ft-out"></div>`;
  $('form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = vals(root);
    const files = [...$('[name=img]', root).files];
    if (!files.length) return toast('Pilih gambar dulu');
    const p = IMG_PRESETS.find(([k]) => k === v.preset);
    const [w, h] = p ? [p[2], p[3]] : [N(v.w), N(v.h)];
    const thumbs = [];
    for (const f of files) {
      const img = await loadImg(f);
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      drawCover(c.getContext('2d'), img, w, h, v.fit, v.bg);
      const blob = await canvasBlob(c, v.fmt, 0.9);
      download(blob, `${f.name.replace(/\.\w+$/, '')}-${w}x${h}.${v.fmt.split('/')[1].replace('jpeg', 'jpg')}`);
      thumbs.push(`<figure><img src="${URL.createObjectURL(blob)}" alt=""><figcaption class="hint">${w}×${h} · ${size(blob.size)}</figcaption></figure>`);
    }
    out(root, `<div class="ft-thumbs">${thumbs.join('')}</div>`);
  });
}

function imageSizeGuide(root) {
  root.innerHTML = `<form>${fileIn('img', 'image/*')}</form><div class="ft-out"><p class="hint">Unggah gambar untuk dicek ke semua ukuran platform.</p></div>`;
  $('[name=img]', root).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const img = await loadImg(f);
    const r = img.width / img.height;
    out(root, kpis([{ label: 'Ukuran', value: `${img.width}×${img.height}` }, { label: 'Rasio', value: fmt(r, 3) }, { label: 'File', value: size(f.size) }])
      + `<div class="table-wrap"><table class="data"><thead><tr><th>Tujuan</th><th>Ideal</th><th>Rasio</th><th>Resolusi</th></tr></thead><tbody>${IMG_PRESETS.map(([, l, w, h]) => {
        const ok = Math.abs(r - w / h) / (w / h) < 0.02;
        const res = img.width >= w * 0.9;
        return `<tr><td>${l}</td><td>${w}×${h}</td><td>${ok ? '<span class="tag ok">pas</span>' : `<span class="tag bad">${r > w / h ? 'tepi kiri-kanan terpotong' : 'atas-bawah terpotong'}</span>`}</td><td>${res ? '<span class="tag ok">cukup</span>' : '<span class="tag bad">kurang tajam</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>`);
  });
}

function imageCrop(root) {
  const RATIOS = [['1:1', 1], ['4:5', 0.8], ['9:16', 9 / 16], ['16:9', 16 / 9], ['1.91:1', 1.91], ['2:3', 2 / 3]];
  root.innerHTML = `<form>${fileIn('img', 'image/*')}</form><div class="ft-out"><p class="hint">Unggah gambar untuk melihat bagian yang terpotong di tiap rasio (area gelap = terpotong).</p></div>`;
  $('[name=img]', root).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const img = await loadImg(f);
    const tiles = RATIOS.map(([l, r]) => {
      const W = 320;
      const H = Math.round((W * img.height) / img.width);
      const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      let cw = W;
      let ch = W / r;
      if (ch > H) { ch = H; cw = H * r; }
      const x = (W - cw) / 2;
      const y = (H - ch) / 2;
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(0, 0, W, y); ctx.fillRect(0, y + ch, W, H - y - ch); ctx.fillRect(0, y, x, ch); ctx.fillRect(x + cw, y, W - x - cw, ch);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, cw, ch);
      const lost = 1 - (cw * ch) / (W * H);
      return `<figure><img src="${c.toDataURL()}" alt=""><figcaption><b>${l}</b> <span class="hint">${pct(lost)} terpotong</span></figcaption></figure>`;
    });
    out(root, `<div class="ft-thumbs">${tiles.join('')}</div>`);
  });
}

const SAFE = {
  youtube: { name: 'Thumbnail YouTube', zones: [[0.8, 0.85, 0.2, 0.15, 'durasi'], [0, 0.9, 1, 0.1, 'progress bar']] },
  tiktok: { name: 'TikTok / Reels / Shorts 9:16', zones: [[0, 0, 1, 0.13, 'header'], [0, 0.7, 1, 0.3, 'caption & musik'], [0.85, 0.35, 0.15, 0.45, 'tombol like/komen']] },
  story: { name: 'Story IG/FB', zones: [[0, 0, 1, 0.14, 'profil'], [0, 0.82, 1, 0.18, 'balas pesan']] },
  igfeed: { name: 'Feed IG 4:5 di grid profil (3:4)', zones: [[0, 0, 1, 0.0625, 'terpotong di grid'], [0, 0.9375, 1, 0.0625, 'terpotong di grid']] },
};
function thumbnailSafeZone(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Gambar / frame', fileIn('img', 'image/*'))}${field('Tempat tayang', select('t', Object.entries(SAFE).map(([k, s]) => [k, s.name])))}</div></form><div class="ft-out"><p class="hint">Unggah gambar. Area merah tertutup UI aplikasi: jangan taruh teks/wajah penting di sana.</p></div>`;
  let img = null;
  const draw = () => {
    if (!img) return;
    const s = SAFE[$('[name=t]', root).value];
    const W = 360;
    const H = Math.round((W * img.height) / img.width);
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);
    ctx.font = '11px sans-serif';
    for (const [x, y, w, h, l] of s.zones) {
      ctx.fillStyle = 'rgba(220,38,38,.45)'; ctx.fillRect(x * W, y * H, w * W, h * H);
      ctx.fillStyle = '#fff'; ctx.fillText(l, x * W + 4, y * H + 13);
    }
    out(root, `<div class="ft-thumbs"><figure><img src="${c.toDataURL()}" alt=""><figcaption class="hint">${s.name}</figcaption></figure></div>`);
  };
  $('[name=img]', root).addEventListener('change', async (e) => { if (e.target.files[0]) { img = await loadImg(e.target.files[0]); draw(); } });
  $('[name=t]', root).addEventListener('change', draw);
}

const POWER = ['rahasia', 'cara', 'terbaik', 'gratis', 'mudah', 'cepat', 'jangan', 'wajib', 'terbukti', 'viral', 'pertama', 'kesalahan', 'review', 'vs', 'tips', 'trik', 'ternyata', 'baru'];
function thumbnailTitle(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Judul video', input('title', 'mis. 5 Kesalahan Jualan Online yang Bikin Rugi'))}${field('Teks di thumbnail', input('thumb', 'mis. JANGAN LAKUKAN INI!'))}</div></form><div class="ft-out"></div>`;
  live(root, ({ title, thumb }) => {
    const tw = (thumb.match(/\S+/g) || []).length;
    const tl = title.toLowerCase();
    const shared = (thumb.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []).filter((w) => tl.includes(w));
    out(root, `<div class="card">${checks([
      [glen(title) <= 70 && glen(title) > 0 ? true : null, `Judul ${glen(title)} karakter (≤ 60–70 supaya tidak terpotong di HP).`],
      [/\d/.test(title) ? true : null, /\d/.test(title) ? 'Ada angka di judul.' : 'Angka (mis. "5 cara") biasanya menaikkan CTR.'],
      [POWER.some((w) => tl.includes(w)) ? true : null, POWER.some((w) => tl.includes(w)) ? 'Ada kata pemicu rasa penasaran.' : 'Tambahkan kata pemicu: rahasia, kesalahan, ternyata, terbukti…'],
      [tw > 0 && tw <= 5 ? true : tw ? null : null, tw ? `Teks thumbnail ${tw} kata (ideal ≤ 4–5 kata, terbaca di layar kecil).` : 'Isi teks thumbnail (opsional).'],
      [shared.length <= 1 ? true : null, shared.length <= 1 ? 'Teks thumbnail melengkapi judul, tidak mengulang.' : `Thumbnail mengulang kata judul (${shared.join(', ')}). Lebih baik saling melengkapi.`],
      [glen(title) <= 100, `Batas keras judul YouTube: 100 karakter.`],
    ])}</div>`);
  });
}

function quoteToImage(root) {
  const THEMES = [['#111827', '#ffffff'], ['#fef3c7', '#78350f'], ['#4f46e5', '#ffffff'], ['#f1f5f9', '#0f172a'], ['#064e3b', '#ecfdf5'], ['#be123c', '#fff1f2']];
  root.innerHTML = `<form>${area('q', 'Tulis kutipan…', 3, 'Konsisten lebih penting daripada sempurna.')}<div class="form-grid">${field('Penulis', input('a', '', '— Tim AI'))}${field('Ukuran', select('size', [['1080x1080', 'Kotak 1:1'], ['1080x1350', 'Portrait 4:5'], ['1080x1920', 'Story 9:16']]))}
    ${field('Tema', select('theme', THEMES.map((t, i) => [String(i), `Tema ${i + 1}`])))}${field('Font', select('font', [['Georgia, serif', 'Serif'], ['Inter, system-ui, sans-serif', 'Sans'], ['"Courier New", monospace', 'Mesin ketik']]))}${field('Handle / watermark', input('wm', '', '@brandkamu'))}</div>
    <div class="btn-row left"><button class="primary">Unduh PNG</button></div></form><div class="ft-out"></div>`;
  const render = (v) => {
    const [w, h] = v.size.split('x').map(Number);
    const [bg, fg] = THEMES[N(v.theme)];
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg; ctx.textAlign = 'center';
    let size = 84;
    let lines;
    do { ctx.font = `600 ${size}px ${v.font}`; lines = wrapText(ctx, `“${v.q}”`, w * 0.8); size -= 4; } while (lines.length * size * 1.35 > h * 0.6 && size > 28);
    const lh = (size + 4) * 1.35;
    let y = h / 2 - ((lines.length - 1) * lh) / 2;
    for (const l of lines) { ctx.fillText(l, w / 2, y); y += lh; }
    ctx.font = `400 ${Math.round(size * 0.55)}px ${v.font}`; ctx.globalAlpha = 0.8; ctx.fillText(v.a, w / 2, y + lh * 0.3);
    ctx.font = `400 28px ${v.font}`; ctx.globalAlpha = 0.6; ctx.fillText(v.wm, w / 2, h - 60);
    return c;
  };
  live(root, (v) => out(root, `<div class="ft-thumbs"><figure><img src="${render(v).toDataURL()}" alt=""></figure></div>`));
  $('form', root).addEventListener('submit', async () => download(await canvasBlob(render(vals(root))), 'quote.png'));
}

function screenshotBackground(root) {
  const GRAD = [['#6366f1', '#ec4899'], ['#0ea5e9', '#22c55e'], ['#f59e0b', '#ef4444'], ['#111827', '#374151'], ['#e0e7ff', '#fce7f3']];
  root.innerHTML = `<form><div class="form-grid">${field('Screenshot', fileIn('img', 'image/*'))}${field('Latar', select('g', GRAD.map((g, i) => [String(i), `Gradasi ${i + 1}`])))}${field('Jarak tepi (px)', input('pad', '', '80'))}${field('Sudut bulat (px)', input('rad', '', '24'))}${field('Ukuran', select('size', [['auto', 'Ikuti screenshot'], ['1080x1080', 'Kotak 1:1'], ['1080x1350', '4:5'], ['1920x1080', '16:9']]))}</div>
    <div class="btn-row left"><button class="primary">Unduh PNG</button></div></form><div class="ft-out"><p class="hint">Unggah screenshot.</p></div>`;
  let img = null;
  const render = (v) => {
    const pad = N(v.pad);
    let [w, h] = v.size === 'auto' ? [img.width + pad * 2, img.height + pad * 2] : v.size.split('x').map(Number);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = c.getContext('2d');
    const [a, b] = GRAD[N(v.g)];
    const gr = ctx.createLinearGradient(0, 0, w, h); gr.addColorStop(0, a); gr.addColorStop(1, b);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    const s = Math.min((w - pad * 2) / img.width, (h - pad * 2) / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    const x = (w - dw) / 2;
    const y = (h - dh) / 2;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
    ctx.beginPath(); ctx.roundRect(x, y, dw, dh, N(v.rad)); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, dw, dh, N(v.rad)); ctx.clip(); ctx.drawImage(img, x, y, dw, dh); ctx.restore();
    return c;
  };
  const preview = (v) => img && out(root, `<div class="ft-thumbs"><figure><img src="${render(v).toDataURL()}" alt=""></figure></div>`);
  $('[name=img]', root).addEventListener('change', async (e) => { if (e.target.files[0]) { img = await loadImg(e.target.files[0]); preview(vals(root)); } });
  live(root, preview);
  $('form', root).addEventListener('submit', async (e) => { e.preventDefault(); if (img) download(await canvasBlob(render(vals(root))), 'screenshot.png'); });
}

function carouselMaker(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Gambar panorama', fileIn('img', 'image/*'))}${field('Jumlah slide', select('n', ['2', '3', '4', '5', '6', '7', '8', '9', '10'], '3'))}${field('Rasio slide', select('r', [['1080x1350', '4:5 (1080×1350)'], ['1080x1080', '1:1 (1080×1080)']]))}</div>
    <div class="btn-row left"><button class="primary">Potong & unduh semua slide</button></div></form><div class="ft-out"><p class="hint">Gambar lebar dipotong jadi beberapa slide yang menyambung mulus saat digeser (seamless carousel).</p></div>`;
  let img = null;
  const slices = (v) => {
    const [w, h] = v.r.split('x').map(Number);
    const n = N(v.n);
    const total = w * n;
    const s = Math.max(total / img.width, h / img.height);
    const ox = (total - img.width * s) / 2;
    const oy = (h - img.height * s) / 2;
    return Array.from({ length: n }, (_, i) => {
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      c.getContext('2d').drawImage(img, ox - i * w, oy, img.width * s, img.height * s);
      return c;
    });
  };
  const preview = (v) => img && out(root, `<div class="ft-strip">${slices(v).map((c, i) => `<figure><img src="${c.toDataURL('image/jpeg', 0.6)}" alt=""><figcaption class="hint">Slide ${i + 1}</figcaption></figure>`).join('')}</div>`);
  $('[name=img]', root).addEventListener('change', async (e) => { if (e.target.files[0]) { img = await loadImg(e.target.files[0]); preview(vals(root)); } });
  live(root, preview);
  $('form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!img) return toast('Pilih gambar dulu');
    const list = slices(vals(root));
    for (const [i, c] of list.entries()) { download(await canvasBlob(c, 'image/jpeg', 0.92), `carousel-${i + 1}.jpg`); await new Promise((r) => setTimeout(r, 300)); }
  });
}

function photoEditor(root) {
  const SL = [['brightness', 'Kecerahan', 0, 200, 100, '%'], ['contrast', 'Kontras', 0, 200, 100, '%'], ['saturate', 'Saturasi', 0, 200, 100, '%'], ['hue', 'Warna (hue)', -180, 180, 0, 'deg'], ['blur', 'Blur', 0, 10, 0, 'px'], ['sepia', 'Sepia', 0, 100, 0, '%'], ['grayscale', 'Hitam putih', 0, 100, 0, '%'], ['warm', 'Hangat', 0, 50, 0, '%']];
  root.innerHTML = `<form><div class="form-grid">${field('Foto', fileIn('img', 'image/*'))}${field('Putar', select('rot', [['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']]))}${field('Cermin', select('flip', [['1', 'Tidak'], ['-1', 'Ya']]))}${field('Format', select('fmt', [['image/jpeg', 'JPG'], ['image/png', 'PNG']]))}</div>
    <div class="form-grid">${SL.map(([k, l, mi, ma, d]) => field(l, `<input type="range" name="${k}" min="${mi}" max="${ma}" value="${d}">`)).join('')}</div>
    <div class="btn-row left"><button type="reset" class="ghost">Reset</button><button class="primary">Unduh hasil</button></div></form><div class="ft-out"><p class="hint">Unggah foto untuk mulai mengedit.</p></div>`;
  let img = null;
  const render = (v) => {
    const rot = N(v.rot);
    const side = rot % 180 !== 0;
    const c = Object.assign(document.createElement('canvas'), { width: side ? img.height : img.width, height: side ? img.width : img.height });
    const ctx = c.getContext('2d');
    ctx.filter = `brightness(${v.brightness}%) contrast(${v.contrast}%) saturate(${v.saturate}%) hue-rotate(${v.hue}deg) blur(${v.blur}px) sepia(${N(v.sepia) + N(v.warm)}%) grayscale(${v.grayscale}%)`;
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate((rot * Math.PI) / 180); ctx.scale(N(v.flip) || 1, 1);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    return c;
  };
  const preview = (v) => { if (!img) return; const c = render(v); out(root, `<div class="ft-thumbs"><figure><img src="${c.toDataURL('image/jpeg', 0.7)}" alt=""></figure></div>`); };
  $('[name=img]', root).addEventListener('change', async (e) => { if (e.target.files[0]) { img = await loadImg(e.target.files[0]); preview(vals(root)); } });
  live(root, preview);
  $('form', root).addEventListener('reset', () => setTimeout(() => preview(vals(root))));
  $('form', root).addEventListener('submit', async (e) => { e.preventDefault(); if (img) { const v = vals(root); download(await canvasBlob(render(v), v.fmt, 0.92), `edit.${v.fmt === 'image/png' ? 'png' : 'jpg'}`); } });
}

function feedPlanner(root) {
  root.innerHTML = `<form>${field('Tambah foto (urutan = dari terbaru)', fileIn('img', 'image/*', true))}</form><p class="hint">Seret untuk mengubah urutan. Foto paling atas kiri = postingan terbaru. Grid profil IG menampilkan potongan 3:4 dari foto 4:5.</p><div class="ft-out"></div>`;
  const items = [];
  const draw = () => {
    out(root, items.length ? `<div class="ft-feed">${items.map((src, i) => `<div class="ft-feed-cell" draggable="true" data-i="${i}"><img src="${src}" alt=""><button type="button" class="ft-x" data-ft-del="${i}" aria-label="Hapus">×</button></div>`).join('')}</div>` : '<p class="hint">Belum ada foto.</p>');
  };
  $('[name=img]', root).addEventListener('change', (e) => { items.unshift(...[...e.target.files].map((f) => URL.createObjectURL(f))); e.target.value = ''; draw(); });
  let from = null;
  root.addEventListener('dragstart', (e) => { from = Number(e.target.closest('[data-i]')?.dataset.i); });
  root.addEventListener('dragover', (e) => e.preventDefault());
  root.addEventListener('drop', (e) => {
    const to = Number(e.target.closest('[data-i]')?.dataset.i);
    if (Number.isNaN(to) || from == null) return;
    e.preventDefault();
    items.splice(to, 0, items.splice(from, 1)[0]);
    draw();
  });
  root.addEventListener('click', (e) => { if (e.target.dataset.ftDel) { items.splice(Number(e.target.dataset.ftDel), 1); draw(); } });
  draw();
}

function backgroundRemover(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Foto', fileIn('img', 'image/*'))}${field('Latar baru', select('bg', [['transparent', 'Transparan (PNG)'], ['#ffffff', 'Putih'], ['#000000', 'Hitam'], ['#f1f5f9', 'Abu muda']]))}</div>
    <div class="btn-row left"><button class="primary">Hapus latar</button></div></form><div class="ft-out"><p class="hint">Diproses di browser kamu (foto tidak diunggah ke server). Pertama kali perlu mengunduh model ±40 MB, jadi agak lama.</p></div>`;
  $('form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = $('[name=img]', root).files[0];
    if (!f) return toast('Pilih foto dulu');
    const btn = $('button.primary', root);
    btn.disabled = true;
    out(root, '<div class="spinner"></div><p class="hint">Memuat model & memproses…</p>');
    try {
      const { removeBackground } = await import('https://esm.sh/@imgly/background-removal@1.4.5');
      const cut = await removeBackground(f);
      let blob = cut;
      const bg = vals(root).bg;
      if (bg !== 'transparent') {
        const img = await loadImg(cut);
        const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
        const ctx = c.getContext('2d');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0);
        blob = await canvasBlob(c);
      }
      const url = URL.createObjectURL(blob);
      out(root, `<div class="ft-thumbs"><figure class="ft-checker"><img src="${url}" alt=""></figure></div><div class="btn-row left"><a class="btn small" href="${url}" download="tanpa-latar.png">Unduh PNG</a></div>`);
    } catch (ex) { out(root, `<div class="check bad">Gagal memproses: ${esc(ex.message)}</div>`); }
    btn.disabled = false;
  });
}

function mediaSearch(kind) {
  const SRC = kind === 'image'
    ? [['Google Images', 'https://www.google.com/search?tbm=isch&q='], ['Pinterest', 'https://id.pinterest.com/search/pins/?q='], ['Unsplash (gratis)', 'https://unsplash.com/s/photos/'], ['Pexels (gratis)', 'https://www.pexels.com/search/'], ['Pixabay (gratis)', 'https://pixabay.com/images/search/'], ['Freepik', 'https://www.freepik.com/search?query='], ['Canva', 'https://www.canva.com/photos/search/']]
    : [['YouTube', 'https://www.youtube.com/results?search_query='], ['TikTok', 'https://www.tiktok.com/search/video?q='], ['Instagram (hashtag)', 'https://www.instagram.com/explore/tags/'], ['Pinterest video', 'https://id.pinterest.com/search/videos/?q='], ['Pexels Video (gratis)', 'https://www.pexels.com/search/videos/'], ['Pixabay Video (gratis)', 'https://pixabay.com/videos/search/'], ['Meta Ad Library', 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ID&q='], ['TikTok Creative Center', 'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?keyword=']];
  return (root) => {
    root.innerHTML = `<form>${input('q', kind === 'image' ? 'mis. flat lay skincare' : 'mis. review madu anak')}</form><div class="ft-out"></div>`;
    live(root, ({ q }) => {
      const t = q.trim();
      out(root, t ? `<div class="ft-links">${SRC.map(([l, u]) => `<a class="btn" target="_blank" rel="noopener" href="${u}${encodeURIComponent(l.startsWith('Instagram') ? slug(t, '') : t)}">${l} ↗</a>`).join('')}</div><p class="hint">Sumber bertanda "gratis" boleh dipakai komersial sesuai lisensinya. Hasil Google/Pinterest biasanya berhak cipta.</p>` : '<p class="hint">Ketik kata kunci untuk mencari di banyak sumber sekaligus.</p>');
    });
  };
}

// ======================= VIDEO & AUDIO (diproses di browser, real-time) =======================
function recorderType(audioOnly) {
  const list = audioOnly ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'] : ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return list.find((t) => window.MediaRecorder?.isTypeSupported(t)) || '';
}
// Memutar video sekali (tanpa suara ke speaker) sambil merekam ulang: potong waktu, crop rasio, bitrate, filter audio.
async function processMedia(file, { start = 0, end = null, ratio = null, maxH = null, vbps = 2.5e6, audioOnly = false, denoise = false, onProgress }) {
  if (!window.MediaRecorder) throw new Error('Browser ini belum mendukung perekaman. Pakai Chrome/Edge terbaru.');
  const v = document.createElement('video');
  v.src = URL.createObjectURL(file);
  v.playsInline = true;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('File tidak bisa dibuka')); });
  const stop = Math.min(end || v.duration, v.duration);
  if (stop <= start) throw new Error('Waktu selesai harus setelah waktu mulai');
  const ac = new AudioContext();
  const src = ac.createMediaElementSource(v);
  const dest = ac.createMediaStreamDestination();
  let node = src;
  if (denoise) {
    const hp = Object.assign(ac.createBiquadFilter(), { type: 'highpass' }); hp.frequency.value = 90;
    const lp = Object.assign(ac.createBiquadFilter(), { type: 'lowpass' }); lp.frequency.value = 7500;
    const hum = Object.assign(ac.createBiquadFilter(), { type: 'notch' }); hum.frequency.value = 50;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -40; comp.ratio.value = 3;
    node.connect(hum); hum.connect(hp); hp.connect(lp); lp.connect(comp); node = comp;
  }
  node.connect(dest);
  const tracks = [...dest.stream.getAudioTracks()];
  let raf = 0;
  if (!audioOnly) {
    let sw = v.videoWidth;
    let sh = v.videoHeight;
    let sx = 0;
    let sy = 0;
    if (ratio) { if (sw / sh > ratio) { sx = (sw - sh * ratio) / 2; sw = sh * ratio; } else { sy = (sh - sw / ratio) / 2; sh = sw / ratio; } }
    const scale = maxH && sh > maxH ? maxH / sh : 1;
    const c = Object.assign(document.createElement('canvas'), { width: Math.round((sw * scale) / 2) * 2, height: Math.round((sh * scale) / 2) * 2 });
    const ctx = c.getContext('2d');
    const loop = () => { ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height); raf = requestAnimationFrame(loop); };
    loop();
    tracks.unshift(...c.captureStream(30).getVideoTracks());
  }
  const mime = recorderType(audioOnly);
  const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime || undefined, videoBitsPerSecond: vbps, audioBitsPerSecond: 128000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  v.currentTime = start;
  await new Promise((r) => { v.onseeked = r; });
  await ac.resume();
  rec.start(1000);
  await v.play();
  await new Promise((r) => {
    v.ontimeupdate = () => { onProgress?.((v.currentTime - start) / (stop - start)); if (v.currentTime >= stop) r(); };
    v.onended = r;
  });
  v.pause();
  cancelAnimationFrame(raf);
  await new Promise((r) => { rec.onstop = r; rec.stop(); });
  ac.close();
  URL.revokeObjectURL(v.src);
  const type = rec.mimeType || mime || (audioOnly ? 'audio/webm' : 'video/webm');
  return new File(chunks, `hasil.${type.includes('mp4') ? (audioOnly ? 'm4a' : 'mp4') : 'webm'}`, { type });
}

function mediaTool(mode) {
  const CFG = {
    trim: { label: 'Potong video', accept: 'video/*', fields: ['start', 'end'] },
    compress: { label: 'Kompres video', accept: 'video/*', fields: ['quality'] },
    reframe: { label: 'Ubah rasio video', accept: 'video/*', fields: ['ratio'] },
    extract: { label: 'Ambil audio', accept: 'video/*', fields: ['start', 'end'], audioOnly: true },
    music: { label: 'Ambil audio', accept: 'video/*', fields: ['start', 'end'], audioOnly: true },
    denoise: { label: 'Kurangi noise', accept: 'audio/*,video/*', fields: [], denoise: true },
    videoDenoise: { label: 'Kurangi noise', accept: 'video/*', fields: [], denoise: true },
  }[mode];
  const F = {
    start: field('Mulai (detik)', input('start', '0', '0')), end: field('Selesai (detik, kosong = akhir)', input('end', '')),
    quality: field('Kualitas', select('quality', [['1.2e6', 'Kecil (±9 MB/menit, 720p)'], ['2.5e6', 'Sedang (±19 MB/menit)'], ['5e6', 'Tinggi (±38 MB/menit)']], '1.2e6')),
    ratio: field('Rasio tujuan', select('ratio', [[String(9 / 16), '9:16 (Reels/TikTok/Shorts)'], ['1', '1:1'], ['0.8', '4:5'], [String(16 / 9), '16:9 (YouTube)']])),
  };
  return (root) => {
    root.innerHTML = `<form><div class="form-grid">${field('File', fileIn('f', CFG.accept))}${CFG.fields.map((k) => F[k]).join('')}</div>
      <div class="btn-row left"><button class="primary">${CFG.label}</button></div></form>
      <div class="ft-out"><p class="hint">Diproses langsung di browser (file tidak diunggah). Prosesnya berjalan sepanjang durasi video, jadi biarkan tab ini terbuka.${mode === 'music' ? ' Catatan: audio yang diambil adalah seluruh suara video (musik + suara). Pemisahan musik dari vokal butuh AI server dan belum tersedia.' : ''}${CFG.denoise ? ' Pengurang noise sederhana: membuang dengung listrik, suara rendah (angin/AC) dan desis tinggi.' : ''}</p></div>`;
    const f = $('[name=f]', root);
    f.addEventListener('change', () => {
      const file = f.files[0];
      if (!file) return;
      const el = document.createElement('video');
      el.src = URL.createObjectURL(file);
      el.onloadedmetadata = () => { out(root, `<p class="hint">${esc(file.name)} · ${fmt(el.duration, 1)} dtk · ${el.videoWidth ? `${el.videoWidth}×${el.videoHeight} · ` : ''}${size(file.size)}</p>`); if ($('[name=end]', root)) $('[name=end]', root).placeholder = fmt(el.duration, 1); };
    });
    $('form', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = f.files[0];
      if (!file) return toast('Pilih file dulu');
      const v = vals(root);
      const btn = $('button.primary', root);
      btn.disabled = true;
      out(root, '<div class="pbar"><span data-ft-prog style="width:0"></span></div><p class="hint">Memproses…</p>');
      try {
        const res = await processMedia(file, {
          start: N(v.start), end: v.end ? N(v.end) : null, ratio: v.ratio ? Number(v.ratio) : null, vbps: v.quality ? Number(v.quality) : 4e6,
          maxH: mode === 'compress' ? 1280 : 1920, audioOnly: !!CFG.audioOnly || (CFG.denoise && file.type.startsWith('audio/')), denoise: !!CFG.denoise,
          onProgress: (p) => { const el = $('[data-ft-prog]', root); if (el) el.style.width = `${Math.min(100, p * 100)}%`; },
        });
        const url = URL.createObjectURL(res);
        const name = `${file.name.replace(/\.\w+$/, '')}-${mode}.${res.name.split('.').pop()}`;
        out(root, `<div class="card">${res.type.startsWith('audio') ? `<audio src="${url}" controls style="width:100%"></audio>` : `<video src="${url}" controls class="ft-video"></video>`}
          <p class="hint">${size(res.size)} (asli ${size(file.size)}) · ${esc(res.type.split(';')[0])}</p><div class="btn-row left"><a class="btn small" href="${url}" download="${esc(name)}">Unduh</a></div></div>`);
      } catch (ex) { out(root, `<div class="check bad">${esc(ex.message)}</div>`); }
      btn.disabled = false;
    });
  };
}

function videoSpec(root) {
  root.innerHTML = `<form>${fileIn('f', 'video/*')}</form><div class="ft-out"><p class="hint">Unggah video untuk dicek ke spesifikasi tiap platform (file tidak diunggah).</p></div>`;
  $('[name=f]', root).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const v = document.createElement('video');
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => {
      const r = v.videoWidth / v.videoHeight;
      const mb = file.size / 1048576;
      out(root, kpis([{ label: 'Resolusi', value: `${v.videoWidth}×${v.videoHeight}` }, { label: 'Rasio', value: fmt(r, 3), sub: r < 0.7 ? 'vertikal' : r > 1.4 ? 'horizontal' : 'kotak/4:5' }, { label: 'Durasi', value: `${fmt(v.duration, 1)} dtk` }, { label: 'Ukuran', value: size(file.size), sub: `${fmt((file.size * 8) / v.duration / 1e6, 1)} Mbps` }])
        + `<div class="table-wrap"><table class="data"><thead><tr><th>Platform</th><th>Rasio</th><th>Durasi</th><th>Resolusi</th><th>Ukuran</th></tr></thead><tbody>${VIDEO_SPECS.map((s) => {
          const okR = !s.ratio || Math.abs(r - s.ratio) / s.ratio < 0.03;
          const tag = (ok, t) => `<span class="tag ${ok ? 'ok' : 'bad'}">${t}</span>`;
          return `<tr><td>${s.name}</td><td>${tag(okR, okR ? 'pas' : 'perlu reframe')}</td><td>${tag(v.duration <= s.maxSec, v.duration <= s.maxSec ? 'ok' : 'terlalu panjang')}</td><td>${tag(Math.min(v.videoWidth, v.videoHeight) >= s.minH, Math.min(v.videoWidth, v.videoHeight) >= s.minH ? 'ok' : 'terlalu kecil')}</td><td>${s.maxMB ? tag(mb <= s.maxMB, mb <= s.maxMB ? 'ok' : `maks ${s.maxMB} MB`) : '–'}</td></tr>`;
        }).join('')}</tbody></table></div><p class="hint">Rasio salah? Pakai <b>Video Reframe</b>. Terlalu besar? Pakai <b>Video Compressor</b>.</p>`);
    };
  });
}

// ======================= LINK & UTM =======================
function utmBuilder(root) {
  root.innerHTML = `<form><div class="form-grid">${field('URL tujuan *', input('url', 'https://tokokamu.com/produk'))}${field('utm_source *', input('source', 'instagram'), 'Asal: instagram, tiktok, facebook, newsletter')}${field('utm_medium *', input('medium', 'social'), 'Jenis: social, cpc, email, kol, affiliate')}
    ${field('utm_campaign *', input('campaign', 'promo_1212'))}${field('utm_content', input('content', 'reels_hook_a'), 'Pembeda materi (A/B)')}${field('utm_term', input('term', ''), 'Kata kunci (iklan search)')}${field('Huruf kecil semua', select('lower', [['1', 'Ya (disarankan)'], ['0', 'Tidak']]))}</div></form><div class="ft-out"></div>`;
  live(root, (v) => {
    if (!v.url) return out(root, '<p class="hint">Isi URL tujuan.</p>');
    let u;
    try { u = new URL(/^https?:\/\//.test(v.url) ? v.url : `https://${v.url}`); } catch { return out(root, '<div class="check bad">URL tidak valid</div>'); }
    const clean = (s) => { const t = s.trim().replace(/\s+/g, '_'); return v.lower === '1' ? t.toLowerCase() : t; };
    for (const k of ['source', 'medium', 'campaign', 'content', 'term']) if (v[k]) u.searchParams.set(`utm_${k}`, clean(v[k]));
    out(root, `<div class="card">${copyBox(u.toString(), 3)}${checks([[!!(v.source && v.medium && v.campaign), 'source, medium, dan campaign wajib diisi supaya terbaca rapi di GA4.'], [u.protocol === 'https:' ? true : null, 'Pakai https.']])}</div>`);
  });
}

function utmCampaignName(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Brand', input('brand', 'zestmag', state.brands?.find((b) => b.id === state.brandId)?.name || ''))}${field('Tujuan', select('obj', ['awareness', 'traffic', 'leads', 'sales', 'retargeting', 'launch']))}${field('Channel', select('ch', ['meta', 'tiktok', 'google', 'youtube', 'kol', 'affiliate', 'email', 'wa', 'organic']))}
    ${field('Produk / tema', input('prod', 'madu-anak'))}${field('Periode', input('date', '', new Date().toISOString().slice(0, 7)))}${field('Variasi (opsional)', input('var', 'hook-a'))}${field('Pemisah', select('sep', [['_', 'garis bawah _'], ['-', 'strip -']]))}</div></form><div class="ft-out"></div>`;
  live(root, (v) => {
    const parts = [v.brand, v.obj, v.ch, v.prod, v.date.replace('-', ''), v.var].filter(Boolean).map((p) => slug(p, v.sep === '_' ? '-' : '')).filter(Boolean);
    const name = parts.join(v.sep);
    out(root, `<div class="card">${copyBox(name, 2)}<p class="hint">Format: brand ${v.sep} tujuan ${v.sep} channel ${v.sep} produk ${v.sep} periode ${v.sep} variasi. Pakai format yang sama di semua tim supaya laporan GA4 &amp; iklan mudah dijumlahkan.</p></div>`);
  });
}

function linkGovernance(root) {
  root.innerHTML = `<form>${area('t', 'Tempel daftar link kampanye, satu per baris…', 8)}</form><div class="ft-out"></div>`;
  live(root, ({ t }) => {
    const lines = t.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!lines.length) return out(root, '<p class="hint">Tempel link untuk dicek.</p>');
    const seen = new Set();
    const camps = new Set();
    const rows = lines.map((l) => {
      const issues = [];
      let u;
      try { u = new URL(l); } catch { return [l, ['URL tidak valid']]; }
      if (u.protocol !== 'https:') issues.push('bukan https');
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) if (!u.searchParams.get(k)) issues.push(`${k} kosong`);
      for (const [k, val] of u.searchParams) {
        if (k.startsWith('utm_') && val !== val.toLowerCase()) issues.push(`${k} ada huruf besar`);
        if (k.startsWith('utm_') && /\s|%20|\+/.test(val)) issues.push(`${k} ada spasi`);
      }
      if (u.searchParams.get('utm_campaign')) camps.add(u.searchParams.get('utm_campaign'));
      if (seen.has(u.toString())) issues.push('duplikat');
      seen.add(u.toString());
      return [l, issues];
    });
    const bad = rows.filter(([, i]) => i.length).length;
    out(root, kpis([{ label: 'Link', value: fmt(rows.length) }, { label: 'Bermasalah', value: fmt(bad) }, { label: 'Nama campaign unik', value: fmt(camps.size), sub: [...camps].slice(0, 4).map(esc).join(', ') }])
      + `<div class="table-wrap"><table class="data"><tbody>${rows.map(([l, i]) => `<tr><td class="mono ft-break">${esc(l)}</td><td>${i.length ? i.map((x) => `<span class="tag bad">${esc(x)}</span>`).join(' ') : '<span class="tag ok">rapi</span>'}</td></tr>`).join('')}</tbody></table></div>`);
  });
}

const UN = {
  Instagram: [/^[a-z0-9._]{1,30}$/, 'https://www.instagram.com/', '1–30 karakter: huruf kecil, angka, titik, garis bawah'],
  TikTok: [/^[a-z0-9._]{2,24}$/, 'https://www.tiktok.com/@', '2–24 karakter: huruf, angka, titik, garis bawah'],
  'X / Twitter': [/^[a-z0-9_]{4,15}$/, 'https://x.com/', '4–15 karakter: huruf, angka, garis bawah'],
  Threads: [/^[a-z0-9._]{1,30}$/, 'https://www.threads.net/@', 'mengikuti username Instagram'],
  YouTube: [/^[a-z0-9._-]{3,30}$/, 'https://www.youtube.com/@', '3–30 karakter: huruf, angka, titik, strip, garis bawah'],
  Facebook: [/^[a-z0-9.]{5,50}$/, 'https://www.facebook.com/', 'min 5 karakter: huruf, angka, titik'],
  Pinterest: [/^[a-z0-9_]{3,30}$/, 'https://id.pinterest.com/', '3–30 karakter: huruf, angka, garis bawah'],
  LinkedIn: [/^[a-z0-9-]{3,100}$/, 'https://www.linkedin.com/in/', '3–100 karakter: huruf, angka, strip'],
  Telegram: [/^[a-z][a-z0-9_]{4,31}$/, 'https://t.me/', '5–32 karakter, diawali huruf'],
};
function usernameChecker(root) {
  root.innerHTML = `<form>${input('u', 'mis. tokomadusumbawa')}</form><div class="ft-out"></div>`;
  live(root, ({ u }) => {
    const n = u.trim().replace(/^@/, '').toLowerCase();
    if (!n) return out(root, '<p class="hint">Ketik username untuk dicek formatnya di semua platform.</p>');
    out(root, `<div class="table-wrap"><table class="data"><tbody>${Object.entries(UN).map(([p, [re, url, rule]]) => {
      const ok = re.test(n) && !/\.\.|^\.|\.$/.test(n);
      return `<tr><td><b>${p}</b><div class="hint">${rule}</div></td><td>${ok ? '<span class="tag ok">format valid</span>' : '<span class="tag bad">format tidak valid</span>'}</td><td>${ok ? `<a class="btn small" target="_blank" rel="noopener" href="${url}${encodeURIComponent(n)}">Cek apakah sudah dipakai ↗</a>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div><p class="hint">Kalau halaman profil terbuka, username sudah dipakai. Kalau muncul "halaman tidak ditemukan", kemungkinan masih tersedia.</p>`);
  });
}

// ======================= WAKTU & PERENCANAAN =======================
const TZ = [['Asia/Jakarta', 'WIB (Jakarta)'], ['Asia/Makassar', 'WITA (Makassar, Bali)'], ['Asia/Jayapura', 'WIT (Jayapura)'], ['Asia/Singapore', 'Singapura'], ['Asia/Kuala_Lumpur', 'Kuala Lumpur'], ['Asia/Manila', 'Manila'], ['Asia/Bangkok', 'Bangkok'], ['Asia/Hong_Kong', 'Hong Kong'], ['Asia/Tokyo', 'Tokyo'], ['Asia/Seoul', 'Seoul'], ['Asia/Riyadh', 'Riyadh / Makkah'], ['Asia/Dubai', 'Dubai'], ['Europe/London', 'London'], ['Europe/Amsterdam', 'Amsterdam'], ['America/New_York', 'New York'], ['America/Los_Angeles', 'Los Angeles'], ['Australia/Sydney', 'Sydney'], ['Asia/Taipei', 'Taipei']];
const tzOffset = (ms, tz) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(ms).map((x) => [x.type, x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};
function zonedToUtc(local, tz) {
  const [d, t = '00:00'] = local.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const first = guess - tzOffset(guess, tz);
  return guess - tzOffset(first, tz);
}
const fmtIn = (ms, tz) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function timezoneConverter(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Tanggal & jam', input('dt', '', nowLocal(), 'datetime-local'))}${field('Zona asal', select('from', TZ, 'Asia/Jakarta'))}</div></form><div class="ft-out"></div>`;
  live(root, ({ dt, from }) => {
    if (!dt) return;
    const ms = zonedToUtc(dt, from);
    out(root, `<div class="table-wrap"><table class="data"><tbody>${TZ.map(([z, l]) => `<tr${z === from ? ' class="ft-hl"' : ''}><td>${l}</td><td><b>${fmtIn(ms, z)}</b></td></tr>`).join('')}</tbody></table></div>`);
  });
}

function postingByTimezone(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Zona tim kamu', select('home', TZ, 'Asia/Jakarta'))}${field('Jam ideal di zona audiens', input('time', '', '19:00', 'time'))}${field('Tanggal', input('date', '', new Date().toISOString().slice(0, 10), 'date'))}</div>
    <div class="label">Audiens (centang & beri bobot %)</div><div class="form-grid">${TZ.map(([z, l], i) => `<label class="ft-tzw"><input type="checkbox" name="on_${i}" ${i < 3 ? 'checked' : ''}> ${l} <input name="w_${i}" value="${i === 0 ? 70 : i < 3 ? 15 : 10}" size="3"></label>`).join('')}</div></form><div class="ft-out"></div>`;
  live(root, (v) => {
    const sel = TZ.map(([z, l], i) => ({ z, l, w: N(v[`w_${i}`]), on: v[`on_${i}`] })).filter((x) => x.on);
    if (!sel.length) return out(root, '<p class="hint">Centang minimal satu zona audiens.</p>');
    const rows = sel.map((s) => ({ ...s, ms: zonedToUtc(`${v.date}T${v.time}`, s.z) }));
    const tw = rows.reduce((a, r) => a + r.w, 0) || 1;
    const avg = rows.reduce((a, r) => a + r.ms * r.w, 0) / tw;
    out(root, `<div class="table-wrap"><table class="data"><thead><tr><th>Audiens</th><th>Bobot</th><th>Posting di jam kamu</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.l}</td><td>${fmt((r.w / tw) * 100)}%</td><td><b>${fmtIn(r.ms, v.home)}</b></td></tr>`).join('')}</tbody></table></div>
      <div class="check ok">Jam kompromi (rata-rata berbobot): <b>${fmtIn(avg, v.home)}</b> di zona kamu.</div>`);
  });
}

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const GENERAL_SLOTS = {
  Instagram: 'Sen–Jum 11:00–13:00 & 19:00–21:00 WIB; Sabtu pagi 09:00–11:00.',
  TikTok: 'Setiap hari 12:00–13:00 & 18:00–22:00 WIB; puncak Jumat–Minggu malam.',
  YouTube: 'Upload 2–3 jam sebelum puncak: Jumat–Minggu 15:00–18:00 WIB.',
  Facebook: 'Sen–Jum 09:00–13:00 WIB.',
  'X / Twitter': 'Sen–Jum 08:00–10:00 & 12:00 WIB.',
  LinkedIn: 'Sel–Kam 08:00–10:00 WIB.',
};
function bestTimeSlot(root) {
  root.innerHTML = `<form>${area('t', 'Tempel data postinganmu: satu baris = tanggal jam, angka engagement/views\nContoh:\n2026-10-01 19:30, 1200\n2026-10-02 12:00, 800', 8)}</form><div class="ft-out"></div>`;
  live(root, ({ t }) => {
    const pts = t.split('\n').map((l) => { const m = /(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})[^\d]+([\d.,]+)/.exec(l); return m && { d: new Date(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}`), v: N(m[4]) }; }).filter(Boolean);
    const general = `<div class="card"><div class="label">Patokan umum (audiens Indonesia)</div>${Object.entries(GENERAL_SLOTS).map(([p, s]) => `<div><b>${p}:</b> <span class="hint">${s}</span></div>`).join('')}<p class="hint">Data akunmu sendiri selalu lebih akurat. Tempel minimal 20 postingan di atas.</p></div>`;
    if (pts.length < 3) return out(root, general);
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 8 }, () => []));
    for (const p of pts) grid[p.d.getDay()][Math.floor(p.d.getHours() / 3)].push(p.v);
    const avg = grid.map((r) => r.map((c) => (c.length ? c.reduce((a, b) => a + b, 0) / c.length : null)));
    const max = Math.max(...avg.flat().filter((x) => x != null));
    const top = avg.flatMap((r, d) => r.map((v, h) => ({ d, h, v }))).filter((x) => x.v != null).sort((a, b) => b.v - a.v).slice(0, 3);
    out(root, `<div class="check ok">Slot terbaik dari ${pts.length} postingan: ${top.map((x) => `<b>${DAYS[x.d]} ${String(x.h * 3).padStart(2, '0')}:00–${String(x.h * 3 + 3).padStart(2, '0')}:00</b> (rata-rata ${fmt(x.v)})`).join(' · ')}</div>
      <div class="table-wrap"><table class="data ft-heat"><thead><tr><th></th>${Array.from({ length: 8 }, (_, h) => `<th>${String(h * 3).padStart(2, '0')}</th>`).join('')}</tr></thead><tbody>${avg.map((r, d) => `<tr><td>${DAYS[d]}</td>${r.map((v) => `<td style="background:${v == null ? 'transparent' : `color-mix(in srgb, var(--accent) ${Math.round((v / max) * 80)}%, transparent)`}">${v == null ? '' : fmt(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${general}`);
  });
}

const FREQ = [['ig_feed', 'Instagram feed', 3, 5, 1.5], ['ig_reels', 'Instagram Reels', 3, 7, 2], ['ig_story', 'Instagram Story', 7, 21, 0.25], ['tiktok', 'TikTok', 5, 14, 1.5], ['yt', 'YouTube video panjang', 1, 2, 8], ['shorts', 'YouTube Shorts', 3, 7, 1], ['fb', 'Facebook', 3, 7, 0.5], ['x', 'X / Twitter', 7, 21, 0.2], ['li', 'LinkedIn', 2, 5, 1], ['threads', 'Threads', 5, 14, 0.2]];
function postFrequency(root) {
  root.innerHTML = `<form><div class="form-grid">${field('Jam kerja tim untuk konten / minggu', input('hours', '20', '20'))}${field('Target', select('goal', [['min', 'Minimal konsisten'], ['max', 'Agresif (tumbuh cepat)']]))}</div>
    <div class="label">Platform yang dikelola</div><div class="form-grid">${FREQ.map(([k, l], i) => `<label class="toggle"><input type="checkbox" name="${k}" ${i < 4 ? 'checked' : ''}> ${l}</label>`).join('')}</div></form><div class="ft-out"></div>`;
  live(root, (v) => {
    const sel = FREQ.filter(([k]) => v[k]);
    if (!sel.length) return out(root, '<p class="hint">Pilih platform.</p>');
    const want = sel.map(([k, l, lo, hi, hrs]) => ({ k, l, n: v.goal === 'max' ? hi : lo, hrs }));
    const need = want.reduce((a, x) => a + x.n * x.hrs, 0);
    const scale = Math.min(1, N(v.hours) / need);
    const plan = want.map((x) => ({ ...x, n: Math.max(1, Math.round(x.n * scale)) }));
    out(root, kpis([{ label: 'Jam dibutuhkan', value: `${fmt(need, 1)} jam`, sub: `tersedia ${fmt(N(v.hours))} jam` }, { label: 'Total posting / minggu', value: fmt(plan.reduce((a, x) => a + x.n, 0)) }])
      + (scale < 1 ? `<div class="check bad">Kapasitas tim kurang. Jumlah posting dikurangi ke ${pct(scale)} dari target. Pertimbangkan repurpose: 1 video → Reels + TikTok + Shorts.</div>` : '<div class="check ok">Kapasitas cukup.</div>')
      + `<div class="table-wrap"><table class="data"><thead><tr><th>Platform</th><th>/minggu</th>${DAYS.slice(1).concat(DAYS[0]).map((d) => `<th>${d}</th>`).join('')}</tr></thead><tbody>${plan.map((x) => {
        const days = Array(7).fill(0);
        for (let i = 0; i < x.n; i++) days[Math.floor((i * 7) / x.n) % 7]++;
        return `<tr><td>${x.l}</td><td><b>${x.n}</b></td>${days.map((d) => `<td>${d ? '●'.repeat(Math.min(d, 3)) : ''}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div><p class="hint">Estimasi jam per konten: feed 1,5 jam · Reels/TikTok 1,5–2 jam · video YouTube 8 jam · story 15 menit.</p>`);
  });
}

function contentCalendarTemplate(root) {
  const m = new Date();
  m.setMonth(m.getMonth() + 1);
  root.innerHTML = `<form><div class="form-grid">${field('Bulan', input('month', '', m.toISOString().slice(0, 7), 'month'))}${field('Posting per minggu', input('per', '5', '5'))}${field('Platform', input('plat', 'Instagram, TikTok', 'Instagram, TikTok'))}</div>
    ${field('Pilar konten (pisahkan koma)', input('pillars', '', 'Edukasi, Testimoni, Behind the scene, Promo, Hiburan'))}${field('Format (pisahkan koma)', input('formats', '', 'Reels, Carousel, Story, Foto'))}
    <div class="btn-row left"><button class="primary">Unduh CSV (buka di Excel/Sheets)</button></div></form><div class="ft-out"></div>`;
  const build = (v) => {
    const [y, mo] = v.month.split('-').map(Number);
    const days = new Date(y, mo, 0).getDate();
    const per = Math.max(1, Math.min(14, N(v.per)));
    const pillars = v.pillars.split(',').map((x) => x.trim()).filter(Boolean);
    const formats = v.formats.split(',').map((x) => x.trim()).filter(Boolean);
    const plats = v.plat.split(',').map((x) => x.trim()).filter(Boolean);
    const rows = [];
    let i = 0;
    for (let d = 1; d <= days; d++) {
      const dt = new Date(y, mo - 1, d);
      const dow = (dt.getDay() + 6) % 7;
      const slots = Math.floor(((dow + 1) * per) / 7) - Math.floor((dow * per) / 7);
      for (let s = 0; s < slots; s++, i++) rows.push([`${v.month}-${String(d).padStart(2, '0')}`, DAYS[dt.getDay()], plats[i % plats.length] || '', pillars[i % pillars.length] || '', formats[i % formats.length] || '', '', '', 'Ide']);
    }
    return rows;
  };
  const HEAD = ['Tanggal', 'Hari', 'Platform', 'Pilar', 'Format', 'Judul / ide', 'Caption', 'Status'];
  live(root, (v) => { const rows = build(v); out(root, `<p class="hint">${rows.length} slot konten.</p><div class="table-wrap"><table class="data"><thead><tr>${HEAD.slice(0, 5).map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.slice(0, 5).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); });
  $('form', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = vals(root);
    const csv = [HEAD, ...build(v)].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    download(new Blob([`﻿${csv}`], { type: 'text/csv' }), `kalender-konten-${v.month}.csv`);
  });
}

function contentBrief(root) {
  const F = [['title', 'Judul konten *', 'Review jujur madu anak'], ['goal', 'Tujuan', 'Awareness / engagement / penjualan'], ['audience', 'Target audiens', 'Ibu 25–35, punya balita'], ['platform', 'Platform & format', 'TikTok + Reels, video 30–45 dtk'],
    ['message', 'Pesan utama (1 kalimat)', ''], ['hook', 'Hook 3 detik pertama', ''], ['points', 'Poin isi', ''], ['cta', 'CTA', 'Klik keranjang kuning'], ['refs', 'Referensi / contoh', ''], ['donts', 'Yang harus dihindari', ''], ['deadline', 'Deadline', ''], ['pic', 'PIC', '']];
  root.innerHTML = `<form><div class="form-grid">${F.map(([k, l, ph]) => field(l, ['points', 'refs', 'donts'].includes(k) ? area(k, ph, 3) : input(k, ph))).join('')}</div>
    <div class="btn-row left"><button type="button" class="ghost" data-ft-dl>Unduh .md</button><button class="primary">Simpan ke Planner</button></div></form><div class="ft-out"></div>`;
  const md = (v) => `# Brief: ${v.title || '(tanpa judul)'}\n\n${F.slice(1).map(([k, l]) => `**${l.replace(' *', '')}:** ${v[k] || '-'}`).join('\n\n')}\n`;
  live(root, (v) => out(root, `<div class="card">${copyBox(md(v), 12)}</div>`));
  $('[data-ft-dl]', root).addEventListener('click', () => download(new Blob([md(vals(root))], { type: 'text/markdown' }), 'brief-konten.md'));
  $('form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = vals(root);
    if (!v.title) return toast('Isi judul konten');
    try { await api('/api/content', json('POST', { title: v.title, status: 'ide', notes: md(v) })); toast('Brief masuk Planner (kolom Ide)'); } catch (ex) { toast(ex.message); }
  });
}

// Momen marketing Indonesia & global. Tanggal hari besar Islam & Imlek = perkiraan (bisa bergeser 1 hari).
const MOMENTS = [
  ['01-01', 'Tahun Baru', 'Resolusi, rekap tahun, promo awal tahun'], ['02-14', 'Valentine', 'Hadiah pasangan, bundling couple'], ['03-08', "Hari Perempuan Internasional", 'Cerita perempuan di balik brand'],
  ['04-21', 'Hari Kartini', 'Kebaya day, apresiasi pelanggan perempuan'], ['05-01', 'Hari Buruh', 'Apresiasi tim'], ['05-02', 'Hari Pendidikan Nasional', 'Konten edukasi'],
  ['06-01', 'Hari Lahir Pancasila', 'Konten kebangsaan'], ['07-23', 'Hari Anak Nasional', 'Produk keluarga & anak'], ['08-17', 'HUT Kemerdekaan RI', 'Promo 17-an, lomba, merah putih'],
  ['10-02', 'Hari Batik Nasional', 'Pakai batik, kolaborasi UMKM'], ['10-28', 'Sumpah Pemuda', 'Kolaborasi anak muda'], ['10-31', 'Halloween', 'Konten kostum/kreatif'],
  ['11-10', 'Hari Pahlawan', 'Pahlawan versi pelanggan'], ['11-11', 'Promo 11.11', 'Flash sale marketplace'], ['12-12', 'Harbolnas 12.12', 'Promo terbesar akhir tahun'],
  ['12-22', 'Hari Ibu', 'Hadiah untuk ibu, testimoni ibu'], ['12-25', 'Natal', 'Hampers & hadiah'], ['12-31', 'Malam Tahun Baru', 'Rekap tahun & teaser'],
  ['2027-02-06', 'Imlek 2578 (perkiraan)', 'Angpao, warna merah, hampers'], ['2027-02-08', 'Awal Ramadan (perkiraan)', 'Konten sahur-buka, mulai jualan hampers'], ['2027-03-10', 'Idul Fitri (perkiraan)', 'THR, mudik, hampers lebaran'],
  ['2027-05-17', 'Idul Adha (perkiraan)', 'Konten berbagi'],
];
function marketingCalendar(root) {
  const today = new Date(new Date().toDateString());
  const year = today.getFullYear();
  const items = [];
  for (const [d, name, idea] of MOMENTS) {
    if (d.length === 5) for (const y of [year, year + 1]) items.push({ date: new Date(`${y}-${d}T00:00`), name, idea });
    else items.push({ date: new Date(`${d}T00:00`), name, idea });
  }
  for (let i = 1; i <= 12; i++) { // tanggal kembar (2.2, 3.3, …) & gajian tanggal 25
    const dt = new Date(year, today.getMonth() + i - 1, 1);
    const m = dt.getMonth() + 1;
    if (![11, 12].includes(m)) items.push({ date: new Date(dt.getFullYear(), m - 1, m), name: `Promo ${m}.${m}`, idea: 'Flash sale tanggal kembar marketplace' });
    items.push({ date: new Date(dt.getFullYear(), m - 1, 25), name: 'Gajian (payday)', idea: 'Payday sale, bundling hemat' });
  }
  const list = items.filter((x) => x.date >= today && x.date - today < 366 * 864e5).sort((a, b) => a.date - b.date);
  root.innerHTML = `<p class="hint">Momen 12 bulan ke depan. Mulai siapkan konten 2–4 minggu sebelumnya. Tanggal bertanda "perkiraan" menunggu penetapan resmi.</p>
    <div class="table-wrap"><table class="data"><thead><tr><th>Tanggal</th><th>Momen</th><th>Ide konten</th><th>Sisa</th><th></th></tr></thead><tbody>${list.map((x) => {
      const days = Math.round((x.date - today) / 864e5);
      return `<tr><td>${x.date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td><td><b>${esc(x.name)}</b></td><td class="hint">${esc(x.idea)}</td><td>${days === 0 ? 'hari ini' : `${days} hari`}${days <= 28 ? ' <span class="tag bad">siapkan</span>' : ''}</td><td><button class="ghost small" data-ft-plan="${esc(`${x.name}|${x.idea}|${x.date.toISOString().slice(0, 10)}`)}">→ Planner</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  root.addEventListener('click', async (e) => {
    const p = e.target.dataset.ftPlan;
    if (!p) return;
    const [name, idea, date] = p.split('|');
    try { await api('/api/content', json('POST', { title: `Konten ${name}`, status: 'ide', notes: `Momen: ${name} (${date})\nIde: ${idea}` })); e.target.textContent = '✓'; e.target.disabled = true; toast('Masuk Planner'); } catch (ex) { toast(ex.message); }
  });
}

// ======================= KATALOG =======================
const CATS = { ai: 'AI Teks', voice: 'Suara AI', text: 'Teks & Caption', calc: 'Kalkulator', image: 'Gambar', video: 'Video & Audio', plan: 'Waktu & Rencana', link: 'Link & UTM', na: 'Belum tersedia' };
const NA_DL = 'Mengunduh konten dari platform lain melanggar ketentuan layanan platform dan rawan diblokir, jadi tidak dipasang di TIM-AI. Minta file asli ke kreatornya.';
const NA_STEM = 'Memisahkan musik dari suara butuh model AI pemisah stem di server (GPU) dan belum dipasang. Alternatif: lalal.ai, vocalremover.org, atau CapCut (fitur "Pisahkan vokal").';
const NA_MON = 'Butuh akses API resmi platform yang belum tersambung di TIM-AI.';
const TOOLS = [
  ['hashtag-generator', 'Hashtag Generator', 'ai', 'Hashtag besar, menengah, dan niche dari topik kamu.', aiTool('hashtag-generator')],
  ['caption-hook-generator', 'Caption Hook Generator', 'ai', '10 kalimat pembuka yang bikin orang berhenti scroll.', aiTool('caption-hook-generator')],
  ['instagram-bio-generator', 'Instagram Bio Generator', 'ai', 'Pilihan bio ≤150 karakter lengkap dengan CTA.', aiTool('instagram-bio-generator')],
  ['ai-auto-reply', 'AI Auto Reply', 'ai', 'Balasan komentar/DM yang ramah dan sesuai brand.', aiTool('ai-auto-reply')],
  ['ai-auto-rewrite', 'AI Auto Rewrite', 'ai', 'Tulis ulang teks dengan gaya lain, 3 versi.', aiTool('ai-auto-rewrite')],
  ['cross-platform-post-adapter', 'Cross-Platform Post Adapter', 'ai', 'Satu postingan diadaptasi untuk 6 platform.', aiTool('cross-platform-post-adapter')],
  ['ai-content-label-checker', 'AI Content Label Checker', 'ai', 'Perlu label konten AI / paid partnership atau tidak?', aiTool('ai-content-label-checker')],
  ...Object.keys(TTS).map((k) => [k, { 'ai-voice-generator': 'AI Voice Generator', 'female-ai-voice': 'Female AI Voice', 'male-ai-voice': 'Male AI Voice', 'deep-voice-generator': 'Deep Voice Generator', 'kid-voice-generator': 'Kid Voice Generator', 'narrator-voice-generator': 'Narrator Voice Generator', 'podcast-intro-voice': 'Podcast Intro Voice', 'instagram-reels-voice': 'Instagram Reels Voice', 'tiktok-voice-generator': 'TikTok Voice Generator', 'youtube-voice-generator': 'YouTube Voice Generator', 'whatsapp-voice-message-generator': 'WhatsApp Voice Message', 'spanish-text-to-speech': 'Spanish Text to Speech', 'mexican-spanish-voice': 'Mexican Spanish Voice', 'argentine-spanish-voice': 'Argentine Spanish Voice', 'colombian-spanish-voice': 'Colombian Spanish Voice', 'castilian-spanish-voice': 'Castilian Spanish Voice', 'portuguese-text-to-speech': 'Portuguese Text to Speech' }[k], 'voice', 'Teks jadi suara (ElevenLabs), siap untuk konten.', ttsTool(k)]),
  ['character-counter', 'Character Counter', 'text', 'Hitung karakter, kata, hashtag, emoji + batas tiap platform.', characterCounter],
  ['caption-length-checker', 'Caption Length Checker', 'text', 'Cek panjang caption & bagian yang terlihat sebelum "selengkapnya".', captionLength],
  ['caption-readability-checker', 'Caption Readability Checker', 'text', 'Skor keterbacaan caption untuk dibaca di HP.', readability],
  ['hashtag-density-checker', 'Hashtag Density Checker', 'text', 'Jumlah, kepadatan, dan duplikat hashtag.', hashtagDensity],
  ['social-media-bio-length-checker', 'Bio Length Checker', 'text', 'Panjang bio dibanding batas 8 platform.', bioLength],
  ['link-in-bio-cta-checker', 'Link in Bio CTA Checker', 'text', 'Skor ajakan bertindak di bio kamu.', linkInBioCta],
  ['instagram-font-generator', 'Instagram Font Generator', 'text', '18 gaya huruf Unicode siap tempel.', fontGenerator],
  ['aesthetic-symbols', 'Aesthetic Symbols', 'text', 'Simbol, panah, bingkai, dan kaomoji sekali klik.', aestheticSymbols],
  ['platform-content-rules-checker', 'Platform Content Rules Checker', 'text', 'Deteksi engagement bait, klaim berisiko, kelebihan hashtag.', contentRules],
  ['platform-content-limits', 'Platform Content Limits', 'text', 'Tabel batas karakter, ukuran gambar & video semua platform.', platformLimits],
  ['post-preview', 'Post Preview', 'text', 'Lihat tampilan postingan sebelum diposting.', postPreview],
  ['engagement-rate-calculator', 'Engagement Rate Calculator', 'calc', 'ER per followers & per views.', engagementRate],
  ['instagram-money-calculator', 'Instagram Money Calculator', 'calc', 'Estimasi tarif endorse post & Reels.', moneyCalc('instagram')],
  ['tiktok-money-calculator', 'TikTok Money Calculator', 'calc', 'Estimasi Creator Rewards & tarif endorse.', moneyCalc('tiktok')],
  ['youtube-money-calculator', 'YouTube Money Calculator', 'calc', 'Estimasi AdSense video panjang + Shorts.', moneyCalc('youtube')],
  ['kol-rate-calculator', 'KOL Rate Calculator', 'calc', 'Fee wajar KOL dari median views.', kolRate],
  ['image-resizer', 'Image Resizer', 'image', '16 ukuran siap pakai, banyak gambar sekaligus.', imageResizer],
  ['image-size-guide-checker', 'Image Size Guide Checker', 'image', 'Cek gambar ke semua ukuran platform.', imageSizeGuide],
  ['image-crop-checker', 'Image Crop Checker', 'image', 'Lihat bagian yang terpotong di tiap rasio.', imageCrop],
  ['thumbnail-safe-zone-checker', 'Thumbnail Safe Zone Checker', 'image', 'Area yang tertutup UI YouTube/TikTok/Story.', thumbnailSafeZone],
  ['thumbnail-title-checker', 'Thumbnail Title Checker', 'image', 'Cek judul & teks thumbnail YouTube.', thumbnailTitle],
  ['quote-to-image', 'Quote to Image', 'image', 'Kutipan jadi gambar siap posting.', quoteToImage],
  ['screenshot-background', 'Screenshot Background', 'image', 'Screenshot + latar gradasi & bayangan.', screenshotBackground],
  ['carousel-maker', 'Carousel Maker', 'image', 'Potong gambar panorama jadi carousel menyambung.', carouselMaker],
  ['photo-video-editor', 'Photo Editor', 'image', 'Kecerahan, kontras, filter, putar, cermin.', photoEditor],
  ['instagram-feed-planner', 'Instagram Feed Planner', 'image', 'Atur urutan grid feed sebelum posting.', feedPlanner],
  ['background-remover', 'Background Remover', 'image', 'Hapus latar foto produk (di browser).', backgroundRemover],
  ['image-search', 'Image Search', 'image', 'Cari gambar di 7 sumber sekaligus.', mediaSearch('image')],
  ['video-search', 'Video Search', 'video', 'Cari video & iklan referensi di 8 sumber.', mediaSearch('video')],
  ['video-trimmer', 'Video Trimmer', 'video', 'Potong bagian video.', mediaTool('trim')],
  ['video-compressor', 'Video Compressor', 'video', 'Perkecil ukuran file video.', mediaTool('compress')],
  ['video-reframe', 'Video Reframe', 'video', 'Ubah video ke 9:16, 1:1, 4:5, atau 16:9.', mediaTool('reframe')],
  ['extract-audio-from-video', 'Extract Audio from Video', 'video', 'Ambil suara dari video.', mediaTool('extract')],
  ['extract-music-from-video', 'Extract Music from Video', 'video', 'Ambil audio dari video (tanpa pemisahan vokal).', mediaTool('music')],
  ['audio-noise-remover', 'Audio Noise Remover', 'video', 'Kurangi dengung, angin, dan desis.', mediaTool('denoise')],
  ['remove-noise-from-video', 'Remove Noise from Video', 'video', 'Bersihkan noise audio di video.', mediaTool('videoDenoise')],
  ['social-media-video-spec-checker', 'Video Spec Checker', 'video', 'Cek rasio, durasi, resolusi ke 7 platform.', videoSpec],
  ['utm-builder', 'UTM Builder', 'link', 'Link bertracking untuk GA4.', utmBuilder],
  ['utm-campaign-name-builder', 'UTM Campaign Name Builder', 'link', 'Nama campaign seragam untuk semua tim.', utmCampaignName],
  ['campaign-link-governance-checker', 'Campaign Link Governance Checker', 'link', 'Audit banyak link UTM sekaligus.', linkGovernance],
  ['bio-link-placement-checker', 'Bio Link Placement Checker', 'link', 'Apakah link kamu bisa diklik di platform itu?', bioLinkPlacement],
  ['username-checker', 'Username Checker', 'link', 'Cek format username di 9 platform.', usernameChecker],
  ['time-zone-converter', 'Time Zone Converter', 'plan', 'Konversi jam ke 18 zona waktu.', timezoneConverter],
  ['posting-time-by-timezone-planner', 'Posting Time by Timezone', 'plan', 'Jam posting untuk audiens lintas zona.', postingByTimezone],
  ['best-time-slot-finder', 'Best Time Slot Finder', 'plan', 'Heatmap jam terbaik dari data postinganmu.', bestTimeSlot],
  ['post-frequency-planner', 'Post Frequency Planner', 'plan', 'Jumlah posting sesuai kapasitas tim.', postFrequency],
  ['social-media-content-calendar-template', 'Content Calendar Template', 'plan', 'Kalender 1 bulan siap diisi (CSV).', contentCalendarTemplate],
  ['social-media-content-brief-template', 'Content Brief Template', 'plan', 'Brief konten → simpan ke Planner.', contentBrief],
  ['social-media-marketing-calendar', 'Marketing Calendar', 'plan', 'Momen marketing Indonesia 12 bulan ke depan.', marketingCalendar],
  ['tiktok-post-monitor', 'TikTok Post Monitor', 'na', 'Pantau views & engagement video TikTok.', { go: 'tiktok', note: 'Sudah ada di TIM-AI: menu Scraper TikTok.' }],
  ['youtube-post-monitor', 'YouTube Post Monitor', 'na', 'Pantau video YouTube.', { go: 'analytics', note: 'Channel YouTube yang tersambung bisa dipantau di menu Analitik. Untuk channel lain: ' + NA_MON }],
  ['x-post-monitor', 'X Post Monitor', 'na', 'Pantau postingan X.', { note: NA_MON }],
  ['telegram-post-monitor', 'Telegram Post Monitor', 'na', 'Pantau channel Telegram.', { note: NA_MON }],
  ['telegram-registration-checker', 'Telegram Registration Checker', 'na', 'Cek nomor terdaftar di Telegram.', { note: 'Memeriksa nomor telepon orang lain menyentuh data pribadi, jadi tidak dipasang.' }],
  ['tiktok-transcript-downloader', 'TikTok Transcript Downloader', 'na', 'Ambil transkrip video TikTok.', { note: NA_DL }],
  ['youtube-transcript-downloader', 'YouTube Transcript Downloader', 'na', 'Ambil transkrip video YouTube.', { note: 'Buka video di YouTube → ⋯ → "Tampilkan transkrip", lalu salin. ' + NA_MON }],
  ['photo-video-downloader', 'Photo & Video Downloader', 'na', 'Unduh foto/video dari sosmed.', { note: NA_DL }],
  ['publer-video-downloader', 'Publer Video Downloader', 'na', 'Unduh video lewat Publer.', { note: NA_DL }],
  ['download-and-remove-music-from-video', 'Download & Remove Music', 'na', 'Unduh video lalu buang musiknya.', { note: `${NA_DL} ${NA_STEM}` }],
  ['remove-background-music-from-video', 'Remove Background Music', 'na', 'Buang musik latar, sisakan suara.', { note: NA_STEM }],
  ['ai-voice-changer', 'AI Voice Changer', 'na', 'Ubah suara rekaman jadi suara lain.', { note: 'Butuh endpoint speech-to-speech ElevenLabs yang belum dipasang. Sementara: pakai AI Voice Generator dengan naskah yang sama.' }],
];

// ---------- Halaman ----------
// Tim yang memakai tiap tool (tool bisa dipakai lebih dari satu tim). Urutan = tim utama dulu.
const TEAMS = { konten: 'Konten', medsos: 'Medsos', digital: 'Digital', adv: 'ADV', mp: 'MP', kol: 'KOL', affiliate: 'Affiliate', cs: 'CS', founder: 'Founder' };
const TEAM_OF = {
  'hashtag-generator': 'medsos konten', 'caption-hook-generator': 'konten medsos adv', 'instagram-bio-generator': 'medsos kol affiliate', 'ai-auto-reply': 'cs medsos',
  'ai-auto-rewrite': 'konten medsos adv', 'cross-platform-post-adapter': 'medsos konten', 'ai-content-label-checker': 'konten adv kol',
  'ai-voice-generator': 'konten adv', 'female-ai-voice': 'konten adv', 'male-ai-voice': 'konten adv', 'deep-voice-generator': 'konten', 'kid-voice-generator': 'konten',
  'narrator-voice-generator': 'konten digital', 'podcast-intro-voice': 'konten', 'instagram-reels-voice': 'konten medsos', 'tiktok-voice-generator': 'konten affiliate',
  'youtube-voice-generator': 'konten', 'whatsapp-voice-message-generator': 'cs', 'spanish-text-to-speech': 'konten adv', 'mexican-spanish-voice': 'konten adv',
  'argentine-spanish-voice': 'konten adv', 'colombian-spanish-voice': 'konten adv', 'castilian-spanish-voice': 'konten adv', 'portuguese-text-to-speech': 'konten adv',
  'character-counter': 'medsos konten adv', 'caption-length-checker': 'medsos konten', 'caption-readability-checker': 'konten medsos', 'hashtag-density-checker': 'medsos',
  'social-media-bio-length-checker': 'medsos kol affiliate', 'link-in-bio-cta-checker': 'medsos digital', 'instagram-font-generator': 'medsos konten', 'aesthetic-symbols': 'medsos konten',
  'platform-content-rules-checker': 'medsos adv kol', 'platform-content-limits': 'medsos konten adv', 'post-preview': 'medsos konten kol',
  'engagement-rate-calculator': 'medsos kol affiliate', 'instagram-money-calculator': 'kol founder', 'tiktok-money-calculator': 'kol affiliate founder', 'youtube-money-calculator': 'kol founder', 'kol-rate-calculator': 'kol affiliate',
  'image-resizer': 'konten mp adv', 'image-size-guide-checker': 'konten adv mp', 'image-crop-checker': 'konten adv', 'thumbnail-safe-zone-checker': 'konten adv', 'thumbnail-title-checker': 'konten',
  'quote-to-image': 'konten medsos', 'screenshot-background': 'konten digital cs', 'carousel-maker': 'konten medsos', 'photo-video-editor': 'konten mp', 'instagram-feed-planner': 'medsos konten',
  'background-remover': 'mp konten adv', 'image-search': 'konten adv mp', 'video-search': 'konten adv', 'video-trimmer': 'konten kol affiliate', 'video-compressor': 'konten cs kol',
  'video-reframe': 'konten adv', 'extract-audio-from-video': 'konten', 'extract-music-from-video': 'konten', 'audio-noise-remover': 'konten', 'remove-noise-from-video': 'konten kol',
  'social-media-video-spec-checker': 'konten adv kol', 'utm-builder': 'digital adv kol affiliate', 'utm-campaign-name-builder': 'digital adv', 'campaign-link-governance-checker': 'digital adv founder',
  'bio-link-placement-checker': 'medsos digital', 'username-checker': 'medsos digital founder', 'time-zone-converter': 'medsos founder', 'posting-time-by-timezone-planner': 'medsos',
  'best-time-slot-finder': 'medsos', 'post-frequency-planner': 'medsos founder', 'social-media-content-calendar-template': 'medsos konten', 'social-media-content-brief-template': 'konten kol',
  'social-media-marketing-calendar': 'medsos mp adv founder', 'tiktok-post-monitor': 'medsos kol affiliate', 'youtube-post-monitor': 'medsos', 'x-post-monitor': 'medsos', 'telegram-post-monitor': 'medsos',
  'telegram-registration-checker': 'cs', 'tiktok-transcript-downloader': 'konten', 'youtube-transcript-downloader': 'konten', 'photo-video-downloader': 'konten', 'publer-video-downloader': 'konten',
  'download-and-remove-music-from-video': 'konten', 'remove-background-music-from-video': 'konten', 'ai-voice-changer': 'konten',
};
const teamsOf = (id) => (TEAM_OF[id] || '').split(' ').filter(Boolean);
const myTeam = () => (TEAMS[state.me?.user.team] ? state.me.user.team : 'all');
const ui = { q: '', team: null, cat: 'all', open: null };
function card([id, name, cat, desc]) {
  return `<button class="ft-card" data-ft-open="${id}"><span class="ft-cat ${cat}">${CATS[cat]}</span><b>${esc(name)}</b><span class="hint">${esc(desc)}</span>
    <span class="ft-teams">${teamsOf(id).map((t) => `<span class="${t === ui.team ? 'on' : ''}">${TEAMS[t]}</span>`).join('')}</span></button>`;
}
function drawCatalog() {
  const root = $('#view-freetools');
  ui.team ??= myTeam();
  const q = ui.q.toLowerCase();
  const byTeam = TOOLS.filter((t) => ui.team === 'all' || teamsOf(t[0]).includes(ui.team));
  const list = byTeam.filter((t) => (ui.cat === 'all' || t[2] === ui.cat) && (!q || `${t[1]} ${t[3]}`.toLowerCase().includes(q)));
  // Dikelompokkan per jenis alat supaya tiap tim melihat rincian tools-nya.
  const groups = Object.keys(CATS).map((c) => [c, list.filter((t) => t[2] === c)]).filter(([, l]) => l.length);
  const chip = (attr, k, l, n, active) => `<button data-${attr}="${k}" class="${active ? 'active' : ''}">${l} <span class="ft-n">${n}</span></button>`;
  root.innerHTML = `<div class="page-head"><div><h1>Free Tools</h1><p class="hint">${TOOLS.filter((t) => t[2] !== 'na').length} alat siap pakai, dikelompokkan per tim yang memakainya. Hampir semuanya diproses di browser kamu.</p></div></div>
    <input class="ft-search" type="search" placeholder="Cari alat… (mis. hashtag, resize, UTM)" value="${esc(ui.q)}" data-ft-search>
    <div class="label">Tim</div>
    <div class="ft-chips">${chip('ft-team', 'all', 'Semua tim', TOOLS.length, ui.team === 'all')}${Object.entries(TEAMS).map(([k, l]) => chip('ft-team', k, `${l}${k === myTeam() ? ' (timku)' : ''}`, TOOLS.filter((t) => teamsOf(t[0]).includes(k)).length, ui.team === k)).join('')}</div>
    <div class="ft-chips small">${chip('ft-cat', 'all', 'Semua jenis', byTeam.length, ui.cat === 'all')}${Object.entries(CATS).map(([k, l]) => [k, l, byTeam.filter((t) => t[2] === k).length]).filter(([, , n]) => n).map(([k, l, n]) => chip('ft-cat', k, l, n, ui.cat === k)).join('')}</div>
    ${groups.map(([c, l]) => `<div class="ft-group"><h3>${CATS[c]} <span class="hint">${l.length}</span></h3><div class="ft-grid">${l.map(card).join('')}</div></div>`).join('') || '<p class="hint">Tidak ada alat yang cocok.</p>'}`;
}
function openTool(id) {
  const t = TOOLS.find((x) => x[0] === id);
  if (!t) return drawCatalog();
  ui.open = id;
  const root = $('#view-freetools');
  root.innerHTML = `<div class="page-head"><div><button class="ghost small" data-ft-back>← Semua tools</button><h1>${esc(t[1])}</h1><p class="hint">${esc(t[3])}</p></div></div><div class="card ft-body"></div>`;
  const body = $('.ft-body', root);
  if (typeof t[4] === 'function') Promise.resolve(t[4](body)).catch((ex) => { body.innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; });
  else body.innerHTML = `<div class="check">${esc(t[4].note)}</div>${t[4].go ? `<button class="primary" data-ft-go="${t[4].go}">Buka menu terkait</button>` : ''}`;
  try { localStorage.setItem('timai.freetool', id); } catch { /* mode privat */ }
}

const root = $('#view-freetools');
root.addEventListener('click', (e) => {
  const d = e.target.closest('[data-ft-open],[data-ft-back],[data-ft-cat],[data-ft-team],[data-ft-go],[data-ft-copy],[data-ft-copyval]')?.dataset || {};
  if (d.ftOpen) { openTool(d.ftOpen); window.scrollTo(0, 0); }
  if (d.ftBack !== undefined) { ui.open = null; try { localStorage.removeItem('timai.freetool'); } catch { /* mode privat */ } drawCatalog(); }
  if (d.ftCat) { ui.cat = d.ftCat; drawCatalog(); }
  if (d.ftTeam) { ui.team = d.ftTeam; ui.cat = 'all'; drawCatalog(); }
  if (d.ftGo) S.show(d.ftGo);
  const copy = d.ftCopyval ?? (d.ftCopy !== undefined ? e.target.closest('.ft-copy')?.querySelector('textarea')?.value : null);
  if (copy != null) navigator.clipboard.writeText(copy).then(() => toast('Disalin ✓'), () => toast('Gagal menyalin'));
});
root.addEventListener('input', (e) => {
  if (e.target.dataset.ftSearch === undefined) return;
  ui.q = e.target.value;
  const pos = e.target.selectionStart;
  drawCatalog();
  const s = $('[data-ft-search]', root);
  s.focus();
  s.setSelectionRange(pos, pos);
});
S.viewHooks.freetools = () => {
  if (ui.open) return;
  let last = null;
  try { last = localStorage.getItem('timai.freetool'); } catch { /* mode privat */ }
  if (last && TOOLS.some((t) => t[0] === last)) openTool(last);
  else drawCatalog();
};
