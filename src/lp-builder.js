// LP Builder (menu Studio Visual): landing page berbasis blok.
// Disimpan sebagai JSON (bisa diedit & diunduh), HTML-nya dirender di browser (pratinjau, unduh, dan terbit di /p/<alamat>).
// Halaman terbit disajikan dengan CSP sandbox supaya skrip di dalamnya tidak bisa memakai sesi login TIM-AI.
import { now } from './db.js';
import { askClaude, AiError, brandBlock } from './ai.js';
import { scrapePage, fetchPageHtml, ScrapeError } from './lp-scrape.js';

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

// Hasil scrap boleh memakai blok gambar (link gambar asli dari halaman referensi).
const SCRAPE_SCHEMA = obj({
  ...LP_SCHEMA.properties,
  sections: {
    type: 'array',
    items: obj({
      type: { type: 'string', enum: [...SECTION_TYPES, 'image'] },
      heading: str, subheading: str, body: str,
      items: { type: 'array', items: obj({ title: str, text: str }) },
      cta_text: str, cta_url: str, image_url: str,
    }),
  },
});

const SLUG =/^[a-z0-9][a-z0-9-]{1,60}$/;
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
    if (data.length > 3_500_000) return res.status(400).json({ error: 'Halaman terlalu besar (maks 3,5 MB). Ganti sebagian gambar tertanam dengan link gambar.' });
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
    if (html.length > 3_500_000) return res.status(400).json({ error: 'HTML terlalu besar (maks 3,5 MB)' });
    const taken = await db.get('SELECT id FROM lp_pages WHERE slug = ? AND id <> ?', slug, p.id);
    if (taken) return res.status(400).json({ error: 'Alamat ini sudah dipakai halaman lain' });
    const [row] = await db.run('UPDATE lp_pages SET slug = ?, html = ?, published = 1, updated_at = ? WHERE id = ? RETURNING *', slug, html, now(), p.id);
    res.json(pub(row));
  });

  // Template dari referensi: AI menulis ulang potongan teks (desain/HTML tidak disentuh) untuk produk lain.
  // Potongan dikirim dalam beberapa batch paralel supaya halaman panjang tetap muat.
  app.post('/api/lp-pages/ai-rewrite', scope, async (req, res) => {
    const b = req.body || {};
    const product = clip(b.product, 120);
    const brief = clip(b.brief, 4000);
    if (!product || !brief) return res.status(400).json({ error: 'Isi nama produk dan brief-nya dulu' });
    const segs = (Array.isArray(b.segments) ? b.segments : []).slice(0, 600)
      .map((s) => ({ id: clip(s?.id, 20), html: clip(s?.html, 3000) })).filter((s) => s.id && s.html);
    if (!segs.length) return res.status(400).json({ error: 'Template ini tidak punya teks untuk ditulis ulang' });
    const chunks = [];
    let size = Infinity;
    for (const s of segs) {
      if (size + s.html.length > 6000) { chunks.push([]); size = 0; }
      chunks.at(-1).push(s);
      size += s.html.length;
    }
    const schema = obj({ items: { type: 'array', items: obj({ id: str, html: str }) } });
    const rules = `${brandBlock(req.brand)}

Kamu copywriter landing page Indonesia. Template di bawah adalah landing page produk LAMA ("${clip(b.old_product, 120) || 'produk referensi'}").
Tulis ulang setiap potongan untuk produk BARU, dengan struktur & gaya persuasi yang sama.

Produk baru: ${product}
Brief produk baru: ${brief}
${clip(b.tone, 300) ? `Gaya bahasa: ${clip(b.tone, 300)}
` : ''}
Aturan:
- Kembalikan SEMUA id yang diberikan, masing-masing satu kali, dengan isi baru di "html".
- Pertahankan peran & panjang tiap potongan (±30%): judul tetap judul, tombol tetap pendek, poin tetap poin.
- Pertahankan tag HTML inline yang ada (mis. <span class="...">, <strong>, <br>) dan penanda ikon seperti ⟦0⟧ persis di posisi yang sesuai. Jangan menambah tag baru.
- Teks antarmuka umum (Hari, Jam, Menit, Detik, tanda –, angka urutan) biarkan sama.
- Jangan mengarang fakta yang tidak ada di brief: testimoni, nama pelanggan, jumlah pembeli/terjual, rating, izin (BPOM/Halal/SNI), sertifikat, harga, alamat, nomor telepon. Kalau potongan berisi hal itu dan brief tidak menyebutnya, tulis placeholder dalam kurung siku, mis. [Testimoni asli pelanggan], [Nama, kota], [Harga promo], [Nomor izin].
- Hindari klaim mutlak/overclaim ("pasti sembuh", "100% berhasil", "dijamin").
- id "title" = judul tab, "description" = deskripsi SEO (maks 160 karakter), "wa" = isi pesan WhatsApp otomatis dari pembeli ke admin, id yang diawali "alt" = teks alt gambar.`;
    try {
      const results = await Promise.all(chunks.map((chunk) => askClaude({
        schema, effort: 'low', maxTokens: 16000,
        content: `${rules}

Potongan (JSON):
${JSON.stringify(chunk)}`,
      })));
      res.json({ items: results.flatMap((r) => r.items || []) });
    } catch (err) {
      if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
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

  // Ambil HTML utuh dari link referensi untuk dijadikan template (desain asli dipertahankan, tanpa AI).
  app.post('/api/lp-pages/fetch-html', scope, async (req, res) => {
    try {
      res.json(await fetchPageHtml(clip(req.body?.url, 2000)));
    } catch (err) {
      if (err instanceof ScrapeError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  // Scrap LP dari link referensi: server mengambil halamannya, AI memetakan isinya ke blok LP Builder.
  // mode "rewrite" = tiru struktur & alur, tulis ulang untuk brand sendiri; "keep" = pakai teks aslinya apa adanya.
  app.post('/api/lp-pages/scrape', scope, async (req, res) => {
    const b = req.body || {};
    const keep = b.mode === 'keep';
    try {
      const src = await scrapePage(clip(b.url, 2000));
      const data = await askClaude({
        schema: SCRAPE_SCHEMA,
        effort: 'medium',
        maxTokens: 16000,
        content: `${keep ? '' : `${brandBlock(req.brand)}\n\n`}Ini hasil scrap sebuah landing page referensi. Ubah jadi landing page berbasis blok.

URL: ${src.url}
Judul: ${src.title}
Deskripsi: ${src.description}
Warna yang paling sering dipakai (urut terbanyak): ${src.colors.join(', ') || '-'}${src.theme_color ? ` · theme-color ${src.theme_color}` : ''}
Font: ${src.fonts.join(', ') || '-'}
Gambar (nomor sesuai [GAMBAR n] di kerangka):
${src.images.map((u, i) => `${i + 1}. ${u}`).join('\n') || '-'}${src.og_image ? `\nGambar og:image: ${src.og_image}` : ''}

Kerangka isi halaman (urut dari atas; # = judul, - = poin, [TOMBOL: teks → link]):
"""
${src.outline}
"""

${keep
  ? 'Tugas: pindahkan ISI ASLI halaman ini ke blok, sedekat mungkin dengan teks aslinya (jangan ditulis ulang, boleh dirapikan typo/spasi). Ikuti urutan section aslinya.'
  : `Tugas: tiru STRUKTUR, alur persuasi, dan gaya visual halaman ini (urutan section, jenis hook, cara menyajikan masalah/manfaat/bukti/penawaran), tapi TULIS ULANG semua kalimatnya dengan kata-kata baru untuk brand di atas. Jangan menyalin kalimat, nama produk, nama orang, atau klaim milik halaman referensi.
Brief tambahan: ${clip(b.brief, 3000) || '(tidak ada — sesuaikan dengan profil brand)'}
Testimoni: jangan pakai testimoni dari referensi; isi contoh dan tulis "Contoh testimoni" di text.`}
Link tombol: ${clip(b.cta_url, 500) || (keep ? 'pakai link tombol asli dari kerangka' : 'https://wa.me/')}

Aturan:
- Tipe blok: ${SECTION_TYPES.join(', ')}, image. Mulai "hero", akhiri "cta". 6-14 section sesuai panjang halaman asli.
- hero: heading = headline, subheading = penjelas, cta_text & cta_url terisi${b.images === false ? '.' : ', image_url = gambar utama/produk dari daftar (pilih yang paling relevan, boleh kosong).'}
- ${b.images === false ? 'Jangan pakai gambar dari halaman asli: image_url selalu string kosong, jangan buat blok image.' : 'Blok "image": image_url diambil PERSIS dari daftar gambar di atas (jangan mengarang URL), heading = keterangan singkat. Pakai hanya untuk gambar konten penting (produk, before-after, infografis), bukan logo/ikon.'}
- problem/benefits/features/steps/testimonials/faq: isi items (title + text). offer: heading = nama paket, subheading = harga, body = harga coret/garansi, items = isi paket/bonus.
- Field yang tidak dipakai isi string kosong, items yang tidak dipakai isi array kosong, image_url kosong untuk blok selain hero/image.
- theme: ambil warna utama & aksen dari warna referensi (hex #rrggbb), background & text yang kontrasnya nyaman dibaca. font = yang paling mirip dengan font referensi, salah satu dari: Inter, Poppins, Plus Jakarta Sans, DM Sans, Playfair Display, Montserrat.
- title & description: untuk SEO halaman baru.${keep ? '' : '\n- Hindari klaim mutlak/overclaim ("pasti", "100%", "dijamin sembuh"). Bahasa lisan Indonesia yang luwes.'}`,
      });
      // Gambar hanya boleh dari halaman sumber (AI kadang mengarang URL).
      const allowed = new Set([...src.images, src.og_image].filter(Boolean));
      for (const s of data.sections || []) if (s.image_url && !allowed.has(s.image_url)) s.image_url = '';
      data.sections = (data.sections || []).filter((s) => s.type !== 'image' || s.image_url);
      res.json({ ...data, source: { url: src.url, title: src.title, images: src.images.length } });
    } catch (err) {
      if (err instanceof AiError || err instanceof ScrapeError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });
}
