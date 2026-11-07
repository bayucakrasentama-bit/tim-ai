// Model profil produk Motion Factory: validasi, slug, dan parser folder Drive.

export const STORY_FIELDS = ['category', 'daily_pain_points', 'physical_features', 'safe_benefits', 'usage_moments'];

export const PROFILE_FIELDS = [
  'name', 'short', 'tts_name', 'file_prefix', 'official_claim', 'brand_lock', 'tts_lexicon',
  'other_brands', 'label_regex', 'facts', 'audience', 'angles', 'hook_styles', 'cta_variants',
  'badge_texts', 'compliance', 'palette', 'safe_hashtags', 'story',
];

const STRING_FIELDS = ['name', 'short', 'tts_name', 'file_prefix', 'official_claim', 'label_regex', 'audience'];
const LIST_FIELDS = ['facts', 'angles', 'hook_styles', 'cta_variants', 'badge_texts', 'safe_hashtags'];
const STORY_LISTS = ['daily_pain_points', 'physical_features', 'safe_benefits', 'usage_moments'];

// Kunci palet persis seperti tipe Palette di Motion Factory (src/types.ts).
export const PALETTE_KEYS = ['primary', 'highlight', 'cta', 'cream', 'ink', 'white'];
export const DEFAULT_PALETTE = { primary: '#F28C28', highlight: '#FFC93C', cta: '#E8452C', cream: '#FFF3E3', ink: '#161210', white: '#FFFFFF' };
const HEX = /^#[0-9A-Fa-f]{6}$/;

// Palet lengkap: nilai hex yang valid dipakai, sisanya dari palet default.
export function normalizePalette(p) {
  const src = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  return Object.fromEntries(PALETTE_KEYS.map((k) => [k, typeof src[k] === 'string' && HEX.test(src[k].trim()) ? src[k].trim().toUpperCase() : DEFAULT_PALETTE[k]]));
}

// Aturan kepatuhan dasar (keranjang kuning TikTok Shop), dipakai kalau AI tidak mengisi compliance.rules.
export function defaultRules(officialClaim) {
  return [
    `Klaim manfaat hanya boleh sesuai klaim resmi di label: ${officialClaim || '-'}.`,
    'Selalu pakai kata pelunak: bantu / membantu / meringankan / terasa.',
    'JANGAN sebut nama penyakit atau diagnosis; gambarkan keluhan sehari-hari saja.',
    'JANGAN membuat klaim medis, menjanjikan kesembuhan, atau menyebut produk sebagai obat; jangan menyebut dokter/terbukti/paling.',
    'JANGAN menyebut promo, diskon, harga, gratis ongkir, stok terbatas, atau urgensi palsu.',
    'Jangan menjelekkan merek lain.',
  ];
}

// Nama produk lain yang tidak boleh ikut cocok dengan label_regex produk ini.
const OTHER_NAMES = ['zestmag', 'gurahfit', 'madu'];

export function labelRegexError(re, prof = {}) {
  let rx;
  try { rx = new RegExp(re, 'i'); } catch { return 'label_regex bukan regex yang valid'; }
  if (rx.test('')) return 'label_regex nggak boleh cocok dengan teks kosong';
  const own = `${prof.name || ''} ${prof.short || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const n of OTHER_NAMES) {
    if (n !== 'madu' && own.includes(n)) continue; // nama produk ini sendiri
    if (rx.test(n)) return `label_regex terlalu umum (cocok dengan "${n}")`;
  }
  return null;
}

export function slugify(name) {
  const s = String(name || '').toLowerCase().replace(/^\s*madu\s+/, '').replace(/[^a-z0-9]/g, '');
  return s.slice(0, 24);
}

export function parseFolderId(url) {
  const m = String(url || '').match(/^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim() !== '';

export function validateProfile(p) {
  const errors = [];
  const prof = isObj(p) ? p : {};
  for (const f of STRING_FIELDS) if (!isStr(prof[f])) errors.push(`${f} wajib diisi`);
  for (const f of LIST_FIELDS) {
    if (!Array.isArray(prof[f]) || prof[f].length === 0) errors.push(`${f} wajib diisi`);
  }
  if (!Array.isArray(prof.other_brands)) errors.push('other_brands harus daftar (boleh kosong)');
  if (!isObj(prof.brand_lock) || Object.keys(prof.brand_lock).length === 0) errors.push('brand_lock wajib diisi');
  if (!isObj(prof.tts_lexicon)) errors.push('tts_lexicon harus objek (boleh kosong)');
  if (!isObj(prof.palette) || PALETTE_KEYS.some((k) => typeof prof.palette[k] !== 'string' || !HEX.test(prof.palette[k]))) {
    errors.push(`palette wajib berisi warna hex untuk ${PALETTE_KEYS.join(', ')}`);
  }
  const comp = prof.compliance;
  if (!isObj(comp)) errors.push('compliance wajib diisi');
  else {
    if (!Array.isArray(comp.rules) || !comp.rules.some(isStr)) errors.push('compliance.rules wajib diisi');
    if (!Array.isArray(comp.banned_phrases)) errors.push('compliance.banned_phrases harus daftar');
    if (comp.replacements !== undefined && !isObj(comp.replacements)) errors.push('compliance.replacements harus objek');
  }
  if (isStr(prof.label_regex)) {
    const e = labelRegexError(prof.label_regex, prof);
    if (e) errors.push(e);
  }
  if (!isObj(prof.story)) {
    errors.push('story wajib diisi');
    return errors;
  }
  if (!isStr(prof.story.category)) errors.push('story.category wajib diisi');
  for (const f of STORY_LISTS) {
    const v = prof.story[f];
    if (!Array.isArray(v) || v.length === 0) errors.push(`story.${f} wajib diisi`);
    else if (f === 'daily_pain_points' && v.length < 3) errors.push('story.daily_pain_points minimal 3 item');
  }
  return errors;
}
