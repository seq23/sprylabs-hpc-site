#!/usr/bin/env node
/**
 * Every retired route in data/content/manual_redirects.json answers in every
 * shape a crawler can hold for it, generated rather than hand-listed.
 *
 * Cloudflare Pages matches _redirects rules exactly, so `/x/` and `/x` are two
 * different sources. The manual map produced only the form its source file
 * named: a retired directory page got `/x/` and never `/x`, and Bing Webmaster,
 * 25 Sep 2026, held the no-slash form of a retired paginated insights hub as a
 * 404 while its slash form redirected. (Retired routes are not spelled out here:
 * scripts/content/apply_redirect_map.mjs rewrites them in every text file.) The same map now also carries the 121
 * pages that moved from /guides/<slug> to the root on 2026-07-23 (b94f49750),
 * which Bing held as 404s on both hosts.
 *
 * For each entry the required sources are:
 *   - the route its source_path names (the line validate:retired-route-references
 *     already requires), and
 *   - the other slash form of a directory route (`/x/` <-> `/x`), and
 *   - the extensionless form of a `.html` route.
 * A source already present as an exact rule anywhere in _redirects is left where
 * it is; the rest are written, in map order, between the GENERATED markers,
 * which sit above the wildcard rules so they are reachable (first match wins).
 *
 * Deterministic and idempotent. Exits non-zero if the markers are missing or the
 * map is empty, rather than writing nothing and reporting success.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MAP = 'data/content/manual_redirects.json';
const FILE = '_redirects';
const BEGIN = '# BEGIN GENERATED: retired-route forms (scripts/content/sync_redirect_forms.mjs)';
const END = '# END GENERATED: retired-route forms';

export function routeFromSource(sourcePath) {
  const value = '/' + String(sourcePath).replace(/^\/+/, '');
  return value.endsWith('/index.html') ? value.slice(0, -'index.html'.length) : value;
}

export function requiredForms(entry) {
  const route = routeFromSource(entry.source_path);
  const forms = [route];
  if (route.endsWith('/') && route !== '/') forms.push(route.slice(0, -1));
  if (route.endsWith('.html')) forms.push(route.slice(0, -'.html'.length));
  return forms;
}

function fail(msg) {
  console.error(`[sync-redirect-forms] FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, MAP), 'utf8'));
  const redirects = payload.redirects || [];
  if (!redirects.length) fail(`${MAP} declares no redirects; there is nothing to generate and nothing to prove.`);
  const text = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b === -1 || e === -1 || e < b) fail(`${FILE} is missing the GENERATED markers; they must sit above the wildcard rules.`);
  const before = text.slice(0, b);
  const after = text.slice(e + END.length);
  const existing = new Set();
  for (const line of (before + after).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    existing.add(t.split(/\s+/)[0]);
  }
  const lines = [];
  const emitted = new Set();
  for (const entry of redirects) {
    for (const form of requiredForms(entry)) {
      if (existing.has(form) || emitted.has(form)) continue;
      emitted.add(form);
      lines.push(`${form} ${entry.target} 301`);
    }
  }
  const block = `${BEGIN}\n${lines.map((l) => `${l}\n`).join('')}${END}`;
  const next = before + block + after;
  if (next !== text) fs.writeFileSync(path.join(ROOT, FILE), next);
  console.log(`[sync-redirect-forms] OK: ${redirects.length} retired routes; ${lines.length} generated rule(s)${next === text ? ' (unchanged)' : ''}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
