#!/usr/bin/env node
import fs from 'node:fs';
const inv=JSON.parse(fs.readFileSync('artifacts/validation/workflow-yaml-inventory.json','utf8')); const errors=[];
for(const w of inv.workflows||[]){ if(!(w.required_artifacts||[]).length) errors.push(`${w.path}: no required artifacts declared`); }
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:workflow-artifacts] PASS');
