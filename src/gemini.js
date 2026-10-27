// Jalur AI lewat Google Gemini API. Kalau model default tidak tersedia untuk key-nya, otomatis pindah ke model terbaik yang ada.
// Dipanggil dari askClaude() di ai.js kalau provider aktifnya Gemini; bentuk input & output dibuat sama
// supaya semua fitur (AI Studio, Launch Lab, saran balasan Inbox) tidak perlu tahu provider mana yang dipakai.
export const GEMINI_DEFAULT_MODEL = 'gemini-4-argon';

const base = () => process.env.SIARIN_GEMINI_BASE || 'https://generativelanguage.googleapis.com';
const LEVEL = { low: 'low', medium: 'medium', high: 'high', max: 'high' };

// Blok konten gaya Anthropic (string / text / image base64) -> parts Gemini.
function toParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((b) => {
    if (b.type === 'image' && b.source?.type === 'base64') return { inlineData: { mimeType: b.source.media_type, data: b.source.data } };
    return { text: String(b.text ?? '') };
  });
}

export function geminiRequest({ content, messages, schema, tools, system, effort, maxTokens }) {
  const history = messages || [{ role: 'user', content }];
  const generationConfig = { maxOutputTokens: Math.min(maxTokens, 65536), thinkingConfig: { thinkingLevel: LEVEL[effort] || 'medium' } };
  // Google Search + skema JSON sekaligus belum tentu didukung semua model, jadi kalau pakai search
  // JSON-nya diminta di teks dan diambil dari jawaban (sama seperti jalur Claude).
  if (schema && !tools) Object.assign(generationConfig, { responseMimeType: 'application/json', responseJsonSchema: schema });
  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: toParts(m.content) })),
    generationConfig,
    ...(tools ? { tools: [{ googleSearch: {} }] } : {}),
  };
}

// Model yang benar-benar tersedia untuk key ini (di-cache 10 menit). Dipakai kalau model yang diminta tidak ada.
const modelCache = new Map();
async function availableModels(apiKey) {
  const hit = modelCache.get(apiKey);
  if (hit && Date.now() - hit.at < 600e3) return hit.list;
  const res = await fetch(`${base()}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  const list = (body.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  modelCache.set(apiKey, { at: Date.now(), list });
  return list;
}

// Pilih model teks terbaik yang ada: versi tertinggi, utamakan "flash" (jalan di tier gratis) lalu "pro", versi stabil di atas preview;
// hindari varian khusus (tts, image, embedding, dll).
export function pickModel(list) {
  const ok = list.filter((m) => /^gemini-/.test(m) && !/(tts|image|embed|audio|live|vision|aqa|learnlm|computer|robotics|-exp)/i.test(m));
  const ver = (m) => Number(/^gemini-(\d+(?:\.\d+)?)/.exec(m)?.[1] || 0);
  const rank = (m) => ver(m) * 10 + (/-flash(?!-lite)/.test(m) ? 3 : /-pro/.test(m) ? 2 : 1) - (/preview/.test(m) ? 5 : 0);
  return ok.sort((a, b) => rank(b) - rank(a))[0] || null;
}

async function callGemini(apiKey, model, request) {
  let res;
  try {
    res = await fetch(`${base()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(280_000),
    });
  } catch (err) {
    throw { status: 502, message: `Gemini tidak bisa dihubungi: ${err.message}` };
  }
  return { res, body: await res.json().catch(() => ({})) };
}

// Kembalikan { text } atau lempar { status, message } yang nanti diubah jadi AiError oleh ai.js.
export async function geminiGenerate({ apiKey, model, ...opts }) {
  let request = geminiRequest(opts);
  let { res, body } = await callGemini(apiKey, model, request);
  // Model tidak ada (mis. nama lama / belum tersedia untuk key ini) -> pakai model terbaik yang tersedia.
  if (res.status === 404) {
    const fallback = pickModel(await availableModels(apiKey).catch(() => []));
    if (fallback && fallback !== model) {
      model = fallback;
      ({ res, body } = await callGemini(apiKey, model, request));
    }
  }
  // Sebagian model menolak thinkingLevel / responseJsonSchema -> ulang dengan config paling sederhana, skema diminta lewat teks.
  if (res.status === 400 && !/api key/i.test(body.error?.message || '')) {
    const gc = request.generationConfig;
    const sys = opts.schema && gc.responseJsonSchema ? `${opts.system || ''}\n\nBalas HANYA dengan satu objek JSON valid yang mengikuti skema ini:\n${JSON.stringify(opts.schema)}` : null;
    request = {
      ...request,
      ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
      generationConfig: { maxOutputTokens: Math.min(gc.maxOutputTokens, 8192), ...(gc.responseMimeType ? { responseMimeType: gc.responseMimeType } : {}) },
    };
    ({ res, body } = await callGemini(apiKey, model, request));
  }
  if (!res.ok) {
    const msg = body.error?.message || res.statusText;
    if (res.status === 400 && /api key/i.test(msg)) throw { status: 502, message: 'API key Gemini ditolak. Cek lagi key-nya di aistudio.google.com/apikey.' };
    if (res.status === 401 || res.status === 403) throw { status: 502, message: `Akses ke Gemini ditolak: ${msg}` };
    if (res.status === 404) throw { status: 502, message: `Model "${model}" tidak tersedia untuk API key ini, dan tidak ada model Gemini lain yang bisa dipakai. Cek key-nya di aistudio.google.com/apikey.` };
    if (res.status === 429) throw { status: 429, message: 'Kuota Gemini habis atau lagi sibuk. Coba lagi sebentar lagi, atau cek billing di Google AI Studio.' };
    throw { status: res.status >= 500 ? 502 : 400, message: `Gemini error (${res.status}): ${msg}` };
  }
  if (body.promptFeedback?.blockReason) throw { status: 422, message: 'Gemini menolak permintaan ini. Coba ubah kalimatnya.' };
  const cand = body.candidates?.[0];
  if (!cand) throw { status: 502, message: 'Gemini tidak memberi jawaban. Coba lagi.' };
  if (cand.finishReason === 'MAX_TOKENS') throw { status: 422, message: 'Jawaban AI kepanjangan dan terpotong. Kurangi jumlah yang diminta.' };
  if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(cand.finishReason)) {
    throw { status: 422, message: 'Gemini menolak permintaan ini. Coba ubah kalimatnya.' };
  }
  return { text: (cand.content?.parts || []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('') };
}
