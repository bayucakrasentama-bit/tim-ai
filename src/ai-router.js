// Universal AI Router (BYOK): satu pintu untuk semua provider AI.
// - Teks: format OpenAI-compatible (OpenAI, DeepSeek, xAI, Groq, Together, Fireworks, Qwen, OpenRouter, dan base URL kustom
//   seperti Ollama / LM Studio / vLLM / 9router), plus Anthropic & Google Gemini native.
// - Gambar & video: fal.ai, Replicate, OpenAI Images (dikerjakan sebagai job async, hasilnya disalin ke Vercel Blob).
// - Suara: ElevenLabs.
// Daftar model diambil langsung dari API provider (tidak ditulis mati di kode), jadi selalu ikut model terbaru.
// API key disimpan di tabel settings dan tidak pernah dikirim balik ke browser (hanya 4 karakter terakhir).
import crypto from 'node:crypto';
import { getSetting, setSetting, now } from './db.js';

const KEYS = 'ai_keys';
const DEFAULT = 'ai_default';

export const PROVIDERS = {
  openai: { label: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1', caps: ['text', 'image'], keyUrl: 'https://platform.openai.com/api-keys', or: 'openai' },
  anthropic: { label: 'Anthropic (Claude)', kind: 'anthropic', base: 'https://api.anthropic.com', caps: ['text'], keyUrl: 'https://console.anthropic.com/settings/keys', env: 'ANTHROPIC_API_KEY', or: 'anthropic' },
  gemini: { label: 'Google Gemini', kind: 'gemini', base: 'https://generativelanguage.googleapis.com', caps: ['text'], keyUrl: 'https://aistudio.google.com/apikey', env: 'GEMINI_API_KEY', or: 'google' },
  deepseek: { label: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com/v1', caps: ['text'], keyUrl: 'https://platform.deepseek.com/api_keys', or: 'deepseek' },
  xai: { label: 'xAI (Grok)', kind: 'openai', base: 'https://api.x.ai/v1', caps: ['text'], keyUrl: 'https://console.x.ai', or: 'x-ai' },
  qwen: { label: 'Alibaba Qwen (DashScope)', kind: 'openai', base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', caps: ['text'], keyUrl: 'https://bailian.console.alibabacloud.com', or: 'qwen' },
  groq: { label: 'Groq (Llama, Mixtral, dll)', kind: 'openai', base: 'https://api.groq.com/openai/v1', caps: ['text'], keyUrl: 'https://console.groq.com/keys', or: 'meta-llama' },
  together: { label: 'Together AI', kind: 'openai', base: 'https://api.together.xyz/v1', caps: ['text'], keyUrl: 'https://api.together.ai/settings/api-keys' },
  fireworks: { label: 'Fireworks AI', kind: 'openai', base: 'https://api.fireworks.ai/inference/v1', caps: ['text'], keyUrl: 'https://fireworks.ai/account/api-keys' },
  openrouter: { label: 'OpenRouter (agregator ratusan model)', kind: 'openai', base: 'https://openrouter.ai/api/v1', caps: ['text'], keyUrl: 'https://openrouter.ai/keys' },
  custom: { label: 'Custom OpenAI-compatible (Ollama, LM Studio, vLLM, 9router)', kind: 'openai', base: '', caps: ['text'], custom: true },
  fal: { label: 'fal.ai (Flux, Ideogram, Recraft, Imagen, Kling, Luma, Minimax, Veo)', kind: 'fal', caps: ['image', 'video'], keyUrl: 'https://fal.ai/dashboard/keys' },
  replicate: { label: 'Replicate', kind: 'replicate', caps: ['image', 'video'], keyUrl: 'https://replicate.com/account/api-tokens' },
  elevenlabs: { label: 'ElevenLabs (suara / voice-over)', kind: 'elevenlabs', caps: ['audio'], keyUrl: 'https://elevenlabs.io/app/settings/api-keys' },
};

// Saran ID model media (provider ini tidak punya daftar model publik). Bisa diganti/ketik ID lain di UI.
export const MEDIA_SUGGEST = {
  openai: { image: ['gpt-image-1', 'dall-e-3'] },
  fal: {
    image: ['fal-ai/flux-pro/v1.1', 'fal-ai/flux/dev', 'fal-ai/flux/schnell', 'fal-ai/ideogram/v2', 'fal-ai/recraft-v3', 'fal-ai/imagen4/preview', 'fal-ai/stable-diffusion-v35-large'],
    video: ['fal-ai/kling-video/v2.1/standard/text-to-video', 'fal-ai/luma-dream-machine', 'fal-ai/minimax/video-01', 'fal-ai/veo3'],
  },
  replicate: {
    image: ['black-forest-labs/flux-1.1-pro', 'black-forest-labs/flux-schnell', 'ideogram-ai/ideogram-v2', 'recraft-ai/recraft-v3', 'stability-ai/stable-diffusion-3.5-large', 'google/imagen-4'],
    video: ['kwaivgi/kling-v2.1', 'luma/ray', 'minimax/video-01', 'google/veo-3'],
  },
  elevenlabs: { audio: ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'] },
};

export class RouterError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// ---------------- Key & pengaturan ----------------
export async function loadKeys(db) {
  return JSON.parse((await getSetting(db, KEYS)) || '{}');
}
// keys & legacy boleh dikirim dari pemanggil supaya tidak membaca database berulang (mis. daftar semua provider).
export async function credsFor(db, provider, keys = null, legacy = null) {
  const p = PROVIDERS[provider];
  if (!p) throw new RouterError(`Provider tidak dikenal: ${provider}`);
  const saved = (keys || (await loadKeys(db)))[provider] || {};
  let key = saved.key || (p.env ? process.env[p.env] : '') || '';
  // Kompatibel dengan pengaturan lama: key Gemini workspace di AI Studio.
  if (!key && provider === 'gemini') key = (legacy || JSON.parse((await getSetting(db, 'ai_config')) || '{}')).gemini_key || '';
  const base = (p.custom ? saved.base_url : saved.base_url || p.base) || '';
  return { key, base: base.replace(/\/+$/, ''), source: saved.key ? 'workspace' : key ? 'env' : null };
}
export async function getDefault(db) {
  return JSON.parse((await getSetting(db, DEFAULT)) || 'null');
}
const mask = (k) => (k ? `••••${String(k).slice(-4)}` : '');

// ---------------- Harga (estimasi biaya) dari katalog publik OpenRouter ----------------
let priceCache = { at: 0, map: new Map() };
async function priceFor(provider, model) {
  if (Date.now() - priceCache.at > 3600e3) {
    try {
      const body = await (await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(8000) })).json();
      priceCache = { at: Date.now(), map: new Map((body.data || []).map((m) => [m.id, { in: Number(m.pricing?.prompt) || 0, out: Number(m.pricing?.completion) || 0, context: m.context_length }])) };
    } catch { priceCache.at = Date.now() - 3000e3; }
  }
  const m = String(model).replace(/^models\//, '');
  const pre = PROVIDERS[provider]?.or;
  return priceCache.map.get(provider === 'openrouter' ? m : `${pre}/${m}`) || priceCache.map.get(m) || null;
}

// ---------------- Daftar model ----------------
const modelCache = new Map();
export async function listModels(db, provider, kind = 'text') {
  const p = PROVIDERS[provider];
  if (!p) throw new RouterError('Provider tidak dikenal');
  if (kind !== 'text' || !p.caps.includes('text')) return (MEDIA_SUGGEST[provider]?.[kind] || []).map((id) => ({ id, name: id, suggested: true }));
  const c = await credsFor(db, provider);
  if (!c.key && provider !== 'custom' && provider !== 'openrouter') throw new RouterError(`API key ${p.label} belum diisi`);
  const ck = `${provider}|${c.base}|${c.key.slice(-6)}`;
  const hit = modelCache.get(ck);
  if (hit && Date.now() - hit.at < 600e3) return hit.list;
  let list = [];
  if (p.kind === 'openai') {
    if (!c.base) throw new RouterError('Isi Base URL dulu (mis. https://xxx.ngrok.app/v1 untuk Ollama)');
    const body = await jsonFetch(`${c.base}/models`, { headers: c.key ? { Authorization: `Bearer ${c.key}` } : {} }, p.label);
    list = (body.data || body.models || []).map((m) => ({
      id: m.id || m.name, name: m.name || m.id, context: m.context_length || m.context_window || null,
      price: m.pricing ? { in: Number(m.pricing.prompt) || 0, out: Number(m.pricing.completion) || 0 } : null,
    }));
    if (provider === 'openai') list = list.filter((m) => !/(embedding|whisper|tts|dall-e|gpt-image|moderation|audio|realtime|transcribe|search|davinci|babbage)/i.test(m.id));
  } else if (p.kind === 'anthropic') {
    const body = await jsonFetch(`${c.base}/v1/models?limit=100`, { headers: { 'x-api-key': c.key, 'anthropic-version': '2023-06-01' } }, p.label);
    list = (body.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
  } else if (p.kind === 'gemini') {
    const body = await jsonFetch(`${c.base}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': c.key } }, p.label);
    list = (body.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name, context: m.inputTokenLimit || null }));
  }
  list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  modelCache.set(ck, { at: Date.now(), list });
  return list;
}

async function jsonFetch(url, opts, what) {
  let res;
  try {
    res = await fetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(280_000) });
  } catch (err) {
    throw new RouterError(`${what} tidak bisa dihubungi: ${err.message}`, 502);
  }
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = body.error?.message || body.error?.type || (typeof body.error === 'string' ? body.error : '') || body.detail?.message || body.detail || body.message || body.raw || res.statusText;
    const status = res.status === 401 || res.status === 403 ? 502 : res.status === 429 ? 429 : res.status >= 500 ? 502 : 400;
    throw Object.assign(new RouterError(`${what}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`, status), { http: res.status });
  }
  return body;
}

// ---------------- Teks ----------------
// messages: [{ role: 'user'|'assistant', content: string | blok gaya Anthropic (text/image base64) }]
function toOpenAiContent(content) {
  if (typeof content === 'string') return content;
  return content.map((b) => (b.type === 'image' && b.source?.type === 'base64'
    ? { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }
    : { type: 'text', text: String(b.text ?? '') }));
}
function toGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((b) => (b.type === 'image' && b.source?.type === 'base64' ? { inlineData: { mimeType: b.source.media_type, data: b.source.data } } : { text: String(b.text ?? '') }));
}
const JSON_RULE = (schema) => `\n\nBalas HANYA dengan satu objek JSON valid (tanpa teks lain, tanpa markdown) yang mengikuti skema JSON ini:\n${JSON.stringify(schema)}`;

export async function generateText(db, { provider, model, system = '', messages, temperature, maxTokens = 8000, schema = null, thinking = false }) {
  const p = PROVIDERS[provider];
  if (!p || !p.caps.includes('text')) throw new RouterError('Pilih provider teks');
  if (!model) throw new RouterError('Pilih model');
  const c = await credsFor(db, provider);
  if (!c.key && !['custom'].includes(provider)) throw new RouterError(`API key ${p.label} belum diisi. Buka Pengaturan → AI & API Keys.`, 503);
  const sys = schema ? `${system}${JSON_RULE(schema)}` : system;
  const t0 = Date.now();
  let text = '';
  let usage = { input: null, output: null };
  let costUsd = null;
  if (p.kind === 'openai') {
    if (!c.base) throw new RouterError('Base URL provider kustom belum diisi');
    const isOpenAiReasoning = provider === 'openai' && /^(o\d|gpt-5)/i.test(model);
    const body = {
      model,
      messages: [...(sys ? [{ role: isOpenAiReasoning ? 'developer' : 'system', content: sys }] : []), ...messages.map((m) => ({ role: m.role, content: toOpenAiContent(m.content) }))],
      ...(isOpenAiReasoning ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
      ...(temperature != null && !isOpenAiReasoning ? { temperature: Number(temperature) } : {}),
      ...(schema && provider !== 'custom' ? { response_format: { type: 'json_object' } } : {}),
      ...(provider === 'openrouter' ? { usage: { include: true } } : {}),
    };
    const headers = { 'Content-Type': 'application/json', ...(c.key ? { Authorization: `Bearer ${c.key}` } : {}),
      ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://tim-ai-bcs.vercel.app', 'X-Title': 'TIM-AI' } : {}) };
    let r;
    try {
      r = await jsonFetch(`${c.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) }, p.label);
    } catch (err) {
      // Sebagian model/endpoint tidak mendukung response_format → ulang tanpa itu (instruksi JSON tetap di system prompt).
      if (!(body.response_format && err.http === 400)) throw err;
      delete body.response_format;
      r = await jsonFetch(`${c.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) }, p.label);
    }
    const msg = r.choices?.[0]?.message || {};
    text = typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.map((x) => x.text || '').join('') : '';
    usage = { input: r.usage?.prompt_tokens ?? null, output: r.usage?.completion_tokens ?? null };
    if (typeof r.usage?.cost === 'number') costUsd = r.usage.cost;
    if (r.choices?.[0]?.finish_reason === 'length') throw new RouterError('Jawaban AI terpotong (max tokens). Naikkan Max Tokens atau persingkat permintaan.', 422);
  } else if (p.kind === 'anthropic') {
    const body = {
      model, max_tokens: maxTokens, ...(sys ? { system: sys } : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      ...(thinking ? { thinking: { type: 'enabled', budget_tokens: Math.max(1024, Math.min(32000, Math.floor(maxTokens / 2))) } } : temperature != null ? { temperature: Math.min(1, Number(temperature)) } : {}),
    };
    const r = await jsonFetch(`${c.base}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) }, p.label);
    text = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    usage = { input: r.usage?.input_tokens ?? null, output: r.usage?.output_tokens ?? null };
    if (r.stop_reason === 'max_tokens') throw new RouterError('Jawaban AI terpotong (max tokens). Naikkan Max Tokens.', 422);
    if (r.stop_reason === 'refusal') throw new RouterError('AI menolak permintaan ini. Coba ubah kalimatnya.', 422);
  } else if (p.kind === 'gemini') {
    const body = {
      ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: toGeminiParts(m.content) })),
      generationConfig: { maxOutputTokens: maxTokens, ...(temperature != null ? { temperature: Number(temperature) } : {}), ...(schema ? { responseMimeType: 'application/json' } : {}) },
    };
    const r = await jsonFetch(`${c.base}/v1beta/models/${encodeURIComponent(String(model).replace(/^models\//, ''))}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key }, body: JSON.stringify(body),
    }, p.label);
    const cand = r.candidates?.[0];
    if (!cand) throw new RouterError(r.promptFeedback?.blockReason ? 'Gemini menolak permintaan ini.' : 'Gemini tidak memberi jawaban.', 422);
    text = (cand.content?.parts || []).filter((x) => !x.thought && typeof x.text === 'string').map((x) => x.text).join('');
    usage = { input: r.usageMetadata?.promptTokenCount ?? null, output: r.usageMetadata?.candidatesTokenCount ?? null };
    if (cand.finishReason === 'MAX_TOKENS') throw new RouterError('Jawaban AI terpotong (max tokens). Naikkan Max Tokens.', 422);
  }
  if (costUsd == null && usage.input != null) {
    const price = await priceFor(provider, model).catch(() => null);
    if (price) costUsd = usage.input * price.in + (usage.output || 0) * price.out;
  }
  return { text, usage, cost_usd: costUsd, ms: Date.now() - t0, provider, model };
}

// ---------------- Media: penyimpanan hasil ----------------
async function saveMedia(buf, ext, contentType) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const r = await put(`ai/${new Date().toISOString().slice(0, 10)}/${crypto.randomBytes(8).toString('hex')}.${ext}`, buf, { access: 'public', contentType });
    return r.url;
  }
  return `data:${contentType};base64,${Buffer.from(buf).toString('base64')}`;
}
async function copyToBlob(url) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !/^https?:/.test(url)) return url;
  const res = await fetch(url);
  if (!res.ok) return url;
  const type = res.headers.get('content-type') || 'application/octet-stream';
  const ext = (type.split('/')[1] || 'bin').split(/[;+]/)[0].replace('jpeg', 'jpg').replace('quicktime', 'mov');
  return saveMedia(Buffer.from(await res.arrayBuffer()), ext, type);
}
function firstUrl(o) {
  if (!o) return null;
  if (typeof o === 'string') return /^https?:|^data:/.test(o) ? o : null;
  if (Array.isArray(o)) { for (const x of o) { const u = firstUrl(x); if (u) return u; } return null; }
  for (const k of ['url', 'images', 'image', 'video', 'videos', 'output', 'audio', 'file']) { if (o[k] != null) { const u = firstUrl(o[k]); if (u) return u; } }
  return null;
}

const ASPECT = { '1:1': { fal: 'square_hd', oai: '1024x1024', d3: '1024x1024' }, '16:9': { fal: 'landscape_16_9', oai: '1536x1024', d3: '1792x1024' }, '9:16': { fal: 'portrait_16_9', oai: '1024x1536', d3: '1024x1792' }, '4:5': { fal: 'portrait_4_3', oai: '1024x1536', d3: '1024x1792' } };

// Buat job gambar/video. OpenAI Images langsung selesai; fal/Replicate diproses async lalu dipantau lewat pollJob.
export async function createMediaJob(db, { kind, provider, model, prompt, aspect = '1:1', imageUrl = null, duration = null, brandId = null, user = '' }) {
  const p = PROVIDERS[provider];
  if (!p || !p.caps.includes(kind)) throw new RouterError(`${p?.label || provider} tidak mendukung ${kind}`);
  if (!String(prompt || '').trim()) throw new RouterError('Tulis prompt dulu');
  if (!model) throw new RouterError('Pilih / ketik ID model');
  const c = await credsFor(db, provider);
  if (!c.key) throw new RouterError(`API key ${p.label} belum diisi. Buka Pengaturan → AI & API Keys.`, 503);
  const stamp = now();
  const [job] = await db.run(`INSERT INTO ai_jobs (brand_id, kind, provider, model, prompt, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?) RETURNING *`, brandId, kind, provider, model, String(prompt).slice(0, 4000), user, stamp, stamp);
  const finish = async (fields) => {
    const keys = Object.keys(fields);
    await db.run(`UPDATE ai_jobs SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...keys.map((k) => fields[k]), now(), job.id);
    return db.get('SELECT * FROM ai_jobs WHERE id = ?', job.id);
  };
  try {
    if (provider === 'openai') {
      const isD3 = /dall-e-3/.test(model);
      const r = await jsonFetch(`${c.base}/images/generations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
        body: JSON.stringify({ model, prompt, n: 1, size: (ASPECT[aspect] || ASPECT['1:1'])[isD3 ? 'd3' : 'oai'], ...(isD3 ? { response_format: 'b64_json' } : {}) }),
      }, 'OpenAI Images');
      const d = r.data?.[0] || {};
      const url = d.b64_json ? await saveMedia(Buffer.from(d.b64_json, 'base64'), 'png', 'image/png') : await copyToBlob(d.url);
      return finish({ status: 'done', result_url: url });
    }
    if (provider === 'fal') {
      const input = { prompt, aspect_ratio: aspect, ...(kind === 'image' ? { image_size: (ASPECT[aspect] || ASPECT['1:1']).fal, num_images: 1 } : {}),
        ...(imageUrl ? { image_url: imageUrl } : {}), ...(duration ? { duration: String(duration) } : {}) };
      const r = await jsonFetch(`https://queue.fal.run/${model}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Key ${c.key}` }, body: JSON.stringify(input) }, 'fal.ai');
      return finish({ status: 'running', poll: JSON.stringify({ status_url: r.status_url, response_url: r.response_url }) });
    }
    if (provider === 'replicate') {
      const input = { prompt, aspect_ratio: aspect, ...(imageUrl ? { image: imageUrl, start_image: imageUrl } : {}), ...(duration ? { duration: Number(duration) } : {}) };
      const path = /:/.test(model) ? 'predictions' : `models/${model}/predictions`;
      const body = /:/.test(model) ? { version: model.split(':')[1], input } : { input };
      const r = await jsonFetch(`https://api.replicate.com/v1/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}`, Prefer: `wait=${kind === 'image' ? 50 : 5}` }, body: JSON.stringify(body),
      }, 'Replicate');
      if (r.status === 'succeeded') return finish({ status: 'done', result_url: await copyToBlob(firstUrl(r.output)) });
      if (r.status === 'failed' || r.status === 'canceled') return finish({ status: 'failed', error: String(r.error || r.status).slice(0, 500) });
      return finish({ status: 'running', poll: JSON.stringify({ get: r.urls?.get }) });
    }
  } catch (err) {
    await finish({ status: 'failed', error: String(err.message).slice(0, 500) });
    throw err;
  }
  throw new RouterError('Provider media belum didukung');
}

