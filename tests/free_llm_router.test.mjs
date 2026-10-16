// Pins the free router's stop semantics (run 38932788448, 16 Oct 2026): a 403 on
// one model is that model's refusal, not the key's; only 401/402 on a chat call,
// or a refusal from GET /api/v1/auth/key itself, is NAMED_STOP_CREDENTIAL_REFUSED.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeChat, loadRouting, resetKeyInfoCache, REASONING_BUDGET_TOKENS } from '../scripts/lib/free_llm_router.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = loadRouting(ROOT).free_models.map((m) => m.id);
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const KEY_OK = json(200, { data: { label: 'test', limit: 0, usage: 0, is_free_tier: false, limit_remaining: 0, disabled: false } });

// chatByModel: model id -> response (default: answered at cost 0).
function fakeFetch(chatByModel, keyRes = KEY_OK) {
  const calls = [];
  const impl = async (url, init) => {
    if (String(url).endsWith('/auth/key')) return keyRes;
    const body = JSON.parse(init.body);
    calls.push(body);
    const r = chatByModel[body.model];
    if (r) return r;
    return json(200, { model: body.model, usage: { cost: 0 }, choices: [{ message: { content: `answer from ${body.model}` }, finish_reason: 'stop' }] });
  };
  return { impl, calls };
}
const ask = (fetchImpl) => { resetKeyInfoCache(); return freeChat({ messages: [{ role: 'user', content: 'q' }], apiKey: 'sk-test', fetchImpl, root: ROOT }); };

test('roster has at least two models, all :free, and inkling is gone', () => {
  assert.ok(MODELS.length >= 2);
  assert.ok(MODELS.every((id) => id.endsWith(':free')));
  assert.ok(!MODELS.includes('thinkingmachines/inkling:free'));
  assert.ok(MODELS.includes('google/gemma-4-26b-a4b-it:free'));
});

for (const status of [403, 404]) {
  test(`HTTP ${status} on the first model falls through and the next model answers`, async () => {
    const { impl, calls } = fakeFetch({ [MODELS[0]]: json(status, { error: { message: 'only available on agentic harnesses' } }) });
    const r = await ask(impl);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.model, MODELS[1]);
    assert.equal(r.cost_usd, 0);
    assert.deepEqual(r.attempts.map((a) => a.status), [`http_${status}`, 'answered']);
    assert.equal(calls.length, 2);
  });
}

test('403 on every model is NAMED_STOP_NO_FREE_MODEL, never a credential stop', async () => {
  const all = Object.fromEntries(MODELS.map((id) => [id, json(403, { error: { message: 'forbidden for this model' } })]));
  const r = await ask(fakeFetch(all).impl);
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'NAMED_STOP_NO_FREE_MODEL');
  assert.equal(r.attempts.length, MODELS.length);
});

for (const status of [401, 402]) {
  test(`HTTP ${status} on a chat call stops the route with NAMED_STOP_CREDENTIAL_REFUSED`, async () => {
    const { impl, calls } = fakeFetch({ [MODELS[0]]: json(status, { error: { message: 'User not found.' } }) });
    const r = await ask(impl);
    assert.equal(r.ok, false);
    assert.equal(r.stop, 'NAMED_STOP_CREDENTIAL_REFUSED');
    assert.match(r.reason, new RegExp(`HTTP ${status}`));
    assert.equal(calls.length, 1, 'no further model may be asked with a refused key');
  });
}

test('GET /auth/key refusing the key is a credential stop before any model is asked', async () => {
  const { impl, calls } = fakeFetch({}, json(401, { error: { message: 'No auth credentials found' } }));
  const r = await ask(impl);
  assert.equal(r.stop, 'NAMED_STOP_CREDENTIAL_REFUSED');
  assert.equal(calls.length, 0);
});

test('a key reported disabled by GET /auth/key is a credential stop', async () => {
  const { impl, calls } = fakeFetch({}, json(200, { data: { label: 'x', disabled: true } }));
  const r = await ask(impl);
  assert.equal(r.stop, 'NAMED_STOP_CREDENTIAL_REFUSED');
  assert.match(r.reason, /disabled/);
  assert.equal(calls.length, 0);
});

test('$0 guarantees: non-zero cost throws FAIL_LOUD; requests pin allow_fallbacks false and budget reasoning', async () => {
  const { impl, calls } = fakeFetch({ [MODELS[0]]: json(200, { usage: { cost: 0.0001 }, choices: [{ message: { content: 'x' } }] }) });
  await assert.rejects(ask(impl), /FAIL_LOUD/);
  assert.deepEqual(calls[0].provider, { allow_fallbacks: false });
  assert.deepEqual(calls[0].reasoning, { max_tokens: REASONING_BUDGET_TOKENS, exclude: true });
  assert.equal(calls[0].max_tokens, 1200 + REASONING_BUDGET_TOKENS);
});

test('empty answer records its finish_reason and moves on', async () => {
  const { impl } = fakeFetch({ [MODELS[0]]: json(200, { usage: { cost: 0 }, choices: [{ message: { content: '' }, finish_reason: 'length' }] }) });
  const r = await ask(impl);
  assert.equal(r.ok, true);
  assert.deepEqual(r.attempts[0], { model: MODELS[0], status: 'empty_answer', error: 'finish_reason=length' });
});

test('excluded_models in the routing config names inkling with its reason', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/llm_routing.json'), 'utf8'));
  assert.match(cfg.excluded_models['thinkingmachines/inkling:free'], /agentic harnesses/);
});
