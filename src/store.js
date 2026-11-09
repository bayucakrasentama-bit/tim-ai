// Toko Digital — katalog produk digital ala lynk.id. Seed dari riset kompetitor (Ratware/Rahyang):
// foto gen, music gen, voice gen, prompt gen, adspro lab, remove gen, product gen, kursus.
// CRUD + publik list/detail untuk landing toko.
import { getSetting, setSetting, now } from './db.js';

const SEED = [
  {
    slug: 'photo-gen', title: 'PHOTO GEN: Tool Studio Foto AI Premium All-In-One', category: 'tools',
    price: 69000, price_old: 289000,
    summary: 'Studio foto AI unlimited, tanpa langganan. 6100+ pengguna.',
    description: 'Tool studio foto AI all-in-one: photoshoot produk, model AI, food photography, pas foto, ubah background, mockup — semua dari modal HP. Unlimited generate, sekali bayar.',
    benefits: ['Unlimited generate', 'Sekali bayar, tanpa langganan', 'Bisa HP / Laptop / PC', 'Gratis update selamanya', 'Grup support'],
    angle: 'Reel: "Nyesel banget baru tau ada AI selengkap ini — pas foto, prewed, maternity, foto produk premium cuma modal HP"',
    url: 'https://lynk.id/ratware/7e8ddov5rp29',
  },
  {
    slug: 'music-gen', title: 'MUSIC GEN: Tool Premium Musik & Remix Instrumen', category: 'tools',
    price: 99000, price_old: 349000,
    summary: 'Buat musik & remix instrumen, generate unlimited.',
    description: 'Tool premium untuk membuat musik original dan remix instrumen dari teks/ide. Generate unlimited, cocok untuk background konten, iklan, dan podcast.',
    benefits: ['Generate unlimited', 'Sekali bayar', 'Bisa HP / Laptop / PC', 'Gratis update'],
    angle: 'Bundle jual bareng Photo/Video Gen sebagai "studio konten lengkap"',
    url: 'https://lynk.id/ratware/m2n3e7gyd36v',
  },
  {
    slug: 'voice-gen', title: 'VOICE GEN: TTS, Voice Cloning & Voice Design', category: 'tools',
    price: 99000, price_old: 349000,
    summary: 'TTS natural, kloning suara 5-30 detik, voice design. Unlimited.',
    description: 'Voice Gen — Ultimate Voice Generator: ubah teks jadi audio natural, tiru suara dari sampel audio 5-30 detik, atau rancang karakter suara baru (gender, usia, nada, emosi). Tanpa kredit karakter, tanpa API.',
    benefits: ['Unlimited kloning suara', 'Artikulasi & intonasi asli', 'TANPA sistem kredit / API', 'Sekali bayar', 'Update gratis & grup komunitas'],
    angle: 'Reel: "Kloning Suara Bahasa Arab Sekali Klik" — konten niche Arab tanpa fasih pelafalan',
    url: 'https://lynk.id/ratware/j39y95ev95j9',
  },
  {
    slug: 'prompt-gen', title: 'PROMPT GEN: Ide Simpel Jadi JSON Prompt Kompleks', category: 'tools',
    price: 49000, price_old: 229000,
    summary: 'Ubah ide simpel jadi JSON prompt detail & kompleks.',
    description: 'Tools premium untuk mengubah ide sederhana menjadi JSON prompt yang detail dan kompleks — untuk image, video, dan AI generator lainnya.',
    benefits: ['Prompt terstruktur JSON', 'Sekali bayar', 'Update gratis'],
    angle: 'Dijual sebagai bundle "AI Toolkit" dengan Photo Gen + Music Gen',
    url: 'https://lynk.id/ratware/xodp34wzklxp',
  },
  {
    slug: 'adspro-lab', title: 'ADSPRO LAB: Riset Iklan Winning & Analisis Kompetitor', category: 'tools',
    price: 49000, price_old: 229000,
    summary: 'Riset iklan winning & kompetitor di Meta Ads Library.',
    description: 'Tool premium untuk riset iklan winning dan analisis kompetitor langsung dari Meta Ads Library — tahu mana iklan yang jalan, angle apa yang dipakai, sebelum spend budget.',
    benefits: ['Riset Meta Ads Library', 'Analisis kompetitor', 'Sekali bayar'],
    angle: 'Reel: "Iklan boncos bukan salah settingan teknis — stop otak-atik Ads Manager"',
    url: 'https://lynk.id/ratware/k1mpdd3jqjqd',
  },
  {
    slug: 'remove-gen', title: 'REMOVE GEN: Hapus Watermark AI Sekali Klik', category: 'tools',
    price: 49000, price_old: 229000,
    summary: 'Hapus watermark AI instan, sekali klik.',
    description: 'Tools premium untuk menghapus watermark AI secara instan — cukup sekali klik, cepat tanpa ribet.',
    benefits: ['Sekali klik', 'Cepat tanpa ribet', 'Sekali bayar'],
    angle: 'Pelengkap bundle foto/video AI (hasil generate bebas watermark)',
    url: 'https://lynk.id/ratware/qrxr60gjm0rj',
  },
  {
    slug: 'product-gen', title: 'PRODUCT GEN: Shot Produk Kualitas Profesional', category: 'tools',
    price: 69000, price_old: 289000,
    summary: 'Shot produk profesional dalam hitungan detik.',
    description: 'Tools premium untuk membuat shot produk dengan kualitas profesional dalam hitungan detik — cukup upload foto produk, AI yang sisakan.',
    benefits: ['Hasil profesional', 'Hitungan detik', 'Sekali bayar'],
    angle: 'Target seller Tokopedia/Shopee/TikTok Shop yang butuh foto katalog',
    url: 'https://lynk.id/ratware/w0qq0qj2m65q',
  },
  {
    slug: 'ai-course-2026', title: 'Belajar Lengkap AI Tools Penghasil CUAN 2026', category: 'course',
    price: 649000, price_old: 5000000,
    summary: 'Ultimate course AI tools monetisasi (with Anjas Maradita).',
    description: 'Kursus lengkap belajar AI tools penghasil cuan 2026 — dari nol sampai monetisasi, dengan Anjas Maradita.',
    benefits: ['Materi lengkap', 'Akses materi', 'Update materi'],
    angle: 'High-ticket, diskon besar (Rp5jt -> Rp649rb) sebagai anchor harga',
    url: 'https://lynk.id/ratware/NRr6Z5W',
  },
  {
    slug: 'master-edit-gambar', title: 'MASTER EDIT GAMBAR: Jago Edit Gambar dengan AI', category: 'course',
    price: 49000, price_old: 229000,
    summary: 'Panduan lengkap edit gambar AI + akses tool.',
    description: 'Panduan lengkap jago edit gambar dengan AI, termasuk panduan akses tool AI.',
    benefits: ['Panduan lengkap', 'Termasuk akses tool AI'],
    angle: 'Entry-level course, harga pintu masuk funnel',
    url: 'https://lynk.id/ratware/8mde1d209jjm',
  },
  {
    slug: 'ai-content-marketing', title: 'AI CONTENT MARKETING COURSE', category: 'course',
    price: 249000, price_old: 699000,
    summary: 'Paket lengkap konten iklan & affiliate dengan AI.',
    description: 'Paket lengkap belajar memanfaatkan AI dalam pembuatan konten iklan dan affiliate yang menarik serta menjual.',
    benefits: ['Konten iklan & affiliate', 'Materi lengkap'],
    angle: 'Bundle course + tools untuk affiliate marketer',
    url: 'https://lynk.id/ratware/6vdn2x3rlgzd',
  },
  {
    slug: 'rahyang-influencer', title: 'Rahyang Influencer & Motion Control AI', category: 'tools',
    price: 0, price_old: 499000,
    summary: 'Prompt AI influencer + motion control (gambar jadi video cinematic).',
    description: 'Platform premium berisi Prompt AI, Motion Control, Video Commercial, Prompt Influencer, Storyboard AI, Veo 3, Gemini, Flow, Prompt Marketing siap pakai. Motion Control: gambar diam jadi video cinematic dengan gerakan kamera profesional.',
    benefits: ['Unlimited free', 'Lifetime tools', 'Face consistency AI', 'Support semua HP', 'Bonus grup WA 2 arah + tutorial'],
    angle: 'Reel: "Komen INFLUENCER -> link dikirim ke DM, bayar seiklasnya" (Rp499rb -> Rp0)',
    url: 'https://lynk.id/rahyangsuryaaji/8kd6wkdgzo55',
  },
];

