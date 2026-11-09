export const PERSONAS = [
  { id: 'jaktim_pria', label: 'Ardi — Jaktim/Bekasi', voice: 'id-ID-ArdiNeural', gender: 'pria', accent: 'Jakarta Timur–Bekasi' },
  { id: 'jaksel_wanita', label: 'Gadis — Jaksel', voice: 'id-ID-GadisNeural', gender: 'wanita', accent: 'Jakarta Selatan' },
  { id: 'jatim_pria', label: 'Dimas — Jawa Timur', voice: 'jv-ID-DimasNeural', gender: 'pria', accent: 'Jawa Timur' },
  { id: 'jateng_wanita', label: 'Siti — Jawa Tengah', voice: 'jv-ID-SitiNeural', gender: 'wanita', accent: 'Jawa Tengah' },
  { id: 'bandung_pria', label: 'Jajang — Bandung', voice: 'su-ID-JajangNeural', gender: 'pria', accent: 'Sunda Bandung' },
  { id: 'garut_wanita', label: 'Yasmin — Garut', voice: 'su-ID-TutiNeural', gender: 'wanita', accent: 'Sunda Garut' },
];
export const PERSONA_IDS = new Set(PERSONAS.map((p) => p.id));
export const VOICE_IDS = new Set(PERSONAS.map((p) => p.voice));
export const ACCENTS = new Set(PERSONAS.map((p) => p.accent));
export const PRESETS = ['madu-pop', 'brand-box', 'bold-bebas', 'cream-plate', 'highlight-box'];
export const LOOKS = ['warm-honey', 'teal-orange', 'clean-bright', 'moody', 'natural', 'film'];
export const SPEEDS = [1.08, 1.12, 1.15];
export const DURATIONS = [15, 20, 25];
export const DEFAULT_OPTIONS = { angle: 'auto', persona_ids: [], voice_id: 'auto', gender: 'auto', accent: 'auto', voice_speed: 1.12, preset: 'random', look: 'random', duration_seconds: 25 };
export function normalizeOptions(input, profile) {
  const o = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const angles = Array.isArray(profile?.story?.daily_pain_points) && profile.story.daily_pain_points.length
    ? profile.story.daily_pain_points : Array.isArray(profile?.angles) ? profile.angles : [];
  if (o.angle !== undefined && o.angle !== 'auto' && !angles.includes(o.angle)) return { error: 'Angle harus dipilih dari profil produk' };
  const requestedIds = o.persona_ids ?? [];
  if (!Array.isArray(requestedIds) || requestedIds.some((id) => !PERSONA_IDS.has(id)) || new Set(requestedIds).size !== requestedIds.length) return { error: 'Pilihan persona tidak didukung' };
  const voiceId = o.voice_id ?? 'auto';
  const gender = o.gender ?? 'auto';
  const accent = o.accent ?? 'auto';
  if (voiceId !== 'auto' && !VOICE_IDS.has(voiceId)) return { error: 'Pilihan suara tidak didukung' };
  if (!['auto', 'pria', 'wanita'].includes(gender)) return { error: 'Gender suara tidak didukung' };
  if (accent !== 'auto' && !ACCENTS.has(accent)) return { error: 'Logat tidak didukung' };
  const hasPersonaFilter = voiceId !== 'auto' || gender !== 'auto' || accent !== 'auto';
  const filteredIds = PERSONAS.filter((p) => (voiceId === 'auto' || p.voice === voiceId)
    && (gender === 'auto' || p.gender === gender) && (accent === 'auto' || p.accent === accent)).map((p) => p.id);
  if (hasPersonaFilter && !filteredIds.length) return { error: 'Kombinasi suara, gender, dan logat tidak tersedia' };
  const personaIds = hasPersonaFilter ? filteredIds.filter((id) => !requestedIds.length || requestedIds.includes(id)) : requestedIds;
  if (hasPersonaFilter && !personaIds.length) return { error: 'Filter persona tidak cocok dengan pilihan persona' };
  const voiceSpeed = o.voice_speed ?? DEFAULT_OPTIONS.voice_speed;
  if (!SPEEDS.includes(voiceSpeed)) return { error: 'Kecepatan suara harus 1,08×, 1,12×, atau 1,15×' };
  const preset = o.preset ?? 'random';
  if (preset !== 'random' && !PRESETS.includes(preset)) return { error: 'Preset tidak didukung' };
  const look = o.look ?? 'random';
  if (look !== 'random' && !LOOKS.includes(look)) return { error: 'Look tidak didukung' };
  const duration = o.duration_seconds ?? DEFAULT_OPTIONS.duration_seconds;
  if (!DURATIONS.includes(duration)) return { error: 'Durasi harus 15, 20, atau 25 detik' };
  return { value: { angle: o.angle ?? 'auto', persona_ids: personaIds, voice_id: voiceId, gender, accent, voice_speed: voiceSpeed, preset, look, duration_seconds: duration } };
}
