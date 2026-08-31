#!/usr/bin/env node
import fs from 'node:fs';
const invPath='artifacts/validation/workflow-yaml-inventory.json'; const errors=[];
if(!fs.existsSync(invPath)) errors.push('missing workflow inventory artifact'); else { const inv=JSON.parse(fs.readFileSync(invPath,'utf8')); const files=fs.readdirSync('.github/workflows').filter(f=>/\.ya?ml$/.test(f)).map(f=>`.github/workflows/${f}`).sort();
// This directory listing is what proves the inventory is complete. If it comes
// back empty - renamed directory, changed working directory - every workflow is
// trivially "in the inventory" and the completeness check passes without
// comparing anything.
if(!files.length) errors.push('.github/workflows contains no .yml/.yaml files; expected at least one workflow to reconcile against the inventory. An empty directory listing makes the completeness check vacuous.');
const invFiles=(inv.workflows||[]).map(w=>w.path).sort(); for(const f of files) if(!invFiles.includes(f)) errors.push(`workflow missing from inventory: ${f}`); for(const w of inv.workflows||[]){ for(const f of ['path','name','trigger','primary_command','repo_lane','current_status','reason','allowed_runtime_mutations','forbidden_runtime_mutations','required_artifacts','validation_owner']) if(w[f]===undefined) errors.push(`${w.path}: missing ${f}`); } }
if(!fs.existsSync('reports/workflow-yaml-inventory.md')) console.warn('[validate:workflow-yaml-inventory] optional markdown report absent; JSON inventory remains authoritative');
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:workflow-yaml-inventory] PASS');
