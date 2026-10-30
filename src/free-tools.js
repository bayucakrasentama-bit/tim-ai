// Free Tools: alat kecil sosmed (ala SocialEcho). Hampir semua dihitung di browser; di sini cuma tool yang butuh AI.
// Memakai model default dari Pengaturan → AI & API Keys (lewat askClaude).
import { askClaude } from './ai.js';

const SYSTEM = `Kamu asisten social media marketer Indonesia di TIM-AI. Jawab langsung hasilnya, tanpa basa-basi pembuka/penutup.
Pakai bahasa yang diminta (default Bahasa Indonesia santai). Jangan mengarang fakta produk yang tidak disebut.`;

const TASKS = {
  'hashtag-generator': (i) => `Buat ${i.count || 20} hashtag untuk ${i.platform || 'Instagram'} tentang: ${i.text}.
Campur hashtag besar, menengah, dan niche (lokal Indonesia kalau relevan). Kelompokkan: Besar / Menengah / Niche. Di akhir beri satu baris siap salin berisi semua hashtag.`,
  'caption-hook-generator': (i) => `Buat 10 hook pembuka caption/video ${i.platform || 'TikTok'} untuk topik: ${i.text}.
Gaya: ${i.tone || 'campuran'}. Tiap hook maksimal 12 kata, beri label pola-nya (pertanyaan, angka, kontroversi, POV, rahasia, dll).`,
  'instagram-bio-generator': (i) => `Buat 6 pilihan bio Instagram (maks 150 karakter, hitung karakternya) untuk: ${i.text}.
Gaya: ${i.tone || 'profesional tapi hangat'}. Sertakan emoji secukupnya dan CTA ke link bio. Tulis jumlah karakter di akhir tiap pilihan.`,
  'ai-auto-reply': (i) => `Tulis 3 pilihan balasan untuk komentar/DM berikut sebagai admin brand${i.brand ? ` "${i.brand}"` : ''}.
Nada: ${i.tone || 'ramah dan membantu'}. Kalau komplain, minta maaf, beri solusi, ajak lanjut ke DM. Komentar:\n"""${i.text}"""`,
  'ai-auto-rewrite': (i) => `Tulis ulang teks berikut dengan gaya ${i.tone || 'lebih menarik untuk media sosial'}${i.platform ? ` untuk ${i.platform}` : ''}.
Pertahankan makna. Beri 3 versi. Teks:\n"""${i.text}"""`,
  'cross-platform-post-adapter': (i) => `Adaptasi postingan berikut untuk Instagram, TikTok, X (maks 280 karakter), LinkedIn, Facebook, dan Threads.
Ikuti batas karakter & kebiasaan tiap platform (hashtag, panjang, nada). Beri judul per platform. Postingan:\n"""${i.text}"""`,
  'ai-content-label-checker': (i) => `Periksa konten berikut: apakah perlu diberi label "konten AI / dimanipulasi" atau label promosi berbayar (paid partnership / #ad) menurut aturan umum TikTok, Instagram/Meta, YouTube.
Jawab: 1) Kesimpulan per platform (Perlu label / Tidak perlu / Tergantung), 2) Alasan singkat, 3) Cara memasang labelnya. Info konten:\n"""${i.text}"""`,
};

export function freeToolRoutes(app) {
  app.post('/api/free-tools/ai', async (req, res) => {
    const b = req.body || {};
    const task = TASKS[b.tool];
    const text = String(b.text || '').trim().slice(0, 8000);
    if (!task) return res.status(400).json({ error: 'Tool tidak dikenal' });
    if (!text) return res.status(400).json({ error: 'Isi teks dulu' });
    const input = { text, ...Object.fromEntries(['platform', 'tone', 'count', 'brand'].map((k) => [k, String(b[k] || '').slice(0, 100)])) };
    const lang = String(b.lang || '').slice(0, 40);
    try {
      const out = await askClaude({ content: `${task(input)}${lang ? `\n\nTulis dalam bahasa: ${lang}.` : ''}`, system: SYSTEM, effort: 'low', maxTokens: 4000 });
      res.json({ text: out });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });
}
