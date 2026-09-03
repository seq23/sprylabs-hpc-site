#!/usr/bin/env node
/**
 * NOTHING MAY BE ACCEPTED AS A FROZEN BASELINE BEFORE THE GENERATORS HAVE CONVERGED.
 *
 * WHAT WENT WRONG
 *
 * With the health-boundary hole closed, `Spry Content Release` got further and
 * died at `authority:scale:freeze`:
 *
 *   FROZEN_OUTPUT_MATERIAL_SHRINK - 8 page(s) would be re-frozen having lost at
 *   least 2048 bytes and 10% of their content.
 *
 * The shrink guard was right and must stay exactly as it is. What was wrong was
 * WHEN it was asked. Reproduced on main:
 *
 *   insights/design-an-end-of-day-shutdown-ritual-...html
 *     committed          19,473 bytes
 *     frozen baseline    18,326 bytes
 *     after the release stages, before convergence   11,250 bytes   (-38.6%)
 *     after build:all and the ordered repairs        19,517 bytes   (recovered)
 *
 * `agent:bhpc:apply-exact` rewrites a page from the exact-implementation
 * template and leaves it without its breadcrumb, its related-page nav, its
 * word-count repair section and half its JSON-LD. Every one of those is put back
 * by `build:all` and the ordered repair stages. The page is not shrinking - it is
 * HALF BUILT, and the freeze was measuring it mid-build.
 *
 * spry-content-release.yml already knows this argument; it is the reason
 * `.github/scripts/converge_tree_before_commit.sh` exists, and #46 fixed exactly
 * this defect for the COMMIT. But `authority:scale:freeze` runs inside
 * `release:agent-intake`, which finishes before the workflow ever reaches the
 * convergence step - so the accepted-output baseline was still being taken from
 * a tree the generators had never finished. The commit was converged; the
 * baseline it was compared against was not.
 *
 * The fix converges inside the lane, immediately before the freeze. The
 * workflow's own later call then short-circuits on the convergence script's
 * `already_converged` verified skip, so the cost is moved rather than added.
 *
 * WHAT IS ASSERTED
 *
 *   Every npm lane that runs `authority:scale:freeze` must first run the
 *   convergence authority - `.github/scripts/converge_tree_before_commit.sh`,
 *   reached through `release:converge-before-freeze` or invoked directly.
 *
 *   Hard-fails when it examines ZERO lanes. A lane list that came back empty
 *   means the freeze was renamed or moved out of the npm lanes, and this guard
 *   would otherwise report protection it is no longer providing.
 *
 *   Hard-fails when the convergence authority script is missing, because a lane
 *   can name a script that is not there and still parse clean.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FREEZE = 'authority:scale:freeze';
const AUTHORITY = '.github/scripts/converge_tree_before_commit.sh';
const EVIDENCE = path.join(ROOT, 'artifacts/validation/freeze-after-convergence.json');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};

/**
 * Ordered steps a lane runs, depth first, children only. An `npm run x` segment
 * contributes the script name and everything x runs; any other segment
 * contributes its raw command text, which is how a direct `bash .github/...`
 * invocation stays visible to the ordering check.
 */
function steps(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const body = scripts[name];
  if (typeof body !== 'string') return [];
  const out = [];
  for (const segment of body.split(/&&|\|\||;/)) {
    const match = /npm\s+run\s+([A-Za-z0-9:_.\-]+)/.exec(segment);
    if (match) {
      out.push({ kind: 'script', value: match[1] });
      out.push(...steps(match[1], new Set(seen)));
    } else if (segment.trim()) {
      out.push({ kind: 'raw', value: segment.trim() });
    }
  }
  return out;
}

const failures = [];

if (!fs.existsSync(path.join(ROOT, AUTHORITY))) {
  failures.push(`the convergence authority ${AUTHORITY} does not exist, so every lane that names it converges nothing.`);
}

const lanes = [];
for (const name of Object.keys(scripts)) {
  const ordered = steps(name);
  const freezeAt = ordered.findIndex((s) => s.kind === 'script' && s.value === FREEZE);
  if (freezeAt === -1) continue;
  const convergeAt = ordered.findIndex(
    (s) => (s.kind === 'script' && s.value === 'release:converge-before-freeze') || (s.kind === 'raw' && s.value.includes(AUTHORITY)),
  );
  const ok = convergeAt !== -1 && convergeAt < freezeAt;
  lanes.push({ lane: name, freeze_step_index: freezeAt, convergence_step_index: convergeAt, compliant: ok });
  if (!ok) {
    failures.push(
      convergeAt === -1
        ? `${name} runs ${FREEZE} without ever running ${AUTHORITY}; it would accept a half-built tree as the frozen baseline.`
        : `${name} converges at step ${convergeAt} but freezes at step ${freezeAt}; convergence must come first.`,
    );
  }
}

if (lanes.length === 0) {
  failures.push(
    `no npm lane runs ${FREEZE}, so this guard examined zero lanes and proved nothing. `
    + 'That is a hard failure: the freeze was renamed or moved, and the ordering it depends on is no longer governed here.',
  );
}

const report = {
  schema_version: '1.0',
  validator: 'validate:freeze-after-convergence',
  generated_at: new Date().toISOString(),
  freeze_step: FREEZE,
  convergence_authority: AUTHORITY,
  lanes_examined: lanes.length,
  lanes,
  status: failures.length ? 'FAIL' : 'PASS',
  failures,
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error('[validate:freeze-after-convergence] FAIL');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  `[validate:freeze-after-convergence] PASS: ${lanes.length} lane(s) run ${FREEZE} and all converge first `
  + `(${lanes.map((l) => l.lane).join(', ')}).`,
);
