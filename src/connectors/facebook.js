import { GRAPH_VERSION, bases, readJson, fileBlob, mimeFor, requireFields } from './http.js';

// Facebook Page lewat Meta Graph API resmi.
export default {
  id: 'facebook',
  label: 'Facebook Page',
  color: '#1877f2',
  supports: ['text', 'image', 'video'],
  fields: [
    { key: 'pageId', label: 'Page ID' },
    { key: 'accessToken', label: 'Page Access Token', secret: true },
  ],
  note: 'Butuh Page Access Token dengan izin pages_manage_posts & pages_read_engagement.',
  async publish({ caption, mediaType, mediaPath, credentials }) {
    requireFields(credentials, ['pageId', 'accessToken'], 'Facebook');
    const { pageId, accessToken } = credentials;

    if (mediaType === 'text') {
      const res = await fetch(`${bases.graph()}/${GRAPH_VERSION}/${pageId}/feed`, {
        method: 'POST',
        body: new URLSearchParams({ message: caption, access_token: accessToken }),
      });
      const body = await readJson(res, 'Facebook');
      return { remoteId: body.id, remoteUrl: `https://www.facebook.com/${body.id}` };
    }

    const form = new FormData();
    form.set('access_token', accessToken);
    form.set('source', await fileBlob(mediaPath, mimeFor(mediaPath)), 'upload');
    let url;
    if (mediaType === 'image') {
      form.set('message', caption);
      url = `${bases.graph()}/${GRAPH_VERSION}/${pageId}/photos`;
    } else {
      form.set('description', caption);
      url = `${bases.graphVideo()}/${GRAPH_VERSION}/${pageId}/videos`;
    }
    const body = await readJson(await fetch(url, { method: 'POST', body: form }), 'Facebook');
    const id = body.post_id || body.id;
    return { remoteId: id, remoteUrl: `https://www.facebook.com/${id}` };
  },
  // Engagement post + views. Butuh izin pages_read_engagement (dan read_insights untuk views).
  async fetchStats({ remoteId, credentials }) {
    requireFields(credentials, ['accessToken'], 'Facebook');
    const graph = `${bases.graph()}/${GRAPH_VERSION}`;
    const fields = 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares';
    const res = await fetch(`${graph}/${remoteId}?${new URLSearchParams({ fields, access_token: credentials.accessToken })}`);
    const post = await readJson(res, 'Facebook (statistik)');
    const out = {
      likes: post.reactions?.summary?.total_count ?? null,
      comments: post.comments?.summary?.total_count ?? null,
      shares: post.shares?.count ?? 0,
      views: null,
    };
    // Views opsional: kalau izin read_insights belum ada, engagement tetap tersimpan.
    try {
      const ins = await fetch(`${graph}/${remoteId}/insights?${new URLSearchParams({ metric: 'post_media_view', access_token: credentials.accessToken })}`);
      const v = (await readJson(ins, 'Facebook (insights)')).data?.[0];
      if (v) out.views = Number(v.total_value?.value ?? v.values?.[0]?.value ?? 0);
    } catch (err) {
      out.warning = `Views belum bisa diambil: ${err.message}`;
    }
    return out;
  },
};
