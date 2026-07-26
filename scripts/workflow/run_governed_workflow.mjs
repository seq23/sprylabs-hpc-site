#!/usr/bin/env node
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {
  ROOT,
  workflowContract,
  snapshot,
  selectedSnapshot,
  changedFiles,
  writeJson,
  nowRunId,
} from './lib.mjs';

const argv = process.argv.slice(2);
const separator = argv.indexOf('--');
const control = separator >= 0 ? argv.slice(0, separator) : argv;
const command = separator >= 0 ? argv.slice(separator + 1) : [];
const workflowIndex = control.indexOf('--workflow');
const workflowId = workflowIndex >= 0 ? control[workflowIndex + 1] : null;
if (!workflowId || !command.length) {
  console.error('Usage: node scripts/workflow/run_governed_workflow.mjs --workflow <id> -- <command> [args...]');
  process.exit(2);
}

const contract = workflowContract(workflowId);
const runId = process.env.WORKFLOW_TRACE_RUN_ID || nowRunId();
const traceDir = `reports/workflows/${workflowId}/${runId}`;
const tracePath = `${traceDir}/trace.json`;
const startedAt = new Date().toISOString();
const before = snapshot();

const baseTrace = {
  schema_version: '1.0',
  workflow_id: workflowId,
  workflow_name: contract.name,
  run_id: runId,
  trigger: process.env.GITHUB_EVENT_NAME || 'local-manual',
  repository: process.env.GITHUB_REPOSITORY || null,
  ref: process.env.GITHUB_REF || null,
  sha: process.env.GITHUB_SHA || null,
  actor: process.env.GITHUB_ACTOR || null,
  started_at: startedAt,
  command: command.join(' '),
  contract_file: 'data/workflows/workflow_contracts.json',
  workflow_file: contract.workflow_file,
  lane: contract.lane,
  lineage: {
    input_patterns: contract.lineage_inputs,
    output_patterns: contract.lineage_outputs,
    inputs_before: selectedSnapshot(before, contract.lineage_inputs),
    outputs_before: selectedSnapshot(before, contract.lineage_outputs),
  },
  validation: {
    canonical_validation: 'npm run validate:all (enforced by programmatic:run-lane)',
    status: 'PENDING',
  },
  hostile_review: {status: 'PENDING'},
  monitor_validation: {status: 'PENDING'},
  status: 'RUNNING',
};
writeJson(tracePath, baseTrace);

console.log(`[workflow:${workflowId}] run_id=${runId}`);
console.log(`[workflow:${workflowId}] command=${command.join(' ')}`);
const execution = spawnSync(command[0], command.slice(1), {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    WORKFLOW_GOVERNANCE_ID: workflowId,
    WORKFLOW_TRACE_RUN_ID: runId,
    PROOF_RUN_ID: `workflow-${workflowId}-${runId}`,
  },
});

const after = snapshot();
const trace = {
  ...baseTrace,
  completed_at: new Date().toISOString(),
  command_exit_code: execution.status ?? 1,
  signal: execution.signal || null,
  lineage: {
    ...baseTrace.lineage,
    outputs_after: selectedSnapshot(after, contract.lineage_outputs),
    changed_files: changedFiles(before, after),
  },
  validation: {
    ...baseTrace.validation,
    status: execution.status === 0 ? 'PASSED' : 'FAILED',
  },
  status: execution.status === 0 ? 'COMMAND_PASSED' : 'COMMAND_FAILED',
};
writeJson(tracePath, trace);
writeJson(`reports/workflows/${workflowId}/latest.json`, trace);

if (execution.status !== 0) {
  console.error(`[workflow:${workflowId}] command failed; trace=${tracePath}`);
  process.exit(execution.status ?? 1);
}

function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {cwd: ROOT, stdio: 'inherit', env: process.env});
  return result.status ?? 1;
}

const hostileStatus = runNode('scripts/workflow/hostile_review.mjs', ['--workflow', workflowId, '--trace', tracePath]);
const monitorStatus = hostileStatus === 0
  ? runNode('scripts/validation/validate_workflow_monitor.mjs', ['--workflow', workflowId, '--trace', tracePath])
  : 1;

const hostileReport = `${traceDir}/hostile-review.json`;
const finalTrace = {
  ...trace,
  hostile_review: {
    status: hostileStatus === 0 ? 'PASSED' : 'FAILED',
    report: hostileReport,
  },
  monitor_validation: {
    status: monitorStatus === 0 ? 'PASSED' : 'FAILED',
  },
  status: hostileStatus === 0 && monitorStatus === 0 ? 'PASS' : 'FAIL',
  finalized_at: new Date().toISOString(),
};
writeJson(tracePath, finalTrace);
writeJson(`reports/workflows/${workflowId}/latest.json`, finalTrace);

if (finalTrace.status !== 'PASS') {
  console.error(`[workflow:${workflowId}] governed review failed; trace=${tracePath}`);
  process.exit(1);
}
console.log(`[workflow:${workflowId}] PASS trace=${tracePath}`);
