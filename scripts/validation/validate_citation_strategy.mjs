#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {readJson,fail,pass,writeSummary} from './common.mjs';
const errors=[];
const contract=readJson('data/citation/citation_strategy_contract.json');
const pages=readJson('data/citation/citable_pages.json').pages.filter(x=>x.status==='ACTIVE');
const queries=readJson('data/citation/query_registry.json').queries.filter(x=>x.release_status==='ACTIVE');
const author=readJson('data/entities/author_profile.json');
const search=readJson('data/search/search_engine_submission_manifest.json');
const requiredFiles=[...contract.layers.substrate.required,...contract.layers.authority.required,...contract.layers.distribution.required];
for(const rel of requiredFiles) if(!fs.existsSync(rel)) errors.push(`missing strategy artifact: ${rel}`);
for(const phrase of ['GPTBot','ClaudeBot','PerplexityBot','Google-Extended','Bingbot']){
  const robots=fs.readFileSync('robots.txt','utf8'); if(!robots.includes(`User-agent: ${phrase}`)) errors.push(`robots.txt missing ${phrase}`);
}
if(!String(author.name||'').trim()||!String(author.role||'').trim()||!String(author.review_role||'').trim()) errors.push('author profile is incomplete');
if(!String(author.credential_policy||'').includes('No professional')) errors.push('author credential policy missing anti-fabrication boundary');
for(const rel of contract.layers.reference_pages.priority_pages){
  const fp=path.join(process.cwd(),rel);
  if(!fs.existsSync(fp)){errors.push(`${rel}: missing priority page`);continue;}
  const html=fs.readFileSync(fp,'utf8');
  const count=(re)=>[...html.matchAll(re)].length;
  if(count(/<h1\b/gi)!==1) errors.push(`${rel}: expected one H1`);
  if(!/<link[^>]+rel=["']canonical["']/i.test(html)&&!/<link[^>]+href=["'][^"']+["'][^>]+rel=["']canonical["']/i.test(html)) errors.push(`${rel}: canonical missing`);
  if(!/class=["'][^"']*citation-definition/i.test(html)) errors.push(`${rel}: bold definition missing`);
  if(count(/data-llm-answer=["']true["']/gi)!==1) errors.push(`${rel}: expected one extraction block`);
  if(!/rel=["']author["']/i.test(html)||!/S\.L\. Taylor/.test(html)) errors.push(`${rel}: visible named author missing`);
  if(!/<time[^>]+datetime=["']2026-06-20["']/i.test(html)) errors.push(`${rel}: reviewed date missing`);
  if(!/id=["']CITATION_PAGE_SCHEMA["']/i.test(html)) errors.push(`${rel}: citation schema missing`);
  if(!/section class=["'][^"']*sources/i.test(html)) errors.push(`${rel}: source basis missing`);
  if(!/href=["']\/download\.html["']/i.test(html)) errors.push(`${rel}: product bridge missing`);
  const page=pages.find(x=>x.path===rel); if(!page) errors.push(`${rel}: not active in citable registry`);
  const owners=queries.filter(x=>x.primary_page===rel); if(owners.length!==1) errors.push(`${rel}: expected one primary query owner, found ${owners.length}`);
}
for(const rel of ['llms.txt','llms-full.txt']){
  const text=fs.readFileSync(rel,'utf8');
  for(const page of contract.layers.reference_pages.priority_pages){const reg=pages.find(x=>x.path===page);if(reg&&!text.includes(reg.canonical_url)) errors.push(`${rel}: missing ${page}`);}
}
if(search.missing_from_sitemap?.length) errors.push(`search manifest has ${search.missing_from_sitemap.length} sitemap gaps`);
const prepared=new Set(search.indexnow?.priority_urls||[]);
for(const rel of contract.layers.reference_pages.priority_pages){const reg=pages.find(x=>x.path===rel);if(reg&&!prepared.has(reg.canonical_url)) errors.push(`search manifest missing priority URL: ${rel}`);}
writeSummary('validate-citation-strategy',{status:errors.length?'FAIL':'PASS',priority_pages:contract.layers.reference_pages.priority_pages.length,required_artifacts:requiredFiles.length,errors});
if(errors.length) fail(`[validate:citation-strategy] FAIL: ${errors.length} issue(s)`,errors);
pass(`[validate:citation-strategy] OK: ${contract.layers.reference_pages.priority_pages.length} priority pages satisfy the repo-adapted four-layer citation strategy`);
