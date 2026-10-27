// Launch Lab: dari 1 ide sampai produk siap dijual.
// Riset & validasi -> brand & angle -> copy (hook, script, iklan, caption) -> brief visual -> landing page -> launch.
// Tiap langkah bisa diisi manual atau dibantu AI (Claude). Landing page bisa dipublikasikan di /lp/<slug>.
import { now } from './db.js';
import { askClaude, AiError, brandBlock } from './ai.js';
import { createContent } from './planner.js';

export const STAGES = ['riset', 'brand', 'copy', 'visual', 'landing', 'launch'];
const SECTIONS = ['research', 'brand', 'copy', 'visual', 'landing'];
const str = (v, max = 4000) => String(v ?? '').trim().slice(0, max);

const s = { type: 'string' };
const i = { type: 'integer' };
const o = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const a = (items) => ({ type: 'array', items });

const SCHEMAS = {
  research: o({
    summary: s,
    concepts: a(o({
      name: s, description: s, format: s, price: s, audience: s, demand_score: i, why: s,
      evidence: a(o({ source: s, note: s, url: s })),
    })),
  }),
  brand: o({
    names: a(s), tagline: s, positioning: s, tone: s,
    palette: a(o({ role: s, hex: s })),
    angles: a(o({ angle: s, why: s, hook_example: s })),
  }),
  copy: o({
    hooks: a(s),
    scripts: a(o({ title: s, hook: s, body: s, cta: s, duration: s })),
    ads: a(o({ headline: s, primary_text: s, cta: s })),
    captions: a(s),
  }),
  landing: o({
    headline: s, subheadline: s,
    problems: a(s), solution: s,
    benefits: a(o({ title: s, desc: s })),
    offer: o({ price: s, strike_price: s, bonuses: a(s), guarantee: s }),
    faq: a(o({ q: s, a: s })),
    cta_text: s,
  }),
};

const SYSTEM = `Kamu adalah tim launch produk digital & fisik untuk pasar Indonesia: periset pasar, copywriter, brand strategist, dan perancang landing page.
Jawab dalam Bahasa Indonesia yang santai, jelas, dan siap pakai. Jangan mengarang testimoni, angka penjualan, atau klaim kesehatan/finansial yang tidak bisa dibuktikan.
Kalau datanya kurang, katakan terus terang.`;

const parse = (row) => ({ ...row, data: JSON.parse(row.data || '{}'), published: !!row.published });
const chosen = (d) => d.research?.concepts?.[d.research?.chosen ?? 0] || null;

function projectBlock(p) {
  const d = p.data;
  const c = chosen(d);
  return `<proyek>
Nama: ${p.name}
Niche/ide: ${p.niche || '-'}
${c ? `Konsep terpilih: ${c.name} — ${c.description} (format ${c.format}, harga ${c.price}, target ${c.audience})` : ''}
${d.brand?.tagline ? `Brand: ${d.brand.names?.[0] || p.name} · ${d.brand.tagline} · positioning: ${d.brand.positioning} · tone: ${d.brand.tone}` : ''}
${d.brand?.angles?.length ? `Angle: ${d.brand.angles.map((x) => x.angle).join('; ')}` : ''}
</proyek>`;
}

