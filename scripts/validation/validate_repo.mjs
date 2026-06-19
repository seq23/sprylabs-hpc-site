import fs from 'node:fs';
import path from 'node:path';
import {ROOT,readJson,exists,fail,pass,writeSummary} from './common.mjs';
const required=['REPO_IDENTITY.md','package.json','package-lock.json','.nvmrc','_repo_update_contract.json','_repo_validation_matrix.json','_validation_registry.json','_repo_lifecycle_profile.json','_browser_suite_contract.json','_public_route_manifest.json','_baseline_packaging_contract.json'];
const errors=[];
for(const f of required) if(!exists(f)) errors.push(`missing required file: ${f}`);
for(const f of required.filter(x=>x.endsWith('.json'))) {try{readJson(f);}catch(e){errors.push(`invalid JSON ${f}: ${e.message}`)}}
const pkg=readJson('package.json'); const lock=readJson('package-lock.json');
if(pkg.name!=='sprylabs-hpc-site') errors.push(`package name mismatch: ${pkg.name}`);
if(!String(pkg.engines?.node||'').includes('24')) errors.push('package engines.node must require Node 24');
if(!String(lock.packages?.['']?.engines?.node||'').includes('24')) errors.push('package-lock engine must require Node 24');
if(fs.readFileSync('.nvmrc','utf8').trim()!=='24') errors.push('.nvmrc must be 24');
for(const wf of fs.readdirSync('.github/workflows').filter(x=>/ya?ml$/.test(x))){
 const text=fs.readFileSync(path.join('.github/workflows',wf),'utf8');
 if(/node-version:\s*["']?20\b/.test(text)) errors.push(`${wf}: Node 20 is forbidden`);
 if(/actions\/setup-node@/.test(text) && !/node-version:\s*["']?24\b/.test(text)) errors.push(`${wf}: setup-node must declare Node 24`);
}
for(const [name,cmd] of Object.entries(pkg.scripts||{})){
 for(const m of String(cmd).matchAll(/(?:node|python3|bash)\s+([^\s;&|]+)/g)){
  const f=m[1].replace(/^['"]|['"]$/g,'');
  if((f.startsWith('scripts/')||f.startsWith('_ops/')) && !fs.existsSync(f)) errors.push(`${name}: missing script ${f}`);
  if(fs.existsSync(f) && fs.statSync(f).isFile() && fs.statSync(f).size===0) errors.push(`${name}: zero-byte script ${f}`);
 }
}
for(const f of fs.readdirSync(ROOT).filter(x=>/^\.env($|\.)/.test(x) && !/\.example$/.test(x))) errors.push(`active environment file must not be committed: ${f}`);
writeSummary('validate-repo',{status:errors.length?'FAIL':'PASS',errors,node_runtime:process.version});
if(errors.length) fail(`[validate:repo] FAIL: ${errors.length} issue(s)`,errors);
pass(`[validate:repo] OK: repo authority, Node 24 declarations, workflows, scripts, and secret boundaries`);
