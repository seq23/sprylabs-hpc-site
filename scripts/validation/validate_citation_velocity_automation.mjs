#!/usr/bin/env node
import fs from 'node:fs';
import {readJson, fail, pass, writeSummary} from './common.mjs';
import {buildExecutionGraph, assertReachable} from './orchestration_graph.mjs';

const errors = [];
function exists(file) { if (!fs.existsSync(file)) errors.push(`missing required file: ${file}`); }
for (const file of [
  'data/citation_velocity/velocity_5k_plan.json',
  'data/citation_velocity/atom_axes.json',
  'data/citation_velocity/generated_ledger.json',
  'data/citation_velocity/daily_runs.json',
  'data/citation_velocity/latest_batch.json',
  'scripts/programmatic/generate_citation_velocity_batch.mjs',
  '.github/workflows/spry-content-release.yml',
  'docs/strategy/BHPC_5K_AEO_GEO_PROGRAMMATIC_AUTOMATION_PLAN.md',
]) exists(file);

const plan = readJson('data/citation_velocity/velocity_5k_plan.json');
const governor = readJson('data/authority_scale/velocity_governor.json');
const axes = readJson('data/citation_velocity/atom_axes.json');
const pkg = readJson('package.json');
const lanes = readJson('data/content/programmatic_lane_contracts.json').lanes || {};
const workflows = readJson('data/workflows/workflow_contracts.json').governed_workflows || [];
const registry = readJson('_validation_registry.json').records || [];
const matrix = readJson('_repo_validation_matrix.json').entries || [];
const packaging = readJson('_baseline_packaging_contract.json');
const admissions = readJson('data/content/page_admission_registry.json').records || [];

const mix = plan.default_daily_mix || {};
// An emptied default_daily_mix sums to zero, so it passes both governed
// ceiling checks and the per-lane loop iterates nothing: a plan with its mix
// deleted would report the citation-expansion ceiling honoured by producing
// nothing at all.
if (!Object.keys(mix).length) errors.push('data/citation_velocity/velocity_5k_plan.json: default_daily_mix is empty or absent; it must name the per-lane daily batch mix that is checked against the governed citation-expansion ceiling. An empty mix proves nothing.');
const mixSum = Object.values(mix).reduce((sum, value) => sum + Number(value || 0), 0);
const expansionCeiling = Number(governor.citation_expansion_mode_batch_ceiling || 0);
if (!expansionCeiling) errors.push('authority-scale citation expansion ceiling is missing');
if (Number(plan.default_daily_batch_size) > expansionCeiling) errors.push(`legacy compatibility batch ${plan.default_daily_batch_size} exceeds governed citation-expansion ceiling ${expansionCeiling}`);
if (mixSum > expansionCeiling) errors.push(`default_daily_mix ${mixSum} exceeds governed citation-expansion ceiling ${expansionCeiling}`);
if (plan.targets_are_quotas !== false) errors.push('legacy 5K plan must explicitly state targets_are_quotas=false');
if (plan.authority !== 'SUBORDINATE_TO_AUTHORITY_SCALE_GOVERNOR') errors.push('legacy 5K plan must be subordinate to Authority Scale governor');
if (governor.targets_are_quotas !== false) errors.push('authority-scale velocity governor must state targets_are_quotas=false');
if (!plan.automation_model || plan.automation_model.operator_required !== 'none after merge unless GitHub Actions fails or external platform limits block execution') errors.push('automation model must document no routine operator work');
if (!lanes.citation_velocity_batch) errors.push('programmatic lane citation_velocity_batch missing');
for (const lane of Object.keys(mix)) if (!lanes[lane]) errors.push(`daily mix references unknown lane: ${lane}`);

