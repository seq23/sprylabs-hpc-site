#!/usr/bin/env node
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync('data/content/programmatic_candidate_manifest.json','utf8'));
const registry = JSON.parse(fs.readFileSync('data/content/page_admission_registry.json','utf8'));
const generated = (manifest.candidates || []).filter(x => x.source === 'aplayer_phase_expansion_2000_baseline');
const required = ['path','primary_query','intent','generation_lane','unique_atom','artifact_type','product_angle','reader_problem','answer_promise','methodology_anchor','internal_links','cta_profile','claim_safety_level','review_status','last_reviewed','reviewer_or_publisher','schema_type'];
const errors=[]; const byPath = new Map(registry.records.map(r=>[r.path,r])); const atoms=new Set(); const queries=new Set();
function words(s){return String(s||'').match(/\b[\w'-]+\b/g)||[];}
function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
for (const r of generated) {
  for (const f of required) if (r[f] === undefined || r[f] === null || (typeof r[f] === 'string' && !r[f].trim()) || (Array.isArray(r[f]) && !r[f].length)) errors.push(`${r.path}: missing release atom field ${f}`);
  if (!fs.existsSync(r.path)) errors.push(`${r.path}: generated page missing`);
  if (!byPath.has(r.path)) errors.push(`${r.path}: missing from page_admission_registry`);
  if (words(r.unique_atom).length < 16) errors.push(`${r.path}: unique_atom too short`);
  const stripped = norm(String(r.unique_atom).replace(new RegExp(String(r.primary_query||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'),''));
  if (stripped.split(/\s+/).filter(Boolean).length < 12) errors.push(`${r.path}: unique_atom collapses after query removal`);
  const key = norm(r.unique_atom); if (atoms.has(key)) errors.push(`${r.path}: duplicate unique_atom`); atoms.add(key);
  const q = norm(r.primary_query); if (queries.has(q)) errors.push(`${r.path}: duplicate primary_query`); queries.add(q);
  if (['source_needed','external_pending','prohibited'].includes(r.claim_safety_level)) errors.push(`${r.path}: public page uses unsafe claim_safety_level ${r.claim_safety_level}`);
}
const summary = {status: errors.length ? 'FAIL' : 'PASS', generated_atoms: generated.length, errors};
fs.mkdirSync('artifacts/diagnostics/container-current/validate-release-atom-contract',{recursive:true});
fs.writeFileSync('artifacts/diagnostics/container-current/validate-release-atom-contract/summary.json', JSON.stringify(summary,null,2)+'\n');
if (errors.length) { console.error(`[validate:release-atom-contract] FAIL: ${errors.length} issue(s)`); for (const e of errors.slice(0,200)) console.error(' - '+e); process.exit(1); }
console.log(`[validate:release-atom-contract] OK: ${generated.length} generated release atoms`);
