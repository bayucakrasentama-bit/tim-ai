import fs from 'node:fs';
import { GRAPH_VERSION, bases, readJson, sleep, requireFields } from './http.js';

// Instagram Business/Creator lewat Instagram Graph API resmi (Content Publishing).
// - Video diunggah langsung (resumable upload) dan dipublish sebagai Reels.
// - Gambar wajib punya URL publik (Instagram mengambil gambarnya sendiri),
//   jadi isi "URL publik app" kalau mau posting gambar.
export default {
  id: 'instagram',
  label: 'Instagram',
  color: '#e1306c',
  supports: ['image', 'video'],
  fields: [
    { key: 'igUserId', label: 'Instagram Business Account ID' },
    { key: 'accessToken', label: 'Access Token', secret: true },
    { key: 'publicBaseUrl', label: 'URL publik app (khusus posting gambar, opsional)', optional: true },
  ],
  note: 'Akun IG harus Business/Creator & tertaut ke Facebook Page. Izin: instagram_basic, instagram_content_publish.',
  async publish({ caption, mediaType, mediaPath, mediaName, mediaUrl, credentials }) {
    requireFields(credentials, ['igUserId', 'accessToken'], 'Instagram');
    const { igUserId, accessToken } = credentials;
    const graph = `${bases.graph()}/${GRAPH_VERSION}`;

    let containerId;
    if (mediaType === 'image') {
      // Di Vercel, gambar sudah punya URL publik (Vercel Blob).
      let imageUrl = mediaUrl;
      if (!imageUrl) {
        const base = credentials.publicBaseUrl || process.env.PUBLIC_BASE_URL;
        if (!base) throw new Error('Instagram: posting gambar butuh "URL publik app" (lihat README)');
        imageUrl = `${base.replace(/\/$/, '')}/uploads/${mediaName}`;
      }
      const res = await fetch(`${graph}/${igUserId}/media`, {
        method: 'POST',
        body: new URLSearchParams({
          image_url: imageUrl,
          caption,
          access_token: accessToken,
        }),
      });
      containerId = (await readJson(res, 'Instagram')).id;
    } else if (mediaType === 'video') {
      const res = await fetch(`${graph}/${igUserId}/media`, {
        method: 'POST',
        body: new URLSearchParams({
          media_type: 'REELS',
          upload_type: 'resumable',
          caption,
          access_token: accessToken,
        }),
      });
      containerId = (await readJson(res, 'Instagram')).id;
      const size = fs.statSync(mediaPath).size;
      const up = await fetch(`${bases.igUpload()}/ig-api-upload/${GRAPH_VERSION}/${containerId}`, {
        method: 'POST',
        headers: { Authorization: `OAuth ${accessToken}`, offset: '0', file_size: String(size) },
        body: fs.readFileSync(mediaPath),
      });
      await readJson(up, 'Instagram upload');
    } else {
      throw new Error('Instagram wajib pakai gambar atau video');
    }

    await waitUntilReady(graph, containerId, accessToken);

    const pub = await fetch(`${graph}/${igUserId}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: containerId, access_token: accessToken }),
    });
    const mediaId = (await readJson(pub, 'Instagram')).id;

    let remoteUrl = null;
    try {
      const info = await fetch(`${graph}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`);
      remoteUrl = (await readJson(info, 'Instagram')).permalink || null;
    } catch {
      // permalink cuma bonus, posting tetap dianggap sukses
    }
    return { remoteId: mediaId, remoteUrl };
  },
  // Insights per media. Butuh izin instagram_manage_insights.
  async fetchStats({ remoteId, mediaType, credentials }) {
    requireFields(credentials, ['accessToken'], 'Instagram');
    const metrics = mediaType === 'video'
      ? 'views,reach,likes,comments,shares,saved'
      : 'views,reach,likes,comments,shares,saved,profile_visits,follows';
    const res = await fetch(`${bases.graph()}/${GRAPH_VERSION}/${remoteId}/insights?${new URLSearchParams({ metric: metrics, access_token: credentials.accessToken })}`);
    const body = await readJson(res, 'Instagram (insights)');
    const got = {};
    for (const m of body.data || []) got[m.name] = Number(m.total_value?.value ?? m.values?.[0]?.value ?? 0);
    return {
      views: got.views ?? null,
      reach: got.reach ?? null,
      likes: got.likes ?? null,
      comments: got.comments ?? null,
      shares: got.shares ?? null,
      saves: got.saved ?? null,
      profile_visits: got.profile_visits ?? null,
      follows: got.follows ?? null,
    };
  },
};

async function waitUntilReady(graph, containerId, accessToken) {
  const interval = Number(process.env.SIARIN_IG_POLL_MS ?? 5000);
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${graph}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`);
    const { status_code } = await readJson(res, 'Instagram');
    if (status_code === 'FINISHED' || status_code === 'PUBLISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Instagram gagal memproses media (${status_code})`);
    await sleep(interval);
  }
  throw new Error('Instagram terlalu lama memproses media');
}
