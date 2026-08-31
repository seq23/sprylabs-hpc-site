#!/usr/bin/env node
import fs from 'node:fs';
const registry=JSON.parse(fs.readFileSync('data/signals/source_registry.json','utf8')); const errors=[];
// The per-source field, terms, and adapter checks all hang off this list. With no
// sources registered there is nothing to prove, yet the run prints
// "PASS sources=0" as though the source contract had been enforced.
if(!(registry.sources||[]).length){console.error('[validate:firehose-source-contract] FAIL: data/signals/source_registry.json lists no sources; expected at least one registered signal source. A pass over an empty registry proves no source honours the contract.');process.exit(1);}
for(const s of registry.sources||[]){ if(!s.id||!s.adapter||!s.mode||!s.terms_status) errors.push(`source missing fields: ${JSON.stringify(s)}`); if(s.enabled && !['allowed'].includes(s.terms_status)) errors.push(`${s.id}: enabled without allowed terms_status`); if(!fs.existsSync(`scripts/firehose/adapters/${s.adapter}.mjs`) && s.adapter!=='fixture') errors.push(`${s.id}: missing adapter`); }
for(const p of ['config/authority/citation_intelligence_contract.json','data/signals/source_health.json','data/signals/firehose_ledger.json']) if(!fs.existsSync(p)) errors.push(`missing ${p}`);
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log(`[validate:firehose-source-contract] PASS sources=${registry.sources.length}`);
