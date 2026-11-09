// Motion Factory (sisi user): profil produk, draft AI, request produksi, dan antrean.
// Agen di Mac mini punya route sendiri (agent-routes.js).
import path from 'node:path';
import fs from 'node:fs';
import { getSetting, now } from '../db.js';
import { askClaude } from '../ai.js';
import { canManage } from '../auth.js';
import { slugify, parseFolderId, validateProfile, PROFILE_FIELDS, PALETTE_KEYS, normalizePalette, defaultRules } from './profile.js';
import { VOICES, AGES, PERSONAS, PRESETS, LOOKS, SPEEDS, DURATIONS, DEFAULT_OPTIONS, normalizeOptions } from './options.js';

let ask = askClaude;
// Tes mengganti pemanggil AI; null mengembalikan yang asli.
export const setAskForTests = (fn) => { ask = fn || askClaude; };

// Daftar kata terlarang global (aturan aman keranjang kuning TikTok Shop), selalu ikut di setiap produk.
export const GLOBAL_BANNED = [
  'menyembuhkan', 'sembuh total', 'jaminan sembuh', 'obat', 'terapi', 'mengobati', 'dokter',
  'GERD', 'maag kronis', 'asma', 'sinusitis', 'bronkitis', 'infeksi', 'diabetes', 'kanker', 'hipertensi', 'jantung',
  '100% ampuh', 'permanen', 'instan', 'langsung hilang', 'terbaik nomor 1', 'tanpa efek samping',
  'diskon', 'promo', 'gratis', 'cuci gudang', 'stok terakhir',
];

const err = (res, status, error) => res.status(status).json({ error });
const parse = (s) => { try { return JSON.parse(s); } catch { return {}; } };
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const IMAGE_ERR = 'Gambar harus dari hasil unggahan di sini (PNG, JPG, atau WebP)';

const publicProduct = (r) => ({
  id: r.id, slug: r.slug, name: r.name, status: r.status, profile: parse(r.profile),
  product_image: r.product_image, label_image: r.label_image, approved_by: r.approved_by, approved_at: r.approved_at,
});

// Varian ejaan nama produk untuk brand_lock (spasi, strip, digabung).
function nameVariants(short) {
  const w = String(short).toLowerCase().trim();
  const out = new Set([w, w.replace(/\s+/g, ''), w.replace(/\s+/g, '-'), w.replace(/\s+/g, ' ')]);
  return [...out].filter(Boolean);
}

// Skema structured output: semua object additionalProperties:false dan semua properti required (lihat src/ai.js).
// Peta (brand_lock, tts_lexicon, compliance.replacements) dikirim AI sebagai daftar pasangan lalu diubah jadi objek di server.
const sStr = { type: 'string' };
const sArr = (items) => ({ type: 'array', items });
const sObj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const DRAFT_SCHEMA = sObj({
  short: sStr, tts_name: sStr, file_prefix: sStr,
  brand_lock: sArr(sObj({ key: sStr, variants: sArr(sStr) })),
  tts_lexicon: sArr(sObj({ key: sStr, value: sStr })),
  other_brands: sArr(sStr), label_regex: sStr,
  facts: sArr(sStr), audience: sStr,
  angles: sArr(sStr), hook_styles: sArr(sStr), cta_variants: sArr(sStr), badge_texts: sArr(sStr),
  compliance: sObj({ banned_phrases: sArr(sStr), rules: sArr(sStr), replacements: sArr(sObj({ from: sStr, to: sStr })) }),
  palette: sObj(Object.fromEntries(PALETTE_KEYS.map((k) => [k, sStr]))),
  safe_hashtags: sArr(sStr),
  story: sObj({
    category: sStr, daily_pain_points: sArr(sStr), physical_features: sArr(sStr), safe_benefits: sArr(sStr), usage_moments: sArr(sStr),
  }),
});

// Daftar pasangan [{key, value}] → objek; objek yang sudah berbentuk peta dibiarkan.
function pairsToMap(v, k, val) {
  if (Array.isArray(v)) {
    const out = {};
    for (const it of v) {
      const key = typeof it?.[k] === 'string' ? it[k].trim() : '';
      if (key && it[val] !== undefined && it[val] !== null) out[key] = it[val];
    }
    return out;
  }
  return v && typeof v === 'object' ? { ...v } : {};
}

