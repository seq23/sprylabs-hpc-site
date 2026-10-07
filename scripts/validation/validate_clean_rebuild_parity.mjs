#!/usr/bin/env node
/**
 * validate:clean-rebuild-parity — `npm run build:all` must be REPRODUCIBLE:
 * two fresh clones of the same commit, built independently, must leave every
 * tracked file (and every new, non-ignored file) byte-identical.
 *
 * WHY THIS IS STRICTER THAN IT WAS (7 Oct 2026). The earlier version passed while
 * a fresh clone produced different output, for three reasons:
 *   1. It copied the WORKING TREE (untracked and ignored files included, and the
 *      .build-cache), so it could not see a build that relied on an untracked
 *      file, and a warm build cache let both copies "build" by restoring the same
 *      bytes without running a generator.
 *   2. It compared only *.html, the sitemaps, llms.txt, _redirects and
 *      data/citation/, skipping data/, reports/ and artifacts/ - exactly where
 *      ~50 tracked files carried a wall-clock generated_at (fixed at source by
 *      scripts/lib/build_clock.cjs) and an absolute interpreter path
 *      (artifacts/validation/python-runtime.json, fixed in python_runtime.mjs).
 *   3. It hid generated_at in two files behind a semantic-JSON allowlist.
 *
 * NOW: each build runs in its own `git fetch` of HEAD (full history, which the
 * lastmod ledger reads; no untracked file can leak in), with the build cache
 * disabled, and afterwards `git add -A` + `git ls-files -s` gives the blob hash
 * of every tracked and new non-ignored path. The two manifests must be equal,
 * byte for byte, with no allowlist. The public-file snapshot (every *.html plus
 * the sitemaps, llms.txt, _redirects, data/citation/) is still compared too,
 * now strictly, ignored outputs included.
 *
 * RULE 0: a build that exits non-zero, or a manifest with fewer than
 * MIN_HTML_FILES pages, fails rather than passing as "two empty builds agree".
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fail,pass,writeSummary} from './common.mjs';

const LABEL='[validate:clean-rebuild-parity]';
const git=(cwd,args,opts={})=>{
  const r=spawnSync('git',args,{cwd,encoding:'utf8',maxBuffer:1<<28,...opts});
  if(r.status!==0) fail(`${LABEL} FAIL: git ${args.join(' ')} exited ${r.status}: ${(r.stderr||'').trim().slice(0,400)}`);
  return r.stdout;
};
const ROOT=git(process.cwd(),['rev-parse','--show-toplevel']).trim();
const HEAD=git(ROOT,['rev-parse','HEAD']).trim();
const MIN_HTML_FILES=Number(process.env.CLEAN_REBUILD_MIN_HTML||1000);

const snapshotSkip=['.git','.pages-output','node_modules','coverage','test-results','playwright-report','logs','releases','.validation-runtime','.build-cache'];
const includeNames=new Set(['sitemap.xml','sitemap-spry.xml','sitemap-bhpc.xml','llms.txt','_redirects']);

function publicFiles(base,dir=base,out=[]){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,e.name);
    const rel=path.relative(base,full).split(path.sep).join('/');
    if(e.isDirectory()){
      if(snapshotSkip.some(x=>rel===x||rel.startsWith(x+'/'))) continue;
      publicFiles(base,full,out);
    }else if(e.isFile()&&(e.name.endsWith('.html')||includeNames.has(rel)||rel.startsWith('data/citation/'))) out.push(rel);
  }
  return out.sort();
}
const hashFile=(f)=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function publicSnapshot(base){
  const o={};
  for(const rel of publicFiles(base)) o[rel]=hashFile(path.join(base,rel));
  return o;
}
/** path -> blob id for every tracked and new non-ignored file after the build. */
function treeManifest(base){
  // node_modules is a symlink here, which the `node_modules/` ignore rule (a directory rule) does not match.
  git(base,['add','-A','--','.',':(exclude)node_modules']);
  const o={};
  for(const rec of git(base,['ls-files','-s','-z']).split('\0')){
    if(!rec) continue;
    const m=rec.match(/^(\d+) ([0-9a-f]+) \d\t(.*)$/s);
    if(m) o[m[3]]=`${m[1]}:${m[2]}`;
  }
  return o;
}
function headManifest(base){
  const o={};
  for(const rec of git(base,['ls-tree','-r','-z','HEAD']).split('\0')){
    if(!rec) continue;
    const m=rec.match(/^(\d+) blob ([0-9a-f]+)\t(.*)$/s);
    if(m) o[m[3]]=`${m[1]}:${m[2]}`;
  }
  return o;
}
function compare(a,b){
  const changed=[];
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])) if(a[k]!==b[k]) changed.push(k);
  return changed.sort();
}
function prepareClone(label){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),`spry-clean-${label}-`));
  git(temp,['init','--quiet']);
  git(temp,['fetch','--quiet','--no-tags',ROOT,HEAD]);
  git(temp,['-c','advice.detachedHead=false','checkout','--quiet','--detach',HEAD]);
  // Same identity everywhere so a generator that commits or reads config cannot diverge.
  git(temp,['config','user.name','clean-rebuild-parity']);
  git(temp,['config','user.email','clean-rebuild-parity@invalid']);
  // Dependencies come from the lockfile install in ROOT; they are not part of the source.
  fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(temp,'node_modules'),'dir');
  return temp;
}
function runBuild(temp,label){
  const r=spawnSync('npm',['run','build:all'],{cwd:temp,stdio:'inherit',env:{...process.env,CLEAN_REBUILD_PARITY:'1',BUILD_ALL_CACHE_DISABLE:'1'}});
  if(r.status!==0) fail(`${LABEL} FAIL: isolated ${label} build exited ${r.status??'unknown'}`);
  const pub=publicSnapshot(temp);
  return {pub,tree:treeManifest(temp)};
}

