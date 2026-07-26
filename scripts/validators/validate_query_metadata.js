#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
function fail(msg){ console.error(`[validate_query_metadata] FAIL: ${msg}`); process.exit(1); }
function escapeRe(value){ return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function hasMeta(html, name, content){
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  return tags.some(tag => {
    const n = tag.match(/\bname=["']([^"']+)["']/i);
    const c = tag.match(/\bcontent=["']([^"']*)["']/i);
    return n && c && n[1] === name && c[1] === content;
  });
}
const dataPath = path.join(ROOT, 'data/query_metadata.json');
if (!fs.existsSync(dataPath)) fail('missing data/query_metadata.json');
const data = JSON.parse(fs.readFileSync(dataPath,'utf8'));
for (const item of data.items || []) {
  for (const key of ['path','query_target','query_cluster','content_family']) if (!item[key]) fail(`metadata item missing ${key}`);
  const file = path.join(ROOT, item.path.replace(/^\//,''));
  if (!fs.existsSync(file)) fail(`page missing for ${item.path}`);
  const html = fs.readFileSync(file,'utf8');
  const checks = [[item.query_target, 'query-target'],[item.query_cluster, 'query-cluster'],[item.content_family, 'content-family']];
  for (const [value,label] of checks) if (!hasMeta(html,label,value)) fail(`${item.path} missing ${label} meta`);
  if (!html.includes('data-fanout-query-cluster="true"')) fail(`${item.path} missing fanout block`);
  if (!html.includes('data-author-trust="true"')) fail(`${item.path} missing author trust block`);
}
console.log(`[validate_query_metadata] OK (${(data.items||[]).length} pages checked)`);
