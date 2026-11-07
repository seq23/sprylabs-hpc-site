#!/usr/bin/env node
/**
 * Release the held A Player Mode pins (the owner's yes on the sample, 7 Nov 2026).
 *
 * The one command (from anywhere, no checkout):
 *   gh workflow run aplayermode-pin-drip.yml -R seq23/sprylabs-hpc-site -f release_held=yes
 * The drip lane runs this, then scripts/aplayermode/pin_queue.mjs dates the released pins at
 * pins_per_day from tomorrow (America/Chicago) and the push helper commits the queue; Pages
 * publishes it and the Worker's feeds pick the pins up on their day.
 *
 * Clears every `held` block (keeping a released_from_hold record) and queue.config.hold_new_pins,
 * after the routine-pin gate passes on them. Exits 1 naming NOTHING_HELD when no pin is held
 * (a release that releases nothing is not a pass), or PIN_GATE_REFUSED with the reasons.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isHeld } from '../../workers/aplayermode-com/src/pinqueue.js';
import { CONTENT_PAGES } from '../../workers/aplayermode-com/src/index.js';
import { QUEUE_FILE } from './pinfeed_lib.mjs';
import { gatePins } from './routine_pins.mjs';

export function releaseHeld(queue, today) {
  const held = queue.variants.filter(isHeld);
  if (!held.length) return { error: 'NOTHING_HELD - no held pin in the queue; nothing to release' };
  const refused = gatePins(held, queue, new Set(Object.keys(CONTENT_PAGES)));
  for (const v of held) if (!v.routine) refused.push(`${v.id}: an old-style pin is never released`);
  if (refused.length) return { error: `PIN_GATE_REFUSED - ${refused.length} problem(s):\n  ${refused.join('\n  ')}` };
  for (const v of held) {
    v.released_from_hold = { at: today, held_since: v.held.since };
    delete v.held;
    v.release_date = null;
  }
  delete queue.config.hold_new_pins;
  return { released: held.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const file = path.join(root, QUEUE_FILE);
  const queue = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { chicagoDate } = await import('../../workers/aplayermode-com/src/pinqueue.js');
  const r = releaseHeld(queue, chicagoDate());
  if (r.error) { console.error(`NAMED STOP: ${r.error}`); process.exit(1); }
  fs.writeFileSync(file, `${JSON.stringify(queue, null, 2)}\n`);
  console.log(`[release-held] released ${r.released} pin(s); pin_queue.mjs dates them next`);
}