async function runStep(step, p, brand, body) {
  const ctx = `${brandBlock(brand)}\n${projectBlock(p)}`;
  if (step === 'research') {
    const idea = str(body.idea || p.niche, 500);
    if (!idea) throw new AiError('Tulis ide/niche dulu');
    return askClaude({
      system: SYSTEM,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      schema: SCHEMAS.research,
      effort: 'high',
      content: `${ctx}
Riset ide ini: "${idea}".
Cari bukti nyata orang sedang mencari / membeli / mengeluhkan masalah ini (TikTok, Threads, Reddit, marketplace Indonesia, Meta Ad Library, Google).
Lalu usulkan 5 konsep produk yang paling mungkin laku, masing-masing dengan skor permintaan 0-100, harga yang masuk akal di Indonesia,
target pembeli, alasan, dan 1-3 bukti (sumber, catatan singkat, URL asli dari hasil pencarian).
Akhiri jawabanmu dengan SATU blok \`\`\`json berisi objek {"summary": string, "concepts": [{"name","description","format","price","audience","demand_score","why","evidence":[{"source","note","url"}]}]}.`,
    });
  }
  if (step === 'brand') {
    return askClaude({ system: SYSTEM, schema: SCHEMAS.brand, content: `${ctx}
Buat identitas brand untuk produk ini: 5 usulan nama, tagline, positioning 1 kalimat, tone bahasa,
palet warna 5-7 warna (role: primary, secondary, accent, background, text, dst; hex #RRGGBB), dan 5 angle jualan (dengan alasan & contoh hook).` });
  }
  if (step === 'copy') {
    return askClaude({ system: SYSTEM, schema: SCHEMAS.copy, maxTokens: 48000, content: `${ctx}
Tulis materi copy siap pakai:
- 20 hook pendek (maks 12 kata) untuk 3 detik pertama video,
- 5 script video UGC 9:16 (judul, hook, isi dengan penanda scene, CTA, durasi),
- 6 iklan Meta (headline maks 40 huruf, primary text, CTA),
- 6 caption IG/TikTok dengan hashtag.
Pakai angle yang sudah ada kalau ada.` });
  }
  if (step === 'landing') {
    return askClaude({ system: SYSTEM, schema: SCHEMAS.landing, content: `${ctx}
Susun isi landing page penjualan yang konversi: headline, subheadline, 3-5 masalah calon pembeli, solusi, 4-6 manfaat (judul+penjelasan),
penawaran (harga, harga coret, 2-4 bonus, garansi), 5-7 FAQ, dan teks tombol CTA. Jangan tulis testimoni palsu.` });
  }
  throw new AiError('Langkah AI tidak dikenal');
}

// ---- Landing page publik ----
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim() : d);

export function renderLanding(p) {
  const d = p.data;
  const L = d.landing || {};
  const pal = Object.fromEntries((d.brand?.palette || []).map((c) => [String(c.role).toLowerCase(), c.hex]));
  const primary = hex(pal.primary, '#7c3aed');
  const accent = hex(pal.accent || pal.secondary, '#f59e0b');
  const name = d.brand?.names?.[0] || p.name;
  const ctaUrl = /^https?:\/\//.test(L.cta_url || '') ? L.cta_url : '#';
  const list = (arr, fn) => (Array.isArray(arr) ? arr.filter(Boolean).map(fn).join('') : '');
  const cta = `<a class="cta" href="${esc(ctaUrl)}" rel="noopener">${esc(L.cta_text || 'Ambil sekarang')}</a>`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}${L.headline ? ` — ${esc(L.headline)}` : ''}</title>
