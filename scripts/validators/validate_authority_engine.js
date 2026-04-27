#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const QUEUE = path.join(ROOT, 'data/authority_paper_queue.json');
function fail(msg){ console.error(`[validate_authority_engine] FAIL: ${msg}`); process.exit(1); }
if (!fs.existsSync(path.join(ROOT, 'scripts/authority/cluster_to_authority.js'))) fail('missing cluster_to_authority.js');
if (!fs.existsSync(path.join(ROOT, 'scripts/authority/generate_whitepaper.js'))) fail('missing generate_whitepaper.js');
if (!fs.existsSync(QUEUE)) fail('missing authority_paper_queue.json');
const queue = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
const items = Array.isArray(queue.items) ? queue.items : [];
for (const item of items) {
  if (!item.cluster_id || !item.slug || !item.canonical_target || !item.cta_target || !item.status) fail(`invalid queue item ${item.id || item.cluster_id || 'unknown'}`);
  const file = path.join(ROOT, 'whitepapers', `${item.slug}.html`);
  if (!fs.existsSync(file)) fail(`missing rendered authority paper ${item.slug}.html`);
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('direct-answer') || !html.includes('cta-block') || !html.includes(item.cta_target)) fail(`authority paper missing contract blocks: ${item.slug}`);
}
console.log(`[validate_authority_engine] OK (${items.length} queue items)`);

process.exit(0);
