// LP Builder (menu Studio Visual): landing page berbasis blok.
// Disimpan sebagai JSON (bisa diedit & diunduh), HTML-nya dirender di browser (pratinjau, unduh, dan terbit di /p/<alamat>).
// Halaman terbit disajikan dengan CSP sandbox supaya skrip di dalamnya tidak bisa memakai sesi login TIM-AI.
import { now } from './db.js';
import { askClaude, AiError, brandBlock } from './ai.js';

const str = { type: 'string' };
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const SECTION_TYPES = ['hero', 'problem', 'benefits', 'features', 'steps', 'testimonials', 'offer', 'faq', 'cta', 'text'];
const LP_SCHEMA = obj({
  title: str,
  description: str,
  theme: obj({ primary: str, accent: str, background: str, text: str, font: str }),
  sections: {
    type: 'array',
    items: obj({
      type: { type: 'string', enum: SECTION_TYPES },
      heading: str, subheading: str, body: str,
      items: { type: 'array', items: obj({ title: str, text: str }) },
      cta_text: str, cta_url: str,
    }),
  },
});

const SLUG = /^[a-z0-9][a-z0-9-]{1,60}$/;
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

export function lpPublicRoute(app, db) {
  app.get('/p/:slug', async (req, res) => {
    const page = await db.get('SELECT html FROM lp_pages WHERE slug = ? AND published = 1', String(req.params.slug).toLowerCase());
    if (!page?.html) return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>Tidak ditemukan</title><p style="font-family:sans-serif;padding:40px">Halaman tidak ditemukan.</p>');
    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.type('html').send(page.html);
  });
}

export function lpRoutes(app, db, scope) {
  const pub = (p) => ({ id: p.id, name: p.name, data: JSON.parse(p.data || '{}'), slug: p.slug, published: !!p.published, created_by: p.created_by, updated_at: p.updated_at });
  const own = (req) => db.get('SELECT * FROM lp_pages WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);

  app.get('/api/lp-pages', scope, async (req, res) => {
    res.json((await db.all('SELECT * FROM lp_pages WHERE brand_id = ? ORDER BY updated_at DESC', req.brand.id)).map(pub));
  });

  app.post('/api/lp-pages', scope, async (req, res) => {
    const name = clip(req.body?.name, 120) || 'Landing page baru';
    const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
    const stamp = now();
    const [row] = await db.run('INSERT INTO lp_pages (brand_id, name, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
      req.brand.id, name, JSON.stringify(data), req.user.username, stamp, stamp);
    res.status(201).json(pub(row));
  });

  app.get('/api/lp-pages/:id', scope, async (req, res) => {
    const p = await own(req);
    if (!p) return res.status(404).json({ error: 'Halaman tidak ditemukan' });
    res.json(pub(p));
  });

  app.patch('/api/lp-pages/:id', scope, async (req, res) => {
    const p = await own(req);
    if (!p) return res.status(404).json({ error: 'Halaman tidak ditemukan' });
    const name = req.body?.name !== undefined ? clip(req.body.name, 120) || p.name : p.name;
    const data = req.body?.data && typeof req.body.data === 'object' ? JSON.stringify(req.body.data) : p.data;
    if (data.length > 2_000_000) return res.status(400).json({ error: 'Halaman terlalu besar (maks 2 MB). Pakai link gambar, bukan gambar tertanam.' });
    // Halaman yang sudah terbit ikut diperbarui kalau HTML barunya dikirim.
    const html = p.published && typeof req.body?.html === 'string' ? req.body.html : p.html;
    const [row] = await db.run('UPDATE lp_pages SET name = ?, data = ?, html = ?, updated_at = ? WHERE id = ? RETURNING *', name, data, html, now(), p.id);
    res.json(pub(row));
  });

  app.delete('/api/lp-pages/:id', scope, async (req, res) => {
    await db.run('DELETE FROM lp_pages WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    res.status(204).end();
  });

  app.post('/api/lp-pages/:id/publish', scope, async (req, res) => {
    const p = await own(req);
    if (!p) return res.status(404).json({ error: 'Halaman tidak ditemukan' });
    if (req.body?.publish === false) {
      const [row] = await db.run('UPDATE lp_pages SET published = 0 WHERE id = ? RETURNING *', p.id);
      return res.json(pub(row));
    }
    const slug = clip(req.body?.slug, 61).toLowerCase();
    if (!SLUG.test(slug)) return res.status(400).json({ error: 'Alamat 2-61 karakter: huruf kecil, angka, dan strip' });
    const html = String(req.body?.html || '');
    if (!html.includes('<html')) return res.status(400).json({ error: 'HTML halaman kosong' });
    if (html.length > 3_000_000) return res.status(400).json({ error: 'HTML terlalu besar (maks 3 MB)' });
    const taken = await db.get('SELECT id FROM lp_pages WHERE slug = ? AND id <> ?', slug, p.id);
    if (taken) return res.status(400).json({ error: 'Alamat ini sudah dipakai halaman lain' });
    const [row] = await db.run('UPDATE lp_pages SET slug = ?, html = ?, published = 1, updated_at = ? WHERE id = ? RETURNING *', slug, html, now(), p.id);
    res.json(pub(row));
  });

  // Isi landing page dari brief (AI). Hasilnya JSON blok yang langsung bisa diedit di builder.
  app.post('/api/lp-pages/ai', scope, async (req, res) => {
    const b = req.body || {};
    const brief = clip(b.brief, 4000);
    if (!brief) return res.status(400).json({ error: 'Tulis brief produk/jasa dulu' });
    try {
      const data = await askClaude({
        schema: LP_SCHEMA,
        effort: 'medium',
        maxTokens: 16000,
        content: `${brandBlock(req.brand)}

Susun isi landing page yang menjual untuk pasar Indonesia.
Brief: ${brief}
Gaya visual: ${clip(b.style, 300) || 'bersih, modern, meyakinkan'}
Link tombol (checkout/WA): ${clip(b.cta_url, 500) || 'https://wa.me/'}

Aturan:
- 7-10 section berurutan, mulai "hero", akhiri "cta". Tipe yang tersedia: ${SECTION_TYPES.join(', ')}.
- hero: heading = headline yang menyebut hasil & untuk siapa, subheading = penjelas 1-2 kalimat, cta_text & cta_url terisi.
- problem/benefits/features/steps/testimonials/faq: isi items (title + text). testimonials: title = nama & kota (tulis "Contoh testimoni" di text kalau belum ada data asli), text = kutipan.
- offer: heading = nama paket, subheading = harga (mis. "Rp149.000"), body = harga coret/garansi, items = isi paket/bonus, cta terisi.
- Field yang tidak dipakai isi string kosong, items yang tidak dipakai isi array kosong.
- Hindari klaim mutlak/overclaim ("pasti", "100%", "dijamin sembuh"). Bahasa lisan Indonesia yang luwes.
- theme: warna hex (#rrggbb) yang cocok dengan brand, font salah satu dari: Inter, Poppins, Plus Jakarta Sans, DM Sans, Playfair Display, Montserrat.`,
      });
      res.json(data);
    } catch (err) {
      if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });
}
