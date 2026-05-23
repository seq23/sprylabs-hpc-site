#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const sourcePath = path.join(root, 'data/citation_opportunities/bhpc_priority_queries.json');
if (!fs.existsSync(sourcePath)) {
  console.error('[citation:build] missing data/citation_opportunities/bhpc_priority_queries.json');
  process.exit(1);
}
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const items = source.items || [];
const missing = [];
const byTarget = new Map();
for (const item of items) {
  if (!item.query || !item.target_file || !item.answer_page) {
    missing.push(`malformed item: ${JSON.stringify(item).slice(0, 180)}`);
    continue;
  }
  if (!fs.existsSync(path.join(root, item.target_file))) missing.push(`missing target page: ${item.target_file} (${item.query})`);
  if (!fs.existsSync(path.join(root, item.answer_page))) missing.push(`missing answer page: ${item.answer_page} (${item.query})`);
  const bucket = byTarget.get(item.target_file) || [];
  bucket.push(item);
  byTarget.set(item.target_file, bucket);
}
const targets = Array.from(byTarget.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([targetFile, rows]) => ({
  target_file: targetFile,
  target_url: rows[0].intended_winner_url,
  queries: rows.map(row => row.query),
  answer_pages: rows.map(row => row.answer_page),
  answer_shapes: Array.from(new Set(rows.map(row => row.answer_shape))).sort(),
  gap_types: Array.from(new Set(rows.map(row => row.gap_type))).sort(),
  max_purchase_path_potential: Math.max(...rows.map(row => Number(row.purchase_path_potential || 0))),
  patch_depth: Math.max(...rows.map(row => Number(row.purchase_path_potential || 0))) >= 5 ? 'priority' : 'standard'
}));
const payload = {
  generated_at: new Date().toISOString(),
  source: 'data/citation_opportunities/bhpc_priority_queries.json',
  query_count: items.length,
  target_count: targets.length,
  targets
};
const outPath = path.join(root, 'data/citation_opportunities/target_page_patch_map.json');
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
const reportPath = path.join(root, 'data/citation_opportunities/citation_opportunity_report.json');
fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2) + '\n');
if (missing.length) {
  console.error(`[citation:build] FAIL: ${missing.length} structural issue(s)`);
  for (const line of missing.slice(0, 80)) console.error(` - ${line}`);
  process.exit(1);
}
console.log(`[citation:build] OK: ${items.length} queries mapped to ${targets.length} target pages`);
