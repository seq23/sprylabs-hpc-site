// The Pinterest stop rule (spry brain, Growth playbook, 1 Nov 2026): 0 clicks at 4
// weeks -> new format; 8 weeks -> pause (never delete). Read from
// reports/pinterest/aplayermode_metrics_history.json; only MEASURED rows count (a named
// stop is not a zero). queue.config.pace = { since, review_after_days, fallback:
// { layouts }, fell_back_at, paused_at, log }. Applied by scripts/aplayermode/pin_queue.mjs.
import { addDays } from '../../workers/aplayermode-com/src/pinqueue.js';

/** { action: 'keep' | 'fallback' | 'pause', reason } */
export function decidePace(config, history, today) {
  const pace = config.pace;
  if (!pace?.since) return { action: 'keep', reason: 'no pace rule configured' };
  if (pace.paused_at) return { action: 'pause', reason: `paused since ${pace.paused_at}` };
  const from = pace.fell_back_at ?? pace.since;
  const due = addDays(from, pace.review_after_days ?? 28);
  if (today < due) return { action: 'keep', reason: `review on ${due}` };
  const weeks = new Map();
  for (const row of history ?? []) {
    if (row?.status !== 'MEASURED' || typeof row.generated_at !== 'string' || row.generated_at.slice(0, 10) < from) continue;
    weeks.set(row.generated_at.slice(0, 10), Number(row.total ?? NaN));
  }
  const totals = [...weeks.values()];
  if (totals.length < 4) return { action: 'keep', reason: `only ${totals.length} measured week(s) since ${from}; 4 needed` };
  const visits = totals.reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0);
  if (totals.some((n) => !Number.isFinite(n)) || visits > 0) return { action: 'keep', reason: `${visits} Pinterest visit(s) in ${totals.length} measured weeks since ${from}` };
  if (!pace.fell_back_at) return { action: 'fallback', reason: `0 Pinterest visits in ${totals.length} measured weeks since ${from}` };
  return { action: 'pause', reason: `0 Pinterest visits in ${totals.length} measured weeks since the new format on ${from}` };
}

export function applyFallback(config, today, reason) {
  config.layouts = [...config.pace.fallback.layouts];
  config.pace.fell_back_at = today;
  config.pace.log = [...(config.pace.log ?? []), { at: today, change: `new format: layouts ${config.layouts.join('/')}`, why: reason }];
  return config;
}

export function applyPause(config, variants, today, reason) {
  if (!config.pace.paused_at) {
    config.pace.paused_at = today;
    config.pace.log = [...(config.pace.log ?? []), { at: today, change: 'paused: no new pins dated; published pins stay', why: reason }];
  }
  for (const v of variants) if (v.release_date && v.release_date > today) v.release_date = null;
  return config;
}
