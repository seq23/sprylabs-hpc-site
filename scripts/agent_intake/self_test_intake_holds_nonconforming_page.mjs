#!/usr/bin/env node
// INTAKE HOLDS A NONCONFORMING PAGE AND SHIPS THE REST. PROVE IT BY RUNNING IT.
//
// Three Fridays (2026-09-19, 2026-09-26, 2026-10-03 / run 37127626280) the
// Twin Agent's drop reached main and the release it started went red because
// ONE rendered page failed validate:page-seo-contract, the last stage of
// release:agent-intake:raw. scripts/agent_intake/hold_nonconforming_agent_pages.mjs
// now runs before that validator: a failing page is restored to its last
// validated bytes, ledgered by name in data/content/agent_page_quarantine.json
// (lane agent_intake_hold), planned BLOCKED, and reported; the others ship.
//
// This test runs the REAL plan builder, applier, hold stage and contract
// validator in a scratch git tree holding the real 2026-09-19 fixture artifact
// (self_test_scratch_repo.mjs), and proves:
//   1. NEGATIVE: with one page made nonconforming, the contract validator FAILS
//      (exit 1) and names only that page - the verdict the hold must preempt.
//   2. HOLD: the hold stage exits 0, restores exactly that page to HEAD, leaves
//      the conforming page's new content untouched, writes the ledger row and
//      the held report, prints the NAMED STOP line, and the rebuilt plan has
//      the held spec BLOCKED with reason held_by_intake:...
//   3. AFTER: the contract validator PASSES (exit 0) on the remaining page.
//   4. PERSISTENCE: a later plan rebuild and apply (as validate:agent-run and
//      content-finalize do) keep the held page BLOCKED and byte-identical.
//   5. EXPIRY: a different fingerprint (the next drop changing the acceptance
//      set) does not match the ledger row, so the page is re-judged then.
//   6. RULE 0: with no plan artifact the hold stage FAILS by name (exit 1)
//      rather than holding nothing and reporting PASS.
// Hard-fails on zero assertions.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {REAL_ROOT, PAGES, PLAN, readJson, makeScratch, plan, apply} from './self_test_scratch_repo.mjs';
import {readQuarantine, quarantinedRow, quarantineReason, HOLD_LANE, QUARANTINE_PATH} from '../lib/agent_page_quarantine.mjs';

const TAG = '[intake-holds-nonconforming-page-self-test]';
const HOLD = 'scripts/agent_intake/hold_nonconforming_agent_pages.mjs';
const VALIDATOR = 'scripts/validation/validate_page_seo_contract.mjs';
const REPORT = 'artifacts/validation/agent-intake-held-pages.json';

let assertions = 0;
const failures = [];
function check(cond, message) { assertions += 1; if (!cond) failures.push(message); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${message}`); }
function run(root, script, env = {}) {
  const r = spawnSync(process.execPath, [path.join(root, script)], {cwd: root, encoding: 'utf8', env: {...process.env, ...env}});
  return {code: r.status, out: `${r.stdout}\n${r.stderr}`};
}
function git(root, args) {
  const r = spawnSync('git', ['-c', 'user.name=self-test', '-c', 'user.email=self-test@example.invalid', ...args], {cwd: root, encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} exited ${r.status}: ${r.stderr}`);
  return r.stdout;
}
function bytes(root, rel) { return fs.readFileSync(path.join(root, rel)); }

