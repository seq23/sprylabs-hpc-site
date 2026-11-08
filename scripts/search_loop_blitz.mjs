#!/usr/bin/env node
// The one switch for the two-week Search Loop blitz (~10 pages a day) on
// billionairehighperformancecoach.com. The blocks it applies live in
// search-loop.config.json under "blitz"; the engine ignores that key.
//   node scripts/search_loop_blitz.mjs on      mode normal, cap from blitz.on, ends_on = today + days
//   node scripts/search_loop_blitz.mjs off     mode slow, cap from blitz.off
//   node scripts/search_loop_blitz.mjs status  prints the state
//   node scripts/search_loop_blitz.mjs auto    run by the post-build: past ends_on -> off (NAMED NOTE)
// The engine's own 2/4/8-week checks keep, strengthen, undo or merge every page the blitz publishes.
import fs from 'node:fs';

export function apply(cfg, cmd, today = new Date().toISOString().slice(0, 10)) {
  const b = cfg.blitz;
  if (!b || !b.on || !b.off || !Number.isInteger(b.days)) throw new Error('NAMED STOP [BLITZ_CONFIG] search-loop.config.json has no complete "blitz" block');
  const isOn = cfg.mode === b.on.mode && cfg.cap?.max_per_day === b.on.cap.max_per_day && !!b.ends_on;
  if (cmd === 'status') return { cfg, changed: false, line: `blitz ${isOn ? `ON until ${b.ends_on}` : 'off'} (mode ${cfg.mode}, max_per_day ${cfg.cap?.max_per_day})` };
  if (cmd === 'on') {
    const end = new Date(Date.parse(today + 'T00:00:00Z') + b.days * 864e5).toISOString().slice(0, 10);
    return { cfg: { ...cfg, mode: b.on.mode, cap: { ...b.on.cap }, blitz: { ...b, status: `on since ${today}`, ends_on: end } }, changed: true, line: `blitz ON until ${end}: mode ${b.on.mode}, ${b.on.cap.max_per_day} pages/day, cap ${b.on.cap.max_live_pages}` };
  }
  if (cmd === 'off' || (cmd === 'auto' && isOn && today > b.ends_on)) {
    const why = cmd === 'auto' ? `NAMED NOTE [BLITZ_ENDED] the blitz passed ${b.ends_on}; back to ${b.off.mode}` : `blitz off: mode ${b.off.mode}`;
    return { cfg: { ...cfg, mode: b.off.mode, cap: { ...b.off.cap }, blitz: { ...b, status: `off since ${today}`, ends_on: null } }, changed: true, line: why };
  }
  if (cmd === 'auto') return { cfg, changed: false, line: isOn ? `blitz ON until ${b.ends_on}` : 'blitz off' };
  throw new Error(`NAMED STOP [BLITZ_UNKNOWN_COMMAND] "${cmd}": use on, off, status or auto`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = 'search-loop.config.json';
  const { cfg, changed, line } = apply(JSON.parse(fs.readFileSync(file, 'utf8')), process.argv[2] || 'status');
  if (changed) fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`OUTPUT ${line}`);
}
