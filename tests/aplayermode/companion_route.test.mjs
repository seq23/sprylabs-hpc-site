// The Kindle companion URL printed inside the Executive Dysfunction book is served on aplayermode.com
// (with and without the slash, query kept by the Worker), while every other /amazon/* path still goes to BHPC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { route, CONTENT_PAGES, BHPC } from '../../workers/aplayermode-com/src/index.js';

const PRINTED = ['/amazon/executive-dysfunction/'];

test('each printed companion URL is served from a committed file, with and without the slash', () => {
  for (const printed of PRINTED) {
    const file = CONTENT_PAGES[printed];
    assert.ok(file, `${printed} is in config/aplayermode_content_pages.json`);
    assert.ok(existsSync(new URL(`../..${file}`, import.meta.url)), `${file} is committed`);
    for (const p of [printed, printed.replace(/\/$/, '')]) assert.equal(route(p).kind, 'asset', p);
    assert.equal(route(printed.replace(/\/$/, '')).upstream, file);
  }
});

test('the older book paths still redirect to BHPC with their query', () => {
  assert.deepEqual(route('/amazon/monk-mode/'), { kind: 'redirect', location: `${BHPC}/amazon/monk-mode/`, keepQuery: true });
  assert.equal(route('/amazon/').kind, 'redirect');
});
