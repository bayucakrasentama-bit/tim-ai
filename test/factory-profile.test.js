import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb } from '../src/db.js';
import { slugify, parseFolderId, validateProfile, PROFILE_FIELDS, PALETTE_KEYS, DEFAULT_PALETTE, normalizePalette, defaultRules, labelRegexError } from '../src/factory/profile.js';

const fixture = () => JSON.parse(fs.readFileSync(new URL('./fixtures/zestmag-profile.json', import.meta.url), 'utf8'));

test('slugify', () => {
  assert.equal(slugify('Madu Olymax'), 'olymax');
  assert.equal(slugify('Pro Lambung 250ml'), 'prolambung250ml');
  assert.ok(slugify('Produk Dengan Nama Yang Sangat Sangat Panjang Sekali').length <= 24);
});

test('parseFolderId', () => {
  assert.equal(parseFolderId('https://drive.google.com/drive/folders/1AbC_d-9?usp=sharing'), '1AbC_d-9');
  assert.equal(parseFolderId('https://drive.google.com/drive/u/0/folders/XYZ'), 'XYZ');
  assert.equal(parseFolderId('https://drive.google.com/file/d/XYZ/view'), null);
});

test('validateProfile: kosong -> error per field', () => {
  const errs = validateProfile({});
  assert.ok(errs.includes('official_claim wajib diisi'));
  assert.ok(PROFILE_FIELDS.includes('story'));
});

test('validateProfile: fixture zestmag valid', () => {
  assert.deepEqual(validateProfile(fixture()), []);
});

test('validateProfile: pain points kurang dari 3 ditolak', () => {
  const p = fixture();
  p.story.daily_pain_points = ['a', 'b'];
  const errs = validateProfile(p);
  assert.ok(errs.some((e) => e.includes('story.daily_pain_points')));
});

test('openDb membuat tabel factory', async () => {
  const db = await openDb(':memory:');
  await db.all('SELECT * FROM factory_jobs LIMIT 0');
  await db.all('SELECT * FROM factory_products LIMIT 0');
});

// ---- Final review fix ----
test('validateProfile: tts_lexicon dan other_brands boleh kosong, palette wajib 6 key hex', () => {
  const p = fixture();
  p.tts_lexicon = {}; p.other_brands = [];
  assert.deepEqual(validateProfile(p), []);
  delete p.palette.ink;
  assert.ok(validateProfile(p).some((e) => e.startsWith('palette')));
  p.palette = { ...DEFAULT_PALETTE, primary: 'oranye' };
  assert.ok(validateProfile(p).some((e) => e.startsWith('palette')));
  assert.deepEqual(Object.keys(normalizePalette({ primary: '#abcdef', foo: 1 })), PALETTE_KEYS);
  assert.equal(normalizePalette({ primary: '#abcdef' }).primary, '#ABCDEF');
  assert.equal(normalizePalette(null).ink, DEFAULT_PALETTE.ink);
});

test('PALETTE_KEYS sama persis dengan tipe Palette Motion Factory', () => {
  assert.deepEqual(PALETTE_KEYS, ['primary', 'highlight', 'cta', 'cream', 'ink', 'white']);
});

test('validateProfile: compliance.rules wajib', () => {
  const p = fixture();
  p.compliance.rules = [];
  assert.ok(validateProfile(p).includes('compliance.rules wajib diisi'));
  delete p.compliance.rules;
  assert.ok(validateProfile(p).includes('compliance.rules wajib diisi'));
  assert.ok(defaultRules('x').length >= 4);
});

test('validateProfile: label_regex divalidasi', () => {
  const withRe = (re, extra = {}) => validateProfile({ ...fixture(), name: 'Madu Olymax', short: 'Olymax', label_regex: re, ...extra });
  assert.deepEqual(withRe('oly ?max'), []);
  assert.ok(withRe('oly(max').some((e) => /bukan regex/.test(e)));
  assert.ok(withRe('x*').some((e) => /kosong/.test(e)));
  assert.ok(withRe('.').some((e) => /umum/.test(e)));
  assert.ok(withRe('zest').some((e) => /zestmag/.test(e)));
  assert.ok(withRe('gurah').some((e) => /gurahfit/.test(e)));
  assert.ok(withRe('adu').some((e) => /madu/.test(e)));
  // produk Zestmag sendiri boleh cocok dengan "zestmag"
  assert.deepEqual(validateProfile(fixture()), []);
  assert.equal(labelRegexError('olymax', { name: 'Madu Olymax' }), null);
});
