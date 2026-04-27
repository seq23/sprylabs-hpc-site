#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = process.cwd(); const RUNS_DIR = path.join(ROOT,'data/social/runs'); const OUT_DIR = path.join(ROOT,'data/queries');
const QUERY_RE = /([A-Z0-9][^?!.]{8,140}\?)/gi; const INTENT_TERMS = /(alternative|vs|compare|best|how|what|coach|accountability|system|framework|tool|founder|executive)/i;
function ensureDir(d){ if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); }
function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9? ]+/g,' ').replace(/\s+/g,' ').trim(); }
function score(q){ let s=40; if(/alternative|vs|compare|best/i.test(q)) s+=25; if(/executive coach|accountability|system|framework/i.test(q)) s+=25; if(/founder|executive|operator|leader/i.test(q)) s+=10; return Math.min(100,s); }
function extractFromRecord(r){ const text=[r.term,r.title,r.excerpt,r.body,r.text].filter(Boolean).join(' '); const out=[]; for(const m of text.matchAll(QUERY_RE)) out.push(m[1].trim()); if(!out.length && INTENT_TERMS.test(text)) out.push(String(r.term||r.title||'AI executive coach alternative').trim()); return out; }
function main(){ ensureDir(OUT_DIR); const files=fs.existsSync(RUNS_DIR)?fs.readdirSync(RUNS_DIR).filter(f=>f.endsWith('.json')):[]; const rows=[]; for(const f of files){ const p=path.join(RUNS_DIR,f); const json=JSON.parse(fs.readFileSync(p,'utf8')); for(const r of (json.records||[])){ for(const q of extractFromRecord(r)){ const n=norm(q); if(n.length>=8) rows.push({query:q.replace(/\s+/g,' ').trim(),normalized:n,source_run:f,source_key:r.source_key||'',platform:r.platform||'',score:score(q)}); } } } const seen=new Map(); for(const row of rows){ const old=seen.get(row.normalized); if(!old || row.score>old.score) seen.set(row.normalized,row); } const queries=[...seen.values()].sort((a,b)=>b.score-a.score || a.normalized.localeCompare(b.normalized)); fs.writeFileSync(path.join(OUT_DIR,'extracted_queries.json'),JSON.stringify({generated_at:new Date().toISOString(),count:queries.length,queries},null,2)); console.log(`extract_queries wrote ${queries.length} deduped queries`); }
main();
