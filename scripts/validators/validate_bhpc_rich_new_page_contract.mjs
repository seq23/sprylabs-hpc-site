#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from '../agent_intake/bhpc_agent_common.mjs';
const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs: []});
const errors = [];
const checked = [];
const requiredBlockMap = {
  comparison_page: ['comparison_table','direct_answer'],
  authority_insight: ['source_block','direct_answer'],
  answer_page: ['direct_answer','recommendation_summary'],
  cluster_page: ['source_block','cta_callout'],
  framework_page: ['protocol','checklist'],
  protocol_page: ['protocol','checklist']
};
for (const spec of plan.specs || []) {
  if (!spec.implementation_path || spec.status === 'BLOCKED') continue;
  const abs = path.join(ROOT, spec.implementation_path);
  if (!fs.existsSync(abs)) { errors.push(`implementation_page_missing:${spec.record_id}:${spec.implementation_path}`); continue; }
  const html = fs.readFileSync(abs, 'utf8');
  const fam = spec.page_family || 'answer_page';
  const required = requiredBlockMap[fam] || ['direct_answer','recommendation_summary'];
  for (const block of required) {
    if (!html.includes(`data-bhpc-agent-block="${block}"`)) errors.push(`missing_semantic_block:${spec.record_id}:${fam}:${block}`);
  }
  if (!html.includes('data-bhpc-agent-semantic="true"')) errors.push(`missing_semantic_marker:${spec.record_id}`);
  if (/marker-only/i.test(html)) errors.push(`marker_only_language_present:${spec.record_id}`);
  checked.push({record_id: spec.record_id, page_family: fam, implementation_path: spec.implementation_path, required_blocks: required});
}
const report = {schema_version:'1.0', validator:'bhpc-rich-new-page-contract', status:errors.length?'FAIL':'PASS', checked_count:checked.length, checked:checked.slice(0,100), errors};
writeJson('artifacts/validation/bhpc-rich-new-page-contract.json', report);
writeJson('reports/bhpc-rich-new-page-contract.json', report);
if (errors.length) { console.error(JSON.stringify(report,null,2)); process.exit(1); }
console.log(`[bhpc-rich-new-page-contract] PASS: checked=${checked.length}`);
