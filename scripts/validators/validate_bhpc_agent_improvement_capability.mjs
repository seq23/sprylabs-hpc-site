#!/usr/bin/env node
import {readJson, writeJson} from '../agent_intake/bhpc_agent_common.mjs';
const contract = readJson('config/agent/bhpc_agent_improvement_capability_contract.json', null);
const errors = [];
const required = ['ADD_DIRECT_ANSWER_BLOCK','ADD_EXECUTIVE_SUMMARY','ADD_PROTOCOL','ADD_DECISION_FILTER','ADD_COMPARISON_TABLE','ADD_OBJECTION_HANDLING_BLOCK','ADD_IMPLEMENTATION_STEPS','ADD_INTERNAL_LINKS','ADD_ENTITY_CONTEXT_BLOCK','ADD_METHODOLOGY_BLOCK','CREATE_AUTHORITY_INSIGHT','CREATE_FRAMEWORK_PAGE','CREATE_PROTOCOL_PAGE','CREATE_COMPARISON_PAGE','CREATE_CLUSTER_PAGE','CREATE_ANSWER_PAGE','REPAIR_INTENDED_WINNER_PAGE','QUARANTINE_UNSAFE_RECOMMENDATION','ESCALATE_UNSUPPORTED_IMPROVEMENT'];
if (!contract) errors.push('bhpc_improvement_capability_contract_missing');
else for (const primitive of required) if (!contract.allowed_improvement_primitives?.includes(primitive)) errors.push(`missing_bhpc_improvement_primitive:${primitive}`);
const report = {schema_version:'1.0', validator:'bhpc-agent-improvement-capability', status:errors.length?'FAIL':'PASS', required_count:required.length, errors};
writeJson('artifacts/validation/bhpc-agent-improvement-capability.json', report);
writeJson('reports/bhpc-agent-improvement-capability.json', report);
if (errors.length) { console.error(JSON.stringify(report,null,2)); process.exit(1); }
console.log('[bhpc-agent-improvement-capability] PASS');
