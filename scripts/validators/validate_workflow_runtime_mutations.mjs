#!/usr/bin/env node
import fs from 'node:fs';
const inv=JSON.parse(fs.readFileSync('artifacts/validation/workflow-yaml-inventory.json','utf8')); const errors=[];
const forbidden=['.github/**','package.json','package-lock.json','scripts/**','docs/**','_repo*.json','_validation_registry.json'];
// The forbidden-mutation contract is only enforced against workflows the
// inventory names. An empty inventory means no workflow is held to it, and a
// governance-mutating scheduled workflow would sail through a PASS.
if(!(inv.workflows||[]).length){console.error('[validate:workflow-runtime-mutations] FAIL: artifacts/validation/workflow-yaml-inventory.json lists no workflows; expected one entry per file in .github/workflows. Enforcing the forbidden-mutation list against zero workflows proves nothing.');process.exit(1);}
for(const w of inv.workflows||[]){ for(const f of forbidden) if(!(w.forbidden_runtime_mutations||[]).includes(f)) errors.push(`${w.path}: missing forbidden mutation ${f}`); if(w.trigger.includes('schedule') && (w.allowed_runtime_mutations||[]).some(x=>['.github/**','scripts/**','docs/**'].includes(x))) errors.push(`${w.path}: scheduled workflow allows governance mutation`); }
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:workflow-runtime-mutations] PASS');
