#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
function read(file, fb){ try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : fb; } catch { return fb; } }
function write(file, data){ fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(data,null,2)+'\n'); }
const meta = read(path.join(ROOT,'data/query_metadata.json'), {items:[]});
const queries = (meta.items || []).map((item, i) => ({ id:`query_${String(i+1).padStart(3,'0')}`, query:item.query_target || item.query || item.path, cluster:item.query_cluster || item.cluster || 'general', target_page:item.path || item.target_page, content_type:item.content_family || 'answer', source:'data/query_metadata.json', funnel_stage:'consideration', entity_target:'Billionaire High Performance Coach', cta_target:'/download' })).filter(x => x.query && x.target_page);
write(path.join(ROOT,'data/intake/query_corpus.json'), {generated_at:new Date().toISOString(), count:queries.length, queries});
console.log(`intake: collected ${queries.length} queries`);
