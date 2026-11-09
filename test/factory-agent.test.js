import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp } from './helpers.js';
import { setNotifyForTests } from '../src/factory/agent-routes.js';

const TOKEN = 'tok-rahasia-123';
const FOLDER = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz';
const fixture = () => JSON.parse(fs.readFileSync(new URL('./fixtures/zestmag-profile.json', import.meta.url), 'utf8'));
let t; let sent = [];
const A = { authorization: `Bearer ${TOKEN}` };
const agent = (m, url, body) => t.call(m, `/api/factory/agent${url}`, body, A);
let n = 0;
const approvedProduct = async () => {
  const { body: { product } } = await t.call('POST', '/api/factory/products', { name: `Produk Agen ${++n}`, category: 'x', official_claim: 'membantu daya tahan tubuh' });
  await t.call('PUT', `/api/factory/products/${product.id}`, { profile: fixture(), product_image: '/uploads/a.png', label_image: '/uploads/b.png' });
  const ok = await t.call('POST', `/api/factory/products/${product.id}/approve`);
  assert.equal(ok.status, 200);
  return product;
};
const mkJob = async (product, extra = {}) => (await t.call('POST', '/api/factory/jobs', { product_id: product.id, target: 5, cta: 'kerkun', footage_url: FOLDER, ...extra })).body.job;
const reset = () => t.db.run("UPDATE factory_jobs SET status = 'selesai'");
const row = (id) => t.db.get('SELECT * FROM factory_jobs WHERE id = ?', id);

before(async () => { t = await startApp({ factoryToken: TOKEN }); setNotifyForTests(async (...a) => { sent.push(a); return { sent: 1 }; }); });
after(async () => { setNotifyForTests(null); await t.close(); });

test('token: tanpa header / salah -> 401', async () => {
  assert.equal((await t.call('POST', '/api/factory/agent/claim', {})).status, 401);
  assert.equal((await t.call('POST', '/api/factory/agent/claim', {}, { authorization: 'Bearer salah' })).status, 401);
  assert.equal((await t.call('GET', '/api/factory/agent/peek', undefined, { authorization: 'Bearer ' })).status, 401);
});

test('FACTORY_AGENT_TOKEN kosong -> semua 401', async () => {
  const t2 = await startApp({ factoryToken: '' });
  try {
    for (const h of [{}, { authorization: 'Bearer ' }, { authorization: 'Bearer x' }]) {
      assert.equal((await t2.call('POST', '/api/factory/agent/claim', {}, h)).status, 401);
    }
  } finally { await t2.close(); }
});

test('claim: antrean kosong -> null; peek false', async () => {
  assert.deepEqual((await agent('POST', '/claim', {})).body, { job: null });
  assert.deepEqual((await agent('GET', '/peek')).body, { waiting: false });
});

test('claim: prioritas, menyiapkan, profil objek, resume, progress monoton, pause, heartbeat, done', async () => {
  const p = await approvedProduct();
  const options = { angle: fixture().story.daily_pain_points[0], persona_ids: ['jaktim_pria'], voice_speed: 1.1, preset: 'brand-box', look: 'warm-honey', duration_range: '15-30' };
  const a = await mkJob(p); const b = await mkJob(p, { options });
  await t.call('POST', `/api/factory/jobs/${b.id}/priority`, { priority: 5 });
  assert.deepEqual((await agent('GET', '/peek')).body, { waiting: true });
  const c1 = (await agent('POST', '/claim', {})).body.job;
  assert.equal(c1.id, b.id);
  assert.deepEqual(c1.options, { ...options, voice_id: 'auto', gender: 'auto', accent: 'auto', age_range: 'auto' });
  assert.equal(typeof c1.product.profile, 'object');
  assert.equal(c1.product.product_image, '/uploads/a.png');
  assert.equal(c1.product.label_image, '/uploads/b.png');
  const r = await row(b.id);
  assert.equal(r.status, 'menyiapkan'); assert.ok(r.started_at);
  assert.equal((await agent('POST', '/claim', {})).body.job.id, b.id);

  assert.deepEqual((await agent('POST', `/jobs/${b.id}/progress`, { status: 'produksi', done: 10 })).body, { ok: true, action: 'continue' });
  await agent('POST', `/jobs/${b.id}/progress`, { done: 5 });
  assert.equal((await row(b.id)).done, 10);
  assert.equal((await row(b.id)).status, 'produksi');

  await t.call('POST', `/api/factory/jobs/${b.id}/pause`);
  assert.equal((await agent('POST', `/jobs/${b.id}/progress`, { done: 11, status: 'produksi' })).body.action, 'pause');
  assert.equal((await row(b.id)).status, 'dijeda');
  const hb = await agent('POST', '/heartbeat', { state: 'producing', job_id: b.id, drive_free_gb: 50, legacy: null });
  assert.deepEqual(hb.body, { ok: true, commands: [{ job_id: b.id, action: 'pause' }] });
  const jobs = await t.call('GET', '/api/factory/jobs');
  assert.equal(jobs.body.agent.online, true);

  // dibatalkan tidak bangkit
  await t.call('POST', `/api/factory/jobs/${a.id}/cancel`);
  assert.equal((await agent('POST', `/jobs/${a.id}/progress`, { status: 'produksi' })).body.action, 'cancel');
  assert.equal((await agent('POST', `/jobs/${a.id}/done`, { done: 1, drive_url: 'x' })).status, 200);
  assert.equal((await row(a.id)).status, 'dibatalkan');

  // done
  await t.db.run("UPDATE factory_jobs SET status = 'produksi' WHERE id = ?", b.id);
  sent = [];
  assert.deepEqual((await agent('POST', `/jobs/${b.id}/done`, { done: 3, drive_url: 'https://drive/x' })).body, { ok: true });
  assert.equal((await row(b.id)).status, 'selesai');
  assert.ok((await row(b.id)).finished_at);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][2], 'factory_done');
  assert.equal(sent[0][3], `✅ Motion Factory: ${p.name} 11 video selesai\nhttps://drive/x`);
  // done kedua tidak mengirim ulang / tidak mengubah
  await agent('POST', `/jobs/${b.id}/done`, { done: 3, drive_url: 'y' });
  assert.equal(sent.length, 1);
});

