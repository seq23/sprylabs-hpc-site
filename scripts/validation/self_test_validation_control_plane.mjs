#!/usr/bin/env node
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=['package.json','_validation_registry.json','_repo_validation_matrix.json'];
const original=Object.fromEntries(files.map(f=>[f,fs.readFileSync(f,'utf8')]));
const results=[];
function restore(){for(const [f,v] of Object.entries(original))fs.writeFileSync(f,v)}
function run(name,mutate,expectedCode,expectedText){restore();mutate();const r=spawnSync('node',['scripts/validation/validate_validation_registry.mjs'],{encoding:'utf8'});const text=(r.stdout||'')+(r.stderr||'');const pass=r.status===expectedCode&&text.includes(expectedText);results.push({name,pass,exit_code:r.status,expected_code:expectedCode,expected_text:expectedText,output:text.slice(0,2000)});}
try{
 run('new executable validator without admission warns and exits zero',()=>{const p=JSON.parse(fs.readFileSync('package.json'));p.scripts['validate:fixture-unregistered']='node -e "process.exit(0)"';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')},0,'PASS_WITH_STRONG_WARNING');
 run('admitted validator with missing command hard fails',()=>{const p=JSON.parse(fs.readFileSync('package.json'));delete p.scripts['validate:query-owner-uniqueness'];fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')},1,'admitted package command does not resolve');
 run('matrix unknown validator id hard fails',()=>{const m=JSON.parse(fs.readFileSync('_repo_validation_matrix.json'));m.entries.push({matrix_id:'MX-FIXTURE-UNKNOWN',validation_id:'VAL-DOES-NOT-EXIST',command:'npm run validate:nope',severity:'HARD_FAIL'});fs.writeFileSync('_repo_validation_matrix.json',JSON.stringify(m,null,2)+'\n')},1,'unknown registry validator');
 run('duplicate validator id hard fails',()=>{const r=JSON.parse(fs.readFileSync('_validation_registry.json'));r.records.push({...r.records[0],command:'npm run validate:repo'});fs.writeFileSync('_validation_registry.json',JSON.stringify(r,null,2)+'\n')},1,'duplicate validation_id');
} finally {restore()}
const failed=results.filter(x=>!x.pass);fs.mkdirSync('artifacts/validation',{recursive:true});fs.writeFileSync('artifacts/validation/validation-control-plane-self-test.json',JSON.stringify({status:failed.length?'FAIL':'PASS',results},null,2)+'\n');if(failed.length){for(const x of failed)console.error(`FAIL: ${x.name}`);process.exit(1)}console.log(`[validation:control-plane:self-test] PASS: ${results.length} circularity scenarios`);
