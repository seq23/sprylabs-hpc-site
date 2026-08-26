import fs from 'node:fs';
import path from 'node:path';
import {readJson,fail,pass,writeSummary} from './common.mjs';
import {discover} from './validation_control_plane.mjs';

let registryDoc,matrixDoc;
try{registryDoc=readJson('_validation_registry.json');matrixDoc=readJson('_repo_validation_matrix.json');}
catch(e){fail('[validate:validation-registry] FAIL: malformed control-plane JSON',[e.message]);}
const registry=registryDoc.records||[]; const matrix=matrixDoc.entries||[]; const profiles=matrixDoc.profiles||{};
const errors=[]; const strongWarnings=[]; const warnings=[];
const coreRequired=['validation_id','status','name','proposed_severity','command','implementation_path'];
const metadataFields=['check_type','owning_lane','risk_prevented','existing_coverage_gap','scope','environment','proof_tier','positive_fixture','negative_fixture','evidence_output','runtime_budget_seconds','maintenance_owner','overlap_analysis','decision','decision_date','matrix_ids'];
const allowedStatus=new Set(['PROPOSED','ADMITTED','REJECTED','RETIRED','NOT_APPLICABLE']);
const allowedSeverity=new Set(['HARD_FAIL','STRONG_WARNING','WARNING','INFO','NOT_APPLICABLE']);
const ids=new Set(); const commandOwners=new Map(); const byId=new Map();
for(const r of registry){
 for(const f of coreRequired) if(r[f]===undefined||r[f]===null||(typeof r[f]==='string'&&!r[f].trim())) errors.push(`${r.validation_id||r.name||'unknown'}: missing core field ${f}`);
 for(const f of metadataFields) if(r[f]===undefined||r[f]===null||(typeof r[f]==='string'&&!r[f].trim())) strongWarnings.push(`${r.validation_id||r.name||'unknown'}: incomplete metadata ${f}`);
 if(ids.has(r.validation_id)) errors.push(`duplicate validation_id ${r.validation_id}`); ids.add(r.validation_id); byId.set(r.validation_id,r);
 if(commandOwners.has(r.command)) warnings.push(`duplicate command alias ${r.command}: ${commandOwners.get(r.command)} and ${r.validation_id}`); else commandOwners.set(r.command,r.validation_id);
 if(!allowedStatus.has(r.status)) errors.push(`${r.validation_id}: invalid status ${r.status}`);
 if(!allowedSeverity.has(r.proposed_severity)) errors.push(`${r.validation_id}: invalid severity ${r.proposed_severity}`);
 if(r.status==='NOT_APPLICABLE'&&!String(r.not_applicable_reason||'').trim()) strongWarnings.push(`${r.validation_id}: NOT_APPLICABLE lacks reason`);
 if(['ADMITTED','NOT_APPLICABLE'].includes(r.status)){
   if(!Array.isArray(r.matrix_ids)||r.matrix_ids.length===0) strongWarnings.push(`${r.validation_id}: active record missing matrix placement`);
   if(!fs.existsSync(r.implementation_path)) errors.push(`${r.validation_id}: admitted protection missing implementation ${r.implementation_path}`);
   else if(fs.statSync(r.implementation_path).isFile()&&fs.statSync(r.implementation_path).size===0) errors.push(`${r.validation_id}: zero-byte implementation ${r.implementation_path}`);
   for(const f of ['positive_fixture','negative_fixture']) if(r[f]&&!fs.existsSync(r[f])) strongWarnings.push(`${r.validation_id}: missing governance fixture ${r[f]}`);
 }
}
// An admitted validator that appears in no profile never runs. The matrix says
// it is HARD_FAIL and the registry reports the control plane safe, so it reads
// as protection that does not exist. That is not hypothetical: validate:
// coverage-route was written in July 2026 specifically to stop the /coverage/
// route regressing, was admitted at HARD_FAIL, and was placed in no profile -
// so the route 404'd for two months and a coverage.json carrying draft counts
// and the forward publishing runway shipped publicly the whole time.
//
// Reported as a strong warning rather than an error because several admitted
// entries are legitimately not profile steps: orchestrators that RUN a profile
// would recurse, and post-deploy audits need a live deployment. Reachability is
// computed transitively, so a validator invoked inside another step counts.
function profileReachableCommands(){
  const scripts=(()=>{try{return JSON.parse(fs.readFileSync('package.json','utf8')).scripts||{}}catch{return {}}})();
  const reached=new Set();
  const expand=(cmd,seen)=>{
    for(const name of String(cmd||'').match(/npm run [A-Za-z0-9:_-]+/g)||[]){
      const id=name.replace('npm run ','');
      if(seen.has(id)) continue;
      seen.add(id); reached.add(id);
      if(scripts[id]) expand(scripts[id],seen);
    }
  };
  for(const profile of Object.values(profiles)){
    for(const step of profile.steps||[]){
      reached.add(step.command);
      expand(step.command,new Set());
    }
  }
  return reached;
}
const reachable=profileReachableCommands();
const unreachable=matrix
  .filter(m=>m.status==='ADMITTED' && !String(m.command||'').endsWith('.yml'))
  .filter(m=>{
    const name=String(m.command||'').replace('npm run ','');
    return !reachable.has(name) && !reachable.has(m.command);
  })
  .map(m=>m.matrix_id);
