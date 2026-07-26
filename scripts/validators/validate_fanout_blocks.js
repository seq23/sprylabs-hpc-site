#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const META = path.join(ROOT, 'data/query_metadata.json');
function fail(msg){ console.error(`[validate_fanout_blocks] FAIL: ${msg}`); process.exit(1); }
if (!fs.existsSync(META)) fail('missing data/query_metadata.json');
const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
let checked = 0;
for (const item of meta.items || []) {
  const file = path.join(ROOT, item.path.replace(/^\//,''));
  if (!fs.existsSync(file)) fail(`page missing: ${item.path}`);
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('data-fanout-query-cluster="true"')) fail(`${item.path} missing fanout query cluster block`);
  if (!html.includes(`data-fanout-topic="${item.query_cluster}"`)) fail(`${item.path} fanout block does not match query cluster ${item.query_cluster}`);
  const blockMatch = html.match(/<section[^>]+data-fanout-query-cluster="true"[\s\S]*?<\/section>/);
  if (!blockMatch) fail(`${item.path} fanout block cannot be parsed`);
  const liCount = (blockMatch[0].match(/<li[\s>]/g) || []).length;
  const linkCount = (blockMatch[0].match(/<a\s+[^>]*href=/g) || []).length;
  if (liCount < 6) fail(`${item.path} fanout block has too few related intents (${liCount})`);
  if (linkCount < 2) fail(`${item.path} fanout block has too few adjacent links (${linkCount})`);
  checked += 1;
}
console.log(`[validate_fanout_blocks] OK (${checked} pages checked)`);
