import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApp } from './helpers.js';

// Penjaga bug kelas "api('GET', url)" — helper api() di public/app.js ber-signature
// api(url, opts). Salah urutan = fetch ke halaman literal "GET", respons kosong,
// TANPA error. Bug ini pernah membuat Foto AI & Toko Digital kosong di produksi.

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SKIP_DIRS = ['vendor', 'dist', 'studio'];

function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.includes(e.name)) out.push(...sourceFiles(path.join(dir, e.name)));
    } else if (e.name.endsWith('.js')) out.push(path.join(dir, e.name));
  }
  return out;
}

test('frontend: tidak ada api() dengan signature salah api("METHOD", url)', () => {
  const bad = [];
  for (const f of sourceFiles(PUB)) {
    const src = fs.readFileSync(f, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/\bapi\(\s*['"](GET|POST|PATCH|DELETE|PUT)['"]/.test(line)) {
        bad.push(`${path.relative(PUB, f)}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(bad, [], `panggilan api() salah signature ditemukan di: ${bad.join(', ')}`);
});

let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

test('kontrak respons sesuai yang dibaca frontend (foto-ai)', async () => {
  const r = await t.call('GET', '/api/foto-ai/tools');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.tools) && r.body.tools.length > 0, 'res.tools harus array berisi');
  for (const tool of r.body.tools) {
    assert.ok(tool.id, 'setiap tool punya id');
  }
});

test('kontrak respons sesuai yang dibaca frontend (katalog)', async () => {
  const r = await t.call('GET', '/api/katalog/products');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.products) && r.body.products.length > 0, 'j.products harus array berisi');

  const admin = await t.call('GET', '/api/katalog/admin/products');
  assert.equal(admin.status, 200);
  assert.ok(Array.isArray(admin.body.products) && admin.body.products.length > 0, 'admin j.products harus array berisi');
});

test('mutasi katalog dengan bentuk yang dipakai store.js', async () => {
  const list = await t.call('GET', '/api/katalog/admin/products');
  const p = list.body.products[0];

  const patch = await t.call('PATCH', `/api/katalog/admin/products/${p.id}`, { published: !p.published });
  assert.equal(patch.status, 200);

  const del = await t.call('DELETE', `/api/katalog/admin/products/${p.id}`);
  assert.equal(del.status, 200);

  const after = await t.call('GET', '/api/katalog/admin/products');
  assert.ok(!after.body.products.some((x) => x.id === p.id), 'produk terhapus');
});
