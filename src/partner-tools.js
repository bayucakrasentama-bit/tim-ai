// Alat Tim KOL & Tim Affiliate (terinspirasi KingKOL & Kalodata), di atas data milik sendiri + data publik TikTok:
// - Riset kreator: profil TikTok (followers, likes, jumlah video) + 12 video reguler terakhir → median views, ER,
//   viral dependency (soul.md), frekuensi posting, tier, dan estimasi fee wajar. Bisa banding banyak kreator sekaligus.
// - Tracking konten: link TikTok di hasil konten/deliverable dipantau otomatis tiap 6 jam (views & interaksi).
// - Campaign & jadwal KOL: campaign (budget, target, brief) berisi deliverable per KOL dengan status & tenggat.
// - Livestream affiliate: sesi live per kreator (durasi, penonton, pesanan, GMV) → GPM & GMV per jam.
// Data profil/video orang lain diambil lewat tikwm (pihak ketiga, tidak resmi) — sama seperti Scraper TikTok.
import { bases, readJson, sleep } from './connectors/http.js';
import { fetchTikwm, cleanTiktokUrl } from './tiktok.js';
import { now } from './db.js';
import { brandsFor } from './team.js';
import { parseNum, parseDay } from './ads.js';

const CACHE_MS = 24 * 3600e3;
const TRACK_STALE_MS = 6 * 3600e3;
export const DELIVERABLE_STATUS = ['brief', 'draft', 'revisi', 'approved', 'tayang', 'dibayar', 'batal'];
export const CAMPAIGN_STATUS = ['rencana', 'berjalan', 'selesai', 'batal'];
const N = (v) => (v == null || v === '' ? null : Number(v));
const median = (arr) => {
  const a = arr.filter((x) => x != null).map(Number).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
export const tierOf = (f) => (f == null ? '' : f < 10_000 ? 'Nano (<10rb)' : f < 100_000 ? 'Micro (10–100rb)' : f < 500_000 ? 'Mid (100–500rb)' : f < 1_000_000 ? 'Macro (500rb–1jt)' : 'Mega (>1jt)');
const cleanUser = (u) => String(u || '').trim().replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, '').replace(/^@/, '').split(/[/?\s]/)[0].toLowerCase();

const BLOCKED = 'Data profil kreator sedang ditolak layanan sumber (cek bot Cloudflare). Pakai mode "Analisa dari link video": tempel 3–12 link video kreator itu.';
async function tikwm(path, params) {
  // GET dulu; kalau dibalas halaman cek bot (HTML), coba POST form ke endpoint yang sama.
  let res = await fetch(`${bases.tikwm()}${path}?${new URLSearchParams(params)}`, { headers: { Accept: 'application/json' } });
  let text = await res.text();
  if (/^\s*</.test(text)) {
    res = await fetch(`${bases.tikwm()}${path}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
    text = await res.text();
  }
  if (/^\s*</.test(text)) throw Object.assign(new Error(BLOCKED), { status: 503 });
  let body;
  try { body = JSON.parse(text); } catch { throw Object.assign(new Error(BLOCKED), { status: 503 }); }
  if (body.code !== 0 || !body.data) throw new Error(`Riset kreator: ${body.msg || 'akun tidak ditemukan / private'}`);
  return body.data;
}

// Profil + metrik dari video reguler terakhir (video yang di-pin diabaikan, sesuai rumus Median Views soul.md).
export async function fetchCreator(username) {
  const u = cleanUser(username);
  if (!/^[a-z0-9._]{2,40}$/.test(u)) throw new Error('Username TikTok tidak valid');
  const info = await tikwm('/api/user/info', { unique_id: u });
  await sleep(1100);
  const posts = await tikwm('/api/user/posts', { unique_id: u, count: '20', cursor: '0' }).catch(() => ({ videos: [] }));
  const user = info.user || {};
  const st = info.stats || {};
  const vids = (posts.videos || []).filter((v) => !v.is_top).slice(0, 12).map((v) => ({
    id: String(v.video_id || v.aweme_id || ''), title: String(v.title || '').slice(0, 160), cover: v.cover || v.origin_cover || null,
    url: `https://www.tiktok.com/@${u}/video/${v.video_id || v.aweme_id}`,
    posted_at: v.create_time ? new Date(Number(v.create_time) * 1000).toISOString() : null, duration: N(v.duration),
    views: N(v.play_count), likes: N(v.digg_count), comments: N(v.comment_count), shares: N(v.share_count), saves: N(v.collect_count),
  }));
  const views = vids.map((v) => v.views).filter((v) => v != null);
  const totalViews = views.reduce((a, b) => a + b, 0);
  const eng = vids.reduce((a, v) => a + (v.likes || 0) + (v.comments || 0) + (v.shares || 0) + (v.saves || 0), 0);
  const med = median(views);
  const mean = views.length ? totalViews / views.length : null;
  const followers = N(st.followerCount ?? st.follower_count);
  const recent = vids.filter((v) => v.posted_at && Date.now() - new Date(v.posted_at) < 28 * 86400e3).length;
  return {
    username: user.uniqueId || u, nickname: user.nickname || '', avatar: user.avatarThumb || user.avatarMedium || null, bio: user.signature || '',
    verified: !!user.verified, followers, following: N(st.followingCount), likes: N(st.heartCount ?? st.heart), video_count: N(st.videoCount),
    tier: tierOf(followers),
    metrics: {
      sample: vids.length, median_views: med, mean_views: mean, viral_dependency: med ? mean / med : null,
      er: totalViews ? eng / totalViews : null, view_rate: followers && med ? med / followers : null,
      posts_per_week: vids.length ? recent / 4 : null, avg_duration: median(vids.map((v) => v.duration)),
      last_post: vids[0]?.posted_at || null,
      // Fee wajar = median views × CPV pasar. Default soul.md 15B: Rp15–50 per view (⚠️ ASUMSI kalau belum ada data sendiri).
      fair_fee_low: med ? Math.round(med * 15) : null, fair_fee_high: med ? Math.round(med * 50) : null,
    },
    videos: vids,
    fetched_at: now(),
  };
}

