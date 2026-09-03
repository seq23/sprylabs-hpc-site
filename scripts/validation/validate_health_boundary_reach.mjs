#!/usr/bin/env node
/**
 * THE REPAIR THAT PRODUCES THE HEALTH BOUNDARY MUST REACH EVERY LANE THAT GATES ON IT.
 *
 * WHAT WENT WRONG
 *
 * `Spry Content Release` 33718390934 died on main at
 * `validate:programmatic-admission`:
 *
 *   insights/a-practical-way-to-build-consistency-without-streak-pressure.html:
 *   health-adjacent boundary missing
 *
 * Reproduced end to end. Three steps, none of them wrong on its own:
 *
 *   1. `authority:scale:restore` reverts the page to its frozen accepted output,
 *      a blob written before the health boundary block existed. The committed
 *      page carries the block; the restored one does not.
 *   2. `agent:bhpc:apply-exact` then writes the agent's internal-link set into
 *      that page as reader-visible markup - which is what #56 fixed, correctly.
 *      One of the anchor texts contains "burnout", so the page is health-adjacent
 *      again by the validator's own keyword test.
 *   3. `release:content-finalize` runs every one of those producers and then
 *      `validate:programmatic-admission`, which enforces the boundary - but it
 *      never ran `repair:health-boundary`, the only thing in the repo that
 *      produces the boundary. `build:all` runs it last, and the release lane is
 *      not `build:all`.
 *
 * So the gate was enforcing a contract its own lane had no producer for. A guard
 * that cannot reach what it governs. The fix puts the repair into the release
 * lane immediately before the gate; this guard is what stops it being taken back
 * out, and stops the same hole opening in any future lane.
 *
 * WHAT IS ASSERTED
 *
 *   REACH  - every writing lane (`release:*` / `build:*`) whose expansion runs
 *            `validate:programmatic-admission` must run `repair:health-boundary`
 *            earlier in the same expansion. Hard-fails if it finds NO such lane,
 *            because a guard with nothing to examine is not a passing guard - it
 *            means the gate was moved or renamed and this check went inert.
 *
 *   TREE   - the committed tree itself carries the block on every health-adjacent
 *            page, measured by calling repair_health_boundary_blocks.js in
 *            --check mode. Hard-fails if it examines ZERO health-adjacent pages,
 *            because an empty page set reconciles while proving nothing.
 *
 * The health-adjacent predicate and the boundary/professional term lists are
 * imported from the repair itself. There is deliberately no second copy here:
 * two lists with no link between them is the defect class this repo pays for
 * most often.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const { repair, HEALTH_TERMS } = require(path.join(ROOT, 'scripts/repair/repair_health_boundary_blocks.js'));

const GATE = 'validate:programmatic-admission';
const PRODUCER = 'repair:health-boundary';
const WRITING_LANE = /^(release|build):/;
const EVIDENCE = path.join(ROOT, 'artifacts/validation/health-boundary-reach.json');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};

/**
 * Ordered list of the npm script names a lane runs, depth first, including the
 * lane itself. `SOME_ENV=1 npm run x -- --flag` resolves to `x`; a bare
 * `node scripts/...` step contributes nothing to resolve and is skipped, because
 * only npm script names can be compared against GATE and PRODUCER.
 */
function expand(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const body = scripts[name];
  if (typeof body !== 'string') return [];
  const steps = [];
  for (const segment of body.split(/&&|\|\||;/)) {
    const match = /npm\s+run\s+([A-Za-z0-9:_.\-]+)/.exec(segment);
    if (!match) continue;
    const child = match[1];
    steps.push(child);
    steps.push(...expand(child, new Set(seen)));
  }
  return steps;
}

const failures = [];
const lanes = [];

for (const name of Object.keys(scripts)) {
  if (!WRITING_LANE.test(name)) continue;
  const steps = expand(name);
  const gateAt = steps.indexOf(GATE);
  if (gateAt === -1) continue;
  const producerAt = steps.indexOf(PRODUCER);
  const ok = producerAt !== -1 && producerAt < gateAt;
  lanes.push({ lane: name, gate_step_index: gateAt, producer_step_index: producerAt, compliant: ok });
  if (!ok) {
    failures.push(
      producerAt === -1
        ? `${name} runs ${GATE} but never runs ${PRODUCER}; the lane gates on a boundary block nothing in it produces.`
        : `${name} runs ${PRODUCER} at step ${producerAt} but ${GATE} at step ${gateAt}; the producer must run before the gate.`,
    );
  }
}

// REACH is the assertion. Zero lanes examined means the gate is no longer in any
// writing lane under a name this guard recognises, which is exactly the state
// that would let the hole reopen silently.
if (lanes.length === 0) {
  failures.push(
    `no writing lane (release:* / build:*) runs ${GATE}, so this guard examined zero lanes. `
    + 'That is a hard failure, not a pass: either the gate was renamed or removed, and the health boundary is ungoverned in the release path.',
  );
}

const tree = repair({ check: true, writeEvidence: false });
if (tree.health_adjacent_pages === 0) {
  failures.push(
    'zero health-adjacent pages were examined against the registry, so the tree check proved nothing. '
    + `Expected the ${HEALTH_TERMS.length}-term predicate in scripts/repair/repair_health_boundary_blocks.js to match at least one admitted page.`,
  );
}
if (tree.repaired > 0) {
  failures.push(
    `${tree.repaired} health-adjacent page(s) in the committed tree carry no boundary block: `
    + `${tree.non_compliant_paths.slice(0, 10).join(', ')}${tree.repaired > 10 ? ', ...' : ''}. `
    + `Run \`npm run ${PRODUCER}\` and commit the result.`,
  );
}

const report = {
  schema_version: '1.0',
  validator: 'validate:health-boundary-reach',
  generated_at: new Date().toISOString(),
  gate: GATE,
  producer: PRODUCER,
  lanes_examined: lanes.length,
  lanes,
  health_adjacent_pages_examined: tree.health_adjacent_pages,
  pages_missing_boundary: tree.repaired,
  pages_missing_boundary_paths: tree.non_compliant_paths.slice(0, 50),
  status: failures.length ? 'FAIL' : 'PASS',
  failures,
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error('[validate:health-boundary-reach] FAIL');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  `[validate:health-boundary-reach] PASS: ${lanes.length} writing lane(s) gate on ${GATE} and all run ${PRODUCER} first `
  + `(${lanes.map((l) => l.lane).join(', ')}); ${tree.health_adjacent_pages} health-adjacent page(s) examined, 0 missing the boundary block.`,
);
