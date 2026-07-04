#!/usr/bin/env node
import fs from 'node:fs';
const invPath='artifacts/validation/workflow-yaml-inventory.json'; const errors=[];
if(!fs.existsSync(invPath)) errors.push('missing workflow inventory artifact'); else { const inv=JSON.parse(fs.readFileSync(invPath,'utf8')); const files=fs.readdirSync('.github/workflows').filter(f=>/\.ya?ml$/.test(f)).map(f=>`.github/workflows/${f}`).sort(); const invFiles=(inv.workflows||[]).map(w=>w.path).sort(); for(const f of files) if(!invFiles.includes(f)) errors.push(`workflow missing from inventory: ${f}`); for(const w of inv.workflows||[]){ for(const f of ['path','name','trigger','primary_command','repo_lane','current_status','reason','allowed_runtime_mutations','forbidden_runtime_mutations','required_artifacts','validation_owner']) if(w[f]===undefined) errors.push(`${w.path}: missing ${f}`); } }
if(!fs.existsSync('reports/workflow-yaml-inventory.md')) errors.push('missing workflow inventory md report');
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:workflow-yaml-inventory] PASS');
