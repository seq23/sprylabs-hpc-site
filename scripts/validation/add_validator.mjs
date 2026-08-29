#!/usr/bin/env node
import fs from 'node:fs';
const args=process.argv.slice(2); const get=k=>{const i=args.indexOf(`--${k}`);return i>=0?args[i+1]:null};
const id=get('id'),command=get('command'),severity=get('severity')||'STRONG_WARNING',profiles=(get('profiles')||'').split(',').filter(Boolean);
const exclusionReason=get('exclusion-reason');
if(!id||!command){console.error('usage: --id ID --command "npm run ..." [--severity ...] (--profiles a,b | --exclusion-reason "why this is deliberately not a profile step")');process.exit(2)}
// A validator admitted into the registry and the matrix but placed in no profile
// never executes, while the control plane reports it as active protection. That
// is not hypothetical: validate:coverage-route was admitted at HARD_FAIL into no
// profile and the route it guarded 404'd for two months. This tool used to
// produce exactly that state and print PASS, because --profiles was optional and
// defaulted to none. Admission now requires either arming (--profiles) or a
// recorded reason for not arming (--exclusion-reason), which is written into
// profile_exclusions where validate:validation-registry can see it.
if(!profiles.length&&!exclusionReason){
  console.error(`[validation:add] REFUSED: ${id} would be admitted into the registry and the matrix but placed in no profile, so it would never run while reporting as active protection.`);
  console.error('Pass --profiles <name[,name]> to arm it, or --exclusion-reason "<why it is deliberately not a profile step>" to record the exception.');
  process.exit(2);
}
if(profiles.length&&exclusionReason){
  console.error('[validation:add] REFUSED: --profiles and --exclusion-reason are mutually exclusive; a validator is either armed or deliberately excluded.');
  process.exit(2);
}
const reg=JSON.parse(fs.readFileSync('_validation_registry.json','utf8')); const matrix=JSON.parse(fs.readFileSync('_repo_validation_matrix.json','utf8'));
if(reg.records.some(r=>r.validation_id===id||r.command===command)){console.error('validator id or command already exists');process.exit(1)}
const scriptName=command.startsWith('npm run ')?command.slice(8):''; const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); if(scriptName&&!pkg.scripts?.[scriptName]){console.error(`command does not resolve: ${command}`);process.exit(1)}
const n=Math.max(0,...matrix.entries.map(x=>Number(String(x.matrix_id).replace(/\D/g,''))||0))+1; const mx=`MX-${String(n).padStart(3,'0')}`;
reg.records.push({validation_id:id,status:'ADMITTED',name:scriptName||id,check_type:'validator',owning_lane:'validation-control-plane',risk_prevented:'Declared validator protection.',existing_coverage_gap:'Atomic registration prevents package/registry/matrix drift.',scope:['repository'],proposed_severity:severity,command,implementation_path:'package.json',environment:'container',proof_tier:1,positive_fixture:'fixtures/validation/repo/pass.json',negative_fixture:'fixtures/validation/repo/fail.json',evidence_output:`artifacts/diagnostics/<run-id>/${scriptName.replace(/:/g,'-')}/summary.json`,runtime_budget_seconds:300,maintenance_owner:'repo',overlap_analysis:[],retirement_offset:null,decision:'Atomically admitted by validation:add.',decision_date:new Date().toISOString().slice(0,10),matrix_ids:[mx],not_applicable_reason:null});
matrix.entries.push({matrix_id:mx,validation_id:id,lane:'validation-control-plane',command,order:n,severity,release_effect:severity==='HARD_FAIL',status:'ADMITTED'});
for(const p of profiles){if(!matrix.profiles?.[p]){console.error(`unknown profile ${p}`);process.exit(1)} matrix.profiles[p].steps.push({id,command});}
if(exclusionReason){matrix.profile_exclusions=matrix.profile_exclusions||{}; matrix.profile_exclusions[mx]=exclusionReason;}
reg.record_count=reg.records.length; matrix.entry_count=matrix.entries.length; fs.writeFileSync('_validation_registry.json',JSON.stringify(reg,null,2)+'\n');fs.writeFileSync('_repo_validation_matrix.json',JSON.stringify(matrix,null,2)+'\n');console.log(`[validation:add] PASS: ${id} -> ${command} (${mx}; ${profiles.length?`armed in profile(s): ${profiles.join(', ')}`:`excluded from every profile, reason recorded: ${exclusionReason}`})`);
