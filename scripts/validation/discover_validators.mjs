#!/usr/bin/env node
import fs from 'node:fs';
import {discover} from './validation_control_plane.mjs';
const result=discover();
const candidates=result.unregistered.map(x=>({command:x.command,package_script:x.name,suggested_id:`VAL-${x.name.toUpperCase().replace(/[^A-Z0-9]+/g,'-')}`,suggested_category:'unclassified',suggested_severity:'STRONG_WARNING',requires_review:true}));
fs.mkdirSync('artifacts/validation',{recursive:true});
fs.writeFileSync('artifacts/validation/discovered-validator-candidates.json',JSON.stringify({...result,candidates},null,2)+'\n');
console.log(`[validation:discover] PASS: ${result.discovered.length} governed commands; ${result.unregistered.length} unregistered; ${result.orphaned.length} orphaned`);
for(const x of result.unregistered) console.log(`STRONG WARNING: executable command not admitted: ${x.command}`);
if(result.orphaned.length){for(const x of result.orphaned) console.error(`FAIL: admitted command missing from package.json: ${x.command}`); process.exit(1);}
