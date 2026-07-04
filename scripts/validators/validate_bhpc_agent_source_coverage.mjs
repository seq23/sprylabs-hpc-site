#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, NORMALIZED_ROOT, findAgentManifests, digestManifest, readJson, writeJson, safeScope, runKey} from '../agent_intake/bhpc_agent_common.mjs';

function recordKey(item = {}) {
  return String(item.source_signature || `${item.query || ''}::${item.implementation_path || item.intended_winner_path || ''}::${item.fix_recommendation || item.why_worth_building || ''}`)
    .toLowerCase()
    .trim();
}

function shouldCheck(entry) {
  const status = String(entry.manifest?.status || '');
  if (!['READY_FOR_ABSORPTION', 'ABSORBED'].includes(status)) return false;
  const since = process.env.BHPC_AGENT_SOURCE_COVERAGE_FROM || '2026-07-04';
  return !entry.runDate || entry.runDate >= since;
}

const errors = [];
const warnings = [];
const runs = [];

for (const entry of findAgentManifests().filter(shouldCheck)) {
  const scope = safeScope(entry.scope || entry.manifest?.scope || 'bhpc');
  const key = runKey(entry.runDate, scope);
  const normalizedRel = entry.manifest?.normalized_path || `${NORMALIZED_ROOT}/${key}.json`;
  const normalized = readJson(normalizedRel, null);
  const digest = digestManifest({...entry, scope});

  const expectedRows = (digest.rows || []).map(row => ({
    kind: 'record',
    key: recordKey(row),
    id: row.id,
    query: row.query,
    operation: row.operation,
    implementation_path: row.implementation_path || row.intended_winner_path || '',
    source_section: row.source_section || '',
  }));
  const expectedPages = (digest.page_specs || []).map(spec => ({
    kind: 'new_page_opportunity',
    key: recordKey(spec),
    id: spec.id,
    query: spec.query,
    operation: 'CREATE_NEW_TARGET_PAGE',
    implementation_path: spec.implementation_path || '',
    source_section: spec.source_section || spec.source || '',
  }));
  const expected = [...expectedRows, ...expectedPages];

  const normalizedRecords = normalized ? [
    ...((normalized.records || []).map(row => ({kind:'record', key: recordKey(row), id: row.id, query: row.query, implementation_path: row.implementation_path || row.intended_winner_path || ''}))),
    ...((normalized.page_specs || []).map(spec => ({kind:'new_page_opportunity', key: recordKey(spec), id: spec.id, query: spec.query, implementation_path: spec.implementation_path || ''}))),
  ] : [];
  const normalizedKeys = new Set(normalizedRecords.map(record => record.key));

  const acceptance = readJson(`data/report_fixes/agent_acceptance_manifests/${key}.json`, {entries: []});
  const acceptanceRecordIds = new Set((acceptance.entries || []).map(entry => String(entry.record_id || entry.id || '').toLowerCase()).filter(Boolean));
  const acceptanceByRecordId = new Map((acceptance.entries || []).map(entry => [String(entry.record_id || entry.id || '').toLowerCase(), entry]));

  const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs: []});
  const apply = readJson('artifacts/validation/agent-exact-implementation-apply.json', {applied: [], skipped: []});
  const planRecordIds = new Set((plan.specs || []).flatMap(spec => spec.record_ids || [spec.record_id]).map(id => String(id || '').toLowerCase()).filter(Boolean));
  const planPaths = new Set((plan.specs || []).map(spec => String(spec.implementation_path || '').toLowerCase()).filter(Boolean));
  const appliedRecordIds = new Set((apply.applied || []).flatMap(item => item.acceptance_ids || [item.record_id]).map(id => String(id || '').toLowerCase()).filter(Boolean));
  const skippedIds = new Set((apply.skipped || []).map(item => String(item.record_id || '').toLowerCase()).filter(Boolean));

  const missingFromNormalized = expected.filter(item => !normalizedKeys.has(item.key));
  const unaddressed = expected.filter(item => {
    const id = String(item.id || '').toLowerCase();
    const accepted = id && acceptanceRecordIds.has(id);
    const planned = id && planRecordIds.has(id);
    const applied = id && appliedRecordIds.has(id);
    const skipped = id && skippedIds.has(id);
    return !(accepted || planned || applied || skipped);
  });

  if (!normalized) errors.push(`${entry.runDate}/${scope}: missing normalized payload ${normalizedRel}`);
  for (const item of missingFromNormalized.slice(0, 40)) {
    errors.push(`${entry.runDate}/${scope}: source item missing from normalized output: ${item.kind}:${item.query}`);
  }
  if (missingFromNormalized.length > 40) errors.push(`${entry.runDate}/${scope}: ${missingFromNormalized.length - 40} additional normalized coverage misses omitted`);
  for (const item of unaddressed.slice(0, 40)) {
    errors.push(`${entry.runDate}/${scope}: source item not accepted/planned/applied/skipped: ${item.kind}:${item.query}`);
  }
  if (unaddressed.length > 40) errors.push(`${entry.runDate}/${scope}: ${unaddressed.length - 40} additional addressability misses omitted`);

  const canonicalPageTargets = new Set(expectedPages.map(item => item.implementation_path).filter(Boolean));
  const builtPageTargets = [...canonicalPageTargets].filter(rel => fs.existsSync(path.join(ROOT, rel)));
  const missingBuiltPageTargets = [...canonicalPageTargets].filter(rel => !fs.existsSync(path.join(ROOT, rel)));
  const queuedPageTargets = [...canonicalPageTargets].filter(rel => planPaths.has(rel.toLowerCase()));
  for (const rel of missingBuiltPageTargets) {
    errors.push(`${entry.runDate}/${scope}: canonical new page not built: ${rel}`);
  }

  const contentProofMissing = expected.filter(item => {
    const id = String(item.id || '').toLowerCase();
    if (!id || skippedIds.has(id)) return false;
    const accepted = acceptanceByRecordId.get(id);
    const proofPath = accepted?.implementation_path || item.implementation_path || '';
    if (!proofPath) return false;
    const abs = path.join(ROOT, proofPath);
    if (!fs.existsSync(abs)) return true;
    const html = fs.readFileSync(abs, 'utf8');
    return !html.includes(`data-bhpc-agent-record="${item.id}"`);
  });
  for (const item of contentProofMissing.slice(0, 40)) {
    errors.push(`${entry.runDate}/${scope}: source item lacks page-level proof marker: ${item.kind}:${item.id}:${item.implementation_path}`);
  }
  if (contentProofMissing.length > 40) errors.push(`${entry.runDate}/${scope}: ${contentProofMissing.length - 40} additional content proof misses omitted`);

  const duplicateCanonicalGroups = [...canonicalPageTargets].map(rel => ({
    implementation_path: rel,
    source_record_count: expectedPages.filter(item => item.implementation_path === rel).length,
  })).filter(group => group.source_record_count > 1);
  runs.push({
    run_date: entry.runDate,
    scope,
    manifest: entry.manifestRel,
    normalized_path: normalizedRel,
    source_record_count: expectedRows.length,
    new_page_source_record_count: expectedPages.length,
    canonical_new_page_count: canonicalPageTargets.size,
    normalized_record_count: normalizedRecords.length,
    missing_from_normalized_count: missingFromNormalized.length,
    unaddressed_count: unaddressed.length,
    content_proof_missing_count: contentProofMissing.length,
    built_new_page_count: builtPageTargets.length,
    queued_new_page_count: queuedPageTargets.length,
    missing_built_new_page_count: missingBuiltPageTargets.length,
    built_new_pages: builtPageTargets,
    queued_new_pages: queuedPageTargets,
    duplicate_canonical_new_page_groups: duplicateCanonicalGroups,
  });
}

const report = {
  schema_version: '1.0',
  validator: 'bhpc-agent-source-coverage',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  policy: {
    checked_statuses: ['READY_FOR_ABSORPTION', 'ABSORBED'],
    coverage_from: process.env.BHPC_AGENT_SOURCE_COVERAGE_FROM || '2026-07-04',
    rule: 'Every actionable source item from agent artifacts must be normalized, represented by its own source id, applied to page-level proof or explicitly skipped/blocked with a reason; every canonical new-page target must be built.'
  },
  run_count: runs.length,
  runs,
  warnings,
  errors,
};
writeJson('artifacts/validation/bhpc-agent-source-coverage.json', report);
writeJson('reports/bhpc-agent-source-coverage.json', report);
if (errors.length) {
  console.error(`[bhpc-agent-source-coverage] FAIL: ${errors.length} issue(s)`);
  for (const error of errors.slice(0, 80)) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[bhpc-agent-source-coverage] PASS: runs=${runs.length}`);
