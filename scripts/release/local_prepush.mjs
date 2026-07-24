#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
const major=Number(process.versions.node.split('.')[0]);
console.log(`[release-profile] environment=local profile=release:prepush:local node=${major} browser_required=true`);
function run(cmd,args){const r=spawnSync(cmd,args,{stdio:'inherit',env:{...process.env,RELEASE_EXECUTION_ENV:'local'}});if(r.status!==0)process.exit(r.status??1);}
run('npm',['run','release:prepush:container']);
run('node',['scripts/validation/environment_doctor.mjs','--require-browser']);
run('npm',['run','release:local-visual-proof']);
