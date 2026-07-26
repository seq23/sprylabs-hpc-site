import fs from 'node:fs';
import path from 'node:path';
import { readJson, fail, pass, writeSummary } from './common.mjs';

const errors = [];
const workflowDir = '.github/workflows';
const expectedWorkflows = [
  'daily-citation-intelligence.yml',
  'deploy-distribution.yml',
  'postdeploy-public-audit.yml',
  'spry-content-release.yml',
  'spry-full-rebuild.yml',
  'validate-repo.yml',
  'admin-command.yml',
  'admin-operations.yml',
].sort();
const retiredWorkflows = [
  'citation-velocity-5k.yml',
  'content-authority-pipeline.yml',
  'daily-insight.yml',
  'execution-strict.yml',
  'reddit-daily.yml',
  'reddit-evening.yml',
  'social-signal-processing.yml',
  'synthesis-weekly.yml',
  'validate.yml',
  'whitepaper-release.yml',
  'workflow-monitor.yml',
];
const mutationWorkflows = new Set(['spry-content-release.yml', 'spry-full-rebuild.yml']);
const allowedActions = new Set([
  'actions/checkout@v4',
  'actions/setup-node@v4',
  'actions/upload-artifact@v4',
  'actions/download-artifact@v4',
]);
const pkg = readJson('package.json');
const packageScripts = pkg.scripts || {};
const registry = readJson('_validation_registry.json').records || [];
const matrix = readJson('_repo_validation_matrix.json').entries || [];
const packaging = readJson('_baseline_packaging_contract.json');
const contracts = readJson('data/workflows/workflow_contracts.json').governed_workflows || [];
const governedByFile = new Map(contracts.map(item => [path.basename(item.workflow_file), item]));
const requiredFiles = new Set(packaging.required_files || []);
const actualWorkflows = fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/.test(name)).sort();

function has(text, token, workflow, label = token) {
  if (!text.includes(token)) errors.push(`${workflow}: missing ${label}`);
}

for (const retired of retiredWorkflows) {
  if (actualWorkflows.includes(retired)) errors.push(`retired public workflow still present: ${retired}`);
}
for (const expected of expectedWorkflows) {
  if (!actualWorkflows.includes(expected)) errors.push(`missing required simplified workflow: ${expected}`);
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
  if (!/^env:\s*\n\s{2}NODE_OPTIONS:\s*--max-old-space-size=3072\s*$/m.test(text)) errors.push(`${name}: root NODE_OPTIONS must be --max-old-space-size=3072`);
  has(text, 'actions/checkout@v4', name);
  has(text, 'actions/setup-node@v4', name);
  if (!/node-version:\s*24\b/.test(text)) errors.push(`${name}: Node 24 setup is required`);
  if (!/cache:\s*npm\b/.test(text)) errors.push(`${name}: npm dependency caching is required`);
  has(text, 'npm ci --ignore-scripts', name);
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
    if (!/fetch-depth:\s*0\b/.test(text)) errors.push(`${name}: mutating workflow requires fetch-depth: 0`);
    has(text, '.github/scripts/commit_and_push_if_changed.sh', name, 'safe commit helper');
    has(text, 'npm run workflow:run', name, 'governed workflow runner');
    has(text, 'actions/upload-artifact@v4', name, 'diagnostic artifact upload');
    const contract = governedByFile.get(name);
    if (!contract) {
      errors.push(`${name}: mutating workflow has no governed workflow contract`);
    } else {
      has(text, `--workflow ${contract.id}`, name, 'contract workflow id');
      const helper = `./.github/scripts/commit_and_push_if_changed.sh "${contract.commit_message}" ${contract.id}`;
      has(text, helper, name, 'contract commit helper invocation');
      if (!text.includes('workflow_dispatch:')) errors.push(`${name}: mutating workflow must support manual dispatch`);
      if (contract.id === 'spry-content-release') {
        has(text, 'schedule:', name, 'scheduled consolidated release trigger');
        has(text, 'data/report_fixes/agent_runs/**/agent_run_manifest.json', name, 'manifest-only agent artifact trigger');
        has(text, "github.event_name != 'push' || !contains(github.event.head_commit.message, 'snapshot update from baseline ZIP')", name, 'baseline snapshot reentry guard');
        has(text, 'full-content-cycle', name, 'full-content-cycle mode');
        has(text, 'agent-intake', name, 'agent-intake mode');
        has(text, 'signal-intake', name, 'signal-intake mode');
        has(text, 'citation-expansion', name, 'citation-expansion mode');
      }
    }
  }

  if (name === 'validate-repo.yml') {
    has(text, 'name: Validate Repo', name);
    has(text, 'npm run release:ci-validate', name);
    has(text, 'spry-validated-${{ github.sha }}', name, 'exact validated artifact name');
    has(text, 'include-hidden-files: true', name);
    if (!/permissions:\s*\n\s{2}contents:\s*read/m.test(text)) errors.push(`${name}: validation workflow must declare contents: read`);
  }
  if (name === 'deploy-distribution.yml') {
    has(text, 'workflows: ["Validate Repo"]', name, 'Validate Repo workflow_run dependency');
    has(text, 'actions/download-artifact@v4', name);
    has(text, 'npm run release:verify-attestation', name);
    has(text, 'npm run distribution:deploy', name);
    if (!/permissions:\s*\n\s{2}contents:\s*read\s*\n\s{2}actions:\s*read/m.test(text)) errors.push(`${name}: deployment workflow must declare contents: read and actions: read`);
  }
  if (name === 'daily-citation-intelligence.yml') {
    has(text, 'npm run workflow:zero-dollar-autonomous', name);
    if (!/permissions:\s*\n\s{2}contents:\s*write/m.test(text)) errors.push(`${name}: autonomous citation intelligence workflow requires contents: write`);
    has(text, 'npm run validate:ownership', name);
    has(text, 'npm run safe-harbor:validate', name);
  }
  if (name === 'admin-operations.yml') {
    has(text, 'name: Admin Operations', name);
    has(text, 'workflow_dispatch:', name);
    has(text, 'npm run distribution:prepare', name);
    has(text, 'npm run self-heal:generated-content', name);
    has(text, 'npm run citation:self-heal', name);
    if (!/permissions:\s*\n\s{2}contents:\s*write/m.test(text)) errors.push(`${name}: admin operations require contents: write`);
  }
  if (name === 'admin-command.yml') {
    has(text, 'node scripts/admin/run_admin_command.mjs', name);
    has(text, 'npm run validate:full-safe-autonomy', name);
  }
  if (name === 'postdeploy-public-audit.yml') {
    has(text, 'npm run postdeploy:public-click-audit', name);
    has(text, 'npx playwright install --with-deps chromium', name, 'Playwright browser install');
    if (!/permissions:\s*\n\s{2}contents:\s*read/m.test(text)) errors.push(`${name}: postdeploy audit workflow must be read-only`);
  }
  if (text.includes('SPRY_ADMIN_PASSWORD')) errors.push(`${name}: static workflow must not inject SPRY_ADMIN_PASSWORD into generated HTML`);
}

