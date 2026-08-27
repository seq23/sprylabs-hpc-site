#!/usr/bin/env node
/**
 * Admission-level stability.
 *
 * data/content/page_admission_registry.json is the record of what quality
 * contract each published page was admitted under. `admission_level: 'full'`
 * means validate_programmatic_admission.py applies the lane's word-count floor,
 * artifact, worked-example, source-floor, atom-strength and required-field
 * checks to that page. `baseline` means it applies none of them.
 *
 * That level is a decision about a page, and a decision belongs in a commit.
 * The build must not make it. A generator that re-levels pages already in the
 * registry changes, at build time, which contract thousands of published pages
 * are judged against - in either direction:
 *
 *   - promotion (baseline -> full) fails the build on a corpus that was never
 *     written against those thresholds, which is what happened when
 *     generate_aplayer_phase_expansion.mjs began stamping every page it
 *     re-created with NEW_PAGE_ADMISSION_LEVEL. It wipes and re-creates its
 *     whole 1,400-page corpus on every run, so every already-admitted page
 *     arrived looking new; all 1,400 were promoted to 'full' and all 1,400 then
 *     failed their lane contracts. CI printed only the first 300 of 2,250
 *     errors, so the failure read as "300 short pages" rather than "the entire
 *     generated library was re-levelled".
 *
 *   - demotion (full -> baseline) is worse and quieter: it takes pages out of
 *     the substantive checks entirely, and the build still passes. Nothing else
 *     in the profile would report it.
 *
 * So: for every path present in both the committed registry and the built one,
 * the admission_level must match. Adding a record, removing a record, and
 * committing a deliberate re-level are all unaffected - a re-level a human
 * commits moves HEAD too, so there is no drift to report.
 *
 * If the committed registry cannot be read, this exits 2 (INTERNAL_ERROR)
 * rather than 0. A guard that silently passes when it cannot run is not a
 * guard.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, fail, pass, writeSummary} from './common.mjs';

const REGISTRY = 'data/content/page_admission_registry.json';
const REF = process.env.ADMISSION_LEVEL_BASELINE_REF || 'HEAD';

function internalError(message, details = []) {
  console.error(`[validate:admission-level-stability] INTERNAL_ERROR: ${message}`);
  for (const d of details) console.error(` - ${d}`);
  process.exit(2);
}

function committedRegistry() {
  const r = spawnSync('git', ['show', `${REF}:${REGISTRY}`], {cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024});
  if (r.error) internalError(`cannot run git: ${r.error.message}`);
  if (r.status !== 0) internalError(`cannot read ${REF}:${REGISTRY}`, [String(r.stderr || '').trim()]);
  try {
    return JSON.parse(r.stdout);
  } catch (e) {
    internalError(`${REF}:${REGISTRY} is not valid JSON`, [e.message]);
  }
}

// A path can appear more than once in the registry - one currently appears 753
// times - so collect the DISTINCT levels recorded for it rather than keeping
// whichever record happens to be last. If a path carries two different levels in
// the same file, taking one of them silently would decide, by row order, which
// contract the page is judged against; that is reported instead.
function levels(doc, label) {
  const records = doc && Array.isArray(doc.records) ? doc.records : null;
  if (!records) internalError(`${label} has no records array`);
  const map = new Map();
  for (const row of records) {
    if (!row || !row.path) continue;
    const set = map.get(row.path) || new Set();
    set.add(row.admission_level ?? null);
    map.set(row.path, set);
  }
  return map;
}
const one = (set) => (set.size === 1 ? [...set][0] : `ambiguous(${[...set].sort().join('|')})`);

// The one comparison this guard makes, isolated so the fixtures below can run it
// for real rather than describe it.
function drift(committed, built) {
  const out = [];
  for (const [pagePath, builtSet] of built) {
    if (!committed.has(pagePath)) continue;
    const committedSet = committed.get(pagePath);
    // Ambiguity on either side is itself a failure: the build must leave one
    // unambiguous level per path, and it must be a level the commit recorded.
    const stable =
      committedSet.size === 1 && builtSet.size === 1 && committedSet.has([...builtSet][0]);
    if (!stable) out.push({path: pagePath, committed: one(committedSet), built: one(builtSet)});
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// Run on every invocation. A guard whose fixtures are only named in
// _validation_registry.json and never executed proves nothing; these are cheap,
// so they execute before the real comparison and take the process down with a
// non-zero exit if the comparison itself has stopped working.
const FIXTURES = ['fixtures/validation/admission-level/pass.json', 'fixtures/validation/admission-level/fail.json'];
for (const rel of FIXTURES) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) internalError(`self-test fixture missing: ${rel}`);
  let fixture;
  try {
    fixture = JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    internalError(`self-test fixture is not valid JSON: ${rel}`, [e.message]);
  }
  const got = drift(levels(fixture.committed, `${rel}#committed`), levels(fixture.built, `${rel}#built`));
  const want = fixture.expected_drift || [];
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    internalError(`self-test fixture ${rel} did not produce its expected result`, [
      `expected: ${JSON.stringify(want)}`,
      `actual:   ${JSON.stringify(got)}`
    ]);
  }
}

const workingPath = path.join(ROOT, REGISTRY);
if (!fs.existsSync(workingPath)) internalError(`${REGISTRY} is missing from the working tree`);
let workingDoc;
try {
  workingDoc = JSON.parse(fs.readFileSync(workingPath, 'utf8'));
} catch (e) {
  internalError(`${REGISTRY} is not valid JSON`, [e.message]);
}

const committed = levels(committedRegistry(), `${REF}:${REGISTRY}`);
const built = levels(workingDoc, REGISTRY);

const drifted = drift(committed, built);

const shared = [...built.keys()].filter((p) => committed.has(p)).length;
writeSummary('admission-level-stability', {
  status: drifted.length ? 'FAIL' : 'PASS',
  baseline_ref: REF,
  committed_records: committed.size,
  built_records: built.size,
  compared_records: shared,
  drifted_count: drifted.length,
  drifted
});

if (drifted.length) {
  const byDirection = new Map();
  for (const d of drifted) {
    const key = `${d.committed} -> ${d.built}`;
    byDirection.set(key, (byDirection.get(key) || 0) + 1);
  }
  fail(
    `[validate:admission-level-stability] FAIL: the build re-levelled ${drifted.length} already-admitted page(s). ` +
      'admission_level decides which quality contract validate_programmatic_admission.py applies to a page; ' +
      'it is a committed decision, not a build output. Preserve the recorded level for a path that is already in ' +
      `${REGISTRY}, and stamp a new level only on a path that is genuinely new.`,
    [
      ...[...byDirection.entries()].map(([k, n]) => `${n} page(s) ${k}`),
      ...drifted.slice(0, 25).map((d) => `${d.path}: committed ${d.committed} -> built ${d.built}`),
      ...(drifted.length > 25 ? [`... and ${drifted.length - 25} more (full list in the summary artifact)`] : [])
    ]
  );
}

pass(
  `[validate:admission-level-stability] OK: ${shared} page(s) present in both ${REF} and the built registry keep their ` +
    `recorded admission_level (committed=${committed.size}, built=${built.size})`
);
