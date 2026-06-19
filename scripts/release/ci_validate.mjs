#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
console.log(`[release-profile] environment=github-actions profile=release:ci-validate node=${process.versions.node.split('.')[0]}`);
function run(args){const r=spawnSync('npm',args,{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status??1);}
run(['run','release:prepush:container']);
run(['run','validate:warnings']);
run(['run','validate:clean-rebuild-parity']);
run(['run','release:create-attestation']);
