/**
 * aplayermode.com Pinterest daily drip (owner-approved 16 Oct 2026): scheduling,
 * refill, the request-time feed the Worker serves, the edge measurement and its
 * weekly reader, and that billionairehighperformancecoach.com / spryexecutiveos.com
 * serve no pinfeed. Run: npm run validate:aplayermode-pin-drip (node --test).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  SECTIONS, addDays, buildPinfeedXml, chicagoDate, dueVariants, needsRefill, planRefill, scheduleVariants, unreleasedCount,
} from '../../workers/aplayermode-com/src/pinqueue.js';
import worker, { pinVisitPoint, route } from '../../workers/aplayermode-com/src/index.js';
import { QUEUE_FILE, launchBlock, pageIds, pngSize } from '../../scripts/aplayermode/pinfeed_lib.mjs';
import { collect, SECRET } from '../../scripts/aplayermode/collect_pin_metrics.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const queue = JSON.parse(read(QUEUE_FILE));
const angles = JSON.parse(read('config/aplayermode_pin_angles.json')).sections;
const clone = (x) => JSON.parse(JSON.stringify(x));

/**
 * The shape planRefill keeps a queue in, refill after refill: every section has
 * >= 6 variants and the sections stay within one of each other (fewest goes first);
 * within a section no design (headline x layout x palette) repeats, no layout runs
 * back to back, every headline is one of the section's angles, and no angle runs a
 * second time before every angle has run once (uses differ by at most one).
 */
function assertSectionShape(variants, label) {
  const counts = SECTIONS.map((s) => variants.filter((v) => v.section === s).length);
  for (const [i, s] of SECTIONS.entries()) assert.ok(counts[i] >= 6, `${label} ${s}: ${counts[i]} variants`);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${label}: sections unbalanced ${counts.join('/')}`);
  for (const s of SECTIONS) {
    const vs = variants.filter((v) => v.section === s).sort((a, b) => a.seq - b.seq);
    const designs = vs.map((v) => `${v.headline}|${v.layout}|${v.palette}`.toLowerCase());
    assert.equal(new Set(designs).size, vs.length, `${label} ${s}: repeated design`);
    for (let i = 1; i < vs.length; i += 1) assert.notEqual(vs[i].layout, vs[i - 1].layout, `${label} ${s}: same layout back to back`);
    const headlines = angles[s].map((a) => a.headline);
    for (const v of vs) assert.ok(headlines.includes(v.headline), `${label} ${v.id}: headline not in its section's angles`);
    const uses = headlines.map((h) => vs.filter((v) => v.headline === h).length);
    assert.ok(Math.max(...uses) - Math.min(...uses) <= 1, `${label} ${s}: repeated headline before every angle ran (${uses.join(',')})`);
  }
}

/** Run the real Worker against the committed tree as its Pages origin. */
async function viaWorker(url, { env = {}, ua = 'Mozilla/5.0', method = 'GET', now } = {}) {
  const realFetch = globalThis.fetch;
  const RealDate = globalThis.Date;
  globalThis.fetch = async (input) => {
    const u = new URL(typeof input === 'string' ? input : input.url);
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('not found', { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200 });
  };
  if (now) {
    globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return new RealDate(now).getTime(); } };
  }
  try {
    return await worker.fetch(new Request(url, { method, headers: { 'user-agent': ua } }), env);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.Date = RealDate;
  }
}

test('chicagoDate follows America/Chicago, not UTC', () => {
  assert.equal(chicagoDate(new Date('2026-10-17T04:59:00Z')), '2026-10-16'); // 23:59 CDT
  assert.equal(chicagoDate(new Date('2026-10-17T05:00:00Z')), '2026-10-17'); // 00:00 CDT
  assert.equal(chicagoDate(new Date('2026-12-01T05:59:00Z')), '2026-11-30'); // 23:59 CST
});

