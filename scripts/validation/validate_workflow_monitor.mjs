#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {workflowContracts, workflowContract} from '../workflow/lib.mjs';
import {fail, pass, writeSummary} from './common.mjs';

const argv = process.argv.slice(2);
function value(flag) { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : null; }
const onlyId = value('--workflow');
const tracePath = value('--trace');
const contracts = onlyId ? [workflowContract(onlyId)] : workflowContracts();
const errors = [];
const results = [];

for (const contract of contracts) {
  if (!fs.existsSync(contract.workflow_file)) {
    errors.push(`${contract.id}: workflow file missing`);
    continue;
  }
  const text = fs.readFileSync(contract.workflow_file, 'utf8');
  const expectedRunner = `npm run workflow:run -- --workflow ${contract.id} -- npm run programmatic:run-lane -- --lane ${contract.lane} -- ${contract.workflow_argv.join(' ')}`;
  if (!text.includes('workflow_dispatch:')) errors.push(`${contract.id}: workflow_dispatch trigger missing`);
  if (!text.includes('schedule:')) errors.push(`${contract.id}: schedule trigger missing`);
  if (!text.includes(`cron: '${contract.schedule_cron}'`) && !text.includes(`cron: "${contract.schedule_cron}"`)) errors.push(`${contract.id}: schedule drift from contract`);
  if (!text.includes(expectedRunner)) errors.push(`${contract.id}: governed runner command drift`);
  if (!text.includes(`reports/workflows/${contract.id}/`)) errors.push(`${contract.id}: trace artifact path missing`);
  if (!text.includes('actions/upload-artifact@v4')) errors.push(`${contract.id}: workflow trace artifact upload missing`);
  const helperIndex = text.indexOf('.github/scripts/commit_and_push_if_changed.sh');
  const uploadIndex = text.indexOf('actions/upload-artifact@v4');
  if (helperIndex < 0) errors.push(`${contract.id}: race-safe commit helper missing`);
  if (helperIndex >= 0 && uploadIndex >= 0 && uploadIndex < helperIndex) errors.push(`${contract.id}: trace upload must follow the retry-capable commit step`);
  if (!text.includes(`"${contract.commit_message}" ${contract.id}`)) errors.push(`${contract.id}: commit helper identity drift`);
  if (contract.remote_advance_strategy !== 'reset-regenerate-validate-recommit') errors.push(`${contract.id}: remote advance strategy drift`);
  if (!Number.isFinite(contract.monitor_max_age_hours) || contract.monitor_max_age_hours < 1) errors.push(`${contract.id}: invalid monitor age budget`);
  results.push({workflow_id:contract.id, workflow_file:contract.workflow_file, schedule_cron:contract.schedule_cron, manual_dispatch:true, monitor_max_age_hours:contract.monitor_max_age_hours});
}

if (tracePath) {
  if (!fs.existsSync(tracePath)) errors.push(`trace missing: ${tracePath}`);
  else {
    const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
    const contract = contracts[0];
    if (trace.workflow_id !== contract.id) errors.push('trace workflow id mismatch');
    if (trace.command_exit_code !== 0) errors.push('trace command did not exit successfully');
    if (!['COMMAND_PASSED','PASS'].includes(trace.status)) errors.push(`trace status not monitorable: ${trace.status}`);
    const hostilePath = path.join(path.dirname(tracePath), 'hostile-review.json');
    if (!fs.existsSync(hostilePath)) errors.push('hostile review report missing');
    else {
      const hostile = JSON.parse(fs.readFileSync(hostilePath, 'utf8'));
      if (hostile.status !== 'PASS') errors.push('hostile review report failed');
    }
    if (!trace.lineage?.inputs_before?.length) errors.push('trace has no input lineage');
    if (!trace.lineage?.outputs_after?.length) errors.push('trace has no output lineage');
  }
}

writeSummary('validate-workflow-monitor', {status:errors.length?'FAIL':'PASS', workflow_count:contracts.length, trace:tracePath||null, workflows:results, errors});
if (errors.length) fail(`[validate:workflow-monitor] FAIL: ${errors.length} issue(s)`, errors);
pass(`[validate:workflow-monitor] OK: ${contracts.length} workflow monitor contract(s) valid${tracePath?' with runtime trace':''}`);
