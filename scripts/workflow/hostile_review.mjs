#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {workflowContract, matches, readJson, writeJson} from './lib.mjs';

const argv = process.argv.slice(2);
function value(flag) { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : null; }
const workflowId = value('--workflow');
const tracePath = value('--trace');

function reviewOne(id, traceFile) {
  const contract = workflowContract(id);
  const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
  const errors = [];
  const warnings = [];
  const info = [];
  const changed = trace.lineage?.changed_files || [];

  if (trace.workflow_id !== id) errors.push('trace workflow id does not match requested workflow');
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
      info.push(`observed generated output outside declared patterns: ${item.file}`);
    }
    if (/\.env(?:\.|$)|playwright-storage-state|\.pem$|\.key$/i.test(item.file)) errors.push(`possible secret-bearing output changed: ${item.file}`);
  }

  const candidateManifest = readJson('data/content/programmatic_candidate_manifest.json', {candidates: []});
  const candidateRows = candidateManifest.candidates || [];
  const pendingCandidates = candidateRows.filter(candidate => String(candidate.status || '').toUpperCase() !== 'ADMITTED');
  if (pendingCandidates.length) {
    errors.push(`programmatic candidate manifest contains ${pendingCandidates.length} non-admitted candidate(s)`);
  } else if (candidateRows.length) {
    info.push(`programmatic candidate manifest retains ${candidateRows.length} admitted release atom(s) for downstream validation`);
  }

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
    schema_version: '1.1',
    workflow_id: id,
    run_id: trace.run_id,
    generated_at: new Date().toISOString(),
    status: errors.length ? 'FAIL' : 'PASS',
    changed_file_count: changed.length,
    input_count: trace.lineage?.inputs_before?.length || 0,
    output_count: trace.lineage?.outputs_after?.length || 0,
    errors,
    warnings,
    info,
  };
  const reportPath = path.posix.join(path.posix.dirname(traceFile), 'hostile-review.json');
  writeJson(reportPath, result);
  return result;
}

function latestTraceFor(id) {
  const latest = path.join('reports', 'workflows', id, 'latest.json');
  if (!fs.existsSync(latest)) return null;
  const summary = JSON.parse(fs.readFileSync(latest, 'utf8'));
  if (summary.workflow_id && summary.workflow_id !== id) return null;
  const runId = summary.run_id;
  if (!runId) return null;
  const trace = path.join('reports', 'workflows', id, runId, 'trace.json');
  return fs.existsSync(trace) ? trace : null;
}

if (workflowId || tracePath) {
  if (!workflowId || !tracePath || !fs.existsSync(tracePath)) {
    console.error('Usage: node scripts/workflow/hostile_review.mjs --workflow <id> --trace <trace.json>');
    process.exit(2);
  }
  const result = reviewOne(workflowId, tracePath);
  if (result.errors.length) {
    console.error(`[workflow:hostile-review] FAIL ${workflowId}`);
    for (const error of result.errors) console.error(` - ${error}`);
    process.exit(1);
  }
  console.log(`[workflow:hostile-review] PASS ${workflowId}; changed=${result.changed_file_count}; warnings=${result.warnings.length}`);
  process.exit(0);
}

const contracts = readJson('data/workflows/workflow_contracts.json', {governed_workflows: []});
const results = [];
const errors = [];
for (const wf of contracts.governed_workflows || []) {
  const id = wf.id;
  const trace = latestTraceFor(id);
  if (!trace) {
    results.push({workflow_id: id, status: 'SKIP', errors: [], warnings: [], info: ['latest trace missing; no historical run available to hostile-review']});
    continue;
  }
  try {
    const result = reviewOne(id, trace);
    results.push(result);
    if (result.status !== 'PASS') errors.push(`${id}: ${result.errors.join('; ')}`);
  } catch (error) {
    const message = error?.message || String(error);
    errors.push(`${id}: ${message}`);
    results.push({workflow_id: id, status: 'FAIL', errors: [message], warnings: [], info: []});
  }
}
const aggregate = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  workflow_count: results.length,
  reviewed_count: results.filter(r => r.status === 'PASS' || r.status === 'FAIL').length,
  skipped_count: results.filter(r => r.status === 'SKIP').length,
  pass_count: results.filter(r => r.status === 'PASS').length,
  fail_count: results.filter(r => r.status === 'FAIL').length,
  warning_count: results.reduce((sum, r) => sum + (r.warnings?.length || 0), 0),
  info_count: results.reduce((sum, r) => sum + (r.info?.length || 0), 0),
  errors,
  results,
};
writeJson('artifacts/validation/workflow-hostile-review-all.json', aggregate);
writeJson('reports/workflow-hostile-review-all.json', aggregate);
if (errors.length) {
  console.error(`[workflow:hostile-review] FAIL ${aggregate.fail_count}/${aggregate.workflow_count}`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[workflow:hostile-review] PASS all governed workflows=${aggregate.workflow_count}; warnings=${aggregate.warning_count}`);
