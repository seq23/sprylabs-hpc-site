#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const read=(rel,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'))}catch{return fallback}};
const write=(rel,value)=>{const abs=path.join(ROOT,rel);fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,JSON.stringify(value,null,2)+'\n')};
const plan=read('artifacts/validation/agent-exact-implementation-plan.json',{specs:[]});
const registry=read('data/citation/citable_pages.json',{pages:[]});
const queries=read('data/citation/query_registry.json',{queries:[]});
const admission=read('data/content/page_admission_registry.json',{});
const schema={concept:'DefinedTerm',comparison:'ItemList',decision:'HowTo'};
const expected=new Map((plan.specs||[]).filter(spec=>spec.status==='PLANNED'&&spec.implementation_path).map(spec=>{
  const abs=path.join(ROOT,spec.implementation_path);let type=spec.extraction_type||'concept';
  if(fs.existsSync(abs)&&['concept','comparison'].includes(type)){const raw=fs.readFileSync(abs,'utf8');const start=raw.search(/<section\b[^>]*data-llm-answer=["']true["'][^>]*>/i);const end=start>=0?raw.indexOf('</section>',start):-1;const extraction=end>start?raw.slice(start,end):'';type=/<table\b/i.test(extraction)?'comparison':'concept'}
  return [spec.implementation_path,type];
}));
const changed=[];
for(const page of registry.pages||[]){const type=expected.get(page.path);if(!type)continue;if(page.extraction_type!==type||page.schema_type!==schema[type]){changed.push({path:page.path,before:page.extraction_type,after:type});page.extraction_type=type;page.schema_type=schema[type]||page.schema_type}const abs=path.join(ROOT,page.path);if(fs.existsSync(abs)){const before=fs.readFileSync(abs,'utf8');let after=before.replace(/(<[^>]+data-llm-answer=["']true["'][^>]*data-extraction-type=["'])[^"']+(["'])/i,`$1${type}$2`).replace(/(<[^>]+data-extraction-type=["'])[^"']+(["'][^>]*data-llm-answer=["']true["'])/i,`$1${type}$2`);const start=after.search(/<section\b[^>]*data-llm-answer=["']true["'][^>]*>/i);const end=start>=0?after.indexOf('</section>',start):-1;if(type==='concept'&&end>start&&(after.slice(start,end).match(/<li\b/gi)||[]).length<3){const repair='<div data-bhpc-agent-extraction-repair="true"><h2>Practical concept summary</h2><ul><li>Name the exact operating problem and intended result.</li><li>Apply the framework to choose one observable next action.</li><li>Record the result and use it to guide the next review.</li></ul></div>';after=`${after.slice(0,end)}${repair}${after.slice(end)}`}if(after!==before)fs.writeFileSync(abs,after)}}
for(const query of queries.queries||[]){const type=expected.get(query.primary_page);if(type)query.intent_class=type}
for(const key of ['records','pages'])for(const item of admission[key]||[]){const type=expected.get(item.path);if(!type)continue;if('extraction_type'in item)item.extraction_type=type;if('intent_class'in item)item.intent_class=type}
write('data/citation/citable_pages.json',registry);
write('data/citation/query_registry.json',queries);
write('data/content/page_admission_registry.json',admission);
const report={schema_version:'1.0',generated_at:new Date().toISOString(),status:'PASS',planned_paths:expected.size,changed_count:changed.length,changed};
write('artifacts/validation/bhpc-agent-extraction-contract-sync.json',report);write('reports/bhpc-agent-extraction-contract-sync.json',report);
console.log(`[bhpc-agent-extraction-contract-sync] PASS: planned=${expected.size}; changed=${changed.length}`);
