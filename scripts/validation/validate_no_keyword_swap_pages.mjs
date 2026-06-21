#!/usr/bin/env node
import fs from 'node:fs';
const rows=JSON.parse(fs.readFileSync('data/content/programmatic_candidate_manifest.json','utf8')).candidates.filter(x=>x.source==='aplayer_phase_expansion_2000_baseline');
const errors=[];
function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function tokenSet(s){return new Set(norm(s).split(/\s+/).filter(Boolean).filter(w=>!['the','and','for','with','how','can','use','to','a','an','is','of','in','as','your','my'].includes(w)));}
for (const r of rows) {
  const q=tokenSet(r.primary_query); const a=tokenSet(r.unique_atom); let overlap=0; for (const w of q) if (a.has(w)) overlap++;
  const qOnly=[...q].filter(w=>!a.has(w));
  const distinct=[...a].filter(w=>!q.has(w));
  if (distinct.length < 10) errors.push(`${r.path}: unique_atom lacks distinct explanatory terms`);
}
fs.mkdirSync('artifacts/diagnostics/container-current/validate-no-keyword-swap-pages',{recursive:true});
fs.writeFileSync('artifacts/diagnostics/container-current/validate-no-keyword-swap-pages/summary.json', JSON.stringify({status:errors.length?'FAIL':'PASS',checked:rows.length,errors},null,2)+'\n');
if (errors.length) { console.error(`[validate:no-keyword-swap-pages] FAIL: ${errors.length}`); errors.slice(0,200).forEach(e=>console.error(' - '+e)); process.exit(1); }
console.log(`[validate:no-keyword-swap-pages] OK: ${rows.length} generated pages checked`);
