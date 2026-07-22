#!/usr/bin/env node
import fs from 'node:fs';
import { readJson, fail, pass, writeSummary } from '../validation/common.mjs';
import { profilePurityFindings } from '../validation/profile_purity_lib.mjs';

const matrix = readJson('_repo_validation_matrix.json');
const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts || {};
const findings = profilePurityFindings(matrix, scripts);
const report = {
  status: findings.length ? 'FAIL' : 'PASS',
  profile_count: Object.keys(matrix.profiles || {}).length,
  mutating_profile_steps: findings
};

writeSummary('validate-validation-profile-purity', report);

if (findings.length) {
  fail(
    `[validate:validation-profile-purity] FAIL: ${findings.length} validation profile step(s) call execution/mutation commands`,
    findings.map((x) => `${x.profile}:${x.id} -> ${x.reasons.join('; ')}`)
  );
}

pass(`[validate:validation-profile-purity] PASS: ${report.profile_count} profiles are read/check only`);
