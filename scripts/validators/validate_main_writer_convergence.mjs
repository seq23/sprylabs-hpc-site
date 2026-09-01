#!/usr/bin/env node
/**
 * Every lane that can commit page HTML to main must converge the tree first,
 * and must do it through the one authority rather than its own copy.
 *
 * THE DEFECT THIS EXISTS FOR.
 *
 * #46 diagnosed correctly and fixed narrowly. It added a convergence loop
 * inline to spry-content-release.yml, so that lane stopped publishing a tree
 * its own generators disagreed with. Every other main-writing lane kept the
 * defect. Sixteen hours later commit ae39ee266, from
 * daily-citation-intelligence.yml, rewrote 2,018 page HTML files and pushed
 * them unconverged, and three workflows went red at once:
 *
 *   validate:extraction-surface-guard  1,628 governed surfaces drifted
 *   validate:lastmod-ledger-final      1,873 of 2,231 pages stale
 *   Main Validation Sentinel           alarmed because main was red
 *
 * This is the portfolio's "two components each keeping their own list with no
 * link" shape: the fix lived in a workflow, the writers lived elsewhere, and
 * nothing tied the two together. This validator is the link.
 *
 * WHAT IT ASSERTS, all HARD_FAIL:
 *
 *  A. The authority exists, is executable, and actually runs the ordered
 *     stages: it must rebaseline, run build:all and the four ordered repairs,
 *     re-check the surface guard, and derive the lastmod ledger AFTER the last
 *     stage that mutates page HTML.
 *
 *  B. The commit choke point calls it. commit_and_push_if_changed.sh must
 *     invoke the authority, and must do so on the path that leads to a commit,
 *     so no lane can reach `git commit` without converging.
 *
 *  C. Every main-writing workflow routes through that choke point. A workflow
 *     that pushes to main by its own means would bypass convergence entirely.
 *
 *  D. No workflow keeps a private copy of the loop. A second inline copy is
 *     exactly how the authority and the lane drift apart again, which is the
 *     defect above.
 *
 * Rule 0: examining zero workflows, zero writers, or zero stages is a failure,
 * not a pass. A guard that reads an empty directory proves nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW_DIR = path.join(ROOT, '.github/workflows');
const HELPER = '.github/scripts/commit_and_push_if_changed.sh';
const AUTHORITY = '.github/scripts/converge_tree_before_commit.sh';
const OUT = process.env.MAIN_WRITER_CONVERGENCE_OUT
  || 'artifacts/validation/main-writer-convergence.json';

const errors = [];
const notes = [];

const read = (rel) => {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
};

// ---------------------------------------------------------------- A. authority

// The four ordered repair stages that follow build:all. If a stage is added to
// the release lane but not here, this list is what makes the omission visible.
const ORDERED_STAGES = [
  'EXTRACTION_SURFACE_REBASELINE=1 npm run validate:extraction-surface-guard:snapshot',
  'npm run build:all',
  'npm run repair:dual-domain-metadata',
  'npm run agent:bhpc:apply-report-contract',
  'npm run release:repair-agent-normalization',
  'npm run repair:citation-contract-surfaces',
  // Page-mutating, ledgered, and formerly in no build or repair stage at all,
  // so every rebuild erased the block while its ledger still said APPLIED.
  'npm run search:repair:apply',
];

const authorityText = read(AUTHORITY);
let stagesChecked = 0;
if (!authorityText) {
  errors.push(`${AUTHORITY}: missing. Nothing converges the tree any lane is about to commit.`);
} else {
  try {
    if (!(fs.statSync(path.join(ROOT, AUTHORITY)).mode & 0o111)) {
      errors.push(`${AUTHORITY}: not executable`);
    }
  } catch { /* covered by the missing-file error above */ }

  let previousIndex = -1;
  for (const stage of ORDERED_STAGES) {
    const at = authorityText.indexOf(stage);
    if (at < 0) {
      errors.push(`${AUTHORITY}: does not run \`${stage}\`; the tree it blesses was never put through that stage`);
      continue;
    }
    stagesChecked += 1;
    if (at < previousIndex) {
      errors.push(`${AUTHORITY}: runs \`${stage}\` out of order; the ordered repair stages must run in the sequence build:all establishes`);
    }
    previousIndex = at;
  }

  // lastIndexOf, not indexOf: the authority opens with a cheap re-entry probe
  // that runs the guard and the ledger to prove an already-converged tree
  // without repeating build:all. The occurrences that must sit after the repair
  // stages are the final ones, inside and after the loop.
  const checkAt = authorityText.lastIndexOf('npm run validate:extraction-surface-guard:check');
  const deriveAt = authorityText.lastIndexOf('npm run sitemap:lastmod:content');
  const ledgerAt = authorityText.lastIndexOf('npm run validate:lastmod-ledger-final');

  if (checkAt < 0) {
    errors.push(`${AUTHORITY}: never re-checks the surface guard, so it cannot tell a converged tree from an unconverged one`);
  } else if (checkAt < previousIndex) {
    errors.push(`${AUTHORITY}: checks the surface guard before the repair stages it is meant to judge`);
  }
  if (deriveAt < 0) {
    errors.push(`${AUTHORITY}: never derives the lastmod ledger, so it commits pages the sitemap no longer describes`);
  } else if (deriveAt < previousIndex) {
    errors.push(`${AUTHORITY}: derives the lastmod ledger before a stage that rewrites page HTML; the ledger would be stale by construction`);
  }

  // Textually-after-the-stages is not enough. A derivation placed INSIDE the
  // convergence loop also reads as "after the stages", yet every further pass
  // rewrites the pages it just hashed - the exact stale-by-construction defect,
  // hidden one level down. So the loop body must contain no derivation at all.
  const loopStart = authorityText.indexOf('for pass in');
  const loopEnd = authorityText.indexOf('\ndone', loopStart);
  if (loopStart < 0 || loopEnd < 0) {
    errors.push(`${AUTHORITY}: no bounded convergence loop found; a fixed number of passes cannot prove a fixed point was reached`);
  } else {
    const body = authorityText.slice(loopStart, loopEnd);
    if (body.includes('npm run sitemap:lastmod:content')) {
      errors.push(`${AUTHORITY}: derives the lastmod ledger inside the convergence loop; a later pass rewrites the pages it just hashed, so the ledger is stale by construction. Derive it once, after the loop.`);
    }
  }
  if (ledgerAt < 0 || ledgerAt < deriveAt) {
    errors.push(`${AUTHORITY}: does not validate the lastmod ledger after deriving it`);
  }
  if (!/LASTMOD_LEDGER_SCOPE=pending/.test(authorityText)) {
    errors.push(`${AUTHORITY}: must validate the ledger in pending scope; committed scope judges the commit being replaced, not the one about to be made`);
  }
}

