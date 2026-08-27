#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { fileForRoute } = require('../lib/route_resolution.cjs');
const ROOT = process.cwd();
const GRAPH = path.join(ROOT, 'data/internal_authority_graph.json');
function fail(msg){ console.error(`[validate_internal_authority_graph] FAIL: ${msg}`); process.exit(1); }
function hrefs(html){
  const found = new Set();
  const re = /href=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) found.add(m[1]);
  return found;
}
// Graph node paths and required links are canonical routes, which are
// extensionless since the canonical contract moved off the redirecting .html
// form. Resolve one back to the file that answers it.
const fileFor = (route) => fileForRoute(ROOT, route);
if (!fs.existsSync(GRAPH)) fail('missing data/internal_authority_graph.json');
const graph = JSON.parse(fs.readFileSync(GRAPH, 'utf8'));
let checked = 0;
for (const node of graph.nodes || []) {
  for (const key of ['path','cluster','family']) if (!node[key]) fail(`graph node missing ${key}`);
  const file = fileFor(node.path);
  if (!file) fail(`source page missing: ${node.path}`);
  const html = fs.readFileSync(file, 'utf8');
  const links = hrefs(html);
  const internalCount = [...links].filter(x => x.startsWith('/')).length;
  if (internalCount < 5) fail(`${node.path} has weak internal link count (${internalCount})`);
  for (const link of node.required_links || []) {
    if (!links.has(link)) fail(`${node.path} missing required graph link ${link}`);
    if (!fileFor(link)) fail(`${node.path} links to missing target ${link}`);
  }
  if (!html.includes(`data-fanout-topic="${node.cluster}"`) && !html.includes(`data-fanout-topic='${node.cluster}'`)) fail(`${node.path} missing matching fanout topic for ${node.cluster}`);
  checked += 1;
}
console.log(`[validate_internal_authority_graph] OK (${checked} nodes checked)`);
