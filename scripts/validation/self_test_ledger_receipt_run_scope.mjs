#!/usr/bin/env node
/**
 * A DERIVATION RECEIPT IS EVIDENCE ABOUT ONE RUN. COMMITTING IT MAKES IT A LIE
 * TO EVERY RUN AFTER IT.
 *
 * WHAT WENT WRONG
 *
 * `sitemap:lastmod:content` writes artifacts/validation/lastmod-derivation-receipt.json
 * so that arm B of validate:lastmod-ledger-final can know, as a fact rather than
 * an inference, that a derivation happened in this run. artifacts/ is committed
 * by the main-writing lanes, so at 93977956f (2026-09-03 12:58Z) the receipt was
 * pushed to main. From that commit onward EVERY checkout began with a receipt
 * already on disk, already hashing to the ledger committed beside it.
 *
 * Spry Content Release run 33767079923 then failed on schedule. Its
 * full-content-cycle mode derives the ledger as its LAST stage (stage 10) and
 * fails at `selfheal` (stage 9), so `sitemap:lastmod:content` never executed -
 * the log shows no derivation at all. Arm B nonetheless believed one had, read
 * the inherited receipt, measured the untouched committed ledger against a
 * working tree the release stages had just rewritten, and reported 1590 of 2231
 * pages stale. Nothing was stale. Self-heal correctly refused to repair it,
 * because there was nothing to repair, and the lane paged its owner every day.
 *
 * THE FIX THIS GUARDS
 *
 * `ledgerDerivationReceipt` refuses a receipt byte-identical to the one
 * committed at HEAD: that receipt was written by the run that produced the
 * commit, not by this one.
 *
 * WHAT IS ASSERTED, in throwaway git repositories driven end to end through the
 * real deriver and the real guard - not by reading either of them:
 *
 *   1. The failure itself. Receipt and ledger committed, pages then rewritten,
 *      NO derivation in this run -> the guard must exit 0 and record arm B as
 *      skipped. This is run 33767079923 reproduced.
 *   2. The defect arm B exists for must still bite. Derive in-run, THEN rewrite
 *      a page -> the guard must exit 1 naming the arm B message. Without this,
 *      assertion 1 could be satisfied by disabling arm B, which is precisely the
 *      assertion-weakening this repository forbids.
 *   3. A no-op derivation is still a derivation (the property #60 established):
 *      re-deriving a ledger that is already correct produces identical ledger
 *      bytes but a FRESH receipt, and must still be admitted as this run's.
 *   4. The predicate consults HEAD at all, so the check cannot be quietly
 *      removed while the file still parses.
 *
 * Hard-fails if it executes ZERO assertions, or if any scratch repository could
 * not be built - a harness that examined nothing must not report PASS.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, 'artifacts/validation/ledger-receipt-run-scope.json');
const DERIVER = path.join(ROOT, 'scripts/sitemap_content_lastmod.mjs');
const GUARD = path.join(ROOT, 'scripts/validation/validate_lastmod_ledger_final.mjs');
const LIB = path.join(ROOT, 'scripts/lib/sitemap_ledger.mjs');
const TOPOLOGY = path.join(ROOT, 'data/workflows/workflow_topology.json');
const RECEIPT_REL = 'artifacts/validation/lastmod-derivation-receipt.json';

const assertions = [];
const failures = [];
const check = (name, ok, detail) => {
  assertions.push({ assertion: name, passed: Boolean(ok), detail });
  if (!ok) failures.push(`${name}: ${detail}`);
};

const run = (cmd, args, cwd, env = {}) =>
  spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1024 * 1024 * 64 });

const scratches = [];

/**
 * A miniature site whose shape is the only thing the guard cares about: pages,
 * a sitemap that points at them, the real release topology, and git history for
 * the deriver to read dates from.
 */
