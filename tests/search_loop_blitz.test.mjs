import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { apply } from '../scripts/search_loop_blitz.mjs';

const cfg = JSON.parse(fs.readFileSync('search-loop.config.json', 'utf8'));

test('the committed config is slow, points at the product host and holds a ready blitz block', () => {
  assert.equal(cfg.mode, 'slow');
  assert.equal(cfg.base_url, 'https://billionairehighperformancecoach.com');
  assert.ok(!JSON.stringify({ ...cfg, blitz: undefined, allowed_link_targets: undefined }).includes('spryexecutiveos.com'), 'config still targets the sunset host');
  assert.equal(apply(cfg, 'status').line.startsWith('blitz off'), true);
});

test('on runs ~10 pages a day for the set days, auto ends it after, off restores slow', () => {
  const on = apply(cfg, 'on', '2026-11-10').cfg;
  assert.equal(on.mode, 'normal');
  assert.equal(on.cap.max_per_day, 10);
  assert.ok(on.cap.max_live_pages >= 140);
  assert.equal(on.blitz.ends_on, '2026-11-24');
  assert.equal(apply(on, 'auto', '2026-11-24').changed, false);
  const ended = apply(on, 'auto', '2026-11-25');
  assert.ok(ended.changed && ended.line.includes('BLITZ_ENDED'));
  assert.equal(ended.cfg.mode, 'slow');
  assert.deepEqual(ended.cfg.cap, cfg.cap);
  assert.deepEqual(apply(on, 'off', '2026-11-12').cfg.cap, cfg.cap);
  assert.equal(apply(cfg, 'auto', '2030-01-01').changed, false, 'auto never switches a blitz on');
  assert.throws(() => apply({ ...cfg, blitz: undefined }, 'on'), /BLITZ_CONFIG/);
});
