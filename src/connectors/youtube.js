import fs from 'node:fs';
import { bases, readJson, mimeFor, requireFields } from './http.js';

// Tukar refresh token jadi access token (berlaku ~1 jam).
export async function googleAccessToken(credentials) {
  requireFields(credentials, ['clientId', 'clientSecret', 'refreshToken'], 'YouTube');
  const res = await fetch(`${bases.googleOAuth()}/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  return (await readJson(res, 'YouTube (token)')).access_token;
}

// YouTube lewat YouTube Data API v3 resmi (videos.insert, resumable upload).
export default {
  id: 'youtube',
  label: 'YouTube',
  color: '#ff0000',
  supports: ['video'],
  fields: [
    { key: 'clientId', label: 'OAuth Client ID' },
    { key: 'clientSecret', label: 'OAuth Client Secret', secret: true },
    { key: 'refreshToken', label: 'Refresh Token', secret: true },
    { key: 'privacy', label: 'Privasi (private / unlisted / public)', optional: true },
  ],
  note: 'Pastikan OAuth consent screen berstatus "In production"; kalau masih "Testing", refresh token mati setelah 7 hari.',
  async publish({ caption, title, mediaType, mediaPath, credentials }) {
    if (mediaType !== 'video') throw new Error('YouTube hanya bisa video');

    const access_token = await googleAccessToken(credentials);

    const size = fs.statSync(mediaPath).size;
    const videoTitle = (title || caption.split('\n')[0] || 'Video baru').slice(0, 100);
    const init = await fetch(
      `${bases.youtubeUpload()}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeFor(mediaPath),
          'X-Upload-Content-Length': String(size),
        },
        body: JSON.stringify({
          snippet: { title: videoTitle, description: caption },
          status: { privacyStatus: credentials.privacy || 'private' },
        }),
      },
    );
    if (!init.ok) await readJson(init, 'YouTube (init)');
    const uploadUrl = init.headers.get('location');
    if (!uploadUrl) throw new Error('YouTube tidak memberi URL upload');

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeFor(mediaPath), 'Content-Length': String(size) },
      body: fs.readFileSync(mediaPath),
    });
    const video = await readJson(put, 'YouTube (upload)');
    return { remoteId: video.id, remoteUrl: `https://www.youtube.com/watch?v=${video.id}` };
  },
  // Statistik publik video lewat videos.list (part=statistics).
  async fetchStats({ remoteId, credentials }) {
    const access_token = await googleAccessToken(credentials);
    const res = await fetch(`${bases.youtubeUpload()}/youtube/v3/videos?part=statistics&id=${encodeURIComponent(remoteId)}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const item = (await readJson(res, 'YouTube (statistik)')).items?.[0];
    if (!item) throw new Error('YouTube: video tidak ditemukan (mungkin sudah dihapus)');
    const n = (v) => (v === undefined ? null : Number(v));
    return { views: n(item.statistics.viewCount), likes: n(item.statistics.likeCount), comments: n(item.statistics.commentCount) };
  },
};
