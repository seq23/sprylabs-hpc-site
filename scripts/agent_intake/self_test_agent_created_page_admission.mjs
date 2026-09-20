#!/usr/bin/env node
// Self-test for the created-page admission gate
// (scripts/agent_intake/admit_bhpc_agent_created_pages.mjs) and the quarantine
// ledger every writer of an agent-created page reads.
//
// It replays the 2026-09-19 incident in a scratch repository, with the REAL
// plan builder, the REAL applier, the REAL admission validator and the two REAL
// pages, and proves:
//
//   1. NEGATIVE: the pair Spry Content Release 35477412322 created and committed
//      (fixtures/.../near_duplicate_pair, 0.764 similarity) is rejected by the
//      gate BEFORE it could be committed - both files removed, both quarantined,
//      the registry untouched, the outcome a NAMED stop with exit 0.
//   2. The rebuilt plan carries both specs as BLOCKED with the gate's reason,
//      and the applier, run again, does not re-create either page.
//   3. POSITIVE: the same two routes rewritten to their own intents
//      (fixtures/.../distinct_pair, the pages now on main) are ADMITTED and
//      registered at admission_level "full" - the gate admits, it does not
//      merely refuse.
//   4. Curating the spec changes the fingerprint, so a quarantined page is
//      re-judged rather than blocked forever.
//   5. ZERO: a plan that created nothing produces a named stop_reason, never a
//      bare PASS (validate:no-silent-zero-work reads exactly that field).
//   6. Rule 0 on itself: the self-test hard-fails if its fixture directories
//      hold no pages, because a gate proved against nothing is not proved.
import fs from 'node:fs';
import path from 'node:path';
import {admitCreatedPages, ARTIFACT_PATH} from './admit_bhpc_agent_created_pages.mjs';
import {readQuarantine, specFingerprint, QUARANTINE_PATH} from '../lib/agent_page_quarantine.mjs';
import {REJECTION_BACKLOG_PATH} from '../lib/rejection_backlog.mjs';
import {REAL_ROOT, FIXTURES, PAGES, PLAN, SPECS, REGISTRY, readJson, makeScratch, placeFixtures, plan, apply} from './self_test_scratch_repo.mjs';

const TAG = '[agent-created-page-admission-self-test]';

let assertions = 0;
const failures = [];
function check(cond, message) { assertions += 1; if (!cond) failures.push(message); }
function fixturePages(set) {
  const dir = path.join(FIXTURES, set);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort() : [];
}

// Rule 0 on the self-test itself.
for (const set of ['near_duplicate_pair', 'distinct_pair']) {
  const pages = fixturePages(set);
  if (pages.length !== PAGES.length || pages.some((f) => !PAGES.includes(`insights/${f}`))) {
    console.error(`${TAG} FAIL: fixtures/validation/agent_created_page_admission/${set} must hold exactly ${PAGES.map((p) => path.basename(p)).join(' and ')}; found ${pages.length ? pages.join(', ') : 'nothing'}. A gate proved against an empty batch is not proved.`);
    process.exit(1);
  }
}

function gate(root) { return admitCreatedPages({root, runtimeRoot: REAL_ROOT, runId: 'self-test'}); }

