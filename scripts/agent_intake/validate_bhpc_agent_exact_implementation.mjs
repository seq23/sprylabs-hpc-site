#!/usr/bin/env node
import {readJson, writeJson} from './bhpc_agent_common.mjs';
const policy = readJson('data/report_fixes/agent_exact_implementation_policy.json', null);
const manifest = readJson('data/report_fixes/agent_acceptance_manifest.generated.json', null);
const compiler = readJson('artifacts/validation/html-fix-acceptance-compiler.json', null);
const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', null);
const trace = readJson('artifacts/validation/agent-exact-implementation-trace.json', null);
const acceptance = readJson('artifacts/validation/bhpc-agent-acceptance-manifest.json', null);
const noMarker = readJson('artifacts/validation/bhpc-no-marker-only-agent-pass.json', null);
const errors = [];
if (!policy) errors.push('missing_policy');
if (policy && policy.retroactive_processing !== false) errors.push('policy_must_be_forward_only');
if (!manifest) errors.push('missing_acceptance_manifest');
if (manifest && !Array.isArray(manifest.entries)) errors.push('acceptance_manifest_missing_entries');
if (!compiler || compiler.status !== 'PASS') errors.push('acceptance_compiler_not_pass');
if (!plan || plan.status !== 'PASS') errors.push('missing_or_failed_plan');
if (!trace || trace.status !== 'PASS') errors.push('missing_or_failed_trace');
if (acceptance && acceptance.status !== 'PASS') errors.push('acceptance_manifest_validator_not_pass');
if (noMarker && noMarker.status !== 'PASS') errors.push('no_marker_validator_not_pass');
for (const spec of plan?.specs || []) {
  if (spec.status !== 'BLOCKED' && (!Array.isArray(spec.acceptance_ids) || !spec.acceptance_ids.length)) errors.push(`${spec.record_id}:planned_without_acceptance_ids`);
}
const report = {schema_version: '1.0', generated_at: new Date().toISOString(), status: errors.length ? 'FAIL' : 'PASS', plan_count: plan?.specs?.length || 0, acceptance_entry_count: manifest?.entries?.length || 0, trace_count: trace?.trace_count || 0, errors};
writeJson('artifacts/validation/agent-exact-implementation.json', report);
writeJson('reports/bhpc-agent-exact-implementation.json', report);
if (errors.length) {
  console.error(`[bhpc-agent-exact-validate] FAIL: ${errors.length} issue(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[bhpc-agent-exact-validate] PASS: specs=${report.plan_count}; acceptance_entries=${report.acceptance_entry_count}`);
