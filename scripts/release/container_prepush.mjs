#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
const major=Number(process.versions.node.split('.')[0]);
process.env.PYTHONDONTWRITEBYTECODE='1';
console.log(`[release-profile] environment=container profile=container-prepush node=${major}`);
const r=spawnSync('npm',['run','validate:profile','--','container-prepush'],{stdio:'inherit',env:process.env});
process.exit(r.status??2);