const DRAFT_SYSTEM = `Kamu penyusun profil produk untuk pabrik video TikTok affiliate (keranjang kuning TikTok Shop) berbahasa Indonesia santai.
Aturan keras: jangan mengarang klaim kesehatan. Semua fakta dan manfaat harus selaras dengan klaim resmi di label, dan jangan pernah menyebut produk sebagai obat. Tulis fitur fisik hanya yang wajar terlihat di kemasan.
Isi "compliance.banned_phrases" dengan kata/klaim terlarang yang relevan untuk produk ini (nama penyakit, klaim medis, janji berlebihan, promo palsu), "compliance.rules" dengan aturan kepatuhan singkat (manfaat hanya sesuai klaim resmi, tanpa nama penyakit, tanpa klaim medis, tanpa promo/urgensi palsu), dan "compliance.replacements" dengan pasangan {from: frasa berisiko, to: frasa aman}.
"brand_lock" berisi {key: nama produk resmi, variants: salah eja/variannya}. "tts_lexicon" berisi {key: kata, value: cara baca untuk suara (pisah suku kata dengan strip)}; boleh kosong kalau namanya sudah mudah dibaca.
"other_brands" berisi merek lain yang tidak boleh disebut (boleh kosong). "palette" berisi warna hex (#RRGGBB) yang cocok dengan kemasan.
"label_regex" adalah regex pendek (huruf kecil) yang cocok dengan teks nama produk di label, jangan terlalu umum.
"daily_pain_points" minimal 3 item. "cta_variants" memuat ajakan lembut ke keranjang kuning. Balas hanya JSON sesuai skema.`;

export async function agentState(db) {
  const raw = await getSetting(db, 'factory:agent');
  const a = raw ? parse(raw) : null;
  if (!a || !a.seen_at) return { online: false, state: null, job_id: null, seen_at: null, drive_free_gb: null, legacy: null };
  const online = Date.now() - Date.parse(a.seen_at) < 120e3;
  return { online, state: a.state ?? null, job_id: a.job_id ?? null, seen_at: a.seen_at, drive_free_gb: a.drive_free_gb ?? null, legacy: a.legacy ?? null };
}

