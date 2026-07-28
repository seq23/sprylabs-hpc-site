#!/usr/bin/env node
import {spawnSync} from 'node:child_process';import fs from 'node:fs';
const mode=process.argv.includes('--full')?'full':'incremental';const env={...process.env,VALIDATION_CACHE_MODE:mode,PYTHONDONTWRITEBYTECODE:'1'};
const started=Date.now();const steps=[['extraction','node',['scripts/validation/run_extraction_contract_final_state_sharded.mjs']],['schema','node',['scripts/validation/run_rendered_schema_parity_sharded.mjs']],['page_seo','node',['scripts/validation/validate_page_seo_contract.mjs',...(mode==='full'?['--full']:[])]]];const results=[];
for(const [id,cmd,args] of steps){const r=spawnSync(cmd,args,{stdio:'inherit',env});results.push({id,exit_code:r.status??2});if((r.status??2)!==0)break}
const summary={status:results.every(r=>r.exit_code===0)?'PASS':'FAIL',mode,elapsed_ms:Date.now()-started,steps:results};fs.mkdirSync('artifacts/validation',{recursive:true});fs.writeFileSync('artifacts/validation/incremental-page-audit.json',JSON.stringify(summary,null,2)+'\n');console.log(`[validate:incremental-page-audit] ${summary.status}: mode=${mode}; elapsed_ms=${summary.elapsed_ms}`);process.exit(summary.status==='PASS'?0:1)
