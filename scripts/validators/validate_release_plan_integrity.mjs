#!/usr/bin/env node
import fs from 'node:fs';
const p='artifacts/validation/daily-citation-release-plan.json'; const errors=[];
if(!fs.existsSync(p)) errors.push('missing release plan'); else { const plan=JSON.parse(fs.readFileSync(p,'utf8')); if(plan.external_telemetry_present!==false) errors.push('external telemetry must be false unless provided'); if(!plan.selected?.length) errors.push('release plan selected no units'); if(!plan.blocked?.length) errors.push('release plan blocked no units'); for(const item of [...(plan.selected||[]),...(plan.blocked||[])]) { for(const f of ['candidate_id','action','route_owner','source_basis','risk_level','decision','reason']) if(!item[f] || (Array.isArray(item[f]) && !item[f].length)) errors.push(`${item.candidate_id||'unknown'} missing ${f}`); } }
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:release-plan-integrity] PASS');
