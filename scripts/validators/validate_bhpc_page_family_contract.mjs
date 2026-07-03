#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
function readJson(rel, fallback = null) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; } }
function writeJson(rel, payload) { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, `${JSON.stringify(payload,null,2)}\n`); }
const manifest = readJson('data/report_fixes/agent_acceptance_manifest.generated.json', {entries: []});
const allowed = new Set(['intended_winner_repair','comparison_page','answer_page','authority_insight','cluster_page','fallback_gap_fill','bhpc_insight']);
const errors=[]; const approvals=[];
for (const entry of manifest.entries || []) {
  if (!allowed.has(entry.page_family)) errors.push(`${entry.record_id}:unknown_page_family:${entry.page_family}`);
  if (entry.acceptance_status === 'REQUIRED' && !entry.implementation_path) errors.push(`${entry.record_id}:required_without_path`);
  if (entry.page_family === 'intended_winner_repair' && entry.operation !== 'REPAIR_INTENDED_WINNER_PAGE' && entry.route_status !== 'EXACT_EXISTING_REPAIR') errors.push(`${entry.record_id}:repair_family_without_repair_status`);
  approvals.push({record_id: entry.record_id, page_family: entry.page_family, route_status: entry.route_status, path: entry.implementation_path, status: entry.acceptance_status});
}
const report={schema_version:'1.0', generated_at:new Date().toISOString(), status:errors.length?'FAIL':'PASS', approval_count:approvals.length, required_count:approvals.filter(a=>a.status==='REQUIRED').length, page_family_counts: approvals.reduce((acc,a)=>{acc[a.page_family]=(acc[a.page_family]||0)+1;return acc;},{}), approvals, errors};
writeJson('artifacts/validation/bhpc-page-family-contract.json', report);
if(errors.length){console.error(`[validate:bhpc-page-family-contract] FAIL: ${errors.length} issue(s)`); for(const e of errors.slice(0,80)) console.error(` - ${e}`); process.exit(1);}
console.log(`[validate:bhpc-page-family-contract] PASS: approvals=${report.approval_count}`);