if(!fs.existsSync(path.join(ROOT,'node_modules'))) fail(`${LABEL} FAIL: node_modules missing; install dependencies first`);
const tempA=prepareClone('a');
const tempB=prepareClone('b');
try{
  const a=runBuild(tempA,'A');
  const b=runBuild(tempB,'B');
  const htmlA=Object.keys(a.tree).filter(k=>k.endsWith('.html')).length;
  const htmlB=Object.keys(b.tree).filter(k=>k.endsWith('.html')).length;
  if(htmlA<MIN_HTML_FILES||htmlB<MIN_HTML_FILES||!Object.keys(a.pub).length||!Object.keys(b.pub).length){
    fail(`${LABEL} FAIL: Rule 0 - a clean-clone build left too little to compare (html A=${htmlA}, B=${htmlB}, public A=${Object.keys(a.pub).length}, B=${Object.keys(b.pub).length}; floor ${MIN_HTML_FILES} pages)`);
  }
  const treeChanged=compare(a.tree,b.tree);
  const pubChanged=compare(a.pub,b.pub);
  const vsHead=compare(headManifest(tempA),a.tree);
  writeSummary('validate-clean-rebuild-parity',{
    status:treeChanged.length||pubChanged.length?'FAIL':'PASS',
    head:HEAD,
    tracked_files_a:Object.keys(a.tree).length,
    tracked_files_b:Object.keys(b.tree).length,
    public_files:Object.keys(b.pub).length,
    tracked_changed:treeChanged,
    public_changed:pubChanged,
    build_changed_vs_head:vsHead.length,
    build_changed_vs_head_sample:vsHead.slice(0,50),
    proof:'two fresh git clones of HEAD, build cache disabled, each built with npm run build:all; every tracked and new non-ignored file compared by blob id, every public file by sha256, no allowlist',
  });
  console.log(`${LABEL} note: the build rewrote ${vsHead.length} tracked path(s) relative to HEAD (identically in both clones when the check passes)`);
  if(treeChanged.length||pubChanged.length){
    fail(`${LABEL} FAIL: build:all is not reproducible - ${treeChanged.length} tracked and ${pubChanged.length} public file(s) differ between two fresh clones of ${HEAD.slice(0,9)}`,[...new Set([...treeChanged,...pubChanged])].slice(0,200));
  }
  pass(`${LABEL} OK: two fresh clones of ${HEAD.slice(0,9)} built identically: ${Object.keys(b.tree).length} tracked files (${htmlB} pages) and ${Object.keys(b.pub).length} public files, byte for byte`);
}finally{
  if(process.env.KEEP_CLEAN_REBUILD_DIR==='1') console.log(`${LABEL} retained ${tempA} and ${tempB}`);
  else { fs.rmSync(tempA,{recursive:true,force:true}); fs.rmSync(tempB,{recursive:true,force:true}); }
}
