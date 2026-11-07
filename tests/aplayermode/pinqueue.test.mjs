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
  SECTIONS, addDays, buildPinfeedXml, chicagoDate, dueVariants, isHeld, needsRefill, scheduleVariants, unreleasedCount, variantLink,
} from '../../workers/aplayermode-com/src/pinqueue.js';
import worker, { CONTENT_PAGES, pinVisitPoint, route } from '../../workers/aplayermode-com/src/index.js';
import { QUEUE_FILE, launchBlock, pageIds, pngSize } from '../../scripts/aplayermode/pinfeed_lib.mjs';
import { ALIKE_OVERLAP, allRoutines, gatePins, planRoutinePins, stepOverlap } from '../../scripts/aplayermode/routine_pins.mjs';
import { releaseHeld } from '../../scripts/aplayermode/release_held_pins.mjs';
import { collect, SECRET } from '../../scripts/aplayermode/collect_pin_metrics.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const queue = JSON.parse(read(QUEUE_FILE));
const routines = JSON.parse(read('config/aplayermode_routines.json'));
const routes = new Set(Object.keys(CONTENT_PAGES));
const clone = (x) => JSON.parse(JSON.stringify(x));
/**
 * A copy of the queue as it stood before the owner's release: every pin released from hold is held
 * again and undated. The release tests run on this, so they hold whether main still carries the held
 * pins or already carries their release (the 47 routine pins approved 7 Nov 2026).
 */
function preRelease(q) {
  const c = clone(q);
  for (const v of c.variants) {
    if (!v.released_from_hold) continue;
    v.held = { since: v.released_from_hold.held_since };
    v.release_date = null;
    delete v.released_from_hold;
  }
  if (c.variants.some(isHeld)) c.config.hold_new_pins = true;
  return c;
}
const HELD_FOR_SAMPLE = 47;

