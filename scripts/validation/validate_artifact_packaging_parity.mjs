#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const contract=JSON.parse(fs.readFileSync('data/contracts/artifact_consistency_contract.json','utf8')); const root=process.env.REOPENED_ROOT||process.cwd(); const errors=[]; const checked=[];
for(const a of contract.artifacts){const exists=fs.existsSync(path.join(root,a.path)); checked.push({path:a.path,class:a.class,required:a.required_in_baseline_zip,exists}); if(a.required_in_baseline_zip&&!exists)errors.push(`missing packaged canonical artifact ${a.path}`); if(!a.required_in_baseline_zip&&!exists&&a.class==='PRESENTATION_ONLY')continue;}
fs.mkdirSync('artifacts/validation',{recursive:true}); fs.writeFileSync('artifacts/validation/artifact-packaging-parity.json',JSON.stringify({status:errors.length?'FAIL':'PASS',root,checked,errors},null,2)+'\n'); if(errors.length){console.error(errors.join('\n'));process.exit(1)} console.log('[validate:artifact-packaging-parity] PASS');
