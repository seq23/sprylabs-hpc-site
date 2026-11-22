// The CI render (ship-ready.json) points the Worker at a local Pages origin through APM_ORIGIN.
// These prove the override can only ever be a loopback address, that production (no APM_ORIGIN)
// still reads the pages.dev origin, and that the main module exports nothing but the handler
// (workerd refuses to start on a plain named export, so `wrangler dev` would not run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORIGIN, originOf } from '../../workers/aplayermode-com/src/index.js';
import * as entry from '../../workers/aplayermode-com/src/entry.js';

test('APM_ORIGIN is honoured only for a loopback http address', () => {
  assert.equal(originOf({}), ORIGIN);
  assert.equal(originOf(undefined), ORIGIN);
  assert.equal(originOf({ APM_ORIGIN: 'http://127.0.0.1:8788' }), 'http://127.0.0.1:8788');
  assert.equal(originOf({ APM_ORIGIN: 'http://localhost:8788' }), 'http://localhost:8788');
  for (const bad of ['https://evil.example', 'http://127.0.0.1.evil.example:80', 'http://127.0.0.1:8788/x', 'http://10.0.0.1:8788', 'http://127.0.0.1:8788@evil.example', '', 42, null]) {
    assert.equal(originOf({ APM_ORIGIN: bad }), ORIGIN, `must ignore ${bad}`);
  }
});

test('every origin fetch goes to the chosen origin, never a mix', async () => {
  const hits = [];
  const realFetch = globalThis.fetch; const realCaches = globalThis.caches;
  globalThis.caches = undefined;
  globalThis.fetch = async (input) => { const u = new URL(typeof input === 'string' ? input : input.url); hits.push(u.origin); return new Response('<html>ok</html>', { status: 200, headers: { 'content-type': 'text/html' } }); };
  try {
    const w = (await import('../../workers/aplayermode-com/src/index.js')).default;
    for (const p of ['/', '/about/', '/no-such-page']) await (await w.fetch(new Request('https://aplayermode.com' + p), { APM_ORIGIN: 'http://127.0.0.1:8788' }, {})).text();
    assert.ok(hits.length >= 3);
    assert.deepEqual([...new Set(hits)], ['http://127.0.0.1:8788']);
    hits.length = 0;
    await (await w.fetch(new Request('https://aplayermode.com/'), { APM_ORIGIN: 'https://evil.example' }, {})).text();
    assert.deepEqual([...new Set(hits)], [ORIGIN]);
  } finally { globalThis.fetch = realFetch; globalThis.caches = realCaches; }
});

test('the main module exports only the fetch handler', () => {
  assert.deepEqual(Object.keys(entry), ['default']);
  assert.equal(typeof entry.default.fetch, 'function');
});
