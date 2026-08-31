#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const contract=JSON.parse(fs.readFileSync('data/contracts/artifact_consistency_contract.json','utf8'));
const fixture=JSON.parse(fs.readFileSync('fixtures/validation/artifact-consistency/scenarios.json','utf8'));
const failures=[]; const results=[];
const aliases=contract.field_aliases.reason;
function stable(v){if(Array.isArray(v))return v.map(stable); if(v&&typeof v==='object'){const o={}; for(const k of Object.keys(v).sort()){if(k==='generated_at')continue;o[k]=stable(v[k]);}return o;} return v;}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function validatePlan(p){const e=[]; for(const f of ['selected','skipped','blocked']) if(!Array.isArray(p[f])) e.push(`missing array ${f}`); if(e.length)return e; if(p.external_telemetry_present!==false)e.push('external telemetry must be false'); const all=[...p.selected,...p.skipped,...p.blocked]; const emptyAllowed=['COMPLETED_NO_INPUT','COMPLETED_NO_CHANGES'].includes(p.status); if(all.length===0&&!emptyAllowed)e.push('empty plan requires explicit no-input/no-change status'); for(const item of all){for(const f of ['candidate_id','action','route_owner','source_basis','risk_level','decision']) if(!item[f]||(Array.isArray(item[f])&&item[f].length===0))e.push(`${item.candidate_id||'unknown'} missing ${f}`); if(!aliases.some(k=>item[k]))e.push(`${item.candidate_id||'unknown'} missing decision reason`);} const s=p.summary||{}; const map={selected_units:p.selected.length,skipped_units:p.skipped.length,blocked_units:p.blocked.length,release_units_planned:all.length}; for(const [k,v] of Object.entries(map))if(Number(s[k])!==v)e.push(`${k} mismatch`); return e;}
function run(s){let ok=true; let detail=''; const d=s.data; switch(s.kind){
case 'release_plan': ok=validatePlan(d).length===0; detail=validatePlan(d).join('; '); break;
case 'duplicate_ids': {const m=new Map(); ok=true; for(const r of d.records){const id=r.candidate_id,h=hash(r); if(m.has(id)&&m.get(id)!==h)ok=false; m.set(id,h);} break;}
case 'application': ok=Number(d.planned)===Number(d.applied)+Number(d.runtime_skipped)+Number(d.failed); break;
case 'semantic_change': {const changed=hash(d.before)!==hash(d.after); ok=s.expected==='PASS_CHANGE'?changed:!changed; break;}
case 'null_zero': ok=d.unknown===null&&d.measured_zero===0; break;
case 'packaging': ok=d.class==='PRESENTATION_ONLY'; break;
case 'route': ok=(d.route==='/knowledge-map/'&&d.target==='knowledge-map/index.html')||(d.route==='/admin/'&&d.classification==='private_noindex'); break;
case 'workflow': ok=d.produces?d.produces===d.expects:Boolean((d.status==='success'&&d.commit===null&&d.reason)||d.retryable_stage||d.postdeploy==='failed'); break;
case 'validator_receipt': ok=d.exit_code===0&&d.receipt_status!=='failed'&&d.receipt!==null; break;
case 'severity': ok=!(contract.severity.hard_fail.includes(d.rule)&&d.severity!=='HARD_FAIL'); break;
case 'ownership': ok=!d.attempted&&d.decision==='SKIPPED_PROTECTED_OWNER'; break;
case 'idempotency': ok=d.second_applied===0&&d.second_skipped===d.first_applied; break;
case 'stale': ok=d.decision==='SKIPPED_STALE_PLAN'; break;
case 'telemetry': ok=d.owned_surfaces_created>=0&&(d.observed_external_citations===null||d.observed_external_citations>=0); break;
case 'admin': ok=d.allowlisted===true; break;
default: ok=false; detail='unknown scenario kind';}
const expectedPass=s.expected.startsWith('PASS'); const matched=ok===expectedPass; return {id:s.id,kind:s.kind,expected:s.expected,observed_ok:ok,matched,detail};}
// The scenario fixture and the artifact list are the two independent sets this
// end-to-end check runs against. Either one emptied leaves its loop running zero
// times, and the run still prints "PASS 0 scenarios" with no artifact checked.
if(!(fixture.scenarios||[]).length){console.error('[validate:artifact-consistency-e2e] FAIL: fixtures/validation/artifact-consistency/scenarios.json declares no scenarios; expected at least one PASS/FAIL scenario to execute. Passing zero scenarios proves nothing.');process.exit(1);}
if(!(contract.artifacts||[]).length){console.error('[validate:artifact-consistency-e2e] FAIL: data/contracts/artifact_consistency_contract.json declares no artifacts; expected at least one artifact to check for in the working tree. An empty artifact list checks nothing.');process.exit(1);}
for(const s of fixture.scenarios){const r=run(s);results.push(r);if(!r.matched)failures.push(`${r.id}: expected ${r.expected}, observed ${r.observed_ok?'PASS':'FAIL'} ${r.detail}`);}
if(!results.length){console.error('[validate:artifact-consistency-e2e] FAIL: executed 0 scenarios from fixtures/validation/artifact-consistency/scenarios.json; expected one result per declared scenario.');process.exit(1);}
for(const a of contract.artifacts){if(a.required_in_working_tree&&!fs.existsSync(a.path))failures.push(`working tree missing required artifact ${a.path}`);}
const planPath='artifacts/validation/daily-citation-release-plan.json'; if(fs.existsSync(planPath)){const p=JSON.parse(fs.readFileSync(planPath,'utf8')); const e=validatePlan(p); if(e.length)failures.push(...e.map(x=>`current plan: ${x}`));}
fs.mkdirSync('artifacts/validation',{recursive:true}); const out={schema_version:'1.0',status:failures.length?'FAIL':'PASS',scenario_count:results.length,passed:results.filter(x=>x.matched).length,failed:failures.length,results,failures}; fs.writeFileSync('artifacts/validation/artifact-consistency-e2e.json',JSON.stringify(out,null,2)+'\n');
if(failures.length){console.error(failures.join('\n'));process.exit(1);} console.log(`[validate:artifact-consistency-e2e] PASS ${results.length} scenarios`);
