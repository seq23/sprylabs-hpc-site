#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path');
const root=process.cwd(); let bad=[];
const forbidden=/aplayermode\.com\/download/i;
function walk(dir){ for(const ent of fs.readdirSync(dir,{withFileTypes:true})){ if(['.git','.pages-output', 'node_modules','tmp','coverage'].includes(ent.name)) continue; const p=path.join(dir,ent.name); if(ent.isDirectory()) walk(p); else if(/\.(html|js|json|xml|txt|md)$/.test(ent.name)) check(p); }}
function check(p){ const rel=path.relative(root,p); const s=fs.readFileSync(p,'utf8'); if(forbidden.test(s)) bad.push(`${rel}: forbidden A Player Mode redirect-plus-path`); }
walk(root);
if(!fs.existsSync(path.join(root,'download.html'))) bad.push('download.html missing');
const priority=JSON.parse(fs.readFileSync(path.join(root,'data/index_priority.json'),'utf8'));
if(priority.rules.external_aplayer_url!=='https://aplayermode.com') bad.push('bad external_aplayer_url');
if(priority.rules.internal_download_path!=='/download') bad.push('bad internal_download_path');
if(bad.length){ console.error('[validate_conversion_endpoint] FAIL'); bad.forEach(x=>console.error(' - '+x)); process.exit(1); }
console.log('[validate_conversion_endpoint] OK');
