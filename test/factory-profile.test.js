import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb } from '../src/db.js';
import { slugify, parseFolderId, validateProfile, PROFILE_FIELDS } from '../src/factory/profile.js';

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
