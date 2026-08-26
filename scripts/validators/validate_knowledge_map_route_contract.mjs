#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const fail=[];
const req=['knowledge-map/index.html','knowledge-map/knowledge-map.json','data/admin/knowledge_map_operations.json','scripts/build_knowledge_map.js'];
for(const rel of req){if(!fs.existsSync(path.join(root,rel))) fail.push(`missing ${rel}`);}
const pack=fs.readFileSync(path.join(root,'scripts/release/package_baseline.mjs'),'utf8');
if(pack.includes('`${base}/knowledge-map/*`')) fail.push('baseline packager excludes the public /knowledge-map/ route');
const contract=JSON.parse(fs.readFileSync(path.join(root,'_baseline_packaging_contract.json'),'utf8'));
if((contract.excluded_patterns||[]).includes('knowledge-map/')) fail.push('packaging contract excludes public knowledge-map route');
for(const rel of ['knowledge-map/index.html','knowledge-map/knowledge-map.json']) if(!(contract.required_files||[]).includes(rel)) fail.push(`packaging contract does not require ${rel}`);
// Both published coverage JSONs must be sanitized. /coverage.json is required by
// validate_machine_readability_contract beside llms.txt and answers.json, so it is
// served at the site root - and it is the file that actually leaked: it kept the
// full report (draft counts, forward publishing runway, citation opportunities)
// after the 2026-07-10 repair stopped regenerating it, and shipped that publicly
// for weeks. Checking only coverage/coverage.json is what let that survive.
const publicJsonPaths=['knowledge-map/knowledge-map.json','knowledge-map.json'];
for(const rel of publicJsonPaths){
  const abs=path.join(root,rel);
  if(!fs.existsSync(abs)){fail.push(`missing ${rel}`);continue;}
  const doc=JSON.parse(fs.readFileSync(abs,'utf8'));
  if('runway' in doc) fail.push(`${rel} exposes the publishing runway`);
  if(doc.totals?.drafts !== undefined) fail.push(`${rel} exposes unpublished draft counts`);
  if('citationOpportunities' in doc) fail.push(`${rel} exposes internal citation opportunities`);
}
const publicJson=JSON.parse(fs.readFileSync(path.join(root,'knowledge-map/knowledge-map.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'knowledge-map/index.html'),'utf8');
if(/Upcoming dated drafts|Draft runway|>Draft</.test(html)) fail.push('public knowledge-map page exposes operational draft/runway data');
if(!/Published coverage snapshot/.test(html)) fail.push('public knowledge-map page lacks published coverage snapshot');
if(fail.length){console.error('knowledge-map-route-contract FAIL\n'+fail.map(x=>'- '+x).join('\n'));process.exit(1);}
console.log('knowledge-map-route-contract PASS');
