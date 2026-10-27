import fs from 'node:fs';
import { bases, readJson, mimeFor, requireFields } from './http.js';

const MIN_CHUNK = 5 * 1024 * 1024;
const CHUNK = 10 * 1024 * 1024;

// Access token TikTok cuma berlaku 24 jam, jadi tiap kali dipakai kita minta yang baru
// pakai refresh token (berlaku 365 hari). Refresh token-nya bisa berganti; yang baru dikembalikan
// supaya disimpan pemanggil.
export async function tiktokAccessToken(credentials) {
  if (!credentials.refreshToken && credentials.accessToken) {
    return { accessToken: credentials.accessToken, credentials: null, scope: null }; // akun versi lama
  }
  requireFields(credentials, ['clientKey', 'clientSecret', 'refreshToken'], 'TikTok');
  const res = await fetch(`${bases.tiktok()}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: credentials.clientKey,
      client_secret: credentials.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }),
  });
  const body = await readJson(res, 'TikTok (token)');
  if (!body.access_token) throw new Error(`TikTok (token): ${body.error_description || body.error || 'tidak ada access token'}`);
  const changed = body.refresh_token && body.refresh_token !== credentials.refreshToken;
  return {
    accessToken: body.access_token,
    scope: body.scope || '',
    credentials: changed ? { ...credentials, refreshToken: body.refresh_token } : null,
  };
}

// TikTok lewat Content Posting API resmi (Direct Post, upload file).
export default {
  id: 'tiktok',
  label: 'TikTok',
  color: '#111111',
  supports: ['video'],
  fields: [
    { key: 'clientKey', label: 'Client key' },
    { key: 'clientSecret', label: 'Client secret', secret: true },
    { key: 'refreshToken', label: 'Refresh token (otomatis lewat tombol Hubungkan)', secret: true },
    { key: 'privacy', label: 'Privasi (SELF_ONLY / PUBLIC_TO_EVERYONE / ...)', optional: true },
  ],
  note: 'Sebelum app TikTok lolos audit, postingan hanya bisa SELF_ONLY (private).',
  async publish({ caption, mediaType, mediaPath, credentials }) {
    if (mediaType !== 'video') throw new Error('TikTok hanya bisa video');
    const token = await tiktokAccessToken(credentials);

    const size = fs.statSync(mediaPath).size;
    // Aturan TikTok: file < 5MB dikirim 1 potong; selebihnya potongan terakhir menampung sisa.
    const chunkSize = size < MIN_CHUNK ? size : CHUNK;
    const totalChunks = size < MIN_CHUNK ? 1 : Math.floor(size / CHUNK);

    const init = await fetch(`${bases.tiktok()}/v2/post/publish/video/init/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        post_info: { title: caption.slice(0, 2200), privacy_level: credentials.privacy || 'SELF_ONLY' },
        source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: totalChunks },
      }),
    });
    const { data } = await readJson(init, 'TikTok');

    const buf = fs.readFileSync(mediaPath);
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = i === totalChunks - 1 ? size - 1 : start + chunkSize - 1;
      const res = await fetch(data.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeFor(mediaPath),
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
        },
        body: buf.subarray(start, end + 1),
      });
      if (!res.ok) throw new Error(`TikTok upload potongan ${i + 1} gagal: HTTP ${res.status}`);
    }
    return { remoteId: data.publish_id, remoteUrl: null, credentials: token.credentials };
  },
};
