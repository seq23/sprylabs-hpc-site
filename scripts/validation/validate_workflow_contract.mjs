import fs from 'node:fs';
import path from 'node:path';
import { readJson, fail, pass, writeSummary } from './common.mjs';

const errors = [];
const workflowDir = '.github/workflows';
const expectedWorkflows = [
  'daily-citation-intelligence.yml',
  'deploy-distribution.yml',
  'spry-content-release.yml',
  'spry-full-rebuild.yml',
  'validate-repo.yml',
  'admin-command.yml',
  'admin-operations.yml',
  'search-intelligence.yml',
  'main-validation-sentinel.yml',
].sort();
const retiredWorkflows = [
  'citation-velocity-5k.yml',
  // Removed 2026-08-29 by owner decision: the postdeploy public click audit is
  // no longer part of the CI topology. Local real-browser proof remains.
  'postdeploy-public-audit.yml',
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
const mutationWorkflows = new Set(['spry-content-release.yml', 'spry-full-rebuild.yml', 'search-intelligence.yml']);
const allowedActions = new Set([
  'actions/checkout@',
  'actions/setup-node@',
  'actions/upload-artifact@',
  'actions/download-artifact@',
  'actions/setup-python@v5',
  // First-party GitHub action, same family as checkout/setup-node/upload-artifact
  // above. It was the only one of the five missing, which blocked the build cache
  // for no stated reason.
  'actions/cache@',
]);
const pkg = readJson('package.json');
const packageScripts = pkg.scripts || {};
const spryReleaseWrapper = String(packageScripts['workflow:spry-content-release'] || '');
if (!spryReleaseWrapper.includes('node scripts/authority_scale/run_guarded_release.mjs')) {
  errors.push('package.json: workflow:spry-content-release must pass appended --mode arguments directly to run_guarded_release.mjs');
}
if (spryReleaseWrapper.includes('bash -lc')) {
  errors.push('package.json: workflow:spry-content-release must not use bash -lc because appended release-mode arguments are swallowed by shell positional parameters');
}
const registry = readJson('_validation_registry.json').records || [];
const matrix = readJson('_repo_validation_matrix.json').entries || [];
const packaging = readJson('_baseline_packaging_contract.json');
const contracts = readJson('data/workflows/workflow_contracts.json').governed_workflows || [];
const governedByFile = new Map(contracts.map(item => [path.basename(item.workflow_file), item]));
for (const contract of contracts) {
  const modeOutputs = contract.required_outputs_by_mode || {};
  if (modeOutputs && typeof modeOutputs !== 'object') errors.push(`${contract.id}: required_outputs_by_mode must be an object`);
  const topology = readJson('data/workflows/workflow_topology.json').canonical_lanes?.[contract.canonical_lane || contract.lane];
  for (const [mode, outputs] of Object.entries(modeOutputs)) {
    if (!Array.isArray(outputs)) errors.push(`${contract.id}: required_outputs_by_mode.${mode} must be an array`);
    if (!topology?.modes?.includes(mode)) errors.push(`${contract.id}: required_outputs_by_mode references undeclared mode ${mode}`);
  }
}
const requiredFiles = new Set(packaging.required_files || []);
const actualWorkflows = fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/.test(name)).sort();

function has(text, token, workflow, label = token) {
  if (!text.includes(token)) errors.push(`${workflow}: missing ${label}`);
}

// The property this file actually needs to protect is "the declared validation
// profile is executed before the artifact is published" - not "one particular
// npm script name appears in the YAML". Asserting the name pinned validate-repo
// to a single serial entrypoint, so any sharded shape failed by construction
// even when it ran strictly more validation. Follow the call chain instead:
// npm scripts, `node <file>` entrypoints, and spawnSync('npm', ['run', X])
// argument arrays, which is how release:ci-validate actually reaches the profile
// executor (ci_validate -> release:prepush:container -> container_prepush ->
// validate:profile). Any shape that still reaches the executor passes.
const PROFILE_EXECUTOR = 'scripts/validation/validate_profile.mjs';
const SHARD_EXECUTOR = '.github/scripts/validation_shards.mjs';

// Reachability must follow CODE, not prose. Searching raw text meant a file that
// merely NAMED the executor in a comment satisfied the guard: validation_shards.mjs
// says "mirrors scripts/validation/validate_profile.mjs" in two comments, and that
// alone turned this check green while nothing called the executor. A guard that a
// comment can satisfy is not a guard, so comments are stripped before matching.
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // `//` only when it is not the `://` of a URL, so protocol strings survive.
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    // YAML and shell comments; `#` must start a token so `${{ }}` is untouched.
    .replace(/(^|\s)#[^\n]*/g, '$1');
}

