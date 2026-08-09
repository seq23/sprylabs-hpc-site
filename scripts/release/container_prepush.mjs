#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
const major=Number(process.versions.node.split('.')[0]);
process.env.PYTHONDONTWRITEBYTECODE='1';
console.log(`[release-profile] environment=container profile=container-prepush node=${major}`);
const r=spawnSync('npm',['run','validate:profile','--','container-prepush'],{stdio:'inherit',env:process.env});
if((r.status??2)!==0) process.exit(r.status??2);
console.log('[release-profile] final source/dist parity');
const parity=spawnSync('npm',['run','validate:site-layout'],{stdio:'inherit',env:process.env});
process.exit(parity.status??2);
