#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { routeFor, hostFor } = require('../lib/dual_domain_policy.cjs');

const root = process.cwd();
const skipDirs = new Set(['.git','node_modules','_ops','templates','docs']);
const publishedManifestPath = path.join(root, 'data/reddit/published_manifest.json');
const publishedManifest = fs.existsSync(publishedManifestPath) ? JSON.parse(fs.readFileSync(publishedManifestPath, 'utf8')) : { items: [] };
const publishedHostOverrides = new Map((publishedManifest.items || []).map((item) => [item.route, item.canonical_host]));

function walk(dir, out=[]) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const full=path.join(dir,entry.name);
    const rel=path.relative(root,full).replace(/\\/g,'/');
    if (rel.startsWith('data/report_fixes/agent_runs/')) continue;
    if (entry.isDirectory()) walk(full,out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}
function replaceTagValue(html, tag, keyName, keyValue, valueAttr, value) {
  const a = new RegExp(`<${tag}([^>]*?)${keyName}=["']${keyValue}["']([^>]*?)${valueAttr}=["'][^"']*["']([^>]*)>`, 'ig');
  const b = new RegExp(`<${tag}([^>]*?)${valueAttr}=["'][^"']*["']([^>]*?)${keyName}=["']${keyValue}["']([^>]*)>`, 'ig');
  let changed=false;
  html=html.replace(a,(_m,x,y,z)=>{changed=true;return `<${tag}${x}${keyName}="${keyValue}"${y}${valueAttr}="${value}"${z}>`;});
  html=html.replace(b,(_m,x,y,z)=>{changed=true;return `<${tag}${x}${valueAttr}="${value}"${y}${keyName}="${keyValue}"${z}>`;});
  return {html,changed};
}
let changedFiles=0;
let inserted=0;
const changes=[];
for (const file of walk(root)) {
  const rel=path.relative(root,file).replace(/\\/g,'/');
  const route=routeFor(rel);
  const canonical=hostFor(route,publishedHostOverrides)+route;
  let html=fs.readFileSync(file,'utf8');
  const before=html;
  let r=replaceTagValue(html,'link','rel','canonical','href',canonical); html=r.html;
  if (!r.changed && /<head\b/i.test(html)) {
    html=html.replace(/<head([^>]*)>/i, `<head$1>\n<link rel="canonical" href="${canonical}">`);
    inserted++;
  }
  r=replaceTagValue(html,'meta','property','og:url','content',canonical); html=r.html;
  if (!r.changed && /<head\b/i.test(html)) html=html.replace(/<head([^>]*)>/i, `<head$1>\n<meta property="og:url" content="${canonical}">`);
  if (html!==before) {
    fs.writeFileSync(file,html);
    changedFiles++;
    changes.push({path:rel,canonical});
  }
}
const report={status:'PASS',changed_files:changedFiles,inserted_canonicals:inserted,changes};
fs.mkdirSync(path.join(root,'artifacts/validation'),{recursive:true});
fs.writeFileSync(path.join(root,'artifacts/validation/dual-domain-metadata-repair.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[repair:dual-domain-metadata] PASS: changed=${changedFiles}; inserted=${inserted}`);