export async function pollJob(db, job) {
  if (!['running', 'queued'].includes(job.status)) return job;
  const c = await credsFor(db, job.provider);
  const poll = JSON.parse(job.poll || '{}');
  const set = async (fields) => {
    const keys = Object.keys(fields);
    await db.run(`UPDATE ai_jobs SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...keys.map((k) => fields[k]), now(), job.id);
    return db.get('SELECT * FROM ai_jobs WHERE id = ?', job.id);
  };
  try {
    if (job.provider === 'fal') {
      const s = await jsonFetch(poll.status_url, { headers: { Authorization: `Key ${c.key}` } }, 'fal.ai');
      if (s.status === 'COMPLETED') {
        const out = await jsonFetch(poll.response_url, { headers: { Authorization: `Key ${c.key}` } }, 'fal.ai');
        const url = firstUrl(out);
        return set(url ? { status: 'done', result_url: await copyToBlob(url) } : { status: 'failed', error: 'Hasil tidak berisi file' });
      }
      if (['FAILED', 'ERROR', 'CANCELLED'].includes(s.status)) return set({ status: 'failed', error: String(s.error || s.status) });
      return job;
    }
    if (job.provider === 'replicate') {
      const r = await jsonFetch(poll.get, { headers: { Authorization: `Bearer ${c.key}` } }, 'Replicate');
      if (r.status === 'succeeded') return set({ status: 'done', result_url: await copyToBlob(firstUrl(r.output)) });
      if (r.status === 'failed' || r.status === 'canceled') return set({ status: 'failed', error: String(r.error || r.status).slice(0, 500) });
      return job;
    }
  } catch (err) {
    if (Date.now() - new Date(job.created_at) > 30 * 60e3) return set({ status: 'failed', error: String(err.message).slice(0, 500) });
  }
  return job;
}

// ---------------- Suara (ElevenLabs) ----------------
export async function textToSpeech(db, { text, voiceId, model = 'eleven_multilingual_v2' }) {
  const c = await credsFor(db, 'elevenlabs');
  if (!c.key) throw new RouterError('API key ElevenLabs belum diisi. Buka Pengaturan → AI & API Keys.', 503);
  if (!String(text || '').trim()) throw new RouterError('Tulis naskah dulu');
  if (!voiceId) throw new RouterError('Pilih suara');
  let res;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': c.key, Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: String(text).slice(0, 5000), model_id: model }), signal: AbortSignal.timeout(120_000),
    });
  } catch (err) { throw new RouterError(`ElevenLabs tidak bisa dihubungi: ${err.message}`, 502); }
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new RouterError(`ElevenLabs: ${b.detail?.message || b.detail || res.statusText}`, res.status === 401 ? 502 : 400);
  }
  return saveMedia(Buffer.from(await res.arrayBuffer()), 'mp3', 'audio/mpeg');
}
export async function listVoices(db) {
  const c = await credsFor(db, 'elevenlabs');
  if (!c.key) throw new RouterError('API key ElevenLabs belum diisi', 503);
  const b = await jsonFetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': c.key } }, 'ElevenLabs');
  return (b.voices || []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category, labels: v.labels || {}, preview: v.preview_url }));
}

// ---------------- Rute ----------------
export function aiRouterRoutes(app, db, scope, { canManage }) {
  const manageOnly = (req, res, next) => (canManage(req.user) ? next() : res.status(403).json({ error: 'Cuma pemilik/admin yang bisa mengatur API key AI' }));
  const handle = (fn) => async (req, res) => {
    try { res.json(await fn(req)); } catch (err) {
      if (err instanceof RouterError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  };

  app.get('/api/ai/providers', handle(async () => {
    const [keys, def, legacy] = await Promise.all([loadKeys(db), getDefault(db), getSetting(db, 'ai_config').then((v) => JSON.parse(v || '{}'))]);
    const out = {};
    for (const [id, p] of Object.entries(PROVIDERS)) {
      const c = await credsFor(db, id, keys, legacy);
      out[id] = { id, label: p.label, kind: p.kind, caps: p.caps, keyUrl: p.keyUrl || null, custom: !!p.custom,
        configured: !!(c.key || (p.custom && c.base)), key_hint: mask(keys[id]?.key), source: c.source, base_url: p.custom || keys[id]?.base_url ? c.base : '', default_base: p.base || '' };
    }
    return { providers: out, default: def, media: MEDIA_SUGGEST };
  }));

  app.put('/api/ai/providers/:id', manageOnly, handle(async (req) => {
    const p = PROVIDERS[req.params.id];
    if (!p) throw new RouterError('Provider tidak dikenal', 404);
    const keys = await loadKeys(db);
    const cur = keys[req.params.id] || {};
    const key = String(req.body?.key ?? '').trim();
    const base = String(req.body?.base_url ?? cur.base_url ?? '').trim();
    if (base && !/^https?:\/\/[^\s]+$/i.test(base)) throw new RouterError('Base URL harus diawali http(s)://');
    if (key && key.length > 400) throw new RouterError('API key terlalu panjang');
    keys[req.params.id] = { ...cur, ...(key ? { key } : {}), ...(base || p.custom ? { base_url: base } : {}) };
    await setSetting(db, KEYS, JSON.stringify(keys));
    for (const k of modelCache.keys()) if (k.startsWith(`${req.params.id}|`)) modelCache.delete(k);
    return { ok: true };
  }));

  app.delete('/api/ai/providers/:id', manageOnly, handle(async (req) => {
    const keys = await loadKeys(db);
    delete keys[req.params.id];
    await setSetting(db, KEYS, JSON.stringify(keys));
    return { ok: true };
  }));

  app.get('/api/ai/models', handle(async (req) => ({ models: await listModels(db, String(req.query.provider || ''), String(req.query.kind || 'text')) })));

  app.put('/api/ai/default', manageOnly, handle(async (req) => {
    const { provider, model } = req.body || {};
    if (!provider) { await db.run('DELETE FROM settings WHERE key = ?', DEFAULT); return { default: null }; }
    if (!PROVIDERS[provider]?.caps.includes('text') || !model) throw new RouterError('Pilih provider & model teks');
    const def = { provider, model: String(model).slice(0, 200), temperature: req.body.temperature == null || req.body.temperature === '' ? null : Number(req.body.temperature) };
    await setSetting(db, DEFAULT, JSON.stringify(def));
    return { default: def };
  }));

  // Playground: satu prompt ke satu model.
  app.post('/api/ai/chat', scope, handle(async (req) => {
    const b = req.body || {};
    const messages = Array.isArray(b.messages) && b.messages.length ? b.messages.slice(-30).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 30000) }))
      : [{ role: 'user', content: String(b.prompt || '').slice(0, 30000) }];
    if (!messages.at(-1).content.trim()) throw new RouterError('Tulis prompt dulu');
    return generateText(db, { provider: b.provider, model: b.model, system: String(b.system || '').slice(0, 20000), messages,
      temperature: b.temperature, maxTokens: Math.min(Math.max(Number(b.max_tokens) || 2000, 64), 64000), thinking: !!b.thinking });
  }));

  // Arena: prompt yang sama ke 2–3 model sekaligus, hasil berdampingan.
  app.post('/api/ai/arena', scope, handle(async (req) => {
    const b = req.body || {};
    const targets = (Array.isArray(b.targets) ? b.targets : []).filter((t) => t?.provider && t?.model).slice(0, 3);
    if (targets.length < 2) throw new RouterError('Pilih minimal 2 model untuk dibandingkan');
    const prompt = String(b.prompt || '').slice(0, 30000);
    if (!prompt.trim()) throw new RouterError('Tulis prompt dulu');
    const results = await Promise.allSettled(targets.map((t) => generateText(db, { provider: t.provider, model: t.model, system: String(b.system || '').slice(0, 20000),
      messages: [{ role: 'user', content: prompt }], temperature: b.temperature, maxTokens: Math.min(Math.max(Number(b.max_tokens) || 2000, 64), 32000), thinking: !!t.thinking })));
    return { results: results.map((r, i) => (r.status === 'fulfilled' ? { ok: true, ...r.value } : { ok: false, provider: targets[i].provider, model: targets[i].model, error: r.reason?.message || String(r.reason) })) };
  }));

  // Gambar & video (job async). Gambar ditunggu sebentar supaya kebanyakan langsung jadi.
  app.post('/api/ai/media', scope, handle(async (req) => {
    const b = req.body || {};
    let job = await createMediaJob(db, { kind: b.kind === 'video' ? 'video' : 'image', provider: b.provider, model: String(b.model || '').trim(), prompt: b.prompt,
      aspect: b.aspect, imageUrl: b.image_url || null, duration: b.duration || null, brandId: req.brand.id, user: req.user.username });
    for (let i = 0; job.status === 'running' && job.kind === 'image' && i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      job = await pollJob(db, job);
    }
    return job;
  }));
  app.get('/api/ai/jobs', scope, handle(async (req) => db.all('SELECT * FROM ai_jobs WHERE brand_id = ? ORDER BY id DESC LIMIT 60', req.brand.id)));
  app.get('/api/ai/jobs/:id', scope, handle(async (req) => {
    const job = await db.get('SELECT * FROM ai_jobs WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    if (!job) throw new RouterError('Job tidak ditemukan', 404);
    return pollJob(db, job);
  }));
  app.delete('/api/ai/jobs/:id', scope, handle(async (req) => {
    await db.run('DELETE FROM ai_jobs WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    return { ok: true };
  }));

  app.get('/api/ai/voices', handle(async () => ({ voices: await listVoices(db) })));
  app.post('/api/ai/tts', scope, handle(async (req) => ({ url: await textToSpeech(db, { text: req.body?.text, voiceId: req.body?.voice_id, model: req.body?.model || undefined }) })));

  // Preset Brand Voice / system prompt per brand.
  const presetKey = (id) => `ai_presets:${id}`;
  app.get('/api/ai/presets', scope, handle(async (req) => JSON.parse((await getSetting(db, presetKey(req.brand.id))) || '[]')));
  app.put('/api/ai/presets', scope, handle(async (req) => {
    const list = (Array.isArray(req.body) ? req.body : []).slice(0, 30).map((p, i) => ({ id: String(p.id || `p${Date.now()}${i}`).slice(0, 40), name: String(p.name || 'Preset').slice(0, 80), system: String(p.system || '').slice(0, 20000) }));
    await setSetting(db, presetKey(req.brand.id), JSON.stringify(list));
    return list;
  }));
}
