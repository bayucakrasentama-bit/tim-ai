import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { localStorage } from '../src/storage.js';

// Nyalakan app di port acak, tanpa password (user = owner).
export async function startApp(opts = {}) {
  const db = await openDb(':memory:');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'timai-test-'));
  const app = createApp({ db, connectors: {}, storage: localStorage(dir), ...opts });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body, headers = {}) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* bukan JSON */ }
    return { status: r.status, body: json };
  };
  return { db, server, base, call, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}
