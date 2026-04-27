#!/usr/bin/env node
'use strict';
const fs=require('fs');
const cta='https://aplayermode.com/download';
const required=['admin.html','download.html','index.html','comparisons/bhpc-vs-betterup.html','comparisons/bhpc-vs-hone.html','comparisons/bhpc-vs-culture-amp.html'];
const bad=[]; for(const f of required){ if(!fs.existsSync(f)) bad.push(`${f}: missing`); else if(!fs.readFileSync(f,'utf8').includes(cta)) bad.push(`${f}: missing CTA`);}
if(bad.length){console.error(bad.join('\n')); process.exit(1)}
console.log('[validate_conversion_targets] OK');

process.exit(0);
