#!/usr/bin/env node
/**
 * Guards aplayermode.com's Pinterest launch (owner-approved, 16 Oct 2026). The
 * Pinterest presence is A Player Mode, never Spry. Checks run through the real
 * Worker (workers/aplayermode-com/src/index.js) with its Pages origin stubbed by the
 * committed files, so "served by aplayermode.com" means what the Worker serves.
 *
 * WHAT IT REFUSES
 *   1. The aplayermode.com homepage, rendered through the Worker, without exactly
 *      <meta name="p:domain_verify" content="d7a730694bec0d2a36fc4d789e496d5e"/>
 *      in its <head>; and that claim on any other host's page (the root
 *      index.html is the homepage of billionairehighperformancecoach.com and
 *      spryexecutiveos.com; every other committed .html is scanned too).
 *   2. A feed at https://aplayermode.com/pinfeed.xml that is not 200
 *      application/rss+xml, not well-formed RSS 2.0, or differs from what
 *      workers/aplayermode-com/src/pinqueue.js builds from
 *      aplayermode/data/pinterest/queue.json for today in America/Chicago; a queue
 *      whose channel/launch block differs from config/aplayermode_pinfeed.json
 *      (one definition, no hand edits); a static pinfeed file anywhere the Pages
 *      project publishes, or a pinfeed route on any host but aplayermode.com
 *      (billionairehighperformancecoach.com and spryexecutiveos.com serve none).
 *   2b. Daily drip (16 Oct 2026): fewer than 30 queued variants; a launch item
 *      dropped; pins_per_day not 1; an undated variant; one before drip_start; one
 *      section on two consecutive days; a variant on a section the page lacks; a
 *      price, Spry or checkout in variant copy. The feed is also built as of the
 *      last release date, so EVERY queued pin is checked by rule 3 before its day.
 *   3. Fewer than 3 items; an item missing title (<=100 chars) / link /
 *      description (<=500 chars) / pubDate / enclosure / media:content; a link
 *      that is not aplayermode.com with utm_source=pinterest, utm_medium=organic,
 *      utm_campaign=pinfeed and a fragment that is a real id on the page; an
 *      image that is not on aplayermode.com, not served 200 by the Worker, not a
 *      1000x1500 PNG, or whose enclosure length is not its byte size; any
 *      checkout link (pay.rev.cat) or Spry branding in the feed.
 *   4. A Pinterest profile avatar that is not a square PNG >= 600, or a banner
 *      that is not a 16:9 PNG >= 1600x900, served 200 on aplayermode.com.
 *   Rule 0: zero items, zero images or zero scanned pages is a failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, launchBlock, pngSize, QUEUE_FILE, PIN_WIDTH, PIN_HEIGHT } from '../aplayermode/pinfeed_lib.mjs';
import { addDays, buildPinfeedXml, chicagoDate } from '../../workers/aplayermode-com/src/pinqueue.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const META = '<meta name="p:domain_verify" content="d7a730694bec0d2a36fc4d789e496d5e"/>';
const HOST = 'https://aplayermode.com';
const errors = [];
const fail = (m) => errors.push(m);

// The Pages origin, stubbed by the committed tree (the deploy publishes the root).
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('not found', { status: 404 });
  const type = rel.endsWith('.html') ? 'text/html; charset=utf-8' : rel.endsWith('.json') ? 'application/json' : rel.endsWith('.xml') ? 'application/xml' : rel.endsWith('.png') ? 'image/png' : 'application/octet-stream';
  return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': type } });
};
const worker = (await import(pathToFileURL(path.join(root, 'workers/aplayermode-com/src/index.js')).href)).default;
const get = (url) => worker.fetch(new Request(url));

// 1. Domain claim.
const home = await get(`${HOST}/`);
const homeHtml = await home.text();
const head = (homeHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [])[1] || '';
if (home.status !== 200) fail(`aplayermode.com/ answered ${home.status}`);
if (!head.includes(META)) fail(`aplayermode.com homepage <head> lacks ${META}`);
if ((homeHtml.match(/p:domain_verify/g) || []).length !== 1) fail('aplayermode.com homepage must carry exactly one p:domain_verify');
const pageIds = new Set([...homeHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const tracked = execFileSync('git', ['ls-files', '*.html'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
let scanned = 0;
for (const rel of tracked) {
  if (rel === 'aplayermode/index.html') continue;
  scanned += 1;
  if (fs.existsSync(path.join(root, rel)) && fs.readFileSync(path.join(root, rel), 'utf8').includes('p:domain_verify')) fail(`${rel} carries the aplayermode.com Pinterest claim; it belongs on aplayermode.com only`);
}
if (!tracked.includes('index.html') || scanned === 0) fail('Rule 0: the BHPC / spryexecutiveos homepage (index.html) was not scanned');

// 2. Feed served by the Worker.
for (const alias of ['/pinfeed', '/pinfeed/']) {
  const r = await get(`${HOST}${alias}`);
  if (r.status !== 301 || r.headers.get('location') !== `${HOST}/pinfeed.xml`) fail(`${alias} must 301 to ${HOST}/pinfeed.xml`);
}
const feedRes = await get(`${HOST}/pinfeed.xml`);
const feed = await feedRes.text();
if (feedRes.status !== 200) fail(`/pinfeed.xml answered ${feedRes.status}`);
if (!/^application\/rss\+xml\b/.test(feedRes.headers.get('content-type') || '')) fail(`/pinfeed.xml Content-Type is ${feedRes.headers.get('content-type')}, not application/rss+xml`);
const cfg = loadConfig(root);
const queue = JSON.parse(fs.readFileSync(path.join(root, QUEUE_FILE), 'utf8'));
const today = chicagoDate();
if (feed !== buildPinfeedXml(queue, today)) fail(`/pinfeed.xml served by the Worker differs from buildPinfeedXml(${QUEUE_FILE}, ${today})`);
const block = launchBlock(root);
if (JSON.stringify({ channel: queue.channel, launch: queue.launch }) !== JSON.stringify(block)) fail(`${QUEUE_FILE} channel/launch differ from config/aplayermode_pinfeed.json; run node scripts/aplayermode/build_pinterest_assets.mjs --feed-only`);

// No pinfeed on BHPC / spryexecutiveos: no static feed file the Pages project could
// publish, no Pages Function or _redirects rule for it, and the Worker that builds
// it is routed to aplayermode.com only.
const allTracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
for (const rel of allTracked) {
  if (/pinfeed/i.test(path.basename(rel)) && !/^(workers|scripts|tests|config)\//.test(rel)) fail(`${rel}: a static pinfeed file would be served on billionairehighperformancecoach.com / spryexecutiveos.com by Pages`);
  if (/^functions\//.test(rel) && /pinfeed/i.test(fs.readFileSync(path.join(root, rel), 'utf8'))) fail(`${rel}: a Pages Function mentions pinfeed; the feed belongs to aplayermode.com only`);
}
if (/pinfeed/i.test(fs.readFileSync(path.join(root, '_redirects'), 'utf8'))) fail('_redirects routes a pinfeed on the Pages hosts');
const wr = fs.readFileSync(path.join(root, 'workers/aplayermode-com/wrangler.jsonc'), 'utf8');
const patterns = [...wr.matchAll(/"pattern":\s*"([^"]+)"/g)].map((m) => m[1]);
if (!patterns.length || patterns.some((p) => !p.startsWith('aplayermode.com/'))) fail(`aplayermode-com Worker routes ${JSON.stringify(patterns)}: must be aplayermode.com/* only`);

// 2b. Daily drip queue.
const ids = pageIds;
const variants = queue.variants || [];
if (variants.length < 30) fail(`queue holds ${variants.length} variants; at least 30 required`);
if (queue.config.pins_per_day !== 1) fail(`pins_per_day is ${queue.config.pins_per_day}; the owner approved 1`);
if (queue.launch.length !== 5 || queue.launch.map((i) => i.slug).join() !== cfg.items.map((i) => i.slug).join()) fail('the 5 launch items must keep their queue entries');
const byDate = new Map();
for (const v of variants) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.release_date || '')) { fail(`${v.id}: no release_date`); continue; }
  if (v.release_date < queue.config.drip_start) fail(`${v.id}: release ${v.release_date} before drip_start ${queue.config.drip_start}`);
  if (!ids.has(v.section)) fail(`${v.id}: section #${v.section} is not an id on the aplayermode.com page`);
  if (/\$\s?\d|\bspry\b|pay\.rev\.cat|gumroad/i.test([v.title, v.description, v.headline, v.body, ...(v.points || [])].join(' '))) fail(`${v.id}: copy carries a price, Spry or a checkout`);
  byDate.set(v.release_date, [...(byDate.get(v.release_date) || []), v.section]);
}
for (const [d, secs] of byDate) {
  if (secs.length > queue.config.pins_per_day) fail(`${d}: ${secs.length} pins on one day`);
  for (const s of secs) if ((byDate.get(addDays(d, -1)) || []).includes(s)) fail(`${d}: section #${s} two days running`);
}
const lastDay = variants.reduce((m, v) => (v.release_date > m ? v.release_date : m), today);
const fullFeed = buildPinfeedXml(queue, lastDay);

function wellFormed(xml) {
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) return 'missing XML declaration';
  const body = xml.replace(/^<\?xml[^>]*\?>/, '');
  const stack = [];
  let last = 0; let roots = 0;
  for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g)) {
    const text = body.slice(last, m.index);
    if (/[<>]/.test(text) || /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(text)) return `bad text near ${JSON.stringify(text.slice(0, 40))}`;
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(m[3])) return `bad attribute in <${m[2]}>`;
    last = m.index + m[0].length;
    if (m[1]) { if (stack.pop() !== m[2]) return `mismatched </${m[2]}>`; } else if (!m[4]) { if (!stack.length) roots += 1; stack.push(m[2]); } else if (!stack.length) roots += 1;
  }
  if (body.slice(last).trim()) return 'trailing content';
  if (stack.length || roots !== 1) return 'unbalanced document';
  return null;
}
const wf = wellFormed(feed);
if (wf) fail(`/pinfeed.xml is not well-formed XML: ${wf}`);
if (!/<rss version="2\.0"[^>]*xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/.test(feed)) fail('feed is not RSS 2.0 with the media namespace');
if (/pay\.rev\.cat|gumroad|spry/i.test(feed)) fail('feed links the checkout or carries Spry / Gumroad; Pinterest is A Player Mode only and links the landing page');

// 3. Items.
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const itemsOf = (xml) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
const items = itemsOf(feed);
if (items.length < 3) fail(`feed has ${items.length} items; at least 3 required`);
const fullItems = itemsOf(fullFeed);
const expectFull = Math.min(queue.config.max_feed_items, queue.launch.length + variants.length);
if (fullItems.length !== expectFull) fail(`feed as of ${lastDay} has ${fullItems.length} items, expected ${expectFull}`);
if (wellFormed(fullFeed)) fail(`feed as of ${lastDay} is not well-formed XML: ${wellFormed(fullFeed)}`);
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`)); return m ? unesc(m[1]) : null; };
let images = 0;
const checked = new Set();
for (const [i, [when, x]] of [...items.map((it) => ['today', it]), ...fullItems.map((it) => [lastDay, it])].entries()) {
  const at = `item ${i + 1} (feed as of ${when})`;
  if (checked.has(x)) continue;
  checked.add(x);
  const title = tag(x, 'title'); const link = tag(x, 'link'); const desc = tag(x, 'description'); const date = tag(x, 'pubDate');
  if (!title || title.length > 100) fail(`${at}: title missing or over 100 chars (${title && title.length})`);
  if (!desc || desc.length > 500) fail(`${at}: description missing or over 500 chars (${desc && desc.length})`);
  if (!date || Number.isNaN(Date.parse(date)) || new Date(date).toUTCString() !== date) fail(`${at}: pubDate ${date} is not an RFC 822 date`);
  let u = null;
  try { u = new URL(link); } catch { fail(`${at}: link ${link} is not a URL`); }
  if (u) {
    if (u.origin !== HOST) fail(`${at}: link ${link} is not on aplayermode.com`);
    for (const [k, v] of [['utm_source', 'pinterest'], ['utm_medium', 'organic'], ['utm_campaign', 'pinfeed']]) if (u.searchParams.get(k) !== v) fail(`${at}: link lacks ${k}=${v}`);
    const page = await get(u.toString());
    if (page.status !== 200) fail(`${at}: link ${link} answered ${page.status} through the Worker`);
    if (u.hash && !pageIds.has(u.hash.slice(1))) fail(`${at}: link fragment ${u.hash} is not an id on the aplayermode.com page`);
    const guid = tag(x, 'guid') || '';
    if (u.searchParams.get('utm_content') !== guid.replace(/^aplayermode-pin-/, '')) fail(`${at}: utm_content ${u.searchParams.get('utm_content')} is not the pin id ${guid}`);
  }
  const enc = x.match(/<enclosure url="([^"]+)" length="(\d+)" type="image\/png"\/>/);
  const media = x.match(/<media:content url="([^"]+)" type="image\/png" medium="image" width="(\d+)" height="(\d+)"\/>/);
  if (!enc || !media) { fail(`${at}: enclosure and media:content are both required`); continue; }
  const img = unesc(enc[1]);
  if (unesc(media[1]) !== img) fail(`${at}: media:content and enclosure point at different images`);
  if (!img.startsWith(`${HOST}/`)) { fail(`${at}: image ${img} is not on aplayermode.com`); continue; }
  const r = await get(img);
  const buf = Buffer.from(await r.arrayBuffer());
  const dim = pngSize(buf);
  if (r.status !== 200) fail(`${at}: image ${img} answered ${r.status} through the Worker`);
  else if (!dim || dim.width !== PIN_WIDTH || dim.height !== PIN_HEIGHT) fail(`${at}: image ${img} is not a ${PIN_WIDTH}x${PIN_HEIGHT} PNG (${JSON.stringify(dim)})`);
  else if (Number(enc[2]) !== buf.length) fail(`${at}: enclosure length ${enc[2]} != ${buf.length} bytes`);
  else images += 1;
}
if (images === 0) fail('Rule 0: zero pin images verified');

// 4. Profile images.
for (const [kind, spec] of Object.entries(cfg.profile)) {
  const r = await get(`${HOST}/${spec.path}`);
  const dim = pngSize(Buffer.from(await r.arrayBuffer()));
  if (r.status !== 200 || !dim) { fail(`${kind} ${spec.path} not served 200 as PNG`); continue; }
  if (kind === 'avatar' && (dim.width !== dim.height || dim.width < 600)) fail(`avatar must be square >= 600 (${dim.width}x${dim.height})`);
  if (kind === 'banner' && (dim.width * 9 !== dim.height * 16 || dim.width < 1600)) fail(`banner must be 16:9 >= 1600x900 (${dim.width}x${dim.height})`);
}

globalThis.fetch = realFetch;
if (errors.length) {
  console.error(`[validate:aplayermode-pinterest] FAIL (${errors.length})`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`[validate:aplayermode-pinterest] PASS: meta on aplayermode.com only (${scanned} other pages scanned), feed today ${items.length} items, ${variants.length} queued through ${lastDay}, ${images} distinct items' pins 1000x1500 served 200, no pinfeed on the Pages hosts`);
