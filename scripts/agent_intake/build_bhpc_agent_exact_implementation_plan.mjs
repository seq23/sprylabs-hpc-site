#!/usr/bin/env node
import {readJson, writeJson, hashFile} from './bhpc_agent_common.mjs';
import {compileAndWriteBhpcAcceptanceManifest} from './compile_bhpc_agent_acceptance_manifest.mjs';

const manifest = compileAndWriteBhpcAcceptanceManifest();
const groups = new Map();
const blocked = [];
for (const entry of manifest.entries || []) {
  if (entry.acceptance_status === 'BLOCKED') {
    blocked.push(entry);
    continue;
  }
  if (!entry.implementation_path) {
    blocked.push({...entry, acceptance_status: 'BLOCKED', blocked_reason: 'missing_implementation_path'});
    continue;
  }
  const key = `${entry.operation}:${entry.implementation_path}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(entry);
}

function cleanFrameworkLabel(value) {
  const base = String(value || 'Agent Recommendation')
    .replace(/[.!?]+/g, '')
    .replace(/[\"'`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return base || 'Agent Recommendation';
}

function pageSpecFor(entries) {
  const primary = entries[0];
  const body = entries.map(entry => `<section data-bhpc-agent-record="${entry.record_id}" data-bhpc-agent-semantic="true"><h2>${entry.required_heading}</h2><p>${entry.source_fix_instruction}</p></section>`).join('\n');
  const framework = `BHPC Agent Acceptance Framework — ${cleanFrameworkLabel(primary.query)}`.slice(0, 140);
  return {
    h1: primary.query,
    framework,
    type: primary.page_family === 'comparison_page' ? 'comparison' : 'concept',
    definition: `${framework} converts the agent recommendation into visible semantic proof and route-specific implementation.`.slice(0, 520),
    body,
    agent_acceptance: {
      record_ids: entries.map(e => e.record_id),
      acceptance_ids: entries.map(e => e.id),
      page_family: primary.page_family,
      route_status: primary.route_status,
      generated_from: 'data/report_fixes/agent_acceptance_manifest.generated.json'
    }
  };
}

const priority_pages = {};
const new_pages = {};
const specs = [];
for (const [, entries] of groups) {
  const primary = entries[0];
  const pathValue = primary.implementation_path;
  const operation = primary.page_family === 'intended_winner_repair' || primary.operation === 'REPAIR_INTENDED_WINNER_PAGE'
    ? 'REPAIR_INTENDED_WINNER_PAGE'
    : 'CREATE_NEW_TARGET_PAGE';
  const spec = pageSpecFor(entries);
  if (operation === 'REPAIR_INTENDED_WINNER_PAGE') priority_pages[pathValue] = spec;
  else new_pages[pathValue] = spec;
  specs.push({
    record_id: primary.record_id,
    record_ids: entries.map(e => e.record_id),
    acceptance_ids: entries.map(e => e.id),
    query: primary.query,
    run_date: primary.run_date,
    operation,
    page_family: primary.page_family,
    route_status: primary.route_status,
    intended_winner_page: primary.intended_winner_page || '',
    intended_winner_path: primary.intended_winner_path || '',
    implementation_path: pathValue,
    before_hash: hashFile(pathValue),
    status: 'PLANNED',
    blocked_reason: '',
    required_block_types: [...new Set(entries.flatMap(e => e.required_block_types || []))],
    required_strings_count: entries.reduce((sum, e) => sum + (e.required_strings || []).length, 0)
  });
}
for (const entry of blocked) {
  specs.push({
    record_id: entry.record_id,
    acceptance_ids: [entry.id].filter(Boolean),
    query: entry.query,
    run_date: entry.run_date,
    operation: entry.operation,
    page_family: entry.page_family,
    route_status: entry.route_status,
    intended_winner_page: entry.intended_winner_page || '',
    intended_winner_path: entry.intended_winner_path || '',
    implementation_path: entry.implementation_path || '',
    before_hash: null,
    status: 'BLOCKED',
    blocked_reason: entry.blocked_reason || 'blocked_by_acceptance_compiler'
  });
}
writeJson('data/citation/agent_page_specs.generated.json', {schema_version: '1.0', generated_at: new Date().toISOString(), source: 'bhpc_agent_acceptance_manifest', new_pages});
writeJson('data/citation/agent_repair_specs.generated.json', {schema_version: '1.0', generated_at: new Date().toISOString(), source: 'bhpc_agent_acceptance_manifest', priority_pages});
const report = {
  schema_version: '1.0',
  status: 'PASS',
  generated_at: new Date().toISOString(),
  acceptance_manifest_path: 'data/report_fixes/agent_acceptance_manifest.generated.json',
  policy_path: 'data/report_fixes/agent_exact_implementation_policy.json',
  repair_count: Object.keys(priority_pages).length,
  new_page_count: Object.keys(new_pages).length,
  blocked_count: blocked.length,
  acceptance_entry_count: manifest.entry_count,
  required_acceptance_entry_count: manifest.required_count,
  specs
};
writeJson('artifacts/validation/agent-exact-implementation-plan.json', report);
writeJson('reports/bhpc-agent-exact-implementation-plan.json', report);
console.log(`[bhpc-agent-exact-plan] PASS: repairs=${report.repair_count}; new_pages=${report.new_page_count}; blocked=${report.blocked_count}; acceptance_entries=${report.acceptance_entry_count}`);