if(unreachable.length) strongWarnings.push(`${unreachable.length} admitted matrix entr${unreachable.length===1?'y is':'ies are'} in no profile and never run: ${unreachable.slice(0,12).join(', ')}${unreachable.length>12?', ...':''}`);

const matrixIds=new Set(); const matrixByValidation=new Map();
for(const m of matrix){
 if(matrixIds.has(m.matrix_id)) errors.push(`duplicate matrix_id ${m.matrix_id}`); matrixIds.add(m.matrix_id);
 const r=byId.get(m.validation_id); if(!r) errors.push(`${m.matrix_id}: unknown registry validator ${m.validation_id}`); else {
   if(!['ADMITTED','NOT_APPLICABLE'].includes(r.status)) errors.push(`${m.matrix_id}: maps to non-active status ${r.status}`);
   if(m.command!==r.command) errors.push(`${m.matrix_id}: command conflict from ${r.validation_id}`);
   if(m.severity!==r.proposed_severity) errors.push(`${m.matrix_id}: severity conflict from ${r.validation_id}`);
 }
 if(matrixByValidation.has(m.validation_id)) warnings.push(`${m.validation_id}: multiple matrix placements`); matrixByValidation.set(m.validation_id,m);
}
for(const r of registry.filter(x=>['ADMITTED','NOT_APPLICABLE'].includes(x.status))) if(!matrixByValidation.has(r.validation_id)) strongWarnings.push(`${r.validation_id}: active registry record unused by matrix`);
const discovery=discover();
const unregisteredCommands=discovery.unregistered.map(x=>x.command);
const orphanedCommands=discovery.orphaned.map(x=>x.command);
for(const cmd of unregisteredCommands) strongWarnings.push(`executable package command not admitted: ${cmd}`);
for(const cmd of orphanedCommands) errors.push(`admitted package command does not resolve: ${cmd}`);
for(const wf of fs.readdirSync('.github/workflows').filter(x=>/\.ya?ml$/.test(x))){const cmd=path.posix.join('.github/workflows',wf); const r=registry.find(x=>x.command===cmd&&x.status==='ADMITTED'); if(!r) strongWarnings.push(`workflow admission metadata missing: ${cmd}`);}
for(const r of registry.filter(x=>x.status==='RETIRED')){
 if(discovery.discovered.some(x=>x.command===r.command)) errors.push(`${r.validation_id}: retired command still active in package scripts`);
 for(const wf of fs.readdirSync('.github/workflows').filter(x=>/\.ya?ml$/.test(x))){const text=fs.readFileSync(path.join('.github/workflows',wf),'utf8'); if(text.includes(r.command)) errors.push(`${r.validation_id}: retired command still called by ${wf}`);}
}
for(const [name,p] of Object.entries(profiles)){
 if(!Array.isArray(p.steps)) errors.push(`profile ${name}: steps must be an array`);
 for(const base of p.extends||[]) if(!profiles[base]) errors.push(`profile ${name}: unknown inherited profile ${base}`);
 for(const step of p.steps||[]) if(!step.command) errors.push(`profile ${name}: step missing command`);
}
const status=errors.length?'FAIL':strongWarnings.length?'PASS_WITH_STRONG_WARNING':warnings.length?'PASS_WITH_WARNING':'PASS';
writeSummary('validate-validation-registry',{status,registry_records:registry.length,matrix_entries:matrix.length,profiles:Object.keys(profiles).length,governed_package_commands:discovery.discovered.length,errors,strong_warnings:strongWarnings,warnings,unregistered_commands:unregisteredCommands,orphaned_commands:orphanedCommands});
if(errors.length) fail(`[validate:validation-registry] FAIL: ${errors.length} control-plane issue(s)`,errors.slice(0,200));
if(strongWarnings.length){console.log(`[validate:validation-registry] PASS_WITH_STRONG_WARNING: ${strongWarnings.length} administrative issue(s)`);for(const x of strongWarnings.slice(0,200))console.log(` - ${x}`);process.exit(0);}
if(warnings.length){console.log(`[validate:validation-registry] PASS_WITH_WARNING: ${warnings.length} issue(s)`);for(const x of warnings.slice(0,200))console.log(` - ${x}`);process.exit(0);}
pass(`[validate:validation-registry] PASS: ${registry.length} records, ${matrix.length} matrix entries, control plane safe`);
