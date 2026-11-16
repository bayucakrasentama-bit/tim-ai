import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

let t;
before(async () => { t = await startApp({ factoryToken: 'tok-adlib-test' }); });
after(async () => { await t.close(); });

const AUTH = { authorization: 'Bearer tok-adlib-test' };
const ads = (ids, extra = {}) => ids.map((id) => ({
  creative_id: id, page_name: 'Brand ' + id, start_date: '2025-07-12',
  body_text: 'Coba madu herbal ' + id, platforms: ['facebook'], video: false, ...extra,
}));

test('agen: tanpa token / token salah -> 401, benar -> daftar keyword', async () => {
  assert.equal((await t.call('GET', '/api/adlib/agent/keywords')).status, 401);
  assert.equal((await t.call('GET', '/api/adlib/agent/keywords', undefined, { authorization: 'Bearer salah' })).status, 401);
  const r = await t.call('GET', '/api/adlib/agent/keywords', undefined, AUTH);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.keywords, []);
});

test('keyword: tambah, validasi, duplikat 409', async () => {
  assert.equal((await t.call('POST', '/api/adlib/keywords', { keyword: '  ' })).status, 400);
  const a = await t.call('POST', '/api/adlib/keywords', { keyword: 'madu' });
  assert.equal(a.status, 200);
  assert.equal(a.body.keyword.keyword, 'madu');
  assert.equal(a.body.keyword.country, 'ID');
  assert.equal((await t.call('POST', '/api/adlib/keywords', { keyword: 'madu' })).status, 409);
  const b = await t.call('POST', '/api/adlib/keywords', { keyword: 'suplemen mata' });
  assert.equal(b.status, 200);

  const list = await t.call('GET', '/api/adlib/keywords');
  assert.equal(list.body.keywords.length, 2);
  assert.equal(list.body.keywords[0].total, 0);
});

test('agen: keyword aktif terbaca + ingest keyword salah 404', async () => {
  const kws = await t.call('GET', '/api/adlib/agent/keywords', undefined, AUTH);
  assert.equal(kws.body.keywords.length, 2);
  const bad = await t.call('POST', '/api/adlib/agent/ingest', { keyword_id: 9999, ads: [] }, AUTH);
  assert.equal(bad.status, 404);
  assert.equal((await t.call('POST', '/api/adlib/agent/ingest', { keyword_id: 1, ads: [] })).status, 401);
});

test('ingest: hitung baru, upsert saat scan ulang, complete menonaktifkan yang hilang', async () => {
  const kwId = (await t.call('GET', '/api/adlib/keywords')).body.keywords[0].id;
  const t1 = new Date().toISOString();
  const r1 = await t.call('POST', '/api/adlib/agent/ingest', {
    keyword_id: kwId, started_at: t1, finished_at: t1, complete: true, ads: ads(['A1', 'A2', 'A3']),
  }, AUTH);
  assert.equal(r1.status, 200);
  assert.deepEqual({ saved: r1.body.saved, new_count: r1.body.new_count }, { saved: 3, new_count: 3 });

  // Scan ulang: creative sama -> tidak ada yang baru, last_seen ikut diperbarui.
  const r2 = await t.call('POST', '/api/adlib/agent/ingest', {
    keyword_id: kwId, started_at: t1, complete: true, ads: ads(['A1', 'A2', 'A3']),
  }, AUTH);
  assert.deepEqual({ saved: r2.body.saved, new_count: r2.body.new_count }, { saved: 3, new_count: 0 });

  // Scan berikutnya cuma melihat A1 -> A2 & A3 dianggap berhenti.
  // started_at harus lebih baru dari last_seen hasil scan sebelumnya (realistis: jeda antar scan).
  await new Promise((r) => setTimeout(r, 30));
  const t3 = new Date().toISOString();
  await t.call('POST', '/api/adlib/agent/ingest', {
    keyword_id: kwId, started_at: t3, complete: true, ads: ads(['A1']),
  }, AUTH);
  const all = await t.call('GET', '/api/adlib/ads?sort=age');
  const byId = Object.fromEntries(all.body.ads.map((a) => [a.creative_id, a]));
  assert.equal(byId.A1.active, true);
  assert.equal(byId.A2.active, false);
  assert.equal(byId.A3.active, false);
});

test('metrik: overview punya totals, winners berurutan umur, top advertiser', async () => {
  const ov = await t.call('GET', '/api/adlib/overview');
  assert.equal(ov.status, 200);
  assert.ok(ov.body.totals.creatives >= 3);
  assert.ok(Array.isArray(ov.body.winners));
  const ages = ov.body.winners.map((w) => w.age_days);
  assert.deepEqual(ages, [...ages].sort((a, b) => b - a), 'winners harus urut umur menurun');
  assert.ok(ov.body.top_advertisers.length >= 3);
  assert.ok(ov.body.scans.length >= 3, 'log scan tercatat');
});

test('daftar creative: filter keyword & sort', async () => {
  const kws = (await t.call('GET', '/api/adlib/keywords')).body.keywords;
  const withData = kws.find((k) => k.total > 0);
  const f = await t.call('GET', `/api/adlib/ads?keyword_id=${withData.id}&only=1`);
  assert.equal(f.body.ads.length, 1, 'yang aktif tinggal A1');
  const recent = await t.call('GET', '/api/adlib/ads?sort=recent&limit=2');
  assert.ok(recent.body.ads.length <= 2);
  assert.ok(recent.body.ads.every((a) => typeof a.age_days === 'number'));
});

test('hapus keyword: ikut menghapus creative & scan-nya', async () => {
  const kws = (await t.call('GET', '/api/adlib/keywords')).body.keywords;
  const del = await t.call('DELETE', '/api/adlib/keywords/' + kws[0].id);
  assert.equal(del.status, 200);
  const after = await t.call('GET', '/api/adlib/keywords');
  assert.equal(after.body.keywords.length, kws.length - 1);
  const adsLeft = await t.call('GET', `/api/adlib/ads?keyword_id=${kws[0].id}`);
  assert.equal(adsLeft.body.ads.length, 0);
});

test('error scan dari agen tercatat', async () => {
  const r = await t.call('POST', '/api/adlib/agent/error', { keyword_id: null, error: 'halaman diblokir' }, AUTH);
  assert.equal(r.status, 200);
  const scans = await t.call('GET', '/api/adlib/scans');
  assert.equal(scans.body.scans[0].status, 'error');
});
