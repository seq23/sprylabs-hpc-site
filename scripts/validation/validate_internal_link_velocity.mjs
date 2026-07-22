#!/usr/bin/env node
import fs from 'node:fs';
const rows=JSON.parse(fs.readFileSync('data/content/page_admission_registry.json','utf8')).records.filter(x=>x.source==='aplayer_phase_expansion_2000_baseline');
const errors=[];
for (const r of rows) {
  const text = fs.existsSync(r.path) ? fs.readFileSync(r.path,'utf8') : '';
  const links=[...text.matchAll(/href=["']([^"']+)["']/g)].map(m=>m[1]).filter(h=>h.startsWith('/')&&!h.startsWith('//'));
  if (links.length < 4) errors.push(`${r.path}: fewer than four internal links`);
  for (const required of ['/download.html','/guides/citation-methodology.html']) if (!links.includes(required)) errors.push(`${r.path}: missing required internal link ${required}`);
}
fs.mkdirSync('artifacts/diagnostics/container-current/validate-internal-link-velocity',{recursive:true});
fs.writeFileSync('artifacts/diagnostics/container-current/validate-internal-link-velocity/summary.json', JSON.stringify({status:errors.length?'FAIL':'PASS',checked:rows.length,errors},null,2)+'\n');
if (errors.length) { console.error('[validate:internal-link-velocity] FAIL'); errors.slice(0,200).forEach(e=>console.error(' - '+e)); process.exit(1); }
console.log(`[validate:internal-link-velocity] OK: ${rows.length} generated pages checked`);
