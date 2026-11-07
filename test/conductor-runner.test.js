import test from 'node:test';
import assert from 'node:assert/strict';
import { executeConductorPlan, applyBrandScopedResponse } from '../public/conductor-runner.js';

const agents = { hook: { fields: [{ k: 'product', req: true, label: 'Produk' }] }, logo: { fields: [{ k: 'name', req: true, label: 'Nama brand' }] } };

test('brand-scoped approval response is ignored after switching brands and reloads the active catalog', async () => {
  let activeBrand = 2;
  let applied = null;
  let reloads = 0;
  const ok = await applyBrandScopedResponse(1, () => activeBrand, { teams: ['old'] }, (data) => { applied = data; }, async () => { reloads += 1; });
  assert.equal(ok, false);
  assert.equal(applied, null);
  assert.equal(reloads, 1);
});

test('brand-scoped approval response applies when the original brand remains selected', async () => {
  let applied = null;
  let reloads = 0;
  const data = { teams: ['brand-a'] };
  const ok = await applyBrandScopedResponse(1, () => 1, data, (value) => { applied = value; }, async () => { reloads += 1; });
  assert.equal(ok, true);
  assert.equal(applied, data);
  assert.equal(reloads, 0);
});

test('one click executes valid agents in order and reports real outputs', async () => {
  const called = [];
  const progress = [];
  const result = await executeConductorPlan([{ agent: 'hook', values: { product: 'Produk A' } }, { agent: 'logo', values: { name: 'Brand B' } }], agents,
    async (agent, values) => { called.push(agent); return `${agent}:${Object.values(values)[0]}`; }, (rows) => progress.push(rows.map((r) => r.status)));
  assert.deepEqual(called, ['hook', 'logo']);
  assert.deepEqual(result.map((r) => [r.status, r.text]), [['done', 'hook:Produk A'], ['done', 'logo:Brand B']]);
  assert.ok(progress.some((p) => p.includes('running')));
});

test('missing required brief is not passed to AI; next valid step still runs', async () => {
  const called = [];
  const result = await executeConductorPlan([{ agent: 'hook', values: {} }, { agent: 'logo', values: { name: 'Brand B' } }], agents,
    async (agent) => { called.push(agent); return 'hasil'; });
  assert.deepEqual(called, ['logo']);
  assert.equal(result[0].status, 'needs_input');
  assert.deepEqual(result[0].missing, ['Produk']);
  assert.equal(result[1].status, 'done');
});

test('failed AI task is labeled failed and does not invent a completed result', async () => {
  const result = await executeConductorPlan([{ agent: 'hook', values: { product: 'Produk A' } }, { agent: 'logo', values: { name: 'Brand B' } }], agents,
    async (agent) => { if (agent === 'hook') throw new Error('Kuota habis'); return 'hasil valid'; });
  assert.equal(result[0].status, 'failed');
  assert.equal(result[0].error, 'Kuota habis');
  assert.equal(result[0].text, undefined);
  assert.equal(result[1].text, 'hasil valid');
});

test('brand switch stops remaining jobs instead of attributing work to another brand', async () => {
  let active = true;
  const result = await executeConductorPlan([{ agent: 'hook', values: { product: 'A' } }, { agent: 'logo', values: { name: 'B' } }], agents,
    async () => { active = false; return 'hasil'; }, () => {}, () => active);
  assert.equal(result[1].status, 'cancelled');
});