// ------------------------------------------------------------ B. the choke point

const helperText = read(HELPER);
if (!helperText) {
  errors.push(`${HELPER}: missing; there is no choke point to attach convergence to`);
} else {
  if (!helperText.includes('converge_tree_before_commit.sh')) {
    errors.push(`${HELPER}: does not call ${AUTHORITY}. Convergence would again depend on each workflow remembering a step, which is how ae39ee266 reached main.`);
  }
  // It must be on the path that leads to a commit, not merely mentioned.
  const fn = helperText.slice(helperText.indexOf('commit_generated_changes() {'));
  const commitAt = fn.indexOf('git commit');
  const convergeAt = fn.indexOf('converge_before_commit');
  if (commitAt < 0 || convergeAt < 0 || convergeAt > commitAt) {
    errors.push(`${HELPER}: convergence is not invoked on the path that reaches \`git commit\`; a lane could commit an unconverged tree`);
  }
}

// ------------------------------------------- C. every main writer uses the helper

let workflows = [];
try {
  workflows = fs.readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));
} catch {
  errors.push(`${WORKFLOW_DIR}: unreadable; no workflow was examined (Rule 0)`);
}
if (!workflows.length) {
  errors.push(`${WORKFLOW_DIR}: no workflow files found; this guard verified nothing (Rule 0)`);
}

const writers = [];
for (const file of workflows) {
  const rel = path.join('.github/workflows', file);
  const text = read(rel) || '';
  const pushesDirectly = /git\s+push\s+origin\s+HEAD:main|git\s+push\s+origin\s+main/.test(text);
  const usesHelper = text.includes('commit_and_push_if_changed.sh');

  if (usesHelper) writers.push(rel);

  if (pushesDirectly && !usesHelper) {
    errors.push(`${rel}: pushes to main without going through ${HELPER}, so it bypasses convergence entirely`);
  }

  // D. no private copy of the loop.
  if (text.includes('EXTRACTION_SURFACE_REBASELINE=1')) {
    errors.push(`${rel}: keeps its own copy of the convergence loop. Call \`bash ${AUTHORITY}\` instead - a second copy is how the authority and the lane drift apart, which is the defect this guard exists for.`);
  }
}

if (!writers.length) {
  errors.push(`no workflow calls ${HELPER}; either the choke point moved or this guard is reading the wrong directory, and either way it verified nothing (Rule 0)`);
}
if (stagesChecked === 0) {
  errors.push('no ordered convergence stage was verified; this guard refuses to pass on an empty loop (Rule 0)');
}

// ------------------------------------------------------------------- report

const report = {
  schema_version: '1.0',
  status: errors.length ? 'FAIL' : 'PASS',
  authority: AUTHORITY,
  choke_point: HELPER,
  workflows_examined: workflows.length,
  main_writers: writers,
  ordered_stages_verified: stagesChecked,
  notes,
  errors,
};
fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 2) + '\n');

if (errors.length) {
  console.error(`[main-writer-convergence] FAIL: ${errors.length} issue(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(
  `[main-writer-convergence] PASS: ${writers.length} main-writing workflow(s) across ${workflows.length} examined all commit through ${HELPER}, `
  + `which converges via ${AUTHORITY}; ${stagesChecked} ordered stage(s) verified in sequence, ledger derived last.`,
);