export function factoryRoutes(app, db, scope, { upload, storage } = {}) {
  // undefined/null/'' -> kosong (null); URL hasil unggahan sendiri -> dipakai; selain itu false (ditolak).
  const cleanImage = (v) => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string') return false;
    if (/^\/uploads\/[A-Za-z0-9._-]+$/.test(v) && !v.includes('..')) return v;
    return storage?.kind === 'blob' && storage.isOwnUrl(v) ? v : false;
  };
  const getProduct = async (req) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) ? db.get('SELECT * FROM factory_products WHERE id = ? AND brand_id = ?', id, req.brand.id) : null;
  };
  // Profil nggak lagi disetujui: request antre/aktif balik menunggu supaya agen nggak produksi dari profil belum disetujui
  // (agen yang sedang mengerjakannya menerima 'pause' lewat progress/heartbeat). Disetujui ulang → antre lagi.
  const unqueueJobs = (productId) => db.run("UPDATE factory_jobs SET status = 'menunggu_profil', updated_at = ? WHERE product_id = ? AND status IN ('antre', 'menyiapkan', 'produksi')", now(), productId);
  const reload = async (id) => publicProduct(await db.get('SELECT * FROM factory_products WHERE id = ?', id));

  app.get('/api/factory/products', scope, async (req, res) => {
    const rows = await db.all('SELECT * FROM factory_products WHERE brand_id = ? ORDER BY id DESC', req.brand.id);
    res.json({ products: rows.map(publicProduct) });
  });

  app.post('/api/factory/products', scope, async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const category = String(b.category || '').trim();
    const claim = String(b.official_claim || '').trim();
    if (!name) return err(res, 400, 'Nama produk wajib diisi');
    if (!category) return err(res, 400, 'Kategori wajib diisi');
    if (!claim) return err(res, 400, 'Klaim resmi di label wajib diisi');
    const imgs = {};
    for (const k of ['product_image', 'label_image']) {
      const v = cleanImage(b[k]);
      if (v === false) return err(res, 400, IMAGE_ERR);
      imgs[k] = v ?? null;
    }
    const slug = slugify(name);
    if (!slug) return err(res, 400, 'Nama produk harus mengandung huruf atau angka');
    if (await db.get('SELECT id FROM factory_products WHERE slug = ?', slug)) return err(res, 409, `Produk dengan kode "${slug}" sudah ada`);
    const profile = { name, official_claim: claim, story: { category } };
    if (b.notes) profile.notes = String(b.notes).slice(0, 2000);
    if (b.palette && typeof b.palette === 'object' && !Array.isArray(b.palette)) profile.palette = normalizePalette(b.palette);
    const t = now();
    let row;
    try {
      [row] = await db.run(
        'INSERT INTO factory_products (brand_id, slug, name, status, profile, product_image, label_image, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        req.brand.id, slug, name, 'draft', JSON.stringify(profile),
        imgs.product_image, imgs.label_image, req.user.username, t, t,
      );
    } catch {
      return err(res, 409, `Produk dengan kode "${slug}" sudah ada`);
    }
    res.json({ product: await reload(row.id) });
  });

  app.post('/api/factory/products/:id/draft', scope, async (req, res) => {
    const row = await getProduct(req);
    if (!row) return err(res, 404, 'Produk nggak ketemu');
    const cur = parse(row.profile);
    const claim = cur.official_claim;
    let out;
    try {
      out = await ask({
        schema: DRAFT_SCHEMA,
        system: DRAFT_SYSTEM,
        content: `Susun profil lengkap untuk produk ini.\nNama: ${row.name}\nKategori: ${cur.story?.category || '-'}\nKlaim resmi di label (WAJIB dipakai apa adanya): ${claim}\nCatatan dari user: ${cur.notes || '-'}\nProfil yang sudah ada (JSON): ${JSON.stringify(cur)}`,
        effort: 'medium',
        maxTokens: 8000,
      });
    } catch (e) {
      return err(res, e.status || 502, `AI gagal menyusun draft: ${e.message}`);
    }
    out = out && typeof out === 'object' ? out : {};
    const profile = { ...cur };
    for (const f of PROFILE_FIELDS) if (out[f] !== undefined && out[f] !== null) profile[f] = out[f];
    // Palet: punya user dipertahankan, kalau belum ada pakai saran AI, sisanya default (6 key tetap).
    const hasPalette = cur.palette && typeof cur.palette === 'object' && Object.keys(cur.palette).length;
    profile.palette = normalizePalette(hasPalette ? cur.palette : out.palette);
    profile.story = { ...(out.story || {}), category: cur.story?.category || out.story?.category };
    // Klaim resmi dan nama milik user, AI tidak boleh mengubah.
    profile.official_claim = claim;
    profile.name = row.name;
    profile.tts_lexicon = pairsToMap(profile.tts_lexicon, 'key', 'value');
    profile.other_brands = Array.isArray(profile.other_brands) ? profile.other_brands : [];
    const bl = pairsToMap(profile.brand_lock, 'key', 'variants');
    const short = String(profile.short || row.name.replace(/^\s*madu\s+/i, '')).trim();
    profile.short = short;
    const key = Object.keys(bl)[0] || short;
    bl[key] = [...new Set([...(Array.isArray(bl[key]) ? bl[key] : []), ...nameVariants(short)])];
    profile.brand_lock = bl;
    const comp = profile.compliance && typeof profile.compliance === 'object' ? { ...profile.compliance } : {};
    comp.banned_phrases = [...new Set([...(Array.isArray(comp.banned_phrases) ? comp.banned_phrases : []), ...GLOBAL_BANNED])];
    const rules = Array.isArray(comp.rules) ? comp.rules.filter((r) => typeof r === 'string' && r.trim()) : [];
    comp.rules = rules.length ? rules : defaultRules(claim);
    comp.replacements = pairsToMap(comp.replacements, 'from', 'to');
    profile.compliance = comp;
    await db.run(
      "UPDATE factory_products SET profile = ?, status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = ? WHERE id = ?",
      JSON.stringify(profile), now(), row.id,
    );
    await unqueueJobs(row.id);
    res.json({ product: await reload(row.id) });
  });

  app.put('/api/factory/products/:id', scope, async (req, res) => {
    const row = await getProduct(req);
    if (!row) return err(res, 404, 'Produk nggak ketemu');
    const b = req.body || {};
    if (!b.profile || typeof b.profile !== 'object' || Array.isArray(b.profile)) return err(res, 400, 'Profil wajib dikirim');
    const pick = (k) => (b[k] === undefined ? row[k] : cleanImage(b[k]));
    const pi = pick('product_image');
    const li = pick('label_image');
    if (pi === false || li === false) return err(res, 400, IMAGE_ERR);
    // Klaim resmi, kategori, dan catatan boleh dikoreksi; disimpan di field profil yang dipakai backend/agen.
    const profile = { ...b.profile };
    const claim = b.official_claim ?? profile.official_claim;
    if (claim !== undefined) {
      if (typeof claim !== 'string' || !claim.trim()) return err(res, 400, 'Klaim resmi di label wajib diisi');
      profile.official_claim = claim.trim();
    }
    const category = b.category ?? profile.story?.category;
    if (category !== undefined) {
      if (typeof category !== 'string' || !category.trim()) return err(res, 400, 'Kategori wajib diisi');
      profile.story = { ...(profile.story && typeof profile.story === 'object' ? profile.story : {}), category: category.trim() };
    }
    if (b.notes !== undefined) profile.notes = String(b.notes ?? '').slice(0, 2000);
    // Field yang UI belum bisa isi: palet default (6 key), lexicon & merek lain boleh kosong.
    profile.palette = normalizePalette(profile.palette);
    if (profile.tts_lexicon === undefined) profile.tts_lexicon = {};
    if (profile.other_brands === undefined) profile.other_brands = [];
    // Edit setelah disetujui: balik ke draft, harus disetujui ulang.
    await db.run(
      "UPDATE factory_products SET profile = ?, product_image = ?, label_image = ?, status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = ? WHERE id = ?",
      JSON.stringify(profile), pi, li, now(), row.id,
    );
    await unqueueJobs(row.id);
    res.json({ product: await reload(row.id) });
  });

  app.post('/api/factory/products/:id/approve', scope, async (req, res) => {
    if (!canManage(req.user)) return err(res, 403, 'Cuma pemilik/admin yang bisa menyetujui profil');
    const row = await getProduct(req);
    if (!row) return err(res, 404, 'Produk nggak ketemu');
    const errors = validateProfile(parse(row.profile));
    if (errors.length) return err(res, 400, `Profil belum lengkap: ${errors.join(', ')}`);
    if (!row.product_image) return err(res, 400, 'Gambar produk belum diunggah');
    if (!row.label_image) return err(res, 400, 'Gambar label belum diunggah');
    const t = now();
    await db.run("UPDATE factory_products SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?", req.user.username, t, t, row.id);
    await db.run("UPDATE factory_jobs SET status = 'antre', updated_at = ? WHERE product_id = ? AND status = 'menunggu_profil'", t, row.id);
    res.json({ product: await reload(row.id) });
  });

  // Unggah gambar produk/label. Lokal: file ke server. Online (Blob): browser upload ke Blob, server terima URL-nya.
  const uploadMw = upload ? upload.single('file') : (_req, _res, next) => next();
  app.post('/api/factory/upload', scope, uploadMw, async (req, res) => {
    if (req.file) {
      if (!IMAGE_TYPES.includes(req.file.mimetype) || !/\.(png|jpe?g|webp)$/i.test(req.file.path)) {
        fs.rm(req.file.path, () => {});
        return err(res, 400, 'Format gambar harus PNG, JPG, atau WebP');
      }
      return res.json({ url: `/uploads/${path.basename(req.file.path)}` });
    }
    const url = req.body?.url;
    if (url && storage?.kind === 'blob' && storage.isOwnUrl(url)) return res.json({ url });
    err(res, 400, 'Pilih gambar dulu');
  });

  // ---- Request produksi + antrean ----
  const getJob = async (req) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) ? db.get('SELECT * FROM factory_jobs WHERE id = ? AND brand_id = ?', id, req.brand.id) : null;
  };
  const reloadJob = async (id) => {
    const row = await db.get('SELECT * FROM factory_jobs WHERE id = ?', id);
    if (!row) return row;
    try { row.options = JSON.parse(row.options || '{}'); } catch { row.options = { ...DEFAULT_OPTIONS }; }
    return row;
  };

  app.get('/api/factory/options', scope, async (_req, res) => res.json({
    voices: VOICES, ages: AGES, personas: PERSONAS, presets: PRESETS, looks: LOOKS, voice_speeds: SPEEDS, durations: DURATIONS,
  }));

  // Antrean FIFO lintas brand: prioritas tertinggi dulu, lalu id terkecil.
  app.get('/api/factory/jobs', scope, async (req, res) => {
    const rows = await db.all(
      'SELECT j.*, p.name AS product_name FROM factory_jobs j LEFT JOIN factory_products p ON p.id = j.product_id WHERE j.brand_id = ? ORDER BY j.id DESC',
      req.brand.id,
    );
    const queue = await db.all("SELECT id FROM factory_jobs WHERE status = 'antre' ORDER BY priority DESC, id ASC");
    const pos = new Map(queue.map((q, i) => [Number(q.id), i + 1]));
    res.json({
      jobs: rows.map((j) => ({ ...j, options: (() => { try { return JSON.parse(j.options || '{}'); } catch { return { ...DEFAULT_OPTIONS }; } })(), queue_position: j.status === 'antre' ? pos.get(Number(j.id)) ?? null : null })),
      agent: await agentState(db),
    });
  });

  app.post('/api/factory/jobs', scope, async (req, res) => {
    const b = req.body || {};
    const target = typeof b.target === 'string' && b.target.trim() !== '' ? Number(b.target) : b.target;
    if (!Number.isInteger(target) || target < 1 || target > 20000) return err(res, 400, 'Target harus bilangan bulat 1 sampai 20.000');
    if (!['kerkun', 'awareness', 'campur'].includes(b.cta)) return err(res, 400, 'CTA harus kerkun, awareness, atau campur');
    const footage = String(b.footage_url || '').trim();
    if (!parseFolderId(footage)) return err(res, 400, 'Link harus folder Google Drive');
    const product = await db.get('SELECT * FROM factory_products WHERE id = ? AND brand_id = ?', Number(b.product_id), req.brand.id);
    if (!product) return err(res, 404, 'Produk nggak ketemu');
    const options = normalizeOptions(b.options, (() => { try { return JSON.parse(product.profile || '{}'); } catch { return {}; } })());
    if (options.error) return err(res, 400, options.error);
    const t = now();
    const [row] = await db.run(
      'INSERT INTO factory_jobs (brand_id, product_id, target, cta, footage_url, options, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      req.brand.id, product.id, target, b.cta, footage, JSON.stringify(options.value), product.status === 'approved' ? 'antre' : 'menunggu_profil', req.user.username, t, t,
    );
    res.json({ job: await reloadJob(row.id) });
  });

  const STATUSES = ['menunggu_profil', 'antre', 'menyiapkan', 'produksi', 'selesai', 'dijeda', 'dibatalkan', 'gagal'];
  const transition = (action, from, to, extra = '') => app.post(`/api/factory/jobs/:id/${action}`, scope, async (req, res) => {
    const j = await getJob(req);
    if (!j) return err(res, 404, 'Request nggak ketemu');
    const allowed = from || STATUSES.filter((x) => x !== 'selesai');
    if (!allowed.includes(j.status)) {
      return err(res, 400, j.status === 'selesai' && !from ? 'Request yang sudah selesai nggak bisa dibatalkan' : `Request berstatus "${j.status}" nggak bisa di-${action}`);
    }
    // Kembali ke antre cuma kalau produknya approved; kalau tidak, menunggu_profil.
    const toSql = to === 'antre'
      ? "CASE WHEN (SELECT status FROM factory_products WHERE id = factory_jobs.product_id) = 'approved' THEN 'antre' ELSE 'menunggu_profil' END"
      : '?';
    const toArgs = to === 'antre' ? [] : [to];
    // Atomik: hanya berubah kalau status masih sama seperti yang dicek (agen/user lain bisa mengubahnya bersamaan).
    const rows = await db.run(
      `UPDATE factory_jobs SET status = ${toSql}, updated_at = ?${extra} WHERE id = ? AND brand_id = ? AND status IN (${allowed.map(() => '?').join(',')}) RETURNING id`,
      ...toArgs, now(), j.id, req.brand.id, ...allowed,
    );
    if (!rows.length) return err(res, 409, 'Status request sudah berubah, muat ulang');
    res.json({ job: await reloadJob(j.id) });
  });
  // Agen tahu lewat commands heartbeat / action progress, yang dibaca dari status di DB.
  transition('pause', ['antre', 'menyiapkan', 'produksi'], 'dijeda');
  transition('resume', ['dijeda'], 'antre');
  transition('cancel', null, 'dibatalkan');
  transition('retry', ['gagal'], 'antre', ', message = NULL, finished_at = NULL, eta_at = NULL');

  app.post('/api/factory/jobs/:id/priority', scope, async (req, res) => {
    if (!canManage(req.user)) return err(res, 403, 'Cuma pemilik/admin yang bisa mengubah prioritas');
    const j = await getJob(req);
    if (!j) return err(res, 404, 'Request nggak ketemu');
    const priority = req.body?.priority;
    if (typeof priority !== 'number' || !Number.isInteger(priority)) return err(res, 400, 'Prioritas harus bilangan bulat');
    await db.run('UPDATE factory_jobs SET priority = ?, updated_at = ? WHERE id = ?', priority, now(), j.id);
    res.json({ job: await reloadJob(j.id) });
  });
}
