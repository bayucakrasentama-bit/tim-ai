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

test('opsi produksi menyediakan persona beserta suara, gender, logat, preset/look, speed dan durasi', async () => {
  const r = await t.call('GET', '/api/factory/options');
  assert.equal(r.status, 200);
  assert.ok(r.body.personas.some((p) => p.id === 'jaktim_pria' && p.voice && p.gender && p.accent));
  assert.ok(r.body.personas.some((p) => p.accent === 'Batak'));
  assert.ok(r.body.presets.includes('brand-box'));
  assert.ok(r.body.looks.includes('warm-honey'));
  assert.equal(r.body.personas.length, 15);
  assert.deepEqual(r.body.voice_speeds, [0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2]);
  assert.deepEqual(r.body.durations, ['15-30', '30-45', '45-60']);
});

test('job tanpa override memakai baseline: durasi 15-30 detik dan tempo 1,00×', async () => {
  const p = await approvedProduct('Madu Baseline Manifest');
  const r = await job(p.id);
  assert.equal(r.status, 200);
  assert.equal(r.body.job.options.duration_range, '15-30');
  assert.equal(r.body.job.options.voice_speed, 1.0);
  assert.deepEqual(r.body.job.options.persona_ids, []);
});

test('filter suara, gender, dan logat dipetakan ke persona engine yang cocok', async () => {
  const p = await approvedProduct('Madu Filter');
  const r = await job(p.id, { options: { voice_id: 'id-ID-ArdiNeural', gender: 'pria', accent: 'Betawi' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.job.options.persona_ids, ['jaktim_pria']);
  assert.equal(r.body.job.options.voice_id, 'id-ID-ArdiNeural');
  assert.equal(r.body.job.options.gender, 'pria');
  assert.equal(r.body.job.options.accent, 'Betawi');
});

test('job menyimpan pilihan angle, persona, preset, look, durasi, dan kecepatan suara', async () => {
  const p = await approvedProduct('Madu Pilihan');
  const options = { angle: fixture().story.daily_pain_points[0], persona_ids: ['jaktim_pria'], voice_id: 'id-ID-ArdiNeural', gender: 'pria', accent: 'Betawi', age_range: 'auto', voice_speed: 1.1, preset: 'brand-box', look: 'warm-honey', duration_range: '30-45' };
  const r = await job(p.id, { options });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.job.options, options);
});

test('duration_seconds lama tetap diterima lalu dipetakan ke rentang durasi', async () => {
  const p = await approvedProduct('Madu Durasi Lama');
  const r = await job(p.id, { options: { voice_speed: 1.15, duration_seconds: 25 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.job.options.duration_range, '15-30');
});

test('job menolak pilihan persona, preset, look, durasi, dan speed yang tidak didukung', async () => {
  const p = await approvedProduct('Madu Pilihan Invalid');
  const valid = { persona_ids: ['jaktim_pria'], preset: 'brand-box', look: 'warm-honey', duration_range: '15-30', voice_speed: 1.1 };
  for (const patch of [
    { persona_ids: ['not-a-persona'] }, { voice_id: 'invalid' }, { gender: 'other' }, { accent: 'unavailable' },
    { gender: 'wanita', accent: 'Batak' }, { preset: 'not-a-preset' }, { look: 'not-a-look' },
    { duration_range: '90-120' }, { voice_speed: 9 },
  ]) assert.equal((await job(p.id, { options: { ...valid, ...patch } })).status, 400, JSON.stringify(patch));
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

// ---- Final review fix ----
import { DRAFT_SCHEMA } from '../src/factory/routes.js';

test('DRAFT_SCHEMA: tiap object additionalProperties:false dan semua properti required', () => {
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, `${path} additionalProperties`);
      assert.ok(node.properties && Object.keys(node.properties).length, `${path} properties`);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), `${path} required`);
      for (const [k, v] of Object.entries(node.properties)) walk(v, `${path}.${k}`);
    }
    if (node.type === 'array') walk(node.items, `${path}[]`);
    for (const k of ['anyOf', 'oneOf', 'allOf']) (node[k] || []).forEach((n, i) => walk(n, `${path}.${k}${i}`));
  };
  walk(DRAFT_SCHEMA, '$');
  assert.ok(DRAFT_SCHEMA.required.includes('other_brands'));
  assert.ok(DRAFT_SCHEMA.required.includes('palette'));
  assert.deepEqual(DRAFT_SCHEMA.properties.palette.required, ['primary', 'highlight', 'cta', 'cream', 'ink', 'white']);
  assert.ok(DRAFT_SCHEMA.properties.compliance.required.includes('rules'));
});

