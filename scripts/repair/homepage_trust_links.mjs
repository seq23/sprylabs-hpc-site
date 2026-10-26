#!/usr/bin/env node
// Writes the homepage trust links (About, author, methodology) into index.html's
// footer. Runs inside build:postprocess so every build - including the one that
// follows authority:scale:restore on the unattended lanes - produces them.
// See scripts/lib/homepage_trust_links.mjs for why this is a writer and not a
// hand edit.
//
//   --apply  write the links if any are missing (default)
//   --check  exit 1 if any are missing, write nothing
import fs from 'node:fs';
import path from 'node:path';
import { applyHomepageTrustLinks, requiredHomepageTrustLinks } from '../lib/homepage_trust_links.mjs';

const root = process.cwd();
const check = process.argv.includes('--check');
const homePath = path.join(root, 'index.html');
if (!fs.existsSync(homePath)) {
  console.error('[homepage-trust-links] FAIL: index.html is missing, so there is no homepage to carry the trust links');
  process.exit(1);
}
const author = JSON.parse(fs.readFileSync(path.join(root, 'data/entities/author_profile.json'), 'utf8'));
const links = requiredHomepageTrustLinks(author);
const before = fs.readFileSync(homePath, 'utf8');
let result;
try {
  result = applyHomepageTrustLinks(before, links);
} catch (err) {
  console.error(`[homepage-trust-links] FAIL: ${err.message}`);
  process.exit(1);
}
if (check) {
  if (result.added.length) {
    console.error(`[homepage-trust-links] FAIL: the homepage does not link ${result.added.join(', ')}`);
    process.exit(1);
  }
  console.log(`[homepage-trust-links] PASS: the homepage links all ${links.length} trust pages`);
  process.exit(0);
}
if (result.added.length) {
  fs.writeFileSync(homePath, result.html);
  console.log(`[homepage-trust-links] WROTE ${result.added.length} of ${links.length} trust link(s) into the homepage footer: ${result.added.join(', ')}`);
} else {
  console.log(`[homepage-trust-links] already present: the homepage links all ${links.length} trust pages`);
}
