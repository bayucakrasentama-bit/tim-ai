// Model profil produk Motion Factory: validasi, slug, dan parser folder Drive.

export const STORY_FIELDS = ['category', 'daily_pain_points', 'physical_features', 'safe_benefits', 'usage_moments'];

export const PROFILE_FIELDS = [
  'name', 'short', 'tts_name', 'file_prefix', 'official_claim', 'brand_lock', 'tts_lexicon',
  'other_brands', 'label_regex', 'facts', 'audience', 'angles', 'hook_styles', 'cta_variants',
  'badge_texts', 'compliance', 'palette', 'safe_hashtags', 'story',
];

const STRING_FIELDS = ['name', 'short', 'tts_name', 'file_prefix', 'official_claim', 'label_regex', 'audience'];
const LIST_FIELDS = ['other_brands', 'facts', 'angles', 'hook_styles', 'cta_variants', 'badge_texts', 'safe_hashtags'];
const OBJECT_FIELDS = ['brand_lock', 'tts_lexicon', 'compliance', 'palette'];
const STORY_LISTS = ['daily_pain_points', 'physical_features', 'safe_benefits', 'usage_moments'];

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
  for (const f of OBJECT_FIELDS) {
    if (!isObj(prof[f]) || Object.keys(prof[f]).length === 0) errors.push(`${f} wajib diisi`);
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
