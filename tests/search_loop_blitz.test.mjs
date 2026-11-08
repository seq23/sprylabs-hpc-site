import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { apply } from '../scripts/search_loop_blitz.mjs';

const cfg = JSON.parse(fs.readFileSync('search-loop.config.json', 'utf8'));

// The committed config is either slow (blitz off) or a blitz with an end date no more than its
// days away from when it was switched on; never "normal" with no end.
test('the committed config points at the product host and is slow, or a blitz that ends', () => {
  assert.equal(cfg.base_url, 'https://billionairehighperformancecoach.com');
  assert.ok(!JSON.stringify({ ...cfg, blitz: undefined, allowed_link_targets: undefined }).includes('spryexecutiveos.com'), 'config still targets the sunset host');
  if (cfg.mode === 'slow') {
    assert.deepEqual(cfg.cap, cfg.blitz.off.cap);
    assert.ok(apply(cfg, 'status').line.startsWith('blitz off'));
  } else {
    assert.equal(cfg.mode, cfg.blitz.on.mode);
    assert.deepEqual(cfg.cap, cfg.blitz.on.cap);
    assert.match(cfg.blitz.ends_on || '', /^\d{4}-\d{2}-\d{2}$/, 'a blitz with no end date');
    const since = (cfg.blitz.status.match(/on since (\d{4}-\d{2}-\d{2})/) || [])[1];
    assert.ok(since, 'blitz on with no start date');
    assert.equal((Date.parse(cfg.blitz.ends_on) - Date.parse(since)) / 864e5, cfg.blitz.days);
  }
});

test('on runs ~10 pages a day for the set days, auto ends it after, off restores slow', () => {
  const off = apply(cfg, 'off', '2026-11-09').cfg;
  assert.equal(off.mode, 'slow');
  const on = apply(off, 'on', '2026-11-10').cfg;
  assert.equal(on.mode, 'normal');
  assert.equal(on.cap.max_per_day, 10);
  assert.ok(on.cap.max_live_pages >= 140);
  assert.equal(on.blitz.ends_on, '2026-11-24');
  assert.equal(apply(on, 'auto', '2026-11-24').changed, false);
  const ended = apply(on, 'auto', '2026-11-25');
  assert.ok(ended.changed && ended.line.includes('BLITZ_ENDED'));
  assert.equal(ended.cfg.mode, 'slow');
  assert.deepEqual(ended.cfg.cap, off.cap);
  assert.deepEqual(apply(on, 'off', '2026-11-12').cfg.cap, off.cap);
  assert.equal(apply(off, 'auto', '2030-01-01').changed, false, 'auto never switches a blitz on');
  assert.throws(() => apply({ ...off, blitz: undefined }, 'on'), /BLITZ_CONFIG/);
});
