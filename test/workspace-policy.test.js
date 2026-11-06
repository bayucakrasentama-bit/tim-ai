import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleViews, homeForTeam, todayAreas, doneKey, teamActions } from '../public/workspace-policy.js';
import { TEAMS } from '../src/auth.js';

const teams = { adv: 'adv', mp: 'mp', 'agents-adv': 'adv', planner: 'konten medsos', calendar: 'konten medsos', compose: 'medsos', studio: 'konten digital' };
const lookup = (view) => teams[view] || '';

test('MP member sees only MP tab in the shared ads hub', () => {
  assert.deepEqual(visibleViews([['adv', 'Meta'], ['mp', 'Marketplace'], ['agents-adv', 'Agen']], 'mp', 'member', lookup), [['mp', 'Marketplace']]);
});
test('content member sees only relevant tabs while manager sees all', () => {
  const subs = [['planner', 'Planner'], ['calendar', 'Kalender'], ['compose', 'Post']];
  assert.deepEqual(visibleViews(subs, 'konten', 'member', lookup).map(([v]) => v), ['planner', 'calendar']);
  assert.deepEqual(visibleViews(subs, 'konten', 'admin', lookup), subs);
});
test('brand and user are both part of completed-task scope', () => {
  assert.notEqual(doneKey('2026-11-07', 4, 10), doneKey('2026-11-07', 4, 11));
  assert.notEqual(doneKey('2026-11-07', 4, 10), doneKey('2026-11-07', 5, 10));
});
test('each member starts on their own today workspace', () => {
  assert.equal(homeForTeam('cs'), 'today');
  assert.deepEqual(todayAreas('cs', 'member'), ['CS']);
  assert.deepEqual(todayAreas('mp', 'member'), []);
  assert.deepEqual(todayAreas('semua', 'owner'), ['Konten', 'CS', 'Iklan']);
});
test('new teams have dedicated identity and working shortcuts', () => {
  for (const team of ['live', 'sales', 'keuangan']) {
    assert.ok(TEAMS.includes(team), `${team} should be a valid team`);
    assert.notEqual(teamActions(team, 'member')[0].view, 'today');
  }
  assert.deepEqual(todayAreas('sales', 'member'), ['CS']);
  assert.equal(teamActions('live', 'member')[0].tab, 'live');
  assert.equal(teamActions('keuangan', 'member')[0].tab, 'finance');
  assert.deepEqual(visibleViews([['mp', 'MP'], ['adv', 'ADV']], 'live', 'member', (v) => ({mp: 'mp live',adv: 'adv'})[v]), [['mp', 'MP']]);
});

test('teams requested by owner are not accidentally granted admin role', () => {
  assert.ok(TEAMS.includes('konten') && TEAMS.includes('adv') && TEAMS.includes('mp'));
  assert.ok(TEAMS.includes('medsos') && TEAMS.includes('kol') && TEAMS.includes('affiliate'));
});

test('teams without integrated tasks have direct useful actions', () => {
  assert.deepEqual(teamActions('mp', 'member').map((a) => a.view), ['mp', 'reports']);
  assert.deepEqual(teamActions('kol', 'member').map((a) => a.view), ['kol', 'reports']);
  assert.ok(teamActions('cs', 'member').some((a) => a.view === 'inbox'));
});
