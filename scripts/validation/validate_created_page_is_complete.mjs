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
 * A lane that runs the APPLIER *and then JUDGES a page* must run every SUPPLIER in
 * between. Not "somewhere in the release"; in that lane. A supplier one chain away
 * is a page that is green in one lane and red in another, which is precisely how
 * this hid.
 *
 * THE "AND THEN JUDGES" CLAUSE IS LOAD-BEARING, and the first draft lacked it. It
 * demanded completion from all fourteen lanes that reach the applier, so the
 * applier itself was made to run the suppliers - and that gave a TREE-WIDE schema
 * parity and retrofit a blast radius across fourteen invocations. It broke
 * comparisons/bhpc-vs-betterup.html and its siblings ("expected one extraction
 * block, found 0", "missing immediate bold citation definition") and took the
 * release red on 2026-09-12. A lane that creates pages and never judges them cannot
 * be harmed by incompleteness, and forcing repairs into it caused real damage. The
 * obligation belongs exactly where a page is born and then graded in the same run -
 * the same scoping VAL-AGENT-BLOCK-SUPPLIERS-RUN-FIRST already uses, for the same
 * reason.
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
];

/*
 * `schema:repair-parity` IS NOT ON THAT LIST, and the omission is the finding.
 *
 * CITATION_PAGE_SCHEMA has one lawful author and a created page needs it, so it looks
 * like it belongs here. It does not, because the step is TREE-WIDE and unscoped it
 * DAMAGES pages it was not asked about. Adding it to the creating chains on 2026-09-12
 * produced, on two consecutive releases:
 *
 *   [validate:citation-contract] FAIL: 15 issue(s)
 *    - comparisons/bhpc-vs-betterup.html: expected one extraction block, found 0
 *    - comparisons/bhpc-vs-betterup.html: missing immediate bold citation definition
 *    - comparisons/bhpc-vs-culture-amp.html: ... and siblings
 *
 * The release has always run it as SCHEMA_REPAIR_SCOPE=required, against
 * data/release/active_mutation_scope.json, and that is why. Scoped it cannot reach a
 * page outside the run; unscoped it rewrites the whole tree on the current contract and
 * the comparison pages do not survive it. That is a real defect in repair_schema_parity
 * and it is recorded here rather than worked around: until it is fixed, this step is
 * safe only inside a scope, so demanding it from every creating lane would demand an
 * unsafe thing.
 *
 * The symptom that sent me here - "citation schema missing" on three created pages -
 * had already cleared by other means before either attempt landed.
 */

/** Lanes that run the applier but are deliberately NOT completion lanes, with the reason. */
const EXEMPT = new Map([
  [APPLIER, 'the applier itself'],
]);

/**
 * The steps that GRADE a page. A lane reaching one of these after the applier is
 * judging something it just created, and owes it completeness first.
 */
const JUDGES = [
  'agent:bhpc:trace-exact',
  'validate:citation-contract',
  'validate:programmatic-admission',
  'validate:bhpc-rich-new-page-contract',
  'validate:page-seo',
  'validate:full-page-audit',
];

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
  // Only a lane that also GRADES a page is bound by this. See the clause above.
  const judgeAt = Math.min(...JUDGES.map((j) => {
    const at = chain.indexOf(j);
    return at > applyAt ? at : Number.POSITIVE_INFINITY;
  }));
  if (!Number.isFinite(judgeAt)) continue;
  lanesExamined += 1;
  for (const s of SUPPLIERS) {
    const at = chain.indexOf(s.script);
    if (at < 0) {
      errors.push(
        `incomplete_lane: \`${name}\` runs \`${APPLIER}\`, grades a page later in the same chain, and never runs `
        + `\`${s.script}\`, so a page it creates is graded without ${s.supplies}.`);
    } else if (at < applyAt || at > judgeAt) {
      errors.push(
        `supplier_out_of_order: in \`${name}\`, \`${s.script}\` runs at step ${at + 1}, the page is created at step `
        + `${applyAt + 1} and graded at step ${judgeAt + 1}. ${s.supplies} must be supplied between the two.`);
    }
  }
}

// RULE 0.
if (lanesExamined === 0) {
  errors.push(`zero_creating_lanes: no npm script both reaches \`${APPLIER}\` and grades a page afterwards, so this check proved nothing.`);
}

if (errors.length) {
  console.error(`[created-page-complete] FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log(
  `[created-page-complete] PASS: ${lanesExamined} lane(s) create an agent page and then grade it, each running all `
  + `${SUPPLIERS.length} supplier(s) in between (${SUPPLIERS.map((s) => s.script).join(', ')}).`);
