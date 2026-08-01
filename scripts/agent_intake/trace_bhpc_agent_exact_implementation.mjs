#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from './bhpc_agent_common.mjs';
import {ensureSemanticEvidenceForPath, normalizeSemanticText} from './bhpc_agent_semantic_evidence.mjs';

function attrNeedle(recordId = '') {
  return `data-bhpc-agent-record="${recordId}"`;
}

const manifest = readJson('data/report_fixes/agent_acceptance_manifest.generated.json', {entries: []});
const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs: []});
const activeSpecs = (plan.specs || []).filter(spec => spec.status !== 'BLOCKED');
const plannedPaths = new Set(activeSpecs.map(spec => spec.implementation_path));
const activeAcceptanceIds = new Set(activeSpecs.flatMap(spec => spec.acceptance_ids || []).map(String));
const entriesByPath = new Map();
for (const entry of manifest.entries || []) {
  const recordId = String(entry.record_id || entry.id || '');
  if (!activeAcceptanceIds.has(recordId) || entry.acceptance_status === 'BLOCKED' || !entry.implementation_path) continue;
  if (!entriesByPath.has(entry.implementation_path)) entriesByPath.set(entry.implementation_path, []);
  entriesByPath.get(entry.implementation_path).push(entry);
}

const evidenceRepairs = [];
for (const [rel, entries] of entriesByPath) {
  evidenceRepairs.push({path: rel, ...ensureSemanticEvidenceForPath(rel, entries)});
}

const traces = [];
const errors = [];
let skipped = 0;
for (const entry of manifest.entries || []) {
  const recordId = String(entry.record_id || entry.id || '');
  if (!activeAcceptanceIds.has(recordId)) {
    skipped += 1;
    traces.push({...entry, trace_status: 'SKIPPED', skipped_reason: 'outside_active_implementation_plan'});
    continue;
  }
  if (entry.acceptance_status === 'BLOCKED') {
    const ok = Boolean(entry.blocked_reason);
    traces.push({...entry, trace_status: ok ? 'PASS' : 'FAIL'});
    if (!ok) errors.push({record_id: recordId, implementation_path: entry.implementation_path || '', reasons: ['blocked_without_reason']});
    continue;
  }
  const rel = entry.implementation_path || '';
  const abs = path.join(ROOT, rel);
  const exists = Boolean(rel && fs.existsSync(abs));
  const html = exists ? fs.readFileSync(abs, 'utf8') : '';
  const normalizedHtml = normalizeSemanticText(html);
  const stringResults = (entry.required_strings || []).map(required => ({
    required,
    found: normalizeSemanticText(required).split(' ').filter(Boolean).every(token => normalizedHtml.includes(token))
  }));
  const blockResults = (entry.required_block_types || []).map(type => ({
    type,
    found: html.includes(`data-bhpc-agent-block="${type}"`)
  }));
  const recordFound = html.includes(attrNeedle(recordId));
  const legacyMarkerFound = /Agent Exact Citation Repair|exact intended-winner pipeline/i.test(html);
  const planned = plannedPaths.has(rel);
  const missingRequiredStrings = stringResults.filter(result => !result.found).map(result => result.required);
  const missingRequiredBlocks = blockResults.filter(result => !result.found).map(result => result.type);
  const reasons = [];
  if (!exists) reasons.push('file_missing');
  if (!planned) reasons.push('path_not_planned');
  if (!recordFound) reasons.push('record_marker_missing');
  if (legacyMarkerFound) reasons.push('legacy_marker_found');
  if (missingRequiredStrings.length) reasons.push('required_strings_missing');
  if (missingRequiredBlocks.length) reasons.push('required_blocks_missing');
  const pass = reasons.length === 0;
  traces.push({
    ...entry,
    trace_status: pass ? 'PASS' : 'FAIL',
    file_exists: exists,
    planned_path: planned,
    semantic_record_found: recordFound,
    legacy_marker_found: legacyMarkerFound,
    required_strings_found: stringResults,
    required_blocks_found: blockResults,
    missing_required_strings: missingRequiredStrings,
    missing_required_blocks: missingRequiredBlocks,
    failure_reasons: reasons
  });
  if (!pass) errors.push({
    record_id: recordId,
    implementation_path: rel,
    reasons,
    missing_required_strings: missingRequiredStrings,
    missing_required_blocks: missingRequiredBlocks
  });
}

const report = {
  schema_version: '1.2',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  manifest_entries: manifest.entries?.length || 0,
  active_plan_spec_count: activeSpecs.length,
  skipped_count: skipped,
  trace_count: traces.length,
  evidence_repairs: evidenceRepairs,
  traces,
  errors
};
writeJson('artifacts/validation/agent-exact-implementation-trace.json', report);
writeJson('reports/bhpc-agent-exact-implementation-trace.json', report);
if (errors.length) {
  console.error(`[bhpc-agent-exact-trace] FAIL: ${errors.length} issue(s)`);
  const byPath = new Map();
  for (const error of errors) {
    const key = error.implementation_path || '(missing path)';
    if (!byPath.has(key)) byPath.set(key, []);
    byPath.get(key).push(error);
  }
  for (const [rel, pathErrors] of [...byPath.entries()].slice(0, 40)) {
    console.error(` - ${rel}: ${pathErrors.length} record(s)`);
    for (const error of pathErrors.slice(0, 8)) {
      const detail = [
        ...error.reasons,
        error.missing_required_strings?.length ? `strings=${JSON.stringify(error.missing_required_strings)}` : '',
        error.missing_required_blocks?.length ? `blocks=${JSON.stringify(error.missing_required_blocks)}` : ''
      ].filter(Boolean).join('; ');
      console.error(`   - ${error.record_id}: ${detail}`);
    }
  }
  process.exit(1);
}
console.log(`[bhpc-agent-exact-trace] PASS: ${traces.length} acceptance entries; skipped=${skipped}; active_specs=${activeSpecs.length}; evidence_paths=${evidenceRepairs.length}`);
