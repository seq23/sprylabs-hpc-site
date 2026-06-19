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
    const full=path.join(dir,e.name); const rel=path.relative(base,full).split(path.sep).join('/');
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
const validatedBuild=snapshot(ROOT);
if(!fs.existsSync(path.join(ROOT,'node_modules'))) fail('[validate:clean-rebuild-parity] FAIL: node_modules missing; install dependencies first');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'spry-clean-copy-'));
try{
  copySource(ROOT,temp);
  fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(temp,'node_modules'),'dir');
  const r=spawnSync('npm',['run','build:all'],{cwd:temp,stdio:'inherit',env:{...process.env,CLEAN_REBUILD_PARITY:'1'}});
  if(r.status!==0) fail(`[validate:clean-rebuild-parity] FAIL: isolated clean-copy build exited ${r.status??'unknown'}`);
  const cleanBuild=snapshot(temp);
  const changed=compare(validatedBuild,cleanBuild);
  writeSummary('validate-clean-rebuild-parity',{
    status:changed.length?'FAIL':'PASS',
    validated_build_files:Object.keys(validatedBuild).length,
    clean_copy_build_files:Object.keys(cleanBuild).length,
    changed,
    proof:'validated full build compared with a separately copied full build',
  });
  if(changed.length) fail(`[validate:clean-rebuild-parity] FAIL: ${changed.length} public/distribution files differ between validated build and isolated clean-copy rebuild`,changed.slice(0,200));
  pass(`[validate:clean-rebuild-parity] OK: validated build and isolated clean-copy rebuild match ${Object.keys(cleanBuild).length} public/distribution files`);
}finally{
  if(process.env.KEEP_CLEAN_REBUILD_DIR==='1') console.log(`[validate:clean-rebuild-parity] retained ${temp}`);
  else fs.rmSync(temp,{recursive:true,force:true});
}
