#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const ROOT=process.cwd();
const maxCycles=Math.max(1,Math.min(5,Number(process.env.AGENT_SELF_HEAL_MAX_CYCLES||3)));
const reportPaths=['artifacts/validation/page-seo-contract.json','artifacts/validation/agent-exact-implementation-trace.json','artifacts/validation/bhpc-agent-internal-link-mutations.json','artifacts/validation/bhpc-agent-recommendation-driven-output.json'];
const fingerprint=()=>{const parts=[];for(const rel of reportPaths){try{const value=JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));parts.push({rel,status:value.status,errors:value.errors||value.failures||[]})}catch{}}return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex')};
const run=script=>spawnSync('npm',['run',script],{cwd:ROOT,stdio:'inherit',env:process.env}).status??1;
const cycles=[];let status='FAIL';let previous='';
for(let cycle=1;cycle<=maxCycles;cycle+=1){
  const transactionStatus=run('release:agent-intake:transaction');
  const current=fingerprint();
  const item={cycle,transaction_status:transactionStatus,failure_fingerprint:current,repair_status:null};
  cycles.push(item);
  if(transactionStatus===0){const idem=run('agent:bhpc:verify-idempotency');item.idempotency_status=idem;if(idem===0){status='PASS';break}}
  if(current===previous){item.stop_reason='repeated_failure_fingerprint';break}
  previous=current;
  if(cycle<maxCycles){item.repair_status=run('agent:bhpc:self-heal');if(item.repair_status!==0){item.stop_reason='repair_failed';break}}
}
const report={schema_version:'1.0',generated_at:new Date().toISOString(),status,max_cycles:maxCycles,cycles,quarantined:status!=='PASS'};
for(const rel of ['artifacts/validation/agent-intake-self-healing.json','reports/agent-intake-self-healing.json']){const abs=path.join(ROOT,rel);fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,JSON.stringify(report,null,2)+'\n')}
console.log(`[agent-intake-self-healing] ${status}: cycles=${cycles.length}; quarantined=${report.quarantined}`);
if(status!=='PASS')process.exit(1);
