import fs from 'node:fs';
import { now } from './db.js';
import { fetchToTemp } from './storage.js';
import { syncContentWithPost } from './planner.js';

// Post yang macet di status "publishing" lebih lama dari ini dianggap terputus dan dikirim ulang.
const STALE_MS = 15 * 60 * 1000;

// Mengirim satu post ke semua akun tujuannya yang belum sukses, lalu menyimpan hasil per akun.
// Pemanggil harus sudah mengklaim post-nya (status 'publishing').
export async function publishPost(db, connectors, postId) {
  const post = await db.get('SELECT * FROM posts WHERE id = ?', postId);
  if (!post) return;

  const captions = JSON.parse(post.captions || '{}');
  const targets = await db.all(`
    SELECT t.id, t.account_id, a.platform, a.credentials
    FROM post_targets t JOIN accounts a ON a.id = t.account_id
    WHERE t.post_id = ? AND t.status != 'success'
  `, postId);

  let mediaPath = post.media_path;
  let tempFile = null;
  try {
    if (!mediaPath && post.media_url) mediaPath = tempFile = await fetchToTemp(post.media_url);
  } catch (err) {
    for (const t of targets) {
      await db.run("UPDATE post_targets SET status = 'failed', error = ? WHERE id = ?", String(err.message || err), t.id);
    }
    targets.length = 0;
  }

  await Promise.all(targets.map(async (t) => {
    await db.run("UPDATE post_targets SET status = 'publishing', error = NULL WHERE id = ?", t.id);
    try {
      const connector = connectors[t.platform];
      if (!connector) throw new Error(`Platform tidak dikenal: ${t.platform}`);
      const result = await connector.publish({
        caption: captions[t.platform]?.trim() ? captions[t.platform] : post.caption,
        title: post.title,
        mediaType: post.media_type,
        mediaPath,
        mediaName: post.media_name,
        mediaUrl: post.media_url,
        credentials: JSON.parse(t.credentials || '{}'),
      });
      await db.run(`
        UPDATE post_targets SET status = 'success', remote_id = ?, remote_url = ?, published_at = ? WHERE id = ?
      `, result.remoteId ?? null, result.remoteUrl ?? null, now(), t.id);
      // Sebagian platform (TikTok) memutar refresh token; simpan yang baru supaya akun tetap tersambung.
      if (result.credentials) {
        await db.run('UPDATE accounts SET credentials = ? WHERE id = ?', JSON.stringify(result.credentials), t.account_id);
      }
    } catch (err) {
      await db.run("UPDATE post_targets SET status = 'failed', error = ? WHERE id = ?", String(err.message || err), t.id);
    }
  }));
  if (tempFile) fs.rm(tempFile, { force: true }, () => {});

  const rows = await db.all('SELECT status FROM post_targets WHERE post_id = ?', postId);
  const ok = rows.filter((r) => r.status === 'success').length;
  const status = ok === rows.length ? 'done' : ok === 0 ? 'failed' : 'partial';
  await db.run('UPDATE posts SET status = ? WHERE id = ?', status, postId);
  await syncContentWithPost(db, postId); // kartu planner ikut jadi "Tayang"
  return status;
}

// Ubah status post jadi 'publishing' secara atomik, supaya dua pemanggil
// (mis. dua panggilan cron yang tumpang tindih) tidak mengirim post yang sama.
export async function claimPost(db, postId, fromStatuses) {
  const marks = fromStatuses.map(() => '?').join(', ');
  const rows = await db.run(
    `UPDATE posts SET status = 'publishing', started_at = ? WHERE id = ? AND status IN (${marks}) RETURNING id`,
    now(), postId, ...fromStatuses,
  );
  return rows.length > 0;
}

// Kirim semua post terjadwal yang waktunya sudah lewat (plus yang macet).
// Mengembalikan id yang diklaim dan promise yang selesai saat semuanya terkirim.
export async function runDue(db, connectors, { staleMs = STALE_MS } = {}) {
  const stamp = now();
  const staleBefore = new Date(Date.now() - staleMs).toISOString();
  const due = await db.all(`
    SELECT id, status FROM posts
    WHERE (status = 'scheduled' AND scheduled_at <= ?)
       OR (status = 'publishing' AND (started_at IS NULL OR started_at <= ?))
  `, stamp, staleBefore);
  const claimed = [];
  for (const p of due) {
    if (await claimPost(db, p.id, [p.status])) claimed.push(p.id);
  }
  const done = Promise.all(claimed.map((id) => publishPost(db, connectors, id).catch(() => {})));
  return { claimed, done };
}

// Untuk jalan lokal: cek jadwal tiap beberapa detik.
export function startScheduler(db, connectors, intervalMs = 15000) {
  let busy = false;
  const tick = async (opts) => {
    if (busy) return;
    busy = true;
    try {
      await (await runDue(db, connectors, opts)).done;
    } finally {
      busy = false;
    }
  };
  // Saat app baru nyala, post yang terputus di tengah jalan langsung dilanjutkan.
  tick({ staleMs: 0 });
  const timer = setInterval(() => tick(), intervalMs);
  return { stop: () => clearInterval(timer), tick };
}
