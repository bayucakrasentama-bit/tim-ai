// Mesin Video Motion: menyusun timeline (caption kata kunci, b-roll, efek) lalu menggambar tiap frame ke canvas.
// Semua jalan di browser. Dipakai oleh motion.js (tampilan) untuk preview dan render.

export const RATIOS = {
  '9:16': { w: 1080, h: 1920, label: 'Vertikal 9:16 (Reels, TikTok, Shorts)' },
  '1:1': { w: 1080, h: 1080, label: 'Kotak 1:1 (Feed)' },
  '16:9': { w: 1920, h: 1080, label: 'Landscape 16:9 (YouTube)' },
};

// Gaya editing siap pakai. size = tinggi huruf relatif ke sisi pendek video; pos = posisi caption (0 atas, 1 bawah).
export const STYLES = [
  { id: 'bold', name: 'Bold', desc: 'Huruf tebal, kata kunci kuning, ada shake', font: 'Anton', upper: true, size: 0.105, color: '#ffffff', hl: '#ffd400', stroke: '#000000', anim: 'pop', pos: 0.7, mode: 'chunk', zoom: true, shake: true, glitch: false, angle: true, transition: 'zoom', broll: 'full' },
  { id: 'glow', name: 'Glow Editorial', desc: 'Serif miring dengan cahaya lembut', font: 'Playfair Display', italic: true, weight: 700, size: 0.085, color: '#fff7ed', hl: '#f9a8d4', glow: '#f472b6', anim: 'fade', pos: 0.72, mode: 'chunk', zoom: true, shake: false, glitch: false, angle: true, transition: 'fade', broll: 'full' },
  { id: 'produk', name: 'Produk', desc: 'Kotak warna brand, jelas buat jualan', font: 'Montserrat', weight: 800, upper: true, size: 0.07, color: '#ffffff', hl: '#fde047', box: 'brand', anim: 'slide', pos: 0.74, mode: 'chunk', zoom: true, shake: false, glitch: false, angle: true, transition: 'slide', broll: 'pip' },
  { id: 'authority', name: 'Authority', desc: 'Lower third rapi, buat expert & edukasi serius', font: 'Montserrat', weight: 700, size: 0.06, color: '#ffffff', hl: '#93c5fd', box: 'dark', anim: 'slide', pos: 0.8, mode: 'chunk', zoom: true, shake: false, glitch: false, angle: true, transition: 'fade', broll: 'full' },
  { id: 'tech', name: 'Tech Demo', desc: 'Font mono, cyan, efek glitch', font: 'Space Mono', weight: 700, upper: true, size: 0.07, color: '#e0f2fe', hl: '#22d3ee', stroke: '#020617', anim: 'type', pos: 0.7, mode: 'chunk', zoom: true, shake: false, glitch: true, angle: true, transition: 'flash', broll: 'full' },
  { id: 'athletic', name: 'Athletic', desc: 'Condensed merah, shake & flash kuat', font: 'Bebas Neue', upper: true, size: 0.13, color: '#ffffff', hl: '#ef4444', stroke: '#000000', anim: 'pop', pos: 0.66, mode: 'word', zoom: true, shake: true, glitch: true, angle: true, transition: 'flash', broll: 'full' },
  { id: 'edukasi', name: 'Edukasi', desc: 'Kotak putih, kata kunci warna brand', font: 'Montserrat', weight: 800, size: 0.068, color: '#111827', hl: 'brand', box: 'light', anim: 'pop', pos: 0.72, mode: 'chunk', zoom: true, shake: false, glitch: false, angle: true, transition: 'zoom', broll: 'pip' },
  { id: 'minimal', name: 'Minimal', desc: 'Kecil, bersih, tanpa efek berlebihan', font: 'Montserrat', weight: 600, size: 0.05, color: '#ffffff', hl: '#ffffff', shadow: true, anim: 'fade', pos: 0.82, mode: 'chunk', zoom: false, shake: false, glitch: false, angle: false, transition: 'fade', broll: 'full' },
  { id: 'podcast', name: 'Podcast', desc: 'Satu kata per waktu, kuning besar', font: 'Montserrat', weight: 900, upper: true, size: 0.11, color: '#ffffff', hl: '#facc15', stroke: '#000000', anim: 'pop', pos: 0.62, mode: 'word', zoom: true, shake: false, glitch: false, angle: true, transition: 'zoom', broll: 'pip' },
  { id: 'hype', name: 'Hype', desc: 'Kata raksasa, bounce, glitch', font: 'Anton', upper: true, size: 0.16, color: '#ffffff', hl: '#a3e635', stroke: '#000000', anim: 'bounce', pos: 0.5, mode: 'word', zoom: true, shake: true, glitch: true, angle: true, transition: 'flash', broll: 'full' },
  { id: 'luxury', name: 'Luxury', desc: 'Serif emas, gerak pelan & elegan', font: 'Cormorant Garamond', weight: 700, upper: true, size: 0.075, color: '#fefce8', hl: '#d4af37', shadow: true, anim: 'fade', pos: 0.76, mode: 'chunk', zoom: true, shake: false, glitch: false, angle: false, transition: 'fade', broll: 'full' },
  { id: 'story', name: 'Storytelling', desc: 'Ketik pelan seperti cerita', font: 'Montserrat', weight: 700, size: 0.062, color: '#ffffff', hl: '#fde68a', shadow: true, anim: 'type', pos: 0.75, mode: 'chunk', zoom: true, shake: false, glitch: false, angle: true, transition: 'fade', broll: 'full' },
];