function reaches(target, text, seen = new Set(), depth = 0) {
  if (depth > 10) return false;
  const code = stripComments(text);
  if (code.includes(target)) return true;
  const scripts = new Set();
  for (const m of code.matchAll(/\bnpm\s+run\s+([\w:.-]+)/g)) scripts.add(m[1]);
  for (const m of code.matchAll(/['"]run['"]\s*,\s*['"]([\w:.-]+)['"]/g)) scripts.add(m[1]);
  for (const name of scripts) {
    if (seen.has(`s:${name}`)) continue;
    seen.add(`s:${name}`);
    if (reaches(target, String(packageScripts[name] || ''), seen, depth + 1)) return true;
  }
  for (const m of code.matchAll(/\bnode\s+([\w./-]+\.(?:js|mjs|cjs))/g)) {
    const file = m[1];
    if (seen.has(`f:${file}`) || !fs.existsSync(file)) continue;
    seen.add(`f:${file}`);
    if (reaches(target, fs.readFileSync(file, 'utf8'), seen, depth + 1)) return true;
  }
  return false;
}

// The property: every validator the profile declares is executed against the
// built tree before the validated artifact is published, and that coverage is
// PROVEN rather than assumed. Two shapes satisfy it and the entrypoint name is
// not part of either.
//
//   serial   one process walks the profile in order - validate_profile.mjs is
//            itself the proof, because it iterates the matrix it just read.
//   sharded  the profile is split across runners, so execution alone proves
//            nothing: a shard that silently ran nothing would still exit 0.
//            The proof is the `verify` pass, which reconciles the union of the
//            shard receipts against the matrix AND the registry and hard-fails
//            on a missing, empty, or duplicated shard. Producers and shard runs
//            are required too - `verify` alone would pass over receipts that no
//            run produced.
//
// A sharded shape is accepted only with all three phases present, so nobody can
// keep the fast fan-out while dropping the coverage proof that makes it safe.
function validationProfileFullyExecuted(text) {
  if (reaches(PROFILE_EXECUTOR, text)) return {ok: true, shape: 'serial'};
  if (!reaches(SHARD_EXECUTOR, text)) {
    return {ok: false, reason: `no command in this workflow reaches ${PROFILE_EXECUTOR} or ${SHARD_EXECUTOR}, so the declared validation profile is never executed before the validated artifact is published. Any entrypoint or shard layout is fine; executing the declared profile is not optional.`};
  }
  const code = stripComments(text);
  const missing = ['producers', 'run', 'verify'].filter(phase => !new RegExp(`validation_shards\\.mjs\\s+${phase}\\b`).test(code));
  if (missing.length) {
    return {ok: false, reason: `shards the validation profile but never invokes ${missing.map(m => `\`${m}\``).join(', ')}; a sharded run proves coverage only when producers build the tree, shards execute it, and \`verify\` reconciles the union of the receipts against _repo_validation_matrix.json and _validation_registry.json. Without that an empty shard would exit 0 having done nothing.`};
  }
  return {ok: true, shape: 'sharded'};
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
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (/^if\s*:\s*.*\bsecrets\./.test(trimmed)) {
      errors.push(`${name}: line ${index + 1} must not reference secrets.* directly in an if expression; map the secret through env and test env.* instead`);
    }
  }
  if (!/^name:\s*\S/m.test(text)) errors.push(`${name}: missing workflow name`);
  if (!/^on:\s*$/m.test(text)) errors.push(`${name}: missing on trigger mapping`);
  if (!/^jobs:\s*$/m.test(text)) errors.push(`${name}: missing jobs mapping`);
  if (!/^env:\s*\n\s{2}NODE_OPTIONS:\s*--max-old-space-size=3072\s*$/m.test(text)) errors.push(`${name}: root NODE_OPTIONS must be --max-old-space-size=3072`);
  has(text, 'actions/checkout@', name);
  has(text, 'actions/setup-node@', name);
  if (!/node-version:\s*24\b/.test(text)) errors.push(`${name}: Node 24 setup is required`);
  if (!/cache:\s*npm\b/.test(text)) errors.push(`${name}: npm dependency caching is required`);
  has(text, 'npm ci --ignore-scripts', name);
  for (const line of lines) {
    const trimmed = line.trim();
    // A step written as `- name: X` / `uses: y@v1` puts `uses:` on its own line,
    // so keying on '- uses:' let every named step's action through unreviewed -
    // an allowlist that cannot see half the actions it governs. Match both forms.
    if (trimmed.startsWith('- uses:') || trimmed.startsWith('uses:')) {
      const action = trimmed.replace(/^-\s*/, '').slice('uses:'.length).trim();
      // Entries ending in '@' allow any version of that action. Pinning exact
      // versions here meant every routine action upgrade failed the build, which
      // is what stranded the Node 20 -> 24 migration.
      const reviewed = [...allowedActions].some(a => a.endsWith('@') ? action.startsWith(a) : action === a);
      if (!reviewed) errors.push(`${name}: unreviewed action reference ${action}`);
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
    has(text, 'actions/upload-artifact@', name, 'diagnostic artifact upload');
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
    const executed = validationProfileFullyExecuted(text);
    if (!executed.ok) errors.push(`${name}: ${executed.reason}`);
    // Whichever shape is used, the run must still end in the two checks the
    // serial entrypoint bundled alongside the profile: two isolated rebuilds
    // agreeing, and an attestation over the result that deploy-distribution
    // later verifies. Sharding moved these between jobs; it must not drop them.
    has(text, 'validate:clean-rebuild-parity', name, 'clean rebuild parity check');
    has(text, 'release:create-attestation', name, 'validated artifact attestation');
    has(text, 'validate:warnings', name, 'warning surface');
    has(text, 'spry-validated-${{ github.sha }}', name, 'exact validated artifact name');
    has(text, 'include-hidden-files: true', name);
    if (!/permissions:\s*\n\s{2}contents:\s*read/m.test(text)) errors.push(`${name}: validation workflow must declare contents: read`);
  }
  if (name === 'deploy-distribution.yml') {
    has(text, 'workflows: ["Validate Repo"]', name, 'Validate Repo workflow_run dependency');
    has(text, 'actions/download-artifact@', name);
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
  if (name === 'search-intelligence.yml') {
    if (!text.includes('npm run workflow:search-intelligence') && !text.includes('bash .github/scripts/run_search_intelligence_cycle.sh')) errors.push(`${name}: missing separate search-intelligence runner`);
    if (text.includes('node scripts/agent_intake/') || text.includes('npm run agent:')) errors.push(`${name}: search-intelligence workflow must not invoke AI-agent intake`);
    has(text, 'reports/workflows/search-intelligence/', name, 'search-intelligence trace artifact path');
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
