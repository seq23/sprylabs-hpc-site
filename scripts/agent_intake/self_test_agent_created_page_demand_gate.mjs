#!/usr/bin/env node
// Self-test for the demand gate the exact-agent planner asks BEFORE a page
// exists (build_bhpc_agent_exact_implementation_plan.mjs, "THE DEMAND GATE IS
// ASKED HERE"), and the one reader behind it (scripts/lib/measured_demand.mjs).
//
// It replays the 2026-09-20 incident in a scratch repository with the REAL plan
// builder and the REAL applier, and proves:
//
//   1. NEGATIVE: with no data/demand/measured_demand.json at all, every
//      CREATE_NEW_TARGET_PAGE spec of the 2026-09-19 artifact is planned BLOCKED
//      with the named reason `no_measured_demand:...`, agent_page_specs omits it,
//      the applier writes nothing, and the plan's required count excludes it.
//   2. NEGATIVE: with the file present but neither fixture query recorded, the
//      verdict is the same - an empty file is not a pass.
//   3. PARTIAL: with exactly one query seeded (owner_approved_seed, approved_by
//      set) only that page plans PLANNED; the other stays BLOCKED. The block is
//      per query, not per run.
//   4. POSITIVE: with both seeded, both plan PLANNED and the applier creates both
//      pages - the gate admits, it does not merely refuse. An alias counts.
//   5. The demand validator and the planner read the same file through the same
//      function: the query set the reader returns for the real repository is
//      exactly the set validate_demand_backed_pages.mjs would build by hand.
//   6. Rule 0 on itself: a fixture artifact with no CREATE spec proves nothing,
//      and the self-test hard-fails on it.
import fs from 'node:fs';
import path from 'node:path';
import {MEASURED_DEMAND_PATH, NO_MEASURED_DEMAND_REASON, measuredDemandQueries, hasMeasuredDemand} from '../lib/measured_demand.mjs';
import {REAL_ROOT, PAGES, QUERIES, SPECS, readJson, writeJson, makeScratch, seedRecord, seedDemand, plan, apply} from './self_test_scratch_repo.mjs';

const TAG = '[agent-created-page-demand-gate-self-test]';
let assertions = 0;
const failures = [];
function check(cond, message) { assertions += 1; if (!cond) failures.push(message); }
const createSpecs = (p) => p.specs.filter((s) => s.operation === 'CREATE_NEW_TARGET_PAGE' && PAGES.includes(s.implementation_path));
const statusByPath = (p) => Object.fromEntries(PAGES.map((rel) => [rel, [...new Set(createSpecs(p).filter((s) => s.implementation_path === rel).map((s) => s.status))]]));
const blockedFor = (p, rel) => createSpecs(p).filter((s) => s.implementation_path === rel && s.status === 'BLOCKED');

