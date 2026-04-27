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
for (const file of ['author.html','about.html','download.html']){
  const html = fs.readFileSync(path.join(ROOT,file),'utf8');
  if (!/S\.L\. Taylor/.test(html)) fail(`${file} missing S.L. Taylor`);
  if (!/Spry Labs/.test(html)) fail(`${file} missing Spry Labs`);
  if (!/\/download\.html|\/download/.test(html)) fail(`${file} missing download endpoint`);
  if (!/not therapy/i.test(html)) fail(`${file} missing not therapy boundary`);
}
console.log('[validate_author_trust] OK');
