// Scrap landing page dari link referensi (LP Builder): ambil HTML-nya di server, lalu ringkas jadi kerangka teks,
// daftar gambar, warna, dan font yang dipakai. Kerangka ini yang dibaca AI untuk disusun ulang jadi blok LP Builder.
// Hanya alamat publik yang boleh diambil (localhost / IP jaringan internal ditolak) supaya server tidak bisa dipakai mengintip jaringan dalam.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_HTML = 3_000_000;
const MAX_CSS = 600_000;

export class ScrapeError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function privateIp(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

async function assertPublic(url) {
  if (!/^https?:$/.test(url.protocol)) throw new ScrapeError('Link harus diawali http:// atau https://');
  if (url.username || url.password) throw new ScrapeError('Link tidak boleh berisi username/password');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new ScrapeError('Alamat lokal tidak bisa diambil');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new ScrapeError('Domain tidak ditemukan. Cek lagi link-nya.');
  if (addrs.some((a) => privateIp(a.address))) throw new ScrapeError('Alamat jaringan internal tidak bisa diambil');
}

// Ambil satu URL dengan redirect manual (tiap lompatan dicek lagi) dan batas ukuran.
async function fetchText(raw, { max, accept }) {
  let url = new URL(raw);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url);
    let res;
    try {
      res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' } });
    } catch (err) {
      throw new ScrapeError(err.name === 'TimeoutError' ? 'Website-nya terlalu lama merespons (15 detik)' : 'Website tidak bisa dihubungi', 502);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) throw new ScrapeError(`Website membalas status ${res.status}${res.status === 403 ? ' (kemungkinan memblokir bot)' : ''}`, 502);
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { reader.cancel(); break; }
      chunks.push(value);
    }
    return { url: url.href, type: res.headers.get('content-type') || '', text: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  throw new ScrapeError('Terlalu banyak redirect', 502);
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', times: '×', copy: '©', reg: '®', trade: '™' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENT[e.toLowerCase()] ?? m;
});
const attr = (tag, name) => decode((new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag) || []).slice(1).find((v) => v !== undefined) || '');
const abs = (u, base) => { try { return new URL(u, base).href; } catch { return ''; } };
const clean = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const COLOR_SKIP = new Set(['#ffffff', '#000000', '#fff', '#000']);
function colorsAndFonts(css) {
  const colors = new Map();
  for (const [, h] of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let c = `#${h.toLowerCase()}`;
    if (c.length === 4) c = `#${[...c.slice(1)].map((x) => x + x).join('')}`;
    if (!COLOR_SKIP.has(c)) colors.set(c, (colors.get(c) || 0) + 1);
  }
  for (const [, r, g, b] of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi)) {
    const c = `#${[r, g, b].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
    if (!COLOR_SKIP.has(c)) colors.set(c, (colors.get(c) || 0) + 1);
  }
  const fonts = new Map();
  for (const [, f] of css.matchAll(/font-family\s*:\s*([^;}"]+|"[^"]+")/gi)) {
    const name = f.split(',')[0].replace(/["']/g, '').trim();
    if (name && !/^(inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system|var\()/i.test(name)) fonts.set(name, (fonts.get(name) || 0) + 1);
  }
  return { colors, fonts };
}
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

async function fetchPage(rawUrl) {
  let input = String(rawUrl || '').trim();
  if (!input) throw new ScrapeError('Tempel link landing page referensinya dulu');
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  try { new URL(input); } catch { throw new ScrapeError('Link tidak valid'); }
  const page = await fetchText(input, { max: MAX_HTML, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' });
  if (page.type && !/html|xml|text\/plain/i.test(page.type)) throw new ScrapeError('Link ini bukan halaman web (mungkin file/gambar)');
  return page;
}

// HTML utuh untuk "Template dari referensi" (desain dipertahankan). Semua link/aset relatif dijadikan absolut ke website
// sumber supaya CSS, gambar, dan font tetap tampil saat dibuka di TIM-AI; link "#bagian" dibiarkan.
export async function fetchPageHtml(rawUrl) {
  const page = await fetchPage(rawUrl);
  const base = abs(attr(/<base\b[^>]*>/i.exec(page.text)?.[0] || '', 'href'), page.url) || page.url;
  const fix = (u) => (/^(#|data:|blob:|mailto:|tel:|javascript:|about:)/i.test(u.trim()) || !u.trim() ? u : abs(u.trim(), base) || u);
  const html = page.text
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/(\s(?:src|href|data-src|data-lazy-src|data-bg|poster|action)\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre, q, d, s) => `${pre}"${fix(d ?? s).replace(/"/g, '&quot;')}"`)
    .replace(/(\s(?:srcset|data-srcset)\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre, q, d, s) => `${pre}"${(d ?? s).split(',').map((part) => { const [u, ...rest] = part.trim().split(/\s+/); return [fix(u), ...rest].join(' '); }).join(', ')}"`)
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, u) => `url(${q}${fix(u)}${q})`);
  const words = clean(html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')).split(' ').filter(Boolean).length;
  if (words < 40) throw new ScrapeError('Teks di halaman ini terlalu sedikit. Kemungkinan halamannya dirender pakai JavaScript, dikunci login, atau memblokir bot. Coba simpan halamannya dari browser (Ctrl+S) lalu pakai "Impor referensi HTML".', 422);
  return { url: page.url, html };
}

