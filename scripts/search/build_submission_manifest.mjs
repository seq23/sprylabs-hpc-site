#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const readJson=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const parseLocs=(rel)=>[...fs.readFileSync(path.join(root,rel),'utf8').matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1].trim());
const contract=readJson('data/citation/citation_strategy_contract.json');
const config=readJson('distribution.config.json');
const urls=[];
for(const rel of contract.layers.reference_pages.priority_pages){
  const page=readJson('data/citation/citable_pages.json').pages.find(x=>x.path===rel&&x.status==='ACTIVE');
  if(page) urls.push(page.canonical_url);
}
const unique=[...new Set(urls)];
const sitemapUrls=[...new Set([...parseLocs('sitemap-bhpc.xml'),...parseLocs('sitemap-spry.xml')])];
const missingFromSitemap=unique.filter(u=>!sitemapUrls.includes(u));
const manifest={
  schema_version:'1.0',
  generated_at:new Date().toISOString(),
  repo:'sprylabs-hpc-site',
  indexnow:{
    configured:Boolean(config.indexnow?.key&&config.indexnow?.key_file),
    key_file:config.indexnow?.key_file||null,
    priority_file:config.indexnow?.priority_file||null,
    batch_file:config.indexnow?.batch_file||null,
    priority_urls:unique,
    submission_status:'PREPARED_NOT_SUBMITTED_IN_CONTAINER'
  },
  google_search_console:{
    sites:config.gsc?.sites||[],
    priority_urls:unique,
    recommended_actions:['Submit or verify both sitemap URLs in Search Console.','Use URL Inspection for the new and materially changed priority pages after deployment.','Request indexing only for the priority pages, not the entire site.'],
    submission_status:'OWNER_ACCOUNT_ACTION_REQUIRED'
  },
  bing_webmaster_tools:{
    sites:(config.gsc?.sites||[]).map(x=>({host:x.host,sitemap:x.sitemaps?.[0]||null})),
    priority_urls:unique,
    recommended_actions:['Verify both sites in Bing Webmaster Tools.','Submit the current sitemaps.','Use IndexNow for the priority URLs after deployment.'],
    submission_status:'OWNER_ACCOUNT_ACTION_REQUIRED'
  },
  missing_from_sitemap:missingFromSitemap
};
fs.mkdirSync(path.join(root,'data/search'),{recursive:true});
fs.writeFileSync(path.join(root,'data/search/search_engine_submission_manifest.json'),JSON.stringify(manifest,null,2)+'\n');
if(missingFromSitemap.length){console.error(`search submission manifest: ${missingFromSitemap.length} priority URL(s) missing from sitemap`);process.exit(1);}
console.log(`search submission manifest: ${unique.length} priority URL(s) prepared for IndexNow, GSC, and Bing`);
