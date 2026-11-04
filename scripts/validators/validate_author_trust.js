#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
function fail(msg){ console.error(`[validate_author_trust] FAIL: ${msg}`); process.exit(1); }
function readJson(file){ try { return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8')); } catch(e){ fail(`missing or invalid ${file}: ${e.message}`); } }
const author = readJson('data/entities/author_profile.json');
const org = readJson('data/entities/org_profile.json');
const entities = readJson('data/entities/entity_registry.json');
for (const key of ['name','role','publisher','canonical_author_page','trust_statement']) if (!author[key]) fail(`author_profile missing ${key}`);
for (const key of ['name','canonical_domain','conversion_endpoint','product']) if (!org[key]) fail(`org_profile missing ${key}`);
if (!Array.isArray(entities.categories) || entities.categories.length < 5) fail('entity_registry categories too thin');
if (!Array.isArray(entities.coaching_platforms) || entities.coaching_platforms.length < 3) fail('entity_registry coaching platforms too thin');
for (const file of ['author.html','download.html']){
  const html = fs.readFileSync(path.join(ROOT,file),'utf8');
  if (!/S\.L\. Taylor/.test(html)) fail(`${file} missing S.L. Taylor`);
  if (!/Spry Labs/.test(html)) fail(`${file} missing Spry Labs`);
  if (!/\/download\.html|\/download/.test(html)) fail(`${file} missing download endpoint`);
  if (!/not therapy/i.test(html)) fail(`${file} missing not therapy boundary`);
}
// The replacement Spry edition credits its publisher rather than an individual.
// Prove that the visible byline and Article resolve to that same organization.
const about = fs.readFileSync(path.join(ROOT, 'about.html'), 'utf8');
const schema = JSON.parse(about.match(/<script id="CITATION_PAGE_SCHEMA" type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] || '{}');
const graph = schema['@graph'] || [];
const publisher = graph.find(node => node['@type'] === 'Organization' && node.name === org.name);
const article = graph.find(node => node['@type'] === 'Article');
if (!publisher?.['@id'] || article?.author?.['@id'] !== publisher['@id'] || article?.publisher?.['@id'] !== publisher['@id']) fail('about.html has no consistent publisher attribution');
if (!new RegExp('<a\\b[^>]*href="/about"[^>]*rel="author"[^>]*>' + org.name + '</a>').test(about)) fail('about.html lacks its visible publisher byline');
const {spawnSync} = require('child_process');
const destination = spawnSync('python3', ['-c', 'import sys; sys.path.insert(0,"scripts/citation"); from conversion_links import has_manual_link; sys.exit(0 if has_manual_link(sys.stdin.read()) else 1)'], {cwd:ROOT,input:about,encoding:'utf8'});
if (destination.status !== 0) fail('about.html missing download destination');
if (!/not therapy/i.test(about)) fail('about.html missing not therapy boundary');
console.log('[validate_author_trust] OK');