// HTML -> ringkasan yang hemat token: kerangka teks berurutan (# judul, - poin, [TOMBOL], [GAMBAR]), plus meta.
export async function scrapePage(rawUrl) {
  const page = await fetchPage(rawUrl);
  const html = page.text;
  const base = abs(attr(/<base\b[^>]*>/i.exec(html)?.[0] || '', 'href'), page.url) || page.url;
  const head = /<head\b[\s\S]*?<\/head>/i.exec(html)?.[0] || '';
  const meta = (key) => attr([...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((t) => new RegExp(`(name|property)\\s*=\\s*["']?${key}["']?`, 'i').test(t)) || '', 'content');

  // CSS: <style> di halaman + maks 3 stylesheet eksternal (untuk warna & font).
  let css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') + [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(';');
  const sheets = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /rel\s*=\s*["']?stylesheet/i.test(t)).map((t) => abs(attr(t, 'href'), base)).filter(Boolean);
  const gfonts = sheets.filter((u) => /fonts\.googleapis\.com/.test(u)).flatMap((u) => new URL(u).searchParams.getAll('family').map((f) => f.split(':')[0].replace(/\+/g, ' ')));
  const external = await Promise.all(sheets.filter((u) => !/fonts\.googleapis\.com/.test(u)).slice(0, 3)
    .map((u) => fetchText(u, { max: MAX_CSS, accept: 'text/css,*/*;q=0.1' }).then((r) => r.text).catch(() => '')));
  css += `\n${external.join('\n')}`;
  const { colors, fonts } = colorsAndFonts(css);

  let body = (/<body\b[\s\S]*<\/body>/i.exec(html)?.[0] || html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|select|nav)\b[\s\S]*?<\/\1>/gi, ' ');
  const images = [];
  body = body
    .replace(/<img\b[^>]*>/gi, (t) => {
      const src = attr(t, 'data-src') || attr(t, 'data-lazy-src') || attr(t, 'src') || (attr(t, 'srcset').split(',').pop() || '').trim().split(/\s+/)[0];
      const u = abs(src, base);
      if (!/^https?:/.test(u) || /\.svg(\?|$)|pixel|spacer|1x1|facebook\.com\/tr/i.test(u)) return ' ';
      const w = Number(attr(t, 'width')) || 0;
      if (w && w < 60) return ' ';
      if (!images.includes(u)) images.push(u);
      return `\n[GAMBAR ${images.indexOf(u) + 1}${attr(t, 'alt') ? `: ${clean(attr(t, 'alt')).slice(0, 80)}` : ''}]\n`;
    })
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (m, a, inner) => {
      const text = clean(inner);
      const href = attr(`<a ${a}>`, 'href');
      if (!text) return inner;
      if (!href || /^(#|javascript:)/i.test(href) || text.length > 60) return ` ${inner} `;
      return ` [TOMBOL: ${text} → ${abs(href, base)}] `;
    })
    .replace(/<button\b[^>]*>([\s\S]*?)<\/button>/gi, (m, inner) => (clean(inner) ? ` [TOMBOL: ${clean(inner)}] ` : ' '))
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (m, n, inner) => `\n${'#'.repeat(Math.min(Number(n), 3))} ${clean(inner)}\n`)
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/?(p|div|section|article|header|footer|main|nav|aside|ul|ol|table|tr|blockquote|figure|figcaption|details|summary|dt|dd|form|label)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const seen = new Set();
  const lines = [];
  for (const raw of decode(body).split('\n')) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (!l || l === '-' || seen.has(l)) continue;
    seen.add(l);
    lines.push(l);
  }
  let outline = lines.join('\n');
  if (outline.length > 30_000) outline = `${outline.slice(0, 30_000)}\n…(dipotong)`;
  const words = outline.replace(/\[[^\]]*\]/g, '').split(/\s+/).filter(Boolean).length;
  if (words < 40) throw new ScrapeError('Teks di halaman ini terlalu sedikit untuk dibaca. Kemungkinan halamannya dirender pakai JavaScript, dikunci login, atau memblokir bot. Coba link lain, atau salin teksnya ke "Isi dengan AI".', 422);

  return {
    url: page.url,
    title: clean(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] || '') || meta('og:title'),
    description: meta('description') || meta('og:description'),
    og_image: meta('og:image') ? abs(meta('og:image'), base) : '',
    theme_color: meta('theme-color'),
    colors: top(colors, 10),
    fonts: [...new Set([...gfonts, ...top(fonts, 5)])].slice(0, 6),
    images: images.slice(0, 40),
    outline,
  };
}