for (const critical of [
  '.github/scripts/commit_and_push_if_changed.sh',
  'scripts/validation/validate_workflow_contract.mjs',
  'scripts/workflow/run_governed_workflow.mjs',
  'scripts/workflow/hostile_review.mjs',
  'scripts/validation/validate_workflow_lineage.mjs',
  'scripts/validation/validate_workflow_monitor.mjs',
  'data/workflows/workflow_contracts.json',
  'data/workflows/workflow_topology.json',
  'scripts/release/ci_validate.mjs',
  'scripts/release/create_validation_attestation.mjs',
  'scripts/release/verify_validation_attestation.mjs',
]) {
  if (!requiredFiles.has(critical)) errors.push(`${critical}: missing from baseline critical-file parity`);
}

const helper = '.github/scripts/commit_and_push_if_changed.sh';
if (!fs.existsSync(helper)) errors.push(`missing ${helper}`);
else {
  const helperText = fs.readFileSync(helper, 'utf8');
  for (const required of ['workflow_id=', 'git reset --hard', 'git clean -fd', 'Regenerating governed workflow', 'workflow_argv', 'git merge-base --is-ancestor']) {
    if (!helperText.includes(required)) errors.push(`${helper}: missing reset-regenerate retry behavior: ${required}`);
  }
}

const recommendationValidator = 'scripts/validators/validate_bhpc_agent_recommendation_driven_output.mjs';
if (!fs.existsSync(recommendationValidator)) errors.push(`missing ${recommendationValidator}`);
else {
  const validatorText = fs.readFileSync(recommendationValidator, 'utf8');
  for (const required of ['activeAcceptanceIds', 'outside_active_implementation_plan', 'active_plan_spec_count', 'skipped_count']) {
    if (!validatorText.includes(required)) errors.push(`${recommendationValidator}: missing active-plan scoped recommendation validation marker: ${required}`);
  }
}

writeSummary('validate-workflow-contract', {
  status: errors.length ? 'FAIL' : 'PASS',
  workflow_count: actualWorkflows.length,
  expected_workflow_count: expectedWorkflows.length,
  retired_workflows: retiredWorkflows,
  errors,
});
if (errors.length) fail(`[validate:workflow-contract] FAIL: ${errors.length} issue(s)`, errors);
pass(`[validate:workflow-contract] OK: simplified public workflow topology has ${actualWorkflows.length} admitted workflows and governed mutation lanes`);
