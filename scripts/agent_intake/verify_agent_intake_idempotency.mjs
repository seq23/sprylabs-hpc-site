#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const ROOT=process.cwd();
const read=(rel,fallback={})=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'))}catch{return fallback}};
const hash=rel=>{const abs=path.join(ROOT,rel);return fs.existsSync(abs)?crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'):null};
const plan=read('artifacts/validation/agent-exact-implementation-plan.json',{mutation_paths:[],specs:[],link_mutations:[]});
const paths=[...new Set([...(plan.mutation_paths||[]),...(plan.specs||[]).filter(x=>x.status==='PLANNED').map(x=>x.implementation_path),...(plan.link_mutations||[]).map(x=>x.from_path)].filter(Boolean))].sort();
const before=Object.fromEntries(paths.map(rel=>[rel,hash(rel)]));
const commands=['agent:bhpc:apply-exact','agent:bhpc:apply-links'];
const command_results=[];
for(const script of commands){
  const direct=process.env.AGENT_INTAKE_DIRECT_EXECUTION==='1';
  const file=script==='agent:bhpc:apply-exact'?'scripts/agent_intake/apply_bhpc_agent_exact_implementation.mjs':'scripts/agent_intake/apply_bhpc_internal_link_mutations.mjs';
  const result=direct
    // main deleted scripts/site_layout/run_with_public_root.mjs with the whole
    // site/public staging layout, so run the target script directly.
    ?spawnSync(process.execPath,[file],{cwd:ROOT,stdio:'inherit',env:process.env})
    :spawnSync('npm',['run',script],{cwd:ROOT,stdio:'inherit',env:process.env});
  command_results.push({script,status:result.status,execution:direct?'direct-artifact-qa':'npm'});if(result.status!==0)break
}
const after=Object.fromEntries(paths.map(rel=>[rel,hash(rel)]));
const drift=paths.filter(rel=>before[rel]!==after[rel]).map(rel=>({path:rel,before:before[rel],after:after[rel]}));
const report={schema_version:'1.0',generated_at:new Date().toISOString(),status:command_results.every(x=>x.status===0)&&drift.length===0?'PASS':'FAIL',validated_commit_sha:process.env.VALIDATED_COMMIT_SHA||'',path_count:paths.length,commands:command_results,drift};
for(const rel of ['artifacts/validation/agent-intake-idempotency.json','reports/agent-intake-idempotency.json']){const abs=path.join(ROOT,rel);fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,JSON.stringify(report,null,2)+'\n')}
console.log(`[agent-intake-idempotency] ${report.status}: paths=${paths.length}; drift=${drift.length}`);
if(report.status!=='PASS')process.exit(1);
