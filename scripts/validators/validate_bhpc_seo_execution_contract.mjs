#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
import {ROOT,NORMALIZED_ROOT,readJson,writeJson} from '../agent_intake/bhpc_agent_common.mjs';
import {loadBhpcSeoPolicy} from '../lib/bhpc_seo_execution_contract.mjs';
const policy=loadBhpcSeoPolicy(),errors=[],rows=[];
const files=fs.existsSync(path.join(ROOT,NORMALIZED_ROOT))?fs.readdirSync(path.join(ROOT,NORMALIZED_ROOT)).filter(f=>f.endsWith('.json')).sort():[];
// With no run file the payload defaulted to {}, so `payload.seo_execution_count>0`
// was `undefined>0` - false - and the guard below never fired: the validator printed
// "PASS: validated=0; source=" with an empty source path, having read no run at all.
// A missing or empty normalized-run directory is the failure, not a clean result.
if(!files.length){console.error(`[validate:bhpc-seo-execution] FAIL: no normalized agent run found under ${NORMALIZED_ROOT}; every SEO execution row this validator judges comes from the latest run file there, so with none there is nothing to validate and a pass would be false.`);process.exit(1)}
const latest=files.at(-1);const payload=readJson(`${NORMALIZED_ROOT}/${latest}`,null);
if(!payload||typeof payload!=='object'){console.error(`[validate:bhpc-seo-execution] FAIL: ${NORMALIZED_ROOT}/${latest} could not be read as a normalized run; its records array is the only source of SEO execution rows, so an unreadable run would validate nothing.`);process.exit(1)}
for(const row of payload.records||[]){
  if(row.source_section!=='seo_execution')continue;
  rows.push(row);
  if(row.seo_execution_status!=='VALID')errors.push(`${row.id}:invalid_seo_execution:${(row.seo_execution_errors||[]).join('|')}`);
  const seo=row.seo_execution||{};
  if(!policy.allowed_page_decisions.includes(seo.page_decision))errors.push(`${row.id}:unsupported_page_decision:${seo.page_decision}`);
  if(!seo.target_url&&!seo.target_filepath)errors.push(`${row.id}:missing_target`);
  if(seo.page_decision==='repair_existing'&&row.operation!=='REPAIR_INTENDED_WINNER_PAGE')errors.push(`${row.id}:repair_not_resolved_to_existing:${row.implementation_path}`);
}
if(payload.seo_execution_count>0&&!rows.length)errors.push('normalized_run_dropped_seo_execution_rows');
const report={schema_version:'1.0',generated_at:new Date().toISOString(),status:errors.length?'FAIL':'PASS',normalized_path:latest?`${NORMALIZED_ROOT}/${latest}`:'',declared_count:payload.seo_execution_count||0,validated_count:rows.length,errors};
writeJson('artifacts/validation/bhpc-seo-execution-contract.json',report);writeJson('reports/bhpc-seo-execution-contract.json',report);
if(errors.length){console.error(`[validate:bhpc-seo-execution] FAIL: ${errors.length}`);for(const e of errors)console.error(' -',e);process.exit(1)}
console.log(`[validate:bhpc-seo-execution] PASS: validated=${rows.length}; source=${report.normalized_path}`);
