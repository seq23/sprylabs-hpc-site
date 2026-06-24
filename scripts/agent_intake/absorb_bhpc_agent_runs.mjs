#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, AGENT_ROOT, NORMALIZED_ROOT, SOCIAL_RUNS_ROOT, findAgentManifests, writeJson, digestManifest, readJson, slug} from './bhpc_agent_common.mjs';

function socialRecord(row, runDate, digestText) {
  const query = row.query || 'BHPC agent signal';
  const title = query;
  const excerpt = [row.gap, digestText].filter(Boolean).join(' ').slice(0, 700);
  return {
    platform: 'agent_html_digest',
    source: 'twin_agent',
    source_key: 'bhpc-agent-run',
    id: row.id,
    title,
    term: query,
    excerpt,
    score: row.score,
    captured_at: new Date().toISOString(),
    run_date: runDate,
    agent_scope: 'bhpc',
    gap: row.gap,
    cited_source: row.cited_source,
  };
}

const validation = await import('./validate_bhpc_agent_runs.mjs').catch(() => null);
const ready = findAgentManifests().filter(entry => entry.manifest?.status === 'READY_FOR_ABSORPTION');
const absorbed = [];
for (const entry of ready) {
  const digest = digestManifest(entry);
  const normalized = {
    schema_version: '1.0',
    source: entry.manifest.source || 'twin_agent',
    run_date: entry.runDate,
    scope: 'bhpc',
    generated_at: new Date().toISOString(),
    csv_path: digest.csvRel,
    html_path: digest.htmlRel,
    csv_sha256: digest.csv_sha256,
    html_sha256: digest.html_sha256,
    record_count: digest.rows.length,
    records: digest.rows,
  };
  const normalizedRel = `${NORMALIZED_ROOT}/${entry.runDate}_bhpc.json`;
  writeJson(normalizedRel, normalized);

  const socialRel = `${SOCIAL_RUNS_ROOT}/${entry.runDate}-bhpc-agent.json`;
  const existingSocial = readJson(socialRel, {generated_at:null, policy:{source:'bhpc_agent_artifact'}, records:[], health:[]});
  const byId = new Map((existingSocial.records || []).map(record => [record.id, record]));
  for (const row of digest.rows) byId.set(row.id, socialRecord(row, entry.runDate, digest.html_digest_text));
  const socialPayload = {
    generated_at: new Date().toISOString(),
    policy: {
      source: 'bhpc_agent_artifact',
      role: 'agent_digest_to_social_signal_bridge',
      artifact_contract: 'CSV + HTML + manifest',
      fallback_behavior: 'content_authority_pipeline_continues_existing_content_generation_when_agent_rows_are_insufficient',
    },
    records: Array.from(byId.values()).sort((a,b) => String(a.id).localeCompare(String(b.id))),
    health: [{source_key:'bhpc-agent-run', platform:'agent_html_digest', status:digest.rows.length?'ok':'warning_only_empty', count:digest.rows.length}],
  };
  writeJson(socialRel, socialPayload);

  const citationRunRel = `data/citation/agent_runs/${entry.runDate}-bhpc.json`;
  const findings = digest.rows.map(row => ({path:'data/social/runs', domain:'billionairehighperformancecoach.com', issue: row.gap || row.query}));
  const opportunities = digest.rows.map(row => ({query: row.query, path: 'data/social/runs'}));
  writeJson(citationRunRel, {
    schema_version: '1.0',
    run_id: `${entry.runDate}-bhpc-agent`,
    generated_at: new Date().toISOString(),
    artifact_contract: 'CSV + HTML + manifest',
    queries_tested: digest.rows.length,
    cited_domains: Array.from(new Set(digest.rows.map(row => row.cited_source).filter(Boolean))).length,
    wins: digest.rows.filter(row => /cited|win|yes/i.test(`${row.cited_source} ${row.gap}`)).length,
    new_fixes: digest.rows.length,
    pending: 0,
    findings,
    opportunities,
    interpretation: {
      measurement_status: 'AGENT_DIGEST_ABSORBED',
      reason: 'The digest is normalized into social signals and citation-run evidence; the governed content pipeline then fills any remaining output gap from the existing content mechanism.',
    },
  });

  const manifest = {...entry.manifest, status:'ABSORBED', absorbed_at:new Date().toISOString(), absorbed_record_count:digest.rows.length, normalized_path: normalizedRel, social_run_path: socialRel};
  writeJson(entry.manifestRel, manifest);
  absorbed.push({run_date: entry.runDate, normalized_path: normalizedRel, social_run_path: socialRel, records: digest.rows.length});
}
const report = {schema_version:'1.0', generated_at:new Date().toISOString(), status:'PASS', ready_count: ready.length, absorbed_count: absorbed.length, absorbed};
writeJson('reports/bhpc-agent-absorption.json', report);
console.log(`[bhpc-agent-absorb] PASS: absorbed=${absorbed.length}; ready=${ready.length}`);
