#!/usr/bin/env node
import fs from 'node:fs';
import {workflowContracts, listFiles, matches, writeJson} from '../workflow/lib.mjs';
import {fail, pass, writeSummary} from './common.mjs';

const errors = [];
const files = listFiles();
const contracts = workflowContracts();
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
    let resolved = output;
    if (process.env.BHPC_LAYOUT_STAGE_ACTIVE === '1') {
      if (output.startsWith('site/public/') && process.env.BHPC_PUBLIC_ROOT) {
        resolved = `${process.env.BHPC_PUBLIC_ROOT.replace(/\/$/, '')}/${output.slice('site/public/'.length)}`;
      } else if (output.startsWith('dist/') && process.env.BHPC_DEPLOY_ROOT) {
        resolved = `${process.env.BHPC_DEPLOY_ROOT.replace(/\/$/, '')}/${output.slice('dist/'.length)}`;
      }
    }
    if (!fs.existsSync(resolved)) errors.push(`${contract.id}: required output missing ${output}`);
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
