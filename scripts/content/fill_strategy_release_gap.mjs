#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel, fallback=null) => { const abs = path.join(ROOT, rel); return fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs,'utf8')) : fallback; };
const write = (rel, payload) => { const abs = path.join(ROOT, rel); fs.mkdirSync(path.dirname(abs), {recursive:true}); fs.writeFileSync(abs, JSON.stringify(payload,null,2)+'\n'); };
const strategy = read('data/strategy/citation_strategy_profile.json', {});
const backlog = read('data/strategy/strategy_gap_fill_backlog.json', {candidates:[]});
const dailyTarget = Number(strategy.cadence?.daily_target_units || 15);
const maxNew = Number(strategy.cadence?.max_new_pages_per_day || 10);
const existingPlan = read('artifacts/validation/daily-citation-release-plan.json', {selected:[], candidates:[]});
const ready = Array.isArray(existingPlan.selected) ? existingPlan.selected.length : 0;
const shortfall = Math.max(0, dailyTarget - ready);
const selected = (backlog.candidates || []).slice(0, Math.min(maxNew, shortfall)).map(row => ({...row, status:'READY_FOR_CONTROLLED_RELEASE_PLAN', queued_by:'bhpc_strategy_gap_fill_release_gap'}));
write('data/strategy/strategy_gap_fill_release_queue.json', {schema_version:'1.0', generated_at:`${process.env.SOURCE_DATE || '2026-07-03'}T00:00:00.000Z`, daily_target_units:dailyTarget, ready_before:ready, shortfall, selected_count:selected.length, selected});
// Rule 0: this lane re-selected the same first 10 of 288 candidates every day and
// printed PASS, while zero of the 288 target_path files have ever been created.
// The queue's only reader (scripts/content/self_heal_generated_content.mjs)
// validates row flags and never writes a page, so nothing turns a queued row into
// a file. Measure that directly and refuse to report success for phantom work.
const materialized = (backlog.candidates || []).filter((row) => row.target_path && fs.existsSync(path.join(ROOT, row.target_path))).length;
const stop_reason = selected.length > 0 && materialized === 0 ? {
  code: 'QUEUE_HAS_NO_CONSUMER',
  message: `Queued ${selected.length} candidate(s) into data/strategy/strategy_gap_fill_release_queue.json, but 0 of ${(backlog.candidates||[]).length} backlog target_path files exist on disk. No stage turns a queued row into a page: the queue's only reader validates row flags and writes nothing. Until a consumer exists that creates target_path files, this lane is selecting work that can never be delivered.`,
  backlog_candidates: (backlog.candidates||[]).length,
  materialized_target_paths: materialized
} : null;
write('artifacts/validation/strategy-gap-fill-release-gap.json', {status: stop_reason?'STOPPED':'PASS', stop_reason, daily_target_units:dailyTarget, ready_before:ready, shortfall, max_new_pages_per_day:maxNew, added_count:selected.length, backlog_candidates:(backlog.candidates||[]).length, materialized_target_paths:materialized});
if (stop_reason) {
  console.error(`[bhpc-strategy-gap-release] STOP ${stop_reason.code}: ${stop_reason.message}`);
  process.exit(1);
}
console.log(`[bhpc-strategy-gap-release] PASS: ready_before=${ready}; shortfall=${shortfall}; selected=${selected.length}; materialized=${materialized}`);
