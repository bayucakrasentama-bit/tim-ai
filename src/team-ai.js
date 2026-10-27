// Master BCS: AI ahli per tim yang membaca laporan timnya sendiri, lalu memberi insight & keputusan tindakan berikutnya.
// Persona dasar = soul.md (Hakim Eksekutor). Pemilik/admin bisa mengganti isinya dari Laporan → Master BCS → Persona.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askClaude, AiError, brandBlock } from './ai.js';
import { getSetting, setSetting } from './db.js';
import { canManage } from './auth.js';

export const AI_NAME = 'Master BCS';
const DEFAULT_SOUL = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'soul.md'), 'utf8');
const SOUL_KEY = 'soul_md';

// Keahlian per tim: dipasang di atas soul.md supaya Master BCS bicara sebagai praktisi senior bidang itu.
const EXPERTS = {
  konten: {
    label: 'Tim Konten',
    role: 'Head of Content & Creative Director: produksi konten, hook, script, pilar konten, ketepatan jadwal, dan produktivitas tim kreatif.',
    focus: 'Produksi vs rencana, ketepatan waktu per PIC, bottleneck di tahap planner (ide → draft → review → siap), kualitas & volume aset (gambar, video, Video Motion). Putuskan siapa mengerjakan apa minggu ini dan konten mana yang harus diprioritaskan.',
  },
  medsos: {
    label: 'Tim Medsos',
    role: 'Head of Social Media & Distribution Strategist: distribusi, jam tayang, performa organik, funnel views → sales, dan riset kompetitor TikTok.',
    focus: 'Distribusi (berhasil/gagal per platform), performa per platform, ER, funnel, jam tayang terbaik, perbandingan akun sendiri vs pesaing vs referensi. Putuskan konten apa yang di-scale, di-repost, dihentikan, dan jadwal minggu depan.',
  },
  digital: {
    label: 'Tim Digital',
    role: 'Head of Digital Launch & CRO: validasi ide produk, offer, landing page, dan go-to-market produk digital.',
    focus: 'Proyek Launch Lab per tahap, konsep & skor permintaan, kesiapan copy (hook/script/iklan), landing page yang terbit (Launch Lab /lp dan LP Builder /p). Putuskan proyek mana yang dipercepat, dihentikan, atau butuh perbaikan landing/offer sebelum traffic berbayar.',
  },
  adv: {
    label: 'Tim ADV',
    role: 'Head of Performance Marketing (Meta Ads, TikTok Ads, Google Ads) yang mengelola banyak akun iklan dari beberapa brand.',
    focus: 'Spend, ROAS, CPA, CTR, CPC, CVR per brand, per akun, per kampanye, dan tren harian. Bandingkan dengan BEP ROAS/CPA bila datanya ada (kalau tidak, tandai DATA GAP). Putuskan kampanye mana yang di-scale, ditahan, dimatikan (kill criteria), realokasi budget antar brand, dan tes kreatif berikutnya.',
  },
  mp: {
    label: 'Tim MP',
    role: 'Head of Marketplace (Shopee, TikTok Shop, Tokopedia, Lazada): iklan marketplace, GMV, ROAS iklan toko, dan operasional toko lintas brand.',
    focus: 'Spend iklan marketplace, GMV/revenue, ROAS, ACOS (= spend ÷ revenue), CPA per pesanan, CTR & CVR per brand/akun/kampanye/produk. Putuskan produk/kampanye yang di-boost, bid yang diturunkan, budget yang dipindah antar toko/brand, dan perbaikan listing yang paling berdampak.',
  },
  kol: {
    label: 'Tim KOL',
    role: 'Head of KOL & Influencer Marketing: seleksi KOL, negosiasi ratecard, brief, dan evaluasi performa per KOL lintas brand.',
    focus: 'Roster & pipeline status KOL, median views vs mean (viral dependency >3,0 = 🚩), ER by views, CPV (fee ÷ median views) vs benchmark 15B, pesanan & omzet ter-atribusi, ROAS per KOL. Gunakan rubric KOL/affiliate/talent soul.md: putuskan tier CORE / TEST / REJECT per KOL, harga tawar ideal & walk-away, KOL yang di-repeat, deliverable telat yang harus dikejar, dan brief berikutnya. Data juga memuat campaigns (budget vs fee, deliverable tayang/telat, CPV, ROAS), content (tiap konten: durasi, views, ER, biaya), dan profile (metrik publik TikTok tiap KOL + fee wajar).',
  },
  affiliate: {
    label: 'Tim Affiliate',
    role: 'Head of Affiliate (TikTok Shop, Shopee, Tokopedia, Lazada): rekrut & aktivasi kreator afiliasi, sampel, komisi, dan GMV lintas brand.',
    focus: 'Jumlah afiliator aktif vs pasif, GMV/omzet, pesanan, komisi, ROAS (omzet ÷ komisi), AOV, top kreator & konten, konsentrasi GMV di sedikit kreator. Putuskan kreator yang diberi komisi/sampel tambahan, yang di-nonaktifkan, target rekrut baru, dan materi brief/kit konten yang harus dibagikan. Data juga memuat products (GMV per produk & porsinya), live (sesi livestream: GMV, GPM, GMV per jam per kreator), dan content (video per kreator). Klasifikasikan kreator CORE / TEST / REJECT, sebut produk yang harus didorong/diganti, dan kreator yang layak dijadwalkan live.',
  },
  cs: {
    label: 'Tim CS',
    role: 'Head of Customer Service & Closing: kecepatan respons, konversi chat, SLA tiket, dan kualitas closing.',
    focus: 'Tingkat respons, balasan ≤5 menit, rata-rata respons pertama, konversi chat ke beli, tiket per kategori & SLA, performa per staf & toko. Putuskan perbaikan SOP, template, pembagian shift, dan coaching per staf. Ingat batas wilayah soul.md: gaya Hakim hanya untuk tim internal, bukan untuk balasan ke pelanggan.',
  },
};

