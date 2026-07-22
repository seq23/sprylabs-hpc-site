#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const fs=require('fs'); const path=require('path'); const ROOT=process.cwd(); const allowed=['answers','insights','comparisons','whitepapers'];
function fail(msg){ console.error('PAGE_CONTRACT_FAIL: '+msg); process.exitCode=1; }
function checkPlan(){ const p=path.join(ROOT,'data/queries/patch_plan.json'); if(!fs.existsSync(p)) return; const j=JSON.parse(fs.readFileSync(p,'utf8')); for(const patch of j.patches||[]){ if(!allowed.some(f=>String(patch.target_path||'').startsWith('/'+f+'/'))) fail('orphan or forbidden page family: '+patch.target_path); const c=patch.contract||{}; if(c.cta!=='/download.html') fail('missing /download CTA for '+patch.target_path); if(!String(c.explicit_answer||'').trim()) fail('missing explicit answer for '+patch.target_path); if(!Array.isArray(c.system_terms)||!c.system_terms.includes('system')||!c.system_terms.includes('framework')||!c.system_terms.includes('layer')) fail('missing system/framework/layer terms for '+patch.target_path); } }
function checkProtected(){ for(const fileName of ['guides/product.html','download.html']){ const p=path.join(ROOT,fileName); if(fs.existsSync(p)){ const html=fs.readFileSync(p,'utf8'); if(/data-auto-patched="true"/.test(html)) fail(fileName+' contains automated patch marker'); } } }
checkPlan(); checkProtected(); if(!process.exitCode) console.log('validate_page_contracts passed');
