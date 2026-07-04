#!/usr/bin/env node
import fs from 'node:fs';
const p='artifacts/validation/daily-proof-packet.json'; const errors=[];
if(!fs.existsSync(p)) errors.push('missing daily proof packet'); else { const pkt=JSON.parse(fs.readFileSync(p,'utf8')); if(pkt.external_telemetry_present!==false) errors.push('external telemetry must not be claimed'); if(pkt.status!=='PASS') errors.push('proof packet status not PASS'); for(const f of ['signals_collected','signals_normalized','release_units_planned','blocked_units','citation_surfaces_total','sitemap_urls_total','llms_entries_total']) if(typeof pkt[f] !== 'number') errors.push(`missing numeric ${f}`); }
if(!fs.existsSync('reports/daily-proof-packet.md')) errors.push('missing proof packet md report');
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:daily-proof-packet] PASS');