const concepts = axes.concepts || [];
const theoretical = {
  question_cluster: (axes.verbs || []).length * (axes.outcomes || []).length * concepts.length,
  entity_use_case: (axes.audiences || []).length * (axes.states || []).length * concepts.length,
  comparison_graph: (axes.comparison_entities || []).length * (axes.dimensions || []).length * concepts.length,
  method: concepts.length * (axes.dimensions || []).length,
  glossary: concepts.length * (axes.dimensions || []).length,
  platform: (axes.platforms || []).length * (axes.platform_workflows || []).length * concepts.length,
  brand_defense: (axes.brand_questions || []).length * concepts.length,
};
const totalTheoretical = Object.values(theoretical).reduce((a,b)=>a+b,0);
if (totalTheoretical < 3000) errors.push(`atom axes must produce at least 3000 theoretical atoms; actual ${totalTheoretical}`);
if ((axes.concepts || []).some(item => !item.key || !item.framework || !item.value || !item.anchor)) errors.push('each concept atom must include key/framework/value/anchor');
if ((axes.comparison_entities || []).some(item => !item.name || !/^https:\/\//.test(item.url || ''))) errors.push('comparison entities must include https official URLs');

for (const script of ['citation:5k:daily','citation:5k:plan','validate:citation-velocity-automation','workflow:citation-velocity-5k','workflow:spry-content-release']) {
  if (!pkg.scripts?.[script]) errors.push(`package script missing: ${script}`);
}
if (!String(pkg.scripts?.['citation:5k:daily'] || '').includes('generate_citation_velocity_batch.mjs')) errors.push('citation:5k:daily must run the atom batch generator');
if (!String(pkg.scripts?.['workflow:citation-velocity-5k'] || '').includes('workflow:citation-expansion')) errors.push('legacy citation workflow alias must route through canonical citation-expansion lane');
const orchestrationGraph = buildExecutionGraph({pkg, matrix: readJson('_repo_validation_matrix.json')});
if (!assertReachable(orchestrationGraph, 'validate:all', 'validate:citation-velocity-automation')) errors.push('validate:citation-velocity-automation must be reachable from validate:all execution graph');

const workflow = workflows.find(item => item.id === 'spry-content-release');
if (!workflow) errors.push('spry-content-release governed workflow contract missing');
else {
  if (workflow.workflow_file !== '.github/workflows/spry-content-release.yml') errors.push('workflow file path drift');
  if (workflow.canonical_lane !== 'spry-content-release') errors.push('workflow canonical lane must be spry-content-release');
  if (workflow.workflow_command !== 'npm run workflow:spry-content-release') errors.push('workflow command drift');
  if (workflow.schedule_cron !== '17 14 * * *') errors.push('workflow schedule must be daily 14:17 UTC');
  if (workflow.remote_advance_strategy !== 'reset-regenerate-validate-recommit') errors.push('workflow must use reset-regenerate-validate-recommit');
  // With no required_outputs the contract verifies no artifact at all, so a
  // release that emitted nothing would still be recorded as having run.
  const requiredOutputs = workflow.required_outputs || [];
  if (!requiredOutputs.length) errors.push('data/workflows/workflow_contracts.json: spry-content-release lists no required_outputs; the contract must name the artifacts the release writes. An empty list verifies no artifact.');
  for (const file of requiredOutputs) if (!fs.existsSync(file)) errors.push(`workflow required output missing: ${file}`);
}

const workflowText = fs.existsSync('.github/workflows/spry-content-release.yml') ? fs.readFileSync('.github/workflows/spry-content-release.yml','utf8') : '';
for (const token of ['workflow_dispatch:', 'schedule:', '17 14 * * *', 'contents: write', 'citation-expansion', 'npm run workflow:run -- --workflow spry-content-release', './.github/scripts/commit_and_push_if_changed.sh "spry content release" spry-content-release']) {
  if (!workflowText.includes(token)) errors.push(`consolidated citation release workflow missing token: ${token}`);
}

for (const command of ['npm run citation:5k:daily','npm run citation:5k:plan','npm run validate:citation-velocity-automation','.github/workflows/spry-content-release.yml']) {
  const reg = registry.find(item => item.command === command && item.status === 'ADMITTED');
  if (!reg) errors.push(`registry admission missing for ${command}`);
  const mx = reg ? matrix.find(item => item.validation_id === reg.validation_id && item.command === command && item.status === 'ADMITTED') : null;
  if (!mx) errors.push(`matrix admission missing for ${command}`);
}
for (const required of ['.github/workflows/spry-content-release.yml','scripts/programmatic/generate_citation_velocity_batch.mjs','scripts/validation/validate_citation_velocity_automation.mjs','data/citation_velocity/velocity_5k_plan.json','data/citation_velocity/atom_axes.json','data/citation_velocity/generated_ledger.json','data/citation_velocity/daily_runs.json','data/citation_velocity/latest_batch.json','docs/strategy/BHPC_5K_AEO_GEO_PROGRAMMATIC_AUTOMATION_PLAN.md']) {
  if (!(packaging.required_files || []).includes(required)) errors.push(`${required}: missing from baseline critical-file parity`);
}

const currentCount = admissions.length;
const needed = Math.max(0, Number(plan.target_admitted_pages || 5000) - currentCount);
const runsAtExpansionCeiling = expansionCeiling > 0 ? Math.ceil(needed / expansionCeiling) : null;
writeSummary('validate-citation-velocity-automation', {
  status: errors.length ? 'FAIL' : 'PASS',
  public_workflow: '.github/workflows/spry-content-release.yml',
  workflow_mode: 'citation-expansion',
  current_admitted_count: currentCount,
  target: Number(plan.target_admitted_pages || 5000),
  needed,
  legacy_milestone_batches_at_current_expansion_ceiling: runsAtExpansionCeiling,
  citation_expansion_ceiling: expansionCeiling,
  default_daily_ceiling: Number(governor.current_default_new_page_ceiling_per_day || 0),
  theoretical_atom_count: totalTheoretical,
  theoretical_by_lane: theoretical,
  errors,
});
if (errors.length) fail(`[validate:citation-velocity-automation] FAIL: ${errors.length} issue(s)`, errors);
pass(`[validate:citation-velocity-automation] OK: ${currentCount} admitted, ${needed} to 5K, ${runsAtExpansionCeiling} governed batches at ${expansionCeiling}/run citation-expansion ceiling, routed through consolidated Spry Content Release, ${totalTheoretical} atoms available`);
