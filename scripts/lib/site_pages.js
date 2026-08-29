#!/usr/bin/env node
'use strict';
/**
 * One definition of "the published page surface", shared by the legacy content
 * validators.
 *
 * Each of validate_above_fold, validate_cta_presence and validate_extractability
 * used to carry its own idea of what to look at, and every one of them was far
 * narrower than the site:
 *
 *   - above_fold / cta_presence: a NON-recursive readdir of three directories
 *     ('insights', 'comparisons', 'whitepapers') plus root synthesis-*.html.
 *     Measured reach 232 of 2,291 HTML files - and non-recursive means even
 *     insights/ was only 158 of its 175 pages.
 *   - extractability: fs.readdirSync(cwd).filter(.html).slice(0, 40) - the first
 *     40 ROOT files in alphabetical order, no subdirectories at all, which
 *     stopped deterministically at chatgpt-prompts-*.
 *
 * All three printed a generic "OK (N checked pages)" that read as site-wide
 * coverage. Three components each keeping their own list, none of them linked to
 * the actual page set, is the defect; this module is the link.
 *
 * Reach is guarded by validate:page-surface-coverage, which hard-fails if any
 * consumer examines zero pages or if coverage falls below the recorded floor.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// Directories that hold no published page. Everything else under the repo root
// is part of the site.
const NON_PAGE_DIRS = new Set([
  'node_modules', '.git', '.build', '.wrangler', '.clarity',
  '.validation-cache', '.validation-runtime', '.github',
  'scripts', 'docs', 'config', 'data', 'reports', 'artifacts',
  'fixtures', 'tests', 'templates', 'logs',
]);

const NOINDEX_A = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i;
const NOINDEX_B = /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i;

function isNoindex(html) {
  return NOINDEX_A.test(html) || NOINDEX_B.test(html);
}

/** Every .html file that is part of the published surface, sorted, repo-relative. */
function listSitePages(baseDir = ROOT) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || NON_PAGE_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.html')) out.push(path.relative(baseDir, full));
    }
  };
  walk(baseDir);
  return out.sort();
}

/** The indexable subset: what a search or answer engine can actually see. */
function listIndexablePages(baseDir = ROOT) {
  return listSitePages(baseDir).filter((rel) => {
    try { return !isNoindex(fs.readFileSync(path.join(baseDir, rel), 'utf8')); }
    catch { return false; }
  });
}

/**
 * Rule 0 for a page scan: examining nothing is a broken scan, not a pass.
 * Callers pass the number they actually inspected; a zero exits non-zero with a
 * message naming the scanner.
 */
function assertExamined(label, count) {
  if (Number(count) > 0) return;
  console.error(`[${label}] FAIL: examined zero pages. A page validator that inspects nothing must not pass - this is a broken scan, not a clean tree.`);
  process.exit(1);
}

module.exports = { ROOT, NON_PAGE_DIRS, isNoindex, listSitePages, listIndexablePages, assertExamined };
