import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp } from './helpers.js';
import { setAskForTests } from '../src/factory/routes.js';

const fixture = () => JSON.parse(fs.readFileSync(new URL('./fixtures/zestmag-profile.json', import.meta.url), 'utf8'));
let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

const mk = (name = 'Madu Olymax') => t.call('POST', '/api/factory/products', { name, category: 'x', official_claim: 'membantu memelihara daya tahan tubuh' });

test('buat produk: slug + draft, nama sama -> 409', async () => {
  const r = await mk();
  assert.equal(r.status, 200);
  assert.equal(r.body.product.slug, 'olymax');
  assert.equal(r.body.product.status, 'draft');
  assert.equal((await mk()).status, 409);
  const list = await t.call('GET', '/api/factory/products');
  assert.equal(list.body.products.length, 1);
});

test('approve: profil belum lengkap -> 400; lengkap + gambar -> approved; edit -> draft', async () => {
  const { body: { product } } = await mk('Madu Approve');
  const bad = await t.call('POST', `/api/factory/products/${product.id}/approve`);
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /short/);
  const put = await t.call('PUT', `/api/factory/products/${product.id}`, { profile: fixture(), product_image: '/uploads/a.png', label_image: '/uploads/b.png' });
  assert.equal(put.status, 200);
  const ok = await t.call('POST', `/api/factory/products/${product.id}/approve`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.product.status, 'approved');
  assert.ok(ok.body.product.approved_at);
  const again = await t.call('PUT', `/api/factory/products/${product.id}`, { profile: fixture() });
  assert.equal(again.body.product.status, 'draft');
  assert.equal(again.body.product.approved_by, null);
});

test('approve butuh gambar produk dan label', async () => {
  const { body: { product } } = await mk('Madu Tanpa Gambar');
  await t.call('PUT', `/api/factory/products/${product.id}`, { profile: fixture() });
  const r = await t.call('POST', `/api/factory/products/${product.id}/approve`);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /gambar/i);
});

test('draft AI: klaim resmi user tidak boleh diubah', async () => {
  const { body: { product } } = await mk('Madu Draft');
  let seen;
  setAskForTests(async (args) => { seen = args; return { ...fixture(), official_claim: 'menyembuhkan', brand_lock: { Draft: ['draf'] }, compliance: { banned_phrases: ['x'] } }; });
  try {
    const r = await t.call('POST', `/api/factory/products/${product.id}/draft`);
    assert.equal(r.status, 200);
    assert.equal(r.body.product.profile.official_claim, 'membantu memelihara daya tahan tubuh');
    assert.ok(r.body.product.profile.compliance.banned_phrases.includes('jaminan sembuh'));
    assert.ok(r.body.product.profile.brand_lock['Madu Draft'] || r.body.product.profile.brand_lock.Draft);
    assert.ok(seen.schema && seen.system);
  } finally { setAskForTests(null); }
});
