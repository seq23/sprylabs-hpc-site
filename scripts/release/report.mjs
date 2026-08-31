import fs from 'node:fs';
import path from 'node:path';
const root='artifacts/diagnostics'; const summaries=[];
function walk(dir){if(!fs.existsSync(dir))return; for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name); if(e.isDirectory())walk(p); else if(e.name==='summary.json'){try{summaries.push(JSON.parse(fs.readFileSync(p,'utf8')))}catch{}}}}
walk(root); const failed=summaries.filter(x=>x.status==='FAIL');
// Rule 0: this is a HARD_FAIL, release_effect stage. With no summary.json under
// artifacts/diagnostics it aggregated nothing and still printed
// `STRUCTURALLY_CHECKED: 0 proof records` and exited 0 - reproduced by running it
// in a directory with no artifacts/diagnostics. artifacts/diagnostics is
// gitignored, so "empty" is the state of any tree where the release lifecycle has
// not actually run. A report that gathered no proof has attested to nothing, and
// there is no configuration under which a release is legitimately proof-free, so
// this is a named hard failure rather than a stop.
const stop_reason=summaries.length===0?{code:'NO_PROOF_RECORDS_AGGREGATED',message:'No summary.json was found anywhere under artifacts/diagnostics, so this report aggregated zero proof records. It has attested to nothing. Run the release lifecycle (npm run release:ci-validate / release:prepush) before release:report; a release report over an empty proof set must not read as STRUCTURALLY_CHECKED.'}:null;
const report={generated_at:new Date().toISOString(),repo:'sprylabs-hpc-site',proof_records:summaries.length,failed_records:failed.length,status:stop_reason?'NO_PROOF':failed.length?'PARTIAL':'STRUCTURALLY_CHECKED',stop_reason,summaries};
fs.mkdirSync('artifacts/diagnostics/release-report',{recursive:true}); fs.writeFileSync('artifacts/diagnostics/release-report/summary.json',JSON.stringify(report,null,2)+'\n');
if(stop_reason){console.error(`[release:report] ${stop_reason.code}: ${stop_reason.message}`);process.exit(1);}
console.log(`[release:report] ${report.status}: ${summaries.length} proof records, ${failed.length} failures`); if(failed.length)process.exit(1);
