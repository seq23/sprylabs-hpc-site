#!/usr/bin/env node
import fs from 'node:fs';
function readJson(p,fallback=null){return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):fallback;}
function writeJson(p,payload){fs.mkdirSync(p.split('/').slice(0,-1).join('/')||'.',{recursive:true}); fs.writeFileSync(p,JSON.stringify(payload,null,2)+'\n');}
const checklist=readJson('artifacts/release/IMPLEMENTATION_COMPLETION_CHECKLIST_2026-07-03.json',{});
const readiness=readJson('artifacts/validation/controlled-release-readiness.json',{});
const inv=readJson('artifacts/validation/workflow-yaml-inventory.json',{});
const actual=fs.readdirSync('.github/workflows').filter(x=>/\.ya?ml$/.test(x)).length;
const errors=[];
if(readiness.status!=='PASS') errors.push('controlled-release-readiness must pass');
if(!Array.isArray(checklist.items)||!checklist.items.length) errors.push('completion checklist items missing');
for(const item of checklist.items||[]) if(item.status!=='DONE') errors.push(`checklist item not done: ${item.id}`);
if(inv.workflow_count!==actual && inv.workflows?.length!==actual) errors.push(`workflow inventory count drift: inventory=${inv.workflow_count||inv.workflows?.length} actual=${actual}`);
if(!fs.existsSync('docs/runbooks/CONTROLLED_RELEASE_LANE.md')) errors.push('missing controlled release runbook');
const report={schema_version:'1.0',repo:'seq23/sprylabs-hpc-site',validator:'batch-de-completion',generated_at:new Date().toISOString(),status:errors.length?'FAIL':'PASS',workflow_count:actual,checklist_items:(checklist.items||[]).length,errors};
writeJson('artifacts/validation/batch-de-completion.json',report);
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:batch-de-completion] PASS');
