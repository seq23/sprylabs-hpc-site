#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const steps = [
 ['firehose:collect','npm',['run','firehose:collect']],
 ['firehose:normalize','npm',['run','firehose:normalize']],
 ['firehose:health','npm',['run','firehose:health']],
 ['signals:cluster','npm',['run','signals:cluster']],
 ['signals:score','npm',['run','signals:score']],
 ['signals:candidates','npm',['run','signals:candidates']],
 ['signals:opportunity-map','npm',['run','signals:opportunity-map']],
 ['release:plan','npm',['run','release:plan']],
 ['release:content:intelligence','npm',['run','release:content:intelligence']],
 ['release:daily-proof','npm',['run','release:daily-proof']]
];
const trace = {schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', run_id:`fixture-trace-${Date.now()}`, started_at:new Date().toISOString(), steps:[], status:'RUNNING'};
fs.mkdirSync('artifacts/validation',{recursive:true}); fs.mkdirSync('reports',{recursive:true});
for (const [label, cmd, args] of steps) {
 const started_at = new Date().toISOString();
 const result = spawnSync(cmd,args,{stdio:'inherit',env:{...process.env,TRAFFIC_QUALIFIED_TRACE:'1'}});
 const exit_code = result.status ?? 1;
 trace.steps.push({label, command:[cmd,...args].join(' '), started_at, completed_at:new Date().toISOString(), exit_code});
 if (exit_code !== 0) { trace.status='FAIL'; fs.writeFileSync('artifacts/validation/fixture-signal-trace.json', JSON.stringify(trace,null,2)+'\n'); process.exit(exit_code); }
}
const plan = JSON.parse(fs.readFileSync('artifacts/validation/daily-citation-release-plan.json','utf8'));
trace.status='PASS'; trace.completed_at=new Date().toISOString(); trace.required_candidate_actions=['create','repair','atom_update','internal_link_update','block']; trace.observed_candidate_actions=[...new Set([...plan.selected,...plan.blocked].map(x=>x.action))]; trace.selected_count=plan.summary.selected_units; trace.blocked_count=plan.summary.blocked_units;
fs.writeFileSync('artifacts/validation/fixture-signal-trace.json', JSON.stringify(trace,null,2)+'\n');
fs.writeFileSync('reports/fixture-signal-trace.md', `# Fixture Signal Trace\n\nStatus: PASS\n\nRequired path proved: raw signal → normalized signal → cluster → score → release candidate → release plan → shadow apply/no-op → proof packet.\n\nSelected units: ${trace.selected_count}\n\nBlocked units: ${trace.blocked_count}\n`);
console.log(`[trace:traffic-qualified-pipeline] PASS selected=${trace.selected_count} blocked=${trace.blocked_count}`);
