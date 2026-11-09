import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

test('katalog: seed 11 produk dari riset kompetitor', async () => {
  const r = await t.call('GET', '/api/store/products');
  assert.equal(r.status, 200);
  assert.equal(r.body.products.length, 11);
  const slugs = r.body.products.map((p) => p.slug);
  for (const s of ['photo-gen', 'voice-gen', 'adspro-lab', 'rahyang-influencer']) {
    assert.ok(slugs.includes(s), `harus ada ${s}`);
  }
  // benefit terparse jadi array + harga terformat angka
  const photo = r.body.products.find((p) => p.slug === 'photo-gen');
  assert.equal(photo.price, 69000);
  assert.equal(photo.price_old, 289000);
  assert.ok(Array.isArray(photo.benefits) && photo.benefits.length > 0);
});

test('detail per slug', async () => {
  const r = await t.call('GET', '/api/store/products/voice-gen');
  assert.equal(r.status, 200);
  assert.equal(r.body.product.slug, 'voice-gen');
  assert.ok(r.body.product.description.includes('kloning') || r.body.product.description.includes('Voice'));

  const nf = await t.call('GET', '/api/store/products/nggak-ada');
  assert.equal(nf.status, 404);
});

test('admin: katalog lengkap termasuk draft', async () => {
  const r = await t.call('GET', '/api/store/admin/products');
  assert.equal(r.status, 200);
  assert.ok(r.body.products.length >= 11);
});
