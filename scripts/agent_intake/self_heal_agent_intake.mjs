#!/usr/bin/env node
import {spawnSync} from 'node:child_process';

const commands=[
  ['npm',['run','agent:bhpc:compile-acceptance']],
  ['npm',['run','agent:bhpc:plan-exact']],
  ['npm',['run','authority:scale:prepare-scope']],
  ['npm',['run','authority:scale:restore']],
  ['npm',['run','agent:bhpc:apply-exact']],
  ['npm',['run','agent:bhpc:apply-links']],
  ['npm',['run','agent:bhpc:sync-extraction-contracts']],
  ['npm',['run','schema:repair-parity']]
];
for(const [command,args] of commands){const result=spawnSync(command,args,{stdio:'inherit',env:{...process.env,SCHEMA_REPAIR_SCOPE:'required'}});if(result.status!==0)process.exit(result.status||1)}
console.log('[agent-intake-self-heal] deterministic repair pass complete');
