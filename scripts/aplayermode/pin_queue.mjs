#!/usr/bin/env node
/**
 * aplayermode.com Pinterest daily drip: keep aplayermode/data/pinterest/queue.json
 * stocked and dated (owner-approved 16 Oct 2026).
 *
 *   node scripts/aplayermode/pin_queue.mjs             weekly: refill if low, render, date
 *   node scripts/aplayermode/pin_queue.mjs --seed 7    add 7 variants per section now
 *   options: --today YYYY-MM-DD (default: today in America/Chicago)
 *
 * 1. Launch block: the five #136 items and the channel are re-derived from
 *    config/aplayermode_pinfeed.json (scripts/aplayermode/pinfeed_lib.mjs launchBlock).
 * 2. A section whose id left aplayermode/index.html loses its UNRELEASED variants
 *    (a pin never links a fragment the page lacks).
 * 3. Refill: when fewer than config.refill_threshold variants are unreleased, plan
 *    config.refill_batch more (workers/aplayermode-com/src/pinqueue.js planRefill)
 *    from config/aplayermode_pin_angles.json ($0, template copy, no model call) and
 *    render their 1000x1500 PNGs (scripts/aplayermode/render_pin.mjs).
 * 4. Dates: config.pins_per_day a day from tomorrow, never one section two days running.
 * Exits 1 naming PINTEREST_QUEUE_EXHAUSTED when a refill is due and no new pin can be
 * made: a refill that adds nothing is not a pass (Rule 0).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, chicagoDate, needsRefill, planRefill, scheduleVariants, unreleasedCount } from '../../workers/aplayermode-com/src/pinqueue.js';
import { DRIP_DIR, PIN_HEIGHT, PIN_WIDTH, QUEUE_FILE, launchBlock, pageIds } from './pinfeed_lib.mjs';
import { renderVariants } from './render_pin.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const today = opt('--today') ?? chicagoDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`--today must be YYYY-MM-DD, got ${today}`);
const seed = opt('--seed') ? Number(opt('--seed')) : 0;

const queuePath = path.join(root, QUEUE_FILE);
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const angles = JSON.parse(fs.readFileSync(path.join(root, 'config/aplayermode_pin_angles.json'), 'utf8')).sections;
const log = [];

// 1. Launch block from its one definition.
Object.assign(queue, launchBlock(root));

// 2. Sections the page still has.
const ids = pageIds(root);
const before = queue.variants.length;
queue.variants = queue.variants.filter((v) => (v.release_date && v.release_date <= today) || ids.has(v.section));
if (queue.variants.length !== before) log.push(`DROPPED ${before - queue.variants.length} unreleased variant(s) whose section left the page`);
const live = Object.fromEntries(Object.entries(angles).filter(([s]) => ids.has(s)));

// 3. Refill.
const due = seed > 0 || needsRefill(queue, today);
const count = seed > 0 ? seed * Object.keys(live).length : queue.config.refill_batch;
const planned = due ? planRefill(queue, live, count) : [];
if (due && !planned.length) {
  console.error(`NAMED STOP: PINTEREST_QUEUE_EXHAUSTED - ${unreleasedCount(queue.variants, today)} unreleased (threshold ${queue.config.refill_threshold}) and every angle x layout x palette is used; add angles to config/aplayermode_pin_angles.json.`);
  process.exit(1);
}
queue.variants.push(...planned);

const missing = queue.variants.filter((v) => !v.image || !fs.existsSync(path.join(root, v.image.path)));
const sizes = missing.length ? await renderVariants(root, missing, DRIP_DIR) : {};
for (const v of missing) v.image = { path: `${DRIP_DIR}/${v.id}.png`, length: sizes[v.id], width: PIN_WIDTH, height: PIN_HEIGHT };

// 4. Dates.
const firstDay = [queue.config.drip_start, addDays(today, 1)].sort().pop();
scheduleVariants(queue.variants, { pinsPerDay: queue.config.pins_per_day, firstDay });
queue.variants.sort((a, b) => a.seq - b.seq);

const ordered = { _comment: queue._comment, config: queue.config, channel: queue.channel, launch: queue.launch, variants: queue.variants };
fs.writeFileSync(queuePath, `${JSON.stringify(ordered, null, 2)}\n`);
const last = queue.variants.reduce((max, v) => (v.release_date && v.release_date > max ? v.release_date : max), '');
for (const line of log) console.log(line);
console.log(`[pin-queue] ${due ? `refilled +${planned.length}` : 'no refill due'}, ${missing.length} image(s) rendered, ${unreleasedCount(queue.variants, today)} unreleased after ${today} (threshold ${queue.config.refill_threshold}), dated through ${last || 'none'}, ${queue.variants.length} total`);
