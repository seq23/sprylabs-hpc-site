#!/usr/bin/env node
import fs from 'node:fs';
const inv=JSON.parse(fs.readFileSync('artifacts/validation/workflow-yaml-inventory.json','utf8')); const errors=[];
// The inventory is the only list of workflows this check sees. An empty or
// unbuilt inventory means no workflow is checked for declared artifacts, and the
// run still prints PASS.
if(!(inv.workflows||[]).length){console.error('[validate:workflow-artifacts] FAIL: artifacts/validation/workflow-yaml-inventory.json lists no workflows; expected one entry per file in .github/workflows. Checking zero workflows proves none declares its required artifacts.');process.exit(1);}
for(const w of inv.workflows||[]){ if(!(w.required_artifacts||[]).length) errors.push(`${w.path}: no required artifacts declared`); }
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:workflow-artifacts] PASS');