<meta name="description" content="${esc(L.subheadline || d.brand?.tagline || '')}">
<style>
:root{--p:${primary};--a:${accent}}*{box-sizing:border-box}body{margin:0;font:17px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2937;background:#fff}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}header{background:var(--p);color:#fff;padding:56px 0 64px;text-align:center}
.brand{font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.9;font-size:14px}h1{font-size:clamp(28px,6vw,44px);line-height:1.15;margin:14px 0}
.sub{font-size:19px;opacity:.95}section{padding:40px 0;border-bottom:1px solid #eee}h2{font-size:26px;margin:0 0 16px}
ul.x{padding:0;list-style:none}ul.x li{padding:10px 0 10px 32px;position:relative}ul.x li:before{content:"✕";position:absolute;left:0;color:#dc2626;font-weight:800}
.ben{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}.ben div{background:#f8fafc;border-radius:14px;padding:16px}.ben b{display:block;margin-bottom:4px}
.offer{text-align:center;background:#fffbeb;border-radius:18px;padding:28px;margin:24px 0}.price{font-size:40px;font-weight:900;color:var(--p)}.strike{text-decoration:line-through;color:#9ca3af;margin-right:8px}
.offer ul{text-align:left;display:inline-block}.cta{display:inline-block;background:var(--a);color:#111;font-weight:800;padding:16px 28px;border-radius:999px;text-decoration:none;margin-top:16px;font-size:18px}
details{border-bottom:1px solid #eee;padding:12px 0}summary{font-weight:700;cursor:pointer}footer{text-align:center;color:#9ca3af;font-size:13px;padding:28px 0}
</style></head><body>
<header><div class="wrap"><div class="brand">${esc(name)}</div><h1>${esc(L.headline || name)}</h1><p class="sub">${esc(L.subheadline || d.brand?.tagline || '')}</p>${cta}</div></header>
<main class="wrap">
${L.problems?.length ? `<section><h2>Pernah ngalamin ini?</h2><ul class="x">${list(L.problems, (x) => `<li>${esc(x)}</li>`)}</ul></section>` : ''}
${L.solution ? `<section><h2>Solusinya</h2><p>${esc(L.solution)}</p></section>` : ''}
${L.benefits?.length ? `<section><h2>Yang kamu dapat</h2><div class="ben">${list(L.benefits, (b) => `<div><b>${esc(b.title)}</b>${esc(b.desc)}</div>`)}</div></section>` : ''}
<section><div class="offer">${L.offer?.strike_price ? `<span class="strike">${esc(L.offer.strike_price)}</span>` : ''}<span class="price">${esc(L.offer?.price || '')}</span>
${L.offer?.bonuses?.length ? `<div><ul>${list(L.offer.bonuses, (b) => `<li>🎁 ${esc(b)}</li>`)}</ul></div>` : ''}
${L.offer?.guarantee ? `<p><b>${esc(L.offer.guarantee)}</b></p>` : ''}${cta}</div></section>
${L.faq?.length ? `<section><h2>Pertanyaan yang sering ditanya</h2>${list(L.faq, (f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)}</section>` : ''}
</main><footer>${esc(name)}</footer></body></html>`;
}

export function launchRoutes(app, db, scope) {
  const get = async (req) => {
    const row = await db.get('SELECT * FROM launch_projects WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    return row ? parse(row) : null;
  };
  const save = async (p) => {
    const [row] = await db.run(
      'UPDATE launch_projects SET name = ?, niche = ?, stage = ?, data = ?, slug = ?, published = ?, updated_at = ? WHERE id = ? RETURNING *',
      p.name, p.niche, p.stage, JSON.stringify(p.data), p.slug, p.published ? 1 : 0, now(), p.id,
    );
    return parse(row);
  };

  app.get('/api/launch', scope, async (req, res) => {
    res.json((await db.all('SELECT * FROM launch_projects WHERE brand_id = ? ORDER BY updated_at DESC', req.brand.id)).map(parse));
  });
  app.get('/api/launch/:id', scope, async (req, res) => {
    const p = await get(req);
    if (!p) return res.status(404).json({ error: 'Proyek tidak ditemukan' });
    res.json(p);
  });
  app.post('/api/launch', scope, async (req, res) => {
    const name = str(req.body?.name, 120);
    if (!name) return res.status(400).json({ error: 'Nama proyek wajib diisi' });
    const [row] = await db.run(
      'INSERT INTO launch_projects (brand_id, name, niche, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
      req.brand.id, name, str(req.body?.niche, 500), '{}', req.user.username, now(), now(),
    );
    res.status(201).json(parse(row));
  });
  // Simpan satu/lebih bagian (research, brand, copy, visual, landing) hasil edit manual.
  app.patch('/api/launch/:id', scope, async (req, res) => {
    const p = await get(req);
    if (!p) return res.status(404).json({ error: 'Proyek tidak ditemukan' });
    const b = req.body || {};
    if (b.name !== undefined) p.name = str(b.name, 120) || p.name;
    if (b.niche !== undefined) p.niche = str(b.niche, 500);
    if (STAGES.includes(b.stage)) p.stage = b.stage;
    for (const sec of SECTIONS) if (b[sec] !== undefined && typeof b[sec] === 'object') p.data[sec] = { ...(p.data[sec] || {}), ...b[sec] };
    res.json(await save(p));
  });
  app.delete('/api/launch/:id', scope, async (req, res) => {
    await db.run('DELETE FROM launch_projects WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    res.status(204).end();
  });

  // AI per langkah. Hasilnya langsung disimpan ke proyek (bisa diedit lagi).
  app.post('/api/launch/:id/ai/:step', scope, async (req, res) => {
    const p = await get(req);
    if (!p) return res.status(404).json({ error: 'Proyek tidak ditemukan' });
    const step = req.params.step;
    try {
      const out = await runStep(step, p, req.brand, req.body || {});
      if (step === 'research') p.data.research = { ...(p.data.research || {}), idea: str(req.body?.idea || p.niche, 500), ...out, chosen: 0 };
      else p.data[step] = { ...(p.data[step] || {}), ...out };
      if (STAGES.indexOf(p.stage) < SECTIONS.indexOf(step) + 1) p.stage = STAGES[Math.min(SECTIONS.indexOf(step) + 1, STAGES.length - 1)];
      res.json(await save(p));
    } catch (err) {
      if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  // AI Mentor: tanya strategi, jawabannya menyesuaikan proyek ini.
  app.post('/api/launch/:id/mentor', scope, async (req, res) => {
    const p = await get(req);
    if (!p) return res.status(404).json({ error: 'Proyek tidak ditemukan' });
    const msgs = (Array.isArray(req.body?.messages) ? req.body.messages : [])
      .filter((m) => ['user', 'assistant'].includes(m.role) && m.content)
      .slice(-20)
      .map((m) => ({ role: m.role, content: str(m.content, 6000) }));
    if (!msgs.length || msgs.at(-1).role !== 'user') return res.status(400).json({ error: 'Tulis pertanyaan dulu' });
    try {
      const answer = await askClaude({
        system: `${SYSTEM}\nKamu sekarang mentor bisnis yang membimbing user meluncurkan produk ini (Meta Ads, TikTok, marketplace, Scalev/Mayar, harga, funnel). Jawab konkret dan bertahap.\n${brandBlock(req.brand)}\n${projectBlock(p)}`,
        messages: msgs,
        effort: 'medium',
        maxTokens: 8000,
      });
      res.json({ answer });
    } catch (err) {
      if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  // Hook / script / caption -> kartu Planner (kolom Ide) untuk tim konten.
  app.post('/api/launch/:id/to-planner', scope, async (req, res) => {
    const p = await get(req);
    if (!p) return res.status(404).json({ error: 'Proyek tidak ditemukan' });
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 40) : [];
    if (!items.length) return res.status(400).json({ error: 'Pilih materi yang mau dikirim ke Planner' });
    const out = [];
    for (const it of items) {
      out.push(await createContent(db, req.brand.id, {
        title: str(it.title, 200) || `${p.name}: konten`, pillar: str(it.pillar, 80) || 'Promo', format: str(it.format, 40) || 'Reels',
        hook: str(it.hook, 1000), script: str(it.script, 8000), caption: str(it.caption, 4000),
        notes: `Dari Launch Lab: ${p.name}`,
      }, req.user));
    }
    res.status(201).json(out);
  });

  // Pratinjau landing page sebelum dipublikasikan (butuh login).
  app.get('/api/launch/:id/preview', scope, async (req, res) => {
    const p = await get(req);
    if (!p) return res.status(404).json({ error: 'Proyek tidak ditemukan' });
    res.type('html').send(renderLanding(p));
  });

  app.post('/api/launch/:id/publish', scope, async (req, res) => {
    const p = await get(req);
    if (!p) return res.status(404).json({ error: 'Proyek tidak ditemukan' });
    if (req.body?.publish === false) {
      p.published = false;
      return res.json(await save(p));
    }
    const slug = str(req.body?.slug || p.slug || p.name, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return res.status(400).json({ error: 'Alamat halaman tidak valid' });
    const taken = await db.get('SELECT id FROM launch_projects WHERE slug = ? AND id != ?', slug, p.id);
    if (taken) return res.status(400).json({ error: 'Alamat ini sudah dipakai, coba yang lain' });
    if (!p.data.landing?.headline) return res.status(400).json({ error: 'Isi landing page dulu (minimal headline)' });
    p.slug = slug;
    p.published = true;
    p.stage = 'launch';
    res.json(await save(p));
  });
}

// Halaman publik, tanpa login.
export function landingPublicRoute(app, db) {
  app.get('/lp/:slug', async (req, res) => {
    const row = await db.get('SELECT * FROM launch_projects WHERE slug = ? AND published = 1', String(req.params.slug));
    if (!row) return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>Tidak ditemukan</title><p style="font-family:sans-serif;padding:40px">Halaman tidak ditemukan.</p>');
    res.type('html').send(renderLanding(parse(row)));
  });
}
