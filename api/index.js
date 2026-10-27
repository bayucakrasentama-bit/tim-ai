// Fungsi serverless Vercel: semua /api/* diarahkan ke sini (lihat vercel.json).
import { bootstrap } from '../src/bootstrap.js';

let ready;

export default async function handler(req, res) {
  ready ??= bootstrap().catch((err) => {
    ready = undefined; // coba lagi di request berikutnya
    throw err;
  });
  const { app } = await ready;
  return app(req, res);
}
