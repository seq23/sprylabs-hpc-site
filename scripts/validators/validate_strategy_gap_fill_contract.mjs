#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel, fallback=null) => { const abs=path.join(ROOT,rel); return fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs,'utf8')) : fallback; };
const strategy = read('data/strategy/citation_strategy_profile.json', {});
const contract = read('data/strategy/strategy_gap_fill_contract.json', {});
const backlog = read('data/strategy/strategy_gap_fill_backlog.json', {candidates:[]});
const dailyTarget = Number(strategy.cadence?.daily_target_units || 15);
const horizon = Number(contract.time_horizon_days || strategy.primary_kpi?.time_horizon_days || 180);
const minimum = dailyTarget * horizon * Number(contract.minimum_backlog_multiplier || 1);
const required = contract.required_candidate_fields || [];
const errors = [];
// The floor used to be an error: `backlog_under_floor` failed the build unless
// the backlog held daily_target_units x horizon candidates - 15 x 180 = 2700.
// The only supply feeding this backlog is a template generator, so the only way
// to satisfy that floor was to cycle the same template combinations with a
// counter suffix ("... - strategy gap fill 1" ... 2700) until the count was
// reached. A number demanded, filler produced: the same failure that put 743
// quota-filled pages into the library through the BHPC report contract.
//
// A backlog that is short is short. That is reportable information about
// supply, not a broken contract, so it is recorded and surfaced rather than
// thrown. What still fails is a malformed candidate, which is what this
// validator can actually judge.
// The 2,700 floor stays demoted for the reason above. What is restored is a floor on
// the backlog existing at all: every candidate check - required fields, admission
// basis, finish flags, gap separation, duplicate paths - runs inside the loop below,
// and read()'s silent {candidates:[]} fallback turned a deleted or renamed backlog
// file into "PASS: candidates=0; minimum=2700; shortfall=2700".
const BACKLOG_PATH = 'data/strategy/strategy_gap_fill_backlog.json';
if (!fs.existsSync(path.join(ROOT, BACKLOG_PATH))) {
  console.error(`[bhpc-strategy-gap-fill-contract] FAIL: ${BACKLOG_PATH} is missing; every candidate check in this validator runs over its \`candidates\` array, so there is nothing to judge and a pass would be false.`);
  process.exit(1);
}
if (!Array.isArray(backlog.candidates) || !backlog.candidates.length) {
  console.error(`[bhpc-strategy-gap-fill-contract] FAIL: ${BACKLOG_PATH} carries no \`candidates\`; a short backlog is reportable, but a backlog with zero entries means the field, admission-basis, finish-flag and gap-separation checks examined nothing.`);
  process.exit(1);
}
const backlogCount = (backlog.candidates || []).length;
const backlogShortfall = Math.max(0, minimum - backlogCount);
const paths = new Set();
for (const [index, row] of (backlog.candidates || []).entries()) {
  for (const field of required) if (!(field in row)) errors.push(`candidate_${index}_missing:${field}`);
  if (row.admission_basis !== 'BHPC_STRATEGY_GAP_FILL_NON_AGENT') errors.push(`candidate_${index}_bad_admission:${row.admission_basis}`);
  if (row.self_healing_required !== true || row.prevalidation_required !== true) errors.push(`candidate_${index}_missing_finish_flags`);
  if (row.exact_agent_content === true || row.fallback_gap_fill !== true) errors.push(`candidate_${index}_gap_separation_failure`);
  if (paths.has(row.target_path)) errors.push(`duplicate_target_path:${row.target_path}`); else paths.add(row.target_path);
  if (index > 50 && errors.length) break;
}
const pkg = read('package.json', {scripts:{}});
for (const s of ['strategy:gap-fill:backlog','strategy:gap-fill:release-gap']) if (!pkg.scripts?.[s]) errors.push(`missing_script:${s}`);
const report = {schema_version:'1.0', validator:'strategy-gap-fill-contract', status:errors.length?'FAIL':'PASS', daily_target_units:dailyTarget, time_horizon_days:horizon, minimum_units:minimum, targets_are_quotas:false, candidate_count:backlogCount, backlog_shortfall:backlogShortfall, backlog_status:backlogShortfall?'SHORT_OF_TARGET':'TARGET_MET', errors};
fs.mkdirSync(path.join(ROOT,'artifacts/validation'), {recursive:true});
fs.writeFileSync(path.join(ROOT,'artifacts/validation/strategy-gap-fill-contract.json'), JSON.stringify(report,null,2)+'\n');
if (errors.length) { console.error(JSON.stringify(report,null,2)); process.exit(1); }
console.log(`[bhpc-strategy-gap-fill-contract] PASS: candidates=${report.candidate_count}; minimum=${minimum}; backlog=${report.backlog_status}; shortfall=${backlogShortfall}`);