test('fail: status gagal + notifikasi; selesai tidak bangkit', async () => {
  await reset();
  const p = await approvedProduct();
  const j = await mkJob(p);
  await agent('POST', '/claim', {});
  sent = [];
  assert.equal((await agent('POST', `/jobs/${j.id}/fail`, { message: 'Drive penuh' })).status, 200);
  const r = await row(j.id);
  assert.equal(r.status, 'gagal'); assert.equal(r.message, 'Drive penuh');
  assert.equal(sent[0][3], `❌ Motion Factory: ${p.name} gagal — Drive penuh`);
  await t.db.run("UPDATE factory_jobs SET status = 'selesai' WHERE id = ?", j.id);
  await agent('POST', `/jobs/${j.id}/fail`, { message: 'x' });
  assert.equal((await row(j.id)).status, 'selesai');
  assert.equal(sent.length, 1);
});

test('progress dijeda dari agen (Drive penuh) menyimpan pesan', async () => {
  await reset();
  const p = await approvedProduct();
  const j = await mkJob(p);
  await agent('POST', '/claim', {});
  const r = await agent('POST', `/jobs/${j.id}/progress`, { status: 'dijeda', message: 'Drive penuh' });
  assert.equal(r.body.action, 'pause');
  const x = await row(j.id);
  assert.equal(x.status, 'dijeda'); assert.equal(x.message, 'Drive penuh');
});

test('claim/peek: job antre dengan produk draft tidak diambil', async () => {
  await reset();
  const p = await approvedProduct();
  await mkJob(p);
  await t.db.run("UPDATE factory_products SET status = 'draft' WHERE id = ?", p.id);
  assert.deepEqual((await agent('POST', '/claim', {})).body, { job: null });
  assert.deepEqual((await agent('GET', '/peek')).body, { waiting: false });
});

// ---- Final review fix ----
test('claim: product membawa updated_at + profile_version yang berubah saat profil diedit', async () => {
  await reset();
  const p = await approvedProduct();
  const j = await mkJob(p);
  const c1 = (await agent('POST', '/claim', {})).body.job;
  assert.equal(c1.id, j.id);
  assert.match(c1.product.profile_version, /^[0-9a-f]{16}$/);
  assert.ok(c1.product.updated_at);
  assert.equal((await agent('POST', '/claim', {})).body.job.product.profile_version, c1.product.profile_version);
  const prof = { ...fixture(), facts: ['fakta baru'] };
  await t.call('PUT', `/api/factory/products/${p.id}`, { profile: prof });
  await t.call('POST', `/api/factory/products/${p.id}/approve`);
  const c2 = (await agent('POST', '/claim', {})).body.job;
  assert.equal(c2.id, j.id);
  assert.notEqual(c2.product.profile_version, c1.product.profile_version);
});

test('profil balik draft saat produksi: progress & heartbeat -> pause, approve ulang -> antre lalu klaim lagi', async () => {
  await reset();
  const p = await approvedProduct();
  const j = await mkJob(p);
  assert.equal((await agent('POST', '/claim', {})).body.job.id, j.id);
  await agent('POST', `/jobs/${j.id}/progress`, { status: 'produksi', done: 2 });
  await t.call('PUT', `/api/factory/products/${p.id}`, { profile: fixture() });
  assert.equal((await row(j.id)).status, 'menunggu_profil');
  assert.equal((await agent('POST', `/jobs/${j.id}/progress`, { status: 'produksi', done: 3 })).body.action, 'pause');
  assert.equal((await row(j.id)).status, 'menunggu_profil');
  assert.equal((await row(j.id)).done, 2);
  const hb = await agent('POST', '/heartbeat', { state: 'producing', job_id: j.id });
  assert.deepEqual(hb.body.commands, [{ job_id: j.id, action: 'pause' }]);
  assert.deepEqual((await agent('POST', '/claim', {})).body, { job: null });
  await t.call('POST', `/api/factory/products/${p.id}/approve`);
  assert.equal((await row(j.id)).status, 'antre');
  assert.equal((await agent('POST', '/claim', {})).body.job.id, j.id);
});

test('done dengan drive_url kosong tidak menghapus drive_url lama', async () => {
  await reset();
  const p = await approvedProduct();
  const j = await mkJob(p);
  await agent('POST', '/claim', {});
  await agent('POST', `/jobs/${j.id}/progress`, { drive_url: 'https://drive.google.com/drive/folders/hasil' });
  await agent('POST', `/jobs/${j.id}/done`, { done: 5, drive_url: '' });
  const r = await row(j.id);
  assert.equal(r.status, 'selesai');
  assert.equal(r.drive_url, 'https://drive.google.com/drive/folders/hasil');
});
