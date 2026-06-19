#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
const major=Number(process.versions.node.split('.')[0]);
console.log(`[release-profile] environment=container profile=release:prepush:container node=${major}`);
function run(args){const r=spawnSync('npm',args,{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status??1);}
run(['run','build:all']);
run(['run','validate:all']);
