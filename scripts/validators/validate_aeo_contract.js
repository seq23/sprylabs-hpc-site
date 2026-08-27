#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'); const ROOT=process.cwd();
const { fileForRoute } = require('../lib/route_resolution.cjs');
function fail(m){console.error('[validate_aeo_contract] FAIL: '+m);process.exit(1)}
function load(p){return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{}}
const paths=new Set(); for(const i of (load(path.join(ROOT,'data/query_metadata.json')).items||[])) paths.add(i.path); for(const n of (load(path.join(ROOT,'data/internal_authority_graph.json')).nodes||[])) paths.add(n.path);
let checked=0; for(const pp of paths){const f=fileForRoute(ROOT,pp); if(!f) fail('missing page: '+pp); const h=fs.readFileSync(f,'utf8'); const top=h.replace(/<script[\s\S]*?<\/script>/g,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,1800).toLowerCase(); if(!h.includes('data-content-contract="above-fold-answer"')) fail(pp+' missing above-fold answer'); if(!top.includes('direct answer')) fail(pp+' missing direct answer near top'); if(!/(system|framework|layer)/i.test(top)) fail(pp+' missing system/framework/layer language'); if(!h.includes('/download.html')&&!h.includes('https://aplayermode.com')) fail(pp+' missing approved CTA'); if(h.includes('aplayermode.com'+'/download')) fail(pp+' has forbidden URL'); if(!h.includes('data-author-trust="true"')) fail(pp+' missing author trust'); if(!h.includes('data-fanout-query-cluster="true"')) fail(pp+' missing fanout'); checked++;}
console.log('[validate_aeo_contract] OK ('+checked+' pages checked)');
