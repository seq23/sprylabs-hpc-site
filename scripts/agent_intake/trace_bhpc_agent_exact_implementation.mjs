#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from './bhpc_agent_common.mjs';
import {saysPhrase} from '../lib/bhpc_agent_acceptance_satisfaction.mjs';

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
// Work from the newest run is this cycle's responsibility and blocks. Work
// carried forward from earlier runs is a backlog to drain: it is reported in
// full, with the same detail, but it does not fail the build. Before the
// carry-forward existed these entries were dropped as
// outside_active_implementation_plan and never seen again - 843 of 913. Making
// them blocking now would turn a decade of accumulated backlog into a red
// build; making them invisible again is how it accumulated.
const newestRunDate = (manifest.entries || [])
  .map(e => String(e.run_date || '')).filter(Boolean).sort().at(-1) || '';
const isBacklog = (entry) => String(entry.run_date || '') !== newestRunDate;

const traces = [];
const errors = [];
const backlog = [];
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
    traces.push({...entry, trace_status: ok ? 'PASS' : (isBacklog(entry) ? 'BACKLOG' : 'FAIL')});
    if (!ok) errors.push(`${entry.record_id}:blocked_without_reason`);
    continue;
  }
  const rel = entry.implementation_path || '';
  const abs = path.join(ROOT, rel);
  const exists = Boolean(rel && fs.existsSync(abs));
  const html = exists ? fs.readFileSync(abs, 'utf8') : '';
  const normalizedHtml = normalize(html);
  // Token-wise containment used to live here: every WORD of the requirement had
  // to appear somewhere on the page, in any order. Any page on the topic passes
  // that, so the trace reported 119 entries PASS that the plan was still
  // carrying as outstanding - and nothing linked the two verdicts. Both lanes
  // now ask scripts/lib/bhpc_agent_acceptance_satisfaction.mjs the same
  // question, in normalized-phrase form: strictly stronger than token-wise
  // because word order and adjacency must hold.
  const stringResults = (entry.required_strings || []).map(required => ({required, found: saysPhrase(html, required)}));
  // Accept either marker, exactly as validate_bhpc_rich_new_page_contract.mjs
  // does and for the reason recorded there: recommendation_summary is written
  // by the retrofit pass, outside the agent section, carrying
  // data-content-block. The applier deliberately emits nothing for that block
  // when its only source is source_fix_instruction - operator-facing audit
  // critique that must not be published as page copy - so the retrofit is the
  // only thing that supplies it. Tagging the retrofit's output with
  // data-bhpc-agent-block instead is the one fix that must not be used: it
  // makes the applier's section strip start at the retrofit block and delete
  // every real block after it, which already cost four insight pages their
  // trust, source and definition blocks. The marker a block carries should not
  // decide whether the block counts.
  const blockResults = (entry.required_block_types || []).map(type => ({type, found: html.includes(`data-bhpc-agent-block="${type}"`) || html.includes(`data-content-block="${type}"`)}));
  const recordFound = html.includes(attrNeedle(entry.record_id));
  const legacyMarkerFound = /Agent Exact Citation Repair|exact intended-winner pipeline/i.test(html);
  const planned = plannedPaths.has(rel);
  const pass = exists && recordFound && planned && !legacyMarkerFound && stringResults.every(result => result.found) && blockResults.every(result => result.found);
  traces.push({...entry, trace_status: pass ? 'PASS' : (isBacklog(entry) ? 'BACKLOG' : 'FAIL'), file_exists: exists, planned_path: planned, semantic_record_found: recordFound, legacy_marker_found: legacyMarkerFound, required_strings_found: stringResults, required_blocks_found: blockResults});
  if (!pass) {
    const reasons = [];
    if (!exists) reasons.push('file_missing');
    if (!planned) reasons.push('path_not_planned');
    if (!recordFound) reasons.push('record_marker_missing');
    if (legacyMarkerFound) reasons.push('legacy_marker_present');
    const missingStrings = stringResults.filter(result => !result.found).map(result => result.required);
    const missingBlocks = blockResults.filter(result => !result.found).map(result => result.type);
    if (missingStrings.length) reasons.push(`missing_strings=${JSON.stringify(missingStrings)}`);
    if (missingBlocks.length) reasons.push(`missing_blocks=${JSON.stringify(missingBlocks)}`);
    const detail = `${entry.record_id}:semantic_acceptance_not_proven:${rel}:${reasons.join(';')}`;
    // Carried backlog is reported with identical detail but does not fail the
    // run. It is work to drain, not a regression introduced by this cycle.
    if (isBacklog(entry)) backlog.push(detail); else errors.push(detail);
  }
}
const report = {schema_version: '1.2', generated_at: new Date().toISOString(), status: errors.length ? 'FAIL' : 'PASS', manifest_entries: manifest.entries?.length || 0, active_plan_spec_count: activeSpecs.length, skipped_count: skipped, trace_count: traces.length, newest_run_date: newestRunDate, backlog_count: backlog.length, traces, errors, backlog};
writeJson('artifacts/validation/agent-exact-implementation-trace.json', report);
writeJson('reports/bhpc-agent-exact-implementation-trace.json', report);
if (errors.length) {
  console.error(`[bhpc-agent-exact-trace] FAIL: ${errors.length} issue(s) in run ${newestRunDate}`);
  for (const e of errors.slice(0, 80)) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[bhpc-agent-exact-trace] PASS: ${traces.length} acceptance entries; skipped=${skipped}; active_specs=${activeSpecs.length}`);
