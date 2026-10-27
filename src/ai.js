// Fitur AI: ide & script, analisa performa, strategi, dan baca angka dari screenshot insight.
// Semua jawaban dipaksa ke JSON lewat structured outputs.
// Provider: Claude (ANTHROPIC_API_KEY) atau Google Gemini (GEMINI_API_KEY / key yang diisi pemilik di AI Studio).
// Model bisa diganti lewat SIARIN_AI_MODEL (Claude) atau SIARIN_GEMINI_MODEL (Gemini).
import { AsyncLocalStorage } from 'node:async_hooks';
import Anthropic from '@anthropic-ai/sdk';
import { metricRows, summarize } from './analytics.js';
import { getSetting, setSetting } from './db.js';
import { canManage } from './auth.js';
import { geminiGenerate, GEMINI_DEFAULT_MODEL } from './gemini.js';
import { getDefault, credsFor, generateText, loadKeys, PROVIDERS } from './ai-router.js';

const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_IMAGES = 6;

// ---- Skema JSON (structured outputs: semua object wajib additionalProperties: false) ----
const str = { type: 'string' };
const int = { type: 'integer' };
const nullableInt = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items) => ({ type: 'array', items });

const IDEA = obj({
  title: str, pillar: str, format: str, platform: str, hook: str, angle: str,
  script: str, caption: str, cta: str, hashtags: arr(str),
});

const SCHEMAS = {
  ideas: obj({ ideas: arr(IDEA) }),
  analyze: obj({
    headline: str,
    insights: arr(obj({ title: str, detail: str })),
    winning_patterns: arr(str),
    problems: arr(str),
    recommendations: arr(obj({ action: str, why: str, priority: { type: 'string', enum: ['tinggi', 'sedang', 'rendah'] } })),
  }),
  strategy: obj({
    positioning: str,
    pillars: arr(obj({ name: str, share_percent: int, why: str, examples: arr(str) })),
    schedule: arr(obj({ day: str, time: str, platform: str, format: str, pillar: str })),
    plan: arr(obj({ date: { type: 'string', format: 'date' }, title: str, pillar: str, format: str, platform: str, hook: str })),
    kpis: arr(obj({ metric: str, target: str, why: str })),
  }),
  extract: obj({
    items: arr(obj({
      platform: str, title: str, posted_at: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      views: nullableInt, reach: nullableInt, likes: nullableInt, comments: nullableInt, shares: nullableInt,
      saves: nullableInt, profile_visits: nullableInt, link_clicks: nullableInt, follows: nullableInt,
    })),
    notes: str,
  }),
};

const SYSTEM = `Kamu adalah ahli strategi konten media sosial untuk pasar Indonesia (Instagram, TikTok, YouTube, Facebook).
Selalu jawab dalam Bahasa Indonesia yang santai tapi jelas, praktis, dan spesifik untuk brand yang dijelaskan.
Dasarkan analisa pada data yang diberikan; kalau datanya sedikit atau kosong, katakan terus terang dan beri saran yang masuk akal.
Jangan mengarang angka performa yang tidak ada di data.`;

export class AiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---- Pilih provider ----
// Tiap anggota tim boleh pakai API key Gemini miliknya sendiri (biaya/kuota masuk ke akun Google masing-masing).
// Urutan key Gemini: key pribadi user yang sedang login -> GEMINI_API_KEY di env -> key workspace yang diisi pemilik.
let settingsDb = null;
const currentUserId = new AsyncLocalStorage();
const userKeyName = (id) => `ai_key_user:${id}`;
async function aiConfig() {
  const saved = settingsDb ? JSON.parse((await getSetting(settingsDb, 'ai_config')) || '{}') : {};
  const uid = currentUserId.getStore();
  const personal = settingsDb && uid !== undefined && uid !== null ? (await getSetting(settingsDb, userKeyName(uid))) || '' : '';
  // Key Gemini yang diisi di Pengaturan → AI & API Keys juga dipakai, walau model default belum dipilih.
  const routerKey = settingsDb ? (await loadKeys(settingsDb)).gemini?.key || '' : '';
  const geminiKey = personal || process.env.GEMINI_API_KEY || saved.gemini_key || routerKey || '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  const wanted = personal ? 'gemini' : saved.provider || process.env.SIARIN_AI_PROVIDER || (anthropicKey && !geminiKey ? 'claude' : 'gemini');
  // Provider yang dipilih tapi key-nya tidak ada -> pakai provider lain yang key-nya ada.
  const provider = wanted === 'gemini' ? (geminiKey || !anthropicKey ? 'gemini' : 'claude') : anthropicKey || !geminiKey ? 'claude' : 'gemini';
  return {
    provider,
    geminiKey,
    geminiKeySource: personal ? 'pribadi' : process.env.GEMINI_API_KEY ? 'env' : saved.gemini_key || routerKey ? 'workspace' : null,
    personalKey: !!personal,
    workspaceKey: !!(process.env.GEMINI_API_KEY || saved.gemini_key || routerKey),
    geminiModel: saved.gemini_model || process.env.SIARIN_GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
    claudeModel: process.env.SIARIN_AI_MODEL || DEFAULT_MODEL,
    enabled: provider === 'gemini' ? !!geminiKey : !!anthropicKey,
    claudeReady: !!anthropicKey,
  };
}

