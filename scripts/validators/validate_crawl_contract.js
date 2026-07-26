#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path');
const root=process.cwd(); const bad=[];
const priority=JSON.parse(fs.readFileSync(path.join(root,'data/index_priority.json'),'utf8'));
const sitemap=fs.existsSync(path.join(root,'sitemap.xml'))?fs.readFileSync(path.join(root,'sitemap.xml'),'utf8'):'';
const llms=fs.existsSync(path.join(root,'llms.txt'))?fs.readFileSync(path.join(root,'llms.txt'),'utf8'):'';
function fileFor(url){ if(url==='/download') return 'download.html'; return url.replace(/^\//,''); }
for(const group of ['money','comparison','authority']){
  for(const url of priority.classes[group]||[]){
    const rel=fileFor(url); if(!fs.existsSync(path.join(root,rel))) bad.push(`priority ${group} missing file ${rel}`);
    if(url.endsWith('.html') && !sitemap.includes(url)) bad.push(`sitemap missing priority URL ${url}`);
  }
}
for(const url of priority.classes.authority||[]){ if(url.includes('/clusters/') && !llms.includes(url)) bad.push(`llms missing cluster URL ${url}`); }
const admin=fs.existsSync(path.join(root,'admin.html'))?fs.readFileSync(path.join(root,'admin.html'),'utf8'):'';
if(!/noindex,nofollow/i.test(admin)) bad.push('admin.html missing noindex,nofollow');
if(/aplayermode\.com\/download/i.test(sitemap+llms+admin)) bad.push('crawl surfaces contain forbidden A Player Mode redirect-plus-path');
if(!sitemap.includes('/download')) bad.push('sitemap missing /download');
if(bad.length){ console.error('[validate_crawl_contract] FAIL'); bad.forEach(x=>console.error(' - '+x)); process.exit(1); }
console.log('[validate_crawl_contract] OK');
