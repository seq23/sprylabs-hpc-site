#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const FORBIDDEN = /https?:\/\/aplayermode\.com\/download\b|aplayermode\.com\/download\b/g;
const APPROVED_EXTERNAL = new Set(['https://aplayermode.com','http://aplayermode.com']);
const exts = new Set(['.html','.htm','.js','.json','.txt','.xml','.md','.css']);
const skip = new Set(['.git','.pages-output', 'node_modules','dist','coverage','tmp','.build','releases','_ops','audit']);
let failures = [];
function walk(dir){
  for (const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(skip.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if(ent.isDirectory()) walk(p);
    else if(exts.has(path.extname(ent.name))) check(p);
  }
}
function check(file){
  const rel = path.relative(ROOT,file);
  const text = fs.readFileSync(file,'utf8');
  if(FORBIDDEN.test(text)) failures.push(`${rel} contains forbidden A Player Mode redirect-plus-path URL`);
  FORBIDDEN.lastIndex = 0;
  const matches = text.match(/https?:\/\/aplayermode\.com\/[A-Za-z0-9_./?#=&%-]*/g) || [];
  for(const url of matches){
    const normalized = url.replace(/\/$/,'');
    if(!APPROVED_EXTERNAL.has(normalized)) failures.push(`${rel} contains unapproved A Player Mode URL: ${url}`);
  }
}
walk(ROOT);
if(failures.length){
  console.error('[validate_url_contract] FAIL');
  for(const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('[validate_url_contract] OK');
