#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const errors = [];
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }
function readJson(p, fallback) { try { return exists(p) ? JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')) : fallback; } catch (e) { errors.push(`${p}: invalid JSON (${e.message})`); return fallback; } }
['sitemap.xml','llms.txt','robots.txt','download.html','package.json'].forEach(p => { if (!exists(p)) errors.push(`${p}: missing critical file`); });
const download = exists('download.html') ? fs.readFileSync(path.join(ROOT, 'download.html'), 'utf8') : '';
if (download && !/gumroad\.com|aplayermode\.com|Get Instant Access|download/i.test(download)) errors.push('download.html: conversion language or endpoint not detectable');
const manifest = readJson('data/reddit/published_manifest.json', { items: [] });
const registry = readJson('data/reddit/cluster_registry.json', { clusters: [] });
const registrySlugs = new Set((registry.clusters || []).map(i => i.slug).filter(Boolean));
for (const item of (manifest.items || [])) {
  if (!item.slug || !item.route) errors.push(`published_manifest item missing slug/route: ${JSON.stringify(item).slice(0,120)}`);
  if (item.target_file && !exists(item.target_file)) errors.push(`published_manifest target missing: ${item.target_file}`);
  if (item.slug && !registrySlugs.has(item.slug)) errors.push(`cluster_registry missing published slug: ${item.slug}`);
}
const canonicals = new Map();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.pages-output', 'node_modules','.git','scripts','data','.github','_ops','docs','templates'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      const html = fs.readFileSync(full, 'utf8');
      const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
      if (match) {
        const c = match[1];
        const owners = canonicals.get(c) || [];
        owners.push(rel);
        canonicals.set(c, owners);
      }
    }
  }
}
walk(ROOT);
for (const [canonical, owners] of canonicals.entries()) if (owners.length > 1) errors.push(`duplicate canonical ${canonical}: ${owners.join(', ')}`);
if (errors.length) {
  console.error('[validate_velocity_critical] FAIL');
  errors.forEach(e => console.error(` - ${e}`));
  process.exit(1);
}
console.log(`[validate_velocity_critical] OK (${canonicals.size} canonicals checked)`);