test('committed queue: >=30 variants, sections balanced, 1 a day from 17 Oct then up to 3 from 1 Nov, no section two days running, launch 5 kept', () => {
  assert.equal(queue.config.pins_per_day, 3);
  assert.equal(queue.config.pace.since, '2026-11-01');
  assert.equal(queue.config.drip_start, '2026-10-17');
  assert.equal(queue.config.timezone, 'America/Chicago');
  assert.ok(queue.variants.length >= 30, `${queue.variants.length} variants`);
  assertSectionShape(queue.variants, 'committed');
  assert.deepEqual(queue.launch.map((i) => i.slug), ['founding-100', 'weekly-planning', 'adhd-morning-routine', 'adhd-routine-bad-days', 'mind-body-spirit-planner']);
  assert.deepEqual({ channel: queue.channel, launch: queue.launch }, launchBlock(root));
  const dates = queue.variants.map((v) => v.release_date).sort();
  assert.equal(dates[0], '2026-10-17');
  const byDate = new Map();
  for (const v of queue.variants) byDate.set(v.release_date, [...(byDate.get(v.release_date) ?? []), v.section]);
  for (const [d, list] of byDate) {
    assert.ok(list.length <= (d < queue.config.pace.since ? 1 : queue.config.pins_per_day), `${d}: ${list.length} pins`);
    assert.equal(new Set(list).size, list.length, `${d}: one section twice`);
    for (const s of list) assert.ok(!(byDate.get(addDays(d, -1)) ?? []).includes(s), `${d}: #${s} two days running`);
  }
});

test('every variant: truthful limits, its own 1000x1500 PNG, distinct design within its section', () => {
  const ids = pageIds(root);
  for (const v of queue.variants) {
    assert.ok(ids.has(v.section), `${v.id}: #${v.section} not on the page`);
    assert.ok(v.title.length <= 100, `${v.id} title ${v.title.length}`);
    assert.ok(v.description.length <= 500, `${v.id} description ${v.description.length}`);
    assert.doesNotMatch([v.title, v.description, v.headline, v.body, ...v.points].join(' '), /\$\s?\d|\bspry\b|pay\.rev\.cat|gumroad|free trial/i, v.id);
    const buf = fs.readFileSync(path.join(root, v.image.path));
    assert.deepEqual(pngSize(buf), { width: 1000, height: 1500 }, v.id);
    assert.equal(buf.length, v.image.length, `${v.id} length`);
  }
  const images = queue.variants.map((v) => v.image.path);
  assert.equal(new Set(images).size, images.length, 'each variant has its own image');
});

test('dueVariants: release_date <= today only, newest first, capped', () => {
  const vs = [{ id: 'a', release_date: '2026-10-17', image: {} }, { id: 'b', release_date: '2026-10-18', image: {} }, { id: 'c', release_date: '2026-10-19', image: {} }, { id: 'd', release_date: null, image: {} }];
  assert.deepEqual(dueVariants(vs, '2026-10-18').map((v) => v.id), ['b', 'a']);
  assert.deepEqual(dueVariants(vs, '2026-10-16'), []);
  assert.deepEqual(dueVariants(vs, '2026-12-01', 2).map((v) => v.id), ['c', 'b']);
});

test('feed: today = the 5 launch items exactly; each drip day adds its one pin; newest 50 max', () => {
  const launchOnly = buildPinfeedXml(queue, '2026-10-16');
  assert.equal((launchOnly.match(/<item>/g) || []).length, 5);
  const first = queue.variants.find((v) => v.release_date === '2026-10-17');
  const day1 = buildPinfeedXml(queue, '2026-10-17');
  assert.equal((day1.match(/<item>/g) || []).length, 6);
  assert.ok(day1.indexOf(`aplayermode-pin-${first.id}<`) < day1.indexOf('aplayermode-pin-founding-100<'), 'newest first');
  assert.ok(day1.includes(`utm_campaign=pinfeed&amp;utm_content=${first.id}#${first.section}`));
  const big = clone(queue);
  for (let i = 0; i < 60; i += 1) big.variants.push({ ...big.variants[0], id: `x-${i}`, release_date: addDays('2026-10-17', i) });
  assert.equal((buildPinfeedXml(big, '2027-06-01').match(/<item>/g) || []).length, 50);
});

