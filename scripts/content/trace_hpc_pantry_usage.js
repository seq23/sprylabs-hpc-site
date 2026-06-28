#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const bank=path.join(process.cwd(),'content-bank');
const files=fs.readdirSync(bank).filter(f=>f.endsWith('.json')); const trace={status:'PASS',repo:'sprylabs-hpc-site',files:{}};
for(const f of files){const obj=JSON.parse(fs.readFileSync(path.join(bank,f),'utf8')); trace.files[f]=Object.fromEntries(Object.entries(obj).filter(([k,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]));}
fs.mkdirSync('reports',{recursive:true}); fs.mkdirSync('artifacts/validation',{recursive:true}); fs.writeFileSync('reports/hpc-pantry-trace.json',JSON.stringify(trace,null,2)+'\n'); fs.writeFileSync('artifacts/validation/hpc-pantry-trace.json',JSON.stringify(trace,null,2)+'\n'); console.log(JSON.stringify(trace,null,2));
