#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path');
const { fileForRoute } = require('../lib/route_resolution.cjs');
const root=process.cwd(); const bad=[];
const priority=JSON.parse(fs.readFileSync(path.join(root,'data/index_priority.json'),'utf8'));
// /sitemap.xml is now a host-neutral sitemap index; the URLs live in the two
// per-host child sitemaps, so priority coverage is checked against those.
const readIf=(f)=>fs.existsSync(path.join(root,f))?fs.readFileSync(path.join(root,f),'utf8'):'';
const sitemapIndex=readIf('sitemap.xml');
const sitemap=readIf('sitemap-bhpc.xml')+readIf('sitemap-spry.xml');
const llms=fs.existsSync(path.join(root,'llms.txt'))?fs.readFileSync(path.join(root,'llms.txt'),'utf8'):'';
// Priority URLs are canonical routes (extensionless, or trailing-slash for a
// directory index). Resolve one back to the file that answers it.
function fileFor(url){
  if(url==='/download') return 'download.html';
  const abs = fileForRoute(root, url);
  return abs ? path.relative(root, abs) : url.replace(/^\//,'');
}
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
if(!/<sitemapindex\b/.test(sitemapIndex)) bad.push('sitemap.xml must be a host-neutral <sitemapindex>');
for(const child of ['sitemap-bhpc.xml','sitemap-spry.xml']){ if(!sitemapIndex.includes(child)) bad.push(`sitemap.xml index missing child ${child}`); }
if(!sitemap.includes('/download')) bad.push('sitemap missing /download');
if(bad.length){ console.error('[validate_crawl_contract] FAIL'); bad.forEach(x=>console.error(' - '+x)); process.exit(1); }
console.log('[validate_crawl_contract] OK');
