#!/usr/bin/env node
/**
 * VAL-CITATION-REPAIR-REACH
 *
 * Asserts that the citation-contract repair can REACH every page the citation-contract
 * validator judges, under the mutation scope the release lane actually runs with.
 *
 * This guards a defect that was invisible to every other check in the repo, because
 * nothing was wrong with either half on its own. repair_schema_parity.py honoured
 * data/release/active_mutation_scope.json (~17 routes); validate_citation_contract.py
 * judged all ACTIVE citable pages (~2219). Both behaved exactly as written. The bug
 * lived in the gap: a page that lost its CITATION_PAGE_SCHEMA outside the scope was
 * unrepairable by construction, so heal_until_clean.mjs re-ran the same repair three
 * times, changed nothing relevant, and exited UNRESOLVED. Production run 33259007622:
 * "repair_schema_parity: changed=18; scoped=True; skipped_outside_scope=2183" followed
 * by "FAIL: 3 issue(s) ... citation schema missing".
 *
 * What this asserts:
 *   1. Every ACTIVE citable page missing CITATION_PAGE_SCHEMA is present in the
 *      violation scope that repair_schema_parity.py unions into its allowed routes.
 *      If this fails, those pages are unrepairable and the self-heal loop cannot
 *      converge - which is the exact production failure.
 *   2. The two route normalizers agree. build_contract_violation_scope.mjs and
 *      repair_schema_parity.py each implement normalize_route/route_from_path. If they
 *      drift, the scope stops matching and the repair silently goes inert again with
 *      no error anywhere - the same class of silent failure, one layer down.
 *
 * Hard-fails when it examines zero pages. A reachability proof over an empty set is
 * not a proof, and reporting PASS for one is the failure mode this whole change is about.
 *
 * Usage: npm run validate:citation-repair-reach
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collect, routeFromPath, normalizeRoute } from '../citation/build_contract_violation_scope.mjs';

const ROOT = process.cwd();
const SCOPE = path.join(ROOT, 'data/release/citation_contract_violation_scope.json');
const errors = [];

const result = collect(ROOT);
if (result.error) {
  console.error(`[validate:citation-repair-reach] FAIL: ${result.error}`);
  process.exit(1);
}
if (result.examined === 0) {
  console.error(
    '[validate:citation-repair-reach] FAIL: examined 0 citable pages on disk - ' +
      'a reachability proof over an empty set proves nothing',
  );
  process.exit(1);
}

// Rebuild the scope exactly as `npm run repair:citation-contract-surfaces` does, so this
// judges the state the repair will actually run against.
const built = spawnSync('node', ['scripts/citation/build_contract_violation_scope.mjs', '--quiet'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if ((built.status ?? 1) !== 0) {
  console.error(`[validate:citation-repair-reach] FAIL: scope builder exited ${built.status}: ${built.stderr?.trim()}`);
  process.exit(1);
}

// 2. Route normalizers must agree across the JS scope builder and the Python repair.
// Sampled over real registry paths rather than synthetic strings, so the shapes that
// actually occur (index.html, nested dirs, .html leaves) are the ones compared.
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/citation/citable_pages.json'), 'utf8')).pages || [];
const sample = pages
  .filter((p) => (p.status || 'ACTIVE') === 'ACTIVE' && p.path)
  .map((p) => p.path)
  .filter((_, i) => i % 97 === 0)
  .slice(0, 40);
if (sample.length === 0) {
  console.error('[validate:citation-repair-reach] FAIL: no ACTIVE citable paths to compare normalizers against');
  process.exit(1);
}
const py = spawnSync(
  'node',
  ['scripts/validation/python_runtime.mjs', 'run', 'scripts/citation/route_probe.py', ...sample],
  { cwd: ROOT, encoding: 'utf8' },
);
if ((py.status ?? 1) !== 0) {
  console.error(`[validate:citation-repair-reach] FAIL: route probe exited ${py.status}: ${py.stderr?.trim()}`);
  process.exit(1);
}
let probe;
try {
  probe = JSON.parse(py.stdout.trim().split('\n').filter(Boolean).pop());
} catch {
  console.error(`[validate:citation-repair-reach] FAIL: route probe did not emit JSON: ${py.stdout.slice(-400)}`);
  process.exit(1);
}
for (const rel of sample) {
  const js = routeFromPath(rel);
  if (probe.routes?.[rel] !== js) {
    errors.push(
      `route normalizer drift on ${rel}: build_contract_violation_scope.mjs -> ${js}, ` +
        `repair_schema_parity.py -> ${probe.routes?.[rel]}`,
    );
  }
}

// 1. The load-bearing assertion: every violating page must be inside the set the repair
// will actually select from. This reads active_mutation_routes() out of the repair
// itself rather than re-reading the scope file this validator just wrote - checking our
// own output would be self-fulfilling and could never fail.
const allowed = probe.allowed === null ? null : new Set((probe.allowed || []).map(normalizeRoute));
if (allowed !== null) {
  for (const v of result.violations) {
    if (!allowed.has(normalizeRoute(v.route))) {
      errors.push(
        `${v.path}: violates the citation contract (${v.violation}) but its route ${v.route} is not in ` +
          "repair_schema_parity.py's allowed route set, so the repair cannot reach it and the self-heal " +
          'loop cannot converge',
      );
    }
  }
}

if (errors.length) {
  console.error(`[validate:citation-repair-reach] FAIL: ${errors.length} issue(s)`);
  for (const e of errors.slice(0, 50)) console.error(` - ${e}`);
  process.exit(1);
}
console.log(
  `[validate:citation-repair-reach] PASS: ${result.examined} citable page(s) examined; ` +
    `${result.violations.length} contract violation(s), all reachable by the repair; ` +
    `${sample.length} route(s) normalize identically in both writers`,
);
