#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from '../agent_intake/bhpc_agent_common.mjs';
import {requiredBlockTypesForPageFamily} from '../lib/bhpc_agent_block_schema.mjs';
const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs: []});
const errors = [];
const checked = [];
function unique(values=[]){return [...new Set(values.filter(Boolean).map(String))]}
function textOnly(html=''){return String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}
function words(text=''){return textOnly(text).split(/\s+/).filter(Boolean)}
function blockHtml(html='', type=''){const match=String(html).match(new RegExp(`<([a-z][a-z0-9]*)[^>]*data-bhpc-agent-block=[\"']${type}[\"'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'));return match?.[2]||''}
function normalize(text=''){return textOnly(text).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function distinctiveQueryTokens(query=''){const stop=new Set(['the','and','for','with','that','this','how','what','can','chatgpt','help','use','best','like','into','from','these','your','you','me','my','all','day']);return unique(normalize(query).split(' ').filter(token=>token.length>=4&&!stop.has(token)))}
const directAnswerOwners = new Map();
for (const spec of plan.specs || []) {
  if (!spec.implementation_path || spec.status === 'BLOCKED') continue;
  const abs = path.join(ROOT, spec.implementation_path);
  if (!fs.existsSync(abs)) { errors.push(`implementation_page_missing:${spec.record_id}:${spec.implementation_path}`); continue; }
  const html = fs.readFileSync(abs, 'utf8');
  const fam = spec.page_family || 'answer_page';
  const required = unique([...requiredBlockTypesForPageFamily(fam), ...(spec.required_block_types || [])]);
  for (const block of required) if (!html.includes(`data-bhpc-agent-block="${block}"`)) errors.push(`missing_semantic_block:${spec.record_id}:${fam}:${block}`);
  if (!html.includes('data-bhpc-agent-semantic="true"')) errors.push(`missing_semantic_marker:${spec.record_id}`);
  if (/marker-only/i.test(html)) errors.push(`marker_only_language_present:${spec.record_id}`);
  if (spec.operation === 'CREATE_NEW_TARGET_PAGE') {
    if (!html.includes('data-bhpc-agent-generated-page="true"')) errors.push(`missing_generated_page_ownership_marker:${spec.record_id}`);
    const extractionBlocks = html.match(/data-llm-answer=["']true["']/gi) || [];
    if (extractionBlocks.length !== 1) errors.push(`invalid_extraction_block_count:${spec.record_id}:${extractionBlocks.length}`);
    const expectedExtraction = String(spec.extraction_type || (fam === 'comparison_page' ? 'comparison' : 'concept')).toLowerCase();
    if (!html.includes(`data-extraction-type="${expectedExtraction}"`)) errors.push(`missing_expected_extraction_type:${spec.record_id}:${expectedExtraction}`);
    const extractionMatch = html.match(/<section\b[^>]*data-llm-answer=["']true["'][^>]*>([\s\S]*?)<\/section>/i);
    const extractionHtml = extractionMatch?.[1] || '';
    if (expectedExtraction === 'comparison' && !/<table\b/i.test(extractionHtml)) errors.push(`comparison_extraction_missing_table:${spec.record_id}`);
    if (expectedExtraction === 'concept' && (extractionHtml.match(/<li\b/gi) || []).length < 3) errors.push(`concept_extraction_too_thin:${spec.record_id}`);
    const direct = textOnly(blockHtml(html, 'direct_answer'));
    if (words(direct).length < 38) errors.push(`direct_answer_too_thin:${spec.record_id}:${words(direct).length}`);
    if (/requires a clear operating model, transparent tradeoffs|best fit depends on whether the reader needs/i.test(direct)) errors.push(`generic_direct_answer_boilerplate:${spec.record_id}`);
    const tokens = distinctiveQueryTokens(spec.query || '');
    const covered = tokens.filter(token => normalize(direct).includes(token));
    if (tokens.length >= 2 && covered.length < Math.min(2, tokens.length)) errors.push(`direct_answer_not_query_specific:${spec.record_id}:${covered.length}/${tokens.length}`);
    const fingerprint = normalize(direct);
    if (fingerprint) {
      const prior = directAnswerOwners.get(fingerprint);
      if (prior && prior !== spec.record_id) errors.push(`duplicate_direct_answer_across_new_pages:${prior}:${spec.record_id}`);
      else directAnswerOwners.set(fingerprint, spec.record_id);
    }
    for (const domain of spec.evidence_required_domains || []) {
      const safe = String(domain).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if (!new RegExp(`href=["']https?:\\/\\/(?:www\\.)?[^"']*${safe}`, 'i').test(html)) errors.push(`required_first_party_evidence_not_rendered:${spec.record_id}:${domain}`);
    }
  }
  checked.push({record_id: spec.record_id, operation: spec.operation, page_family: fam, implementation_path: spec.implementation_path, required_blocks: required});
}
const report = {schema_version:'1.2', validator:'bhpc-rich-new-page-contract', status:errors.length?'FAIL':'PASS', checked_count:checked.length, checked:checked.slice(0,100), errors};
writeJson('artifacts/validation/bhpc-rich-new-page-contract.json', report);
writeJson('reports/bhpc-rich-new-page-contract.json', report);
if (errors.length) { console.error(JSON.stringify(report,null,2)); process.exit(1); }
console.log(`[bhpc-rich-new-page-contract] PASS: checked=${checked.length}`);
