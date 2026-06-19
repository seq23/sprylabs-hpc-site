import fs from 'node:fs';
import path from 'node:path';
import {readJson,fail,pass,writeSummary} from './common.mjs';
const registry=readJson('_validation_registry.json').records||[];
const matrix=readJson('_repo_validation_matrix.json').entries||[];
const pkg=readJson('package.json');
const errors=[];
const required=['validation_id','status','name','check_type','owning_lane','risk_prevented','existing_coverage_gap','scope','proposed_severity','command','implementation_path','environment','proof_tier','positive_fixture','negative_fixture','evidence_output','runtime_budget_seconds','maintenance_owner','overlap_analysis','decision','decision_date','matrix_ids'];
const allowedStatus=new Set(['PROPOSED','ADMITTED','REJECTED','RETIRED','NOT_APPLICABLE']);
const allowedSeverity=new Set(['HARD_FAIL','STRONG_WARNING','WARNING','INFO','NOT_APPLICABLE']);
const ids=new Set(); const commands=new Set(); const byId=new Map();
for(const r of registry){
  for(const f of required) if(r[f]===undefined||r[f]===null||(typeof r[f]==='string'&&!r[f].trim())) errors.push(`${r.validation_id||r.name||'unknown'}: missing ${f}`);
  if(ids.has(r.validation_id)) errors.push(`duplicate validation_id ${r.validation_id}`); ids.add(r.validation_id); byId.set(r.validation_id,r);
  if(commands.has(r.command)) errors.push(`duplicate command ${r.command}`); commands.add(r.command);
  if(!allowedStatus.has(r.status)) errors.push(`${r.validation_id}: invalid status ${r.status}`);
  if(!allowedSeverity.has(r.proposed_severity)) errors.push(`${r.validation_id}: invalid severity ${r.proposed_severity}`);
  if(r.status==='NOT_APPLICABLE'&&!String(r.not_applicable_reason||'').trim()) errors.push(`${r.validation_id}: NOT_APPLICABLE requires reason`);
  if(['ADMITTED','NOT_APPLICABLE'].includes(r.status)){
    if(!Array.isArray(r.matrix_ids)||r.matrix_ids.length!==1) errors.push(`${r.validation_id}: active record must map to exactly one matrix entry`);
    if(!fs.existsSync(r.implementation_path)) errors.push(`${r.validation_id}: missing implementation ${r.implementation_path}`);
    else if(fs.statSync(r.implementation_path).isFile()&&fs.statSync(r.implementation_path).size===0) errors.push(`${r.validation_id}: zero-byte implementation ${r.implementation_path}`);
    for(const f of ['positive_fixture','negative_fixture']) if(!fs.existsSync(r[f])) errors.push(`${r.validation_id}: missing ${f} ${r[f]}`);
  }
}
const matrixIds=new Set(); const matrixByValidation=new Map();
for(const m of matrix){
  if(matrixIds.has(m.matrix_id)) errors.push(`duplicate matrix_id ${m.matrix_id}`); matrixIds.add(m.matrix_id);
  const r=byId.get(m.validation_id); if(!r) errors.push(`${m.matrix_id}: no registry record ${m.validation_id}`); else {
    if(!['ADMITTED','NOT_APPLICABLE'].includes(r.status)) errors.push(`${m.matrix_id}: maps to non-active status ${r.status}`);
    if(m.command!==r.command) errors.push(`${m.matrix_id}: command drift from ${r.validation_id}`);
    if(m.severity!==r.proposed_severity) errors.push(`${m.matrix_id}: severity drift from ${r.validation_id}`);
    if(!r.matrix_ids.includes(m.matrix_id)) errors.push(`${m.matrix_id}: not declared by ${r.validation_id}`);
  }
  if(matrixByValidation.has(m.validation_id)) errors.push(`${m.validation_id}: multiple matrix entries`); matrixByValidation.set(m.validation_id,m);
}
for(const r of registry.filter(x=>['ADMITTED','NOT_APPLICABLE'].includes(x.status))) if(!matrixByValidation.has(r.validation_id)) errors.push(`${r.validation_id}: active registry record missing from matrix`);
const governedNames=Object.keys(pkg.scripts||{}).filter(name=>name.startsWith('validate:')||name.startsWith('release:')||name.startsWith('postdeploy:')||name.startsWith('postcleanup:')||name.startsWith('citation:')||['guardrails:all','full:loop','build:all','build:generated-content'].includes(name));
for(const name of governedNames){const cmd=`npm run ${name}`; const r=registry.find(x=>x.command===cmd); if(!r||!['ADMITTED','NOT_APPLICABLE'].includes(r.status)) errors.push(`package command not admitted: ${cmd}`);}
for(const wf of fs.readdirSync('.github/workflows').filter(x=>/\.ya?ml$/.test(x))){const cmd=path.posix.join('.github/workflows',wf); const r=registry.find(x=>x.command===cmd); if(!r||r.status!=='ADMITTED') errors.push(`workflow not admitted: ${cmd}`);}
for(const r of registry.filter(x=>x.status==='RETIRED')){
  if(governedNames.some(name=>`npm run ${name}`===r.command)) errors.push(`${r.validation_id}: retired command still in package scripts`);
  for(const wf of fs.readdirSync('.github/workflows').filter(x=>/\.ya?ml$/.test(x))){const text=fs.readFileSync(path.join('.github/workflows',wf),'utf8'); if(text.includes(r.command)) errors.push(`${r.validation_id}: retired command still called by ${wf}`);}
}
writeSummary('validate-validation-registry',{status:errors.length?'FAIL':'PASS',registry_records:registry.length,matrix_entries:matrix.length,governed_package_commands:governedNames.length,workflow_count:fs.readdirSync('.github/workflows').filter(x=>/\.ya?ml$/.test(x)).length,errors});
if(errors.length) fail(`[validate:validation-registry] FAIL: ${errors.length} issue(s)`,errors.slice(0,200));
pass(`[validate:validation-registry] OK: ${registry.length} records, ${matrix.length} matrix entries, all governed commands and workflows admitted`);