export const FONT_URL = 'https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Cormorant+Garamond:wght@700&family=Montserrat:wght@600;700;800;900&family=Playfair+Display:ital,wght@1,700&family=Space+Mono:wght@700&display=swap';

const STOP = new Set(`kasih tahu bilang lainnya dulu biar coba gampang yang dan di ke dari ini itu aku kamu kita kami dia mereka ada adalah akan untuk dengan juga atau tapi tetapi karena jadi kalau kalo jika sudah udah belum masih bisa mau ingin buat bikin sama lagi aja saja dong deh kan nih tuh sih ya iya nggak gak tidak bukan banget sangat lebih paling semua semuanya hari mana apa siapa kenapa gimana bagaimana caranya cara terus lalu kemudian langsung halo hai oke ok the a an to of and is in it for you`.split(/\s+/));

const clean = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, '');
const NUMBER_WORDS = new Set('pertama kedua ketiga keempat kelima terakhir satu dua tiga empat lima enam tujuh delapan sembilan sepuluh seratus seribu sejuta ribu juta rb jt gratis diskon promo hemat murah'.split(' '));

// Skor kata kunci: angka, kata panjang, dan kata dari info produk lebih penting.
function keywordScore(word, boost) {
  const w = clean(word);
  if (!w || STOP.has(w)) return 0;
  let s = Math.min(w.length, 10);
  if (/\d/.test(w)) s += 10; // angka asli paling kuat (harga, jumlah)
  else if (NUMBER_WORDS.has(w)) s += 6;
  if (boost.has(w)) s += 8;
  return s;
}

// Judul pembuka otomatis: kalimat terpenting di awal video, mulai dari angka/kata penting, maks 7 kata.
export function suggestHook(words) {
  const sentences = [];
  let cur = [];
  for (const w of words) {
    cur.push(w.text);
    if (/[.!?]$/.test(w.text)) { sentences.push(cur); cur = []; }
  }
  if (cur.length) sentences.push(cur);
  const strip = (t) => t.replace(/[.,!?;:]+$/, '');
  const scoreOf = (s) => s.reduce((a, t) => a + keywordScore(t, new Set()), 0);
  const early = sentences.slice(0, 3).filter((s) => s.length > 3);
  const pick = early.find((s) => s.some((t) => /\d/.test(t) || NUMBER_WORDS.has(clean(t))))
    || early.sort((a, b) => scoreOf(b) / b.length - scoreOf(a) / a.length)[0] || sentences[0] || [];
  let start = pick.findIndex((t) => /\d/.test(t) || NUMBER_WORDS.has(clean(t)));
  if (start < 0) start = Math.max(pick.findIndex((t) => keywordScore(t, new Set()) > 0), 0);
  const out = pick.slice(start, start + 7).map(strip);
  while (out.length > 2 && STOP.has(clean(out.at(-1)))) out.pop();
  return out.join(' ');
}