const scratch = makeScratch({demand: null});
try {
  // ── 6. Rule 0: the fixture must actually ask for a create ───────────────────
  let p = plan(scratch);
  if (!createSpecs(p).length) {
    console.error(`${TAG} FAIL: the fixture artifact planned no CREATE_NEW_TARGET_PAGE spec for ${PAGES.join(', ')}; a demand gate proved against no create is not proved.`);
    process.exit(1);
  }

  // ── 1. NEGATIVE: no demand file → every create is BLOCKED, named ────────────
  check(!fs.existsSync(path.join(scratch, MEASURED_DEMAND_PATH)), 'precondition: the scratch starts with no measured_demand.json');
  check(createSpecs(p).every((s) => s.status === 'BLOCKED'), `no demand file: every create must plan BLOCKED, got ${JSON.stringify(statusByPath(p))}`);
  for (const rel of PAGES) {
    const b = blockedFor(p, rel);
    check(b.length > 0 && b.every((s) => s.blocked_reason.startsWith(`${NO_MEASURED_DEMAND_REASON}:`) && s.blocked_reason.includes(MEASURED_DEMAND_PATH)), `${rel}: the BLOCKED reason must be named ${NO_MEASURED_DEMAND_REASON} and cite ${MEASURED_DEMAND_PATH}: ${JSON.stringify(b.map((s) => s.blocked_reason.slice(0, 80)))}`);
    check(b.every((s) => QUERIES.some((q) => s.blocked_reason.includes(`"${q}"`))), `${rel}: the reason must quote the query it refused`);
  }
  check(p.no_measured_demand_count > 0 && p.required_acceptance_entry_count === 0, `the plan must count the refused entries (no_measured_demand_count=${p.no_measured_demand_count}) and exclude them from required_acceptance_entry_count (${p.required_acceptance_entry_count})`);
  check(Object.keys(readJson(path.join(scratch, SPECS)).new_pages || {}).length === 0, 'agent_page_specs.generated.json must omit a demand-blocked page so apply_citation_program.py cannot materialize it');
  apply(scratch);
  check(PAGES.every((rel) => !fs.existsSync(path.join(scratch, rel))), 'agent:bhpc:apply-exact must not create a demand-blocked page');

  // ── 2. NEGATIVE: an empty file is not a pass ────────────────────────────────
  seedDemand(scratch, []);
  p = plan(scratch);
  check(createSpecs(p).every((s) => s.status === 'BLOCKED'), `empty demand file: every create must still plan BLOCKED, got ${JSON.stringify(statusByPath(p))}`);

  // ── 3. PARTIAL: one seed lifts one block ────────────────────────────────────
  seedDemand(scratch, [QUERIES[0]]);
  p = plan(scratch);
  let st = statusByPath(p);
  check(st[PAGES[0]].length === 1 && st[PAGES[0]][0] === 'PLANNED', `one seed: ${PAGES[0]} must plan PLANNED, got ${JSON.stringify(st)}`);
  check(st[PAGES[1]].length === 1 && st[PAGES[1]][0] === 'BLOCKED', `one seed: ${PAGES[1]} must stay BLOCKED, got ${JSON.stringify(st)}`);
  check(Object.keys(readJson(path.join(scratch, SPECS)).new_pages || {}).join() === PAGES[0], 'one seed: agent_page_specs must carry exactly the seeded page');

  // ── 4. POSITIVE: both seeded (one via alias) → both PLANNED, both created ───
  const aliased = seedRecord('an owner-chosen head term');
  aliased.aliases = [QUERIES[1].toUpperCase()];
  writeJson(path.join(scratch, MEASURED_DEMAND_PATH), {schema_version: '1.0', record_count: 2, records: [seedRecord(QUERIES[0]), aliased]});
  p = plan(scratch);
  st = statusByPath(p);
  check(PAGES.every((rel) => st[rel].length === 1 && st[rel][0] === 'PLANNED'), `both seeded: both must plan PLANNED (an alias, case-insensitive, counts), got ${JSON.stringify(st)}`);
  check(p.no_measured_demand_count === 0, `both seeded: no_measured_demand_count must be 0, got ${p.no_measured_demand_count}`);
  apply(scratch);
  check(PAGES.every((rel) => fs.existsSync(path.join(scratch, rel))), 'both seeded: the applier must create both pages');

  // ── 5. One reader: planner and validator agree on the real file ─────────────
  const viaLib = measuredDemandQueries(REAL_ROOT);
  const byHand = new Set();
  for (const r of readJson(path.join(REAL_ROOT, MEASURED_DEMAND_PATH)).records || []) {
    byHand.add(String(r.query_normalized || r.query).toLowerCase().trim());
    for (const a of r.aliases || []) byHand.add(String(a).toLowerCase().trim());
  }
  check(viaLib.size > 0 && viaLib.size === byHand.size && [...byHand].every((q) => viaLib.has(q)), `the shared reader must return exactly the validator's hand-built set for the real repository (lib=${viaLib.size}, hand=${byHand.size})`);
  check(hasMeasuredDemand(viaLib, '  How To Stop Overthinking ') && !hasMeasuredDemand(viaLib, '') && !hasMeasuredDemand(viaLib, 'a query nobody measured'), 'hasMeasuredDemand must normalize case and whitespace, and refuse the empty query');
} finally {
  fs.rmSync(scratch, {recursive: true, force: true});
}

if (failures.length) {
  console.error(`${TAG} FAIL: ${failures.length} of ${assertions} assertion(s) failed`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`${TAG} PASS: ${assertions} assertion(s); a create whose query has no demand record is planned BLOCKED ${NO_MEASURED_DEMAND_REASON} before the page exists, an absent or empty demand file refuses everything, one seed lifts one block, an alias counts, and the planner and the demand validator read the file through one function.`);
