#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, findAgentManifests, writeJson} from '../agent_intake/bhpc_agent_common.mjs';
const errors = [];
const warnings = [];
const checked = [];
const allowed = new Set(['bhpc','aplayer','a-player','a-player-mode']);
for (const entry of findAgentManifests()) {
  const manifest = entry.manifest || {};
  const context = entry.manifestRel;
  if (!allowed.has(entry.scope)) errors.push(`${context}: non_bhpc_scope_not_allowed:${entry.scope}`);
  for (const key of ['csv_path','html_path']) {
    const rel = manifest[key];
    if (!rel) errors.push(`${context}: missing_${key}`);
    else if (!fs.existsSync(path.join(ROOT, rel))) errors.push(`${context}: missing_artifact:${rel}`);
  }
  if (!manifest.json_path) warnings.push(`${context}: legacy_bhpc_run_without_json_artifact`);
  else if (!fs.existsSync(path.join(ROOT, manifest.json_path))) errors.push(`${context}: missing_json_artifact:${manifest.json_path}`);
  if (String(manifest.status || '').toUpperCase() === 'ABSORBED' && manifest.normalized_path && !fs.existsSync(path.join(ROOT, manifest.normalized_path))) errors.push(`${context}: normalized_output_missing:${manifest.normalized_path}`);
  checked.push({run_date: entry.runDate, scope: entry.scope, manifest: context, status: manifest.status, normalized_path: manifest.normalized_path || null});
}
const report = {schema_version: '1.0', validator: 'bhpc-agent-artifact-continuity', status: errors.length ? 'FAIL' : 'PASS', checked_count: checked.length, checked, errors, warnings};
writeJson('artifacts/validation/bhpc-agent-artifact-continuity.json', report);
writeJson('reports/bhpc-agent-artifact-continuity.json', report);
if (errors.length) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`[bhpc-agent-artifact-continuity] PASS: ${checked.length} run(s), warnings=${warnings.length}`);
