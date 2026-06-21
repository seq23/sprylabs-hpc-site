import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readJson,fail,pass,writeSummary} from './common.mjs';
const zip=process.env.CANDIDATE_ZIP; if(!zip) fail('[validate:artifact-source-parity] CANDIDATE_ZIP is required');
const required=readJson('_baseline_packaging_contract.json').required_files; const entries=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split(/\n/).filter(Boolean); const wrapper=entries[0]?.split('/')[0]; const errors=[]; const hashes={};
for(const rel of required){const entry=`${wrapper}/${rel}`; if(!entries.includes(entry)){errors.push(`ZIP missing ${rel}`);continue;} const source=fs.readFileSync(rel); const zipped=execFileSync('unzip',['-p',zip,entry]); const a=crypto.createHash('sha256').update(source).digest('hex'); const b=crypto.createHash('sha256').update(zipped).digest('hex'); hashes[rel]={source:a,artifact:b}; if(a!==b) errors.push(`hash mismatch ${rel}`);}
writeSummary('validate-artifact-source-parity',{status:errors.length?'FAIL':'PASS',zip:path.resolve(zip),wrapper,hashes,errors}); if(errors.length)fail(`[validate:artifact-source-parity] FAIL: ${errors.length} issue(s)`,errors); pass(`[validate:artifact-source-parity] OK: ${required.length} critical files match the ZIP`);
