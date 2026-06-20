#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {workflowContract, matches, readJson, writeJson} from './lib.mjs';

const argv = process.argv.slice(2);
function value(flag) { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : null; }
const workflowId = value('--workflow');
const tracePath = value('--trace');
if (!workflowId || !tracePath || !fs.existsSync(tracePath)) {
  console.error('Usage: node scripts/workflow/hostile_review.mjs --workflow <id> --trace <trace.json>');
  process.exit(2);
}

const contract = workflowContract(workflowId);
const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
const errors = [];
const warnings = [];
const changed = trace.lineage?.changed_files || [];

if (trace.workflow_id !== workflowId) errors.push('trace workflow id does not match requested workflow');
if (trace.command_exit_code !== 0) errors.push(`workflow command exit code was ${trace.command_exit_code}`);
if (trace.validation?.status !== 'PASSED') errors.push('canonical workflow validation did not pass');
if (!Array.isArray(trace.lineage?.inputs_before) || trace.lineage.inputs_before.length === 0) errors.push('input lineage is empty');
if (!Array.isArray(trace.lineage?.outputs_after) || trace.lineage.outputs_after.length === 0) errors.push('output lineage is empty');

for (const required of contract.required_outputs || []) {
  if (!fs.existsSync(required)) errors.push(`required output missing: ${required}`);
}
for (const item of changed) {
  if (matches(item.file, contract.forbidden_change_patterns || [])) errors.push(`workflow changed forbidden source/governance file: ${item.file}`);
  if (!matches(item.file, contract.allowed_change_patterns || []) && !matches(item.file, contract.lineage_outputs || [])) {
    warnings.push(`changed file is outside declared output patterns: ${item.file}`);
  }
  if (/\.env(?:\.|$)|playwright-storage-state|\.pem$|\.key$/i.test(item.file)) errors.push(`possible secret-bearing output changed: ${item.file}`);
}

const candidateManifest = readJson('data/content/programmatic_candidate_manifest.json');
if ((candidateManifest.candidates || []).length !== 0) errors.push('programmatic candidate manifest was not cleared after admission');
const registry = readJson('data/content/page_admission_registry.json');
if ((registry.records || []).some(record => record.status !== 'ADMITTED')) errors.push('page admission registry contains a non-admitted public record');
const manual = readJson('data/content/manual_expansion_pages.json').pages || [];
for (const page of manual) {
  const record = (registry.records || []).find(item => item.path === page.path);
  if (!record || record.generation_lane !== 'manual' || record.admission_level !== 'full') {
    errors.push(`manual admission provenance drifted: ${page.path}`);
  }
}

const result = {
  schema_version: '1.0',
  workflow_id: workflowId,
  run_id: trace.run_id,
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  changed_file_count: changed.length,
  input_count: trace.lineage?.inputs_before?.length || 0,
  output_count: trace.lineage?.outputs_after?.length || 0,
  errors,
  warnings,
};
const reportPath = path.posix.join(path.posix.dirname(tracePath), 'hostile-review.json');
writeJson(reportPath, result);
if (errors.length) {
  console.error(`[workflow:hostile-review] FAIL ${workflowId}`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[workflow:hostile-review] PASS ${workflowId}; changed=${changed.length}; warnings=${warnings.length}`);
