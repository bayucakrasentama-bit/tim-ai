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

// ---- Task 3: request produksi + antrean ----
const FOLDER = 'https://drive.google.com/drive/folders/1AbC_d-9?usp=sharing';
const job = (product_id, extra = {}) => t.call('POST', '/api/factory/jobs', { product_id, target: 5, cta: 'kerkun', footage_url: FOLDER, ...extra });
async function approvedProduct(name) {
  const { body: { product } } = await mk(name);
  await t.call('PUT', `/api/factory/products/${product.id}`, { profile: fixture(), product_image: '/uploads/a.png', label_image: '/uploads/b.png' });
  await t.call('POST', `/api/factory/products/${product.id}/approve`);
  return product;
}

test('job: validasi target, cta, link footage', async () => {
  const p = await approvedProduct('Madu Valid');
  for (const target of [0, 20001, 'abc', 1.5]) assert.equal((await job(p.id, { target })).status, 400, String(target));
  const bad = await job(p.id, { footage_url: 'https://drive.google.com/file/d/X/view' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'Link harus folder Google Drive');
  assert.equal((await job(p.id, { cta: 'promo' })).status, 400);
  assert.equal((await job(999999)).status, 404);
  assert.equal((await job(p.id, { target: 20000, cta: 'awareness' })).status, 200);
  assert.equal((await job(p.id, { cta: 'campur' })).body.job.cta, 'campur');
});

test('job produk draft: menunggu_profil, jadi antre setelah approve', async () => {
  const { body: { product } } = await mk('Madu Menunggu');
  const r = await job(product.id);
  assert.equal(r.body.job.status, 'menunggu_profil');
  await t.call('PUT', `/api/factory/products/${product.id}`, { profile: fixture(), product_image: '/uploads/a.png', label_image: '/uploads/b.png' });
  await t.call('POST', `/api/factory/products/${product.id}/approve`);
  const list = await t.call('GET', '/api/factory/jobs');
  assert.equal(list.body.jobs.find((j) => j.id === r.body.job.id).status, 'antre');
});

test('queue_position memperhitungkan prioritas', async () => {
  await t.db.run("UPDATE factory_jobs SET status = 'selesai'");
  const p = await approvedProduct('Madu Antrean');
  const a = (await job(p.id)).body.job;
  const b = (await job(p.id)).body.job;
  let list = (await t.call('GET', '/api/factory/jobs')).body.jobs;
  assert.equal(list.find((j) => j.id === a.id).queue_position, 1);
  assert.equal(list.find((j) => j.id === b.id).queue_position, 2);
  assert.equal(list.find((j) => j.id === a.id).product_name, 'Madu Antrean');
  assert.equal((await t.call('POST', `/api/factory/jobs/${b.id}/priority`, { priority: 5 })).status, 200);
  assert.equal((await t.call('POST', `/api/factory/jobs/${b.id}/priority`, { priority: 'x' })).status, 400);
  list = (await t.call('GET', '/api/factory/jobs')).body.jobs;
  assert.equal(list.find((j) => j.id === b.id).queue_position, 1);
  assert.equal(list.find((j) => j.id === a.id).queue_position, 2);
  assert.equal(list.find((j) => j.status === 'selesai').queue_position, null);
});

test('pause, resume, cancel, retry', async () => {
  const p = await approvedProduct('Madu Aksi');
  const j = (await job(p.id)).body.job;
  assert.equal((await t.call('POST', `/api/factory/jobs/${j.id}/pause`)).body.job.status, 'dijeda');
  assert.equal((await t.call('POST', `/api/factory/jobs/${j.id}/pause`)).status, 400);
  assert.equal((await t.call('POST', `/api/factory/jobs/${j.id}/resume`)).body.job.status, 'antre');
  assert.equal((await t.call('POST', `/api/factory/jobs/${j.id}/retry`)).status, 400);
  await t.db.run("UPDATE factory_jobs SET status = 'gagal', message = 'rusak' WHERE id = ?", j.id);
  const r = await t.call('POST', `/api/factory/jobs/${j.id}/retry`);
  assert.equal(r.body.job.status, 'antre');
  assert.equal(r.body.job.message, null);
  assert.equal((await t.call('POST', `/api/factory/jobs/${j.id}/cancel`)).body.job.status, 'dibatalkan');
  await t.db.run("UPDATE factory_jobs SET status = 'selesai' WHERE id = ?", j.id);
  assert.equal((await t.call('POST', `/api/factory/jobs/${j.id}/cancel`)).status, 400);
  assert.equal((await t.call('POST', '/api/factory/jobs/999999/cancel')).status, 404);
});

test('agent: offline tanpa heartbeat, online kalau < 120 dtk', async () => {
  const { setSetting } = await import('../src/db.js');
  const { agentState } = await import('../src/factory/routes.js');
  await t.db.run("DELETE FROM settings WHERE key = 'factory:agent'");
  assert.equal((await t.call('GET', '/api/factory/jobs')).body.agent.online, false);
  await setSetting(t.db, 'factory:agent', JSON.stringify({ state: 'idle', job_id: null, drive_free_gb: 50, seen_at: new Date().toISOString() }));
  const a = (await t.call('GET', '/api/factory/jobs')).body.agent;
  assert.equal(a.online, true);
  assert.equal(a.drive_free_gb, 50);
  await setSetting(t.db, 'factory:agent', JSON.stringify({ state: 'idle', seen_at: new Date(Date.now() - 130e3).toISOString() }));
  assert.equal((await agentState(t.db)).online, false);
});

// ---- Fix round 1 ----
test('upload: hanya PNG/JPG/WebP', async () => {
  const send = async (name, type) => {
    const fd = new FormData();
    fd.append('file', new Blob(['x'], { type }), name);
    const r = await fetch(`${t.base}/api/factory/upload`, { method: 'POST', body: fd });
    return { status: r.status, body: await r.json() };
  };
  const svg = await send('a.svg', 'image/svg+xml');
  assert.equal(svg.status, 400);
  assert.equal(svg.body.error, 'Format gambar harus PNG, JPG, atau WebP');
  assert.equal((await send('a.gif', 'image/gif')).status, 400);
  const ok = await send('a.png', 'image/png');
  assert.equal(ok.status, 200);
  assert.match(ok.body.url, /^\/uploads\//);
});

test('gambar produk: URL luar ditolak', async () => {
  const { body: { product } } = await mk('Madu Gambar');
  const r = await t.call('PUT', `/api/factory/products/${product.id}`, { profile: {}, product_image: 'https://evil.example/x.png' });
  assert.equal(r.status, 400);
  const c = await t.call('POST', '/api/factory/products', { name: 'Madu Gambar Dua', category: 'x', official_claim: 'y', label_image: 'http://169.254.169.254/x' });
  assert.equal(c.status, 400);
  assert.equal((await t.call('PUT', `/api/factory/products/${product.id}`, { profile: {}, product_image: '/uploads/../../etc/passwd' })).status, 400);
});

test('edit produk approved -> job antre balik menunggu_profil', async () => {
  const p = await approvedProduct('Madu Balik');
  const j = (await job(p.id)).body.job;
  assert.equal(j.status, 'antre');
  await t.call('PUT', `/api/factory/products/${p.id}`, { profile: fixture() });
  const list = (await t.call('GET', '/api/factory/jobs')).body.jobs;
  assert.equal(list.find((x) => x.id === j.id).status, 'menunggu_profil');
  await t.call('POST', `/api/factory/products/${p.id}/approve`);
  assert.equal((await t.call('GET', '/api/factory/jobs')).body.jobs.find((x) => x.id === j.id).status, 'antre');
});

test('transisi atomik: status berubah di tengah -> 409', async () => {
  const p = await approvedProduct('Madu Atomik');
  const j = (await job(p.id)).body.job;
  // Simulasikan balapan: status berubah setelah dibaca tapi sebelum UPDATE.
  const realGet = t.db.get;
  t.db.get = async (sql, ...a) => {
    const r = await realGet.call(t.db, sql, ...a);
    if (/FROM factory_jobs WHERE id = \? AND brand_id/.test(sql)) await t.db.run("UPDATE factory_jobs SET status = 'selesai' WHERE id = ?", j.id);
    return r;
  };
  try {
    const r = await t.call('POST', `/api/factory/jobs/${j.id}/cancel`);
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'Status request sudah berubah, muat ulang');
  } finally { t.db.get = realGet; }
  assert.equal((await t.db.get('SELECT status FROM factory_jobs WHERE id = ?', j.id)).status, 'selesai');
});

test('isolasi brand: brand B tidak melihat produk/job brand A', async () => {
  const p = await approvedProduct('Madu Isolasi');
  const j = (await job(p.id)).body.job;
  const [b] = await t.db.run('INSERT INTO brands (name, created_at) VALUES (?, ?) RETURNING *', 'Brand B', new Date().toISOString());
  const callB = async (method, url, body) => {
    const r = await fetch(t.base + url, { method, headers: { 'content-type': 'application/json', 'x-brand-id': String(b.id) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const probe = await callB('GET', '/api/factory/products');
  assert.equal(probe.status, 200);
  assert.equal(probe.body.products.length, 0);
  assert.equal((await callB('GET', '/api/factory/jobs')).body.jobs.length, 0);
  assert.equal((await callB('POST', `/api/factory/products/${p.id}/approve`)).status, 404);
  assert.equal((await callB('PUT', `/api/factory/products/${p.id}`, { profile: {} })).status, 404);
  assert.equal((await callB('POST', `/api/factory/products/${p.id}/draft`)).status, 404);
  for (const a of ['pause', 'cancel', 'retry', 'resume']) assert.equal((await callB('POST', `/api/factory/jobs/${j.id}/${a}`)).status, 404);
  assert.equal((await callB('POST', `/api/factory/jobs/${j.id}/priority`, { priority: 3 })).status, 404);
  assert.equal((await callB('POST', '/api/factory/jobs', { product_id: p.id, target: 5, cta: 'kerkun', footage_url: FOLDER })).status, 404);
  assert.equal((await t.db.get('SELECT status FROM factory_jobs WHERE id = ?', j.id)).status, 'antre');
});

// ---- Fix round 2 ----
test('draft AI pada produk approved: job antre -> menunggu_profil', async () => {
  const p = await approvedProduct('Madu DraftAntre');
  const j = (await job(p.id)).body.job;
  assert.equal(j.status, 'antre');
  setAskForTests(async () => fixture());
  try { assert.equal((await t.call('POST', `/api/factory/products/${p.id}/draft`)).status, 200); } finally { setAskForTests(null); }
  assert.equal((await t.db.get('SELECT status FROM factory_jobs WHERE id = ?', j.id)).status, 'menunggu_profil');
});

test('resume dan retry job dari produk draft -> menunggu_profil', async () => {
  const p = await approvedProduct('Madu ResumeDraft');
  const j = (await job(p.id)).body.job;
  await t.call('POST', `/api/factory/jobs/${j.id}/pause`);
  await t.call('PUT', `/api/factory/products/${p.id}`, { profile: fixture() }); // produk jadi draft
  const r = await t.call('POST', `/api/factory/jobs/${j.id}/resume`);
  assert.equal(r.status, 200);
  assert.equal(r.body.job.status, 'menunggu_profil');
  await t.db.run("UPDATE factory_jobs SET status = 'gagal', message = 'x' WHERE id = ?", j.id);
  const r2 = await t.call('POST', `/api/factory/jobs/${j.id}/retry`);
  assert.equal(r2.body.job.status, 'menunggu_profil');
  assert.equal(r2.body.job.message, null);
  await t.call('POST', `/api/factory/products/${p.id}/approve`);
  await t.db.run("UPDATE factory_jobs SET status = 'gagal' WHERE id = ?", j.id);
  assert.equal((await t.call('POST', `/api/factory/jobs/${j.id}/retry`)).body.job.status, 'antre');
});
