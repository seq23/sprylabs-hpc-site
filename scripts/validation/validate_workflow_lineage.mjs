#!/usr/bin/env node
import fs from 'node:fs';
import {workflowContracts, listFiles, matches, writeJson} from '../workflow/lib.mjs';
import {fail, pass, writeSummary} from './common.mjs';
import {resolveRuntimePath} from '../lib/runtime_path.mjs';

const errors = [];
const files = listFiles();
const contracts = workflowContracts();
// workflowContracts() is `payload.governed_workflows || []` in the shared
// scripts/workflow/lib.mjs, so a renamed, emptied or restructured key yields no
// contracts, the loop below asserts nothing, and the run prints "OK: 0 governed
// workflows". The helper is shared with monitor_workflows.mjs and
// validate_workflow_monitor.mjs, so the floor lives here.
if (!contracts.length) fail('[validate:workflow-lineage] FAIL: data/workflows/workflow_contracts.json declares no governed_workflows; expected at least one governed workflow contract. A lineage check over zero contracts proves nothing.');
// Every lineage input/output assertion matches contract globs against this file
// list. With no files, matchedInputs/matchedOutputs would be empty for reasons
// that have nothing to do with the contracts.
if (!files.length) fail('[validate:workflow-lineage] FAIL: listFiles() returned 0 repository files, so no contract could match its lineage inputs or outputs; expected a non-empty repository tree.');
const seen = new Set();
const report = [];
for (const contract of contracts) {
  if (seen.has(contract.id)) errors.push(`duplicate workflow contract id: ${contract.id}`);
  seen.add(contract.id);
  for (const field of ['id','name','workflow_file','lane','workflow_command','commit_message','schedule_cron','remote_advance_strategy']) {
    if (!String(contract[field] || '').trim()) errors.push(`${contract.id || 'unknown'}: missing ${field}`);
  }
  if (!contract.manual_dispatch) errors.push(`${contract.id}: manual dispatch must be enabled`);
  if (!Array.isArray(contract.workflow_argv) || contract.workflow_argv.join(' ') !== contract.workflow_command) errors.push(`${contract.id}: workflow_argv must exactly encode workflow_command`);
  if (contract.remote_advance_strategy !== 'reset-regenerate-validate-recommit') errors.push(`${contract.id}: generated-state retry strategy is not admitted`);
  if (!Array.isArray(contract.lineage_inputs) || contract.lineage_inputs.length < 3) errors.push(`${contract.id}: at least three lineage inputs required`);
  if (!Array.isArray(contract.lineage_outputs) || contract.lineage_outputs.length < 3) errors.push(`${contract.id}: at least three lineage outputs required`);
  if (!Array.isArray(contract.required_outputs) || contract.required_outputs.length === 0) errors.push(`${contract.id}: required outputs missing`);
  if (!fs.existsSync(contract.workflow_file)) errors.push(`${contract.id}: workflow file missing ${contract.workflow_file}`);
  const matchedInputs = files.filter(file => matches(file, contract.lineage_inputs || []));
  const matchedOutputs = files.filter(file => matches(file, contract.lineage_outputs || []));
  if (matchedInputs.length === 0) errors.push(`${contract.id}: no current files match lineage inputs`);
  if (matchedOutputs.length === 0) errors.push(`${contract.id}: no current files match lineage outputs`);
  for (const output of contract.required_outputs || []) {
    if (!fs.existsSync(resolveRuntimePath(output))) errors.push(`${contract.id}: required output missing ${output}`);
  }
  report.push({
    workflow_id: contract.id,
    workflow_file: contract.workflow_file,
    workflow_command: contract.workflow_command,
    input_pattern_count: contract.lineage_inputs?.length || 0,
    output_pattern_count: contract.lineage_outputs?.length || 0,
    matched_input_count: matchedInputs.length,
    matched_output_count: matchedOutputs.length,
    sample_inputs: matchedInputs.slice(0, 12),
    sample_outputs: matchedOutputs.slice(0, 12),
  });
}
writeJson('reports/workflow-lineage.json', {schema_version:'1.0', generated_at:new Date().toISOString(), status:errors.length?'FAIL':'PASS', workflows:report, errors});
writeSummary('validate-workflow-lineage', {status:errors.length?'FAIL':'PASS', workflow_count:contracts.length, workflows:report, errors});
if (errors.length) fail(`[validate:workflow-lineage] FAIL: ${errors.length} issue(s)`, errors);
pass(`[validate:workflow-lineage] OK: ${contracts.length} governed workflows have executable input/output lineage`);
