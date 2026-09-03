#!/usr/bin/env node
/**
 * THE CONVERGENCE RE-ENTRY SKIP MUST REST ON A PROOF THAT HOLDS.
 *
 * WHAT WENT WRONG
 *
 * `.github/scripts/converge_tree_before_commit.sh` is called twice on a
 * main-writing lane, and its re-entry skipped the loop whenever the extraction
 * surface guard and the pending-scope lastmod ledger both passed. That was
 * described as a verified skip. It was not one.
 *
 * The guard compares the tree against the snapshot rebaselined at the start of
 * the last pass. It answers "has the tree moved since then". The skip needs the
 * answer to a different question: "would the generators move it now". Those
 * coincide only while the generators' INPUTS are also unchanged - and on the
 * release lane they are not: authority:scale:freeze rewrites the frozen output
 * registry, clear-scope empties the active mutation scope, ownership:build and
 * admin:build rewrite registries under data/. None of those is a governed
 * surface, so the guard sees nothing.
 *
 * Reproduced on 326908929: the lane converged, froze, rebuilt ownership and
 * admin, took the fast path on a genuine guard pass, and committed. Validate
 * Repo then ran the identical producer sequence on a fresh checkout and moved 50
 * governed surfaces - main went red on a tree the fast path had certified.
 *
 * The fix adds the missing half of the premise: the skip also requires that
 * nothing in the repository has been written since the convergence that claimed
 * the fixed point, stamped by a marker written after the script's last write.
 *
 * WHAT IS ASSERTED
 *
 *   BEHAVIOUR - the freshness predicate itself, exercised against a real
 *               directory: a marker with nothing newer skips; a marker with
 *               something newer does not; no marker does not. These are the
 *               three states the release lane actually passes through.
 *
 *   WIRING    - the script's skip branch is gated on that predicate, and the
 *               marker is stamped after the ledger re-derivation, which is the
 *               last write the script makes. A sound predicate the script does
 *               not consult is the "exists but nothing invokes it" defect.
 *
 * Hard-fails if it executes ZERO assertions, because an empty self-test reports
 * protection it is not providing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, '.github/scripts/converge_tree_before_commit.sh');
const EVIDENCE = path.join(ROOT, 'artifacts/validation/convergence-reentry-self-test.json');

const assertions = [];
const failures = [];

function check(name, ok, detail) {
  assertions.push({ assertion: name, passed: Boolean(ok), detail });
  if (!ok) failures.push(`${name}: ${detail}`);
}

if (!fs.existsSync(SCRIPT)) {
  console.error(`[convergence-reentry-self-test] FAIL: ${SCRIPT} does not exist; there is no re-entry rule to test.`);
  process.exit(1);
}
const source = fs.readFileSync(SCRIPT, 'utf8');

// ---------------------------------------------------------------- BEHAVIOUR
// The predicate is `find <root> -newer <marker> -type f -print -quit` with the
// same prunes the script uses. Exercised here against a real directory so this
// tests the mechanism, not a restatement of it.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'converge-reentry-'));
const marker = path.join(scratch, 'converged.marker');

function nothingNewer() {
  const out = execFileSync('/bin/sh', ['-c',
    `cd ${JSON.stringify(scratch)} && [ -f ${JSON.stringify(marker)} ] || { echo NOMARKER; exit 0; }; `
    + `find . -path ./node_modules -prune -o -path ./.git -prune -o -newer ${JSON.stringify(marker)} -type f -print -quit`,
  ], { encoding: 'utf8' }).trim();
  return { skip: out === '', out };
}

try {
  fs.writeFileSync(path.join(scratch, 'page.html'), 'before');
  // The marker is stamped after that write, so nothing is newer than it.
  execFileSync('/bin/sh', ['-c', `sleep 1.1; : > ${JSON.stringify(marker)}`]);
  const clean = nothingNewer();
  check('marker with nothing newer permits the skip', clean.skip, `find reported ${JSON.stringify(clean.out)}`);

  // A later write - the release lane's ownership:build / admin:build / freeze.
  execFileSync('/bin/sh', ['-c', `sleep 1.1; printf after > ${JSON.stringify(path.join(scratch, 'data-registry.json'))}`]);
  const dirty = nothingNewer();
  check('a write after the marker refuses the skip', !dirty.skip, `find reported ${JSON.stringify(dirty.out)}; expected it to name the newer file`);

  fs.rmSync(marker);
  const absent = nothingNewer();
  check('no marker refuses the skip', !absent.skip, `find reported ${JSON.stringify(absent.out)}`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

// ------------------------------------------------------------------ WIRING
const skipBranch = /if\s+unchanged_since_convergence\s*\\\s*\n\s*&&\s*npm run validate:extraction-surface-guard:check/.test(source);
check(
  'the skip branch is gated on the freshness predicate',
  skipBranch,
  'the `if` that prints already_converged must call unchanged_since_convergence before the guard and ledger checks',
);

check(
  'the freshness predicate is defined',
  /unchanged_since_convergence\(\)\s*\{[\s\S]*-newer "\$MARKER"/.test(source),
  'unchanged_since_convergence must compare the tree against $MARKER with find -newer',
);

const ledgerAt = source.lastIndexOf('validate:lastmod-ledger-final');
const stampAt = source.lastIndexOf(': > "$MARKER"');
check(
  'the marker is stamped after the last write the script makes',
  stampAt > ledgerAt && ledgerAt !== -1 && stampAt !== -1,
  `marker stamped at offset ${stampAt}, ledger re-derivation at ${ledgerAt}; the stamp must come last or it certifies a tree the script then changes`,
);

check(
  'the skip is not reachable without the marker',
  /\[ -f "\$MARKER" \] \|\| return 1/.test(source),
  'unchanged_since_convergence must refuse when no marker exists',
);

if (assertions.length === 0) {
  console.error('[convergence-reentry-self-test] FAIL: zero assertions executed, so this self-test proved nothing.');
  process.exit(1);
}

const report = {
  schema_version: '1.0',
  self_test: 'convergence-reentry-soundness',
  generated_at: new Date().toISOString(),
  script: '.github/scripts/converge_tree_before_commit.sh',
  assertions_executed: assertions.length,
  assertions,
  status: failures.length ? 'FAIL' : 'PASS',
  failures,
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error('[convergence-reentry-self-test] FAIL');
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log(
  `[convergence-reentry-self-test] PASS: ${assertions.length} assertion(s); the re-entry skip requires a freshness marker `
  + 'that no repository write postdates, and the marker is stamped after the script\'s last write.',
);
