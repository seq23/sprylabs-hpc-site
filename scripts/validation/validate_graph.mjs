import fs from 'node:fs';
import path from 'node:path';
import {readJson,fail,pass,writeSummary} from './common.mjs';
const pages=readJson('data/citation/citable_pages.json').pages.filter(x=>x.status==='ACTIVE');
const errors=[]; const canon=new Map(); const active=new Set(pages.map(x=>x.path));
for(const p of pages){
 if(canon.has(p.canonical_url)) errors.push(`duplicate canonical ${p.canonical_url}: ${canon.get(p.canonical_url)}, ${p.path}`); else canon.set(p.canonical_url,p.path);
 const text=fs.readFileSync(p.path,'utf8');
 const links=[...text.matchAll(/href=["']([^"']+)["']/g)].map(m=>m[1]).filter(x=>x.startsWith('/')&&!x.startsWith('//'));
 for(const href of links){
  const clean=href.split(/[?#]/)[0]; if(!clean||clean==='/') continue;
  let rel=clean.replace(/^\//,'');
  const candidates=[rel,`${rel}.html`,`${rel}/index.html`];
  if(!candidates.some(c=>fs.existsSync(c)) && !clean.startsWith('/assets/') && !clean.startsWith('/download')) errors.push(`${p.path}: broken internal link ${href}`);
 }
}
writeSummary('validate-graph',{status:errors.length?'FAIL':'PASS',pages:pages.length,errors});
if(errors.length) fail(`[validate:graph] FAIL: ${errors.length} issue(s)`,errors.slice(0,200));
pass(`[validate:graph] OK: ${pages.length} pages have unique canonicals and resolvable internal links`);
