#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INSIGHTS_DIR = path.join(ROOT, 'content', 'insights');

const G = 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach';

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && (p.endsWith('.md') || p.endsWith('.txt'))) out.push(p);
  }
  return out;
}

function fixFile(fp) {
  let s = fs.readFileSync(fp, 'utf8');
  const before = s;

  // 1) Fix markdown links where the URL replacement ate the closing ')'
  // Pattern: ](https://...coach<not a ')'> then newline
  s = s.replace(new RegExp(`\\\\]\((${G.replace(/[-/\\.^$*+?()[\]{}|]/g,'\\\\$&')})(?!\\\\))\\\\n`, 'g'), `](${G})\n`);

  // 2) Fix any remaining ](https://...coach) where URL accidentally contains trailing punctuation like '.)'
  // Keep as-is; we're only ensuring closure.

  // 3) Replace any bare gumroad URL with canonical
  s = s.replace(/https?:\/\/sprylabs\.gumroad\.com\/l\/billionaire-high-performance-coach[^\s)\]]*/g, G);

  if (s !== before) fs.writeFileSync(fp, s, 'utf8');
}

for (const fp of walk(INSIGHTS_DIR)) fixFile(fp);
console.log('Gumroad link fix complete');
