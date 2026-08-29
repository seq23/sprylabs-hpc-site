#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel, fallback=null) => { const abs = path.join(ROOT, rel); return fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs,'utf8')) : fallback; };
const write = (rel, payload) => { const abs = path.join(ROOT, rel); fs.mkdirSync(path.dirname(abs), {recursive:true}); fs.writeFileSync(abs, JSON.stringify(payload,null,2)+'\n'); };

// WHAT THIS LANE DELIVERS
//
// It used to re-select the same first 10 of 288 candidates every day, tag them
// READY_FOR_CONTROLLED_RELEASE_PLAN, and print PASS - while zero of the 288
// target_path files had ever been created. Nothing consumes the queue: its only
// reader validates row flags and writes nothing.
//
// The lane was never broken at producing a backlog. It was broken at claiming a
// delivery it never made. So the deliverable is the ranked advisory backlog
// itself, and the rows say plainly that nothing was built. Building the pages is
// deliberately NOT this lane's job: filling a quota with template pages is what
// put 2,412 duplicate gap-fill stubs in the tree (removed in 51531683a), and
// duplication is not the citation lever - shape and reachability are.

const strategy = read('data/strategy/citation_strategy_profile.json', {});
const backlog = read('data/strategy/strategy_gap_fill_backlog.json', {candidates:[]});
const dailyTarget = Number(strategy.cadence?.daily_target_units || 15);
const maxNew = Number(strategy.cadence?.max_new_pages_per_day || 10);
const existingPlan = read('artifacts/validation/daily-citation-release-plan.json', {selected:[], candidates:[]});
const ready = Array.isArray(existingPlan.selected) ? existingPlan.selected.length : 0;
const shortfall = Math.max(0, dailyTarget - ready);
const candidates = backlog.candidates || [];

// Real work #1: reconcile every candidate against the tree, so the advisory is
// current rather than a static slice. A candidate whose page now exists is done.
const slugOf = (s) => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const existingSlugs = new Set();
(function walk(dir){
  for (const e of fs.readdirSync(path.join(ROOT,dir), {withFileTypes:true})) {
    if (['node_modules','.git','.build','.pages-output','artifacts','reports'].includes(e.name)) continue;
    const rel = `${dir}/${e.name}`.replace(/^\.\//,'');
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith('.html')) existingSlugs.add(slugOf(e.name.replace(/\.html$/,'')));
  }
})('.');
const reconciled = candidates.map((row) => {
  const built = !!(row.target_path && fs.existsSync(path.join(ROOT, row.target_path)));
  const covered = built || existingSlugs.has(slugOf(row.query));
  return {...row, built, covered};
});
const builtCount = reconciled.filter((r) => r.built).length;
const coveredCount = reconciled.filter((r) => r.covered).length;
const openCandidates = reconciled.filter((r) => !r.covered);

// Real work #2: rank what is still open, spreading across query families so the
// advisory does not hand back ten variations of one topic.
const seenFamily = new Map();
const ranked = openCandidates
  .map((row) => {
    const family = row.query_family || row.pillar || 'unassigned';
    const n = (seenFamily.get(family) || 0) + 1;
    seenFamily.set(family, n);
    return {...row, query_family: family, family_rank: n};
  })
  .sort((a,b) => a.family_rank - b.family_rank || String(a.id).localeCompare(String(b.id)))
  .map((row, i) => ({...row, rank: i + 1}));

const selected = ranked.slice(0, Math.min(maxNew, shortfall)).map((row) => ({
  ...row,
  // Nothing downstream may read these rows as delivered work.
  status: 'ADVISORY_NOT_BUILT',
  delivery_state: 'ADVISORY_NOT_BUILT',
  built: false,
  target_path_is_proposed: true,
  proposed_path: row.target_path,
  queued_by: 'bhpc_strategy_gap_fill_release_gap'
}));

write('data/strategy/strategy_gap_fill_release_queue.json', {
  schema_version: '1.1',
  generated_at: `${process.env.SOURCE_DATE || '2026-07-03'}T00:00:00.000Z`,
  lane_product: 'ranked_advisory_backlog',
  advisory_only: true,
  nothing_is_built_by_this_lane: true,
  daily_target_units: dailyTarget,
  ready_before: ready,
  shortfall,
  backlog_candidates: candidates.length,
  covered_candidates: coveredCount,
  open_candidates: ranked.length,
  selected_count: selected.length,
  selected
});

// Rule 0: work done, or a named legitimate stop. Producing a current ranked
// advisory IS the work, so this exits 0 - but it states in the artifact and on
// stdout that nothing was built and why, so no reader can mistake it for delivery.
const named_outcome = {
  code: 'ADVISORY_BACKLOG_PUBLISHED',
  message: `Published a ranked advisory backlog: ${candidates.length} candidate(s) reconciled against the tree, ${coveredCount} already covered, ${ranked.length} still open, top ${selected.length} surfaced. No pages were built and none were claimed: this lane's deliverable is the advisory, not the pages. Building them is a separate decision - quota-filling this backlog with template pages is what produced the 2,412 duplicate stubs removed in 51531683a.`,
  backlog_candidates: candidates.length,
  covered_candidates: coveredCount,
  open_candidates: ranked.length,
  built_by_this_lane: 0
};

write('artifacts/validation/strategy-gap-fill-release-gap.json', {
  status: 'PASS',
  outcome: named_outcome,
  lane_product: 'ranked_advisory_backlog',
  advisory_only: true,
  daily_target_units: dailyTarget,
  ready_before: ready,
  shortfall,
  max_new_pages_per_day: maxNew,
  added_count: selected.length,
  backlog_candidates: candidates.length,
  covered_candidates: coveredCount,
  open_candidates: ranked.length,
  materialized_target_paths: builtCount
});

// The one thing that is genuinely a failure: producing no advisory at all.
if (candidates.length === 0) {
  console.error('[bhpc-strategy-gap-release] STOP EMPTY_BACKLOG: the backlog holds zero candidates, so this lane produced no advisory. Run strategy:gap-fill:backlog first.');
  process.exit(1);
}
if (ranked.length === 0) {
  console.log(`[bhpc-strategy-gap-release] PASS ADVISORY_BACKLOG_PUBLISHED: all ${candidates.length} candidate(s) are already covered; nothing open to advise.`);
} else {
  console.log(`[bhpc-strategy-gap-release] PASS ADVISORY_BACKLOG_PUBLISHED: ${candidates.length} candidate(s) reconciled, ${coveredCount} covered, ${ranked.length} open, top ${selected.length} surfaced as advisory. Built 0 pages and claimed 0 - this lane advises, it does not publish.`);
}
