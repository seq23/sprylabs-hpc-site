#!/usr/bin/env node
import {readJson,planFromCandidates,writeJson} from './pipeline_lib.mjs';
const candidates=readJson('data/signals/release_candidates/latest_release_candidates.json',{candidates:[]}).candidates||[];
const plan=planFromCandidates(candidates);
writeJson('artifacts/validation/daily-citation-release-plan.json',plan);writeJson('reports/daily-citation-release-plan.json',plan);
// Rule 0: this lane spent 8+ weeks printing PASS with selected=0 while discarding
// 100% of its candidates behind a gate nothing ever enabled. A plan that selects
// nothing is a stop, and it must be named loudly enough that a human sees it.
if(plan.stop_reason){
  console.error(`[release:plan] STOP ${plan.stop_reason.code}: ${plan.stop_reason.message}`);
  if(plan.stop_reason.decision_histogram)console.error(`[release:plan] decisions: ${JSON.stringify(plan.stop_reason.decision_histogram)}`);
  console.error(`[release:plan] planned=${plan.summary.release_units_planned} selected=0 skipped=${plan.summary.skipped_units} blocked=${plan.summary.blocked_units}`);
  process.exit(1);
}
console.log(`[release:plan] PASS selected=${plan.summary.selected_units} skipped=${plan.summary.skipped_units} blocked=${plan.summary.blocked_units}`);
