#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const ROOT=process.cwd();
function walk(dir,out=[]){if(!fs.existsSync(dir))return out;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','.pages-output', 'node_modules','dist','.validation-runtime'].includes(e.name))continue;const abs=path.join(dir,e.name);if(e.isDirectory())walk(abs,out);else if(e.isFile()&&e.name.endsWith('.html'))out.push(abs)}return out}
function writeJson(rel,payload){const file=path.join(ROOT,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(payload,null,2)+'\n')}
const forbidden=[
  /Agent Exact Citation Repair/i,/exact intended-winner pipeline/i,/Agent recommendation implementation/i,/Agent-directed implementation/i,
  /Agent source instruction/i,/Source FIX instruction/i,/Route decision:/i,/created from BHPC agent acceptance criteria/i,
  /must prove the visible recommendation/i
];
const files=walk(ROOT),offenders=[];
// walk() starts at process.cwd(), so running from the wrong directory - or a
// tree whose pages have moved out from under it - yields no .html at all and
// the scan printed "PASS: scanned=0" having read nothing. This repo publishes
// its pages as .html under the repo root, so an empty scan means the scan is
// broken, not that the pages are clean.
if(!files.length){console.error(`[validate:bhpc-no-marker-only-agent-pass] FAIL: scanned 0 .html file(s) under ${ROOT}; expected the published page tree this repo serves. An empty scan proves no page is free of agent scaffolding.`);process.exit(1)}
for(const file of files){const html=fs.readFileSync(file,'utf8');const matches=forbidden.filter(r=>r.test(html)).map(r=>r.source);if(matches.length)offenders.push({path:path.relative(ROOT,file).split(path.sep).join('/'),matches})}
const report={schema_version:'1.1',generated_at:new Date().toISOString(),status:offenders.length?'FAIL':'PASS',scanned_html_files:files.length,offender_count:offenders.length,offenders};
writeJson('artifacts/validation/bhpc-no-marker-only-agent-pass.json',report);
if(offenders.length){console.error(`[validate:bhpc-no-marker-only-agent-pass] FAIL: ${offenders.length} public operational-scaffolding page(s)`);for(const row of offenders.slice(0,80))console.error(` - ${row.path}: ${row.matches.join(',')}`);process.exit(1)}
console.log(`[validate:bhpc-no-marker-only-agent-pass] PASS: scanned=${files.length}`);
