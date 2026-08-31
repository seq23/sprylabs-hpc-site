#!/usr/bin/env node
/**
 * The validation attestation must agree with the profile receipt it attests to.
 *
 * scripts/release/create_validation_attestation.mjs writes
 * `validation_status: 'PASS'` and `actionable_warnings: 0` as literals. It never
 * reads the profile receipt, so it prints "[validation-attestation] PASS" over a
 * run that failed. Reproduced: with
 * artifacts/validation/profile-container-prepush.json recording status FAIL and
 * two named failing validators, the producer still emitted PASS / 0 warnings.
 * An attestation that cannot say anything but PASS is a signature on an unread
 * document.
 *
 * The producer lives in scripts/release/, which is the release lane's territory,
 * so this validator does not fix it - it makes the lie detectable. Both files it
 * compares are committed to the repo, so the check is reachable from an ordinary
 * validation profile: it does not depend on the ordering inside ci_validate.mjs,
 * where the attestation is written after the profile has already finished.
 *
 * What it asserts is the property, not the implementation: whatever writes the
 * attestation, and whatever shape it uses, the status it claims has to match the
 * receipt of the run it claims to describe. A producer rewritten to derive its
 * status passes this unchanged.
 */

import fs from 'node:fs';

const ATTESTATION = 'reports/validation-attestation.json';
const RECEIPT_DIR = 'artifacts/validation';

function readJson(path) {
  if (!fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`[validate:attestation-matches-receipt] FAIL: ${path} is not parseable JSON (${error.message}). An unreadable attestation cannot be trusted, and treating it as absent would let a corrupt one through.`);
    process.exit(1);
  }
}

const attestation = readJson(ATTESTATION);
if (!attestation) {
  console.error(`[validate:attestation-matches-receipt] FAIL: ${ATTESTATION} is missing. It is a committed file; deploy-distribution.yml and scripts/release/verify_validation_attestation.mjs both read it, so its absence is not a skip condition.`);
  process.exit(1);
}

// The attestation describes one specific run: scripts/release/ci_validate.mjs
// invokes release:prepush:container, which runs `validate:profile
// container-prepush`, and only then writes the attestation. So the receipt this
// attestation is about is the container-prepush one.
//
// A first draft compared against every profile-*.json on disk. That was wrong
// and the run said so: artifacts/validation/profile-tmp-a.json and its siblings
// are self-test fixtures that record FAIL on purpose, and profile-full-audit.json
// is a different profile's older receipt. Comparing an attestation against runs
// it never claimed to describe manufactures failures, which is its own way of
// making a guard untrustworthy.
const RECEIPT = `${RECEIPT_DIR}/profile-container-prepush.json`;
const receiptDoc = readJson(RECEIPT);

// Rule 0: this receipt is the entire examination set. Without it there is nothing
// to check the attestation against, and passing would assert an agreement that
// was never tested.
if (!receiptDoc) {
  console.error(`[validate:attestation-matches-receipt] FAIL: ${RECEIPT} is missing. It is a committed file and it is the run ${ATTESTATION} attests to; with no receipt this check compares nothing.`);
  process.exit(1);
}
if (typeof receiptDoc.status !== 'string') {
  console.error(`[validate:attestation-matches-receipt] FAIL: ${RECEIPT} carries no status field, so the attestation cannot be checked against it.`);
  process.exit(1);
}
const receipts = [{ name: 'profile-container-prepush.json', doc: receiptDoc }];

const errors = [];
for (const { name, doc } of receipts) {
  const receiptPassed = doc.status === 'PASS';
  const attestationPassed = attestation.validation_status === 'PASS';
  if (!receiptPassed && attestationPassed) {
    errors.push(
      `${ATTESTATION} claims validation_status=PASS, but ${RECEIPT_DIR}/${name} records status=${doc.status}`
      + `${(doc.failures || []).length ? ` with failing step(s): ${doc.failures.join(', ')}` : ''}.`
      + ' The attestation is asserting a result the run did not produce.',
    );
  }
  const failureCount = Number(doc.failure_count || (doc.failures || []).length || 0);
  if (failureCount > 0 && Number(attestation.actionable_warnings) === 0) {
    errors.push(
      `${ATTESTATION} claims actionable_warnings=0, but ${RECEIPT_DIR}/${name} records ${failureCount} failing step(s).`,
    );
  }
}

if (errors.length) {
  console.error('[validate:attestation-matches-receipt] FAIL: the attestation does not match the run it attests to');
  for (const e of errors) console.error(`- ${e}`);
  console.error('Fix belongs in scripts/release/create_validation_attestation.mjs, which writes validation_status and actionable_warnings as literals instead of deriving them from the receipt.');
  process.exit(1);
}

console.log(
  `[validate:attestation-matches-receipt] PASS: ${ATTESTATION} (validation_status=${attestation.validation_status},`
  + ` actionable_warnings=${attestation.actionable_warnings}) agrees with ${receipts.length} profile receipt(s):`
  + ` ${receipts.map((r) => `${r.name}=${r.doc.status}`).join(', ')}`,
);
