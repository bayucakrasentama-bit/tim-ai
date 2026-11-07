import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCustomCatalog, conductorRoutes } from '../src/conductor.js';

const team = { id: 'custom-performance', label: 'Performance', icon: '📈' };
const agent = {
  id: 'custom-hook-lab', team: team.id, name: 'Hook Lab', role: 'Membuat hook', desc: 'Menyusun variasi hook',
  fields: [{ k: 'product', label: 'Produk', req: true }], sys: 'Kamu strategist hook.', out: '## Hook',
};

test('approves a new division and agents as a merged catalog without replacing existing items', () => {
  const current = { teams: [{ id: 'custom-content', label: 'Content', icon: '✍️' }], agents: [] };
  const result = mergeCustomCatalog(current, { teams: [team], agents: [agent] });
  assert.deepEqual(result.teams.map((x) => x.id), ['custom-content', 'custom-performance']);
  assert.equal(result.agents[0].team, team.id);
  assert.notEqual(result, current);
});

test('rejects agent proposals referencing a division that does not exist', () => {
  assert.throws(() => mergeCustomCatalog({}, { teams: [], agents: [{ ...agent, team: 'custom-missing' }] }), /divisi/i);
});

test('rejects executable or oversized agent definitions and duplicate IDs', () => {
  assert.throws(() => mergeCustomCatalog({}, { teams: [team, team], agents: [agent] }), /duplikat/i);
  assert.throws(() => mergeCustomCatalog({}, { teams: [team], agents: [{ ...agent, sys: 'x'.repeat(5001) }] }), /panjang/i);
});

test('only owner/admin can approve; approved catalog is persisted separately per brand', async () => {
  const routes = {};
  const rows = new Map();
  const db = {
    async get(_sql, key) { return rows.has(key) ? { value: rows.get(key) } : null; },
    async run(sql, key, value) { if (sql.startsWith('DELETE')) rows.delete(key); else rows.set(key, value); },
  };
  const app = { get: (path, ...fn) => { routes[`GET ${path}`] = fn.at(-1); }, post: (path, ...fn) => { routes[`POST ${path}`] = fn.at(-1); } };
  conductorRoutes(app, db, (_req, _res, next) => next());
  const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } });
  const create = routes['POST /api/conductor/catalog'];
  const forbidden = response();
  await create({ user: { id: 2, role: 'member' }, brand: { id: 1 }, body: { teams: [team], agents: [agent] } }, forbidden);
  assert.equal(forbidden.statusCode, 403);

  const ok = response();
  await create({ user: { id: 7, role: 'admin' }, brand: { id: 1 }, body: { teams: [team], agents: [agent] } }, ok);
  assert.equal(ok.statusCode, 201);
  const first = response();
  await routes['GET /api/conductor/catalog']({ user: { id: 0, role: 'owner' }, brand: { id: 1 } }, first);
  const other = response();
  await routes['GET /api/conductor/catalog']({ user: { id: 0, role: 'owner' }, brand: { id: 2 } }, other);
  assert.equal(first.body.agents[0].id, agent.id);
  assert.deepEqual(other.body.teams, []);
});
