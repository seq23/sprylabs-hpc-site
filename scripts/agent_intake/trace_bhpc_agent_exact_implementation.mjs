#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from './bhpc_agent_common.mjs';
function normalize(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
const plan=readJson('artifacts/validation/agent-exact-implementation-plan.json',{specs:[]});
const admission=readJson('data/content/page_admission_registry.json',{records:[]});
const admitted=new Set((admission.records||[]).map(r=>r.path).filter(Boolean));
const errors=[]; const traces=[];
for(const spec of plan.specs||[]){
  if(spec.status==='BLOCKED'){
    const ok=Boolean(spec.blocked_reason);
    traces.push({...spec, trace_status:ok?'PASS':'FAIL'});
    if(!ok) errors.push(`${spec.record_id}:blocked_without_reason`);
    continue;
  }
  const file=path.join(ROOT,spec.implementation_path||'');
  const exists=fs.existsSync(file);
  const text=exists?fs.readFileSync(file,'utf8'):'';
  const q=normalize(spec.query).split(' ').slice(0,4).join(' ');
  const hasQuery=q && normalize(text).includes(q);
  const hasExact=text.includes('Agent Exact Citation Repair') || text.includes('exact intended-winner pipeline') || text.includes('data-priority-citation="true"');
  const admittedOk=admitted.has(spec.implementation_path) || spec.operation === 'REPAIR_INTENDED_WINNER_PAGE' || admitted.size === 0;
  const pass=exists && hasQuery && hasExact && admittedOk;
  traces.push({...spec, trace_status:pass?'PASS':'FAIL', file_exists:exists, query_marker_found:hasQuery, exact_marker_found:hasExact, admission_ok:admittedOk});
  if(!pass) errors.push(`${spec.record_id}:exact_implementation_not_proven:${spec.implementation_path}`);
}
const report={schema_version:'1.0', generated_at:new Date().toISOString(), status:errors.length?'FAIL':'PASS', trace_count:traces.length, traces, errors};
writeJson('artifacts/validation/agent-exact-implementation-trace.json', report);
writeJson('reports/bhpc-agent-exact-implementation-trace.json', report);
if(errors.length){console.error(`[bhpc-agent-exact-trace] FAIL: ${errors.length} issue(s)`); for(const e of errors) console.error(` - ${e}`); process.exit(1);} 
console.log(`[bhpc-agent-exact-trace] PASS: ${traces.length} spec(s)`);
