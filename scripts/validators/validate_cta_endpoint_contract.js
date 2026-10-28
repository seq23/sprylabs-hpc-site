#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const bad = [];
const exts = new Set(['.html', '.js', '.json', '.xml', '.txt', '.md']);
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.pages-output', 'node_modules', 'tmp', 'coverage', '.build', 'releases', '_ops', 'audit'].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (exts.has(path.extname(ent.name))) check(p);
  }
}
// What this rule is about: a CTA on a SHARED-HOST page sends the reader to the A Player Mode front
// door, never to a path on that domain. It is about <a> links a reader clicks, and about this
// repo's own pages that are not the A Player Mode site. It is NOT about the apex's own pages: those
// live under aplayermode/, they are published at aplayermode.com, and the paths they may name are
// one list in validate_url_contract.js (OWN_PAGES) with the Worker's routes behind it. A canonical
// or og:url tag is metadata, not a CTA, and was never what this rule meant (25 Oct 2026: it failed
// the About page's own rel=canonical).
const OWN_SITE_DIR = 'aplayermode/';
let ctasChecked = 0;
function check(p) {
  const rel = path.relative(root, p).replace(/\\/g, '/');
  const s = fs.readFileSync(p, 'utf8');
  if (new RegExp("aplayer" + "mode" + "\\.com" + "\\/download", "i").test(s)) bad.push(`${rel}: forbidden A Player Mode redirect-plus-download`);
  if (rel === OWN_SITE_DIR.slice(0, -1) || rel.startsWith(OWN_SITE_DIR)) return;
  const re = /<a\b[^>]*?\shref=["']https?:\/\/aplayermode\.com([^"']*)["']/ig;
  let m;
  while ((m = re.exec(s))) {
    ctasChecked += 1;
    const suffix = m[1] || '';
    if (suffix && suffix !== '/' && suffix !== '#') bad.push(`${rel}: A Player Mode redirect domain must not include path ${suffix}`);
  }
}
walk(root);
// Rule 0: a CTA contract that examined no CTA has proved nothing.
if (!ctasChecked) bad.push('zero A Player Mode CTA links examined across the shared-host pages; the extractor no longer matches their markup');
const required = ['download.html', 'sitemap.xml', 'llms.txt'];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) bad.push(`${rel} missing`);
if (bad.length) {
  console.error('[validate_cta_endpoint_contract] FAIL');
  bad.slice(0, 80).forEach(x => console.error(' - ' + x));
  if (bad.length > 80) console.error(` - ... ${bad.length - 80} more`);
  process.exit(1);
}
console.log(`[validate_cta_endpoint_contract] OK (${ctasChecked} A Player Mode CTA link(s) on shared-host pages)`);
