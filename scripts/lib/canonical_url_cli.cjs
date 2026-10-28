#!/usr/bin/env node
'use strict';
// The canonical URL of each page file, computed exactly as
// scripts/repair/repair_dual_domain_metadata.js computes it: dual_domain_policy.cjs
// canonicalUrlFor(routeFor(rel)) with the published-manifest host overrides.
//
// stdin: a JSON array of repo-relative .html paths. stdout: {rel: canonicalUrl}.
//
// Python writers (scripts/citation/apply_citation_program.py canonical_for) call
// this instead of keeping a host list of their own. Until 26 Oct 2026 that
// Python list defaulted to billionairehighperformancecoach.com while the policy
// defaults to spryexecutiveos.com, so /ai-vs-human-coaching/ and
// /what-should-i-work-on/too-many-tasks-what-now/ got a bhpc title, a bhpc
// citable_pages row and a bhpc sitemap entry, and a spry canonical from the
// repair. Guarded by validate:sitemap-canonical-on-own-host.
const fs = require('fs');
const path = require('path');
const { routeFor, canonicalUrlFor } = require('./dual_domain_policy.cjs');

function publishedHostOverrides(root) {
  const f = path.join(root, 'data/reddit/published_manifest.json');
  const items = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')).items || []) : [];
  return new Map(items.map((item) => [item.route, item.canonical_host]));
}

function canonicalUrls(rels, root = process.cwd()) {
  const overrides = publishedHostOverrides(root);
  const out = {};
  for (const rel of rels) out[rel] = canonicalUrlFor(routeFor(rel), overrides);
  return out;
}

module.exports = { canonicalUrls, publishedHostOverrides };

if (require.main === module) {
  const rels = JSON.parse(fs.readFileSync(0, 'utf8') || '[]');
  process.stdout.write(JSON.stringify(canonicalUrls(rels)));
}
