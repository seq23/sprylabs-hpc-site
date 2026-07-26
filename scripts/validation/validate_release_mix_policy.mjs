#!/usr/bin/env node
import fs from 'node:fs';
const errors=[];
const profiles=JSON.parse(fs.readFileSync('data/content/release_profiles.json','utf8'));
const mix=JSON.parse(fs.readFileSync('data/content/release_mix_policy.json','utf8'));
if (!String(profiles.authority||'').includes('Existing content automation system')) errors.push('release profiles must preserve existing content automation authority');
if ((profiles.profiles||[]).some(p => /scheduler|daily_release_queue/i.test(JSON.stringify(p)))) errors.push('release profiles must not create a second scheduler');
const weights = Object.values(mix.release_mix||{}).map(Number);
const total = weights.reduce((a,b)=>a+b,0);
if (total !== 100) errors.push(`release mix must equal 100, got ${total}`);
for (const rule of ['release atom must pass','claim safety must pass','no keyword-swap page']) if (!(mix.hard_rules||[]).includes(rule)) errors.push(`release mix missing hard rule: ${rule}`);
fs.mkdirSync('artifacts/diagnostics/container-current/validate-release-mix-policy',{recursive:true});
fs.writeFileSync('artifacts/diagnostics/container-current/validate-release-mix-policy/summary.json', JSON.stringify({status:errors.length?'FAIL':'PASS',errors},null,2)+'\n');
if (errors.length) { console.error('[validate:release-mix-policy] FAIL'); errors.forEach(e=>console.error(' - '+e)); process.exit(1); }
console.log('[validate:release-mix-policy] OK');
