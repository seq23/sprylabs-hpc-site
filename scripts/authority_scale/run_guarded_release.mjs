#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);
function run(cmd,a){const r=spawnSync(cmd,a,{stdio:'inherit',env:process.env});if((r.status??1)!==0)process.exit(r.status??1);}
run('npm',['run','authority:scale:fanout']);
run('npm',['run','authority:scale:prepare-scope']);
run('npm',['run','authority:scale:restore']);
run('node',['scripts/workflow/run_topology_lane.mjs','--lane','spry-content-release',...args]);
run('npm',['run','authority:scale:freeze']);
run('npm',['run','authority:scale:clear-scope']);
run('npm',['run','validate:authority-scale']);
run('npm',['run','validate:kpi-truth']);
