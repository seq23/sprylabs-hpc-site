#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const ROOT=process.cwd(); const pub=path.resolve(ROOT,process.env.BHPC_PUBLIC_ROOT||'site/public');
function strip(html){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').toLowerCase().match(/[a-z0-9]{3,}/g)||[]}
function grams(a){const s=new Set();for(let i=0;i<a.length-2;i++)s.add(`${a[i]} ${a[i+1]} ${a[i+2]}`);return s}
function jac(a,b){let n=0;for(const x of a)if(b.has(x))n++;return n/Math.max(1,a.size+b.size-n)}
const files=fs.readdirSync(pub).filter(x=>/^synthesis-.*\.html$/i.test(x)).sort();const seen=[];let max=0,pair=[];const errors=[];
for(const f of files){const g=grams(strip(fs.readFileSync(path.join(pub,f),'utf8')));for(const p of seen){const v=jac(g,p.g);if(v>max){max=v;pair=[p.f,f]}if(v>=0.72)errors.push(`${p.f} <> ${f}: ${v.toFixed(4)}`)}seen.push({f,g})}
if(files.length!==36)errors.push(`expected source-truth synthesis count 36; got ${files.length}`);
const out={schema:'sprylabs-synthesis-differentiation-validation-v1',status:errors.length?'FAIL':'PASS',page_count:files.length,threshold:0.72,max_similarity:max,max_pair:pair,errors};fs.mkdirSync('artifacts/validation',{recursive:true});fs.writeFileSync('artifacts/validation/synthesis-differentiation.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));process.exit(errors.length?1:0);
