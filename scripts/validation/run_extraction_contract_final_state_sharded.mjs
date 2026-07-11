#!/usr/bin/env node
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {ensureRuntime,managedPython} from './python_runtime.mjs';
ensureRuntime();
const shards=Math.max(1,Number(process.env.EXTRACTION_FINAL_SHARDS||8));
const dir='artifacts/validation';
for(const f of fs.readdirSync(dir)){if(f.startsWith('extraction-contract-final-state-shard-'))fs.rmSync(`${dir}/${f}`)}
const runs=[];
for(let i=0;i<shards;i++)runs.push(new Promise(resolve=>{
 const child=spawn(managedPython(),['scripts/validation/validate_extraction_contract_final_state.py'],{stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',EXTRACTION_FINAL_SHARD_COUNT:String(shards),EXTRACTION_FINAL_SHARD_INDEX:String(i)}});
 child.on('exit',code=>resolve({i,code:code??2}));
}));
const results=await Promise.all(runs);
const report={status:'PASS',audited:0,errors:[],warnings:[],types:{},rows:[],shards};
for(const {i,code} of results){const file=`${dir}/extraction-contract-final-state-shard-${i}.json`;if(!fs.existsSync(file)){report.errors.push({path:`shard-${i+1}`,error:`missing shard receipt; exit ${code}`});continue}const d=JSON.parse(fs.readFileSync(file,'utf8'));report.audited+=Number(d.audited||0);report.errors.push(...(d.errors||[]));report.warnings.push(...(d.warnings||[]));report.rows.push(...(d.rows||[]));for(const [k,v] of Object.entries(d.types||{}))report.types[k]=(report.types[k]||0)+Number(v||0)}
if(results.some(x=>x.code!==0)||report.errors.length)report.status='FAIL';
report.rows.sort((a,b)=>String(a.path).localeCompare(String(b.path)));
fs.writeFileSync(`${dir}/extraction-contract-final-state.json`,JSON.stringify(report,null,2)+'\n');
const howtoErrors=report.errors.filter(e=>e.declared_type==='howto');const howtoRows=report.rows.filter(r=>r.declared_type==='howto');
fs.writeFileSync(`${dir}/howto-extraction-audit.json`,JSON.stringify({status:howtoErrors.length?'FAIL':'PASS',rows:howtoRows,errors:howtoErrors},null,2)+'\n');
if(report.status==='FAIL'){console.error(`[validate:extraction-contract-final-state] FAIL: ${report.errors.length} issue(s)`);for(const e of report.errors.slice(0,100))console.error(' -',e.path,e.error);process.exit(1)}
console.log(`[validate:extraction-contract-final-state] PASS: ${report.audited} pages; types=${JSON.stringify(report.types)}; warnings=${report.warnings.length}; shards=${shards}`);