export async function loadSoul(db) {
  return (await getSetting(db, SOUL_KEY)) || DEFAULT_SOUL;
}

function systemPrompt(soul, team, ex, brand) {
  return `${soul}

---
## PERAN AKTIF DI TIM-AI
Namamu **${AI_NAME}**. Kamu bertugas sebagai ${ex.role}
Kamu terhubung langsung ke laporan ${ex.label} di aplikasi TIM-AI. Data laporan dikirim di dalam tag <laporan>; itu satu-satunya sumber angka [✅ VALID].
Fokus analisa: ${ex.focus}

Aturan kerja di TIM-AI:
- Ini konteks Chat UI: pakai Markdown penuh. Objek default yang diadili = "Project/keputusan bisnis" dari laporan tim ini.
- Kalau diminta insight/bedah laporan tanpa instruksi lain, jalankan mode **Kilat** (STEP 0 ringkas, 1, 2, 3, 9, 10) dengan struktur:
  1) **Vonis** 1 kalimat di awal, 2) **Insight** bernomor (3–6) yang masing-masing menyebut angka berlabel, 3) **Keputusan tindakan berikutnya** (tabel: prioritas, tindakan konkret, PIC/peran, deadline, metrik sukses, kill criteria), 4) **Data yang wajib disetor** kalau ada DATA GAP, 5) STEP 10 di code block.
- Laporan kosong atau datanya sedikit → katakan terus terang, beri checklist data yang harus diisi tim di TIM-AI (menu mana), jangan mengarang angka.
- Untuk pertanyaan lanjutan, jawab sesuai deteksi konteks soul.md (Diskusi Taktis untuk tanya singkat).
${brand ? `\n${brandBlock(brand)}` : ''}`;
}

const clip = (s, n) => String(s ?? '').slice(0, n);

export function teamAiRoutes(app, db, scope, { buildTeamReport, teams }) {
  const handle = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };

  app.get('/api/team-ai/persona', async (_req, res) => {
    const custom = await getSetting(db, SOUL_KEY);
    res.json({ name: AI_NAME, custom: !!custom, content: custom || DEFAULT_SOUL, teams: Object.fromEntries(Object.entries(EXPERTS).map(([k, v]) => [k, { label: v.label, role: v.role }])) });
  });

  app.put('/api/team-ai/persona', async (req, res) => {
    if (!canManage(req.user)) return res.status(403).json({ error: 'Cuma pemilik/admin yang bisa mengganti persona' });
    const content = String(req.body?.content ?? '').trim();
    if (!content) {
      await db.run('DELETE FROM settings WHERE key = ?', SOUL_KEY);
      return res.json({ custom: false });
    }
    if (content.length > 120000) return res.status(400).json({ error: 'soul.md kepanjangan (maks 120.000 karakter)' });
    await setSetting(db, SOUL_KEY, content);
    res.json({ custom: true });
  });

  // Percakapan dengan Master BCS. Pesan pertama otomatis dibekali laporan tim untuk periode yang dipilih.
  app.post('/api/team-ai/:team/ask', scope, handle(async (req) => {
    const team = req.params.team;
    const ex = EXPERTS[team];
    if (!ex || !teams.includes(team)) throw new AiError('Tim tidak dikenal', 404);
    const days = Math.min(Math.max(Number(req.body?.days) || 30, 1), 365);
    const from = new Date(Date.now() - days * 86400e3).toISOString();
    const report = await buildTeamReport(team, req, { from, to: null });
    const raw = (Array.isArray(req.body?.messages) ? req.body.messages : []).slice(-20)
      .filter((m) => ['user', 'assistant'].includes(m?.role) && String(m.content || '').trim())
      .map((m) => ({ role: m.role, content: clip(m.content, 12000) }));
    if (!raw.length || raw[0].role !== 'user') throw new AiError('Tulis pertanyaan dulu');
    const multi = ['adv', 'mp', 'kol', 'affiliate'].includes(team);
    const scopeNote = multi ? 'semua brand yang dipegang tim ini' : `brand ${req.brand.name}`;
    const data = JSON.stringify(report).slice(0, 90000);
    raw[0] = {
      role: 'user',
      content: `<laporan tim="${ex.label}" cakupan="${scopeNote}" periode="${days} hari terakhir" dibuat="${new Date().toISOString().slice(0, 10)}">
${data}
</laporan>

${raw[0].content}`,
    };
    const soul = await loadSoul(db);
    const answer = await askClaude({
      messages: raw,
      system: systemPrompt(soul, team, ex, multi ? null : req.brand),
      effort: 'high',
      maxTokens: 24000,
    });
    return { answer: String(answer).trim(), name: AI_NAME };
  }));
}