// Kata -> potongan caption (maks 3 kata / 20 huruf, putus di tanda baca atau jeda).
export function buildCaptions(words, { boostWords = [] } = {}) {
  const boost = new Set(boostWords.map(clean).filter(Boolean));
  const chunks = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((w) => w.text).join(' ');
    let best = null;
    let bestScore = 0;
    for (const w of cur) {
      const sc = keywordScore(w.text, boost);
      if (sc > bestScore) { bestScore = sc; best = w.text.replace(/[.,!?;:]+$/, ''); }
    }
    chunks.push({ id: chunks.length + 1, text, start: cur[0].start, end: cur.at(-1).end, keyword: bestScore >= 4 ? best : null, words: cur.map((w) => ({ ...w })) });
    cur = [];
  };
  words.forEach((w, i) => {
    const gap = i ? w.start - words[i - 1].end : 0;
    if (cur.length && (gap > 0.35 || cur.length >= 3 || `${cur.map((x) => x.text).join(' ')} ${w.text}`.length > 20)) flush();
    cur.push(w);
    if (/[.,!?;:]$/.test(w.text)) flush();
  });
  flush();
  return chunks;
}

// Tanpa video: satu baris info produk = satu adegan.
export function buildProductCaptions(lines, perLine = 2.6) {
  return lines.filter((l) => l.trim()).map((l, i) => {
    const words = l.trim().split(/\s+/);
    const start = i * perLine;
    const step = (perLine - 0.3) / words.length;
    return {
      id: i + 1, text: l.trim(), start, end: start + perLine - 0.15,
      keyword: [...words].sort((a, b) => keywordScore(b, new Set()) - keywordScore(a, new Set()))[0]?.replace(/[.,!?;:]+$/, '') || null,
      words: words.map((t, j) => ({ text: t, start: start + j * step, end: start + (j + 1) * step })),
    };
  });
}

// B-roll otomatis: di potongan dengan kata kunci terkuat, jarak minimal 4 detik, durasi ±2 detik.
export function placeBroll(captions, media, { minGap = 4, dur = 2.2, mode = 'full', startAfter = 1.5 } = {}) {
  if (!media.length) return [];
  const ranked = captions.filter((c) => c.keyword && c.start >= startAfter).sort((a, b) => keywordScore(b.keyword, new Set()) - keywordScore(a.keyword, new Set()));
  const picked = [];
  for (const c of ranked) {
    if (picked.length >= media.length * 2) break;
    if (picked.every((p) => Math.abs(p.start - c.start) >= minGap)) picked.push(c);
  }
  picked.sort((a, b) => a.start - b.start);
  return picked.map((c, i) => ({ id: i + 1, media: media[i % media.length], start: Number(c.start.toFixed(2)), dur, mode }));
}

// Pergantian "angle kamera": tiap 3–5 detik di batas caption, ganti close-up/lebar.
export function planAngles(captions) {
  const cuts = [];
  let last = 0;
  let close = false;
  for (const c of captions) {
    if (c.start - last >= 3.2) {
      close = !close;
      cuts.push({ t: c.start, close, ox: close ? (cuts.length % 2 ? 0.04 : -0.04) : 0 });
      last = c.start;
    }
  }
  return cuts;
}

// ---- Gambar ----
const ease = (x) => 1 - (1 - Math.min(Math.max(x, 0), 1)) ** 3;
const back = (x) => {
  const c = 1.7;
  const t = Math.min(Math.max(x, 0), 1) - 1;
  return 1 + (c + 1) * t ** 3 + c * t ** 2;
};

