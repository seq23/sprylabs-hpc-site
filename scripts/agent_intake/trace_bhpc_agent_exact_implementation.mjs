#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from './bhpc_agent_common.mjs';
import {resolveBhpcInternalLinkAction, hasBhpcInternalLinkMutation} from '../lib/bhpc_link_mutations.mjs';

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
function textOnly(html = '') {
  return decodeHtml(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
}
function normalize(value = '') {
  return textOnly(String(value || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function attrNeedle(recordId = '') {
  return `data-bhpc-agent-record="${recordId}"`;
}

const manifest = readJson('data/report_fixes/agent_acceptance_manifest.generated.json', {entries: []});
const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs: []});
const activeSpecs = (plan.specs || []).filter(spec => spec.status !== 'BLOCKED');
const plannedPaths = new Set(activeSpecs.map(spec => spec.implementation_path));
const activeAcceptanceIds = new Set(activeSpecs.flatMap(spec => spec.acceptance_ids || []).map(String));
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
    if (!ok) errors.push(`${entry.record_id}:blocked_without_reason`);
    continue;
  }
  const rel = entry.implementation_path || '';
  const abs = path.join(ROOT, rel);
  const exists = Boolean(rel && fs.existsSync(abs));
  const html = exists ? fs.readFileSync(abs, 'utf8') : '';
  const normalizedHtml = normalize(html);
  const stringResults = (entry.required_strings || []).map(required => ({required, found: normalize(required).split(' ').filter(Boolean).every(token => normalizedHtml.includes(token))}));
  const linkResults = (entry.required_internal_links || []).map(action => {
    const mutation=resolveBhpcInternalLinkAction(action);
    if(mutation.status!=='RESOLVED')return {action,found:false,reason:mutation.reason};
    const source=path.join(ROOT,mutation.from_path);
    return {action,mutation,found:fs.existsSync(source)&&hasBhpcInternalLinkMutation(fs.readFileSync(source,'utf8'),mutation),reason:fs.existsSync(source)?'':'source_missing'};
  });
  const blockResults = (entry.required_block_types || []).map(type => ({type, found:type==='internal_link_set'?linkResults.every(result=>result.found):html.includes(`data-bhpc-agent-block="${type}"`)}));
  const recordFound = html.includes(attrNeedle(entry.record_id));
  const legacyMarkerFound = /Agent Exact Citation Repair|exact intended-winner pipeline/i.test(html);
  const planned = plannedPaths.has(rel);
  const pass = exists && recordFound && planned && !legacyMarkerFound && stringResults.every(result => result.found) && blockResults.every(result => result.found) && linkResults.every(result=>result.found);
  traces.push({...entry, trace_status: pass ? 'PASS' : 'FAIL', file_exists: exists, planned_path: planned, semantic_record_found: recordFound, legacy_marker_found: legacyMarkerFound, required_strings_found: stringResults, required_blocks_found: blockResults,required_internal_links_found:linkResults});
  if (!pass) {
    const reasons = [];
    if (!exists) reasons.push('file_missing');
    if (!planned) reasons.push('path_not_planned');
    if (!recordFound) reasons.push('record_marker_missing');
    if (legacyMarkerFound) reasons.push('legacy_marker_present');
    const missingStrings = stringResults.filter(result => !result.found).map(result => result.required);
    const missingBlocks = blockResults.filter(result => !result.found).map(result => result.type);
    const missingLinks = linkResults.filter(result=>!result.found).map(result=>result.mutation?.key||result.reason);
    if (missingStrings.length) reasons.push(`missing_strings=${JSON.stringify(missingStrings)}`);
    if (missingBlocks.length) reasons.push(`missing_blocks=${JSON.stringify(missingBlocks)}`);
    if (missingLinks.length) reasons.push(`missing_links=${JSON.stringify(missingLinks)}`);
    errors.push(`${entry.record_id}:semantic_acceptance_not_proven:${rel}:${reasons.join(';')}`);
  }
}
const report = {schema_version: '1.1', generated_at: new Date().toISOString(), status: errors.length ? 'FAIL' : 'PASS', manifest_entries: manifest.entries?.length || 0, active_plan_spec_count: activeSpecs.length, skipped_count: skipped, trace_count: traces.length, traces, errors};
writeJson('artifacts/validation/agent-exact-implementation-trace.json', report);
writeJson('reports/bhpc-agent-exact-implementation-trace.json', report);
if (errors.length) {
  console.error(`[bhpc-agent-exact-trace] FAIL: ${errors.length} issue(s)`);
  for (const e of errors.slice(0, 80)) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[bhpc-agent-exact-trace] PASS: ${traces.length} acceptance entries; skipped=${skipped}; active_specs=${activeSpecs.length}`);
