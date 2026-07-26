#!/usr/bin/env node
'use strict';
const fs=require('fs');
const discovery='https://aplayermode.com';
const purchase='https://sprylabs.gumroad.com/l/billionaire-high-performance-coach';
const requiredDiscovery=['index.html','comparisons/bhpc-vs-betterup.html','comparisons/bhpc-vs-hone.html','comparisons/bhpc-vs-culture-amp.html'];
const requiredPurchase=['download.html','index.html'];
const bad=[];
for(const f of requiredDiscovery){ if(!fs.existsSync(f)) bad.push(`${f}: missing`); else if(!fs.readFileSync(f,'utf8').includes(discovery)) bad.push(`${f}: missing discovery CTA`);}
for(const f of requiredPurchase){ if(!fs.existsSync(f)) bad.push(`${f}: missing`); else if(!fs.readFileSync(f,'utf8').includes(purchase)) bad.push(`${f}: missing Gumroad purchase CTA`);}
if(fs.existsSync('download.html')){
  const d=fs.readFileSync('download.html','utf8');
  if(d.includes('href="https://aplayermode.com"')) bad.push('download.html: APlayerMode link should not appear as CTA on discovery page');
}
if(bad.length){console.error(bad.join('\n')); process.exit(1)}
console.log('[validate_conversion_targets] OK');
process.exit(0);
