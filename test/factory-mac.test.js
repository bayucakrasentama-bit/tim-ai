// Produk Mac (statistik dari heartbeat) + request "tambah video" tanpa footage + endpoint Hermes (token agen).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';
import { setNotifyForTests } from '../src/factory/agent-routes.js';

const TOKEN = 'tok-mac-456';
const A = { authorization: `Bearer ${TOKEN}` };
let t; let sent = [];
const agent = (m, url, body) => t.call(m, `/api/factory/agent${url}`, body, A);
const PRODUCTS = [
  { slug: 'olimex', name: 'Olimex', brand_id: 1, done: 2010, quota: 2000, total: 2070, today: 156, failed: 6, in_progress: 0, last_at: '2026-11-16T05:38:20+00:00', folder_url: 'https://drive.google.com/drive/folders/abc',
    drive: { videos: 2010, used: 15, ready: 999999, last_activity: '2026-11-16T05:35:02.404Z', checked_at: '2026-11-16T07:13:52+00:00', junk: '<b>' } },
  { slug: 'zestmag', name: 'Zestmag', brand_id: 2, done: 2376, quota: 10000, total: 2376, today: 0, failed: 34, in_progress: 0, last_at: null, folder_url: null },
  { slug: 'baru', name: 'Baru', brand_id: null, done: 0, quota: 10, total: 0, today: 0, failed: 0, in_progress: 0, last_at: null, folder_url: null },
  { slug: 'BAD SLUG', name: 'x' },
  { slug: 'jahat', name: 'J', brand_id: 1, folder_url: 'javascript:alert(1)', done: -5 },
];
const beat = (products = PRODUCTS) => agent('POST', '/heartbeat', { state: 'idle', job_id: null, drive_free_gb: 3796, legacy: null, products });

before(async () => { t = await startApp({ factoryToken: TOKEN }); setNotifyForTests(async (...a) => { sent.push(a); return { sent: 1 }; }); });
after(async () => { setNotifyForTests(null); await t.close(); });
beforeEach(async () => { sent = []; await t.db.run("UPDATE factory_jobs SET status = 'selesai'"); await beat(); });

test('statistik produk Mac: divalidasi & difilter per brand', async () => {
  const r = await t.call('GET', '/api/factory/jobs');
  assert.equal(r.status, 200);
  const slugs = r.body.agent.products.map((p) => p.slug);
  assert.deepEqual(slugs, ['olimex', 'jahat']);
  const jahat = r.body.agent.products[1];
  assert.equal(jahat.folder_url, null);
  assert.equal(jahat.done, 0);
  assert.equal(r.body.agent.products[0].today, 156);
  assert.deepEqual(r.body.agent.products[0].drive, { videos: 2010, used: 15, ready: 1995, last_activity: '2026-11-16T05:35:02.404Z', checked_at: '2026-11-16T07:13:52+00:00' });
  assert.equal(jahat.drive, null);
});

test('request tambah video produk Mac: antre tanpa footage, diklaim agen sebagai mac_product, done → notif', async () => {
  const r = await t.call('POST', '/api/factory/jobs', { mac_product: 'olimex', target: 50, cta: 'kerkun' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.job.status, 'antre');
  assert.equal(r.body.job.mac_product, 'olimex');
  const list = (await t.call('GET', '/api/factory/jobs')).body.jobs;
  assert.equal(list.find((j) => j.id === r.body.job.id).product_name, 'Olimex');
  const job = (await agent('POST', '/claim', {})).body.job;
  assert.equal(job.id, r.body.job.id);
  assert.equal(job.mac_product, 'olimex');
  assert.equal(job.footage_url, null);
  assert.deepEqual(job.options, {});
  assert.equal(job.product.slug, 'olimex');
  assert.equal(job.product.name, 'Olimex');
  await agent('POST', `/jobs/${job.id}/done`, { done: 50, drive_url: 'https://drive.google.com/drive/folders/hasil' });
  const row = await t.db.get('SELECT * FROM factory_jobs WHERE id = ?', job.id);
  assert.equal(row.status, 'selesai');
  assert.match(sent.at(-1)[3], /Olimex 50 video selesai/);
});

test('request produk Mac: validasi target/CTA/brand/pemetaan', async () => {
  const post = (b) => t.call('POST', '/api/factory/jobs', { target: 10, cta: 'kerkun', ...b });
  assert.equal((await post({ mac_product: 'zestmag' })).status, 404); // brand lain
  assert.equal((await post({ mac_product: 'tidakada' })).status, 404);
  assert.equal((await post({ mac_product: 'olimex', target: 0 })).status, 400);
  assert.equal((await post({ mac_product: 'olimex', cta: 'x' })).status, 400);
  const hermes = await agent('POST', '/requests', { mac_product: 'baru', target: 5 });
  assert.equal(hermes.status, 400);
  assert.match(hermes.body.error, /belum dipetakan/);
});

test('jeda lalu lanjut job produk Mac lewat UI → balik antre (tanpa profil)', async () => {
  const { job } = (await t.call('POST', '/api/factory/jobs', { mac_product: 'olimex', target: 5, cta: 'awareness' })).body;
  assert.equal((await t.call('POST', `/api/factory/jobs/${job.id}/pause`)).body.job.status, 'dijeda');
  assert.equal((await t.call('POST', `/api/factory/jobs/${job.id}/resume`)).body.job.status, 'antre');
});

test('Hermes: overview, request lintas brand, jeda/lanjut/batal; token wajib', async () => {
  assert.equal((await t.call('GET', '/api/factory/agent/overview')).status, 401);
  assert.equal((await t.call('POST', '/api/factory/agent/requests', { mac_product: 'zestmag', target: 5 })).status, 401);
  const r = await agent('POST', '/requests', { mac_product: 'zestmag', target: 25, cta: 'campur', by: 'hermes:wa' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.job.brand_id, 2);
  assert.equal(r.body.job.product, 'Zestmag');
  assert.equal(r.body.job.status, 'antre');
  assert.equal(r.body.job.created_by, 'hermes:wa');
  const ov = (await agent('GET', '/overview')).body;
  assert.equal(ov.agent.online, true);
  assert.equal(ov.products.find((p) => p.slug === 'olimex').total, 2070);
  assert.equal(ov.jobs[0].id, r.body.job.id);
  const id = r.body.job.id;
  assert.equal((await agent('POST', `/requests/${id}/pause`)).body.job.status, 'dijeda');
  assert.equal((await agent('POST', `/requests/${id}/pause`)).status, 400);
  assert.equal((await agent('POST', `/requests/${id}/resume`)).body.job.status, 'antre');
  assert.equal((await agent('POST', `/requests/${id}/cancel`)).body.job.status, 'dibatalkan');
  assert.equal((await agent('POST', `/requests/${id}/hapus`)).status, 400);
  await t.db.run("UPDATE factory_jobs SET status = 'gagal', message = 'Kombinasi stem habis' WHERE id = ?", id);
  const re = (await agent('POST', `/requests/${id}/retry`)).body.job;
  assert.equal(re.status, 'antre');
  assert.equal(re.message, null);
  assert.equal((await agent('POST', '/requests/99999/cancel')).status, 404);
});
