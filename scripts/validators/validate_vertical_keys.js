#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const ROOT=process.cwd();
const allowed=new Set(['bhpc','spry-executive-os','a-player-mode']);
const files=['data/answer_surface_monitoring/queries.seed.json','reports/answer_surface_scorecard.json'];
for (const file of files){ if(!fs.existsSync(file)) continue; const text=fs.readFileSync(file,'utf8'); const matches=[...text.matchAll(/"vertical"\s*:\s*"([^"]+)"/g)].map(m=>m[1]); for (const v of matches) if(!allowed.has(v)) throw new Error(`unknown vertical key ${v} in ${file}`); }
console.log('VERTICAL KEYS PASS');