test('Worker serves /pinfeed.xml built at request time (America/Chicago date), no deploy per day', async () => {
  const before = await viaWorker('https://aplayermode.com/pinfeed.xml', { now: '2026-10-17T04:30:00Z' }); // 23:30 CDT on the 16th
  assert.equal(before.status, 200);
  assert.match(before.headers.get('content-type'), /^application\/rss\+xml/);
  assert.equal(((await before.text()).match(/<item>/g) || []).length, 5);
  const after = await viaWorker('https://aplayermode.com/pinfeed.xml', { now: '2026-10-17T05:30:00Z' }); // 00:30 CDT on the 17th
  assert.equal(((await after.text()).match(/<item>/g) || []).length, 6);
  const head = await viaWorker('https://aplayermode.com/pinfeed.xml', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(route('/pinfeed.xml').kind, 'feed');
  const img = await viaWorker(`https://aplayermode.com/${queue.variants[0].image.path}`);
  assert.equal(img.status, 200);
});

test('billionairehighperformancecoach.com and spryexecutiveos.com serve no pinfeed', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const published = tracked.filter((f) => /pinfeed/i.test(path.basename(f)) && !/^(workers|scripts|tests|config)\//.test(f));
  assert.deepEqual(published, [], 'a static pinfeed file would be published by Pages on the BHPC / spryexecutiveos hosts');
  for (const f of tracked.filter((x) => x.startsWith('functions/'))) assert.doesNotMatch(read(f), /pinfeed/i, f);
  assert.doesNotMatch(read('_redirects'), /pinfeed/i);
  const patterns = [...read('workers/aplayermode-com/wrangler.jsonc').matchAll(/"pattern":\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(patterns, ['aplayermode.com/*']);
  assert.ok(!fs.existsSync(path.join(root, 'aplayermode/pinfeed.xml')), 'aplayermode/pinfeed.xml would be served on BHPC at /aplayermode/pinfeed.xml');
});

test('scheduleVariants: pins_per_day, firstDay, never a section on consecutive days', () => {
  const vs = [];
  let seq = 0;
  for (const s of SECTIONS) for (let i = 0; i < 4; i += 1) vs.push({ id: `${s}-${i}`, seq: (seq += 1), section: s, release_date: null });
  scheduleVariants(vs, { pinsPerDay: 1, firstDay: '2026-10-17' });
  const byDate = new Map(vs.map((v) => [v.release_date, v.section]));
  assert.equal(byDate.size, vs.length);
  for (const [d, s] of byDate) assert.notEqual(byDate.get(addDays(d, -1)), s);
  assert.throws(() => scheduleVariants([], { pinsPerDay: 0, firstDay: '2026-10-17' }));
  // Only one section left: it cannot run two days running, so it waits for the next refill.
  const lone = [{ id: 'a', seq: 1, section: 'app', release_date: null }, { id: 'b', seq: 2, section: 'app', release_date: null }];
  scheduleVariants(lone, { pinsPerDay: 1, firstDay: '2026-10-17' });
  assert.deepEqual(lone.map((v) => v.release_date), ['2026-10-17', null]);
});

test('the Monday refill keeps the queue shape: two full refill_batch refills of the committed queue', () => {
  const q = clone(queue);
  for (const round of [1, 2]) {
    const planned = planRefill(q, angles, q.config.refill_batch);
    assert.equal(planned.length, q.config.refill_batch, `refill ${round}: ${planned.length} planned`);
    q.variants.push(...planned);
    assertSectionShape(q.variants, `refill ${round}`);
  }
});

test('weekly refill: due under refill_threshold unreleased; plans new designs, recycles angles in unused designs, never repeats one', () => {
  const q = clone(queue);
  const left = (d) => q.variants.filter((v) => !v.release_date || v.release_date > d).length;
  assert.equal(needsRefill({ ...q, config: { ...q.config, refill_threshold: left('2026-10-16') } }, '2026-10-16'), false);
  assert.equal(needsRefill(q, '2026-11-08'), left('2026-11-08') < q.config.refill_threshold);
  assert.equal(needsRefill({ ...q, config: { ...q.config, refill_threshold: left('2026-11-01') + 1 } }, '2026-11-01'), true);
  const planned = planRefill(q, angles, 21);
  assert.equal(planned.length, 21);
  q.variants.push(...planned);
  const key = (v) => `${v.headline}|${v.layout}|${v.palette}`;
  assert.equal(new Set(q.variants.map(key)).size, q.variants.length, 'a design repeated');
  for (const s of SECTIONS) {
    const vs = q.variants.filter((v) => v.section === s);
    for (let i = 1; i < vs.length; i += 1) assert.notEqual(vs[i].layout, vs[i - 1].layout, `${s}: same layout back to back`);
  }
  // Far beyond the angles: still new designs (angle x layout x palette), then Rule 0 stop (planRefill returns []).
  const many = planRefill(q, angles, 2000);
  assert.ok(many.length > 500);
  q.variants.push(...many);
  assert.equal(new Set(q.variants.map(key)).size, q.variants.length);
  assert.deepEqual(planRefill(q, angles, 5), []);
  assert.equal(unreleasedCount([{ release_date: null }, { release_date: '2026-10-20' }], '2026-10-20'), 1);
});

test('weekly step: Mondays CT in the governed daily lane, refill + render + guards + metrics, replayed by the push helper, $0', () => {
  const sh = read('scripts/aplayermode/weekly_pin_drip.sh');
  assert.match(sh, /TZ=America\/Chicago date \+%u\)" != "1"/);
  assert.match(sh, /node scripts\/aplayermode\/pin_queue\.mjs/);
  assert.match(sh, /validate:aplayermode-pin-drip/);
  assert.match(sh, /validate:aplayermode-pinterest/);
  assert.match(sh, /node scripts\/aplayermode\/collect_pin_metrics\.mjs/);
  assert.ok(fs.statSync(path.join(root, 'scripts/aplayermode/weekly_pin_drip.sh')).mode & 0o111, 'executable');
  const wf = read('.github/workflows/daily-citation-intelligence.yml');
  assert.match(wf, /cron:/);
  assert.match(wf, /run: bash scripts\/aplayermode\/weekly_pin_drip\.sh/);
  assert.match(wf, /WORKFLOW_ARGV:[\s\S]*bash scripts\/aplayermode\/weekly_pin_drip\.sh &&[\s\S]*commit_and_push_if_changed\.sh/);
  assert.match(wf, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(sh, /OPENROUTER|GEMINI|ANTHROPIC|OPENAI/, 'template copy only: no model key');
  assert.equal(queue.config.refill_threshold, 42); // two weeks at 3 a day
});

test('edge log: a data point per Pinterest page view, utm values only, never IP/UA, never crawlers', async () => {
  const p = pinVisitPoint(new URL('https://aplayermode.com/?utm_source=pinterest&utm_medium=organic&utm_campaign=pinfeed&utm_content=modes-03'), 'Mozilla/5.0 (iPhone)');
  assert.deepEqual(p, { indexes: ['modes-03'], blobs: ['modes-03', 'pinfeed', 'organic'], doubles: [1] });
  assert.equal(pinVisitPoint(new URL('https://aplayermode.com/?utm_source=pinterest'), 'Pinterestbot/1.0'), null);
  assert.equal(pinVisitPoint(new URL('https://aplayermode.com/?utm_source=google'), 'Mozilla/5.0'), null);
  const points = [];
  const env = { PIN_VISITS: { writeDataPoint: (x) => points.push(x) } };
  const res = await viaWorker('https://aplayermode.com/?utm_source=pinterest&utm_medium=organic&utm_campaign=pinfeed&utm_content=app-02', { env, ua: 'Mozilla/5.0' });
  assert.equal(res.status, 200);
  await viaWorker('https://aplayermode.com/pinfeed.xml', { env });
  await viaWorker('https://aplayermode.com/?utm_source=pinterest&utm_content=app-02', { env, ua: 'Pinterest/0.2 (+http://www.pinterest.com/bot.html)' });
  assert.equal(points.length, 1);
  assert.doesNotMatch(JSON.stringify(points), /Mozilla|\d+\.\d+\.\d+\.\d+/);
  const throwing = { PIN_VISITS: { writeDataPoint: () => { throw new Error('down'); } } };
  assert.equal((await viaWorker('https://aplayermode.com/?utm_source=pinterest', { env: throwing })).status, 200, 'measurement never breaks the page');
  assert.match(read('workers/aplayermode-com/wrangler.jsonc'), /"binding": "PIN_VISITS", "dataset": "aplayermode_pin_visits"/);
});

test('weekly metrics: NAMED STOP PINTEREST_METRICS_UNAVAILABLE naming the secret, never an unmeasured zero', async () => {
  const none = await collect({ env: {}, fetchImpl: () => { throw new Error('must not call'); } });
  assert.equal(none.status, 'NAMED_STOP');
  assert.equal(none.stop, 'PINTEREST_METRICS_UNAVAILABLE');
  assert.equal(none.secret, SECRET);
  assert.match(none.reason, /CLOUDFLARE_API_TOKEN/);
  const denied = await collect({ env: { [SECRET]: 't' }, fetchImpl: async () => new Response('{}', { status: 403 }) });
  assert.equal(denied.stop, 'PINTEREST_METRICS_UNAVAILABLE');
  let sent;
  const ok = await collect({ env: { [SECRET]: 't' }, fetchImpl: async (url, init) => { sent = { url, init }; return Response.json({ data: [{ variant: 'modes-03', visits: 4 }, { variant: 'founding-100', visits: 2 }] }); } });
  assert.equal(ok.status, 'MEASURED');
  assert.equal(ok.total, 6);
  assert.deepEqual(ok.by_variant, { 'modes-03': 4, 'founding-100': 2 });
  assert.match(sent.url, /\/accounts\/[0-9a-f]{32}\/analytics_engine\/sql$/);
  assert.match(sent.init.body, /FROM aplayermode_pin_visits/);
  assert.match(sent.init.body, /blob1 NOT IN \('verify-probe'\)/, 'live-verification test visits must be excluded from the weekly count');
  assert.equal(sent.init.headers.Authorization, 'Bearer t');
});

test('topic boards: each pin in exactly one board feed; topic feeds carry no pin released before the split', async () => {
  const { boardsOf, inBoardFeed, boardForSection } = await import('../../workers/aplayermode-com/src/pinqueue.js');
  const { list, split } = boardsOf(queue);
  assert.ok(list.length >= 4);
  for (const day of ['2026-11-01', '2026-11-20', '2027-06-01']) {
    const seen = new Map();
    for (const board of list) {
      const xml = buildPinfeedXml(queue, day, board);
      for (const [, guid] of xml.matchAll(/<guid isPermaLink="false">([^<]+)<\/guid>/g)) {
        assert.ok(!seen.has(guid), `${guid} in ${seen.get(guid)} and ${board.slug} on ${day}`);
        seen.set(guid, board.slug);
        const v = queue.variants.find((x) => `aplayermode-pin-${x.id}` === guid);
        if (board !== list[0]) assert.ok(v && v.release_date >= split && boardForSection(queue, v.section).slug === board.slug, `${board.slug} carries ${guid}`);
      }
    }
    const due = queue.variants.filter((v) => v.release_date && v.release_date <= day);
    if (due.length + queue.launch.length <= queue.config.max_feed_items) for (const v of due) assert.ok(seen.has(`aplayermode-pin-${v.id}`), `${v.id} due on ${day} but in no feed`);
  }
  assert.equal(inBoardFeed(queue, list[0], { section: 'pillars', release_date: '2026-10-20' }), true);
  assert.equal(inBoardFeed(queue, list[3], { section: 'pillars', release_date: '2026-10-20' }), false);
});

test('worker: /pinfeed/<board>.xml routes to the feed; an unknown board 404s', async () => {
  assert.deepEqual(route('/pinfeed/daily-routine.xml'), { kind: 'feed', upstream: '/aplayermode/data/pinterest/queue.json', feed: '/pinfeed/daily-routine.xml' });
  assert.equal(route('/pinfeed/../x.xml').kind, 'notfound');
});

test('stop rule: 0 visits at 4 weeks -> new format; 8 weeks -> pause, never delete', async () => {
  const { decidePace, applyFallback, applyPause } = await import('../../scripts/aplayermode/pace.mjs');
  const wk = (d, total, status = 'MEASURED') => ({ generated_at: `${d}T12:00:00Z`, status, total });
  const zeros = ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'].map((d) => wk(d, 0));
  const c = clone(queue).config;
  assert.equal(decidePace(c, zeros, '2026-11-28').action, 'keep');
  assert.equal(decidePace(c, [...zeros.slice(0, 3), wk('2026-11-28', 2)], '2026-11-30').action, 'keep');
  assert.equal(decidePace(c, [...zeros.slice(0, 3), wk('2026-11-28', null, 'NAMED_STOP')], '2026-11-30').action, 'keep');
  const d1 = decidePace(c, zeros, '2026-11-29');
  assert.equal(d1.action, 'fallback');
  applyFallback(c, '2026-11-29', d1.reason);
  assert.deepEqual(c.layouts, c.pace.fallback.layouts);
  const more = ['2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26'].map((d) => wk(d, 0));
  const d2 = decidePace(c, [...zeros, ...more], '2026-12-27');
  assert.equal(d2.action, 'pause');
  const vs = [{ release_date: '2026-12-01' }, { release_date: '2026-12-30' }];
  applyPause(c, vs, '2026-12-27', d2.reason);
  assert.deepEqual(vs.map((v) => v.release_date), ['2026-12-01', null]);
});
