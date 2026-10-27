// "Cek token": memanggil API resmi tiap platform untuk memastikan kredensial benar-benar bisa dipakai.
// Hasil: { ok, account, details[], problems[{ message, fix }], credentials? }
import { GRAPH_VERSION, bases, readJson } from './connectors/http.js';
import { googleAccessToken } from './connectors/youtube.js';
import { tiktokAccessToken } from './connectors/tiktok.js';

const result = () => ({ ok: true, account: null, details: [], problems: [], credentials: null });
const problem = (r, message, fix) => {
  r.ok = false;
  r.problems.push({ message, fix });
};
const fmtDate = (unix) => new Date(unix * 1000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

async function getJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && !body.error, status: res.status, body };
}

// ---------- Meta (Facebook & Instagram) ----------
const graph = () => `${bases.graph()}/${GRAPH_VERSION}`;
const q = (params) => new URLSearchParams(params).toString();

function metaFix(err) {
  if (err?.code === 190) return 'Token salah salin, kedaluwarsa, atau dicabut. Ulangi langkah "Ambil token" di panduan untuk dapat Page token baru.';
  if (err?.code === 10 || err?.code === 200) return 'Izinnya kurang. Ulangi langkah Graph API Explorer dan centang semua izin di panduan.';
  if (err?.code === 100) return 'ID-nya salah atau token ini nggak punya akses ke ID itu. Pakai tombol "Ambil Page token" biar ID & token-nya pasti cocok.';
  return 'Ulangi langkah di panduan, lalu cek lagi.';
}

// debug_token memberi daftar izin & masa berlaku. Tidak selalu diizinkan untuk Page token, jadi opsional.
async function metaScopes(token, r) {
  const { ok, body } = await getJson(`${graph()}/debug_token?${q({ input_token: token, access_token: token })}`);
  if (!ok || !body.data) {
    r.details.push('Daftar izin tidak bisa dibaca otomatis (normal untuk sebagian token).');
    return null;
  }
  const d = body.data;
  if (d.is_valid === false) problem(r, 'Token tidak valid lagi.', metaFix({ code: 190 }));
  if (d.type) r.details.push(`Jenis token: ${d.type === 'PAGE' ? 'Page token' : d.type === 'USER' ? 'User token' : d.type}`);
  if (d.expires_at === 0) r.details.push('Masa berlaku: tidak kedaluwarsa');
  else if (d.expires_at) r.details.push(`Berlaku sampai: ${fmtDate(d.expires_at)}`);
  return { scopes: d.scopes || [], type: d.type };
}

function requireScopes(r, scopes, needed) {
  if (!scopes) return;
  const missing = needed.filter((s) => !scopes.includes(s));
  if (missing.length) {
    problem(r, `Izin yang kurang: ${missing.join(', ')}`, 'Buka Graph API Explorer lagi, centang izin itu, klik Generate Access Token, lalu ambil Page token ulang.');
  } else {
    r.details.push(`Izin lengkap: ${needed.join(', ')}`);
  }
}

async function checkFacebook(c) {
  const r = result();
  if (!c.pageId || !c.accessToken) return (problem(r, 'Page ID dan Page Access Token wajib diisi.', 'Ikuti panduan di atas.'), r);
  const me = await getJson(`${graph()}/me?${q({ fields: 'id,name', access_token: c.accessToken })}`);
  if (!me.ok) return (problem(r, `Facebook menolak token: ${me.body.error?.message || `HTTP ${me.status}`}`, metaFix(me.body.error)), r);
  const info = await metaScopes(c.accessToken, r);
  if (me.body.id !== String(c.pageId)) {
    problem(
      r,
      info?.type === 'USER' || !info
        ? `Token ini milik "${me.body.name}" (ID ${me.body.id}), bukan Page ${c.pageId}. Kemungkinan ini User token, bukan Page token.`
        : `Token ini untuk Page "${me.body.name}" (ID ${me.body.id}), bukan Page ID yang diisi (${c.pageId}).`,
      'Pakai tombol "Ambil Page token" di panduan, lalu pilih Page yang benar.',
    );
  } else {
    r.account = me.body.name;
  }
  requireScopes(r, info?.scopes, ['pages_manage_posts', 'pages_read_engagement']);
  if (info?.scopes && !info.scopes.includes('publish_video')) r.details.push('Belum ada izin publish_video: posting video ke Page mungkin ditolak.');
  return r;
}

