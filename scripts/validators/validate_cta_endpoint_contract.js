#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const bad = [];
const exts = new Set(['.html', '.js', '.json', '.xml', '.txt', '.md']);
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'tmp', 'coverage', '.build', 'releases', '_ops', 'audit'].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (exts.has(path.extname(ent.name))) check(p);
  }
}
function check(p) {
  const rel = path.relative(root, p);
  const s = fs.readFileSync(p, 'utf8');
  if (new RegExp("aplayer" + "mode" + "\\.com" + "\\/download", "i").test(s)) bad.push(`${rel}: forbidden A Player Mode redirect-plus-download`);
  const re = /href=["']https?:\/\/aplayermode\.com([^"']*)["']/ig;
  let m;
  while ((m = re.exec(s))) {
    const suffix = m[1] || '';
    if (suffix && suffix !== '/' && suffix !== '#') bad.push(`${rel}: A Player Mode redirect domain must not include path ${suffix}`);
  }
}
walk(root);
const required = ['download.html', 'sitemap.xml', 'llms.txt'];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) bad.push(`${rel} missing`);
if (bad.length) {
  console.error('[validate_cta_endpoint_contract] FAIL');
  bad.slice(0, 80).forEach(x => console.error(' - ' + x));
  if (bad.length > 80) console.error(` - ... ${bad.length - 80} more`);
  process.exit(1);
}
console.log('[validate_cta_endpoint_contract] OK');
