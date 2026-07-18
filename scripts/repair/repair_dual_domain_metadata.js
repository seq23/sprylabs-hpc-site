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
function extractTagValue(html, tagName, keyName, keyValue, valueAttr) {
  const re = new RegExp(`<${tagName}[^>]*${keyName}=["']${keyValue}["'][^>]*${valueAttr}=["']([^"']*)["'][^>]*>|<${tagName}[^>]*${valueAttr}=["']([^"']*)["'][^>]*${keyName}=["']${keyValue}["'][^>]*>`, 'is');
  const m = html.match(re);
  if (!m) return '';
  return m[1] || m[2] || '';
}
function hasNoindex(html) {
  return extractTagValue(html, 'meta', 'name', 'robots', 'content').toLowerCase().includes('noindex');
}
function normalizeTitle(title) {
  return String(title || '').replace(/\s+/g, ' ').trim();
}
function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function titleQualifier(rel) {
  if (rel.startsWith('agent/bhpc/')) return 'BHPC Agent Page';
  if (rel.startsWith('answers/')) return 'Answer Page';
  if (rel.startsWith('comparisons/')) return 'Comparison Page';
  if (rel.startsWith('pillars/')) return 'Pillar Page';
  if (rel.startsWith('insights/') || rel.startsWith('content/insights/')) return 'Insight Page';
  if (rel.startsWith('coverage/')) return 'Coverage Page';
  if (/framework/i.test(rel)) return 'Framework Page';
  return 'Spry Page';
}
function routeToken(rel) {
  return rel
    .replace(/\/index\.html$/,'')
    .replace(/\.html$/,'')
    .split('/')
    .filter(Boolean)
    .slice(-2)
    .join(' ')
    .replace(/[-_]+/g,' ')
    .replace(/\b\w/g,(c)=>c.toUpperCase())
    .replace(/\s+/g,' ')
    .trim();
}
function titleWithQualifier(title, qualifier) {
  const siteSuffix = ' | Spry Executive OS';
  if (title.endsWith(siteSuffix)) return `${title.slice(0, -siteSuffix.length)} | ${qualifier}${siteSuffix}`;
  return `${title} | ${qualifier}`;
}
function uniqueTitleFor(rel, title, seenTitles) {
  const qualifier = titleQualifier(rel);
  const candidates = [titleWithQualifier(title, qualifier)];
  const token = routeToken(rel);
  if (token) candidates.push(titleWithQualifier(title, `${qualifier}: ${token}`));
  for (const candidate of candidates) {
    if (!seenTitles.has(candidate)) return candidate;
  }
  let n = 2;
  while (seenTitles.has(titleWithQualifier(title, `${qualifier}: ${token || 'Route'} ${n}`))) n++;
  return titleWithQualifier(title, `${qualifier}: ${token || 'Route'} ${n}`);
}
function replaceTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
}
let changedFiles=0;
let inserted=0;
const changes=[];
const files = walk(root);
for (const file of files) {
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
const seenTitles = new Map();
const titleRepairs = [];
for (const file of files) {
  const rel=path.relative(root,file).replace(/\\/g,'/');
  let html=fs.readFileSync(file,'utf8');
  if (hasNoindex(html)) continue;
  const currentTitle = normalizeTitle(((html.match(/<title>([\s\S]*?)<\/title>/i) || [,''])[1] || ''));
  if (!currentTitle) continue;
  if (!seenTitles.has(currentTitle)) {
    seenTitles.set(currentTitle, rel);
    continue;
  }
  const duplicateOf = seenTitles.get(currentTitle);
  const repairedTitle = uniqueTitleFor(rel, currentTitle, seenTitles);
  const before = html;
  html = replaceTitle(html, repairedTitle);
  let r = replaceTagValue(html,'meta','property','og:title','content',escapeAttr(repairedTitle)); html = r.html;
  r = replaceTagValue(html,'meta','name','twitter:title','content',escapeAttr(repairedTitle)); html = r.html;
  if (html !== before) {
    fs.writeFileSync(file,html);
    changedFiles++;
    titleRepairs.push({path:rel,duplicate_of:duplicateOf,old_title:currentTitle,new_title:repairedTitle});
  }
  seenTitles.set(repairedTitle, rel);
}
const report={status:'PASS',changed_files:changedFiles,inserted_canonicals:inserted,title_repairs:titleRepairs.length,changes,title_repair_details:titleRepairs};
fs.mkdirSync(path.join(root,'artifacts/validation'),{recursive:true});
fs.writeFileSync(path.join(root,'artifacts/validation/dual-domain-metadata-repair.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[repair:dual-domain-metadata] PASS: changed=${changedFiles}; inserted=${inserted}; title_repairs=${titleRepairs.length}`);
