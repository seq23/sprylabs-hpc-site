#!/usr/bin/env node
import {digestManifest, readJson, writeJson} from './bhpc_agent_common.mjs';

const manifestRel = 'fixtures/agent_artifacts/cross_vertical_shape/agent_run_manifest.json';
const manifest = readJson(manifestRel, null);
const errors = [];
if (!manifest) errors.push('missing_fixture_manifest');
const entry = {
  runDate: manifest?.run_date || '2026-06-29',
  scope: manifest?.scope || 'sample-vertical',
  scopeDirName: manifest?.scope || 'sample-vertical',
  dirRel: 'fixtures/agent_artifacts/cross_vertical_shape',
  manifestRel,
  manifest,
};
const digest = digestManifest(entry);
if (digest.scope !== 'sample-vertical') errors.push(`scope_not_preserved:${digest.scope}`);
if (digest.csv_row_count !== 3) errors.push(`csv_row_count:${digest.csv_row_count}`);
if (digest.json_scoreboard_total !== 3) errors.push(`json_scoreboard_total:${digest.json_scoreboard_total}`);
if (digest.rows.length !== 6) errors.push(`normalized_record_count:${digest.rows.length}`);
const canonicalTargets = new Set(digest.rows.map(row => `${row.query}||${row.implementation_path}`));
if (canonicalTargets.size !== 3) errors.push(`canonical_target_count:${canonicalTargets.size}`);
if (digest.json_fix_row_count !== 3) errors.push(`json_fix_row_count:${digest.json_fix_row_count}`);
if (digest.page_specs.length !== 2) errors.push(`page_specs:${digest.page_specs.length}`);
if (!digest.artifact_shape.json || !digest.artifact_shape.csv || !digest.artifact_shape.html) errors.push('artifact_shape_flags_incomplete');
const report = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  fixture_manifest: manifestRel,
  scope: digest.scope,
  csv_row_count: digest.csv_row_count,
  json_scoreboard_total: digest.json_scoreboard_total,
  json_fix_row_count: digest.json_fix_row_count,
  normalized_record_count: digest.rows.length,
  canonical_target_count: canonicalTargets.size,
  json_pages_to_build: digest.page_specs.length,
  sample_pages_to_build: digest.page_specs.map(spec => spec.query),
  errors,
};
writeJson('artifacts/validation/cross-vertical-agent-artifact-shape.json', report);
writeJson('reports/cross-vertical-agent-artifact-shape.json', report);
if (errors.length) {
  console.error(`[agent-artifact-shape-self-test] FAIL: ${errors.length} issue(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[agent-artifact-shape-self-test] PASS: csv=${report.csv_row_count}; json_total=${report.json_scoreboard_total}; normalized=${report.normalized_record_count}; canonical_targets=${report.canonical_target_count}; pages_to_build=${report.json_pages_to_build}`);
