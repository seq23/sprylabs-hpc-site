import fs from 'node:fs';
import path from 'node:path';
import { readJson, fail, pass, writeSummary } from './common.mjs';

const errors = [];
const workflowDir = '.github/workflows';
const expectedWorkflows = [
  'content-authority-pipeline.yml',
  'daily-insight.yml',
  'deploy-distribution.yml',
  'execution-strict.yml',
  'reddit-daily.yml',
  'reddit-evening.yml',
  'social-signal-processing.yml',
  'synthesis-weekly.yml',
  'validate.yml',
  'whitepaper-release.yml',
];
const mutationWorkflows = new Set([
  'content-authority-pipeline.yml',
  'daily-insight.yml',
  'execution-strict.yml',
  'reddit-daily.yml',
  'reddit-evening.yml',
  'social-signal-processing.yml',
  'synthesis-weekly.yml',
  'whitepaper-release.yml',
]);
const allowedActions = new Set([
  'actions/checkout@v6',
  'actions/setup-node@v6',
  'actions/upload-artifact@v7',
  'actions/download-artifact@v8',
]);
const pkg = readJson('package.json');
const packageScripts = pkg.scripts || {};
const registry = readJson('_validation_registry.json').records || [];
const matrix = readJson('_repo_validation_matrix.json').entries || [];
const packaging = readJson('_baseline_packaging_contract.json');
const requiredFiles = new Set(packaging.required_files || []);
const actualWorkflows = fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/.test(name)).sort();

function indexOrError(text, needle, label, workflow) {
  const idx = text.indexOf(needle);
  if (idx < 0) errors.push(`${workflow}: missing ${label}`);
  return idx;
}

for (const expected of expectedWorkflows) {
  if (!actualWorkflows.includes(expected)) errors.push(`missing required workflow: ${expected}`);
}
for (const actual of actualWorkflows) {
  if (!expectedWorkflows.includes(actual)) errors.push(`unreviewed workflow file present: ${actual}`);
}

