#!/usr/bin/env node
/**
 * A NO-OP RE-DERIVATION IS STILL A RE-DERIVATION.
 *
 * WHAT WENT WRONG
 *
 * validate_lastmod_ledger_final.mjs arm B - "a ledger re-derived in this run
 * must fit the tree" - decided whether a derivation had happened by asking
 * whether the ledger on disk differed from the one committed at HEAD. That is a
 * proxy, and it is wrong in exactly one case: when the committed ledger is
 * already correct, so re-deriving it produces identical bytes.
 *
 * In `pending` scope, which REQUIRES arm B to have run, that correct no-op is a
 * hard failure. Observed on Spry Content Release run 33728997404: the release
 * converged, `sitemap:lastmod:content` reported `"ledger_changed": false`, and
 * the very next command failed with "pending scope ran without re-deriving the
 * ledger (arm B did not run)". A lane that had done everything right went red
 * for doing it right - the inverse of the rule that a legitimate stop must be
 * green.
 *
 * The derivation now records the fact rather than leaving it to be inferred: a
 * receipt carrying the sha256 of the ledger text it left on disk, trusted only
 * while that hash still matches what is there.
 *
 * WHAT IS ASSERTED
 *
 *   The receipt predicate, exercised against real files in a scratch tree:
 *     - a receipt whose hash matches the ledger on disk is accepted
 *     - a receipt whose hash does NOT match is refused, so a stale receipt can
 *       never stand in for a derivation that did not happen
 *     - a missing or malformed receipt is refused
 *     - a receipt with no ledger to compare against is refused
 *
 *   And the wiring, because a predicate nothing consults protects nothing:
 *     - the derivation writes the receipt unconditionally, not only when the
 *       ledger changed, which is the entire point
 *     - arm B admits a derivation on the receipt
 *
 * Hard-fails if it executes ZERO assertions.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, 'artifacts/validation/lastmod-derivation-receipt-self-test.json');
const DERIVER = path.join(ROOT, 'scripts/sitemap_content_lastmod.mjs');
const GUARD = path.join(ROOT, 'scripts/validation/validate_lastmod_ledger_final.mjs');

const assertions = [];
const failures = [];
const check = (name, ok, detail) => {
  assertions.push({ assertion: name, passed: Boolean(ok), detail });
  if (!ok) failures.push(`${name}: ${detail}`);
};

// The predicate is exercised in a scratch tree, because it reads from disk
// relative to the process cwd and the real repository's receipt must not be
// disturbed by a self-test.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'lastmod-receipt-'));
const previousCwd = process.cwd();
try {
  fs.mkdirSync(path.join(scratch, 'data/sitemap'), { recursive: true });
  fs.mkdirSync(path.join(scratch, 'artifacts/validation'), { recursive: true });
  process.chdir(scratch);

  const lib = await import(`${path.join(ROOT, 'scripts/lib/sitemap_ledger.mjs')}?self-test=${Date.now()}`);
  const { writeLedgerDerivationReceipt, ledgerDerivationReceipt, ledgerTextHash, LEDGER_RECEIPT_PATH } = lib;

  const ledgerText = JSON.stringify({ urls: [{ loc: 'https://example.test/', source_file: 'a.html', content_sha256: 'x' }] }, null, 2);

  writeLedgerDerivationReceipt(ledgerText, { ledger_changed: false });
  check(
    'the receipt is written even when the derivation changed nothing',
    fs.existsSync(path.join(scratch, LEDGER_RECEIPT_PATH)),
    `expected a receipt at ${LEDGER_RECEIPT_PATH}`,
  );
  check(
    'a receipt matching the ledger on disk is accepted',
    ledgerDerivationReceipt(ledgerText) !== null,
    'the predicate refused a receipt whose hash matches the ledger it was written for',
  );
  check(
    'a receipt that does not match the ledger on disk is refused',
    ledgerDerivationReceipt(`${ledgerText}\n/* something else replaced it */`) === null,
    'a stale receipt was accepted, so it could stand in for a derivation that never happened',
  );
  check(
    'a receipt is refused when there is no ledger text to compare',
    ledgerDerivationReceipt(null) === null,
    'the predicate accepted a receipt with nothing to compare it against',
  );
  check(
    'the recorded hash is the hash of the ledger text',
    JSON.parse(fs.readFileSync(path.join(scratch, LEDGER_RECEIPT_PATH), 'utf8')).ledger_sha256 === ledgerTextHash(ledgerText),
    'the receipt records a hash that is not the ledger it describes',
  );

  fs.writeFileSync(path.join(scratch, LEDGER_RECEIPT_PATH), '{ not json');
  check(
    'a malformed receipt is refused',
    ledgerDerivationReceipt(ledgerText) === null,
    'an unparseable receipt was treated as proof of a derivation',
  );
} finally {
  process.chdir(previousCwd);
  fs.rmSync(scratch, { recursive: true, force: true });
}

// ------------------------------------------------------------------ WIRING
const deriver = fs.readFileSync(DERIVER, 'utf8');
const guard = fs.readFileSync(GUARD, 'utf8');

check(
  'the derivation writes the receipt outside the ledger-changed branch',
  /if \(ledgerChanged\) fs\.writeFileSync\(ledgerPath, ledgerText\);\s*\n(?:\s*\/\/[^\n]*\n)*\s*writeLedgerDerivationReceipt\(/.test(deriver),
  'writeLedgerDerivationReceipt must run on every derivation; guarding it on ledgerChanged reinstates the defect exactly',
);
check(
  'arm B admits a derivation on the receipt',
  /const derivationReceipt = ledgerDerivationReceipt\(ledgerTextOnDisk\);/.test(guard)
  && /const rederived = Boolean\(derivationReceipt\)/.test(guard),
  'the guard must consult ledgerDerivationReceipt; without it the HEAD-difference proxy is back',
);
check(
  'arm B still runs when the receipt is absent but the ledger differs from HEAD',
  /ledgerTextOnDisk !== ledgerTextAtHead/.test(guard),
  'the HEAD-difference fallback must stay for callers that derive outside this path',
);

if (assertions.length === 0) {
  console.error('[lastmod-derivation-receipt-self-test] FAIL: zero assertions executed, so this self-test proved nothing.');
  process.exit(1);
}

const report = {
  schema_version: '1.0',
  self_test: 'lastmod-derivation-receipt',
  generated_at: new Date().toISOString(),
  assertions_executed: assertions.length,
  assertions,
  status: failures.length ? 'FAIL' : 'PASS',
  failures,
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error('[lastmod-derivation-receipt-self-test] FAIL');
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log(
  `[lastmod-derivation-receipt-self-test] PASS: ${assertions.length} assertion(s); a no-op re-derivation is recorded as a derivation, `
  + 'a receipt that no longer matches the ledger is refused, and arm B reads the receipt rather than inferring from HEAD.',
);
