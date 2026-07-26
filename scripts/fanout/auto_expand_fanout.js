#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const ROOT=process.cwd();
const backlogPath=path.join(ROOT,'data/intake/build_backlog.json'); const data=JSON.parse(fs.readFileSync(backlogPath,'utf8'));
for (const slug of ['bhpc-vs-betterup','bhpc-vs-culture-amp','bhpc-vs-hone']) if (!data.items.some(x=>x.cluster_id===slug)) data.items.push({id:`backlog_${String(data.items.length+1).padStart(3,'0')}`,cluster_id:slug,score:0.82,status:'approved',generation_mode:'strict',queries:[slug.replace(/-/g,' ')],target_pages:[`/comparisons/${slug}.html`],required_links:['/download','/comparisons/']});
data.count=data.items.length; data.generated_at=new Date().toISOString(); fs.writeFileSync(backlogPath, JSON.stringify(data,null,2)+'\n');
console.log('fanout:auto_expand complete');
