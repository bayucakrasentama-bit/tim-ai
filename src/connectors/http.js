// Helper kecil buat manggil API resmi. Base URL bisa di-override lewat env
// (dipakai test supaya nembak server palsu, bukan API asli).
import fs from 'node:fs';
import path from 'node:path';

export const GRAPH_VERSION = 'v26.0';

export const bases = {
  graph: () => process.env.SIARIN_GRAPH_BASE || 'https://graph.facebook.com',
  graphVideo: () => process.env.SIARIN_GRAPH_VIDEO_BASE || 'https://graph-video.facebook.com',
  igUpload: () => process.env.SIARIN_IG_UPLOAD_BASE || 'https://rupload.facebook.com',
  googleOAuth: () => process.env.SIARIN_GOOGLE_OAUTH_BASE || 'https://oauth2.googleapis.com',
  youtubeUpload: () => process.env.SIARIN_YOUTUBE_UPLOAD_BASE || 'https://www.googleapis.com',
  tiktok: () => process.env.SIARIN_TIKTOK_BASE || 'https://open.tiktokapis.com',
  tikwm: () => process.env.SIARIN_TIKWM_BASE || 'https://www.tikwm.com',
};

export async function readJson(res, what) {
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok || body.error?.message || (body.error && body.error.code && body.error.code !== 'ok')) {
    // Google/TikTok OAuth: { error: 'invalid_grant', error_description: '...' } -> bawa kodenya juga.
    const code = typeof body.error === 'string' ? ` (${body.error})` : '';
    const msg = (body.error?.message || body.error_description || body.raw || `HTTP ${res.status}`) + code;
    throw new Error(`${what}: ${msg}`);
  }
  return body;
}

export async function fileBlob(filePath, type) {
  return fs.openAsBlob(filePath, { type });
}

export function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4',
  }[ext] || 'application/octet-stream';
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function requireFields(credentials, keys, platform) {
  const missing = keys.filter((k) => !credentials?.[k]);
  if (missing.length) throw new Error(`Kredensial ${platform} belum lengkap: ${missing.join(', ')}`);
}
