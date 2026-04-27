#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const GRAPH = path.join(ROOT, 'data/internal_authority_graph.json');
const OUT = path.join(ROOT, '.build/internal_authority_graph_report.json');
function readJSON(file){ return JSON.parse(fs.readFileSync(file, 'utf8')); }
function hrefs(html){
  const found = new Set();
  const re = /href=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) found.add(m[1]);
  return [...found];
}
function main(){
  const graph = readJSON(GRAPH);
  const report = { generated_at: new Date().toISOString(), checked: [], missing: [] };
  for (const node of graph.nodes || []) {
    const file = path.join(ROOT, node.path.replace(/^\//, ''));
    if (!fs.existsSync(file)) {
      report.missing.push({ path: node.path, reason: 'source page missing' });
      continue;
    }
    const html = fs.readFileSync(file, 'utf8');
    const links = hrefs(html);
    const missingLinks = (node.required_links || []).filter(link => !links.includes(link));
    report.checked.push({ path: node.path, cluster: node.cluster, family: node.family, internal_link_count: links.filter(x => x.startsWith('/')).length, required_links: node.required_links || [], missing_links: missingLinks });
    for (const link of missingLinks) report.missing.push({ path: node.path, reason: `missing required link ${link}` });
  }
  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(`build_link_graph: checked ${report.checked.length}; missing ${report.missing.length}`);
}
if (require.main === module) main();