// Analisa kreator dari link video (jalur video yang sama dengan Scraper TikTok). followers opsional (isi manual).
export async function creatorFromVideos(urls, followers = null) {
  const list = [...new Set(urls.map(cleanTiktokUrl).filter(Boolean))].slice(0, 12);
  if (list.length < 2) throw new Error('Tempel minimal 2 link video TikTok dari kreator yang sama');
  const vids = [];
  const errors = [];
  for (const [i, url] of list.entries()) {
    if (i) await sleep(1100);
    try {
      const s = await fetchTikwm(url);
      vids.push({ id: s.video_id, title: String(s.caption || '').slice(0, 160), cover: s.thumbnail_url, url, posted_at: s.posted_at, duration: s.duration,
        views: s.views, likes: s.likes, comments: s.comments, shares: s.shares, saves: s.saves, username: s.username });
    } catch (err) { errors.push(`${url}: ${err.message}`); }
  }
  if (!vids.length) throw new Error(errors[0] || 'Video tidak bisa dibaca');
  vids.sort((a, b) => String(b.posted_at || '').localeCompare(String(a.posted_at || '')));
  const views = vids.map((v) => v.views).filter((v) => v != null);
  const total = views.reduce((a, b) => a + b, 0);
  const eng = vids.reduce((a, v) => a + (v.likes || 0) + (v.comments || 0) + (v.shares || 0) + (v.saves || 0), 0);
  const med = median(views);
  const mean = views.length ? total / views.length : null;
  const f = followers == null || followers === '' ? null : Number(followers);
  const users = [...new Set(vids.map((v) => v.username).filter(Boolean))];
  const span = vids.length > 1 && vids[0].posted_at && vids[vids.length - 1].posted_at
    ? (new Date(vids[0].posted_at) - new Date(vids[vids.length - 1].posted_at)) / (7 * 86400e3) : null;
  return {
    username: users[0] || '', nickname: '', avatar: null, bio: '', verified: false, followers: f, following: null, likes: null, video_count: null, tier: tierOf(f),
    source: 'videos', mixed_accounts: users.length > 1 ? users : null, errors,
    metrics: {
      sample: vids.length, median_views: med, mean_views: mean, viral_dependency: med ? mean / med : null, er: total ? eng / total : null,
      view_rate: f && med ? med / f : null, posts_per_week: span ? (vids.length - 1) / span : null, avg_duration: median(vids.map((v) => v.duration)),
      last_post: vids[0]?.posted_at || null, fair_fee_low: med ? Math.round(med * 15) : null, fair_fee_high: med ? Math.round(med * 50) : null,
    },
    videos: vids,
    fetched_at: now(),
  };
}

