#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fail,pass,writeSummary} from './common.mjs';

const ROOT=process.cwd();
const excludedTop=new Set(['.git','node_modules','artifacts','coverage','reports','.build','test-results','playwright-report','logs','releases']);
const snapshotSkip=new Set(['.git','node_modules','artifacts','coverage','reports','.build','test-results','playwright-report','logs','releases','data/answer_surface','data/answer_surface_monitoring','data/backlog','data/intake/source_ingestion','data/authority']);
const includeNames=new Set(['sitemap.xml','sitemap-spry.xml','sitemap-bhpc.xml','llms.txt','_redirects']);

function publicFiles(base,dir=base,out=[]){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,e.name);
    const rel=path.relative(base,full).split(path.sep).join('/');
    if(e.isDirectory()){
      if([...snapshotSkip].some(x=>rel===x||rel.startsWith(x+'/'))) continue;
      publicFiles(base,full,out);
    }else if(e.isFile()&&(e.name.endsWith('.html')||includeNames.has(rel)||rel.startsWith('data/citation/'))) out.push(rel);
  }
  return out.sort();
}
function hashFile(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function snapshot(base){const o={};for(const rel of publicFiles(base))o[rel]=hashFile(path.join(base,rel));return o;}
function compare(a,b){const changed=[];for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(a[k]!==b[k])changed.push(k);return changed.sort();}
function copySource(src,dst){
  fs.cpSync(src,dst,{recursive:true,filter:(source)=>{
    const rel=path.relative(src,source).split(path.sep).join('/');
    if(!rel) return true;
    return !excludedTop.has(rel.split('/')[0]);
  }});
}
function prepareCopy(label){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),`spry-clean-${label}-`));
  copySource(ROOT,temp);
  fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(temp,'node_modules'),'dir');
  return temp;
}
function runBuild(temp,label){
  const r=spawnSync('npm',['run','build:all'],{cwd:temp,stdio:'inherit',env:{...process.env,CLEAN_REBUILD_PARITY:'1'}});
  if(r.status!==0) fail(`[validate:clean-rebuild-parity] FAIL: isolated ${label} build exited ${r.status??'unknown'}`);
  return snapshot(temp);
}

if(!fs.existsSync(path.join(ROOT,'node_modules'))) fail('[validate:clean-rebuild-parity] FAIL: node_modules missing; install dependencies first');
const tempA=prepareCopy('a');
const tempB=prepareCopy('b');
try{
  const buildA=runBuild(tempA,'A');
  const buildB=runBuild(tempB,'B');
  const changed=compare(buildA,buildB);
  writeSummary('validate-clean-rebuild-parity',{
    status:changed.length?'FAIL':'PASS',
    build_a_files:Object.keys(buildA).length,
    build_b_files:Object.keys(buildB).length,
    changed,
    proof:'two independent clean-copy build:all executions compared across public/distribution files',
  });
  if(changed.length) fail(`[validate:clean-rebuild-parity] FAIL: ${changed.length} public/distribution files differ between two isolated clean-copy rebuilds`,changed.slice(0,200));
  pass(`[validate:clean-rebuild-parity] OK: two isolated clean-copy rebuilds match ${Object.keys(buildB).length} public/distribution files`);
}finally{
  if(process.env.KEEP_CLEAN_REBUILD_DIR==='1') console.log(`[validate:clean-rebuild-parity] retained ${tempA} and ${tempB}`);
  else { fs.rmSync(tempA,{recursive:true,force:true}); fs.rmSync(tempB,{recursive:true,force:true}); }
}
