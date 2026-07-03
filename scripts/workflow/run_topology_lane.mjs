#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {ROOT, readJson, writeJson, nowRunId} from './lib.mjs';

function parseArgs(argv) {
  const out = {lane: '', mode: '', traceOnly: false, contractId: ''};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--lane') out.lane = argv[++i] || '';
    else if (item.startsWith('--lane=')) out.lane = item.split('=').slice(1).join('=');
    else if (item === '--mode') out.mode = argv[++i] || '';
    else if (item.startsWith('--mode=')) out.mode = item.split('=').slice(1).join('=');
    else if (item === '--contract-id') out.contractId = argv[++i] || '';
    else if (item.startsWith('--contract-id=')) out.contractId = item.split('=').slice(1).join('=');
    else if (item === '--trace-only' || item === '--dry-run' || item === '--fixture') out.traceOnly = true;
  }
  if (process.env.WORKFLOW_TOPOLOGY_TRACE_ONLY === '1') out.traceOnly = true;
  return out;
}

function asStageTuple(stage) {
  if (!stage || typeof stage.label !== 'string' || !Array.isArray(stage.command) || stage.command.length < 1) {
    throw new Error('Invalid workflow stage entry; expected {label, command:[...]}');
  }
  return [stage.label, stage.command[0], stage.command.slice(1)];
}

const args = parseArgs(process.argv.slice(2));
const topology = readJson('data/workflows/workflow_topology.json');
const laneDef = topology.canonical_lanes?.[args.lane];
if (!laneDef) {
  console.error(`[workflow-topology] unknown lane: ${args.lane || '(missing)'}`);
  process.exit(2);
}
const mode = args.mode || laneDef.default_mode;
if (!Array.isArray(laneDef.modes) || !laneDef.modes.includes(mode)) {
  console.error(`[workflow-topology] lane ${args.lane} does not support mode ${mode}`);
  process.exit(2);
}
const stages = (laneDef.stages_by_mode?.[mode] || []).map(asStageTuple);
if (!stages.length) {
  console.error(`[workflow-topology] no stages configured for ${args.lane}/${mode}`);
  process.exit(2);
}
const runId = process.env.WORKFLOW_TRACE_RUN_ID || nowRunId();
const traceRoot = args.traceOnly ? 'artifacts/validation/workflow-topology-fixtures' : 'reports/workflows';
const traceDir = `${traceRoot}/${args.lane}/${runId}`;
const tracePath = `${traceDir}/trace.json`;
const trace = {
  schema_version: '1.1',
  topology_schema_version: topology.schema_version,
  lane: args.lane,
  mode,
  contract_id: args.contractId || null,
  run_id: runId,
  trace_only: args.traceOnly,
  fixture_input: args.traceOnly ? {
    type: 'workflow-topology-fixture',
    contract_id: args.contractId || null,
    lane: args.lane,
    mode,
    component_count: stages.length
  } : null,
  started_at: new Date().toISOString(),
  status: 'RUNNING',
  stages: []
};
writeJson(tracePath, trace);
for (const [label, command, commandArgs] of stages) {
  const commandText = [command, ...commandArgs].join(' ');
  console.log(`[workflow-topology:${args.lane}/${mode}] ${args.traceOnly ? 'TRACE_ONLY ' : ''}${label}`);
  const started = new Date().toISOString();
  if (args.traceOnly) {
    trace.stages.push({
      label,
      command: commandText,
      started_at: started,
      completed_at: new Date().toISOString(),
      exit_code: 0,
      signal: null,
      execution: 'skipped_trace_only',
      fake_data: {
        input_digest: `${args.lane}:${mode}:${label}`,
        expected_command: commandText
      }
    });
    trace.status = 'RUNNING';
    writeJson(tracePath, trace);
    continue;
  }
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      WORKFLOW_TOPOLOGY_LANE: args.lane,
      WORKFLOW_TOPOLOGY_MODE: mode,
      WORKFLOW_TRACE_RUN_ID: runId
    }
  });
  const stage = {
    label,
    command: commandText,
    started_at: started,
    completed_at: new Date().toISOString(),
    exit_code: result.status ?? 1,
    signal: result.signal || null,
    execution: 'executed'
  };
  trace.stages.push(stage);
  trace.status = stage.exit_code === 0 ? 'RUNNING' : 'FAIL';
  writeJson(tracePath, trace);
  if (stage.exit_code !== 0) {
    writeJson(`${traceRoot}/${args.lane}/latest.json`, trace);
    console.error(`[workflow-topology:${args.lane}/${mode}] failed at ${label}`);
    process.exit(stage.exit_code);
  }
}
trace.completed_at = new Date().toISOString();
trace.status = args.traceOnly ? 'TRACE_ONLY_PASS' : 'PASS';
writeJson(tracePath, trace);
writeJson(`${traceRoot}/${args.lane}/latest.json`, trace);
console.log(`[workflow-topology:${args.lane}/${mode}] ${trace.status} trace=${tracePath}`);