const KEY = 'store_products_seeded_v1';

async function seedIfEmpty(db) {
  const done = await getSetting(db, KEY);
  if (done) return;
  const cnt = await db.all('SELECT COUNT(*) AS n FROM store_products');
  if (Number(cnt?.[0]?.n || 0) === 0) {
    const t = now();
    for (let i = 0; i < SEED.length; i++) {
      const p = SEED[i];
      await db.run(
        `INSERT INTO store_products (slug, title, category, price, price_old, summary, description, benefits, angle, url, published, sort, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        p.slug, p.title, p.category, p.price, p.price_old, p.summary, p.description,
        JSON.stringify(p.benefits), p.angle, p.url, i, t,
      );
    }
  }
  await setSetting(db, KEY, '1');
}

function rowToProduct(r) {
  let benefits = [];
  try { benefits = JSON.parse(r.benefits || '[]'); } catch { benefits = []; }
  return { ...r, price: Number(r.price) || 0, price_old: r.price_old == null ? null : Number(r.price_old), published: !!r.published, benefits };
}

export function storeRoutes(app, db, scope) {
  // Katalog (publik, hanya yang published)
  app.get('/api/katalog/products', async (_req, res) => {
    await seedIfEmpty(db);
    const rows = await db.all('SELECT * FROM store_products WHERE published = 1 ORDER BY sort, id');
    res.json({ products: rows.map(rowToProduct) });
  });

  // Detail per slug (publik)
  app.get('/api/katalog/products/:slug', async (req, res) => {
    await seedIfEmpty(db);
    const rows = await db.all('SELECT * FROM store_products WHERE slug = ?', req.params.slug);
    const row = rows[0];
    if (!row || !row.published) return res.status(404).json({ error: 'Produk nggak ketemu' });
    res.json({ product: rowToProduct(row) });
  });

  // Kelola (semua produk termasuk draft)
  app.get('/api/katalog/admin/products', scope, async (_req, res) => {
    await seedIfEmpty(db);
    const rows = await db.all('SELECT * FROM store_products ORDER BY sort, id');
    res.json({ products: rows.map(rowToProduct) });
  });

  app.post('/api/katalog/admin/products', scope, async (req, res) => {
    const b = req.body || {};
    if (!b.slug || !b.title) return res.status(400).json({ error: 'slug & title wajib' });
    const t = now();
    try {
      const rows = await db.run(
        `INSERT INTO store_products (slug, title, category, price, price_old, summary, description, benefits, angle, url, published, sort, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        b.slug, b.title, b.category || 'tools', Number(b.price) || 0, b.price_old ?? null,
        b.summary || '', b.description || '', JSON.stringify(b.benefits || []),
        b.angle || '', b.url || '', b.published === false ? 0 : 1, Number(b.sort) || 0, t,
      );
      res.json({ product: rowToProduct(rows[0]) });
    } catch {
      res.status(400).json({ error: 'Slug sudah dipakai atau data tidak valid' });
    }
  });

  app.patch('/api/katalog/admin/products/:id', scope, async (req, res) => {
    const b = req.body || {};
    const fields = { title: 1, category: 1, price: 1, price_old: 1, summary: 1, description: 1, benefits: 1, angle: 1, url: 1, published: 1, sort: 1 };
    const sets = [];
    const vals = [];
    for (const [k, ok] of Object.entries(fields)) {
      if (b[k] !== undefined && ok) {
        sets.push(`${k} = ?`);
        vals.push(k === 'benefits' ? JSON.stringify(b[k]) : k === 'published' ? (b[k] ? 1 : 0) : b[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Tidak ada perubahan' });
    vals.push(req.params.id);
    await db.run(`UPDATE store_products SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    const rows = await db.all('SELECT * FROM store_products WHERE id = ?', req.params.id);
    if (!rows[0]) return res.status(404).json({ error: 'Produk nggak ketemu' });
    res.json({ product: rowToProduct(rows[0]) });
  });

  app.delete('/api/katalog/admin/products/:id', scope, async (req, res) => {
    await db.run('DELETE FROM store_products WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });
}