// Model default dari AI Router (Pengaturan → AI & API Keys). Key Gemini pribadi tetap diutamakan untuk pemiliknya.
async function routedDefault() {
  if (!settingsDb) return null;
  const uid = currentUserId.getStore();
  if (uid !== undefined && uid !== null && (await getSetting(settingsDb, userKeyName(uid)))) return null;
  const def = await getDefault(settingsDb);
  if (!def || !PROVIDERS[def.provider]) return null;
  const c = await credsFor(settingsDb, def.provider);
  return c.key || (PROVIDERS[def.provider].custom && c.base) ? def : null;
}

export const aiEnabled = (userId = null) => currentUserId.run(userId, async () => !!(await routedDefault()) || (await aiConfig()).enabled);

async function askGemini(cfg, opts) {
  if (!cfg.geminiKey) throw new AiError('AI belum aktif. Isi API key salah satu provider di Pengaturan → AI & API Keys, lalu pilih model default.', 503);
  try {
    return (await geminiGenerate({ apiKey: cfg.geminiKey, model: cfg.geminiModel, ...opts })).text;
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new AiError(err.message, err.status);
  }
}

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiError('AI belum aktif. Isi ANTHROPIC_API_KEY (dari console.anthropic.com) di environment TIM-AI.', 503);
  }
  client ??= new Anthropic();
  return client;
}

// Satu panggilan ke Claude yang hasilnya JSON sesuai skema.
// Pakai streaming supaya permintaan panjang (strategi) tidak kena batas waktu HTTP; hasil akhirnya tetap satu pesan utuh.
async function ask(kind, content, opts = {}) {
  return askClaude({ schema: SCHEMAS[kind], content, ...opts });
}

function aiError(err) {
  if (err instanceof Anthropic.AuthenticationError) return new AiError('ANTHROPIC_API_KEY ditolak. Cek lagi key-nya di console.anthropic.com.', 502);
  if (err instanceof Anthropic.PermissionDeniedError) return new AiError(`Akses ke model AI ditolak: ${err.message}`, 502);
  if (err instanceof Anthropic.RateLimitError) return new AiError('AI lagi sibuk atau kuota habis. Coba lagi sebentar lagi.', 429);
  if (err instanceof Anthropic.BadRequestError) return new AiError(`Permintaan ke AI ditolak: ${err.message}`, 400);
  if (err instanceof Anthropic.APIError) return new AiError(`AI error (${err.status ?? 'jaringan'}): ${err.message}`, 502);
  return err;
}