// Both fixture queries carry a demand record in the scratch (self_test_scratch_repo
// seeds them), so this test judges QUALITY; the demand gate that precedes it is
// proved by self_test_agent_created_page_demand_gate.mjs.
const scratch = makeScratch();
try {
  // ── 1. NEGATIVE: the incident pair is rejected before commit ────────────────
  let p = plan(scratch);
  check(p.specs.filter((s) => s.operation === 'CREATE_NEW_TARGET_PAGE' && s.status === 'PLANNED').length === 2, 'scratch plan should plan both incident pages as CREATE_NEW_TARGET_PAGE/PLANNED');
  placeFixtures(scratch, 'near_duplicate_pair');
  let a = gate(scratch);
  check(a.candidate_count === 2, `near-duplicate pair: expected 2 candidates, got ${a.candidate_count}`);
  check(a.admitted_count === 0 && a.quarantined_count === 2, `near-duplicate pair: expected 0 admitted / 2 quarantined, got ${a.admitted_count}/${a.quarantined_count}`);
  check(a.quarantined.every((q) => q.reasons.some((r) => /main-content similarity 0\.7\d+ exceeds 0\.72/.test(r))), `near-duplicate pair: rejection must name the similarity: ${JSON.stringify(a.quarantined.map((q) => q.reasons))}`);
  check(a.stop_reason?.code === 'EVERY_CREATED_PAGE_REJECTED', `near-duplicate pair: expected NAMED STOP EVERY_CREATED_PAGE_REJECTED, got ${JSON.stringify(a.stop_reason)}`);
  check(PAGES.every((rel) => !fs.existsSync(path.join(scratch, rel))), 'near-duplicate pair: rejected pages must be removed from the tree before anything commits');
  check(readJson(path.join(scratch, REGISTRY)).records.length === 0, 'near-duplicate pair: the registry must not gain a record for a rejected page');
  const ledger = readQuarantine(scratch);
  check(ledger.rows.length === 2 && PAGES.every((rel) => ledger.rows.some((r) => r.path === rel)), `quarantine ledger must hold both rejected pages, holds ${ledger.rows.length}`);
  check(readJson(path.join(scratch, REJECTION_BACKLOG_PATH)).rejections.filter((r) => r.lane === 'agent_exact_implementation').length === 2, 'rejection backlog must record both rejections under the agent_exact_implementation lane');
  check(readJson(path.join(scratch, 'data/content/programmatic_candidate_manifest.json')).candidates.length === 0, 'candidate manifest must be reset to empty after the gate');
  const artifact = readJson(path.join(scratch, ARTIFACT_PATH));
  check(artifact.stop_reason?.code && artifact.stop_reason?.message, 'the lane artifact must carry a named stop_reason {code,message} when nothing was admitted');

  // ── 2. The plan and the applier honour the ledger ───────────────────────────
  p = readJson(path.join(scratch, PLAN));
  const blocked = p.specs.filter((s) => PAGES.includes(s.implementation_path));
  // The plan writes one BLOCKED spec per acceptance entry (10 entries behind the
  // two pages), never a PLANNED one for a quarantined path.
  check(blocked.length === 10 && blocked.every((s) => s.status === 'BLOCKED' && /^quarantined_by_admission_gate:.*main-content similarity/.test(s.blocked_reason)), `rebuilt plan must carry every entry behind the two pages as BLOCKED with the gate's reason: ${JSON.stringify(blocked.map((s) => [s.status, s.blocked_reason.slice(0, 60)]))}`);
  check(new Set(blocked.map((s) => s.implementation_path)).size === 2, 'the BLOCKED specs must cover both quarantined paths');
  check(p.required_acceptance_entry_count === 0 && p.quarantined_count === 10, `rebuilt plan must exclude quarantined entries from required_acceptance_entry_count (got ${p.required_acceptance_entry_count}, quarantined_count ${p.quarantined_count})`);
  check(Object.keys(readJson(path.join(scratch, SPECS)).new_pages || {}).length === 0, 'agent_page_specs.generated.json must omit quarantined new pages so apply_citation_program.py cannot materialize them');
  apply(scratch);
  check(PAGES.every((rel) => !fs.existsSync(path.join(scratch, rel))), 'agent:bhpc:apply-exact must not re-create a quarantined page');
  a = gate(scratch);
  check(a.stop_reason?.code === 'NO_UNADMITTED_CREATED_PAGE', `with both specs blocked and no page on disk the gate must name the zero: ${JSON.stringify(a.stop_reason)}`);

  // ── 4. Curating the spec re-judges: a different fingerprint is not blocked ──
  const row = ledger.rows[0];
  const curated = specFingerprint({path: row.path, acceptanceIds: row.acceptance_ids, h1: 'A curated heading', framework: 'A Curated Framework', type: 'concept', definition: 'A curated definition.'});
  check(curated !== row.spec_fingerprint, 'curating h1/framework/definition must change the spec fingerprint');
  check(specFingerprint({path: row.path, acceptanceIds: [...row.acceptance_ids].reverse(), h1: '', framework: '', type: '', definition: ''}) === specFingerprint({path: row.path, acceptanceIds: row.acceptance_ids, h1: '', framework: '', type: '', definition: ''}), 'fingerprint must not depend on acceptance id order');

  // ── 3. POSITIVE: the rewritten pair is admitted ─────────────────────────────
  fs.rmSync(path.join(scratch, QUARANTINE_PATH), {force: true});
  p = plan(scratch);
  check(p.specs.filter((s) => s.status === 'PLANNED').length === 2, 'with the ledger cleared both specs must plan as PLANNED again');
  placeFixtures(scratch, 'distinct_pair');
  a = gate(scratch);
  check(a.admitted_count === 2 && a.quarantined_count === 0, `distinct pair: expected 2 admitted / 0 quarantined, got ${a.admitted_count}/${a.quarantined_count} ${JSON.stringify(a.quarantined.map((q) => q.reasons))}`);
  check(a.outcome?.code === 'CREATED_PAGES_ADMITTED' && !a.stop_reason, 'distinct pair: the artifact must name the admitted outcome and carry no stop_reason');
  const registry = readJson(path.join(scratch, REGISTRY));
  check(registry.records.length === 2 && registry.records.every((r) => r.status === 'ADMITTED' && r.admission_level === 'full' && r.source === 'agent_exact_implementation'), `distinct pair: both pages must be registered ADMITTED at admission_level full: ${JSON.stringify(registry.records.map((r) => [r.path, r.status, r.admission_level, r.source]))}`);
  check(PAGES.every((rel) => fs.existsSync(path.join(scratch, rel))), 'distinct pair: admitted pages stay on disk');

  // ── 5. ZERO: nothing created -> named stop, never a bare PASS ───────────────
  a = gate(scratch);
  check(a.stop_reason?.code === 'NO_UNADMITTED_CREATED_PAGE' && a.candidate_count === 0, `already-admitted pages are not candidates; expected the named zero, got ${JSON.stringify(a.stop_reason)}`);
} finally {
  fs.rmSync(scratch, {recursive: true, force: true});
}

if (failures.length) {
  console.error(`${TAG} FAIL: ${failures.length} of ${assertions} assertion(s) failed`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`${TAG} PASS: ${assertions} assertion(s); the incident pair (0.764) is rejected and removed before commit with a named stop, the plan and applier honour the quarantine, the rewritten pair is admitted at "full", and a run that created nothing names its zero.`);
