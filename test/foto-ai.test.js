import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

test('tools: 10 fitur MantraFoto-style dengan field masing-masing', async () => {
  const r = await t.call('GET', '/api/foto-ai/tools');
  assert.equal(r.status, 200);
  assert.equal(r.body.tools.length, 10);
  for (const tool of r.body.tools) {
    assert.ok(tool.id && tool.name && tool.build_prompt, `${tool.id} harus lengkap`);
    assert.ok(Array.isArray(tool.fields));
  }
  const ids = r.body.tools.map((x) => x.id);
  for (const id of ['product', 'model', 'food', 'pas-foto', 'ads']) assert.ok(ids.includes(id), id);
});

test('generate: tool salah -> 400, tanpa foto -> 400', async () => {
  const bad = await t.call('POST', '/api/foto-ai/generate', { tool: 'ngawur', photos: [PNG] });
  assert.equal(bad.status, 400);
  const noPhoto = await t.call('POST', '/api/foto-ai/generate', { tool: 'product', photos: [] });
  assert.equal(noPhoto.status, 400);
});

test('generate: mock Gemini -> hasil base64 + prompt', async () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = (url, ...args) => String(url).includes('generativelanguage.googleapis.com')
    ? Promise.resolve(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'SEJBUQ==' } }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    : realFetch(url, ...args);
  try {
    const r = await t.call('POST', '/api/foto-ai/generate', {
      tool: 'product', photos: [PNG], fields: { scene: 'meja kayu' }, extra: 'cahaya pagi', ratio: '1:1',
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.result.url.startsWith('data:image/png;base64,'));
    assert.match(r.body.result.prompt, /product photography/i);
    assert.match(r.body.result.prompt, /meja kayu/);
    assert.equal(r.body.result.model, 'gemini-2.5-flash-image');
    assert.equal(r.body.result.ratio, '1:1');
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = realKey;
  }
});
