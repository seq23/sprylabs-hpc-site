#!/usr/bin/env node
import fs from 'node:fs';
const p='artifacts/validation/strategy-gate.json';
const errors=[];
if(!fs.existsSync(p)) errors.push('missing strategy gate artifact; run strategy:gate');
else { const gate=JSON.parse(fs.readFileSync(p,'utf8')); if(gate.status!=='PASS') errors.push('strategy gate did not pass'); }
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:strategy-gate] PASS');
