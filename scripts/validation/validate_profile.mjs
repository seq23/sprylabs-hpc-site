#!/usr/bin/env node
import fs from 'node:fs';
import {readJson,runCommand} from './validation_control_plane.mjs';
const name=process.argv[2]; if(!name){console.error('usage: npm run validate:profile -- <profile>');process.exit(2)}
const matrix=readJson('_repo_validation_matrix.json'); const profile=matrix.profiles?.[name];
if(!profile){console.error(`[validate:profile] INTERNAL_ERROR: unknown profile ${name}`);process.exit(2)}
const steps=[]; const seen=new Set();
function addProfile(n,stack=[]){if(stack.includes(n)){throw new Error(`profile cycle: ${[...stack,n].join(' -> ')}`)} const p=matrix.profiles?.[n]; if(!p) throw new Error(`unknown inherited profile ${n}`); for(const base of p.extends||[]) addProfile(base,[...stack,n]); for(const s of p.steps||[]){const key=s.id||s.command;if(!seen.has(key)){seen.add(key);steps.push(s)}}}
try{addProfile(name)}catch(e){console.error(`[validate:profile] INTERNAL_ERROR: ${e.message}`);process.exit(2)}
const receipt={profile:name,started_at:new Date().toISOString(),steps:[],status:'PASS'};
for(const step of steps){console.log(`[validate:profile:${name}] ${step.id||step.command}`); const code=runCommand(step.command); receipt.steps.push({...step,exit_code:code,status:code===0?'PASS':code===1?'FAIL':'INTERNAL_ERROR'}); if(code!==0){receipt.status=code===1?'FAIL':'INTERNAL_ERROR';break}}
receipt.finished_at=new Date().toISOString(); fs.mkdirSync('artifacts/validation',{recursive:true}); fs.writeFileSync(`artifacts/validation/profile-${name}.json`,JSON.stringify(receipt,null,2)+'\n');
console.log(`[validate:profile] ${receipt.status}: ${name}`); process.exit(receipt.status==='PASS'?0:receipt.status==='FAIL'?1:2);
