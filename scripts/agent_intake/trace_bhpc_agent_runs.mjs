#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, findAgentManifests, digestManifest, writeJson, readJson} from './bhpc_agent_common.mjs';

const errors = [];
const traces = [];
for (const entry of findAgentManifests()) {
  const manifest = entry.manifest;
  const digest = digestManifest(entry);
  const normalizedRel = manifest.normalized_path || `data/report_fixes/normalized_agent_runs/${entry.runDate}_bhpc.json`;
  const socialRel = manifest.social_run_path || `data/social/runs/${entry.runDate}-bhpc-agent.json`;
  const normalized = readJson(normalizedRel, null);
  const social = readJson(socialRel, null);
  if (manifest.status === 'ABSORBED') {
    if (!normalized) errors.push(`${entry.manifestRel}: ABSORBED but normalized file missing ${normalizedRel}`);
    if (!social) errors.push(`${entry.manifestRel}: ABSORBED but social run file missing ${socialRel}`);
    if (normalized && normalized.record_count !== digest.rows.length) errors.push(`${entry.manifestRel}: normalized record count drift`);
    if (social && !Array.isArray(social.records)) errors.push(`${entry.manifestRel}: social run records missing`);
  }
  traces.push({
    run_date: entry.runDate,
    status: manifest.status,
    csv_path: digest.csvRel,
    html_path: digest.htmlRel,
    csv_sha256: digest.csv_sha256,
    html_sha256: digest.html_sha256,
    parsed_record_count: digest.rows.length,
    normalized_path: normalizedRel,
    normalized_exists: Boolean(normalized),
    social_run_path: socialRel,
    social_run_exists: Boolean(social),
    sample_queries: digest.rows.slice(0, 5).map(row => row.query),
  });
}
const workflowContracts = readJson('data/workflows/workflow_contracts.json', {governed_workflows:[]});
const contentAuthority = (workflowContracts.governed_workflows || []).find(item => item.id === 'content-authority');
if (!contentAuthority) errors.push('content-authority workflow contract missing');
else {
  const inputs = contentAuthority.lineage_inputs || [];
  for (const required of ['data/report_fixes/agent_runs/**','data/report_fixes/normalized_agent_runs/**','data/social/runs/**']) {
    if (!inputs.includes(required)) errors.push(`content-authority lineage missing ${required}`);
  }
}
const ymlPath = '.github/workflows/content-authority-pipeline.yml';
const yml = fs.existsSync(path.join(ROOT, ymlPath)) ? fs.readFileSync(path.join(ROOT, ymlPath), 'utf8') : '';
if (!yml.includes('data/report_fixes/agent_runs/**/agent_run_manifest.json')) errors.push(`${ymlPath}: manifest-only artifact receipt trigger missing`);
if (yml.includes("- 'data/report_fixes/agent_runs/**'") || yml.includes('- "data/report_fixes/agent_runs/**"')) errors.push(`${ymlPath}: broad agent-run trigger is forbidden; trigger only on agent_run_manifest.json`);
if (!yml.includes('npm run workflow:run -- --workflow content-authority')) errors.push(`${ymlPath}: governed runner command missing`);
const report = {schema_version:'1.0', generated_at:new Date().toISOString(), status:errors.length?'FAIL':'PASS', artifact_run_count:traces.length, traces, workflow_bridge:{content_authority_inputs: contentAuthority?.lineage_inputs || [], content_authority_workflow_file:ymlPath}, errors};
writeJson('artifacts/validation/bhpc-agent-data-trace.json', report);
writeJson('reports/bhpc-agent-data-trace.json', report);
if (errors.length) {
  console.error(`[bhpc-agent-data-trace] FAIL: ${errors.length} issue(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[bhpc-agent-data-trace] PASS: ${traces.length} run(s) traced through content-authority`);
