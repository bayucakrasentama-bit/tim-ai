// Server uji lokal: menyajikan ../public dan memalsukan /api/* secukupnya supaya fitur agents.js bisa dicoba
// tanpa backend & tanpa API key. Bukan untuk produksi.  Jalankan: node dev/mock-server.mjs  → http://localhost:5178
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = Number(process.env.PORT) || 5178;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const content = [];

function aiReply({ system = '', prompt = '' }) {
  if (system.includes('Conductor')) {
    return JSON.stringify({
      summary: '**Rencana launching** — 1) Tim Digital susun produk & LP, 2) Tim Konten siapkan identitas, 3) Tim ADV siapkan hook & rules sebelum iklan jalan.',
      steps: [
        { agent: 'produk', why: 'Bentuk paket eBook & rencana launching', values: { idea: 'eBook resep diet 30 hari', format: 'eBook' } },
        { agent: 'lpstory', why: 'Landing page penjualan', values: { product: 'eBook resep diet 30 hari', features: 'Menu 30 hari\nDaftar belanja\nKalkulator kalori' } },
        { agent: 'hook', why: 'Bahan uji iklan', values: { product: 'eBook resep diet 30 hari' } },
      ],
      tasks: [{ team: 'konten', title: 'Konten teaser launching', detail: '5 video teaser', due: 'Senin' }, { team: 'adv', title: 'Setup campaign launching', detail: 'Budget uji Rp300rb/hari', due: 'Rabu' }],
      schedule: { when: 'Setiap hari 08.00', what: 'Laporan pagi penjualan eBook ke WhatsApp owner' },
    });
  }
  if (system.includes('Customer Service')) {
    const last = prompt.split('\n').filter((l) => l.startsWith('PELANGGAN:')).pop() || '';
    const photo = /\[\[foto:[^\]]+\]\]/.exec(system)?.[0];
    if (/foto/i.test(last) && photo) return `Ini fotonya Kak 😊\n${photo}`;
    if (/setuju/i.test(last)) return 'Mantap Kak, pesanan sudah tersimpan. Terima kasih! 😊\n```order\n{"customer":"Budi","phone":"0812","items":[{"name":"Herbal Jahe","variant":"Normal","qty":2,"price":13500}],"shipping":0,"total":27000,"address":"Cipayung, Cikarang Timur, Bekasi","payment":"COD"}\n```';
    if (/alamat|bekasi|jl/i.test(last)) return '**Ringkasan pesanan**\n- Herbal Jahe Normal ×2 = Rp27.000\n- Ongkir: Rp0 (promo)\n- Total: **Rp27.000**, COD\n\nBalas "setuju" ya Kak untuk diproses.';
    return 'Halo Kak! Ada Herbal Jahe (Rp13.500) dan Wedang (Rp14.000). Mau yang mana, berapa bungkus?';
  }
  if (system.includes('laporan pagi')) return '☀️ *Laporan Pagi HerbalDrink* — Selasa\n\n*Tim ADV*: spend Rp850rb, ROAS 2,1x\n*Tim CS*: 1 order AI\n\n*Keputusan hari ini*\n1. ADV: scale Iklan A 20%\n\n*Perlu perhatian*: data MP belum masuk';
  if (prompt.includes('follow-up')) return '## Pesan 1 — +1 jam\n```\nHalo {nama}, pesanannya masih kami simpan ya Kak 😊\n```';
  return `## Hasil contoh (mock)\n\n| Kolom | Isi |\n|---|---|\n| Brief | ${prompt.split('\n')[1]?.slice(0, 60) || '-'} |\n\n1. Ini jawaban palsu dari server uji.\n2. Di produksi, jawabannya dari model di AI & API Keys.`;
}

async function apiRoute(req, url, body) {
  const p = url.pathname;
  if (p === '/api/config') return { auth: false, ai: true };
  if (p === '/api/me') return { user: { id: 1, username: 'demo', role: 'owner', team: 'semua' }, brands: [{ id: 1, name: 'HerbalDrink', description: 'Minuman herbal kemasan untuk pekerja kantoran' }] };
  if (p === '/api/platforms') return [{ id: 'instagram', label: 'Instagram', supports: ['text', 'image', 'video'], fields: [] }];
  if (p === '/api/ai/status') return { enabled: true, provider: 'mock', model: 'mock-1' };
  if (p === '/api/ai/chat') return { text: aiReply(body || {}) };
  if (p === '/api/content' && req.method === 'POST') { const it = { id: content.length + 1, ...body }; content.push(it); return it; }
  if (p === '/api/content') return content;
  if (p.startsWith('/api/reports/team/')) return { team: p.split('/').pop(), spend: 850000, revenue: 1785000, roas: 2.1 };
  return [];
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    let raw = '';
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : null;
    const out = await apiRoute(req, url, body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(out));
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  if (!path || path.endsWith('/') || path.endsWith('\\')) path = join(path, 'index.html');
  try {
    const data = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`TIM-AI mock → http://localhost:${PORT}`));
