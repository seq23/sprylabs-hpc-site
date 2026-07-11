#!/usr/bin/env node
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {ensureRuntime,managedPython} from './python_runtime.mjs';
ensureRuntime();
const shards=Math.max(1,Number(process.env.SCHEMA_PARITY_SHARDS||8));
const dir='artifacts/diagnostics/container-current/validate-rendered-schema-parity';
fs.mkdirSync(dir,{recursive:true});
for(const f of fs.readdirSync(dir)){if(f.startsWith('summary-shard-'))fs.rmSync(`${dir}/${f}`)}
const runs=[];
for(let i=0;i<shards;i++)runs.push(new Promise(resolve=>{
 const child=spawn(managedPython(),['scripts/validation/validate_rendered_schema_parity.py'],{stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',SCHEMA_PARITY_SHARD_COUNT:String(shards),SCHEMA_PARITY_SHARD_INDEX:String(i)}});
 child.on('exit',code=>resolve({i,code:code??2}));
}));
const results=await Promise.all(runs);
const counts={pages:0,faq_pages:0,howto_pages:0,breadcrumb_pages:0,article_pages:0};const errors=[];
for(const {i,code} of results){const file=`${dir}/summary-shard-${i}.json`;if(fs.existsSync(file)){const d=JSON.parse(fs.readFileSync(file,'utf8'));for(const k of Object.keys(counts))counts[k]+=Number(d.counts?.[k]||0);errors.push(...(d.errors||[]));}else errors.push(`shard ${i+1} produced no receipt (exit ${code})`)}
const status=results.some(x=>x.code!==0)||errors.length?'FAIL':'PASS';
fs.writeFileSync(`${dir}/summary.json`,JSON.stringify({status,shards,counts,errors},null,2)+'\n');
if(status==='FAIL'){console.error(`[validate:rendered-schema-parity] FAIL: ${errors.length} issue(s)`);for(const e of errors.slice(0,100))console.error(' -',e);process.exit(1)}
console.log(`[validate:rendered-schema-parity] OK: ${counts.pages} pages; FAQ=${counts.faq_pages}, HowTo=${counts.howto_pages}, Breadcrumb=${counts.breadcrumb_pages}, Article=${counts.article_pages}; shards=${shards}`);
