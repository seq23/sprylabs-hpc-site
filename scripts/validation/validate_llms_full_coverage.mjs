#!/usr/bin/env node
import fs from 'node:fs';
const pages=JSON.parse(fs.readFileSync('data/citation/citable_pages.json','utf8')).pages.filter(x=>x.status==='ACTIVE');
const full=fs.readFileSync('llms-full.txt','utf8');
const txt=fs.readFileSync('llms.txt','utf8');
const errors=[];
for (const p of pages) {
  if (!full.includes(p.canonical_url)) errors.push(`llms-full missing URL ${p.canonical_url}`);
  if (!full.includes(p.query)) errors.push(`llms-full missing query ${p.query}`);
  if (!txt.includes(p.canonical_url)) errors.push(`llms.txt missing URL ${p.canonical_url}`);
}
fs.mkdirSync('artifacts/diagnostics/container-current/validate-llms-full-coverage',{recursive:true});
fs.writeFileSync('artifacts/diagnostics/container-current/validate-llms-full-coverage/summary.json', JSON.stringify({status:errors.length?'FAIL':'PASS',checked:pages.length,errors},null,2)+'\n');
if (errors.length) { console.error('[validate:llms-full-coverage] FAIL'); errors.slice(0,200).forEach(e=>console.error(' - '+e)); process.exit(1); }
console.log(`[validate:llms-full-coverage] OK: ${pages.length} active pages covered`);
