#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,CFG,PUBLIC_ROOT,STATE_FILE,readState,writeState,rm} from './lib.mjs';
const state=readState();
if(!state?.active){console.log('[site-layout] no active stage');process.exit(0)}
if((state.depth||1)>1){state.depth-=1;writeState(state);console.log(`[site-layout] nested collect depth=${state.depth}`);process.exit(0)}
const compat=new Set(CFG.deploy_root_compat_entries||[]);
const publicSet=new Set((state.public_entries||CFG.public_entries).filter(name=>!compat.has(name)));
for(const name of publicSet){
  const rootPath=path.join(ROOT,name), srcPath=path.join(PUBLIC_ROOT,name);
  const st=fs.lstatSync(rootPath,{throwIfNoEntry:false});
  if(!st){
    // A staged symlink removed by a generator represents an intentional deletion.
    rm(srcPath); continue;
  }
  if(st.isSymbolicLink()){
    fs.unlinkSync(rootPath); continue;
  }
  // A generator replaced the symlink with a real file/dir. Persist it into source.
  rm(srcPath); fs.renameSync(rootPath,srcPath);
}
// Collect newly-created public-like root entries without swallowing control-plane artifacts.
const before=new Set(state.root_entries_before||[]);
const controls=new Set(CFG.control_root_entries||[]);
for(const name of fs.readdirSync(ROOT)){
  if(before.has(name)||controls.has(name)||name==='node_modules'||name==='.git'||name==='dist'||name==='site'||name.startsWith('.')) continue;
  const p=path.join(ROOT,name); if(p===STATE_FILE) continue;
  const st=fs.lstatSync(p);
  const pageLike=st.isDirectory() || /\.(html?|xml|txt|ico|webmanifest|json)$/i.test(name) || name.startsWith('_');
  if(!pageLike) continue;
  const dst=path.join(PUBLIC_ROOT,name); rm(dst); fs.renameSync(p,dst);
  if(!CFG.public_entries.includes(name)) CFG.public_entries.push(name);
}
CFG.public_entries.sort();
fs.writeFileSync(path.join(ROOT,'config/site_layout.json'),JSON.stringify(CFG,null,2)+'\n');
fs.rmSync(STATE_FILE,{force:true});
console.log(`[site-layout] collected public root; entries=${CFG.public_entries.length}`);
