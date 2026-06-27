#!/usr/bin/env node
import {readJson, writeJson} from './bhpc_agent_common.mjs';
const policy=readJson('data/report_fixes/agent_exact_implementation_policy.json',null);
const plan=readJson('artifacts/validation/agent-exact-implementation-plan.json',null);
const trace=readJson('artifacts/validation/agent-exact-implementation-trace.json',null);
const errors=[];
if(!policy) errors.push('missing_policy');
if(policy && policy.retroactive_processing!==false) errors.push('policy_must_be_forward_only');
if(!plan) errors.push('missing_plan');
if(!trace) errors.push('missing_trace');
if(trace && trace.status!=='PASS') errors.push('trace_not_pass');
const report={schema_version:'1.0', generated_at:new Date().toISOString(), status:errors.length?'FAIL':'PASS', plan_count:plan?.specs?.length||0, errors};
writeJson('artifacts/validation/agent-exact-implementation.json', report);
writeJson('reports/bhpc-agent-exact-implementation.json', report);
if(errors.length){console.error(`[bhpc-agent-exact-validate] FAIL: ${errors.length} issue(s)`); for(const e of errors) console.error(` - ${e}`); process.exit(1);} 
console.log(`[bhpc-agent-exact-validate] PASS: specs=${report.plan_count}`);
