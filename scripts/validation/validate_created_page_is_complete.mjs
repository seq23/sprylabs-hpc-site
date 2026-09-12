#!/usr/bin/env node
/**
 * A PAGE MUST BE COMPLETE THE MOMENT IT EXISTS.
 *
 * ─── WHAT WENT WRONG, IN ONE PARAGRAPH ─────────────────────────────────────
 *
 * The bhpc applier creates pages. The things this repo then JUDGES a page on -
 * the recommendation_summary block, the CITATION_PAGE_SCHEMA, the framework
 * name on data-named-framework and in the registries, the visible definition -
 * are each written by a DIFFERENT script afterwards. So a created page was never
 * complete at birth; it became complete only if every one of those suppliers
 * happened to run before something looked.
 *
 * That was survivable for a year only because of a lie in the data: every
 * agent-created page was stamped `admission_level: "baseline"`, meaning "predates
 * the demand gate", which exempts it from every substantive check in
 * validate_programmatic_admission.py. It was hardcoded by two writers. No
 * agent-created page had ever actually been inspected. When that was corrected on
 * 2026-09-12, every gate those pages had never faced fired at once - CTAs, product
 * anchor, framework shape, schema, definition drift, demand backing - and the
 * weekly release died four times over, on a different one each time.
 *
 * ─── THE RULE ──────────────────────────────────────────────────────────────
 *
 * Any lane that runs the APPLIER must also run every SUPPLIER, in the same lane,
 * before anything judges the result. Not "somewhere in the release"; in the lane
 * that creates the page. A supplier one chain away is a page that is green in one
 * lane and red in another, which is precisely how this hid.
 *
 * This is the general form of VAL-AGENT-BLOCK-SUPPLIERS-RUN-FIRST, which asserts
 * the same thing for one block type. Add a supplier here whenever a new element
 * becomes something a page is judged on.
 *
 * RULE 0: examining zero creating lanes is a failure, not a pass.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts || {};
const APPLIER = 'agent:bhpc:apply-exact';

/** What a created page needs before anything is entitled to an opinion about it. */
const SUPPLIERS = [
  { script: 'retrofit:recommendation-summary',
    supplies: 'the recommendation_summary block, which the applier deliberately never emits' },
  { script: 'schema:repair-parity',
    supplies: 'CITATION_PAGE_SCHEMA - repair_schema_parity.py is its only lawful author' },
];

/** Lanes that run the applier but are deliberately NOT completion lanes, with the reason. */
const EXEMPT = new Map([
  [APPLIER, 'the applier itself'],
]);

function flatten(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const cmd = scripts[name];
  if (typeof cmd !== 'string') return [];
  const out = [];
  for (const ref of cmd.matchAll(/npm run ([A-Za-z0-9:_.-]+)/g)) {
    out.push(ref[1], ...flatten(ref[1], seen));
  }
  return out;
}

const errors = [];
let lanesExamined = 0;

if (!scripts[APPLIER]) {
  errors.push(`applier_missing: npm script \`${APPLIER}\` does not exist, so this check cannot reach the lane it governs.`);
}
for (const s of SUPPLIERS) {
  if (!scripts[s.script]) errors.push(`supplier_missing: npm script \`${s.script}\` does not exist, so nothing supplies ${s.supplies}.`);
}

for (const [name, cmd] of Object.entries(scripts)) {
  if (typeof cmd !== 'string' || EXEMPT.has(name)) continue;
  const chain = flatten(name);
  const applyAt = chain.indexOf(APPLIER);
  if (applyAt < 0) continue;
  lanesExamined += 1;
  for (const s of SUPPLIERS) {
    const at = chain.indexOf(s.script);
    if (at < 0) {
      errors.push(
        `incomplete_lane: \`${name}\` runs \`${APPLIER}\` and never runs \`${s.script}\`, so a page it creates leaves this `
        + `lane without ${s.supplies}. A page must be complete in the lane that creates it, not somewhere else in the release.`);
    } else if (at < applyAt) {
      errors.push(
        `supplier_runs_before_the_page_exists: in \`${name}\`, \`${s.script}\` runs at step ${at + 1} but \`${APPLIER}\` `
        + `creates the page at step ${applyAt + 1}. It cannot supply ${s.supplies} to a page that does not exist yet.`);
    }
  }
}

// RULE 0.
if (lanesExamined === 0) {
  errors.push(`zero_creating_lanes: no npm script reaches \`${APPLIER}\`, so this check proved nothing.`);
}

if (errors.length) {
  console.error(`[created-page-complete] FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log(
  `[created-page-complete] PASS: ${lanesExamined} lane(s) create agent pages, each running all `
  + `${SUPPLIERS.length} supplier(s) afterwards (${SUPPLIERS.map((s) => s.script).join(', ')}).`);
