#!/usr/bin/env node
/**
 * A lane that DEMANDS a block must run the thing that SUPPLIES it first.
 *
 * ─── THE BUG THIS EXISTS TO PREVENT ────────────────────────────────────────
 *
 * `recommendation_summary` is required on effectively every agent recommendation, and
 * `apply_bhpc_agent_exact_implementation.mjs` DELIBERATELY EMITS NOTHING for it: its only
 * available source is `source_fix_instruction`, which is internal operator-facing audit
 * critique, and publishing that under "What this page recommends" already reached 28 live
 * pages. Refusing to emit is correct. The consequence is that exactly one script supplies
 * that block — `retrofit:recommendation-summary`, which lifts a real summary out of the
 * page's own content — and `agent:bhpc:trace-exact` is the script that fails without it.
 *
 * `release:agent-intake:raw` ran apply → schema-parity → trace with NO retrofit between
 * them. `release:content-finalize`, which runs LATER in the same release, had the retrofit
 * in the right place. Two chains, each with its own idea of the order, and nothing linking
 * them.
 *
 * The result was invisible for a month because the raw lane's trace passes for any page
 * that ALREADY EXISTS — a previous cycle's content-finalize had retrofitted it. It can only
 * fail on a page created minutes earlier in the same run. On 2026-09-12 the weekly artifact
 * carried three new page opportunities, all three were created by apply-exact, all three
 * failed the raw trace, and the entire Spry Content Release died before content-finalize
 * was ever reached. The three pages were never pushed. A defect that only fires on genuinely
 * new pages is a defect that only fires on the work this pipeline exists to do.
 *
 * ─── WHAT THIS ASSERTS ─────────────────────────────────────────────────────
 *
 * A chain that reaches BOTH the APPLIER and a DEMANDER must reach the matching SUPPLIER
 * between them. `npm run` references are resolved recursively, so a supplier satisfied
 * inside a nested script counts — the question is order in the real execution sequence, not
 * which line of package.json it was typed on.
 *
 * THE APPLIER CLAUSE IS LOAD-BEARING, and its first draft did not have it. A lane that
 * demands the block but never runs the applier — `validate:batch-f-continuity`, say — creates
 * no pages; it inspects the tree as it stands, and its verdict on already-published content
 * is legitimate. Forcing a MUTATING retrofit into a read-only validation batch would be a
 * worse defect than the one being fixed. The constraint belongs exactly where a page is born
 * and then judged in the same run.
 *
 * RULE 0: examining zero chains is a failure. If the demander is renamed and this file is
 * not, it must go red rather than quietly pass over an empty set.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
/** The step that CREATES agent pages. A lane that never reaches it judges existing content. */
const APPLIER = 'agent:bhpc:apply-exact';

const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts || {};

/**
 * demander -> supplier. Both are npm script names.
 *
 * Add a pair here whenever an applier is made to refuse a block type: the refusal and the
 * ordering rule it creates are the same decision, and separating them is how this one got
 * lost.
 */
const PAIRS = [
  { demander: 'agent:bhpc:trace-exact', supplier: 'retrofit:recommendation-summary',
    block: 'recommendation_summary',
    why: 'the applier refuses to publish source_fix_instruction as page copy, so the retrofit is the ONLY supplier' },
  // The rich-new-page contract accepts EITHER marker for this block, which means it demands
  // the block and is satisfied by the retrofit's `data-content-block` — so it is a demander
  // under exactly the same rule, and `validate:agent-run` was running it before the retrofit too.
  { demander: 'validate:bhpc-rich-new-page-contract', supplier: 'retrofit:recommendation-summary',
    block: 'recommendation_summary',
    why: 'it accepts the retrofit\'s data-content-block marker, and the applier supplies no other' },
];

/** Every npm script a command reaches, in execution order, with nested `npm run` expanded. */
function flatten(name, seen = new Set()) {
  if (seen.has(name)) return [];           // a cycle cannot add a new earlier step
  seen.add(name);
  const cmd = scripts[name];
  if (typeof cmd !== 'string') return [];
  const out = [];
  for (const ref of cmd.matchAll(/npm run ([A-Za-z0-9:_.-]+)/g)) {
    const child = ref[1];
    out.push(child, ...flatten(child, seen));
  }
  return out;
}

const errors = [];
let chainsExamined = 0;

for (const pair of PAIRS) {
  if (!(pair.demander in scripts)) {
    errors.push(`demander_missing: npm script \`${pair.demander}\` does not exist. Renaming it without updating this file removes the guard silently.`);
    continue;
  }
  if (!(pair.supplier in scripts)) {
    errors.push(`supplier_missing: npm script \`${pair.supplier}\` does not exist, so nothing can supply \`${pair.block}\`.`);
    continue;
  }
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd !== 'string') continue;
    if (name === pair.demander) continue;
    const chain = flatten(name);
    const demandAt = chain.indexOf(pair.demander);
    if (demandAt < 0) continue;
    // Only a lane that CREATES the page is bound by this. See the applier clause above.
    const applyAt = chain.indexOf(APPLIER);
    if (applyAt < 0 || applyAt > demandAt) continue;
    chainsExamined += 1;
    const supplyAt = chain.indexOf(pair.supplier);
    if (supplyAt < 0) {
      errors.push(
        `supplier_never_runs: \`${name}\` reaches \`${pair.demander}\` but never runs \`${pair.supplier}\`. `
        + `\`${pair.block}\` has no other producer — ${pair.why} — so this lane can only pass for pages that `
        + `already carried the block from an earlier cycle, and fails on every genuinely new page.`);
    } else if (supplyAt > demandAt) {
      errors.push(
        `supplier_runs_too_late: in \`${name}\`, \`${pair.supplier}\` runs at step ${supplyAt + 1} but `
        + `\`${pair.demander}\` demands \`${pair.block}\` at step ${demandAt + 1}. The supplier must run first.`);
    }
  }
}

// RULE 0.
if (chainsExamined === 0) {
  errors.push(`zero_chains_examined: no npm script reaches both \`${APPLIER}\` and a declared demander, so this check proved nothing.`);
}

if (errors.length) {
  console.error(`[validate:agent-block-suppliers] FAIL: ${errors.length} ordering problem(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log(
  `[validate:agent-block-suppliers] PASS: ${chainsExamined} chain(s) that both create agent pages and `
  + `judge them, each running its supplier in between (${[...new Set(PAIRS.map((p) => p.block))].join(', ')}).`);
