#!/usr/bin/env node
import fs from 'node:fs';
const p='data/signals/normalized/latest_normalized_signals.json'; const errors=[];
if(!fs.existsSync(p)) errors.push('missing normalized signal output'); else { const rows=JSON.parse(fs.readFileSync(p,'utf8')).records||[]; const actions=new Set(rows.map(r=>r.candidate_action)); for(const a of ['create','repair','atom_update','internal_link_update','block']) if(!actions.has(a)) errors.push(`missing fixture action ${a}`); for(const r of rows) if(!r.query||!r.source_basis?.length) errors.push(`${r.normalized_id}: missing query/source_basis`); }
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:signal-normalization] PASS');
