import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {readJson,fail,pass,writeSummary} from './common.mjs';
// Absent input is a NAMED STOP, not a failure. This check reopens a packaged
// release ZIP; with no ZIP there is nothing to reopen, and that is a legitimate
// state, not a finding. It used to exit non-zero on the missing input, which is
// why its matrix exclusion was recorded as "fails on the current tree - real
// finding, not yet triaged" and stayed parked: the exit code could not tell
// "this release artifact is broken" apart from "you did not give me one".
const zip=process.env.CANDIDATE_ZIP;
if(!zip){
  writeSummary('validate-reopened-baseline',{status:'SKIPPED',stop_reason:{code:'no_candidate_zip',message:'CANDIDATE_ZIP is not set, so there is no packaged release artifact to reopen. This is an absent input, not a defect in the tree.'},errors:[]});
  console.log('[validate:reopened-baseline] SKIPPED no_candidate_zip: CANDIDATE_ZIP is not set, so there is no packaged release artifact to reopen. Set CANDIDATE_ZIP to the release ZIP to run this check.');
  process.exit(0);
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sprylabs-reopen-')); execFileSync('unzip',['-q',path.resolve(zip),'-d',temp]); const entries=fs.readdirSync(temp); if(entries.length!==1) fail('[validate:reopened-baseline] ZIP must contain one repository wrapper'); const root=path.join(temp,entries[0]); const req=JSON.parse(fs.readFileSync(path.join(root,'_baseline_packaging_contract.json'),'utf8')).required_files; const errors=req.filter(x=>!fs.existsSync(path.join(root,x))).map(x=>`missing ${x}`);
if(!errors.length&&process.env.REOPENED_RUN_VALIDATION==='1'){
 let r=spawnSync('npm',['ci','--ignore-scripts'],{cwd:root,stdio:'inherit',env:{...process.env,NODE_OPTIONS:'--max-old-space-size=3072'}}); if(r.status!==0)errors.push('npm ci failed in reopened artifact');
 if(!errors.length){r=spawnSync('npm',['run','release:prepush:container'],{cwd:root,stdio:'inherit',env:{...process.env,NODE_OPTIONS:'--max-old-space-size=3072'}}); if(r.status!==0)errors.push('container prepush failed in reopened artifact');}
}
writeSummary('validate-reopened-baseline',{status:errors.length?'FAIL':'PASS',zip:path.resolve(zip),reopened_root:root,full_validation:process.env.REOPENED_RUN_VALIDATION==='1',errors});
if(errors.length)fail(`[validate:reopened-baseline] FAIL: ${errors.length} issue(s)`,errors); pass(`[validate:reopened-baseline] OK: reopened ZIP structure${process.env.REOPENED_RUN_VALIDATION==='1'?' and container prepush':''}`);
