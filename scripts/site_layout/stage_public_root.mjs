#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,CFG,PUBLIC_ROOT,DIST_ROOT,readState,writeState,rm} from './lib.mjs';
const existing=readState();
if(existing?.active){existing.depth=(existing.depth||1)+1;writeState(existing);console.log(`[site-layout] nested stage depth=${existing.depth}`);process.exit(0)}
const before=fs.readdirSync(ROOT).sort();
rm(DIST_ROOT);
const compat=new Set(CFG.deploy_root_compat_entries||[]);
const moved=[];
for(const name of CFG.public_entries){
  if(compat.has(name)) continue;
  const src=path.join(PUBLIC_ROOT,name), dst=path.join(ROOT,name);
  if(!fs.existsSync(src)) continue;
  if(fs.lstatSync(dst,{throwIfNoEntry:false})) throw new Error(`public staging collision at root: ${name}`);
  fs.renameSync(src,dst); moved.push(name);
}
writeState({schema_version:'2.0',active:true,depth:1,started_at:new Date().toISOString(),root_entries_before:before,public_entries:moved,stage_mode:'move'});
console.log(`[site-layout] staged ${moved.length} real public root entries; compat=${compat.size}`);
