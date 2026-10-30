#!/usr/bin/env node
'use strict';
// The branded <title> for each page, computed by the one title policy
// (search_snippet_bounds.cjs brandedTitle) for the host in the page's own
// canonical link - the host repair:dual-domain-metadata brands it for.
//
// stdin: a JSON array of {file, title} (repo-relative .html paths).
// stdout: {file: brandedTitle}.
//
// scripts/search_intelligence/apply_demand_families.py calls this instead of
// writing the family's bare title. Until 30 Oct 2026 it wrote the bare title,
// the snippet repair then appended "| BHPC" / "| Spry Executive OS", and
// validate:demand-families failed on all 16 strengthened pages: two writers of
// one <title>. validate:demand-families reads brandedTitle() too.
const fs = require('fs');
const path = require('path');
const B = require('./search_snippet_bounds.cjs');

function canonicalHostOf(html) {
  const m = String(html).match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i);
  const href = m && (m[0].match(/href=["']([^"']+)["']/i) || [])[1];
  try { return new URL(href).host; } catch { return ''; }
}

function brandedTitles(items, root = process.cwd()) {
  if (!Array.isArray(items) || !items.length) throw new Error('[branded_title_cli] no pages given; refusing to answer for nothing');
  const out = {};
  for (const { file, title } of items) {
    const host = canonicalHostOf(fs.readFileSync(path.join(root, file), 'utf8'));
    if (!host) throw new Error(`[branded_title_cli] ${file} has no canonical link; cannot tell which site name its title carries`);
    out[file] = B.brandedTitle(title, host);
  }
  return out;
}

module.exports = { brandedTitles, canonicalHostOf };

if (require.main === module) {
  const items = JSON.parse(fs.readFileSync(0, 'utf8') || '[]');
  process.stdout.write(JSON.stringify(brandedTitles(items)));
}
