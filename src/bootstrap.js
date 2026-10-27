// Merakit app dari environment variable. Dipakai bareng oleh server lokal dan fungsi Vercel.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { connectors } from './connectors/index.js';
import { createApp } from './app.js';
import { localStorage, blobStorage } from './storage.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function bootstrap(env = process.env) {
  const onVercel = !!env.VERCEL;
  const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL;
  const dataDir = env.SIARIN_DATA_DIR || path.join(root, 'data');

  const problems = [];
  if (onVercel && !databaseUrl) problems.push('DATABASE_URL belum di-set (sambungkan Neon ke project Vercel)');
  if (onVercel && !env.BLOB_READ_WRITE_TOKEN) problems.push('BLOB_READ_WRITE_TOKEN belum di-set (sambungkan Vercel Blob)');
  if (onVercel && !env.APP_PASSWORD) problems.push('APP_PASSWORD belum di-set');
  if (problems.length) {
    return { app: createApp({ setupError: `TIM-AI belum siap: ${problems.join('; ')}` }) };
  }

  const db = await openDb(databaseUrl || path.join(dataDir, 'siarin.db'));
  const storage = env.BLOB_READ_WRITE_TOKEN ? blobStorage() : localStorage(path.join(dataDir, 'uploads'));
  const app = createApp({
    db,
    connectors,
    storage,
    username: (env.APP_USERNAME || 'admin').trim(),
    password: env.APP_PASSWORD || '',
    cronSecret: env.CRON_SECRET || '',
  });
  return { app, db };
}
