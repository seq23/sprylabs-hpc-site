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

// A failing step used to stop the profile outright, so one defect hid every
// later step and each CI round-trip surfaced exactly one problem. That is only
// the right behaviour for steps that PRODUCE the tree everything after them
// reads: if the build or a repair fails, the later validators would be judging
// a tree that was never finished, and their failures would be noise.
//
// So: producers stop the run, validators do not. A failing validator is
// recorded and the profile keeps going, then exits non-zero at the end with
// every failure listed. Nothing is downgraded - a failure still fails the
// build; it just no longer conceals the others.
const isProducer=(step)=>/\b(?:build|repair|bootstrap|python-runtime|normalization|apply-report-contract)\b/.test(step.id||step.command);

let firstProducerFailure=null;
for(const step of steps){
  console.log(`[validate:profile:${name}] ${step.id||step.command}`);
  const code=runCommand(step.command);
  receipt.steps.push({...step,exit_code:code,status:code===0?'PASS':code===1?'FAIL':'INTERNAL_ERROR'});
  if(code===0) continue;
  if(receipt.status==='PASS'||code!==1) receipt.status=code===1?'FAIL':'INTERNAL_ERROR';
  if(isProducer(step)){
    firstProducerFailure=step.id||step.command;
    console.error(`[validate:profile:${name}] stopping: ${firstProducerFailure} produces the tree later steps read`);
    break;
  }
}
const failures=receipt.steps.filter((s)=>s.exit_code!==0);
receipt.failure_count=failures.length;
receipt.failures=failures.map((s)=>s.id||s.command);
receipt.stopped_early_at=firstProducerFailure;
if(failures.length>1||(failures.length&&!firstProducerFailure)){
  console.error(`[validate:profile:${name}] ${failures.length} failing step(s): ${receipt.failures.join(', ')}`);
}
receipt.finished_at=new Date().toISOString(); fs.mkdirSync('artifacts/validation',{recursive:true}); fs.writeFileSync(`artifacts/validation/profile-${name}.json`,JSON.stringify(receipt,null,2)+'\n');
console.log(`[validate:profile] ${receipt.status}: ${name}`); process.exit(receipt.status==='PASS'?0:receipt.status==='FAIL'?1:2);
