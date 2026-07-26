#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, findAgentManifests, digestManifest, writeJson, readJson, runKey, sourceKey, safeScope} from './bhpc_agent_common.mjs';

const errors = [];
const traces = [];
for (const entry of findAgentManifests()) {
  const manifest = entry.manifest;
  const scope = safeScope(entry.scope || manifest.scope || manifest.bucket || manifest.vertical || 'bhpc');
  const digest = digestManifest({...entry, scope});
  const rawManifestExists = fs.existsSync(path.join(ROOT, entry.manifestRel));
  const rawDirExists = fs.existsSync(path.join(ROOT, entry.dirRel));
  const rawCsvExists = Boolean(digest.csvRel && fs.existsSync(path.join(ROOT, digest.csvRel)));
  const rawJsonExists = Boolean(digest.jsonRel && fs.existsSync(path.join(ROOT, digest.jsonRel)));
  const rawHtmlExists = Boolean(digest.htmlRel && fs.existsSync(path.join(ROOT, digest.htmlRel)));

  if (!rawDirExists) errors.push(`${entry.manifestRel}: raw artifact directory missing ${entry.dirRel}`);
  if (!rawManifestExists) errors.push(`${entry.manifestRel}: raw agent_run_manifest.json missing`);
  if (!rawHtmlExists) errors.push(`${entry.manifestRel}: raw HTML digest/report missing`);
  if (!rawCsvExists && !rawJsonExists) errors.push(`${entry.manifestRel}: raw source payload missing; expected CSV or JSON`);
  if (!['READY_FOR_ABSORPTION', 'ABSORBED', 'QUARANTINED'].includes(String(manifest.status || ''))) {
    errors.push(`${entry.manifestRel}: invalid manifest status ${manifest.status || 'missing'}`);
  }
  const normalizedRel = manifest.normalized_path || `data/report_fixes/normalized_agent_runs/${runKey(entry.runDate, scope)}.json`;
  const socialRel = manifest.social_run_path || `data/social/runs/${sourceKey(entry.runDate, scope)}.json`;
  const normalized = readJson(normalizedRel, null);
  const social = readJson(socialRel, null);
  if (manifest.status === 'ABSORBED') {
    if (!normalized) errors.push(`${entry.manifestRel}: ABSORBED but normalized file missing ${normalizedRel}`);
    if (!social) errors.push(`${entry.manifestRel}: ABSORBED but social run file missing ${socialRel}`);
    if (normalized && normalized.record_count !== digest.rows.length) errors.push(`${entry.manifestRel}: normalized record count drift`);
    if (normalized && digest.jsonRel && normalized.json_path !== digest.jsonRel) errors.push(`${entry.manifestRel}: normalized JSON path drift`);
    if (normalized && digest.page_specs.length && (normalized.page_specs || []).length !== digest.page_specs.length) errors.push(`${entry.manifestRel}: normalized pages_to_build count drift`);
    if (social && !Array.isArray(social.records)) errors.push(`${entry.manifestRel}: social run records missing`);
  }
  const scoreboardMatchesCsv = digest.json_scoreboard_total == null || !digest.csv_row_count || digest.json_scoreboard_total === digest.csv_row_count;
  if (digest.jsonRel && digest.json_scoreboard_total != null && !scoreboardMatchesCsv) errors.push(`${entry.manifestRel}: JSON scoreboard total ${digest.json_scoreboard_total} does not match CSV row count ${digest.csv_row_count}`);
  traces.push({
    run_date: entry.runDate,
    scope,
    status: manifest.status,
    raw_artifact_dir: entry.dirRel,
    raw_artifact_dir_exists: rawDirExists,
    raw_manifest_exists: rawManifestExists,
    raw_csv_exists: rawCsvExists,
    raw_json_exists: rawJsonExists,
    raw_html_exists: rawHtmlExists,
    csv_path: digest.csvRel || null,
    json_path: digest.jsonRel || null,
    html_path: digest.htmlRel || null,
    csv_sha256: digest.csv_sha256,
    json_sha256: digest.json_sha256,
    html_sha256: digest.html_sha256,
    csv_row_count: digest.csv_row_count,
    json_fix_rows: digest.json_fix_row_count,
    json_scoreboard_total: digest.json_scoreboard_total,
    json_scoreboard_matches_csv: scoreboardMatchesCsv,
    json_pages_to_build: digest.json_pages_to_build_count,
    parsed_record_count: digest.rows.length,
    normalized_path: normalizedRel,
    normalized_exists: Boolean(normalized),
    normalized_page_specs: normalized?.page_specs?.length || 0,
    social_run_path: socialRel,
    social_run_exists: Boolean(social),
    sample_queries: digest.rows.slice(0, 5).map(row => row.query),
    sample_pages_to_build: digest.page_specs.slice(0, 5).map(row => row.query),
  });
}
const workflowContracts = readJson('data/workflows/workflow_contracts.json', {governed_workflows:[]});
const contentAuthority = (workflowContracts.governed_workflows || []).find(item => item.id === 'spry-content-release');
if (!contentAuthority) errors.push('spry-content-release workflow contract missing');
else {
  const inputs = contentAuthority.lineage_inputs || [];
  for (const required of ['data/report_fixes/agent_runs/**','data/report_fixes/normalized_agent_runs/**','data/social/runs/**']) {
    if (!inputs.includes(required)) errors.push(`spry-content-release lineage missing ${required}`);
  }
}
const ymlPath = '.github/workflows/spry-content-release.yml';
const yml = fs.existsSync(path.join(ROOT, ymlPath)) ? fs.readFileSync(path.join(ROOT, ymlPath), 'utf8') : '';
if (!yml.includes('data/report_fixes/agent_runs/**/agent_run_manifest.json')) errors.push(`${ymlPath}: manifest-only artifact receipt trigger missing`);
if (yml.includes("- 'data/report_fixes/agent_runs/**'") || yml.includes('- "data/report_fixes/agent_runs/**"')) errors.push(`${ymlPath}: broad agent-run trigger is forbidden; trigger only on agent_run_manifest.json`);
if (!yml.includes('npm run workflow:run -- --workflow spry-content-release')) errors.push(`${ymlPath}: governed runner command missing`);
if (!yml.includes('agent-intake')) errors.push(`${ymlPath}: agent-intake mode missing`);
const report = {schema_version:'1.3', generated_at:new Date().toISOString(), status:errors.length?'FAIL':'PASS', artifact_run_count:traces.length, traces, workflow_bridge:{content_authority_inputs: contentAuthority?.lineage_inputs || [], content_authority_workflow_file:ymlPath}, errors};
writeJson('artifacts/validation/bhpc-agent-data-trace.json', report);
writeJson('reports/bhpc-agent-data-trace.json', report);
if (errors.length) {
  console.error(`[agent-data-trace] FAIL: ${errors.length} issue(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[agent-data-trace] PASS: ${traces.length} run(s) traced through spry-content-release`);