function coverRect(sw, sh, dw, dh) {
  const s = Math.max(dw / sw, dh / sh);
  return { w: sw * s, h: sh * s, x: (dw - sw * s) / 2, y: (dh - sh * s) / 2 };
}
function containRect(sw, sh, dw, dh) {
  const s = Math.min(dw / sw, dh / sh);
  return { w: sw * s, h: sh * s, x: (dw - sw * s) / 2, y: (dh - sh * s) / 2 };
}
const dims = (el) => ({ w: el.videoWidth || el.naturalWidth || el.width, h: el.videoHeight || el.naturalHeight || el.height });

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class MotionRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.blur = document.createElement('canvas'); // latar blur murah: gambar kecil lalu diperbesar
    this.blur.width = 54;
    this.blur.height = 96;
  }

  setSize(ratio) {
    const r = RATIOS[ratio];
    this.canvas.width = r.w;
    this.canvas.height = r.h;
    this.blur.width = Math.round(r.w / 20);
    this.blur.height = Math.round(r.h / 20);
  }

  // Satu frame. p = proyek, el = elemen media yang sudah siap (main, broll per id), t = detik.
  draw(p, el, t) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const S = Math.min(W, H);
    const style = STYLES.find((s) => s.id === p.style) || STYLES[0];
    const brand = p.brandColor || '#7c6cf0';
    const ctaStart = p.contentDuration;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const cap = p.captions.find((c) => t >= c.start && t < c.end + 0.05);
    const capAge = cap ? t - cap.start : 99;

    // Kamera: zoom pelan + angle + punch-in di kata kunci + shake.
    let scale = 1;
    let ox = 0;
    let oy = 0;
    if (style.zoom) scale *= 1 + 0.04 * Math.sin((t / Math.max(p.contentDuration, 1)) * Math.PI);
    if (style.angle && p.effects.angle) {
      const cut = [...p.angles].reverse().find((a) => a.t <= t);
      if (cut?.close) { scale *= 1.22; ox += cut.ox * W; oy -= 0.04 * H; }
    }
    // Punch-in: saat potongan dengan kata kunci muncul, kamera mendekat cepat lalu bertahan.
    if (cap?.keyword && style.zoom && p.effects.punch) scale *= 1 + 0.07 * ease(capAge / 0.18);
    if (style.shake && p.effects.shake && cap?.keyword && capAge < 0.22) {
      ox += (Math.random() - 0.5) * S * 0.02;
      oy += (Math.random() - 0.5) * S * 0.02;
    }

    const main = el.main;
    const activeBroll = p.broll.find((b) => t >= b.start && t < b.start + b.dur);

    // Lapisan utama: video ngomong (atau gambar produk untuk mode tanpa video).
    const base = main || el.productScene?.(t);
    if (base && dims(base).w) {
      const d = dims(base);
      if (p.effects.blurFill && Math.abs(d.w / d.h - W / H) > 0.05) {
        const b = this.blur.getContext('2d');
        const cr = coverRect(d.w, d.h, this.blur.width, this.blur.height);
        b.drawImage(base, cr.x, cr.y, cr.w, cr.h);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(this.blur, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(0, 0, W, H);
      }
      const fit = p.effects.blurFill && Math.abs(d.w / d.h - W / H) > 0.05 ? containRect(d.w, d.h, W, H) : coverRect(d.w, d.h, W, H);
      ctx.save();
      ctx.translate(W / 2 + ox, H / 2 + oy);
      ctx.scale(scale, scale);
      ctx.drawImage(base, fit.x - W / 2, fit.y - H / 2, fit.w, fit.h);
      ctx.restore();
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, brand);
      g.addColorStop(1, '#0b0b14');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // B-roll + transisi.
    if (activeBroll && el.broll[activeBroll.id] && dims(el.broll[activeBroll.id]).w) {
      const m = el.broll[activeBroll.id];
      const d = dims(m);
      const local = t - activeBroll.start;
      const inK = ease(local / 0.3);
      const outK = ease((activeBroll.dur - local) / 0.3);
      const k = Math.min(inK, outK);
      const kb = 1.04 + 0.06 * (local / activeBroll.dur); // Ken Burns
      ctx.save();
      if (activeBroll.mode === 'pip') {
        const pw = W * 0.78;
        const ph = Math.min(H * 0.42, pw * (d.h / d.w));
        const px = (W - pw) / 2;
        const py = H * 0.14 + (1 - k) * H * 0.05;
        ctx.globalAlpha = k;
        ctx.shadowColor = 'rgba(0,0,0,.5)';
        ctx.shadowBlur = S * 0.04;
        roundRect(ctx, px, py, pw, ph, S * 0.03);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.clip();
        const cr = coverRect(d.w, d.h, pw, ph);
        ctx.drawImage(m, px + cr.x - (cr.w * (kb - 1)) / 2, py + cr.y - (cr.h * (kb - 1)) / 2, cr.w * kb, cr.h * kb);
      } else {
        const cr = coverRect(d.w, d.h, W, H);
        let tx = 0;
        let sc = kb;
        if (style.transition === 'slide') tx = (1 - inK) * W - (1 - outK) * W;
        if (style.transition === 'zoom') sc *= 1 + 0.25 * (1 - k);
        ctx.globalAlpha = style.transition === 'fade' || style.transition === 'zoom' ? k : 1;
        ctx.translate(W / 2 + tx, H / 2);
        ctx.scale(sc, sc);
        ctx.drawImage(m, cr.x - W / 2, cr.y - H / 2, cr.w, cr.h);
      }
      ctx.restore();
      // Flash putih & glitch di awal/akhir b-roll.
      const edge = Math.min(local, activeBroll.dur - local);
      if (style.transition === 'flash' && edge < 0.12) {
        ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - edge / 0.12)})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (style.glitch && p.effects.glitch && edge < 0.16) this.glitch(edge);
    }

    // Judul hook di awal.
    if (p.hook.text && t < p.hook.dur && t < ctaStart) this.drawHook(p.hook.text, t, p.hook.dur, style, brand);

    // Caption kata kunci.
    if (cap && t < ctaStart && p.effects.captions) this.drawCaption(cap, t, style, brand);

    // CTA di akhir.
    if (t >= ctaStart && p.cta.dur > 0) this.drawCta(p.cta, t - ctaStart, style, brand);

    // Watermark progress tipis di bawah (retensi).
    if (p.effects.progress && t < ctaStart) {
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(0, H - S * 0.008, W, S * 0.008);
      ctx.fillStyle = style.hl === 'brand' ? brand : style.hl;
      ctx.fillRect(0, H - S * 0.008, W * (t / ctaStart), S * 0.008);
    }
    ctx.restore();
  }

  glitch(edge) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const y = Math.random() * H;
      const h = H * (0.02 + Math.random() * 0.05);
      const dx = (Math.random() - 0.5) * W * 0.08 * (1 - edge / 0.16);
      ctx.drawImage(canvas, 0, y, W, h, dx, y, W, h);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(255,0,80,.12)';
    ctx.fillRect(W * 0.01, 0, W, H);
    ctx.fillStyle = 'rgba(0,200,255,.12)';
    ctx.fillRect(-W * 0.01, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  font(style, px) {
    return `${style.italic ? 'italic ' : ''}${style.weight || 400} ${Math.round(px)}px "${style.font}", sans-serif`;
  }

  // Bungkus teks jadi beberapa baris sesuai lebar.
  wrap(words, maxW) {
    const { ctx } = this;
    const lines = [[]];
    for (const w of words) {
      const line = lines.at(-1);
      const test = [...line.map((x) => x.text), w.text].join(' ');
      if (line.length && ctx.measureText(test).width > maxW) lines.push([w]);
      else line.push(w);
    }
    return lines;
  }

  drawCaption(cap, t, style, brand) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const S = Math.min(W, H);
    const hl = style.hl === 'brand' ? brand : style.hl;
    const age = t - cap.start;
    let words = cap.words.map((w) => ({ ...w, text: style.upper ? w.text.toUpperCase() : w.text }));
    if (style.mode === 'word') {
      const cur = [...words].reverse().find((w) => t >= w.start - 0.02) || words[0];
      words = [cur];
    }
    const size = S * style.size * (style.mode === 'word' ? 1 : 0.9);
    ctx.font = this.font(style, size);
    ctx.textBaseline = 'middle';
    const lines = this.wrap(words, W * 0.84);
    const lh = size * 1.18;
    const cy = H * style.pos - ((lines.length - 1) * lh) / 2;

    // Animasi masuk.
    const wordAge = style.mode === 'word' ? t - words[0].start : age;
    let sc = 1;
    let dy = 0;
    let alpha = 1;
    if (style.anim === 'pop') sc = 0.6 + 0.4 * back(wordAge / 0.22);
    if (style.anim === 'bounce') sc = 0.4 + 0.6 * back(wordAge / 0.28);
    if (style.anim === 'slide') { dy = (1 - ease(age / 0.25)) * size * 0.8; alpha = ease(age / 0.25); }
    if (style.anim === 'fade') alpha = ease(age / 0.3);
    const keyword = cap.keyword ? cap.keyword.toLowerCase() : null;

    ctx.save();
    ctx.globalAlpha = alpha;
    lines.forEach((line, li) => {
      const y = cy + li * lh + dy;
      const full = line.map((w) => w.text).join(' ');
      const lw = ctx.measureText(full).width;
      let x = W / 2 - lw / 2;
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.scale(sc, sc);
      ctx.translate(-W / 2, -y);
      if (style.box) {
        const pad = size * 0.28;
        ctx.fillStyle = style.box === 'brand' ? brand : style.box === 'light' ? 'rgba(255,255,255,.95)' : 'rgba(10,10,20,.78)';
        roundRect(ctx, x - pad, y - size * 0.62, lw + pad * 2, size * 1.24, size * 0.22);
        ctx.fill();
      }
      for (const w of line) {
        const ww = ctx.measureText(w.text).width;
        const isKey = keyword && w.text.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, '') === keyword.replace(/[^\p{L}\p{N}%]+/gu, '');
        const spoken = t >= w.start - 0.02;
        if (style.anim === 'type' && !spoken) { x += ww + ctx.measureText(' ').width; continue; }
        ctx.fillStyle = isKey ? hl : style.color;
        if (style.mode === 'chunk' && !spoken && style.anim !== 'type') ctx.globalAlpha = alpha * 0.55;
        if (style.stroke) {
          ctx.lineJoin = 'round';
          ctx.lineWidth = size * 0.14;
          ctx.strokeStyle = style.stroke;
          ctx.strokeText(w.text, x, y);
        }
        if (style.glow) { ctx.shadowColor = style.glow; ctx.shadowBlur = size * 0.45; }
        if (style.shadow) { ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = size * 0.25; ctx.shadowOffsetY = size * 0.05; }
        if (isKey && style.box === 'light') {
          const pad = size * 0.08;
          ctx.save();
          ctx.fillStyle = hl;
          roundRect(ctx, x - pad, y - size * 0.5, ww + pad * 2, size, size * 0.15);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#ffffff';
        }
        ctx.fillText(w.text, x, y);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalAlpha = alpha;
        x += ww + ctx.measureText(' ').width;
      }
      ctx.restore();
    });
    ctx.restore();
  }

  drawHook(text, t, dur, style, brand) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const S = Math.min(W, H);
    const k = Math.min(ease(t / 0.35), ease((dur - t) / 0.3));
    const size = S * 0.075;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.font = this.font({ ...style, weight: Math.max(style.weight || 700, 700) }, size);
    ctx.textBaseline = 'middle';
    const words = (style.upper ? text.toUpperCase() : text).split(/\s+/).map((w) => ({ text: w }));
    const lines = this.wrap(words, W * 0.8);
    const lh = size * 1.2;
    const pad = size * 0.4;
    const top = H * 0.14; // tengah baris pertama
    const lift = (1 - k) * size;
    const boxW = Math.min(W * 0.88, Math.max(...lines.map((l) => ctx.measureText(l.map((w) => w.text).join(' ')).width)) + pad * 3);
    ctx.fillStyle = brand;
    roundRect(ctx, (W - boxW) / 2, top - lh / 2 - pad - lift, boxW, lines.length * lh + pad * 2, size * 0.3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, i) => {
      const s = line.map((w) => w.text).join(' ');
      ctx.fillText(s, W / 2 - ctx.measureText(s).width / 2, top + i * lh - lift);
    });
    ctx.restore();
  }

  drawCta(cta, local, style, brand) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const S = Math.min(W, H);
    const k = ease(local / 0.4);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.55 * k})`;
    ctx.fillRect(0, 0, W, H);
    const size = S * 0.085;
    ctx.globalAlpha = k;
    ctx.textBaseline = 'middle';
    ctx.font = this.font({ ...style, weight: Math.max(style.weight || 700, 800) }, size);
    const words = (style.upper ? cta.text.toUpperCase() : cta.text).split(/\s+/).map((w) => ({ text: w }));
    const lines = this.wrap(words, W * 0.82);
    const lh = size * 1.2;
    const cy = H / 2 - (lines.length * lh) / 2;
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, i) => {
      const s = line.map((w) => w.text).join(' ');
      ctx.fillText(s, W / 2 - ctx.measureText(s).width / 2, cy + i * lh + (1 - k) * size);
    });
    if (cta.sub) {
      const bs = S * 0.045;
      ctx.font = this.font({ font: 'Montserrat', weight: 800 }, bs);
      const bw = ctx.measureText(cta.sub).width + bs * 2;
      const by = cy + lines.length * lh + bs * 1.2;
      const pulse = 1 + 0.04 * Math.sin(local * 6);
      ctx.save();
      ctx.translate(W / 2, by);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = brand;
      roundRect(ctx, -bw / 2, -bs * 0.95, bw, bs * 1.9, bs * 0.95);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(cta.sub, -ctx.measureText(cta.sub).width / 2, 0);
      ctx.restore();
    }
    ctx.restore();
  }
}

// ---- Efek suara sintetis (tanpa file, tanpa lisensi) ----
export function playSfx(actx, out, kind) {
  const now = actx.currentTime;
  if (kind === 'whoosh') {
    const len = 0.45;
    const buf = actx.createBuffer(1, actx.sampleRate * len, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, now);
    f.frequency.exponentialRampToValueAtTime(3500, now + len);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + len);
    src.connect(f).connect(g).connect(out);
    src.start(now);
  } else {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, now);
    o.frequency.exponentialRampToValueAtTime(1500, now + 0.06);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.connect(g).connect(out);
    o.start(now);
    o.stop(now + 0.14);
  }
}
