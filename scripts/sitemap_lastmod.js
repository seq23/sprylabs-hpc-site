#!/usr/bin/env node
/**
 * Stamp <lastmod> on sitemap URLs that have none, from each page's own last
 * commit.
 *
 * A sitemap entry with no lastmod tells a crawler nothing about when the page
 * changed, and recency is the strongest single correlate of whether an answer
 * engine cites a page at all. Several sitemaps here emitted <loc> only.
 *
 * The date comes from git history for the file that serves the URL, not from
 * build time. Stamping build time would claim the whole site changed on every
 * deploy, which is the date-bump pattern that makes the signal worthless - and
 * the cadence gate flags exactly that.
 *
 * Entries that already carry a lastmod are left alone. A URL whose file cannot
 * be located is left without one rather than given a guessed date.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cache = new Map();

function commitDate(rel) {
  if (cache.has(rel)) return cache.get(rel);
  let out = '';
  try {
    out = execFileSync('git', ['log', '-1', '--format=%cs', '--', rel], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { out = ''; }
  const v = DATE.test(out) ? out : '';
  cache.set(rel, v);
  return v;
}

function fileFor(loc) {
  const rel = String(loc).replace(/^https?:\/\/[^/]+\/?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
  const candidates = rel ? [`${rel}/index.html`, `${rel}.html`, rel] : ['index.html'];
  for (const c of candidates) if (fs.existsSync(path.join(ROOT, c))) return c;
  return '';
}

function sitemaps(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/^(node_modules|\.git|\.pages-output|dist)$/.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sitemaps(full, out);
    else if (/^sitemap.*\.xml$/i.test(e.name)) out.push(full);
  }
  return out;
}

let stamped = 0, unresolved = 0, files = 0;
for (const sm of sitemaps(ROOT)) {
  const before = fs.readFileSync(sm, 'utf8');
  const after = before.replace(/<url>([\s\S]*?)<\/url>/g, (whole, inner) => {
    if (/<lastmod>/.test(inner)) return whole;
    const loc = (inner.match(/<loc>(.*?)<\/loc>/) || [])[1];
    if (!loc) return whole;
    const f = fileFor(loc);
    const d = f ? commitDate(f) : '';
    if (!d) { unresolved += 1; return whole; }
    stamped += 1;
    return whole.replace('</loc>', `</loc><lastmod>${d}</lastmod>`);
  });
  if (after !== before) { fs.writeFileSync(sm, after); files += 1; }
}
console.log(`sitemap lastmod: stamped=${stamped} across ${files} sitemap(s); ${unresolved} url(s) had no locatable file and were left undated`);