/** Run the real Worker against the committed tree as its Pages origin. */
async function viaWorker(url, { env = {}, ua = 'Mozilla/5.0', method = 'GET', now } = {}) {
  const realFetch = globalThis.fetch;
  const RealDate = globalThis.Date;
  globalThis.fetch = async (input) => {
    const u = new URL(typeof input === 'string' ? input : input.url);
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    if (!fs.existsSync(path.join(root, rel)) && fs.existsSync(path.join(root, `${rel}.html`))) rel += '.html'; // Pages serves /x for x.html
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

test('committed queue: >=30 variants, 1 a day from 17 Oct then up to 3 from 1 Nov, no section two days running, launch 5 kept', () => {
  assert.equal(queue.config.pins_per_day, 3);
  assert.equal(queue.config.pace.since, '2026-11-01');
  assert.equal(queue.config.drip_start, '2026-10-17');
  assert.equal(queue.config.timezone, 'America/Chicago');
  assert.ok(queue.variants.length >= 30, `${queue.variants.length} variants`);
  assert.deepEqual(queue.launch.map((i) => i.slug), ['founding-100', 'weekly-planning', 'adhd-morning-routine', 'adhd-routine-bad-days', 'mind-body-spirit-planner']);
  assert.deepEqual({ channel: queue.channel, launch: queue.launch }, launchBlock(root));
  const dated = queue.variants.filter((v) => !isHeld(v));
  for (const v of queue.variants.filter(isHeld)) assert.equal(v.release_date, null, `${v.id}: a held pin carries no date`);
  const dates = dated.map((v) => v.release_date).sort();
  assert.equal(dates[0], '2026-10-17');
  const byDate = new Map();
  for (const v of dated) byDate.set(v.release_date, [...(byDate.get(v.release_date) ?? []), v.section]);
  for (const [d, list] of byDate) {
    assert.ok(list.length <= (d < queue.config.pace.since ? 1 : queue.config.pins_per_day), `${d}: ${list.length} pins`);
    assert.equal(new Set(list).size, list.length, `${d}: one section twice`);
    for (const s of list) assert.ok(!(byDate.get(addDays(d, -1)) ?? []).includes(s), `${d}: #${s} two days running`);
  }
});

test('every variant: truthful limits, its own 1000x1500 PNG, distinct design within its section', () => {
  const ids = pageIds(root);
  for (const v of queue.variants) {
    assert.ok(v.page ? CONTENT_PAGES[v.page] : ids.has(v.section), `${v.id}: ${v.page || `#${v.section}`} not on the site`);
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

test('held pins: never in a feed and never dated by the scheduler, whatever their date', () => {
  const vs = [{ id: 'a', seq: 1, section: 'app', release_date: '2026-10-17', image: {} }, { id: 'h', seq: 2, section: 'modes', release_date: '2026-10-17', image: {}, held: { since: '2026-11-06' } }, { id: 'u', seq: 3, section: 'pillars', release_date: null, held: { since: '2026-11-06' } }];
  assert.deepEqual(dueVariants(vs, '2026-12-01').map((v) => v.id), ['a']);
  scheduleVariants(vs, { pinsPerDay: 3, firstDay: '2026-11-07' });
  assert.equal(vs[2].release_date, null);
  const q = preRelease(queue);
  const heldIds = new Set(q.variants.filter(isHeld).map((v) => v.id));
  assert.ok(heldIds.size >= HELD_FOR_SAMPLE, `${heldIds.size} pins held before the release`);
  for (const board of q.boards.list) for (const id of heldIds) assert.ok(!buildPinfeedXml(q, '2027-06-01', board).includes(`aplayermode-pin-${id}<`), `${id} in ${board.slug}`);
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

test('weekly refill: due under refill_threshold; one pin per unused routine, pages in turn, held while hold_new_pins, then the named stop', () => {
  const q = clone(queue);
  const left = (d) => q.variants.filter((v) => !v.release_date || v.release_date > d).length;
  assert.equal(needsRefill(q, '2026-11-08'), left('2026-11-08') < q.config.refill_threshold);
  const used = new Set(q.variants.map((v) => v.routine).filter(Boolean));
  const unused = allRoutines(routines).filter((x) => !used.has(x.key));
  const planned = planRoutinePins(q, routines, 10, { held: { since: '2026-11-09' } });
  assert.equal(planned.length, unused.length, 'plans only routines no pin has used');
  for (const v of planned) { assert.ok(v.held, `${v.id} planned held`); assert.equal(v.release_date, null); }
  q.variants.push(...planned);
  assert.deepEqual(planRoutinePins(q, routines, 5), [], 'every routine has its pin: nothing more to plan (pin_queue.mjs names PINTEREST_QUEUE_EXHAUSTED)');
  // From an empty queue: pages take turns, so the first pins are one per page.
  const fresh = planRoutinePins({ ...q, variants: [] }, routines, routines.pages.length);
  assert.deepEqual(fresh.map((v) => v.section), routines.pages.map((p) => p.slug));
  assert.deepEqual(gatePins(fresh, q, routes), []);
  assert.equal(unreleasedCount([{ release_date: null }, { release_date: '2026-10-20' }], '2026-10-20'), 1);
});

test('pin gate: refuses sales words, a title off its board phrases, the home page, unreadable steps, old-style designs and two pins alike', () => {
  const good = planRoutinePins({ ...queue, variants: [] }, routines, 1)[0];
  assert.deepEqual(gatePins([good], queue, routes), []);
  const refused = (patch) => gatePins([{ ...good, ...patch }], queue, routes);
  for (const word of ['Join the Founding 100', 'member rate', 'Join today', '$9.99/month', 'Executive Roundtable', 'Executive Suite', 'Autopilot', 'Cancel any time']) {
    assert.ok(refused({ description: `${good.description} ${word}` }).some((e) => /refused word/.test(e)), word);
    assert.ok(refused({ points: [...good.points.slice(0, 5), word.slice(0, 30)] }).some((e) => /refused word/.test(e)), `${word} on the image`);
  }
  assert.ok(refused({ title: 'It runs your day. You just start.' }).some((e) => /does not start with/.test(e)));
  assert.ok(refused({ page: '/' }).some((e) => /home page/.test(e)));
  assert.ok(refused({ page: '/routines/not-a-page/' }).some((e) => /not a page/.test(e)));
  assert.ok(refused({ points: good.points.slice(0, 3) }).some((e) => /3 steps/.test(e)));
  assert.ok(refused({ points: [...good.points.slice(0, 5), 'A step far too long to read at Pinterest grid size'] }).some((e) => /unreadable/.test(e)));
  assert.ok(refused({ layout: 'phone', palette: 'dark' }).some((e) => /not a routine design/.test(e)));
  // Alike: the same routine twice, the same title, or steps that mostly overlap.
  const twin = { ...good, id: 'twin' };
  assert.ok(gatePins([good, twin], queue, routes).some((e) => /alike: same routine/.test(e)));
  assert.ok(gatePins([good, { ...twin, routine: 'x/y', title: good.title.toUpperCase() }], queue, routes).some((e) => /alike: same title/.test(e)));
  assert.ok(gatePins([good, { ...twin, routine: 'x/y', title: `${good.title} again`, headline: 'Other', points: [...good.points.slice(0, 5), 'Something new'] }], queue, routes).some((e) => /alike: steps/.test(e)));
  assert.ok(stepOverlap(good, { points: ['Feed the cat', 'Water the plants', 'Read a chapter', 'Call a friend'] }) < ALIKE_OVERLAP);
});

test('committed queue: every pending or released-from-hold pin is a routine pin, held undated or dated after its release, that passes the gate and opens its routine page (200 through the Worker)', async () => {
  const pending = queue.variants.filter((v) => isHeld(v) || !v.release_date || v.release_date > chicagoDate());
  const sample = queue.variants.filter((v) => isHeld(v) || v.released_from_hold);
  assert.ok(sample.length >= HELD_FOR_SAMPLE, `${sample.length} pins held or released from hold`);
  const checked = [...new Map([...pending, ...sample].map((v) => [v.id, v])).values()];
  assert.deepEqual(gatePins(checked, queue, routes), []);
  for (const v of checked) {
    assert.ok(v.routine, `${v.id}: every pending or released-from-hold pin is a routine pin`);
    if (isHeld(v)) assert.equal(v.release_date, null, `${v.id}: a held pin waits undated`);
    else assert.ok(v.release_date, `${v.id}: a pin not held is dated by the scheduler`);
    if (v.released_from_hold) assert.ok(v.release_date > v.released_from_hold.at, `${v.id}: released ${v.released_from_hold.at}, dated ${v.release_date}: never on or before its release day`);
    const r = routines.pages.find((p) => p.slug === v.section).routines.find((x) => `${v.section}/${x.id}` === v.routine);
    assert.deepEqual(v.points, r.steps, `${v.id}: the pin shows its page's steps`);
    const link = variantLink(v);
    assert.ok(link.startsWith(`https://aplayermode.com${v.page}?`) && !link.includes('#'), link);
  }
  for (const page of new Set(checked.map((v) => v.page))) {
    const res = await viaWorker(`https://aplayermode.com${page}?utm_source=pinterest&utm_content=probe`);
    assert.equal(res.status, 200, page);
    const html = await res.text();
    for (const v of checked.filter((x) => x.page === page)) for (const s of v.points) assert.ok(html.includes(s.replace(/'/g, '&#39;')) || html.includes(s), `${page} lacks "${s}"`);
  }
  assert.equal(execFileSync(process.execPath, ['scripts/aplayermode/build_routine_pages.mjs', '--check'], { cwd: root, encoding: 'utf8' }).includes('OK'), true, 'routine pages match their config');
});

test('release: one command clears every hold after the gate; the scheduler then dates them; releasing twice is a named stop', () => {
  const q = preRelease(queue);
  const held = q.variants.filter(isHeld).length;
  assert.ok(held >= HELD_FOR_SAMPLE, `${held} pins held before the release`);
  assert.deepEqual(releaseHeld(q, '2026-11-08'), { released: held });
  assert.equal(q.variants.filter(isHeld).length, 0);
  assert.equal(q.config.hold_new_pins, undefined);
  scheduleVariants(q.variants, { pinsPerDay: 3, firstDay: '2026-11-09' });
  const dated = q.variants.filter((v) => v.released_from_hold);
  assert.equal(dated.length, held, 'every released pin keeps its release record');
  assert.ok(dated.every((v) => v.release_date), 'the scheduler dates every released pin');
  assert.ok(dated.every((v) => v.release_date >= '2026-11-09'), 'released pins start tomorrow, never in the past');
  assert.match(releaseHeld(q, '2026-11-08').error, /^NOTHING_HELD/);
  const bad = preRelease(queue);
  bad.variants.find(isHeld).title = 'Join the Founding 100';
  assert.match(releaseHeld(bad, '2026-11-08').error, /^PIN_GATE_REFUSED/);
  const wf = read('.github/workflows/aplayermode-pin-drip.yml');
  assert.match(wf, /release_held:/);
  assert.match(wf, /RELEASE_HELD: \$\{\{ inputs\.release_held \}\}/);
  assert.match(read('scripts/aplayermode/weekly_pin_drip.sh'), /RELEASE_HELD:-\}" = "yes" \]; then node scripts\/aplayermode\/release_held_pins\.mjs/);
});

test('edge log: a pin visit to a routine page is counted, like one to the home page', async () => {
  const points = [];
  const env = { PIN_VISITS: { writeDataPoint: (p) => points.push(p) } };
  const page = Object.keys(CONTENT_PAGES).find((r) => r.startsWith('/routines/'));
  assert.ok(page, 'a routine page is routed');
  await viaWorker(`https://aplayermode.com${page}?utm_source=pinterest&utm_medium=organic&utm_campaign=pinfeed&utm_content=r-1`, { env });
  await viaWorker(`https://aplayermode.com${page}`, { env });
  assert.deepEqual(points.map((p) => p.indexes[0]), ['r-1']);
});

test('weekly step: Mondays CT in its own lane, refill + render + guards + metrics, replayed by the push helper, $0', () => {
  const sh = read('scripts/aplayermode/weekly_pin_drip.sh');
  assert.match(sh, /TZ=America\/Chicago date \+%u\)" != "1"/);
  assert.match(sh, /node scripts\/aplayermode\/pin_queue\.mjs/);
  assert.match(sh, /validate:aplayermode-pin-drip/);
  assert.match(sh, /validate:aplayermode-pinterest/);
  assert.match(sh, /node scripts\/aplayermode\/collect_pin_metrics\.mjs/);
  assert.ok(fs.statSync(path.join(root, 'scripts/aplayermode/weekly_pin_drip.sh')).mode & 0o111, 'executable');
  const wf = read('.github/workflows/aplayermode-pin-drip.yml');
  assert.match(wf, /cron: "\d+ \d+ \* \* 1"/, 'scheduled on Mondays');
  assert.match(wf, /run: bash scripts\/aplayermode\/weekly_pin_drip\.sh/);
  assert.match(wf, /WORKFLOW_ARGV: bash scripts\/aplayermode\/weekly_pin_drip\.sh\n\s+run: \.\/\.github\/scripts\/commit_and_push_if_changed\.sh/);
  assert.match(wf, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(sh, /OPENROUTER|GEMINI|ANTHROPIC|OPENAI/, 'template copy only: no model key');
  assert.equal(queue.config.refill_threshold, 9); // three days at 3 a day: routines run out, never repeat
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
  const ok = await collect({ env: { [SECRET]: 't' }, history: [], fetchImpl: async (url, init) => { sent = { url, init }; return Response.json({ data: [{ variant: 'modes-03', visits: 4 }, { variant: 'founding-100', visits: 2 }] }); } });
  assert.equal(ok.status, 'MEASURED');
  assert.equal(ok.total, 6);
  assert.deepEqual(ok.by_variant, { 'modes-03': 4, 'founding-100': 2 });
  assert.match(sent.url, /\/accounts\/[0-9a-f]{32}\/analytics_engine\/sql$/);
  assert.match(sent.init.body, /FROM aplayermode_pin_visits/);
  assert.match(sent.init.body, /blob1 NOT IN \('verify-probe'\)/, 'live-verification test visits must be excluded from the weekly count');
  assert.equal(sent.init.headers.Authorization, 'Bearer t');
});

test('weekly metrics: each count covers every day since the last MEASURED count, never a fixed 7 days', async () => {
  const now = new Date('2026-11-09T13:40:00Z');
  const run = async (history) => {
    let body;
    const r = await collect({ env: { [SECRET]: 't' }, now, history, fetchImpl: async (url, init) => { body = init.body; return Response.json({ data: [] }); } });
    return { r, body };
  };
  // Last count 10 days ago (a lane moved weekday); a later named stop counted nothing and does not move the start.
  const gap = await run([
    { generated_at: '2026-10-26T15:09:17.783Z', status: 'MEASURED' },
    { generated_at: '2026-10-30T15:00:00.000Z', status: 'MEASURED' },
    { generated_at: '2026-11-02T15:00:00.000Z', status: 'NAMED_STOP' },
  ]);
  assert.match(gap.body, /timestamp > toDateTime\('2026-10-30 15:00:00'\)/);
  assert.equal(gap.r.window_start, '2026-10-30T15:00:00.000Z');
  assert.doesNotMatch(gap.body, /INTERVAL '7' DAY/);
  // First count ever: the last 7 days. A count older than the 90-day retention: capped at 90 days.
  assert.match((await run([])).body, /toDateTime\('2026-11-02 13:40:00'\)/);
  assert.match((await run([{ generated_at: '2026-01-01T00:00:00Z', status: 'MEASURED' }])).body, /toDateTime\('2026-08-11 13:40:00'\)/);
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
