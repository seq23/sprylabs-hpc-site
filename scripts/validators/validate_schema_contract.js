#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path');
const root=process.cwd();
const required={
  'index.html':['WebPage','DefinedTerm','Organization','Product'],
  'download.html':['WebPage','DefinedTerm','Product'],
  'about.html':['WebPage','DefinedTerm','Organization'],
  'author.html':['WebPage','DefinedTerm','Person'],
  'comparisons/bhpc-vs-betterup.html':['WebPage','DefinedTerm'],
  'comparisons/bhpc-vs-hone.html':['WebPage','DefinedTerm'],
  'comparisons/bhpc-vs-coachhub.html':['WebPage','DefinedTerm'],
  'comparisons/bhpc-vs-torch.html':['WebPage','DefinedTerm']
};
let bad=[];
function read(rel){const p=path.join(root,rel); if(!fs.existsSync(p)){bad.push(`${rel}: missing`); return '';} return fs.readFileSync(p,'utf8');}
function graphFor(rel,s){
  const m=s.match(/<script[^>]+id=["']CITATION_PAGE_SCHEMA["'][^>]*>([\s\S]*?)<\/script>/i);
  if(!m){bad.push(`${rel}: missing final citation schema`); return [];}
  try{return JSON.parse(m[1])['@graph']||[];}catch(e){bad.push(`${rel}: invalid final citation schema`); return [];}
}
for(const [rel,types] of Object.entries(required)){
  const s=read(rel); if(!s) continue;
  const graph=graphFor(rel,s); const actual=new Set(graph.flatMap(x=>Array.isArray(x['@type'])?x['@type']:[x['@type']]));
  for(const type of types){if(!actual.has(type)) bad.push(`${rel}: missing schema type ${type}`);}
  const hasVisibleFaq=/<section[^>]+(?:class=["'][^"']*(?:faq|citation-faq)[^"']*["']|data-visible-faq=["']true["'])/i.test(s);
  if(actual.has('FAQPage')!==hasVisibleFaq) bad.push(`${rel}: FAQPage presence does not match visible FAQ`);
  if(actual.has('SoftwareApplication')) bad.push(`${rel}: unsupported SoftwareApplication schema`);
}
for(const rel of ['answers/ai-accountability-system-vs-coach.html','answers/ai-executive-coach-alternative.html','answers/chatgpt-vs-executive-coach.html','answers/do-you-need-a-life-coach-or-a-system.html']){
  const s=read(rel); if(!s) continue; if(!/query-target/i.test(s)) bad.push(`${rel}: missing query-target metadata`);
}
if(bad.length){ console.error('[validate_schema_contract] FAIL'); bad.forEach(x=>console.error(' - '+x)); process.exit(1); }
console.log('[validate_schema_contract] OK');
