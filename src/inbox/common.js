// Helper bersama untuk konektor chat marketplace & Meta.
//
// Bentuk data yang dikembalikan konektor (dinormalisasi):
//   percakapan: { external_id, customer_name, customer_id, customer_avatar, customer_platform,
//                 unread, last_message_at (ISO), last_preview, can_reply, meta }
//   pesan:      { external_id, direction: 'in' | 'out', sender, type, text, media_url, sent_at (ISO), meta }
//               type: text | image | video | product | order | sticker | system | other
//   pesanan:    { external_id, buyer_id, buyer_name, status, raw_status, total, items: [{ name, qty }], ordered_at }
//               status: unpaid | paid | shipped | delivered | completed | cancelled | failed
import crypto from 'node:crypto';

export const hmacHex = (key, text) => crypto.createHmac('sha256', key).update(text).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// Timestamp marketplace bisa detik, milidetik, atau nanodetik.
export function toIso(ts) {
  if (ts === null || ts === undefined || ts === '') return new Date().toISOString();
  if (typeof ts === 'string' && !/^\d+$/.test(ts)) {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  let n = Number(ts);
  if (n > 1e17) n /= 1e6; // nanodetik
  else if (n > 1e14) n /= 1e3; // mikrodetik
  else if (n < 1e12) n *= 1e3; // detik
  return new Date(n).toISOString();
}

export function parseJson(v, fallback = {}) {
  if (v && typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

// Respons JSON + pesan error yang jelas dengan nama platform.
export async function readApi(res, what, { okCode = null } = {}) {
  const text = await res.text();
  const body = parseJson(text, { raw: text });
  const code = body.code ?? body.err_code;
  const failed = !res.ok
    || (body.error && body.error !== '' && typeof body.error === 'string')
    || (body.error && typeof body.error === 'object')
    || (okCode !== null && code !== undefined && String(code) !== String(okCode));
  if (failed) {
    const msg = body.message || body.msg || body.err_message || body.error?.message || body.error_description || body.raw || `HTTP ${res.status}`;
    throw new Error(`${what}: ${typeof body.error === 'string' && body.error ? `${body.error} – ` : ''}${msg}`);
  }
  return body;
}

export const preview = (m) => (m.type === 'text' || m.type === 'system' ? m.text : { image: '[Gambar]', video: '[Video]', product: '[Produk]', order: '[Pesanan]', sticker: '[Stiker]' }[m.type] || '[Pesan]').slice(0, 140);

// Status pesanan seragam untuk pengingat otomatis.
export const ORDER_EVENTS = {
  unpaid: 'Belum dibayar',
  paid: 'Pesanan baru (sudah dibayar)',
  shipped: 'Dalam pengiriman',
  delivered: 'Sudah sampai',
  completed: 'Pesanan selesai',
  cancelled: 'Dibatalkan',
  failed: 'Pengiriman gagal',
};
