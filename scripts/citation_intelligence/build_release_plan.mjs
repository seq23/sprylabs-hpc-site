#!/usr/bin/env node
import {readJson,planFromCandidates,writeJson,nonFixtureContribution} from './pipeline_lib.mjs';
const candidates=readJson('data/signals/release_candidates/latest_release_candidates.json',{candidates:[]}).candidates||[];
const plan=planFromCandidates(candidates);
writeJson('artifacts/validation/daily-citation-release-plan.json',plan);writeJson('reports/daily-citation-release-plan.json',plan);
// Rule 0: this lane spent 8+ weeks printing PASS with selected=0 while discarding
// 100% of its candidates behind a gate nothing ever enabled. A plan that selects
// nothing is a stop, and it must be named loudly enough that a human sees it.
// One stop reason, and only one, is a legitimate zero: the lane has no real
// signal source to work from. Every enabled non-fixture source either needs an
// operator file that is not there or credentials/terms authority the owner has
// deliberately withheld, and publishing fixture-derived pages to a public site is
// exactly what the fixture gate exists to prevent. That is a NAMED STOP, not a
// break, and a lane that is red every morning for a configuration the owner chose
// teaches everyone to ignore the lane.
//
// It stays a hard failure the moment a real source does contribute, because then
// zero selected means the pipeline discarded real demand - which is the defect
// this stop was written to expose in the first place, when the lane printed PASS
// with selected=0 for eight weeks behind a gate nothing had enabled. The
// discrimination is evidence-based: it reads what the collection ledger says
// arrived on this run, not what the registry claims is configured.
if(plan.stop_reason){
  const contribution=nonFixtureContribution();
  const ownerInputMissing=plan.stop_reason.code==='ALL_CANDIDATES_FIXTURE_ONLY'&&contribution.records===0;
  plan.stop_reason.non_fixture_contribution=contribution;
  plan.stop_reason.exit_code=ownerInputMissing?0:1;
  writeJson('artifacts/validation/daily-citation-release-plan.json',plan);writeJson('reports/daily-citation-release-plan.json',plan);
  const line=ownerInputMissing?console.log:console.error;
  line(`[release:plan] NAMED STOP ${plan.stop_reason.code}: ${plan.stop_reason.message}`);
  if(plan.stop_reason.decision_histogram)line(`[release:plan] decisions: ${JSON.stringify(plan.stop_reason.decision_histogram)}`);
  line(`[release:plan] planned=${plan.summary.release_units_planned} selected=0 skipped=${plan.summary.skipped_units} blocked=${plan.summary.blocked_units}`);
  if(ownerInputMissing){
    line(`[release:plan] WHO MUST ACT: the repo owner. No enabled producing source delivered a record this run (configured: ${contribution.configured.join(', ')||'none'}). Supply data/signals/manual_import.json, or enable a credentialed source in data/signals/source_registry.json. Until then this lane has nothing real to publish and will not publish fixtures. Exiting 0 as a declared stop, not as success.`);
    process.exit(0);
  }
  console.error(`[release:plan] a producing source delivered ${contribution.records} record(s) and the plan still selected nothing; that is a pipeline defect, not a configuration gap.`);
  process.exit(1);
}
console.log(`[release:plan] PASS selected=${plan.summary.selected_units} skipped=${plan.summary.skipped_units} blocked=${plan.summary.blocked_units}`);
