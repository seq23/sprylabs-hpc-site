#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJson, fail, pass, writeSummary} from './common.mjs';
import {ensureRuntime,managedPython} from './python_runtime.mjs';

ensureRuntime();
const errors = [];
const traces = [];
const contracts = readJson('data/workflows/workflow_contracts.json').governed_workflows || [];
const root = process.cwd();
const fixtureRoot = path.join(root, 'artifacts/validation/workflow-topology-fixtures');
fs.rmSync(fixtureRoot, {recursive: true, force: true});
fs.mkdirSync(fixtureRoot, {recursive: true});
for (const contract of contracts) {
  const runId = `fixture-${contract.id}`.replace(/[^a-zA-Z0-9_.-]/g, '-');
  const result = spawnSync('node', [
    'scripts/workflow/run_topology_lane.mjs',
    '--lane', contract.canonical_lane || '',
    '--mode', contract.canonical_mode || '',
    '--contract-id', contract.id,
    '--trace-only'
  ], {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
    env: {...process.env, WORKFLOW_TRACE_RUN_ID: runId, WORKFLOW_TOPOLOGY_TRACE_ONLY: '1'}
  });
  if (result.status !== 0) {
    errors.push(`${contract.id}: trace-only runner failed (${result.status}) ${result.stderr || result.stdout}`.trim());
    continue;
  }
  const tracePath = path.join(fixtureRoot, contract.canonical_lane || '', runId, 'trace.json');
  if (!fs.existsSync(tracePath)) {
    errors.push(`${contract.id}: missing fixture trace ${path.relative(root, tracePath)}`);
    continue;
  }
  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
  if (trace.status !== 'TRACE_ONLY_PASS') errors.push(`${contract.id}: expected TRACE_ONLY_PASS, got ${trace.status}`);
  if (trace.contract_id !== contract.id) errors.push(`${contract.id}: trace contract_id mismatch`);
  if (trace.lane !== contract.canonical_lane) errors.push(`${contract.id}: trace lane mismatch`);
  if (trace.mode !== contract.canonical_mode) errors.push(`${contract.id}: trace mode mismatch`);
  if (!Array.isArray(trace.stages) || trace.stages.length < 1) errors.push(`${contract.id}: trace has no stages`);
  for (const stage of trace.stages || []) {
    if (stage.execution !== 'skipped_trace_only') errors.push(`${contract.id}/${stage.label}: fixture unexpectedly executed a component`);
    if (!stage.fake_data?.expected_command) errors.push(`${contract.id}/${stage.label}: missing fake_data expected_command`);
  }
  traces.push({
    workflow_id: contract.id,
    topology_status: contract.topology_status,
    lane: trace.lane,
    mode: trace.mode,
    stage_count: trace.stages?.length || 0,
    trace_path: path.relative(root, tracePath)
  });
}
const report = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  workflow_count: contracts.length,
  traced_workflow_count: traces.length,
  traces,
  errors
};
fs.writeFileSync('artifacts/validation/workflow-topology-fixture-trace.json', `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync('reports/workflow-topology-fixture-trace.json', `${JSON.stringify(report, null, 2)}\n`);
writeSummary('validate-workflow-topology-fixtures', report);
if (errors.length) fail(`[validate:workflow-topology-fixtures] FAIL: ${errors.length} issue(s)`, errors);
const allYaml = spawnSync(managedPython(), ['scripts/validation/faux_trace_all_workflows.py'], {cwd: root, stdio: 'pipe', encoding: 'utf8'});
if (allYaml.status !== 0) {
  fail('[validate:workflow-topology-fixtures] all-YAML faux trace failed', [allYaml.stderr || allYaml.stdout]);
}
let allYamlSummary = {};
try { allYamlSummary = JSON.parse(allYaml.stdout); } catch {}
pass(`[validate:workflow-topology-fixtures] OK: traced ${traces.length} governed topology workflow(s) plus ${allYamlSummary.workflow_count || 0} GitHub YAML workflow(s) across ${allYamlSummary.scenario_count || 0} faux scenarios`);