// Dipakai juga oleh Launch Lab.
// - schema: hasil dipaksa JSON lewat structured outputs.
// - tools (mis. web search): hasil diminta berupa JSON di akhir jawaban, lalu diambil dari teksnya.
// - schema & tools kosong: jawaban teks biasa (AI Mentor).
export async function askClaude({ content, messages, schema = null, tools = null, system = SYSTEM, effort = 'medium', maxTokens = 32000 }) {
const route = await routedDefault();
if (route) {
  let out;
  try {
    out = await generateText(settingsDb, { provider: route.provider, model: route.model, system, messages: messages || [{ role: 'user', content }],
      temperature: route.temperature, maxTokens: Math.min(maxTokens, 16000), schema });
  } catch (err) {
    throw new AiError(err.message, err.status || 502);
  }
  // Tanpa structured output bawaan: JSON diambil longgar dari teks (boleh ada ```json).
  return parseAnswer(out.text, schema, true);
}
  const cfg = await aiConfig();
  if (cfg.provider === 'gemini') return parseAnswer(await askGemini(cfg, { content, messages, schema, tools, system, effort, maxTokens }), schema, tools);
  const anthropic = getClient();
  const history = messages ? [...messages] : [{ role: 'user', content }];
  let response;
  for (let turn = 0; turn < 4; turn++) {
    try {
      response = await anthropic.beta.messages.stream({
        model: process.env.SIARIN_AI_MODEL || DEFAULT_MODEL,
        max_tokens: maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        output_config: schema && !tools ? { effort, format: { type: 'json_schema', schema } } : { effort },
        ...(tools ? { tools } : {}),
        messages: history,
      }).finalMessage();
    } catch (err) {
      throw aiError(err);
    }
    // Server tool (web search) yang lama bisa berhenti sementara: lanjutkan dengan mengirim ulang jawabannya.
    if (response.stop_reason !== 'pause_turn') break;
    history.push({ role: 'assistant', content: response.content });
  }
  if (response.stop_reason === 'refusal') throw new AiError('AI menolak permintaan ini. Coba ubah kalimatnya.', 422);
  if (response.stop_reason === 'max_tokens') throw new AiError('Jawaban AI kepanjangan dan terpotong. Kurangi jumlah yang diminta.', 422);
  return parseAnswer(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''), schema, tools);
}

