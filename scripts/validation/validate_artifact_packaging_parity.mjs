#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const contract=JSON.parse(fs.readFileSync('data/contracts/artifact_consistency_contract.json','utf8')); const root=process.env.REOPENED_ROOT||process.cwd(); const errors=[]; const checked=[];
// The contract's artifact list is the only thing that says what must be packaged.
// If it is empty the loop below checks no path, writes an empty `checked` array,
// and reports packaging parity as PASS without having looked for a single file.
if(!(contract.artifacts||[]).length){console.error('[validate:artifact-packaging-parity] FAIL: data/contracts/artifact_consistency_contract.json declares no artifacts; expected at least one artifact with required_in_baseline_zip. Checking zero paths proves nothing is packaged.');process.exit(1);}
for(const a of contract.artifacts){const exists=fs.existsSync(path.join(root,a.path)); checked.push({path:a.path,class:a.class,required:a.required_in_baseline_zip,exists}); if(a.required_in_baseline_zip&&!exists)errors.push(`missing packaged canonical artifact ${a.path}`); if(!a.required_in_baseline_zip&&!exists&&a.class==='PRESENTATION_ONLY')continue;}
fs.mkdirSync('artifacts/validation',{recursive:true}); fs.writeFileSync('artifacts/validation/artifact-packaging-parity.json',JSON.stringify({status:errors.length?'FAIL':'PASS',root,checked,errors},null,2)+'\n'); if(errors.length){console.error(errors.join('\n'));process.exit(1)} console.log('[validate:artifact-packaging-parity] PASS');
