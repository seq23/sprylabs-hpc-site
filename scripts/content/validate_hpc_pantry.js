#!/usr/bin/env node
const fs=require('fs'); const path=require('path');
function writeReport(report){fs.mkdirSync('reports',{recursive:true});fs.mkdirSync('artifacts/validation',{recursive:true});fs.writeFileSync('reports/hpc-pantry-validation.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('artifacts/validation/hpc-pantry.json',JSON.stringify(report,null,2)+'\n');}
const root=process.cwd(); const bank=path.join(root,'content-bank');
const required=['coaching-paragraph-banks.json','execution-short-answer-banks.json','checklist-banks.json','mistake-red-flag-banks.json','founder-operator-pov-banks.json','recovery-after-missed-day-banks.json','ai-coaching-workflow-banks.json','implementation-example-banks.json','social-template-banks.json','safety-claim-rules.json','signal-classifiers.json','page-recipes.json'];
let errors=[]; for(const f of required){const p=path.join(bank,f); if(!fs.existsSync(p)) errors.push(`missing ${f}`); else {try{JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){errors.push(`invalid json ${f}: ${e.message}`)}}}
function count(file,key){return JSON.parse(fs.readFileSync(path.join(bank,file),'utf8'))[key]?.length||0}
const minimums=[['coaching-paragraph-banks.json','blocks',150],['execution-short-answer-banks.json','blocks',100],['checklist-banks.json','items',75],['mistake-red-flag-banks.json','items',75]];
for(const [f,k,min] of minimums){ if(fs.existsSync(path.join(bank,f)) && count(f,k)<min) errors.push(`${f} below minimum ${min}`); }
const report={status:errors.length?'FAIL':'PASS',repo:'sprylabs-hpc-site',pantry:'hpc',files:required.length,errors}; writeReport(report); console[errors.length?'error':'log'](JSON.stringify(report,null,2)); if(errors.length) process.exit(1);
