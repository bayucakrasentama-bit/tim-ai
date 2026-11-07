import test from 'node:test';
import assert from 'node:assert/strict';
import { generateText } from '../src/ai-router.js';

const db = { get: async (_sql, key) => key === 'ai_keys' ? { value: JSON.stringify({ openai: { key: 'test-key' }, gemini: { key: 'test-key' } }) } : null };
const schema = { type: 'object', properties: { ideas: { type: 'array' } }, required: ['ideas'] };

test('in-app GPT generation posts structured content to the configured OpenAI endpoint', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, opts) => {
    request = { url, headers: opts.headers, body: JSON.parse(opts.body) };
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '{"ideas":[]}' } }] }) };
  };
  try {
    const result = await generateText(db, { provider: 'openai', model: 'gpt-4.1-mini', system: 'Konten Indonesia', messages: [{ role: 'user', content: 'Buat hook' }], schema });
    assert.equal(result.text, '{"ideas":[]}');
    assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(request.body.model, 'gpt-4.1-mini');
    assert.equal(request.body.response_format.type, 'json_object');
    assert.equal(request.body.messages.at(-1).content, 'Buat hook');
  } finally { globalThis.fetch = original; }
});

test('in-app Gemini generation posts to Gemini without opening a browser tab', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, opts) => {
    request = { url, body: JSON.parse(opts.body) };
    return { ok: true, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ideas":[]}' }] }, finishReason: 'STOP' }] }) };
  };
  try {
    const result = await generateText(db, { provider: 'gemini', model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'Buat hook' }], schema });
    assert.equal(result.text, '{"ideas":[]}');
    assert.match(request.url, /generativelanguage.googleapis.com.*gemini-2.5-flash/);
    assert.equal(request.body.contents[0].parts[0].text, 'Buat hook');
  } finally { globalThis.fetch = original; }
});
