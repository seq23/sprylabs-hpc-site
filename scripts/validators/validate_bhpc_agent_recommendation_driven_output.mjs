#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from '../agent_intake/bhpc_agent_common.mjs';

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
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function normalize(value = '') {
  return textOnly(String(value || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokenCovered(needle = '', haystack = '') {
  const tokens = normalize(needle).split(' ').filter(token => token.length > 2);
  if (!tokens.length) return true;
  const hay = normalize(haystack);
  return tokens.every(token => hay.includes(token));
}
function quotedPhrases(value = '') {
  const out = [];
  const text = String(value || '');
  for (const match of text.matchAll(/["“”'`‘’]([^"“”'`‘’]{3,110})["“”'`‘’]/g)) out.push(match[1].trim());
  return [...new Set(out.map(v => v.toLowerCase()))].map(k => out.find(v => v.toLowerCase() === k)).filter(Boolean);
}

const manifest = readJson('data/report_fixes/agent_acceptance_manifest.generated.json', {entries: []});
const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs: []});
const apply = readJson('artifacts/validation/agent-exact-implementation-apply.json', {applied: [], skipped: []});
const errors = [];
const checked = [];
const appliedIds = new Set((apply.applied || []).flatMap(item => item.acceptance_ids || [item.record_id]).map(String));
const plannedPaths = new Set((plan.specs || []).filter(spec => spec.status !== 'BLOCKED').map(spec => spec.implementation_path));

for (const entry of manifest.entries || []) {
  if (entry.acceptance_status === 'BLOCKED') {
    if (!entry.blocked_reason) errors.push(`${entry.record_id}:blocked_without_reason`);
    continue;
  }
  const rel = entry.implementation_path || '';
  const abs = path.join(ROOT, rel);
  if (!rel || !fs.existsSync(abs)) { errors.push(`${entry.record_id}:missing_output_page:${rel}`); continue; }
  const html = fs.readFileSync(abs, 'utf8');
  const text = textOnly(html);
  const exactFix = String(entry.source_fix_instruction || '').trim();
  const exactQuery = String(entry.query || '').trim();
  const phrases = quotedPhrases(exactFix);
  const hasDirective = html.includes('data-bhpc-agent-block="agent_directive"');
  const hasSourceInstruction = /Agent source instruction/i.test(text);
  const queryCovered = tokenCovered(exactQuery, text);
  const fixCovered = tokenCovered(exactFix, text);
  const phraseMisses = phrases.filter(phrase => !tokenCovered(phrase, text));
  const recordMarker = html.includes(`data-bhpc-agent-record="${entry.record_id}"`);
  if (!hasDirective) errors.push(`${entry.record_id}:missing_agent_directive_block:${rel}`);
  if (!hasSourceInstruction) errors.push(`${entry.record_id}:missing_agent_source_instruction_label:${rel}`);
  if (!queryCovered) errors.push(`${entry.record_id}:query_not_visible_enough:${rel}`);
  if (!fixCovered) errors.push(`${entry.record_id}:source_fix_instruction_not_visible_enough:${rel}`);
  if (phraseMisses.length) errors.push(`${entry.record_id}:quoted_phrase_missing:${phraseMisses.join('|')}:${rel}`);
  if (!recordMarker) errors.push(`${entry.record_id}:missing_record_marker:${rel}`);
  if (!plannedPaths.has(rel)) errors.push(`${entry.record_id}:output_page_not_in_plan:${rel}`);
  if (!appliedIds.has(String(entry.id))) errors.push(`${entry.record_id}:acceptance_id_not_applied:${entry.id}`);
  checked.push({record_id: entry.record_id, acceptance_id: entry.id, implementation_path: rel, phrases, hasDirective, hasSourceInstruction, queryCovered, fixCovered});
}

const report = {
  schema_version: '1.0',
  validator: 'bhpc-agent-recommendation-driven-output',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  rule: 'Every required agent recommendation must drive visible output through an agent_directive block containing the source instruction, query target, required quoted/named phrases, and page-level proof marker.',
  checked_count: checked.length,
  checked: checked.slice(0, 150),
  errors,
};
writeJson('artifacts/validation/bhpc-agent-recommendation-driven-output.json', report);
writeJson('reports/bhpc-agent-recommendation-driven-output.json', report);
if (errors.length) {
  console.error(`[bhpc-agent-recommendation-driven-output] FAIL: ${errors.length} issue(s)`);
  for (const error of errors.slice(0, 80)) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[bhpc-agent-recommendation-driven-output] PASS: checked=${checked.length}`);