export async function creatorCached(db, username, fresh = false) {
  const u = cleanUser(username);
  const row = await db.get('SELECT * FROM creator_cache WHERE username = ?', u);
  if (row && !fresh && Date.now() - new Date(row.fetched_at) < CACHE_MS) return { ...JSON.parse(row.data), cached: true };
  const data = await fetchCreator(u);
  await db.run('DELETE FROM creator_cache WHERE username = ?', u);
  await db.run('INSERT INTO creator_cache (username, data, fetched_at) VALUES (?, ?, ?)', u, JSON.stringify(data), data.fetched_at);
  return data;
}

// ---- Tracking konten (link TikTok di partner_posts) ----
export async function refreshPost(db, post) {
  try {
    const s = await fetchTikwm(post.url);
    await db.run(`UPDATE partner_posts SET views = ?, likes = ?, comments = ?, shares = ?, saves = ?, thumbnail = ?, duration = ?, posted_at = ?,
      title = CASE WHEN title = '' OR title IS NULL THEN ? ELSE title END, refreshed_at = ?, error = NULL, updated_at = ? WHERE id = ?`,
    s.views, s.likes, s.comments, s.shares, s.saves, s.thumbnail_url, s.duration, s.posted_at, String(s.caption || '').slice(0, 300), now(), now(), post.id);
  } catch (err) {
    await db.run('UPDATE partner_posts SET error = ?, refreshed_at = ? WHERE id = ?', String(err.message || err).slice(0, 300), now(), post.id);
  }
  return db.get('SELECT * FROM partner_posts WHERE id = ?', post.id);
}

export async function refreshTrackedPosts(db, { limit = 6, delayMs = 1100 } = {}) {
  const before = new Date(Date.now() - TRACK_STALE_MS).toISOString();
  const rows = await db.all('SELECT * FROM partner_posts WHERE tracked = 1 AND (refreshed_at IS NULL OR refreshed_at < ?) ORDER BY COALESCE(refreshed_at, \'\') LIMIT ?', before, limit);
  for (const [i, r] of rows.entries()) {
    if (i) await sleep(delayMs);
    await refreshPost(db, r);
  }
  return rows.length;
}

const sumBy = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

