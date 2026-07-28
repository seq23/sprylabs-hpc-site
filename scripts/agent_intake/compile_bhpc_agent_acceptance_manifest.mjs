#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, NORMALIZED_ROOT, readJson, writeJson, loadExactPolicy, safeScope} from './bhpc_agent_common.mjs';
import {buildBhpcAcceptanceEntry} from '../lib/bhpc_agent_acceptance_parser.mjs';

const CURRENT_MANIFEST = 'data/report_fixes/agent_acceptance_manifest.generated.json';
const MANIFEST_DIR = 'data/report_fixes/agent_acceptance_manifests';

function normalizeKey(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function activeOwnerMap() {
  const registry = readJson('data/citation/query_registry.json', {queries: []});
  return new Map((registry.queries || [])
    .filter(q => q.release_status === 'ACTIVE' && q.query && q.primary_page)
    .map(q => [normalizeKey(q.query), q]));
}

function collectRows(policy = loadExactPolicy()) {
  const dir = path.join(ROOT, NORMALIZED_ROOT);
  const rows = [];
  if (!fs.existsSync(dir)) return rows;
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue;
    const rel = `${NORMALIZED_ROOT}/${file}`;
    const payload = readJson(rel, {records: [], page_specs: []});
    if (policy.retroactive_processing === false && payload.run_date && policy.effective_from && payload.run_date < policy.effective_from) continue;
    const runDate = payload.run_date || file.replace(/_.+$/, '');
    const scope = safeScope(payload.scope || 'bhpc');
    const pageSpecs = payload.page_specs || [];
    const canonicalPagePathByQuery = new Map(pageSpecs
      .filter(spec => spec?.query && spec?.implementation_path)
      .map(spec => [normalizeKey(spec.query), spec.implementation_path]));
    for (const row of payload.records || []) {
      const canonicalPath = canonicalPagePathByQuery.get(normalizeKey(row.query || '')) || '';
      const shouldUseCanonicalOpportunityPath = Boolean(canonicalPath && !row.intended_winner_page && !row.intended_winner_path);
      rows.push({
        ...row,
        ...(shouldUseCanonicalOpportunityPath ? {
          implementation_path: canonicalPath,
          operation: 'CREATE_NEW_TARGET_PAGE',
          primary_fix_type: row.primary_fix_type || 'new_page_opportunity',
        } : {}),
        scope: safeScope(row.scope || scope),
        run_date: runDate,
        normalized_path: rel
      });
    }
    for (const spec of pageSpecs) rows.push({
      id: spec.id || `${runDate}-${safeScope(spec.scope || scope)}-${rows.length + 1}`,
      scope: safeScope(spec.scope || scope),
      run_date: runDate,
      query: spec.query || spec.title || 'BHPC page spec',
      gap: spec.why_worth_building || spec.recommendation || '',
      fix_recommendation: spec.why_worth_building || spec.recommendation || '',
      intended_winner_page: '',
      intended_winner_path: '',
      implementation_path: spec.implementation_path || '',
      operation: spec.operation || 'CREATE_NEW_TARGET_PAGE',
      blocked_reason: spec.blocked_reason || '',
      patch_needed: !String(spec.operation || '').startsWith('BLOCKED_'),
      primary_fix_type: 'pages_to_build',
      action_tier: 'page_spec',
      raw: spec.raw || spec,
      normalized_path: rel
    });
  }
  return rows;
}

export function compileAndWriteBhpcAcceptanceManifest() {
  const policy = loadExactPolicy();
  const owners = activeOwnerMap();
  const rows = collectRows(policy);
  const entries = rows.map(row => buildBhpcAcceptanceEntry(row, {owner: owners.get(normalizeKey(row.query)), policy, run_date: row.run_date, scope: row.scope}));
  const byRun = new Map();
  for (const entry of entries) {
    const key = `${entry.run_date || 'unknown'}_${safeScope(entry.scope || 'bhpc').replace(/-/g, '_')}`;
    if (!byRun.has(key)) byRun.set(key, []);
    byRun.get(key).push(entry);
  }
  fs.mkdirSync(path.join(ROOT, MANIFEST_DIR), {recursive: true});
  const generatedAt = new Date().toISOString();
  const run_manifests = [];
  for (const [key, runEntries] of [...byRun.entries()].sort()) {
    const rel = `${MANIFEST_DIR}/${key}.json`;
    const payload = {
      schema_version: '1.0',
      generated_at: generatedAt,
      source: 'compile_bhpc_agent_acceptance_manifest',
      run_key: key,
      entry_count: runEntries.length,
      required_count: runEntries.filter(e => e.acceptance_status === 'REQUIRED').length,
      blocked_count: runEntries.filter(e => e.acceptance_status === 'BLOCKED').length,
      entries: runEntries
    };
    writeJson(rel, payload);
    run_manifests.push({run_key: key, path: rel, entry_count: runEntries.length});
  }
  const current = {
    schema_version: '1.0',
    generated_at: generatedAt,
    source: 'compile_bhpc_agent_acceptance_manifest',
    policy_path: 'data/report_fixes/agent_exact_implementation_policy.json',
    normalized_root: NORMALIZED_ROOT,
    run_manifest_count: run_manifests.length,
    entry_count: entries.length,
    required_count: entries.filter(e => e.acceptance_status === 'REQUIRED').length,
    blocked_count: entries.filter(e => e.acceptance_status === 'BLOCKED').length,
    run_manifests,
    entries
  };
  writeJson(CURRENT_MANIFEST, current);
  const report = {
    schema_version: '1.0',
    generated_at: generatedAt,
    status: 'PASS',
    current_manifest: CURRENT_MANIFEST,
    run_manifest_count: run_manifests.length,
    entry_count: current.entry_count,
    required_count: current.required_count,
    blocked_count: current.blocked_count,
    row_requirements: entries.reduce((sum, entry) => sum + (entry.required_strings || []).length + (entry.required_block_types || []).length, 0),
    errors: []
  };
  writeJson('artifacts/validation/html-fix-acceptance-compiler.json', report);
  writeJson('reports/bhpc-agent-acceptance-compiler.json', report);
  return current;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = compileAndWriteBhpcAcceptanceManifest();
  console.log(`[bhpc-agent-acceptance-compiler] PASS: entries=${manifest.entry_count}; required=${manifest.required_count}; blocked=${manifest.blocked_count}; run_manifests=${manifest.run_manifest_count}`);
}