function parseAnswer(text, schema, tools) {
  if (!schema) return text;
  try {
    if (!tools) return JSON.parse(text);
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
    return JSON.parse(fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    throw new AiError('Jawaban AI tidak bisa dibaca. Coba lagi.', 502);
  }
}

export { SYSTEM as AI_SYSTEM, brandBlock, dataBlock, brandData };

// ---- Konteks brand & data untuk prompt ----
function brandBlock(brand) {
  return `<brand>
Nama: ${brand.name}
Profil (niche, target audiens, produk, gaya bahasa): ${brand.description?.trim() || '(belum diisi)'}
</brand>`;
}

const pct = (v) => (v == null ? '-' : `${(v * 100).toFixed(1)}%`);
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function dataBlock(s, days) {
  if (!s.totals.contents) return `<data periode="${days} hari terakhir">Belum ada data performa.</data>`;
  const line = (r) => `- [${r.platform}${r.pillar ? ` · ${r.pillar}` : ''}${r.format ? ` · ${r.format}` : ''}] "${r.title || '(tanpa judul)'}": ${r.views} views, ER ${pct(r.engagement_rate)}, ${r.profile_visits} profile visit, ${r.sales} sales`;
  return `<data periode="${days} hari terakhir">
Total: ${s.totals.contents} konten, ${s.totals.views} views, engagement ${s.totals.engagement} (ER ${pct(s.totals.engagement_rate)}), ${s.totals.profile_visits} profile visit, ${s.totals.link_clicks} klik link, ${s.totals.leads} leads, ${s.totals.sales} sales, omzet Rp${s.totals.revenue}.
Funnel: ${s.funnel.map((f) => `${f.label} ${f.value}${f.conversion != null ? ` (${pct(f.conversion)} dari tahap sebelumnya)` : ''}`).join(' -> ')}
Per platform: ${s.byPlatform.map((g) => `${g.key}: ${g.contents} konten, rata-rata ${g.avg_views} views, ER ${pct(g.engagement_rate)}`).join('; ')}
Per pilar: ${s.byPillar.map((g) => `${g.key}: ${g.contents} konten, rata-rata ${g.avg_views} views, ER ${pct(g.engagement_rate)}, ${g.sales} sales`).join('; ')}
Per format: ${s.byFormat.map((g) => `${g.key}: ${g.contents} konten, rata-rata ${g.avg_views} views`).join('; ')}
Jam tayang terbaik (WIB): ${s.bestTimes.slice(0, 5).map((t) => `${DAYS[t.weekday]} ${t.hour}:00 (rata-rata ${t.avg_views} views, ${t.posts} post)`).join('; ') || '-'}
Konten terbaik:
${s.top.map(line).join('\n')}
Konten terlemah:
${s.bottom.map(line).join('\n') || '-'}
</data>`;
}

async function brandData(db, brandId, days = 30) {
  const from = new Date(Date.now() - days * 86400_000).toISOString();
  return summarize(await metricRows(db, brandId, { from }));
}

const clip = (s, n) => String(s ?? '').trim().slice(0, n);

export function aiRoutes(app, db, scope) {
  settingsDb = db;
  // Semua route sesudah ini (termasuk Launch Lab & Inbox) tahu siapa yang login, untuk memilih key pribadinya.
  app.use('/api', (req, _res, next) => currentUserId.run(req.user?.id ?? null, next));
  const status = async () => {
    const c = await aiConfig();
    const routed = await routedDefault();
    return {
      routed,
      enabled: !!routed || c.enabled, provider: c.provider, model: c.provider === 'gemini' ? c.geminiModel : c.claudeModel,
      gemini: { configured: !!c.geminiKey, key_source: c.geminiKeySource, personal: c.personalKey, workspace: c.workspaceKey, model: c.geminiModel },
      claude: { configured: c.claudeReady, model: c.claudeModel },
    };
  };
  const validKey = (k) => /^[A-Za-z0-9_-]{20,200}$/.test(k);

  // Key Gemini pribadi: siapa pun yang login boleh mengisi/menghapus miliknya sendiri. Key tidak pernah dikirim balik.
  app.put('/api/ai/my-key', async (req, res) => {
    const key = String(req.body?.gemini_key ?? '').trim();
    if (!validKey(key)) return res.status(400).json({ error: 'Format API key Gemini tidak valid (biasanya diawali "AIza")' });
    await setSetting(db, userKeyName(req.user.id), key);
    res.json(await status());
  });
  app.delete('/api/ai/my-key', async (req, res) => {
    await db.run('DELETE FROM settings WHERE key = ?', userKeyName(req.user.id));
    res.json(await status());
  });
  app.get('/api/ai/status', async (_req, res) => res.json(await status()));

  // Pemilik/admin: pilih provider, simpan API key Gemini (tidak pernah dikirim balik ke browser), ganti model.
  app.put('/api/ai/config', async (req, res) => {
    if (!req.user || !canManage(req.user)) return res.status(403).json({ error: 'Cuma pemilik/admin yang bisa mengatur AI' });
    const saved = JSON.parse((await getSetting(db, 'ai_config')) || '{}');
    const b = req.body || {};
    if (['gemini', 'claude'].includes(b.provider)) saved.provider = b.provider;
    if (typeof b.gemini_key === 'string') {
      const key = b.gemini_key.trim();
      if (key && !validKey(key)) return res.status(400).json({ error: 'Format API key Gemini tidak valid' });
      if (key) saved.gemini_key = key;
      else delete saved.gemini_key;
    }
    if (typeof b.gemini_model === 'string') {
      const m = b.gemini_model.trim();
      if (m && !/^[a-z0-9.-]{3,60}$/.test(m)) return res.status(400).json({ error: 'Nama model tidak valid' });
      if (m) saved.gemini_model = m;
      else delete saved.gemini_model;
    }
    await setSetting(db, 'ai_config', JSON.stringify(saved));
    res.json(await status());
  });

  // Tes koneksi singkat ke provider aktif.
  app.post('/api/ai/test', async (req, res) => {
    try {
      const answer = await askClaude({ content: 'Balas persis dengan satu kata: SIAP', system: 'Jawab sesingkat mungkin.', effort: 'low', maxTokens: 1000 });
      res.json({ ok: true, answer: String(answer).trim().slice(0, 100), ...(await status()) });
    } catch (err) {
      if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  const handle = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };

  // Ide konten + hook, angle, script, caption.
  app.post('/api/ai/ideas', scope, handle(async (req) => {
    const b = req.body || {};
    const count = Math.min(Math.max(Number(b.count) || 5, 1), 10);
    const s = await brandData(db, req.brand.id, 60);
    const prompt = `${brandBlock(req.brand)}
${dataBlock(s, 60)}

Buatkan ${count} ide konten.
Topik / brief: ${clip(b.brief, 2000) || '(bebas, sesuaikan dengan brand)'}
Pilar konten: ${clip(b.pillar, 200) || '(pilih yang paling cocok)'}
Platform: ${clip(b.platform, 100) || '(pilih yang paling cocok)'}
Tujuan: ${clip(b.goal, 200) || 'awareness & engagement'}

Untuk tiap ide: judul singkat, pilar, format (mis. Reels, carousel, video pendek, foto, thread), platform, hook 1-2 kalimat untuk 3 detik pertama,
angle (sudut pandang yang bikin beda), script lengkap siap rekam (dengan penanda adegan/scene bila video), caption siap pakai, CTA, dan 3-8 hashtag.
Kalau ada data performa, condongkan ide ke pola yang terbukti berhasil dan jelaskan lewat angle.`;
    return ask('ideas', prompt, { effort: 'medium' });
  }));

  // Analisa performa dari data yang ada.
  app.post('/api/ai/analyze', scope, handle(async (req) => {
    const days = Math.min(Math.max(Number(req.body?.days) || 30, 7), 365);
    const s = await brandData(db, req.brand.id, days);
    if (!s.totals.contents) throw new AiError('Belum ada data performa di periode ini. Tarik data dari API atau input manual dulu di menu Analitik.');
    const prompt = `${brandBlock(req.brand)}
${dataBlock(s, days)}

Analisa performa konten di atas seperti seorang social media strategist senior.
Beri satu kalimat headline, 3-6 insight yang didukung angka, pola yang berhasil, masalah utama (termasuk titik bocor di funnel),
dan 3-6 rekomendasi konkret yang bisa langsung dikerjakan minggu ini (dengan prioritas).`;
    return ask('analyze', prompt, { effort: 'high' });
  }));

  // Strategi + rencana konten tanggal per tanggal.
  app.post('/api/ai/strategy', scope, handle(async (req) => {
    const b = req.body || {};
    const weeks = Math.min(Math.max(Number(b.weeks) || 4, 1), 8);
    const perWeek = Math.min(Math.max(Number(b.postsPerWeek) || 4, 1), 14);
    const start = b.startDate && !Number.isNaN(new Date(b.startDate).getTime()) ? new Date(b.startDate) : new Date(Date.now() + 86400_000);
    const s = await brandData(db, req.brand.id, 90);
    const prompt = `${brandBlock(req.brand)}
${dataBlock(s, 90)}

Susun strategi konten untuk ${weeks} minggu mulai ${start.toISOString().slice(0, 10)}, dengan ${perWeek} konten per minggu.
Tujuan utama: ${clip(b.goal, 300) || 'menumbuhkan akun dan penjualan'}
Platform: ${clip(b.platforms, 200) || 'sesuaikan dengan data'}

Isi: positioning singkat, 3-5 pilar konten (dengan porsi persen yang totalnya 100, alasan, dan contoh), jadwal mingguan (hari, jam WIB, platform, format, pilar),
rencana konten tanggal per tanggal (field date format YYYY-MM-DD, total ${weeks * perWeek} konten, dengan judul dan hook), dan 3-5 KPI dengan target realistis.
Pakai jam tayang terbaik dari data kalau ada.`;
    return ask('strategy', prompt, { effort: 'high', maxTokens: 48000 });
  }));

  // AI Metrics Extractor: baca angka dari screenshot insight.
  app.post('/api/ai/extract', scope, handle(async (req) => {
    const images = Array.isArray(req.body?.images) ? req.body.images.slice(0, MAX_IMAGES) : [];
    if (!images.length) throw new AiError('Upload minimal satu screenshot');
    const blocks = [];
    for (const img of images) {
      const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(img));
      if (!m) throw new AiError('Format gambar tidak didukung (pakai PNG, JPG, atau WEBP)');
      blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
    }
    blocks.push({
      type: 'text',
      text: `Ini screenshot insight/analytics konten media sosial${req.body?.platform ? ` dari ${clip(req.body.platform, 40)}` : ''}.
Baca SEMUA konten yang terlihat dan ambil angkanya. Satu item per konten (kalau satu screenshot = satu konten, hasilnya satu item).
Aturan: angka "1,2 rb"/"1.2K" = 1200, "3,4 jt"/"3.4M" = 3400000. Isi null kalau angkanya tidak terlihat; jangan menebak.
views = tayangan/plays/views; reach = akun dijangkau; profile_visits = kunjungan profil; link_clicks = ketukan link/klik tautan; follows = pengikut baru dari konten ini.
platform isi salah satu: instagram, tiktok, youtube, facebook, lainnya. posted_at isi tanggal ISO (YYYY-MM-DD) kalau terlihat, selain itu null.
title isi caption/judul singkat yang terlihat, atau deskripsi singkat kontennya. notes: catatan singkat kalau ada angka yang meragukan.`,
    });
    return ask('extract', blocks, { effort: 'low' });
  }));
}
