#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const fs=require('fs'); const path=require('path'); const ROOT=process.cwd(); const MAP=path.join(ROOT,'data/queries/page_map.json'); const OUT=path.join(ROOT,'data/queries/patch_plan.json'); const PROTECTED=new Set(['product.html','download.html']);
function contract(query){ return {above_the_fold_match:query,explicit_answer:`This page should directly answer: ${query}`,disambiguation:['This is not therapy.','This is not legal arbitration.'],system_terms:['system','framework','layer'],named_entity_alignment:['BetterUp','Hone','Culture Amp'],cta:'/download.html'}; }
function main(){ const m=fs.existsSync(MAP)?JSON.parse(fs.readFileSync(MAP,'utf8')):{mappings:[]}; const patches=(m.mappings||[]).filter(x=>!PROTECTED.has(String(x.target_path||'').replace(/^\//,''))).map(x=>({target_path:x.target_path,query:x.query,operation:'page_contract_patch_plan',contract:contract(x.query),auto_apply:false})); fs.mkdirSync(path.dirname(OUT),{recursive:true}); fs.writeFileSync(OUT,JSON.stringify({generated_at:new Date().toISOString(),protected_files:[...PROTECTED],patches},null,2)); console.log(`generate_patch_plan wrote ${patches.length} planned patches; protected files excluded`); }
main();
