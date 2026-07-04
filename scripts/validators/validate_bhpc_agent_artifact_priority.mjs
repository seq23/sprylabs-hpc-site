#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from '../agent_intake/bhpc_agent_common.mjs';
const pkg = readJson('package.json', {scripts:{}});
const contract = readJson('_bhpc_agent_artifact_priority_contract.json', null);
const errors = [];
if (!contract) errors.push('bhpc_priority_contract_missing');
for (const cmd of ['release:agent-intake','agent:bhpc:apply-exact','release:daily-citation-intelligence']) if (!pkg.scripts[cmd]) errors.push(`package_script_missing:${cmd}`);
const workflowsDir = path.join(ROOT,'.github/workflows');
const texts = fs.existsSync(workflowsDir) ? Object.fromEntries(fs.readdirSync(workflowsDir).filter(f=>/\.ya?ml$/.test(f)).map(f=>[f,fs.readFileSync(path.join(workflowsDir,f),'utf8')])) : {};
const content = Object.entries(texts).find(([name,text]) => /content-authority|agent|authority/i.test(name+text) && /release:agent-intake|agent:bhpc/.test(text));
if (!content) errors.push('bhpc_agent_content_authority_workflow_missing');
const daily = Object.entries(texts).find(([name]) => name === 'daily-citation-intelligence.yml');
if (daily) {
  if (!/contents:\s*read/.test(daily[1])) errors.push('daily_citation_intelligence_must_be_read_only');
  if (/release:agent-intake|agent:bhpc:apply-exact/.test(daily[1])) errors.push('daily_citation_intelligence_calls_bhpc_mutation_lane');
}
const report = {schema_version:'1.0', validator:'bhpc-agent-artifact-priority', status:errors.length?'FAIL':'PASS', errors};
writeJson('artifacts/validation/bhpc-agent-artifact-priority.json', report);
writeJson('reports/bhpc-agent-artifact-priority.json', report);
if (errors.length) { console.error(JSON.stringify(report,null,2)); process.exit(1); }
console.log('[bhpc-agent-artifact-priority] PASS');