// Jawaban AI persis berbentuk DRAFT_SCHEMA (peta sebagai daftar pasangan).
const schemaShaped = (over = {}) => ({
  short: 'Olyfresh', tts_name: 'Madu Olyfresh', file_prefix: 'OF',
  brand_lock: [{ key: 'Olyfresh', variants: ['oly fresh', 'olifresh'] }],
  tts_lexicon: [], other_brands: [], label_regex: 'oly ?fresh',
  facts: ['Madu murni'], audience: 'Ibu muda', angles: ['pagi sibuk'], hook_styles: ['pertanyaan'],
  cta_variants: ['Cek keranjang kuning'], badge_texts: ['Cek Keranjang Kuning'],
  compliance: { banned_phrases: ['ajaib'], rules: [], replacements: [{ from: 'dijamin', to: 'menurutku' }] },
  palette: { primary: '#112233', highlight: 'kuning', cta: '#445566', cream: '#FFFFFF', ink: '#000000', white: '#FFFFFF' },
  safe_hashtags: ['#madu'],
  story: { category: 'lain', daily_pain_points: ['a', 'b', 'c'], physical_features: ['botol'], safe_benefits: ['segar'], usage_moments: ['pagi'] },
  ...over,
});

test('draft AI bentuk schema (pasangan) -> peta, rules & palette default, lalu approve sukses', async () => {
  const { body: { product } } = await mk('Madu Olyfresh');
  setAskForTests(async () => schemaShaped());
  let r;
  try { r = await t.call('POST', `/api/factory/products/${product.id}/draft`); } finally { setAskForTests(null); }
  assert.equal(r.status, 200);
  const prof = r.body.product.profile;
  assert.deepEqual(prof.tts_lexicon, {});
  assert.deepEqual(prof.other_brands, []);
  assert.ok(prof.brand_lock.Olyfresh.includes('olifresh'));
  assert.deepEqual(prof.compliance.replacements, { dijamin: 'menurutku' });
  assert.ok(prof.compliance.rules.length >= 4);
  assert.ok(prof.compliance.rules[0].includes('membantu memelihara daya tahan tubuh'));
  assert.equal(prof.palette.primary, '#112233');
  assert.equal(prof.palette.highlight, '#FFC93C'); // nilai bukan hex → default
  assert.equal(prof.story.category, 'x');
  await t.call('PUT', `/api/factory/products/${product.id}`, { profile: prof, product_image: '/uploads/a.png', label_image: '/uploads/b.png' });
  const ok = await t.call('POST', `/api/factory/products/${product.id}/approve`);
  assert.equal(ok.status, 200, ok.body.error);
  assert.equal(ok.body.product.status, 'approved');
});

