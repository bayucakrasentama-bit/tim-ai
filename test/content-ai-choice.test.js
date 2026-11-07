import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContentRoute } from '../src/ai.js';

const config = { defaultRoute: { provider: 'gemini', model: 'gemini-3.5-flash-lite' }, geminiModel: 'gemini-2.5-flash', geminiAvailable: true, openaiAvailable: false };

test('explicit Gemini uses configured model without switching provider', () => {
  assert.deepEqual(resolveContentRoute('gemini', config), { provider: 'gemini', model: 'gemini-3.5-flash-lite' });
});
test('GPT needs a configured OpenAI API key', () => {
  assert.throws(() => resolveContentRoute('openai', config), { status: 503 });
});
test('GPT uses configured OpenAI default model, or a known fallback when Gemini is default', () => {
  assert.deepEqual(resolveContentRoute('openai', { ...config, openaiAvailable: true, defaultRoute: { provider: 'openai', model: 'gpt-4.1' } }), { provider: 'openai', model: 'gpt-4.1' });
  assert.deepEqual(resolveContentRoute('openai', { ...config, openaiAvailable: true }), { provider: 'openai', model: 'gpt-4.1-mini' });
});
test('invalid provider cannot be passed through to the router', () => {
  assert.throws(() => resolveContentRoute('custom', config), { status: 400 });
});
test('legacy calls without an explicit provider keep default behavior', () => {
  assert.equal(resolveContentRoute(undefined, config), null);
});
