import fs from 'node:fs';
import path from 'node:path';
const root='artifacts/diagnostics'; const summaries=[];
function walk(dir){if(!fs.existsSync(dir))return; for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name); if(e.isDirectory())walk(p); else if(e.name==='summary.json'){try{summaries.push(JSON.parse(fs.readFileSync(p,'utf8')))}catch{}}}}
walk(root); const failed=summaries.filter(x=>x.status==='FAIL');
const report={generated_at:new Date().toISOString(),repo:'sprylabs-hpc-site',proof_records:summaries.length,failed_records:failed.length,status:failed.length?'PARTIAL':'STRUCTURALLY_CHECKED',summaries};
fs.mkdirSync('artifacts/diagnostics/release-report',{recursive:true}); fs.writeFileSync('artifacts/diagnostics/release-report/summary.json',JSON.stringify(report,null,2)+'\n');
console.log(`[release:report] ${report.status}: ${summaries.length} proof records, ${failed.length} failures`); if(failed.length)process.exit(1);
