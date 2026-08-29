#!/usr/bin/env node
/**
 * Citation-OS self-heal.
 *
 * WHAT THIS USED TO BE
 *
 * Three lines that rewrote unsafe claim language on pages listed in
 * artifacts/validation/release-plan-application.json, then printed
 * "[citation:self-heal] PASS repaired=0" - unconditionally, with no failure branch and
 * no exit path other than 0. On a tree where three governed pages violated the citation
 * contract it printed PASS. When the release plan applied nothing (applied: []) it
 * printed PASS having examined nothing at all. It is named for the citation OS and did
 * not inspect the citation OS.
 *
 * WHAT IT IS NOW
 *
 * It inspects the surface its name claims: every ACTIVE citable page must carry the
 * CITATION_PAGE_SCHEMA block that validate_citation_contract.py hard-fails on. It
 * repairs what it can by delegating to the declared writer, re-checks, and makes a
 * NAMED stop for anything left. It keeps the safe-harbor claim rewrite it always did.
 *
 * The repair is delegated, not reimplemented: repair_schema_parity.py is the sole writer
 * of that block, and a second writer here would be a second source of truth to drift.
 * That is also why this runs the violation-scope builder first - the writer honours the
 * release mutation scope, and without the violation scope it cannot reach an
 * out-of-scope page (see scripts/citation/build_contract_violation_scope.mjs).
 *
 * Exit codes:
 *   0  examined a non-empty estate, and it is clean (possibly after repairing).
 *   1  examined nothing (registry missing or no page on disk) - PASS would be a lie.
 *   1  violations remain after the repair ran - a NAMED stop listing them.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readJson, writeJson, unsafeClaim, rewriteUnsafe, now } from '../lib/safe_harbor_utils.mjs';
import { collect } from '../citation/build_contract_violation_scope.mjs';

const ROOT = process.cwd();

// ---- 1. Safe-harbor claim rewrite over what the release plan applied (unchanged behaviour).
const app = readJson('artifacts/validation/release-plan-application.json', { applied: [] });
const rewrites = readJson('data/governance/safe_harbor_rewrite_ledger.json', { schema_version: '1.0', entries: [] });
let claimRepairs = 0;
for (const x of app.applied || []) {
  if (!fs.existsSync(x.source_file)) continue;
  const before = fs.readFileSync(x.source_file, 'utf8');
  if (!unsafeClaim(before)) continue;
  const after = rewriteUnsafe(before);
  if (after !== before) {
    fs.writeFileSync(x.source_file, after);
    rewrites.entries.push({ timestamp: now(), route: x.route_owner, source_file: x.source_file, decision: 'REWRITTEN_AND_AUTOPUBLISHED' });
    claimRepairs += 1;
  }
}
writeJson('data/governance/safe_harbor_rewrite_ledger.json', rewrites);

// ---- 2. Citation-OS contract surface: the thing this script is named for.
const before = collect(ROOT);
if (before.error) {
  console.error(`[citation:self-heal] STOP: ${before.error}`);
  process.exit(1);
}
if (before.examined === 0) {
  console.error(
    `[citation:self-heal] STOP: data/citation/citable_pages.json lists ${before.active} ACTIVE page(s) but none ` +
      'exist on disk - this run inspected nothing, so PASS would be a false statement about the citation OS',
  );
  process.exit(1);
}

let schemaRepairs = 0;
let after = before;
if (before.violations.length) {
  console.log(`[citation:self-heal] ${before.violations.length} page(s) missing CITATION_PAGE_SCHEMA; delegating to repair_schema_parity.py`);
  const repair = spawnSync(
    'sh',
    ['-c', 'node scripts/citation/build_contract_violation_scope.mjs --quiet && node scripts/validation/python_runtime.mjs run scripts/citation/repair_schema_parity.py'],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if ((repair.status ?? 1) !== 0) {
    console.error(`[citation:self-heal] STOP: the declared writer exited ${repair.status}; ${before.violations.length} violation(s) left unrepaired`);
    process.exit(1);
  }
  after = collect(ROOT);
  schemaRepairs = before.violations.length - after.violations.length;
}

const report = {
  schema_version: '1.0',
  generated_at: now(),
  validator: 'citation-os-self-heal',
  examined_pages: before.examined,
  claim_rewrites: claimRepairs,
  schema_violations_found: before.violations.length,
  schema_violations_repaired: schemaRepairs,
  unresolved: after.violations,
  status: after.violations.length ? 'UNRESOLVED' : 'CLEAN',
};
writeJson('artifacts/validation/citation-os-self-heal.json', report);

if (after.violations.length) {
  console.error(
    `[citation:self-heal] UNRESOLVED: ${after.violations.length} of ${before.violations.length} violation(s) survived the repair ` +
      '- these need a decision, not another attempt',
  );
  for (const v of after.violations.slice(0, 25)) console.error(` - ${v.path}: ${v.violation}`);
  console.error('[citation:self-heal] report at artifacts/validation/citation-os-self-heal.json');
  process.exit(1);
}
console.log(
  `[citation:self-heal] PASS examined=${before.examined}; claim_rewrites=${claimRepairs}; ` +
    `schema_violations_found=${before.violations.length}; schema_violations_repaired=${schemaRepairs}`,
);
