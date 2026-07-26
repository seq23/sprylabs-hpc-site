#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const fs=require('fs'); const path=require('path'); const ROOT=process.cwd(); const IN=path.join(ROOT,'data/queries/fanout_queries.json'); const OUT=path.join(ROOT,'data/queries/page_map.json');
function family(q){ q=String(q).toLowerCase(); if(/ vs |compare|alternative|betterup|hone|culture amp/.test(q)) return 'comparisons'; if(/why|how|what/.test(q)) return 'answers'; if(/research|whitepaper|evidence|report/.test(q)) return 'whitepapers'; return 'insights'; }
function target(q){ const f=family(q); const slug=String(q).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80); return `/${f}/${slug}/`; }
function main(){ const input=fs.existsSync(IN)?JSON.parse(fs.readFileSync(IN,'utf8')):{fanouts:[]}; const mappings=(input.fanouts||[]).map(x=>({query:x.fanout_query,base_query:x.base_query,cluster:x.cluster,intent_family:family(x.fanout_query),target_path:target(x.fanout_query),download_reference:'/download.html',status:'mapped'})); fs.mkdirSync(path.dirname(OUT),{recursive:true}); fs.writeFileSync(OUT,JSON.stringify({generated_at:new Date().toISOString(),allowed_page_families:['answers','insights','comparisons','whitepapers'],count:mappings.length,mappings},null,2)); console.log(`map_queries_to_pages wrote ${mappings.length} mappings`); }
main();
