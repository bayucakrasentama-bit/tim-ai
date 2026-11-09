export const PERSONAS = [
  { id: 'jaktim_pria', label: 'Ardi — Jaktim/Bekasi', voice: 'id-ID-ArdiNeural', gender: 'pria', accent: 'Betawi' },
  { id: 'jaksel_wanita', label: 'Gadis — Jaksel', voice: 'id-ID-GadisNeural', gender: 'wanita', accent: 'Betawi' },
  { id: 'jatim_pria', label: 'Dimas — Jawa Timur', voice: 'jv-ID-DimasNeural', gender: 'pria', accent: 'Jawa' },
  { id: 'jateng_wanita', label: 'Siti — Jawa Tengah', voice: 'jv-ID-SitiNeural', gender: 'wanita', accent: 'Jawa' },
  { id: 'bandung_pria', label: 'Jajang — Bandung', voice: 'su-ID-JajangNeural', gender: 'pria', accent: 'Sunda' },
  { id: 'garut_wanita', label: 'Yasmin — Garut', voice: 'su-ID-TutiNeural', gender: 'wanita', accent: 'Sunda' },
  { id: 'batak_pria', label: 'Tigor — Batak', voice: 'id-ID-ArdiNeural', gender: 'pria', accent: 'Batak' },
  { id: 'medan_wanita', label: 'Maya — Medan', voice: 'id-ID-GadisNeural', gender: 'wanita', accent: 'Medan' },
  { id: 'bugis_pria', label: 'Irwan — Bugis', voice: 'id-ID-ArdiNeural', gender: 'pria', accent: 'Bugis' },
  { id: 'papua_wanita', label: 'Yance — Papua', voice: 'id-ID-GadisNeural', gender: 'wanita', accent: 'Papua' },
  { id: 'padang_pria', label: 'Fikri — Padang', voice: 'id-ID-ArdiNeural', gender: 'pria', accent: 'Padang' },
  { id: 'makassar_wanita', label: 'Fitri — Makassar', voice: 'id-ID-GadisNeural', gender: 'wanita', accent: 'Makassar' },
  { id: 'manado_pria', label: 'Vino — Manado', voice: 'id-ID-ArdiNeural', gender: 'pria', accent: 'Manado' },
  { id: 'aceh_wanita', label: 'Nurul — Aceh', voice: 'id-ID-GadisNeural', gender: 'wanita', accent: 'Aceh' },
  { id: 'bali_pria', label: 'Wayan — Bali', voice: 'id-ID-ArdiNeural', gender: 'pria', accent: 'Bali' },
];
export const PERSONA_IDS = new Set(PERSONAS.map((p) => p.id));
export const VOICE_IDS = new Set(PERSONAS.map((p) => p.voice));
export const ACCENTS = new Set(PERSONAS.map((p) => p.accent));
export const PRESETS = ['madu-pop', 'brand-box', 'bold-bebas', 'cream-plate', 'highlight-box'];
export const LOOKS = ['warm-honey', 'teal-orange', 'clean-bright', 'moody', 'natural', 'film'];
export const SPEEDS = [0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2];
// rentang durasi video akhir (detik); pipeline memilih durasi pasti di dalam rentang
export const DURATIONS = ['15-30', '30-45', '45-60'];
export const DEFAULT_OPTIONS = { angle: 'auto', persona_ids: [], voice_id: 'auto', gender: 'auto', accent: 'auto', voice_speed: 1.0, preset: 'random', look: 'random', duration_range: '15-30' };

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
  if (!SPEEDS.includes(voiceSpeed)) return { error: 'Kecepatan suara harus 0,80×–1,20× (kelipatan 0,05×)' };
  const preset = o.preset ?? 'random';
  if (preset !== 'random' && !PRESETS.includes(preset)) return { error: 'Preset tidak didukung' };
  const look = o.look ?? 'random';
  if (look !== 'random' && !LOOKS.includes(look)) return { error: 'Look tidak didukung' };
  // duration_range baru ("15-30" | "30-45" | "45-60"); duration_seconds lama tetap diterima lalu dipetakan
  let durationRange = o.duration_range;
  if (durationRange === undefined && o.duration_seconds !== undefined) {
    const d = Number(o.duration_seconds);
    if (Number.isFinite(d)) durationRange = d <= 30 ? '15-30' : d <= 45 ? '30-45' : '45-60';
  }
  durationRange = durationRange ?? DEFAULT_OPTIONS.duration_range;
  if (!DURATIONS.includes(durationRange)) return { error: 'Durasi harus 15-30, 30-45, atau 45-60 detik' };
  return { value: { angle: o.angle ?? 'auto', persona_ids: personaIds, voice_id: voiceId, gender, accent, voice_speed: voiceSpeed, preset, look, duration_range: durationRange } };
}