export function partnerToolRoutes(app, db) {
  const allowed = async (req) => new Set((await brandsFor(db, req.user)).map((b) => b.id));
  const ownPartner = async (req, id, team) => {
    const p = await db.get('SELECT * FROM partners WHERE id = ?' + (team ? ' AND team = ?' : ''), Number(id), ...(team ? [team] : []));
    return p && (await allowed(req)).has(p.brand_id) ? p : null;
  };
  const fail = (res, err) => res.status(err.status || 400).json({ error: err.message || String(err) });

  // ---------- Riset kreator ----------
  app.get('/api/creators/lookup', async (req, res) => {
    try { res.json(await creatorCached(db, req.query.u, req.query.fresh === '1')); } catch (err) { fail(res, err); }
  });

  app.post('/api/creators/compare', async (req, res) => {
    const list = [...new Set((Array.isArray(req.body?.usernames) ? req.body.usernames : String(req.body?.usernames || '').split(/[\s,;]+/)).map(cleanUser).filter(Boolean))].slice(0, 10);
    if (!list.length) return res.status(400).json({ error: 'Isi minimal satu username' });
    const out = [];
    for (const [i, u] of list.entries()) {
      try {
        const c = await creatorCached(db, u);
        if (i && !c.cached) await sleep(1100);
        const { videos, ...rest } = c;
        out.push({ ...rest, top_video: [...(videos || [])].sort((a, b) => (b.views || 0) - (a.views || 0))[0] || null });
      } catch (err) { out.push({ username: u, error: err.message }); }
    }
    res.json(out);
  });

  app.post('/api/creators/from-videos', async (req, res) => {
    const urls = Array.isArray(req.body?.urls) ? req.body.urls : String(req.body?.urls || '').split(/[\s,]+/);
    try { res.json(await creatorFromVideos(urls, req.body?.followers)); } catch (err) { fail(res, err); }
  });

  // Isi/perbarui data mitra dari profil TikTok-nya (followers, tier, metrik).
  app.post('/api/partners/:team/:id/enrich', async (req, res) => {
    const p = await ownPartner(req, req.params.id, req.params.team);
    if (!p) return res.status(404).json({ error: 'Mitra tidak ditemukan' });
    const handle = p.handle || p.name;
    try {
      let c;
      try {
        c = await creatorCached(db, handle, true);
      } catch (err) {
        // Profil diblokir sumber: hitung dari link video TikTok mitra ini yang sudah tercatat.
        const urls = (await db.all("SELECT url FROM partner_posts WHERE partner_id = ? AND url LIKE '%tiktok.com%' ORDER BY day DESC LIMIT 12", p.id)).map((x) => x.url);
        if (urls.length < 2) throw err;
        c = { ...(await creatorFromVideos(urls, N(p.followers))), username: p.handle || handle };
      }
      const { videos, ...stats } = c;
      const [row] = await db.run('UPDATE partners SET handle = ?, followers = ?, tier = ?, stats = ?, stats_at = ?, updated_at = ? WHERE id = ? RETURNING *',
        c.username, c.followers, c.tier || p.tier, JSON.stringify({ ...stats, top: [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 3) }), now(), now(), p.id);
      res.json(row);
    } catch (err) { fail(res, err); }
  });

  // Tambah dari riset kreator langsung ke roster (status prospek).
  app.post('/api/partners/:team/from-creator', async (req, res) => {
    const brandId = Number(req.body?.brand_id);
    if (!(await allowed(req)).has(brandId)) return res.status(403).json({ error: 'Pilih brand' });
    try {
      const given = req.body?.creator;
      const c = given && typeof given === 'object' && given.metrics ? { ...given, username: cleanUser(given.username || req.body?.username), videos: Array.isArray(given.videos) ? given.videos.slice(0, 12) : [] }
        : await creatorCached(db, req.body?.username);
      if (!c.username) return res.status(400).json({ error: 'Isi username kreator' });
      const exists = await db.get('SELECT id FROM partners WHERE brand_id = ? AND team = ? AND LOWER(handle) = ?', brandId, req.params.team, c.username.toLowerCase());
      if (exists) return res.status(400).json({ error: `@${c.username} sudah ada di daftar brand ini` });
      const { videos, ...stats } = c;
      const stamp = now();
      const [row] = await db.run(`INSERT INTO partners (brand_id, team, name, handle, platform, tier, followers, status, notes, stats, stats_at, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`, brandId, req.params.team, c.nickname || c.username, c.username,
      req.params.team === 'affiliate' ? 'tiktok_shop' : 'tiktok', c.tier, c.followers, req.params.team === 'kol' ? 'hunting' : 'prospek', c.bio ? `Bio: ${c.bio}` : '',
      JSON.stringify({ ...stats, top: [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 3) }), stamp, req.user.username, stamp, stamp);
      res.status(201).json(row);
    } catch (err) { fail(res, err); }
  });

  // ---------- Tracking konten ----------
  app.post('/api/partners/:team/posts/:postId/refresh', async (req, res) => {
    const post = await db.get('SELECT * FROM partner_posts WHERE id = ?', Number(req.params.postId));
    if (!post || !(await ownPartner(req, post.partner_id, req.params.team))) return res.status(404).json({ error: 'Konten tidak ditemukan' });
    if (!cleanTiktokUrl(post.url)) return res.status(400).json({ error: 'Pemantauan otomatis baru untuk link TikTok' });
    await db.run('UPDATE partner_posts SET tracked = 1 WHERE id = ?', post.id);
    res.json(await refreshPost(db, post));
  });

  // ---------- Campaign & deliverable KOL ----------
  async function ownCampaign(req, id) {
    const c = await db.get('SELECT * FROM kol_campaigns WHERE id = ?', Number(id));
    return c && (await allowed(req)).has(c.brand_id) ? c : null;
  }
  async function campaignDetail(c) {
    const items = await db.all(`SELECT d.*, p.name AS partner_name, p.handle, p.platform, p.followers,
        pp.views, pp.likes, pp.comments, pp.shares, pp.saves, pp.clicks, pp.orders, pp.revenue, pp.thumbnail, pp.refreshed_at, pp.error AS track_error
      FROM kol_deliverables d JOIN partners p ON p.id = d.partner_id LEFT JOIN partner_posts pp ON pp.id = d.post_id
      WHERE d.campaign_id = ? ORDER BY COALESCE(d.due_day, ''), d.id`, c.id);
    const live = items.filter((d) => d.status !== 'batal');
    const fee = sumBy(live, 'fee');
    const views = sumBy(live, 'views');
    const eng = sumBy(live, 'likes') + sumBy(live, 'comments') + sumBy(live, 'shares') + sumBy(live, 'saves');
    const orders = sumBy(live, 'orders');
    const revenue = sumBy(live, 'revenue');
    const today = new Date().toISOString().slice(0, 10);
    const byStatus = {};
    for (const d of items) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    return {
      ...c,
      deliverables: items,
      summary: {
        kol: new Set(live.map((d) => d.partner_id)).size, deliverables: live.length, posted: live.filter((d) => ['tayang', 'dibayar'].includes(d.status)).length,
        late: live.filter((d) => d.due_day && d.due_day < today && !['tayang', 'dibayar'].includes(d.status)).length,
        fee, budget_left: c.budget != null ? Number(c.budget) - fee : null, views, er: views ? eng / views : null,
        cpv: views ? fee / views : null, cpm: views ? (fee / views) * 1000 : null, orders, revenue, roas: fee ? revenue / fee : null,
        views_progress: c.target_views ? views / Number(c.target_views) : null, orders_progress: c.target_orders ? orders / Number(c.target_orders) : null,
        byStatus,
      },
    };
  }
  const cleanCampaign = (b, c = {}) => ({
    name: String(b.name ?? c.name ?? '').trim().slice(0, 120),
    objective: String(b.objective ?? c.objective ?? '').slice(0, 200),
    budget: b.budget !== undefined ? parseNum(b.budget) : N(c.budget),
    start_day: b.start_day !== undefined ? parseDay(b.start_day) : c.start_day || null,
    end_day: b.end_day !== undefined ? parseDay(b.end_day) : c.end_day || null,
    target_views: b.target_views !== undefined ? parseNum(b.target_views) : N(c.target_views),
    target_orders: b.target_orders !== undefined ? parseNum(b.target_orders) : N(c.target_orders),
    brief: String(b.brief ?? c.brief ?? '').slice(0, 8000),
    status: CAMPAIGN_STATUS.includes(b.status) ? b.status : c.status || 'rencana',
  });

  app.get('/api/kol/campaigns', async (req, res) => {
    const ids = [...(await allowed(req))];
    if (!ids.length) return res.json([]);
    const rows = await db.all(`SELECT * FROM kol_campaigns WHERE brand_id IN (${ids.map(() => '?').join(',')}) ORDER BY COALESCE(start_day, created_at) DESC`, ...ids);
    res.json(await Promise.all(rows.map(async (c) => { const d = await campaignDetail(c); delete d.deliverables; return d; })));
  });

  app.post('/api/kol/campaigns', async (req, res) => {
    const brandId = Number(req.body?.brand_id);
    if (!(await allowed(req)).has(brandId)) return res.status(403).json({ error: 'Pilih brand' });
    const v = cleanCampaign(req.body || {});
    if (!v.name) return res.status(400).json({ error: 'Nama campaign wajib diisi' });
    const stamp = now();
    const [row] = await db.run(`INSERT INTO kol_campaigns (brand_id, name, objective, budget, start_day, end_day, target_views, target_orders, brief, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`, brandId, v.name, v.objective, v.budget, v.start_day, v.end_day, v.target_views, v.target_orders, v.brief, v.status, req.user.username, stamp, stamp);
    res.status(201).json(row);
  });

  app.get('/api/kol/campaigns/:id', async (req, res) => {
    const c = await ownCampaign(req, req.params.id);
    if (!c) return res.status(404).json({ error: 'Campaign tidak ditemukan' });
    res.json(await campaignDetail(c));
  });

  app.patch('/api/kol/campaigns/:id', async (req, res) => {
    const c = await ownCampaign(req, req.params.id);
    if (!c) return res.status(404).json({ error: 'Campaign tidak ditemukan' });
    const v = cleanCampaign(req.body || {}, c);
    await db.run(`UPDATE kol_campaigns SET name = ?, objective = ?, budget = ?, start_day = ?, end_day = ?, target_views = ?, target_orders = ?, brief = ?, status = ?, updated_at = ? WHERE id = ?`,
      v.name || c.name, v.objective, v.budget, v.start_day, v.end_day, v.target_views, v.target_orders, v.brief, v.status, now(), c.id);
    res.json(await campaignDetail(await ownCampaign(req, c.id)));
  });

  app.delete('/api/kol/campaigns/:id', async (req, res) => {
    const c = await ownCampaign(req, req.params.id);
    if (!c) return res.status(404).json({ error: 'Campaign tidak ditemukan' });
    const posts = (await db.all('SELECT post_id FROM kol_deliverables WHERE campaign_id = ? AND post_id IS NOT NULL', c.id)).map((r) => r.post_id);
    for (const id of posts) await db.run("DELETE FROM partner_posts WHERE id = ? AND source = 'campaign'", id);
    await db.run('DELETE FROM kol_deliverables WHERE campaign_id = ?', c.id);
    await db.run('DELETE FROM kol_campaigns WHERE id = ?', c.id);
    res.status(204).end();
  });

  // Deliverable dengan link konten otomatis jadi "hasil konten" KOL (dipantau tiap 6 jam kalau link TikTok).
  async function syncDeliverablePost(d, campaign) {
    if (!d.url) {
      if (d.post_id) {
        await db.run("DELETE FROM partner_posts WHERE id = ? AND source = 'campaign'", d.post_id);
        await db.run('UPDATE kol_deliverables SET post_id = NULL WHERE id = ?', d.id);
      }
      return;
    }
    const tracked = cleanTiktokUrl(d.url) ? 1 : 0;
    let postId = d.post_id;
    const existing = postId && (await db.get('SELECT * FROM partner_posts WHERE id = ?', postId));
    if (existing) {
      const changed = existing.url !== d.url;
      await db.run('UPDATE partner_posts SET url = ?, fee = ?, tracked = ?, updated_at = ? WHERE id = ?', d.url, d.fee, tracked, now(), postId);
      if (changed) await db.run('UPDATE partner_posts SET refreshed_at = NULL, error = NULL WHERE id = ?', postId);
      if (changed && tracked) await refreshPost(db, { id: postId, url: d.url });
    } else {
      const [p] = await db.run(`INSERT INTO partner_posts (partner_id, day, title, url, fee, tracked, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'campaign', ?) RETURNING *`, d.partner_id, d.due_day || new Date().toISOString().slice(0, 10), `${campaign.name} · ${d.type}`, d.url, d.fee, tracked, now());
      postId = p.id;
      await db.run('UPDATE kol_deliverables SET post_id = ? WHERE id = ?', postId, d.id);
      if (tracked) await refreshPost(db, p);
    }
    // Tanggal hasil = tanggal tayang asli kalau sudah terbaca dari TikTok.
    await db.run("UPDATE partner_posts SET day = COALESCE(SUBSTR(posted_at, 1, 10), day) WHERE id = ?", postId);
  }

  const cleanDeliverable = (b, d = {}) => ({
    type: String(b.type ?? d.type ?? 'video').slice(0, 40),
    fee: b.fee !== undefined ? parseNum(b.fee) : N(d.fee),
    due_day: b.due_day !== undefined ? parseDay(b.due_day) : d.due_day || null,
    status: DELIVERABLE_STATUS.includes(b.status) ? b.status : d.status || 'brief',
    url: b.url !== undefined ? String(b.url).trim().slice(0, 500) : d.url || '',
    notes: String(b.notes ?? d.notes ?? '').slice(0, 2000),
  });

  app.post('/api/kol/campaigns/:id/deliverables', async (req, res) => {
    const c = await ownCampaign(req, req.params.id);
    if (!c) return res.status(404).json({ error: 'Campaign tidak ditemukan' });
    const p = await ownPartner(req, req.body?.partner_id, 'kol');
    if (!p) return res.status(400).json({ error: 'Pilih KOL' });
    const v = cleanDeliverable(req.body || {});
    const fee = v.fee ?? N(p.rate);
    const stamp = now();
    const [d] = await db.run(`INSERT INTO kol_deliverables (campaign_id, partner_id, type, fee, due_day, status, url, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`, c.id, p.id, v.type, fee, v.due_day, v.status, v.url, v.notes, stamp, stamp);
    if (['hunting', 'prospek'].includes(p.status)) await db.run("UPDATE partners SET status = 'negosiasi', updated_at = ? WHERE id = ?", stamp, p.id);
    await syncDeliverablePost(d, c);
    res.status(201).json(d);
  });

  app.patch('/api/kol/deliverables/:id', async (req, res) => {
    const d = await db.get('SELECT * FROM kol_deliverables WHERE id = ?', Number(req.params.id));
    const c = d && (await ownCampaign(req, d.campaign_id));
    if (!c) return res.status(404).json({ error: 'Deliverable tidak ditemukan' });
    const v = cleanDeliverable(req.body || {}, d);
    const [row] = await db.run('UPDATE kol_deliverables SET type = ?, fee = ?, due_day = ?, status = ?, url = ?, notes = ?, updated_at = ? WHERE id = ? RETURNING *',
      v.type, v.fee, v.due_day, v.status, v.url, v.notes, now(), d.id);
    await syncDeliverablePost(row, c);
    res.json(row);
  });

  app.delete('/api/kol/deliverables/:id', async (req, res) => {
    const d = await db.get('SELECT * FROM kol_deliverables WHERE id = ?', Number(req.params.id));
    const c = d && (await ownCampaign(req, d.campaign_id));
    if (!c) return res.status(404).json({ error: 'Deliverable tidak ditemukan' });
    if (d.post_id) await db.run("DELETE FROM partner_posts WHERE id = ? AND source = 'campaign'", d.post_id);
    await db.run('DELETE FROM kol_deliverables WHERE id = ?', d.id);
    res.status(204).end();
  });

  // Jadwal: semua deliverable lintas campaign dalam rentang tanggal.
  app.get('/api/kol/schedule', async (req, res) => {
    const ids = [...(await allowed(req))];
    if (!ids.length) return res.json([]);
    const from = parseDay(req.query.from) || '0000-01-01';
    const to = parseDay(req.query.to) || '9999-12-31';
    res.json(await db.all(`SELECT d.*, c.name AS campaign, c.brand_id, p.name AS partner_name, p.handle FROM kol_deliverables d
      JOIN kol_campaigns c ON c.id = d.campaign_id JOIN partners p ON p.id = d.partner_id
      WHERE c.brand_id IN (${ids.map(() => '?').join(',')}) AND d.due_day >= ? AND d.due_day <= ? ORDER BY d.due_day`, ...ids, from, to));
  });

  // ---------- Livestream (affiliate & KOL) ----------
  app.get('/api/partners/:team/live', async (req, res) => {
    const ids = [...(await allowed(req))];
    if (!ids.length) return res.json([]);
    res.json(await db.all(`SELECT l.*, p.name AS partner_name, p.handle, p.brand_id FROM live_sessions l JOIN partners p ON p.id = l.partner_id
      WHERE p.team = ? AND p.brand_id IN (${ids.map(() => '?').join(',')}) ORDER BY l.day DESC, l.id DESC LIMIT 500`, req.params.team, ...ids));
  });

  app.post('/api/partners/:team/live', async (req, res) => {
    const b = req.body || {};
    const p = await ownPartner(req, b.partner_id, req.params.team);
    if (!p) return res.status(404).json({ error: 'Pilih kreator' });
    const day = parseDay(b.day);
    if (!day) return res.status(400).json({ error: 'Tanggal tidak valid' });
    const int = (v) => { const x = parseNum(v); return x == null ? null : Math.round(x); };
    const [row] = await db.run(`INSERT INTO live_sessions (partner_id, day, duration_min, views, peak_viewers, orders, revenue, commission, products, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`, p.id, day, int(b.duration_min), int(b.views), int(b.peak_viewers), int(b.orders),
    parseNum(b.revenue), parseNum(b.commission), String(b.products || '').slice(0, 500), String(b.notes || '').slice(0, 1000), now());
    res.status(201).json(row);
  });

  app.delete('/api/partners/:team/live/:liveId', async (req, res) => {
    const l = await db.get('SELECT * FROM live_sessions WHERE id = ?', Number(req.params.liveId));
    if (!l || !(await ownPartner(req, l.partner_id, req.params.team))) return res.status(404).json({ error: 'Sesi tidak ditemukan' });
    await db.run('DELETE FROM live_sessions WHERE id = ?', l.id);
    res.status(204).end();
  });
}
