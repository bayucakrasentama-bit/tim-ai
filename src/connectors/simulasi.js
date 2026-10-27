import { sleep } from './http.js';

// Akun pura-pura: buat nyoba alur tanpa akun sosmed beneran.
// Tulis "#gagal" di caption kalau mau lihat gimana tampilan posting yang gagal.
export default {
  id: 'simulasi',
  label: 'Simulasi',
  color: '#64748b',
  supports: ['text', 'image', 'video'],
  fields: [],
  note: 'Akun pura-pura untuk mencoba alur. Tidak ada yang benar-benar diposting.',
  async publish({ caption }) {
    await sleep(Number(process.env.SIARIN_SIM_DELAY_MS ?? 800));
    if (caption.includes('#gagal')) throw new Error('Simulasi gagal (caption mengandung #gagal)');
    const id = `sim_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return { remoteId: id, remoteUrl: null };
  },
  // Angka pura-pura yang tetap sama untuk post yang sama, buat nyoba halaman Analitik.
  async fetchStats({ remoteId }) {
    let seed = 0;
    for (const ch of String(remoteId)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rand = (max) => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed % max;
    };
    const views = 500 + rand(20000);
    const likes = Math.round(views * (0.02 + rand(80) / 1000));
    return {
      views,
      reach: Math.round(views * 0.8),
      likes,
      comments: Math.round(likes * 0.08),
      shares: Math.round(likes * 0.05),
      saves: Math.round(likes * 0.1),
      profile_visits: Math.round(views * 0.03),
      follows: Math.round(views * 0.004),
    };
  },
};
