// Test Agen AI + takeover di Inbox CS (fitur wacrm): ai_mode per percakapan,
// auto-reply AI saat inbound, takeover otomatis saat CS kirim manual.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startApp } from './helpers.js';
import { setSetting } from '../src/db.js';

// Mock provider OpenAI-compatible (rute 'custom' jalan tanpa API key).
function mockAi({ reply = 'Halo Kak, terima kasih sudah menghubungi kami!', fail = false } = {}) {
  const hits = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      hits.push(JSON.parse(body || '{}'));
      res.setHeader('content-type', 'application/json');
      if (fail) { res.statusCode = 500; res.end(JSON.stringify({ error: 'boom' })); return; }
      res.end(JSON.stringify({ choices: [{ message: { content: reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', async () => {
      resolve({ server, hits, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function setupAi(app, base) {
  await setSetting(app.db, 'ai_keys', JSON.stringify({ custom: { base_url: base } }));
  await setSetting(app.db, 'ai_default', JSON.stringify({ provider: 'custom', model: 'mock-model' }));
}

async function makeSim(app) {
  const ch = await app.call('POST', '/api/inbox/channels', { platform: 'simulasi', name: 'Toko Simulasi' });
  assert.equal(ch.status, 201);
  return ch.body.id;
}

test('PATCH percakapan: ai_mode auto/off diterima, nilai aneh diabaikan', async () => {
  const app = await startApp();
  try {
    const channelId = await makeSim(app);
    const sim = await app.call('POST', '/api/inbox/simulate', { channel_id: channelId, customer: 'ani', text: 'Halo kak' });
    assert.equal(sim.status, 201);
    const id = sim.body.conversation_id;

    const on = await app.call('PATCH', `/api/inbox/conversations/${id}`, { ai_mode: 'auto' });
    assert.equal(on.status, 200);
    assert.equal(on.body.ai_mode, 'auto');

    const bad = await app.call('PATCH', `/api/inbox/conversations/${id}`, { ai_mode: 'hack' });
    assert.equal(bad.body.ai_mode, 'auto');

    const off = await app.call('PATCH', `/api/inbox/conversations/${id}`, { ai_mode: 'off' });
    assert.equal(off.body.ai_mode, 'off');
  } finally { await app.close(); }
});

test('mode auto: pesan masuk dibalas sendiri oleh Agen AI', async () => {
  const app = await startApp();
  const mock = await mockAi({ reply: 'Halo Kak, ready ya!' });
  try {
    await setupAi(app, mock.base);
    const channelId = await makeSim(app);
    const on = await app.call('POST', '/api/inbox/simulate', { channel_id: channelId, customer: 'budi', text: 'ready?' });
    const id = on.body.conversation_id;
    await app.call('PATCH', `/api/inbox/conversations/${id}`, { ai_mode: 'auto' });

    const sim = await app.call('POST', '/api/inbox/simulate', { channel_id: channelId, customer: 'budi', text: 'ready kak?' });
    assert.equal(sim.status, 201);

    const conv = await app.call('GET', `/api/inbox/conversations/${id}`);
    const out = conv.body.messages.filter((m) => m.direction === 'out');
    assert.equal(out.length, 1, 'AI membalas tepat satu kali');
    assert.equal(out[0].text, 'Halo Kak, ready ya!');
    assert.equal(out[0].sender, 'Agen AI');
    assert.ok(mock.hits.length >= 1, 'provider AI dipanggil');
  } finally { mock.server.close(); await app.close(); }
});

test('takeover: CS kirim manual → AI Auto berhenti otomatis', async () => {
  const app = await startApp();
  const mock = await mockAi();
  try {
    await setupAi(app, mock.base);
    const channelId = await makeSim(app);
    const on = await app.call('POST', '/api/inbox/simulate', { channel_id: channelId, customer: 'citra', text: 'hi' });
    const id = on.body.conversation_id;
    await app.call('PATCH', `/api/inbox/conversations/${id}`, { ai_mode: 'auto' });

    const sent = await app.call('POST', `/api/inbox/conversations/${id}/messages`, { text: 'Baik Kak, saya yang handle ya' });
    assert.equal(sent.status, 201);

    const conv = await app.call('GET', `/api/inbox/conversations/${id}`);
    assert.equal(conv.body.ai_mode, 'off', 'manual send = takeover, AI mati');

    // Pesan berikutnya tidak lagi dibalas AI.
    await app.call('POST', '/api/inbox/simulate', { channel_id: channelId, customer: 'citra', text: 'masih ada?' });
    const after = await app.call('GET', `/api/inbox/conversations/${id}`);
    const aiMsgs = after.body.messages.filter((m) => m.sender === 'Agen AI');
    assert.equal(aiMsgs.length, 0);
  } finally { mock.server.close(); await app.close(); }
});

test('auto-reply rule menang duluan; AI tidak balas dobel', async () => {
  const app = await startApp();
  const mock = await mockAi();
  try {
    await setupAi(app, mock.base);
    const channelId = await makeSim(app);
    const rule = await app.call('POST', '/api/inbox/rules', { kind: 'keyword', keywords: 'ready', reply: 'Ready Kak!' });
    assert.equal(rule.status, 201);

    const on = await app.call('POST', '/api/inbox/simulate', { channel_id: channelId, customer: 'dodi', text: 'x' });
    const id = on.body.conversation_id;
    await app.call('PATCH', `/api/inbox/conversations/${id}`, { ai_mode: 'auto' });

    await app.call('POST', '/api/inbox/simulate', { channel_id: channelId, customer: 'dodi', text: 'ready kak?' });
    const conv = await app.call('GET', `/api/inbox/conversations/${id}`);
    const out = conv.body.messages.filter((m) => m.direction === 'out');
    assert.equal(out.length, 1, 'hanya satu balasan');
    assert.equal(out[0].text, 'Ready Kak!', 'auto-reply rule yang menjawab');
    assert.equal(mock.hits.length, 0, 'AI tidak dipanggil saat rule sudah menjawab');
  } finally { mock.server.close(); await app.close(); }
});

test('AI gagal (provider error) → pesan masuk tetap aman, tanpa balasan AI', async () => {
  const app = await startApp();
  const mock = await mockAi({ fail: true });
  try {
    await setupAi(app, mock.base);
    const channelId = await makeSim(app);
    const on = await app.call('POST', '/api/inbox/simulate', { channel_id: channelId, customer: 'eko', text: 'x' });
    const id = on.body.conversation_id;
    await app.call('PATCH', `/api/inbox/conversations/${id}`, { ai_mode: 'auto' });

    const sim = await app.call('POST', '/api/inbox/simulate', { channel_id: channelId, customer: 'eko', text: 'halo?' });
    assert.equal(sim.status, 201, 'inbound tidak crash walau AI error');

    const conv = await app.call('GET', `/api/inbox/conversations/${id}`);
    assert.equal(conv.body.messages.filter((m) => m.sender === 'Agen AI').length, 0);
    assert.equal(conv.body.ai_mode, 'auto', 'mode tetap auto (CS yang putuskan)');
  } finally { mock.server.close(); await app.close(); }
});

test('endpoint suggest memakai prompt bersama (draftReply)', async () => {
  const app = await startApp();
  const mock = await mockAi({ reply: 'Ini draft dari AI.' });
  try {
    await setupAi(app, mock.base);
    const channelId = await makeSim(app);
    const on = await app.call('POST', '/api/inbox/simulate', { channel_id: channelId, customer: 'fitri', text: 'mau tanya' });
    const r = await app.call('POST', `/api/inbox/conversations/${on.body.conversation_id}/suggest`);
    assert.equal(r.status, 200);
    assert.equal(r.body.suggestion, 'Ini draft dari AI.');
  } finally { mock.server.close(); await app.close(); }
});
