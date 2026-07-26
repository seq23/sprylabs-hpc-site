#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, NORMALIZED_ROOT, SOCIAL_RUNS_ROOT, findAgentManifests, writeJson, digestManifest, readJson, manifestAllowedByExactPolicy, loadExactPolicy, runKey, sourceKey, safeScope} from './bhpc_agent_common.mjs';

function socialRecord(row, runDate, digestText, scope) {
  const query = row.query || `${scope} agent signal`;
  const title = query;
  const excerpt = [row.gap, row.fix_recommendation, digestText].filter(Boolean).join(' ').slice(0, 700);
  return {
    platform: 'agent_artifact_digest',
    source: 'twin_agent',
    source_key: sourceKey(runDate, scope),
    id: row.id,
    title,
    term: query,
    excerpt,
    score: row.score,
    captured_at: new Date().toISOString(),
    run_date: runDate,
    agent_scope: scope,
    gap: row.gap,
    cited_source: row.cited_source,
    operation: row.operation,
    intended_winner_page: row.intended_winner_page,
    intended_winner_path: row.intended_winner_path,
    implementation_path: row.implementation_path,
    patch_needed: row.patch_needed,
    blocked_reason: row.blocked_reason,
  };
}

await import('./validate_bhpc_agent_runs.mjs').catch(() => null);
const policy = loadExactPolicy();
const allReady = findAgentManifests().filter(entry => {
  const status = entry.manifest?.status;
  if (status === 'READY_FOR_ABSORPTION') return true;
  if (status !== 'ABSORBED') return false;
  const scope = safeScope(entry.scope || entry.manifest?.scope || 'bhpc');
  const key = runKey(entry.runDate, scope);
  const normalizedRel = entry.manifest?.normalized_path || `${NORMALIZED_ROOT}/${key}.json`;
  return !fs.existsSync(path.join(ROOT, normalizedRel));
});
function isIncompleteAbsorbedRun(entry) {
  if (entry.manifest?.status !== 'ABSORBED') return false;
  if (policy.retroactive_processing === false && entry.runDate && policy.effective_from && entry.runDate < policy.effective_from) return false;
  const scope = safeScope(entry.scope || entry.manifest?.scope || 'bhpc');
  const key = runKey(entry.runDate, scope);
  const normalizedRel = entry.manifest?.normalized_path || `${NORMALIZED_ROOT}/${key}.json`;
  const socialRel = entry.manifest?.social_run_path || `${SOCIAL_RUNS_ROOT}/${sourceKey(entry.runDate, scope)}.json`;
  return !fs.existsSync(path.join(ROOT, normalizedRel)) || !fs.existsSync(path.join(ROOT, socialRel));
}
const ready = allReady.filter(entry => manifestAllowedByExactPolicy(entry, policy) || isIncompleteAbsorbedRun(entry));
const skipped = allReady.filter(entry => !manifestAllowedByExactPolicy(entry, policy) && !isIncompleteAbsorbedRun(entry)).map(entry => ({manifest:entry.manifestRel, run_date:entry.runDate, scope: entry.scope, reason:'before_exact_implementation_cutover'}));
const absorbed = [];
for (const entry of ready) {
  const scope = safeScope(entry.scope || entry.manifest?.scope || entry.manifest?.bucket || entry.manifest?.vertical || 'bhpc');
  const digest = digestManifest({...entry, scope});
  const key = runKey(entry.runDate, scope);
  const socialKey = sourceKey(entry.runDate, scope);
  const normalized = {
    schema_version: '1.2',
    source: entry.manifest.source || 'twin_agent',
    run_date: entry.runDate,
    scope,
    generated_at: new Date().toISOString(),
    exact_implementation_policy: 'data/report_fixes/agent_exact_implementation_policy.json',
    artifact_shape: digest.artifact_shape,
    csv_path: digest.csvRel || null,
    html_path: digest.htmlRel || null,
    json_path: digest.jsonRel || null,
    csv_sha256: digest.csv_sha256,
    html_sha256: digest.html_sha256,
    json_sha256: digest.json_sha256,
    json_scoreboard: digest.json_scoreboard,
    record_count: digest.rows.length,
    page_spec_count: digest.page_specs.length,
    records: digest.rows,
    page_specs: digest.page_specs,
  };
  const normalizedRel = `${NORMALIZED_ROOT}/${key}.json`;
  writeJson(normalizedRel, normalized);

  const socialRel = `${SOCIAL_RUNS_ROOT}/${socialKey}.json`;
  const existingSocial = readJson(socialRel, {generated_at:null, policy:{source:'agent_artifact'}, records:[], health:[]});
  const byId = new Map((existingSocial.records || []).map(record => [record.id, record]));
  for (const row of digest.rows) byId.set(row.id, socialRecord(row, entry.runDate, digest.html_digest_text, scope));
  const socialPayload = {
    generated_at: new Date().toISOString(),
    policy: {
      source: 'agent_artifact',
      role: 'agent_digest_to_social_signal_bridge_with_exact_implementation_metadata',
      artifact_contract: 'CSV + optional JSON + HTML + manifest',
      fallback_behavior: 'content_authority_pipeline_may_continue_existing_content_generation_but_may_not_count_social_fallback_as_exact_page_repair',
    },
    records: Array.from(byId.values()).sort((a,b) => String(a.id).localeCompare(String(b.id))),
    health: [{source_key:socialKey, platform:'agent_artifact_digest', status:digest.rows.length?'ok':'warning_only_empty', count:digest.rows.length}],
  };
  writeJson(socialRel, socialPayload);

  const citationRunRel = `data/citation/agent_runs/${socialKey}.json`;
  const findings = digest.rows.map(row => ({
    path: row.intended_winner_path || row.implementation_path || 'data/social/runs',
    domain: row.intended_winner_page ? (() => { try { return new URL(row.intended_winner_page).hostname; } catch { return 'billionairehighperformancecoach.com'; } })() : 'billionairehighperformancecoach.com',
    issue: row.gap || row.query,
    operation: row.operation,
    implementation_required: row.patch_needed,
    blocked_reason: row.blocked_reason || ''
  }));
  const opportunities = [
    ...digest.rows.map(row => ({query: row.query, path: row.intended_winner_path || row.implementation_path || 'data/social/runs', operation: row.operation})),
    ...digest.page_specs.map(spec => ({query: spec.query, path: spec.implementation_path, operation: 'CREATE_NEW_TARGET_PAGE', source: 'json_pages_to_build'}))
  ];
  writeJson(citationRunRel, {
    schema_version: '1.2',
    run_id: socialKey,
    generated_at: new Date().toISOString(),
    scope,
    artifact_contract: 'CSV + optional JSON + HTML + manifest',
    exact_implementation_policy: 'data/report_fixes/agent_exact_implementation_policy.json',
    queries_tested: digest.rows.length,
    json_scoreboard_total: digest.json_scoreboard_total,
    json_pages_to_build: digest.page_specs.length,
    cited_domains: Array.from(new Set(digest.rows.map(row => row.cited_source).filter(Boolean))).length,
    wins: digest.rows.filter(row => /cited|win|yes/i.test(`${row.cited_source} ${row.gap} ${row.primary_fix_type}`)).length,
    new_fixes: digest.rows.length,
    pending: 0,
    findings,
    opportunities,
    interpretation: {
      measurement_status: 'AGENT_DIGEST_ABSORBED_WITH_EXACT_IMPLEMENTATION_METADATA',
      reason: 'The digest preserves intended destination, operation, implementation path, and JSON pages-to-build specs when present. Exact application is planned and traced by the agent exact implementation lane.',
    },
  });

  const manifest = {...entry.manifest, scope, status:'ABSORBED', absorbed_at:new Date().toISOString(), absorbed_record_count:digest.rows.length, normalized_path: normalizedRel, social_run_path: socialRel, exact_implementation_policy:'data/report_fixes/agent_exact_implementation_policy.json'};
  if (digest.jsonRel) manifest.json_path = digest.jsonRel;
  writeJson(entry.manifestRel, manifest);
  absorbed.push({run_date: entry.runDate, scope, normalized_path: normalizedRel, social_run_path: socialRel, records: digest.rows.length, page_specs: digest.page_specs.length});
}
const report = {schema_version:'1.2', generated_at:new Date().toISOString(), status:'PASS', ready_count: ready.length, skipped_by_policy: skipped, absorbed_count: absorbed.length, absorbed};
writeJson('reports/bhpc-agent-absorption.json', report);
console.log(`[agent-absorb] PASS: absorbed=${absorbed.length}; ready=${ready.length}; skipped_by_policy=${skipped.length}`);
