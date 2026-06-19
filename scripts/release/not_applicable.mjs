import fs from 'node:fs';
const stage=process.argv[2]||'stage'; fs.mkdirSync('artifacts/diagnostics/not-applicable',{recursive:true});
const reasons={
 'authenticated-click-audit':'Public static site; no authenticated routes exist.',
 'role-click-audit':'Public static site; no role-specific routes exist.',
 'live-provider-proof':'No live provider mutation or persistence workflow exists.',
 'cleanup':'No live proof fixtures are created by this static-site lifecycle.',
 'postcleanup-integrity':'No live proof fixtures exist; cleanup integrity is not applicable.'
};
const reason=reasons[stage]||'Stage is not applicable to this repository profile.';
fs.writeFileSync(`artifacts/diagnostics/not-applicable/${stage}.json`,JSON.stringify({stage,status:'NOT_APPLICABLE',reason,generated_at:new Date().toISOString()},null,2)+'\n');
console.log(`[${stage}] NOT APPLICABLE: ${reason}`);
