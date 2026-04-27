#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path');
const root=process.cwd();
const required={
  'index.html':['Organization','Person','SoftwareApplication','FAQPage'],
  'download.html':['Organization','Person','SoftwareApplication','FAQPage'],
  'about.html':['Organization','Person'],
  'author.html':['Person'],
  'comparisons/bhpc-vs-betterup.html':['SoftwareApplication','FAQPage'],
  'comparisons/bhpc-vs-hone.html':['SoftwareApplication','FAQPage'],
  'comparisons/bhpc-vs-coachhub.html':['SoftwareApplication','FAQPage'],
  'comparisons/bhpc-vs-torch.html':['SoftwareApplication','FAQPage']
};
let bad=[];
function read(rel){const p=path.join(root,rel); if(!fs.existsSync(p)){bad.push(`${rel}: missing`); return '';} return fs.readFileSync(p,'utf8');}
for(const [rel,types] of Object.entries(required)){
  const s=read(rel); if(!s) continue;
  if(!/application\/ld\+json/i.test(s)) bad.push(`${rel}: missing JSON-LD script`);
  for(const type of types){ if(!new RegExp('"@type"\\s*:\\s*"'+type+'"','i').test(s)) bad.push(`${rel}: missing schema type ${type}`); }
}
for(const rel of ['answers/ai-accountability-system-vs-coach.html','answers/ai-executive-coach-alternative.html','answers/chatgpt-vs-executive-coach.html','answers/do-you-need-a-life-coach-or-a-system.html']){
  const s=read(rel); if(!s) continue; if(!/query-target/i.test(s)) bad.push(`${rel}: missing query-target metadata`);
}
if(bad.length){ console.error('[validate_schema_contract] FAIL'); bad.forEach(x=>console.error(' - '+x)); process.exit(1); }
console.log('[validate_schema_contract] OK');
