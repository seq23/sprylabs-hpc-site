#!/usr/bin/env node
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2); const cut=args.indexOf('--');
if(cut<0||!args[cut+1]){console.error('usage: run_with_public_root.mjs -- <command> [args...]');process.exit(64)}
const cmd=args[cut+1], cmdArgs=args.slice(cut+2);
function runNode(script){const r=spawnSync(process.execPath,[script],{stdio:'inherit',env:process.env});if((r.status??1)!==0)throw new Error(`${script} failed ${r.status}`)}
let status=1;
try{
  runNode('scripts/site_layout/stage_public_root.mjs');
  const r=spawnSync(cmd,cmdArgs,{stdio:'inherit',env:{...process.env,BHPC_PUBLIC_ROOT:'.',BHPC_DEPLOY_ROOT:'.',BHPC_LAYOUT_STAGE_ACTIVE:'1'}});
  status=r.status??1;
} finally {
  try{runNode('scripts/site_layout/collect_public_root.mjs')}catch(e){console.error(e.message);status=1}
  if(!fs.existsSync('.build/site-layout-stage.json')){
    try{runNode('scripts/site_layout/build_dist.mjs')}catch(e){console.error(e.message);status=1}
  }else{
    console.log('[site-layout] nested stage: dist rebuild deferred to outer boundary');
  }
}
process.exit(status);
