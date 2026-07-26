#!/usr/bin/env node
import fs from 'node:fs';
const pages=JSON.parse(fs.readFileSync('data/citation/citable_pages.json','utf8')).pages.filter(x=>x.status==='ACTIVE');
const spry=fs.readFileSync('sitemap.xml','utf8');
const bhpc=fs.readFileSync('sitemap-bhpc.xml','utf8');
const errors=[];
for (const p of pages) {
  const map = p.canonical_domain.includes('spryexecutiveos') ? spry : bhpc;
  if (!map.includes(p.canonical_url)) errors.push(`sitemap missing ${p.canonical_url}`);
}
fs.mkdirSync('artifacts/diagnostics/container-current/validate-sitemap-coverage',{recursive:true});
fs.writeFileSync('artifacts/diagnostics/container-current/validate-sitemap-coverage/summary.json', JSON.stringify({status:errors.length?'FAIL':'PASS',checked:pages.length,errors},null,2)+'\n');
if (errors.length) { console.error('[validate:sitemap-coverage] FAIL'); errors.slice(0,200).forEach(e=>console.error(' - '+e)); process.exit(1); }
console.log(`[validate:sitemap-coverage] OK: ${pages.length} active pages covered`);
