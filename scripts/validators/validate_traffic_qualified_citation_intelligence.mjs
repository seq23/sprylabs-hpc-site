#!/usr/bin/env node
import fs from 'node:fs';
const required=['data/strategy/citation_strategy_profile.json','config/authority/citation_intelligence_contract.json','config/release/content_release_contract.json','data/signals/source_registry.json','data/signals/firehose_ledger.json','data/signals/source_health.json','data/signals/fixtures/raw_signals.json','artifacts/validation/fixture-signal-trace.json','artifacts/validation/daily-citation-release-plan.json','artifacts/validation/daily-proof-packet.json','data/content/atom_registry.json','data/content/atom_type_contract.json'];
const errors=[]; for(const p of required) if(!fs.existsSync(p)||fs.statSync(p).size===0) errors.push(`missing required artifact ${p}`);
if(fs.existsSync('artifacts/validation/daily-proof-packet.json')){ const pkt=JSON.parse(fs.readFileSync('artifacts/validation/daily-proof-packet.json','utf8')); if(pkt.external_telemetry_present!==false) errors.push('external telemetry falsely present'); }
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:traffic-qualified-citation-intelligence] PASS');
