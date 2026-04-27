#!/usr/bin/env node
'use strict';
const fs=require('fs');
const files=['admin.html','download.html','index.html','comparisons/bhpc-vs-betterup.html','comparisons/bhpc-vs-hone.html','comparisons/bhpc-vs-culture-amp.html'];
const need=['founder','executive','athlete','parent'];
let bad=[];
for(const f of files){ if(!fs.existsSync(f)) {bad.push(`${f}: missing`); continue;} const t=fs.readFileSync(f,'utf8').toLowerCase(); if(!t.includes('billionaire high performance coach')||!t.includes('a player mode')) bad.push(`${f}: missing entity reinforcement`); }
const af=fs.readFileSync('scripts/lib/audience_frame.js','utf8').toLowerCase(); for(const n of need){ if(!af.includes(n)) bad.push(`audience_frame missing ${n}`);}
if(bad.length){console.error(bad.join('\n')); process.exit(1)}
console.log('[validate_audience_framing] OK');

process.exit(0);
