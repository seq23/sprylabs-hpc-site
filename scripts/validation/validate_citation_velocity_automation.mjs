#!/usr/bin/env node
import fs from 'node:fs';
import {readJson, fail, pass, writeSummary} from './common.mjs';

const errors = [];
function exists(file) { if (!fs.existsSync(file)) errors.push(`missing required file: ${file}`); }
for (const file of [
  'data/citation_velocity/velocity_5k_plan.json',
  'data/citation_velocity/atom_axes.json',
  'data/citation_velocity/generated_ledger.json',
  'data/citation_velocity/daily_runs.json',
  'data/citation_velocity/latest_batch.json',
  'scripts/programmatic/generate_citation_velocity_batch.mjs',
  '.github/workflows/citation-velocity-5k.yml',
  'docs/strategy/BHPC_5K_AEO_GEO_PROGRAMMATIC_AUTOMATION_PLAN.md',
]) exists(file);

const plan = readJson('data/citation_velocity/velocity_5k_plan.json');
const axes = readJson('data/citation_velocity/atom_axes.json');
const pkg = readJson('package.json');
const lanes = readJson('data/content/programmatic_lane_contracts.json').lanes || {};
const workflows = readJson('data/workflows/workflow_contracts.json').governed_workflows || [];
const registry = readJson('_validation_registry.json').records || [];
const matrix = readJson('_repo_validation_matrix.json').entries || [];
const packaging = readJson('_baseline_packaging_contract.json');
const admissions = readJson('data/content/page_admission_registry.json').records || [];

const mix = plan.default_daily_mix || {};
const mixSum = Object.values(mix).reduce((sum, value) => sum + Number(value || 0), 0);
if (Number(plan.default_daily_batch_size) !== 75) errors.push('default_daily_batch_size must be 75');
if (mixSum !== 75) errors.push(`default_daily_mix must sum to 75; actual ${mixSum}`);
if (Number(plan.target_admitted_pages) !== 5000) errors.push('target_admitted_pages must be 5000');
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

for (const script of ['citation:5k:daily','citation:5k:plan','validate:citation-velocity-automation','workflow:citation-velocity-5k']) {
  if (!pkg.scripts?.[script]) errors.push(`package script missing: ${script}`);
}
if (!String(pkg.scripts?.['citation:5k:daily'] || '').includes('generate_citation_velocity_batch.mjs')) errors.push('citation:5k:daily must run the atom batch generator');
if (!String(pkg.scripts?.['validate:all'] || '').includes('validate:citation-velocity-automation')) errors.push('validate:all must include citation velocity automation validator');

const workflow = workflows.find(item => item.id === 'citation-velocity-5k');
if (!workflow) errors.push('citation-velocity-5k governed workflow contract missing');
else {
  if (workflow.workflow_file !== '.github/workflows/citation-velocity-5k.yml') errors.push('workflow file path drift');
  if (workflow.lane !== 'citation_velocity_batch') errors.push('workflow lane must be citation_velocity_batch');
  if (workflow.workflow_command !== 'npm run workflow:citation-velocity-5k') errors.push('workflow command drift');
  if (workflow.schedule_cron !== '12 13 * * *') errors.push('workflow schedule must be daily 13:12 UTC');
  if (workflow.remote_advance_strategy !== 'reset-regenerate-validate-recommit') errors.push('workflow must use reset-regenerate-validate-recommit');
  for (const file of workflow.required_outputs || []) if (!fs.existsSync(file)) errors.push(`workflow required output missing: ${file}`);
}

const workflowText = fs.existsSync('.github/workflows/citation-velocity-5k.yml') ? fs.readFileSync('.github/workflows/citation-velocity-5k.yml','utf8') : '';
for (const token of ['workflow_dispatch:', 'schedule:', '12 13 * * *', 'contents: write', 'npm run workflow:run -- --workflow citation-velocity-5k -- npm run programmatic:run-lane -- --lane citation_velocity_batch -- npm run workflow:citation-velocity-5k', './.github/scripts/commit_and_push_if_changed.sh "auto: citation velocity 5k batch" citation-velocity-5k']) {
  if (!workflowText.includes(token)) errors.push(`citation velocity workflow missing token: ${token}`);
}

for (const command of ['npm run citation:5k:daily','npm run citation:5k:plan','npm run validate:citation-velocity-automation','.github/workflows/citation-velocity-5k.yml']) {
  const reg = registry.find(item => item.command === command && item.status === 'ADMITTED');
  if (!reg) errors.push(`registry admission missing for ${command}`);
  const mx = reg ? matrix.find(item => item.validation_id === reg.validation_id && item.command === command && item.status === 'ADMITTED') : null;
  if (!mx) errors.push(`matrix admission missing for ${command}`);
}
for (const required of ['.github/workflows/citation-velocity-5k.yml','scripts/programmatic/generate_citation_velocity_batch.mjs','scripts/validation/validate_citation_velocity_automation.mjs','data/citation_velocity/velocity_5k_plan.json','data/citation_velocity/atom_axes.json','data/citation_velocity/generated_ledger.json','data/citation_velocity/daily_runs.json','data/citation_velocity/latest_batch.json','docs/strategy/BHPC_5K_AEO_GEO_PROGRAMMATIC_AUTOMATION_PLAN.md']) {
  if (!(packaging.required_files || []).includes(required)) errors.push(`${required}: missing from baseline critical-file parity`);
}

const currentCount = admissions.length;
const needed = Math.max(0, Number(plan.target_admitted_pages || 5000) - currentCount);
const daysAt75 = Math.ceil(needed / 75);
writeSummary('validate-citation-velocity-automation', {
  status: errors.length ? 'FAIL' : 'PASS',
  current_admitted_count: currentCount,
  target: Number(plan.target_admitted_pages || 5000),
  needed,
  days_at_75: daysAt75,
  theoretical_atom_count: totalTheoretical,
  theoretical_by_lane: theoretical,
  errors,
});
if (errors.length) fail(`[validate:citation-velocity-automation] FAIL: ${errors.length} issue(s)`, errors);
pass(`[validate:citation-velocity-automation] OK: ${currentCount} admitted, ${needed} to 5K, ${daysAt75} scheduled daily batches at 75/day, ${totalTheoretical} atoms available`);
