// Foto AI — studio foto AI ala MantraFoto: photoshoot produk, model AI, food photography,
// ubah background, pas foto, kreatif iklan, dll. Foto referensi dikirim ke model image Gemini
// (edit berbasis referensi: identitas produk/wajah dipertahankan), hasil disimpan seperti media lain.

import crypto from 'node:crypto';
import { getSetting } from './db.js';
import { loadKeys } from './ai-router.js';

class FotoError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const FOTO_TOOLS = [
  { id: 'product', icon: '📸', name: 'Photoshoot Produk', desc: 'Foto produk jadi kualitas studio profesional', aspect: '1:1',
    fields: [{ k: 'scene', label: 'Latar / scene (opsional)', ph: 'mis. meja marmer, cahaya alami pagi' }],
    build_prompt: 'Professional product photography of the exact product, premium studio lighting, photorealistic.',
    build: (f, extra) => `Professional e-commerce product photography of the EXACT product from the reference photo — keep the packaging, label, colors and shape identical. Premium studio shot, soft diffused lighting, subtle natural shadow, crisp focus on the product${f.scene ? `, background: ${f.scene}` : ', clean minimal light-grey studio background'}, high-end commercial look, photorealistic.${extra ? ` ${extra}.` : ''}` },
  { id: 'model', icon: '🧑‍🎤', name: 'Model AI', desc: 'Produk dipakai/dipegang model AI', aspect: '3:4',
    fields: [{ k: 'scene', label: 'Adegan (opsional)', ph: 'mis. wanita muda tersenyum memegang produk' }],
    build_prompt: 'Lifestyle photo of a photorealistic AI model naturally holding/using the exact product, photorealistic.',
    build: (f, extra) => `Lifestyle photo of a photorealistic Indonesian AI model naturally holding/using the EXACT product from the reference photo — keep packaging and label identical. ${f.scene || 'Friendly young Indonesian woman, warm genuine smile, holding the product toward camera.'} Natural soft lighting, shallow depth of field, authentic candid feel, commercial lifestyle photography.${extra ? ` ${extra}.` : ''}` },
  { id: 'food', icon: '🍽️', name: 'Food & Beverage', desc: 'Styling foto makanan/minuman', aspect: '1:1',
    fields: [{ k: 'scene', label: 'Styling (opsional)', ph: 'mis. segelas es dingin dengan tetesan air' }],
    build_prompt: 'Professional food and beverage photography of the exact product, appetizing styling, photorealistic.',
    build: (f, extra) => `Professional food & beverage photography of the EXACT product/dish from the reference photo — keep it recognizable and identical. ${f.scene || 'Appetizing styling, fresh ingredients around it, steam or condensation for freshness.'} Top-down 45-degree angle, warm natural window light, rich textures, magazine cover quality, photorealistic.${extra ? ` ${extra}.` : ''}` },
  { id: 'pas-foto', icon: '🪪', name: 'Pas Foto', desc: 'Pas foto formal (merah/biru/putih)', aspect: '3:4',
    fields: [{ k: 'bg', label: 'Warna latar', ph: 'mis. merah / biru / putih' }],
    build_prompt: 'Formal passport photo, identical face, neat formal attire, solid color background, official ID standard.',
    build: (f, extra) => `Formal passport photo of the person in the reference photo — same face, identical identity and facial features. Wearing neat formal attire (dark blazer, white shirt, tie for men / blazer for women), natural friendly expression, straight head pose. Solid ${f.bg || 'red'} background, even studio lighting, official ID photo standard, photorealistic.${extra ? ` ${extra}.` : ''}` },
  { id: 'ads', icon: '📣', name: 'Kreatif Iklan', desc: 'Visual iklan dengan ruang teks', aspect: '4:5',
    fields: [{ k: 'scene', label: 'Konsep adegan', ph: 'mis. produk melayang dengan percikan air' }],
    build_prompt: 'Eye-catching advertising creative of the exact product with copy space for headline, photorealistic.',
    build: (f, extra) => `Eye-catching advertising creative of the EXACT product from the reference photo — keep packaging and label identical. ${f.scene || 'Dynamic hero shot with dramatic lighting and energetic background elements.'} Bold commercial ad style, high contrast, copy space (empty area) for headline text, scroll-stopping social media ad, photorealistic.${extra ? ` ${extra}.` : ''}` },
  { id: 'background', icon: '🏞️', name: 'Ubah Background', desc: 'Ganti latar foto', aspect: '1:1',
    fields: [{ k: 'scene', label: 'Background baru *', ph: 'mis. pantai senja, dapur minimalis', req: true }],
    build_prompt: 'Replace the background with the requested scene, keep the subject identical, realistic composite.',
    build: (f, extra) => `Replace the background of the reference photo with: ${f.scene}. Keep the main subject (product/person) EXACTLY the same — identical shape, color, pose and lighting match to the new scene. Seamless realistic composite, correct shadows and reflections on the new background, photorealistic.${extra ? ` ${extra}.` : ''}` },
  { id: 'white-bg', icon: '⬜', name: 'Background Putih', desc: 'Latar putih untuk marketplace', aspect: '1:1',
    fields: [],
    build_prompt: 'The exact product on a pure white background, e-commerce marketplace standard, photorealistic.',
    build: (_f, extra) => `The EXACT product from the reference photo on a pure white (#FFFFFF) background, e-commerce marketplace standard. Keep packaging and label identical, even soft lighting, natural subtle shadow under the product, sharp clean edges, photorealistic studio shot.${extra ? ` ${extra}.` : ''}` },
  { id: 'macro', icon: '🔍', name: 'Close-up Detail', desc: 'Detail tekstur & kemasan', aspect: '1:1',
    fields: [],
    build_prompt: 'Extreme close-up macro photography of the product focusing on fine detail and texture, photorealistic.',
    build: (_f, extra) => `Extreme close-up macro photography of the EXACT product from the reference photo, focusing on fine details and texture of the packaging/label. Dramatic directional lighting, rich material detail, shallow depth of field, premium product macro shot, photorealistic.${extra ? ` ${extra}.` : ''}` },
  { id: 'flatlay', icon: '🎨', name: 'Flatlay', desc: 'Tata letak datar dengan props', aspect: '1:1',
    fields: [{ k: 'scene', label: 'Props (opsional)', ph: 'mis. dedaunan, kain linen, cangkir kopi' }],
    build_prompt: 'Top-down flatlay photography with tasteful props around the exact product, editorial style.',
    build: (f, extra) => `Top-down flatlay photography featuring the EXACT product from the reference photo — keep packaging and label identical. ${f.scene || 'Tasteful props arranged around the product, harmonious color palette.'} Neat composition on a clean surface, soft even lighting, editorial flatlay style, photorealistic.${extra ? ` ${extra}.` : ''}` },
  { id: 'custom', icon: '✨', name: 'Instruksi Bebas', desc: 'Edit foto sesuai instruksi sendiri', aspect: '1:1',
    fields: [{ k: 'scene', label: 'Instruksi *', ph: 'mis. buat foto ini lebih cerah dengan nuansa vintage', req: true }],
    build_prompt: 'Apply the custom instruction to the photo, keep the subject recognizable, photorealistic edit.',
    build: (f, extra) => `${f.scene}.${extra ? ` ${extra}.` : ''} Keep the main subject of the reference photo recognizable and consistent. High quality photorealistic edit.` },
];

