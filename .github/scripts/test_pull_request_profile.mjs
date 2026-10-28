#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyProfile} from './verify_pull_request_profile.mjs';

const matrix = JSON.parse(fs.readFileSync('_repo_validation_matrix.json', 'utf8'));
const steps = [];
function add(name) {
  const profile = matrix.profiles[name];
  for (const parent of profile.extends || []) add(parent);
  for (const step of profile.steps || []) {
    if (!steps.some(s => (s.id || s.command) === (step.id || step.command))) steps.push(step);
  }
}
add('changed');
const healthy = {profile: 'changed', head_sha: 'fixture-sha', status: 'PASS', failure_count: 0,
  steps: steps.map(s => ({...s, exit_code: 0, status: 'PASS'}))};
assert.equal(verifyProfile(matrix, healthy, 'fixture-sha'), steps.length);
const reject = (mutate, pattern) => {
  const receipt = structuredClone(healthy);
  mutate(receipt);
  assert.throws(() => verifyProfile(matrix, receipt, 'fixture-sha'), pattern);
};
reject(r => r.steps.pop(), /unexecuted/);
reject(r => r.steps = [], /unexecuted/);
reject(r => r.steps.push(r.steps[0]), /duplicate/);
reject(r => r.steps[0].command = 'echo skipped', /stale command/);
reject(r => r.steps[0].exit_code = 1, /failed step/);
reject(r => r.status = 'FAIL', /did not pass/);
reject(r => r.stopped_early_at = 'producer', /did not pass/);
reject(r => r.head_sha = 'earlier-sha', /commit SHA/);
assert.throws(() => verifyProfile({profiles: {changed: {steps: []}}}, healthy, 'fixture-sha'), /zero steps/);

// Keep the fast event path and the full release path separate. In particular,
// a green PR may not authorize an attestation or bypass a failed main build.
const workflow = fs.readFileSync('.github/workflows/validate-repo.yml', 'utf8');
assert.match(workflow, /pull-request:\n    if: github.event_name == 'pull_request'/);
assert.match(workflow, /prepare:\n    if: github.event_name != 'pull_request'/);
assert.match(workflow, /needs: \[pull-request, prepare, validate, clean-rebuild\]/);
assert.match(workflow, /github.event_name != 'pull_request'\n      && needs.prepare.result == 'success'\n      && needs.validate.result == 'success'\n      && needs.clean-rebuild.result == 'success'/);
assert.match(workflow, /name: Warnings and attestation[\s\S]*?if: github.event_name != 'pull_request'/);
assert.match(workflow, /run: npm run validate:changed/);
assert.match(workflow, /run: node .github\/scripts\/verify_pull_request_profile.mjs/);
console.log('[test:pr-profile] PASS: missing, duplicate, failed, stale and wrong-SHA receipts fail; main still requires full validation and parity');
