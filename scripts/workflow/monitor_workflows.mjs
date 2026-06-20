#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {workflowContracts, writeJson} from './lib.mjs';

const staticCheck = spawnSync(process.execPath, ['scripts/validation/validate_workflow_monitor.mjs'], {stdio:'inherit', env:process.env});
if (staticCheck.status !== 0) process.exit(staticCheck.status ?? 1);

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const contracts = workflowContracts();
const report = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  repository: repository || null,
  mode: repository && token ? 'LIVE_GITHUB_ACTIONS' : 'STATIC_ONLY',
  workflows: [],
  status: 'PASS',
};

if (repository && token) {
  for (const contract of contracts) {
    const url = `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(contract.workflow_file.split('/').pop())}/runs?per_page=20`;
    const response = await fetch(url, {headers:{Accept:'application/vnd.github+json', Authorization:`Bearer ${token}`, 'X-GitHub-Api-Version':'2022-11-28'}});
    if (!response.ok) {
      report.workflows.push({workflow_id:contract.id,status:'API_ERROR',http_status:response.status});
      report.status = 'FAIL';
      continue;
    }
    const payload = await response.json();
    const latest = (payload.workflow_runs || []).find(run => run.status === 'completed');
    if (!latest) {
      report.workflows.push({workflow_id:contract.id,status:'NO_COMPLETED_RUN'});
      report.status = 'FAIL';
      continue;
    }
    const ageHours = (Date.now() - new Date(latest.updated_at).getTime()) / 3600000;
    const status = latest.conclusion === 'success' && ageHours <= contract.monitor_max_age_hours ? 'PASS' : (latest.conclusion !== 'success' ? 'LATEST_RUN_FAILED' : 'STALE');
    if (status !== 'PASS') report.status = 'FAIL';
    report.workflows.push({
      workflow_id: contract.id,
      status,
      conclusion: latest.conclusion,
      event: latest.event,
      run_number: latest.run_number,
      updated_at: latest.updated_at,
      age_hours: Number(ageHours.toFixed(2)),
      max_age_hours: contract.monitor_max_age_hours,
      html_url: latest.html_url,
    });
  }
} else {
  report.workflows = contracts.map(contract => ({workflow_id:contract.id,status:'STATIC_CONTRACT_PASS',live_run_check:'NOT_EXECUTED'}));
}

writeJson('reports/workflow-monitor.json', report);
if (report.status !== 'PASS') {
  console.error('[workflow:monitor] FAIL');
  for (const item of report.workflows.filter(entry => entry.status !== 'PASS' && entry.status !== 'STATIC_CONTRACT_PASS')) console.error(` - ${item.workflow_id}: ${item.status}`);
  process.exit(1);
}
console.log(`[workflow:monitor] PASS mode=${report.mode}`);