for (const name of actualWorkflows) {
  const rel = `${workflowDir}/${name}`;
  const text = fs.readFileSync(rel, 'utf8');
  const lines = text.split(/\r?\n/);
  if (text.includes('\t')) errors.push(`${name}: tabs are forbidden in workflow YAML`);
  if (!/^name:\s*\S/m.test(text)) errors.push(`${name}: missing workflow name`);
  if (!/^on:\s*$/m.test(text)) errors.push(`${name}: missing on trigger mapping`);
  if (!/^jobs:\s*$/m.test(text)) errors.push(`${name}: missing jobs mapping`);
  if (!/^env:\s*\n\s{2}NODE_OPTIONS:\s*--max-old-space-size=3072\s*$/m.test(text)) {
    errors.push(`${name}: root NODE_OPTIONS must be --max-old-space-size=3072`);
  }
  if (!text.includes('actions/checkout@v6')) errors.push(`${name}: actions/checkout@v6 is required`);
  if (!text.includes('actions/setup-node@v6')) errors.push(`${name}: actions/setup-node@v6 is required`);
  if (!/node-version:\s*24\b/.test(text)) errors.push(`${name}: Node 24 setup is required`);
  if (!/cache:\s*npm\b/.test(text)) errors.push(`${name}: npm dependency caching is required`);
  if (!text.includes('npm ci --ignore-scripts')) errors.push(`${name}: npm ci --ignore-scripts is required`);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- uses:')) {
      const action = trimmed.slice('- uses:'.length).trim();
      if (!allowedActions.has(action)) errors.push(`${name}: unreviewed action reference ${action}`);
    }
  }
  for (const match of text.matchAll(/\bnpm\s+run\s+([\w:.-]+)/g)) {
    if (!packageScripts[match[1]]) errors.push(`${name}: references missing npm script ${match[1]}`);
  }
  for (const match of text.matchAll(/\bnode\s+([\w./-]+\.(?:js|mjs|cjs))/g)) {
    if (!fs.existsSync(match[1])) errors.push(`${name}: references missing Node entrypoint ${match[1]}`);
  }
  for (const match of text.matchAll(/['"]?(\.\/\.github\/scripts\/[\w./-]+\.sh)/g)) {
    const local = match[1].replace(/^\.\//, '');
    if (!fs.existsSync(local)) errors.push(`${name}: references missing local helper ${local}`);
    else if (!(fs.statSync(local).mode & 0o111)) errors.push(`${name}: local helper is not executable ${local}`);
  }

  const registryRecord = registry.find(record => record.command === rel && record.status === 'ADMITTED');
  if (!registryRecord) errors.push(`${name}: workflow is not admitted in _validation_registry.json`);
  else if (!matrix.some(entry => entry.validation_id === registryRecord.validation_id && entry.command === rel && entry.status === 'ADMITTED')) {
    errors.push(`${name}: workflow registry record has no active matrix entry`);
  }
  if (!requiredFiles.has(rel)) errors.push(`${name}: workflow missing from baseline critical-file parity`);

  if (mutationWorkflows.has(name)) {
    if (!/permissions:\s*\n\s{2}contents:\s*write/m.test(text)) errors.push(`${name}: mutating workflow requires contents: write`);
    if (!/concurrency:\s*\n\s{2}group:\s*main-automation\s*\n\s{2}cancel-in-progress:\s*false/m.test(text)) {
      errors.push(`${name}: mutating workflow must serialize through main-automation`);
    }
    if (!/fetch-depth:\s*0\b/.test(text)) errors.push(`${name}: mutating workflow requires fetch-depth: 0`);
    const laneRunner = indexOrError(text, 'npm run programmatic:run-lane', 'programmatic lane runner', name);
    const commit = indexOrError(text, '.github/scripts/commit_and_push_if_changed.sh', 'safe commit helper', name);
    if (laneRunner >= 0 && commit >= 0 && commit < laneRunner) errors.push(`${name}: commit helper runs before programmatic admission and canonical validation`);
    if (!/--lane\s+[a-z_]+\s+--\s+npm\s+run\s+workflow:[\w-]+/.test(text)) errors.push(`${name}: mutation command must be wrapped in a named admitted programmatic lane`);
  }

  if (name === 'deploy-distribution.yml') {
    if (!/permissions:\s*\n\s{2}contents:\s*read\s*\n\s{2}actions:\s*read/m.test(text)) errors.push(`${name}: deployment workflow must declare contents: read and actions: read`);
    if (!text.includes('workflow_run:') || !text.includes('workflows: ["Validate"]')) errors.push(`${name}: deployment must be triggered by successful Validate workflow completion`);
    const download = indexOrError(text, 'actions/download-artifact@v8', 'validated artifact download', name);
    const verify = indexOrError(text, 'npm run release:verify-attestation', 'attestation verification', name);
    const deploy = indexOrError(text, 'npm run distribution:deploy', 'distribution deployment command', name);
    if (download >= 0 && verify >= 0 && verify < download) errors.push(`${name}: attestation verification runs before artifact download`);
    if (verify >= 0 && deploy >= 0 && deploy < verify) errors.push(`${name}: distribution can run before attestation verification`);
    if (!text.includes('npm run release:ci-validate')) errors.push(`${name}: manual dispatch must validate and attest before deployment`);
  }

  if (name === 'validate.yml') {
    if (!text.includes('npm run release:ci-validate')) errors.push(`${name}: push/PR validation must run release:ci-validate`);
    if (!text.includes('actions/upload-artifact@v7')) errors.push(`${name}: validated distribution artifact must be uploaded`);
    if (!text.includes('reports/validation-attestation.json')) errors.push(`${name}: validation attestation must be uploaded`);
    if (!/permissions:\s*\n\s{2}contents:\s*read/m.test(text)) errors.push(`${name}: validation workflow must declare contents: read`);
  }

  if (text.includes('SPRY_ADMIN_PASSWORD')) errors.push(`${name}: static workflow must not inject SPRY_ADMIN_PASSWORD into generated HTML`);

  if (name === 'reddit-daily.yml' || name === 'reddit-evening.yml') {
    const beforeSteps = text.split(/\n\s{4}steps:\s*\n/, 1)[0];
    if (!beforeSteps.includes('REDDIT_ACCESS_TOKEN: ${{ secrets.REDDIT_ACCESS_TOKEN }}')) errors.push(`${name}: Reddit access token is not available to the fetch step`);
    if (!beforeSteps.includes('REDDIT_USER_AGENT: ${{ secrets.REDDIT_USER_AGENT }}')) errors.push(`${name}: Reddit user agent is not available to the fetch step`);
  }
}

const helper = '.github/scripts/commit_and_push_if_changed.sh';
if (!requiredFiles.has(helper)) errors.push(`${helper}: missing from baseline critical-file parity`);
if (!requiredFiles.has('scripts/validation/validate_workflow_contract.mjs')) errors.push('workflow validator missing from baseline critical-file parity');
for (const critical of ['scripts/programmatic/run_lane.mjs','scripts/release/ci_validate.mjs','scripts/release/create_validation_attestation.mjs','scripts/release/verify_validation_attestation.mjs']) if (!requiredFiles.has(critical)) errors.push(`${critical}: missing from baseline critical-file parity`);

const laneRunner='scripts/programmatic/run_lane.mjs';
if (fs.existsSync(laneRunner)) {
  const laneText=fs.readFileSync(laneRunner,'utf8');
  for (const token of ['build:all','validate_programmatic_admission.py','rejection_backlog.json','validate:all','validate:warnings','build:postprocess']) if (!laneText.includes(token)) errors.push(`${laneRunner}: missing required orchestration token ${token}`);
}
const ciRunner='scripts/release/ci_validate.mjs';
if (fs.existsSync(ciRunner)) {
  const ciText=fs.readFileSync(ciRunner,'utf8');
  for (const token of ['release:prepush:container','validate:warnings','validate:clean-rebuild-parity','release:create-attestation']) if (!ciText.includes(token)) errors.push(`${ciRunner}: missing required CI attestation stage ${token}`);
}
if (!fs.existsSync(helper)) errors.push(`missing ${helper}`);
else {
  const helperText = fs.readFileSync(helper, 'utf8');
  for (const required of ['git status --porcelain', 'npm run release:prepush:container', 'npm run validate:warnings', 'git commit --amend --no-edit']) {
    if (!helperText.includes(required)) errors.push(`${helper}: missing safe post-rebase behavior: ${required}`);
  }
}

writeSummary('validate-workflow-contract', {
  status: errors.length ? 'FAIL' : 'PASS',
  workflow_count: actualWorkflows.length,
  mutation_workflow_count: mutationWorkflows.size,
  expected_node: 24,
  errors,
});
if (errors.length) fail(`[validate:workflow-contract] FAIL: ${errors.length} issue(s)`, errors);
pass(`[validate:workflow-contract] OK: ${actualWorkflows.length} workflows use Node 24, canonical validation, admitted commands, safe ordering, and artifact parity`);