async function checkInstagram(c) {
  const r = result();
  if (!c.igUserId || !c.accessToken) return (problem(r, 'Instagram Business Account ID dan token wajib diisi.', 'Ikuti panduan di atas.'), r);
  const ig = await getJson(`${graph()}/${encodeURIComponent(c.igUserId)}?${q({ fields: 'id,username,name', access_token: c.accessToken })}`);
  if (!ig.ok) return (problem(r, `Instagram menolak: ${ig.body.error?.message || `HTTP ${ig.status}`}`, metaFix(ig.body.error)), r);
  r.account = `@${ig.body.username}`;
  const info = await metaScopes(c.accessToken, r);
  requireScopes(r, info?.scopes, ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement']);
  const limit = await getJson(`${graph()}/${encodeURIComponent(c.igUserId)}/content_publishing_limit?${q({ fields: 'quota_usage,config', access_token: c.accessToken })}`);
  const row = limit.body.data?.[0];
  if (limit.ok && row) {
    r.details.push(`Kuota posting: ${row.quota_usage ?? 0} dari ${row.config?.quota_total ?? 100} post per 24 jam terpakai`);
  } else if (!limit.ok) {
    problem(r, `Belum bisa publish: ${limit.body.error?.message || `HTTP ${limit.status}`}`, metaFix(limit.body.error));
  }
  return r;
}

// ---------- YouTube ----------
async function checkYoutube(c) {
  const r = result();
  let token;
  try {
    token = await googleAccessToken(c);
  } catch (err) {
    const msg = String(err.message);
    problem(r, msg, /invalid_grant|expired|revoked/i.test(msg)
      ? 'Refresh token sudah mati. Penyebab paling sering: consent screen masih "Testing" (token mati 7 hari), akses dicabut, atau token tidak dipakai 6 bulan. Pastikan status "In production", lalu klik "Hubungkan dengan Google" lagi.'
      : /invalid_client|unauthorized_client/i.test(msg)
        ? 'Client ID/Secret salah atau bukan pasangan dari refresh token ini. Salin ulang dari Google Cloud Console, lalu klik "Hubungkan" lagi.'
        : 'Cek lagi Client ID, Client Secret, dan refresh token-nya.');
    return r;
  }
  r.details.push('Refresh token valid (access token baru berhasil dibuat).');
  const info = await getJson(`${bases.googleOAuth()}/tokeninfo?${q({ access_token: token })}`);
  const scopes = String(info.body.scope || '').split(' ');
  const has = (s) => scopes.includes(`https://www.googleapis.com/auth/${s}`);
  if (!(has('youtube.upload') || has('youtube') || has('youtube.force-ssl'))) {
    problem(r, 'Izin upload YouTube (youtube.upload) belum diberikan.', 'Klik "Hubungkan dengan Google" lagi dan centang semua izin yang diminta.');
  } else {
    r.details.push('Izin upload video: ada');
  }
  if (has('youtube.readonly') || has('youtube') || has('youtube.force-ssl')) {
    const ch = await getJson(`${bases.youtubeUpload()}/youtube/v3/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${token}` } });
    const item = ch.body.items?.[0];
    if (item) r.account = item.snippet.title;
    else if (ch.ok) problem(r, 'Akun Google ini belum punya channel YouTube.', 'Buat channel dulu di youtube.com, lalu cek lagi.');
    else r.details.push(`Nama channel tidak bisa dibaca: ${ch.body.error?.message || `HTTP ${ch.status}`}`);
  } else {
    r.details.push('Nama channel tidak bisa ditampilkan (izin youtube.readonly tidak ada). Upload tetap bisa.');
  }
  return r;
}

// ---------- TikTok ----------
async function checkTiktok(c) {
  const r = result();
  let token;
  try {
    token = await tiktokAccessToken(c);
  } catch (err) {
    problem(r, String(err.message), 'Refresh token TikTok berlaku 365 hari dan bisa dicabut. Klik "Hubungkan dengan TikTok" lagi. Kalau error soal client, salin ulang Client key & secret.');
    return r;
  }
  r.credentials = token.credentials;
  if (token.scope != null) {
    if (!token.scope.split(',').includes('video.publish')) {
      problem(r, `Izin video.publish belum diberikan (izin sekarang: ${token.scope || 'kosong'}).`, 'Tambahkan scope video.publish di app TikTok, lalu klik "Hubungkan dengan TikTok" lagi.');
    } else {
      r.details.push('Izin video.publish: ada');
    }
  }
  const res = await fetch(`${bases.tiktok()}/v2/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
  });
  const body = await res.json().catch(() => ({}));
  if (body.error?.code && body.error.code !== 'ok') {
    const fixes = {
      access_token_invalid: 'Token tidak valid. Klik "Hubungkan dengan TikTok" lagi.',
      scope_not_authorized: 'Izin video.publish belum diberikan. Aktifkan Content Posting API + Direct Post, lalu hubungkan lagi.',
      spam_risk_too_many_posts: 'Batas posting harian akun ini sudah tercapai. Coba lagi besok.',
      spam_risk_user_banned_from_posting: 'Akun ini sedang diblokir TikTok untuk posting.',
      reached_active_user_cap: 'Kuota harian app kamu tercapai. Coba lagi besok.',
    };
    problem(r, `TikTok: ${body.error.message || body.error.code}`, fixes[body.error.code] || 'Coba lagi beberapa saat lagi.');
    return r;
  }
  const d = body.data || {};
  r.account = d.creator_nickname ? `${d.creator_nickname} (@${d.creator_username})` : null;
  if (d.privacy_level_options) {
    r.details.push(`Pilihan privasi yang tersedia: ${d.privacy_level_options.join(', ')}`);
    const wanted = c.privacy || 'SELF_ONLY';
    if (!d.privacy_level_options.includes(wanted)) {
      problem(r, `Privasi "${wanted}" tidak tersedia untuk akun ini.`, `Isi kolom Privasi dengan salah satu: ${d.privacy_level_options.join(', ')}.`);
    }
  }
  if (d.max_video_post_duration_sec) r.details.push(`Durasi video maksimal: ${d.max_video_post_duration_sec} detik`);
  r.details.push('Ingat: sebelum app lolos audit TikTok, semua postingan otomatis private (SELF_ONLY).');
  return r;
}

const checkers = {
  simulasi: async () => ({ ...result(), account: 'Akun simulasi', details: ['Tidak perlu token.'] }),
  facebook: checkFacebook,
  instagram: checkInstagram,
  youtube: checkYoutube,
  tiktok: checkTiktok,
};

export async function checkCredentials(platform, credentials) {
  const fn = checkers[platform];
  if (!fn) return { ...result(), ok: false, problems: [{ message: 'Platform tidak dikenal', fix: '' }] };
  try {
    return await fn(credentials || {});
  } catch (err) {
    const r = result();
    problem(r, `Gagal menghubungi server platform: ${err.message}`, 'Cek koneksi internet, lalu coba lagi.');
    return r;
  }
}
