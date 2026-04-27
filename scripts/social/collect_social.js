#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const REGISTRY = path.join(ROOT, 'data/social/source_registry.json');
const OUT_DIR = path.join(ROOT, 'data/social/runs');
const today = new Date().toISOString().slice(0, 10);
const UA = process.env.SOCIAL_USER_AGENT || 'sprylabs-hpc-social-signal-engine/1.0 contact:info@spryvc.com';
const TIMEOUT_MS = Number(process.env.SOCIAL_FETCH_TIMEOUT_MS || 6000);
const TERM_LIMIT = Number(process.env.SOCIAL_TERM_LIMIT || 3);
const { makeThrottle } = require('./throttle');
const HIGH_INTENT = /(discipline|accountability|life coach|executive coach|decision fatigue|burnout|planning|weekly review|daily plan|juggling|multiple projects|founder|entrepreneur|athlete|mom|parent|consistency|follow through|system|tool|program)/i;

function ensureDir(d){ if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); }
function score(text){ let s=0; if(/coach|accountability|system|program|tool|app/i.test(text)) s+=35; if(/discipline|consistency|follow through|planning|decision fatigue/i.test(text)) s+=30; if(/founder|entrepreneur|athlete|mom|parent|professional|multiple projects/i.test(text)) s+=20; if(/cost|worth it|best|vs|how|what/i.test(text)) s+=15; return Math.min(100,s); }
const throttle = makeThrottle();
async function fetchText(url){ await throttle(); const c=new AbortController(); const t=setTimeout(()=>c.abort(),TIMEOUT_MS); try{ const r=await fetch(url,{headers:{'User-Agent':UA},signal:c.signal}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); } finally{ clearTimeout(t); } }
function strip(html){ return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim(); }
async function collectYoutube(source){ const out=[]; for(const term of (source.search_terms||[]).slice(0, TERM_LIMIT)){ try{ const html=await fetchText(`https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`); const text=strip(html).slice(0,4000); if(HIGH_INTENT.test(`${term} ${text}`)) out.push({platform:'youtube',source_key:source.source_key,term,title:term,excerpt:text.slice(0,300),score:score(`${term} ${text}`),captured_at:new Date().toISOString()}); }catch(e){ out.push({platform:'youtube',source_key:source.source_key,term,status:'warning_only_fetch_failed',error:String(e.message||e),captured_at:new Date().toISOString()}); } } return out.filter(x=>!x.error && x.score>=60).slice(0,10); }
function collectManual(source){ const p=path.join(ROOT,'data/social/manual_import.json'); if(!fs.existsSync(p)) return []; const j=JSON.parse(fs.readFileSync(p,'utf8')); return (j.items||[]).map((x,i)=>({platform:'manual',source_key:source.source_key,id:`manual_${i}`,score:score(`${x.title||''} ${x.excerpt||''}`),captured_at:new Date().toISOString(),...x})).filter(x=>x.score>=60); }
async function main(){ ensureDir(OUT_DIR); const registry=JSON.parse(fs.readFileSync(REGISTRY,'utf8')); const results=[]; const health=[]; for(const source of registry.sources||[]){ if(source.status==='inactive') continue; try{ let rows=[]; if(source.platform==='youtube') rows=await collectYoutube(source); else if(source.platform==='manual') rows=collectManual(source); else rows=[]; results.push(...rows); health.push({source_key:source.source_key,platform:source.platform,status:rows.length?'ok':'warning_only_empty',count:rows.length}); }catch(e){ health.push({source_key:source.source_key,platform:source.platform,status:'warning_only_failed',error:String(e.message||e),count:0}); } }
 const payload={generated_at:new Date().toISOString(),policy:registry.policy,pipeline_role:registry.pipeline_role||'query_discovery_only',records:results,health}; fs.writeFileSync(path.join(OUT_DIR,`${today}.json`),JSON.stringify(payload,null,2)); console.log(`social:collect wrote ${results.length} high-intent social records`); if(health.some(h=>h.status!=='ok')) console.warn('social:collect warning-only source gaps present'); }
main().catch(e=>{ console.error(e); process.exit(1); });
