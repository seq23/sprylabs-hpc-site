#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {findBhpcAcceptanceRouteConflicts} from '../lib/bhpc_acceptance_invariants.mjs';
import {normalizeBhpcInternalLinkHref, normalizeBhpcExternalCtaHref} from '../lib/bhpc_internal_links.mjs';
const ROOT = process.cwd();
function readJson(rel, fallback = null) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; } }
function writeJson(rel, payload) { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`); }
const manifest = readJson('data/report_fixes/agent_acceptance_manifest.generated.json', null);
const errors = [];
if (!manifest) errors.push('missing_generated_acceptance_manifest');
if (manifest && !Array.isArray(manifest.entries)) errors.push('manifest_entries_not_array');
const entries = manifest?.entries || [];
if (entries.length === 0) errors.push('manifest_has_no_entries');
for (const entry of entries) {
  for (const key of ['id','record_id','query','source_fix_instruction','page_family','route_status','acceptance_status']) {
    if (!String(entry[key] || '').trim()) errors.push(`${entry.id || entry.record_id || 'unknown'}:missing_${key}`);
  }
  if (entry.acceptance_status === 'REQUIRED' && !String(entry.implementation_path || '').trim()) errors.push(`${entry.id || entry.record_id}:missing_implementation_path`);
  if (entry.acceptance_status === 'REQUIRED') {
    if (!Array.isArray(entry.required_strings) || entry.required_strings.length < 1) errors.push(`${entry.id}:insufficient_required_strings`);
    if (!Array.isArray(entry.required_block_types) || entry.required_block_types.length < 2) errors.push(`${entry.id}:insufficient_required_block_types`);
  }
  for (const link of entry.required_internal_links || []) {
    if (!normalizeBhpcInternalLinkHref(link?.to_url || '')) errors.push(`${entry.id}:non_internal_required_link:${link?.to_url || 'missing'}`);
  }
  for (const link of entry.required_external_cta_links || []) {
    if (!normalizeBhpcExternalCtaHref(link?.to_url || '')) errors.push(`${entry.id}:unapproved_external_cta_link:${link?.to_url || 'missing'}`);
  }
  if (entry.acceptance_status === 'BLOCKED' && !String(entry.blocked_reason || '').trim()) errors.push(`${entry.id}:blocked_without_reason`);
  if (!['REQUIRED','BLOCKED','NO_ACTION'].includes(entry.acceptance_status)) errors.push(`${entry.id}:unsupported_acceptance_status:${entry.acceptance_status}`);
}
for (const conflict of findBhpcAcceptanceRouteConflicts(entries)) errors.push(`contradictory_required_blocked_route:${conflict.key}:${conflict.acceptance_ids.join(',')}`);
const runManifestErrors = [];
for (const run of manifest?.run_manifests || []) {
  const payload = readJson(run.path, null);
  if (!payload) runManifestErrors.push(`${run.path}:missing`);
  else if ((payload.entries || []).length !== run.entry_count) runManifestErrors.push(`${run.path}:entry_count_mismatch`);
}
errors.push(...runManifestErrors);
const report = {schema_version: '1.0', generated_at: new Date().toISOString(), status: errors.length ? 'FAIL' : 'PASS', entry_count: entries.length, required_count: entries.filter(e => e.acceptance_status === 'REQUIRED').length, blocked_count: entries.filter(e => e.acceptance_status === 'BLOCKED').length, run_manifest_count: manifest?.run_manifest_count || 0, errors};
writeJson('artifacts/validation/bhpc-agent-acceptance-manifest.json', report);
if (errors.length) { console.error(`[validate:bhpc-agent-acceptance] FAIL: ${errors.length} issue(s)`); for (const e of errors.slice(0, 80)) console.error(` - ${e}`); process.exit(1); }
console.log(`[validate:bhpc-agent-acceptance] PASS: entries=${report.entry_count}; required=${report.required_count}; blocked=${report.blocked_count}`);
