#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from '../agent_intake/bhpc_agent_common.mjs';
const pkg = readJson('package.json', {scripts:{}});
const contract = readJson('config/agent/bhpc_agent_artifact_priority_contract.json', null);
const errors = [];
if (!contract) errors.push('bhpc_priority_contract_missing');
for (const cmd of ['release:agent-intake','agent:bhpc:apply-exact','release:daily-citation-intelligence']) if (!pkg.scripts[cmd]) errors.push(`package_script_missing:${cmd}`);
const workflowsDir = path.join(ROOT,'.github/workflows');
const texts = fs.existsSync(workflowsDir) ? Object.fromEntries(fs.readdirSync(workflowsDir).filter(f=>/\.ya?ml$/.test(f)).map(f=>[f,fs.readFileSync(path.join(workflowsDir,f),'utf8')])) : {};
const content = Object.entries(texts).find(([name,text]) => (name === 'spry-content-release.yml' && /agent-intake/.test(text) && /data\/report_fixes\/agent_runs\/\*\*\/agent_run_manifest\.json/.test(text)) || (/content-authority|agent|authority/i.test(name+text) && /release:agent-intake|agent:bhpc/.test(text)));
if (!content) errors.push('bhpc_agent_content_authority_workflow_missing');
const daily = Object.entries(texts).find(([name]) => name === 'daily-citation-intelligence.yml');
if (daily) {
  const text = daily[1];
  // Presence checks read the lane with its YAML comments stripped. Naming a
  // command in a comment is not running it, and this validator passed with the
  // reproducibility gate deleted precisely because the comment explaining the
  // gate still matched. The must-NOT-contain checks below keep reading the full
  // text, where a mention in a comment is still a finding.
  const executable = text.split('\n').filter(line => !/^\s*#/.test(line)).join('\n');
  if (!/contents:\s*write/.test(executable)) errors.push('daily_citation_intelligence_requires_bounded_write_permission');
  if (!/workflow:zero-dollar-autonomous/.test(executable)) errors.push('daily_citation_intelligence_zero_dollar_lane_missing');
  if (!/validate:ownership/.test(executable) || !/safe-harbor:validate/.test(executable)) errors.push('daily_citation_intelligence_protection_gates_missing');
  // The absorber runs in this lane, so the lane must also assert that what it
  // writes re-derives from raw. Dropping this gate would silently return derived
  // output to being written and committed with nothing checking it.
  if (!/validate:derived-absorber-reproducibility/.test(executable)) errors.push('daily_citation_intelligence_derived_reproducibility_gate_missing');
  if (/release:agent-intake|agent:bhpc:apply-exact/.test(text)) errors.push('daily_citation_intelligence_calls_bhpc_mutation_lane');
  if (/data\/report_fixes\/agent_runs|data\/report_fixes\/normalized_agent_runs|scripts\/agent_intake/.test(text)) errors.push('daily_citation_intelligence_references_paid_agent_protected_paths');
}
const report = {schema_version:'1.0', validator:'bhpc-agent-artifact-priority', status:errors.length?'FAIL':'PASS', errors};
writeJson('artifacts/validation/bhpc-agent-artifact-priority.json', report);
writeJson('reports/bhpc-agent-artifact-priority.json', report);
if (errors.length) { console.error(JSON.stringify(report,null,2)); process.exit(1); }
console.log('[bhpc-agent-artifact-priority] PASS');
