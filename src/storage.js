// Tempat menyimpan gambar/video.
// - local: file disimpan ke disk (jalan di Mac).
// - blob: file di-upload langsung dari browser ke Vercel Blob (jalan di Vercel).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export function localStorage(uploadDir) {
  fs.mkdirSync(uploadDir, { recursive: true });
  return {
    kind: 'local',
    uploadDir,
    async remove(post) {
      if (post.media_path) await fs.promises.rm(post.media_path, { force: true });
    },
  };
}

export function blobStorage() {
  return {
    kind: 'blob',
    // Hanya terima URL dari Blob store milik sendiri.
    isOwnUrl(url) {
      try {
        const u = new URL(url);
        return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com');
      } catch {
        return false;
      }
    },
    async remove(post) {
      if (!post.media_url) return;
      const { del } = await import('@vercel/blob');
      await del(post.media_url).catch(() => {});
    },
  };
}

// Konektor butuh file lokal; media yang ada di internet diunduh dulu ke folder sementara.
export async function fetchToTemp(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengambil media (HTTP ${res.status})`);
  const file = path.join(os.tmpdir(), `siarin-${crypto.randomBytes(6).toString('hex')}${path.extname(new URL(url).pathname)}`);
  await fs.promises.writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}
