#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT=process.cwd();
const sha=process.env.VALIDATED_COMMIT_SHA||spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).stdout?.trim()||'';
const commands=[['agent:bhpc:verify-idempotency',{}],['release:ci-validate',{VALIDATED_COMMIT_SHA:sha}]];
const results=[];
for(const [script,extra] of commands){const result=spawnSync('npm',['run',script],{cwd:ROOT,stdio:'inherit',env:{...process.env,...extra}});results.push({script,status:result.status});if(result.status!==0)break}
const diff=spawnSync('git',['diff','--name-only','HEAD'],{cwd:ROOT,encoding:'utf8'});
const changed=String(diff.stdout||'').trim().split(/\r?\n/).filter(Boolean);
const allowed=/^(?:artifacts\/validation|reports\/|build\/|dist\/|\.validation-runtime\/)/;
const unsafe=changed.filter(rel=>!allowed.test(rel));
const status=results.every(x=>x.status===0)&&unsafe.length===0?'PASS':'FAIL';
const report={schema_version:'1.0',generated_at:new Date().toISOString(),status,validated_commit_sha:sha,commands:results,post_validation_changed_paths:changed,unsafe_post_validation_changes:unsafe};
const abs=path.join(ROOT,'artifacts/validation/agent-intake-push-gate.json');fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,JSON.stringify(report,null,2)+'\n');
console.log(`[agent-intake-push-gate] ${status}: sha=${sha}; unsafe_changes=${unsafe.length}`);
if(status!=='PASS')process.exit(1);