// Model image Gemini, dicoba berurutan (nama model bisa berbeda per akun/versi).
const GEMINI_IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image'];
const RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '4:5'];

// Key Gemini: pribadi user -> env -> key workspace (sama seperti modul AI lainnya).
async function geminiKeyFor(db, userId) {
  const personal = userId != null ? (await getSetting(db, `ai_key_user:${userId}`)) || '' : '';
  const saved = JSON.parse((await getSetting(db, 'ai_config')) || '{}');
  const routerKey = (await loadKeys(db)).gemini?.key || '';
  return personal || process.env.GEMINI_API_KEY || saved.gemini_key || routerKey || '';
}

function parseDataUrl(u) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(u || ''));
  if (!m) throw new FotoError('Format gambar tidak didukung (pakai PNG/JPEG/WebP)');
  return { mime: m[1], data: m[2] };
}

async function saveImage(buf) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const r = await put(`foto-ai/${new Date().toISOString().slice(0, 10)}/${crypto.randomBytes(8).toString('hex')}.png`, buf, { access: 'public', contentType: 'image/png' });
    return r.url;
  }
  return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
}

// Panggil Gemini image model dengan foto referensi (bisa lebih dari satu); kembalikan gambar hasil.
async function generateWithGemini({ key, prompt, images, aspect }) {
  const body = {
    contents: [{ role: 'user', parts: [...images.map((img) => ({ inlineData: { mimeType: img.mime, data: img.data } })), { text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], ...(aspect ? { imageConfig: { aspectRatio: aspect } } : {}) },
  };
  let lastErr;
  for (const model of GEMINI_IMAGE_MODELS) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body), signal: AbortSignal.timeout(120_000),
      });
    } catch (err) { throw new FotoError(`Gemini tidak bisa dihubungi: ${err.message}`, 502); }
    if (res.status === 404) { lastErr = new Error(`model ${model} tidak tersedia`); continue; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error?.message || res.statusText;
      if (res.status === 429) throw new FotoError('Kuota Gemini habis sementara — coba lagi beberapa menit.', 429);
      throw new FotoError(`Gemini: ${msg}`, res.status === 401 ? 502 : 400);
    }
    const parts = data.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData?.data);
    if (img) return { data: img.inlineData.data, model };
    lastErr = new Error('model tidak mengembalikan gambar');
  }
  throw new FotoError(`Gagal membuat foto: ${lastErr?.message || 'tidak diketahui'}`, 502);
}

export function fotoAiRoutes(app, db, scope) {
  app.get('/api/foto-ai/tools', (_req, res) => res.json({ tools: FOTO_TOOLS.map(({ build, ...t }) => t) }));

  app.post('/api/foto-ai/generate', scope, async (req, res) => {
    const b = req.body || {};
    const tool = FOTO_TOOLS.find((t) => t.id === b.tool);
    if (!tool) throw new FotoError('Tool foto tidak dikenal');
    const photos = (Array.isArray(b.photos) ? b.photos : []).slice(0, 4);
    if (!photos.length) throw new FotoError('Upload foto referensi dulu');
    const fields = b.fields && typeof b.fields === 'object' ? b.fields : {};
    for (const f of tool.fields) {
      if (f.req && !String(fields[f.k] || '').trim()) throw new FotoError(`Isi kolom "${f.label.replace(' *', '')}" dulu`);
    }
    const extra = String(b.extra || '').slice(0, 500);
    const ratio = RATIOS.includes(b.ratio) ? b.ratio : tool.aspect;
    const prompt = tool.build(fields, extra);
    const images = photos.map(parseDataUrl);
    const key = await geminiKeyFor(db, req.user?.id ?? null);
    if (!key) throw new FotoError('API key Gemini belum diisi. Buka Pengaturan → AI & API Keys.', 503);
    const out = await generateWithGemini({ key, prompt, images, aspect: ratio });
    const url = await saveImage(Buffer.from(out.data, 'base64'));
    res.json({ result: { url, prompt, model: out.model, ratio } });
  });
}