test('draft AI tanpa palette -> palette default 6 key; palette user dipertahankan', async () => {
  const { body: { product } } = await mk('Madu Palet');
  setAskForTests(async () => schemaShaped({ palette: undefined }));
  try {
    const r = await t.call('POST', `/api/factory/products/${product.id}/draft`);
    assert.deepEqual(r.body.product.profile.palette, { primary: '#F28C28', highlight: '#FFC93C', cta: '#E8452C', cream: '#FFF3E3', ink: '#161210', white: '#FFFFFF' });
  } finally { setAskForTests(null); }
  const c = await t.call('POST', '/api/factory/products', { name: 'Madu Palet User', category: 'x', official_claim: 'y', palette: { primary: '#010203' } });
  setAskForTests(async () => schemaShaped());
  try {
    const r = await t.call('POST', `/api/factory/products/${c.body.product.id}/draft`);
    assert.equal(r.body.product.profile.palette.primary, '#010203');
    assert.equal(r.body.product.profile.palette.cta, '#E8452C');
  } finally { setAskForTests(null); }
});

test('PUT: klaim resmi, kategori, catatan bisa dikoreksi dan profil balik draft', async () => {
  const p = await approvedProduct('Madu Koreksi');
  const prof = (await t.call('GET', '/api/factory/products')).body.products.find((x) => x.id === p.id).profile;
  const r = await t.call('PUT', `/api/factory/products/${p.id}`, { profile: { ...prof, official_claim: 'klaim baru', story: { ...prof.story, category: 'kategori baru' }, notes: 'catatan' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.product.status, 'draft');
  assert.equal(r.body.product.profile.official_claim, 'klaim baru');
  assert.equal(r.body.product.profile.story.category, 'kategori baru');
  assert.equal(r.body.product.profile.notes, 'catatan');
  const r2 = await t.call('PUT', `/api/factory/products/${p.id}`, { profile: r.body.product.profile, official_claim: 'klaim lain', category: 'kat lain' });
  assert.equal(r2.body.product.profile.official_claim, 'klaim lain');
  assert.equal(r2.body.product.profile.story.category, 'kat lain');
  assert.equal((await t.call('PUT', `/api/factory/products/${p.id}`, { profile: prof, official_claim: '  ' })).status, 400);
});

test('profil balik draft: job antre/menyiapkan/produksi -> menunggu_profil, approve ulang -> antre', async () => {
  const p = await approvedProduct('Madu AktifDraft');
  const a = (await job(p.id)).body.job; const b = (await job(p.id)).body.job; const c = (await job(p.id)).body.job; const d = (await job(p.id)).body.job;
  await t.db.run("UPDATE factory_jobs SET status = 'menyiapkan' WHERE id = ?", b.id);
  await t.db.run("UPDATE factory_jobs SET status = 'produksi' WHERE id = ?", c.id);
  await t.db.run("UPDATE factory_jobs SET status = 'dijeda' WHERE id = ?", d.id);
  await t.call('PUT', `/api/factory/products/${p.id}`, { profile: fixture() });
  const st = async (id) => (await t.db.get('SELECT status FROM factory_jobs WHERE id = ?', id)).status;
  for (const j of [a, b, c]) assert.equal(await st(j.id), 'menunggu_profil');
  assert.equal(await st(d.id), 'dijeda');
  await t.call('POST', `/api/factory/products/${p.id}/approve`);
  for (const j of [a, b, c]) assert.equal(await st(j.id), 'antre');
  // lewat draft AI juga
  await t.db.run("UPDATE factory_jobs SET status = 'produksi' WHERE id = ?", c.id);
  setAskForTests(async () => fixture());
  try { await t.call('POST', `/api/factory/products/${p.id}/draft`); } finally { setAskForTests(null); }
  assert.equal(await st(c.id), 'menunggu_profil');
});

test('retry mengosongkan finished_at dan eta_at', async () => {
  const p = await approvedProduct('Madu RetryBersih');
  const j = (await job(p.id)).body.job;
  await t.db.run("UPDATE factory_jobs SET status = 'gagal', finished_at = '2026-01-01T00:00:00Z', eta_at = '2026-01-02T00:00:00Z' WHERE id = ?", j.id);
  const r = await t.call('POST', `/api/factory/jobs/${j.id}/retry`);
  assert.equal(r.body.job.finished_at, null);
  assert.equal(r.body.job.eta_at, null);
});