function buildScratchRepo(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ledger-receipt-${label}-`));
  scratches.push(dir);
  fs.mkdirSync(path.join(dir, 'data/workflows'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data/sitemap'), { recursive: true });
  for (const p of ['alpha', 'beta']) {
    fs.mkdirSync(path.join(dir, p), { recursive: true });
    fs.writeFileSync(path.join(dir, p, 'index.html'), `<html><body><p>${p} original visible text</p></body></html>`);
  }
  fs.writeFileSync(path.join(dir, 'sitemap-test.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + '<url><loc>https://example.test/alpha</loc><lastmod>2026-01-01</lastmod></url>\n'
    + '<url><loc>https://example.test/beta</loc><lastmod>2026-01-01</lastmod></url>\n</urlset>\n');
  fs.copyFileSync(TOPOLOGY, path.join(dir, 'data/workflows/workflow_topology.json'));
  const git = (...a) => run('git', a, dir);
  if (git('init', '-q').status !== 0) return null;
  git('config', 'user.email', 'self-test@example.test');
  git('config', 'user.name', 'ledger receipt self test');
  git('add', '-A');
  if (git('commit', '-qm', 'site').status !== 0) return null;
  return dir;
}
const derive = (dir) => run('node', [DERIVER], dir);
const guard = (dir, env = {}) => run('node', [GUARD], dir, env);
const commitAll = (dir, msg) => { run('git', ['add', '-A'], dir); return run('git', ['commit', '-qm', msg], dir); };
const rewritePage = (dir, page, text) =>
  fs.writeFileSync(path.join(dir, page, 'index.html'), `<html><body><p>${text}</p></body></html>`);
const readReport = (dir) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'artifacts/validation/lastmod-ledger-final.json'), 'utf8')); }
  catch { return null; }
};

// ---------------------------------------------------------------- assertion 1
// Run 33767079923, reproduced: the receipt arrives with the checkout.
{
  const dir = buildScratchRepo('inherited');
  if (!dir || derive(dir).status !== 0 || commitAll(dir, 'derive ledger and receipt').status !== 0) {
    check('scratch repository for the inherited-receipt case could be built', false,
      'the harness could not build the repository, so it examined nothing');
  } else {
    // The bot lane has committed ledger AND receipt. A later run checks that out
    // and its release stages rewrite pages. No derivation happens.
    rewritePage(dir, 'alpha', 'alpha rewritten by a release stage after the checkout');
    const res = guard(dir);
    const report = readReport(dir);
    check(
      'a receipt inherited from the commit is not evidence that this run derived the ledger',
      res.status === 0,
      `expected the guard to exit 0 when no derivation ran in this run; got ${res.status}: ${(res.stderr || '').trim().slice(0, 400)}`,
    );
    check(
      'arm B is recorded as skipped, so the pass is explained rather than silent',
      report && report.rederived_ledger_vs_working_tree && report.rederived_ledger_vs_working_tree.ran === false,
      `expected rederived_ledger_vs_working_tree.ran === false in the report; got ${JSON.stringify(report && report.rederived_ledger_vs_working_tree)}`,
    );
    check(
      'the run still examined pages, so exiting 0 is not exiting 0 having done nothing (Rule 0)',
      report && report.pages_examined > 0,
      `expected pages_examined > 0; got ${report && report.pages_examined}`,
    );
  }
}

// ---------------------------------------------------------------- assertion 2
// The negative arm. Assertion 1 must not be reachable by weakening arm B.
{
  const dir = buildScratchRepo('genuine');
  if (!dir || derive(dir).status !== 0 || commitAll(dir, 'derive ledger and receipt').status !== 0) {
    check('scratch repository for the genuine-defect case could be built', false,
      'the harness could not build the repository, so it examined nothing');
  } else {
    // Derive IN THIS RUN, then let a stage rewrite a page after it. This is the
    // real ordering defect, and it must remain a hard failure.
    rewritePage(dir, 'beta', 'beta changed by an earlier release stage');
    if (derive(dir).status !== 0) {
      check('the in-run derivation succeeded', false, 'the deriver failed, so the negative arm proved nothing');
    } else {
      rewritePage(dir, 'alpha', 'alpha rewritten AFTER the derivation, which is the defect');
      const res = guard(dir);
      const report = readReport(dir);
      check(
        'a page rewritten after an in-run derivation is still a hard failure',
        res.status !== 0,
        `expected the guard to exit non-zero; got ${res.status}. Arm B has been weakened.`,
      );
      check(
        'the failure is arm B naming the stale page, not some unrelated error',
        report && report.rederived_ledger_vs_working_tree
          && report.rederived_ledger_vs_working_tree.ran === true
          && report.rederived_ledger_vs_working_tree.mismatched > 0,
        `expected arm B to have run and found a mismatch; got ${JSON.stringify(report && report.rederived_ledger_vs_working_tree)}`,
      );
    }
  }
}

// ---------------------------------------------------------------- assertion 3
// A no-op re-derivation is still a derivation - the property #60 established,
// which this change must not undo. Identical ledger bytes, fresh receipt.
{
  const dir = buildScratchRepo('noop');
  if (!dir || derive(dir).status !== 0 || commitAll(dir, 'derive ledger and receipt').status !== 0) {
    check('scratch repository for the no-op case could be built', false,
      'the harness could not build the repository, so it examined nothing');
  } else {
    const before = fs.readFileSync(path.join(dir, 'data/sitemap/lastmod_ledger.json'), 'utf8');
    const receiptBefore = fs.readFileSync(path.join(dir, RECEIPT_REL), 'utf8');
    const again = derive(dir);
    const after = fs.readFileSync(path.join(dir, 'data/sitemap/lastmod_ledger.json'), 'utf8');
    const receiptAfter = fs.readFileSync(path.join(dir, RECEIPT_REL), 'utf8');
    check(
      're-deriving a correct ledger leaves it byte-identical, which is what made the old proxy wrong',
      again.status === 0 && before === after,
      `expected an unchanged ledger from a no-op derivation; changed=${before !== after}, exit=${again.status}`,
    );
    check(
      'the no-op derivation still writes a receipt that differs from the committed one, so it is admitted as this run\'s',
      receiptAfter !== receiptBefore,
      'the no-op derivation left the receipt byte-identical to the committed one, so it is now indistinguishable from an inherited receipt',
    );
    // And end to end: a no-op derivation over an intact tree must pass, with arm
    // B having actually run. Green because the work was done, not because it was skipped.
    const res = guard(dir);
    const report = readReport(dir);
    check(
      'a no-op in-run derivation over an intact tree passes with arm B having run',
      res.status === 0 && report && report.rederived_ledger_vs_working_tree.ran === true
        && report.rederived_ledger_vs_working_tree.pages_examined > 0,
      `expected exit 0 with arm B run over >0 pages; exit=${res.status}, armB=${JSON.stringify(report && report.rederived_ledger_vs_working_tree)}`,
    );
  }
}

// ---------------------------------------------------------------- assertion 4
// The predicate must actually consult HEAD. A behavioural suite cannot see a
// removal that happens to leave every scratch case passing for another reason.
{
  const lib = fs.readFileSync(LIB, 'utf8');
  check(
    'ledgerDerivationReceipt compares the receipt on disk against the one committed at HEAD',
    /HEAD:\$\{LEDGER_RECEIPT_PATH\}/.test(lib) && /atHead === receiptText/.test(lib),
    'the HEAD comparison is gone from scripts/lib/sitemap_ledger.mjs; a committed receipt would again pass as this run\'s',
  );
}

// ------------------------------------------------------------------- Rule 0
if (assertions.length === 0) {
  console.error('[ledger-receipt-run-scope] FAIL: zero assertions executed, so this self-test proved nothing (Rule 0).');
  process.exit(1);
}

for (const dir of scratches) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }

const report = {
  schema_version: '1.0',
  self_test: 'ledger-receipt-run-scope',
  generated_at: new Date().toISOString(),
  scratch_repositories: scratches.length,
  assertions_executed: assertions.length,
  assertions,
  status: failures.length ? 'FAIL' : 'PASS',
  failures,
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error('[ledger-receipt-run-scope] FAIL');
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log(
  `[ledger-receipt-run-scope] PASS: ${assertions.length} assertion(s) across ${scratches.length} scratch repositor(ies); `
  + 'a receipt inherited from the commit is refused, a page rewritten after an in-run derivation still hard-fails, '
  + 'and a no-op re-derivation is still admitted as a derivation.',
);
