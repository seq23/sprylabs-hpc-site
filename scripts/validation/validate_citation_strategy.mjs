#!/usr/bin/env node
import fs from 'node:fs';
import { createRequire } from 'node:module';
const requireCjs = createRequire(import.meta.url);
// Route contract: the URL that answers 200 without a redirect hop.
const { routeFor } = requireCjs('../lib/dual_domain_policy.cjs');
import path from 'node:path';
import {readJson,fail,pass,writeSummary} from './common.mjs';
const errors=[];
const contract=readJson('data/citation/citation_strategy_contract.json');
const pages=readJson('data/citation/citable_pages.json').pages.filter(x=>x.status==='ACTIVE');
const queries=readJson('data/citation/query_registry.json').queries.filter(x=>x.release_status==='ACTIVE');
const author=readJson('data/entities/author_profile.json');
const search=readJson('data/search/search_engine_submission_manifest.json');
const requiredFiles=[...contract.layers.substrate.required,...contract.layers.authority.required,...contract.layers.distribution.required];

// Phase 1-4 strategy enforcement for BHPC / APlayerMode only.
if(!String(contract.scope||'').includes('aplayermode.com + billionairehighperformancecoach.com')) errors.push('citation strategy contract scope must be BHPC / APlayerMode only');
for(const banned of ['theindustryguides.com','Industry Guides provider databases']){
  const strategyDoc = fs.existsSync('docs/strategy/BHPC_APLAYER_CITATION_DOMINANCE_STRATEGY.md') ? fs.readFileSync('docs/strategy/BHPC_APLAYER_CITATION_DOMINANCE_STRATEGY.md','utf8') : '';
  if(banned==='theindustryguides.com'){
    if(!strategyDoc.includes('Explicit exclusion')) errors.push('BHPC strategy doc must explicitly exclude non-BHPC strategy sections');
  }
}
const phaseManifest=readJson('data/citation/citation_phase_manifest.json');
if(!String(phaseManifest.scope||'').includes('aplayermode.com + billionairehighperformancecoach.com')) errors.push('phase manifest scope must be BHPC / APlayerMode only');
const inventory=readJson('data/citation/reference_page_inventory.json');
// `inventory.files || []` meant a renamed or emptied key skipped every sitemap and
// llms.txt cross-check below without a word, so the phase inventory could stop
// covering pages and this validator would still report OK.
if(!Array.isArray(inventory.files)) errors.push('data/citation/reference_page_inventory.json has no `files` array; the sitemap-bhpc and llms.txt cross-checks read that key and would silently check nothing');
else if(!inventory.files.length) errors.push('data/citation/reference_page_inventory.json lists 0 files; the sitemap-bhpc and llms.txt cross-checks run only over that list, so an empty inventory proves nothing');
const minimums=contract.phases?.phase_2_coverage?.minimums || phaseManifest.phase_requirements?.phase_2_coverage?.minimums || {};
const invCounts=inventory.counts || {};
for(const [key,min] of Object.entries(minimums)){
  const actual=Number(invCounts[key]||0);
  if(actual < Number(min)) errors.push(`phase 2 coverage too low: ${key}=${actual}, expected >=${min}`);
}
for(const rel of inventory.files || []){
  if(!fs.existsSync(rel)) errors.push(`phase inventory file missing: ${rel}`);
}
for(const rel of [
  'data/citation/citation_phase_manifest.json',
  'data/citation/reference_page_inventory.json',
  'data/citation/methodology_taxonomy.json',
  'data/citation/outcome_pattern_registry.json',
  'data/entities/authority_signal_manifest.json',
  'data/citation/syndication_plan.json',
  'data/citation/citation_velocity_roadmap.json',
  'docs/strategy/BHPC_APLAYER_CITATION_DOMINANCE_STRATEGY.md'
]){
  if(!fs.existsSync(rel)) errors.push(`missing phase strategy artifact: ${rel}`);
}
const sitemapBhpc=fs.readFileSync('sitemap-bhpc.xml','utf8');
const llmsTxt=fs.readFileSync('llms.txt','utf8');
for(const rel of (inventory.files || []).slice(0, 110)){
  const url='https://billionairehighperformancecoach.com' + routeFor(rel);
  if(!sitemapBhpc.includes(url)) errors.push(`sitemap-bhpc missing phase page: ${url}`);
  if(!llmsTxt.includes(url)) errors.push(`llms.txt missing phase page: ${url}`);
}

for(const rel of requiredFiles) if(!fs.existsSync(rel)) errors.push(`missing strategy artifact: ${rel}`);
for(const phrase of ['GPTBot','ClaudeBot','PerplexityBot','Google-Extended','Bingbot']){
  const robots=fs.readFileSync('robots.txt','utf8'); if(!robots.includes(`User-agent: ${phrase}`)) errors.push(`robots.txt missing ${phrase}`);
}
if(!String(author.name||'').trim()||!String(author.role||'').trim()||!String(author.review_role||'').trim()) errors.push('author profile is incomplete');
if(!String(author.credential_policy||'').includes('No professional')) errors.push('author credential policy missing anti-fabrication boundary');
// The per-page citation checks (one H1, canonical, extraction block, named author,
// schema, product bridge) all run inside this loop. An emptied priority_pages list
// would report "OK: 0 priority pages satisfy the four-layer citation strategy".
if(!Array.isArray(contract.layers?.reference_pages?.priority_pages)) fail('[validate:citation-strategy] FAIL: data/citation/citation_strategy_contract.json has no layers.reference_pages.priority_pages array; every per-page citation check reads that key, so there is nothing to check.',errors);
if(!contract.layers.reference_pages.priority_pages.length) errors.push('data/citation/citation_strategy_contract.json lists 0 layers.reference_pages.priority_pages; every per-page citation check runs over that list, so an empty one proves nothing');
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
