#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
function fail(msg){ console.error(`[validate_entity_coverage] FAIL: ${msg}`); process.exit(1); }
function readJson(rel){ try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch(e){ fail(`missing or invalid ${rel}: ${e.message}`); } }
const registry = readJson('data/entities/entity_registry.json');
const metadata = readJson('data/query_metadata.json');
const platformEntities = registry.coaching_platforms || [];
const categoryEntities = registry.categories || [];
if (platformEntities.length < 4) fail('coaching_platforms must include at least 4 entities');
if (categoryEntities.length < 7) fail('categories must include at least 7 entities');
for (const item of metadata.items || []) {
  const rel = item.path.replace(/^\//,'');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) fail(`metadata target missing: ${item.path}`);
  const html = fs.readFileSync(file,'utf8');
  const lower = html.toLowerCase();
  const foundPlatforms = platformEntities.filter(e => lower.includes(String(e).toLowerCase()));
  const foundCategories = categoryEntities.filter(e => lower.includes(String(e).toLowerCase()));
  for (const phrase of ['Billionaire High Performance Coach','A Player Mode','Spry Labs','S.L. Taylor']) if (!html.includes(phrase)) fail(`${item.path} missing ${phrase}`);
  if (foundPlatforms.length < 2) fail(`${item.path} needs at least 2 coaching platform entities`);
  if (foundCategories.length < 2) fail(`${item.path} needs at least 2 category entities`);
  if (!/not therapy/i.test(html)) fail(`${item.path} missing not-therapy disambiguation`);
  if (!/\/download(?:\.html)?|aplayermode\.com\/download/.test(html)) fail(`${item.path} missing download CTA`);
}
console.log(`[validate_entity_coverage] OK (${(metadata.items||[]).length} metadata pages checked)`);
