#!/usr/bin/env node
'use strict';
const fs=require('fs');
const files=['download.html','index.html','comparisons/bhpc-vs-betterup.html','comparisons/bhpc-vs-hone.html','comparisons/bhpc-vs-culture-amp.html'];
const homepageFiles=['download.html','index.html','scripts/lib/audience_frame.js','scripts/apply_citation_layer.js'];
const need=['founder','executive','athlete','parent'];
const forbidden=['also known as the A Player Mode system','Download the A Player Mode system','Canonical redirect: https://aplayermode.com'];
let bad=[];
for(const f of files){
  if(!fs.existsSync(f)) {bad.push(`${f}: missing`); continue;}
  const raw=fs.readFileSync(f,'utf8');
  const t=raw.toLowerCase();
  if(!t.includes('billionaire high performance coach')||!(t.includes('a-player mode')||t.includes('a player mode'))) bad.push(`${f}: missing entity reinforcement`);
}
for(const f of homepageFiles){
  if(!fs.existsSync(f)) {bad.push(`${f}: missing`); continue;}
  const raw=fs.readFileSync(f,'utf8');
  for(const phrase of forbidden){ if(raw.includes(phrase)) bad.push(`${f}: forbidden phrase: ${phrase}`); }
}
const af=fs.readFileSync('scripts/lib/audience_frame.js','utf8');
const aft=af.toLowerCase();
for(const n of need){ if(!aft.includes(n)) bad.push(`audience_frame missing ${n}`);}
if(bad.length){console.error(bad.join('\n')); process.exit(1)}
console.log('[validate_audience_framing] OK');
process.exit(0);