const scratch = makeScratch();
try {
  // The validator resolves ROOT from cwd and imports its scope reader by relative
  // path, so both files are copied beside the symlinked lib the scratch carries.
  for (const f of ['validate_page_seo_contract.mjs', 'page_scope.mjs']) fs.copyFileSync(path.join(REAL_ROOT, 'scripts/validation', f), path.join(scratch, 'scripts/validation', f));

  // Render both fixture pages for real, and make that the last validated tree.
  let p = plan(scratch);
  check(p.specs.filter((s) => s.status === 'PLANNED' && PAGES.includes(s.implementation_path)).length === 2, 'scratch plan plans both fixture pages PLANNED');
  check(p.specs.filter((s) => PAGES.includes(s.implementation_path)).every((s) => /^[0-9a-f]{64}$/.test(s.quarantine_fingerprint || '')), 'every plan spec carries the quarantine_fingerprint the hold is keyed by');
  apply(scratch);
  git(scratch, ['init', '-q']);
  git(scratch, ['add', '-A']);
  git(scratch, ['commit', '-q', '-m', 'last validated tree']);
  const [shipped, broken] = PAGES;
  const headBroken = bytes(scratch, broken);
  let v = run(scratch, VALIDATOR);
  check(v.code === 0, `baseline: both rendered pages conform (validator exit ${v.code})`);

  // This run's lane output: one page changed conformingly, one made nonconforming.
  const shippedAfter = bytes(scratch, shipped).toString('utf8').replace(/<\/body>/i, '<!-- this run changed this page conformingly --></body>');
  fs.writeFileSync(path.join(scratch, shipped), shippedAfter);
  const brokenSpec = p.specs.find((s) => s.implementation_path === broken && s.status === 'PLANNED');
  const brokenHtml = headBroken.toString('utf8')
    .replaceAll(`data-bhpc-agent-record="${brokenSpec.record_id}"`, 'data-bhpc-agent-record-withheld="x"')
    .replace(/<\/body>/i, '<p>{{unresolved_token}}</p></body>');
  check(brokenHtml !== headBroken.toString('utf8'), 'the nonconforming page differs from HEAD before the hold');
  fs.writeFileSync(path.join(scratch, broken), brokenHtml);

  // 1. NEGATIVE: the contract fails the run, naming only the broken page.
  v = run(scratch, VALIDATOR);
  const before = readJson(path.join(scratch, 'artifacts/validation/page-seo-contract.json'));
  check(v.code === 1 && before.status === 'FAIL', `before the hold the contract validator FAILS (exit ${v.code}, ${before.status})`);
  check(before.failures.length >= 2 && before.failures.every((f) => f.path === broken), `the failures name only ${broken}: ${JSON.stringify(before.failures.map((f) => `${f.path}:${f.code}`))}`);
  check(before.failures.some((f) => f.code === 'UNRESOLVED_TOKEN') && before.failures.some((f) => f.code === 'MISSING_RECORD_MARKER'), 'the two injected defects are both named (UNRESOLVED_TOKEN, MISSING_RECORD_MARKER)');

  // 2. HOLD.
  const h = run(scratch, HOLD, {GITHUB_RUN_ID: 'self-test-run'});
  check(h.code === 0, `the hold stage exits 0 with a page held (exit ${h.code})\n${h.out.slice(0, 1500)}`);
  check(h.out.includes(`NAMED STOP agent_page_held: ${broken} broke page-seo-contract`), 'the hold prints a NAMED STOP naming the page and the rule it broke');
  check(h.out.includes('UNRESOLVED_TOKEN') && h.out.includes('MISSING_RECORD_MARKER'), 'the NAMED STOP carries the exact codes');
  check(Buffer.compare(bytes(scratch, broken), headBroken) === 0, 'the held page is byte-identical to its last validated bytes (HEAD)');
  check(bytes(scratch, shipped).toString('utf8') === shippedAfter, "the conforming page's new content is untouched (it ships)");
  const ledger = readQuarantine(scratch);
  const row = quarantinedRow(ledger, broken, brokenSpec.quarantine_fingerprint);
  check(Boolean(row) && row.lane === HOLD_LANE, `the ledger ${QUARANTINE_PATH} holds a row for the page under lane ${HOLD_LANE}`);
  check(row && row.restored === 'restored_from_head' && row.release_run === 'self-test-run' && row.reasons.some((r) => r.includes('UNRESOLVED_TOKEN')), 'the row records how the page was restored, which run held it, and why');
  check(ledger.rows.length === 1, `only the broken page is ledgered (${ledger.rows.length} row(s))`);
  check(quarantineReason(row).startsWith('held_by_intake:page-seo-contract'), `the plan builder derives reason held_by_intake:... from the row (${quarantineReason(row)})`);
  const rebuilt = readJson(path.join(scratch, PLAN));
  const heldSpecs = rebuilt.specs.filter((s) => s.implementation_path === broken);
  check(heldSpecs.length > 0 && heldSpecs.every((s) => s.status === 'BLOCKED' && String(s.blocked_reason).startsWith('held_by_intake:')), 'the rebuilt plan carries the held page only as BLOCKED held_by_intake:...');
  check(rebuilt.specs.some((s) => s.implementation_path === shipped && s.status === 'PLANNED'), 'the conforming page stays PLANNED in the rebuilt plan');
  const report = readJson(path.join(scratch, REPORT));
  check(report.status === 'HELD' && report.held_count === 1 && report.shipped_count === 1 && report.held[0].path === broken, `the held report says HELD 1 / shipped 1 and names the page (${report.status} ${report.held_count}/${report.shipped_count})`);

  // 3. AFTER: the contract passes on what remains.
  v = run(scratch, VALIDATOR);
  const after = readJson(path.join(scratch, 'artifacts/validation/page-seo-contract.json'));
  check(v.code === 0 && after.status === 'PASS' && after.files_checked === 1, `after the hold the contract validator PASSES on the shipped page (exit ${v.code}, ${after.status}, files=${after.files_checked})`);

  // 4. PERSISTENCE across the re-plan + re-apply later stages perform.
  p = plan(scratch);
  check(p.specs.filter((s) => s.implementation_path === broken).every((s) => s.status === 'BLOCKED'), 'a later plan rebuild still plans the held page BLOCKED from the ledger');
  apply(scratch);
  check(Buffer.compare(bytes(scratch, broken), headBroken) === 0, 'a later apply leaves the held page byte-identical to HEAD');
  const h2 = run(scratch, HOLD);
  check(h2.code === 0 && readJson(path.join(scratch, REPORT)).held_count === 0 && h2.out.includes('held=0'), 'a second hold pass on the withdrawn tree holds nothing and says so');

  // 5. EXPIRY: a changed acceptance set is a different fingerprint, no match.
  check(quarantinedRow(readQuarantine(scratch), broken, 'f'.repeat(64)) === null, 'a different spec fingerprint (next drop changes the acceptance set) is not held by this row');

  // 6. RULE 0: no plan -> named failure, not a silent PASS.
  fs.rmSync(path.join(scratch, PLAN));
  const h3 = run(scratch, HOLD);
  check(h3.code === 1 && h3.out.includes('required artifact artifacts/validation/agent-exact-implementation-plan.json is missing'), `with no plan the hold stage FAILS by name (exit ${h3.code})`);
} finally {
  fs.rmSync(scratch, {recursive: true, force: true});
}

if (!assertions) { console.error(`${TAG} FAIL: zero assertions ran`); process.exit(1); }
if (failures.length) {
  console.error(`${TAG} FAIL: ${failures.length} of ${assertions} assertion(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${TAG} PASS: ${assertions} assertion(s); a nonconforming rendered page is held by name, restored to its last validated bytes, ledgered and planned BLOCKED, and the contract passes on the pages that ship.`);
