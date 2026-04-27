#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=process.cwd();
const files=['answers/do-you-need-a-life-coach-or-a-system.html','answers/ai-accountability-system-vs-coach.html','answers/ai-executive-coach-alternative.html','answers/chatgpt-vs-executive-coach.html','comparisons/bhpc-vs-betterup.html','comparisons/bhpc-vs-hone.html','comparisons/bhpc-vs-coachhub.html','comparisons/bhpc-vs-torch.html'];
let bad=[];
for(const rel of files){
 const p=path.join(root,rel);
 if(!fs.existsSync(p)){bad.push(rel+': missing');continue;}
 const s=fs.readFileSync(p,'utf8');
 for(const m of ['query-target','query-cluster','content-family']){
  if(!new RegExp('<meta\\s+name=["\\\']'+m+'["\\\']\\s+content=["\\\'][^"\\\']+["\\\']','i').test(s)) bad.push(rel+': missing '+m);
 }
 if(/aplayermode\.com\/download/i.test(s)) bad.push(rel+': forbidden aplayermode.com');
 if(!/S\.L\. Taylor through Spry Labs|data-author-trust=["']true/i.test(s)) bad.push(rel+': missing author trust');
}
if(bad.length){console.error('[validate_query_traceability] FAIL'); bad.forEach(x=>console.error(' - '+x)); process.exit(1)}
console.log('[validate_query_traceability] OK');
