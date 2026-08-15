#!/usr/bin/env node
import {spawnSync} from 'node:child_process';

const major=Number(process.versions.node.split('.')[0]);
process.env.PYTHONDONTWRITEBYTECODE='1';

function sanitizedEnv(){
  const env={...process.env,PYTHONDONTWRITEBYTECODE:'1'};
  delete env.NODE_V8_COVERAGE;
  return env;
}

console.log(`[release-profile] environment=container profile=container-prepush node=${major}`);
const r=spawnSync('npm',['run','validate:profile','--','container-prepush'],{stdio:'inherit',env:sanitizedEnv()});
if((r.status??2)!==0) process.exit(r.status??2);
console.log('[release-profile] final source/dist parity');
const parity=spawnSync('npm',['run','validate:site-layout'],{stdio:'inherit',env:sanitizedEnv()});
if((parity.status??2)!==0) process.exit(parity.status??2);
process.exit(0);
