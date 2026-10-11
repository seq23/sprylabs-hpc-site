#!/usr/bin/env node
/**
 * validate:host-crawl-surfaces - each production host's crawl surfaces name only
 * that host.
 *
 * Defect (CONFIRMED 11 Oct 2026, portfolio sitemaps run 38142618891 and coverage
 * run 38142685248): one Pages deployment served one /sitemap.xml index and one
 * /robots.txt naming BOTH hosts' child sitemaps. Search Console answered 400
 * "Could not process sitemap" for the cross-host child in each property, and the
 * coverage run inspected the other host's URLs (109 of 110 Spry inspections
 * 403 "You do not own this site").
 *
 * Asserts, against the real narrowing code in functions/_lib/host_crawl_surfaces.js:
 *   1. config/site_hosts.json names >= 2 hosts (hard-fail on zero).
 *   2. For every host: the narrowed static sitemap.xml lists exactly one child,
 *      on that host; the narrowed robots.txt has >= 1 Sitemap line and all on
 *      that host; the other hosts' children are 404 there (foreignChild).
 *   3. Each child sitemap lists only its own host's URLs (>= 1 URL).
 *   4. The static index has one writer: scripts/lib/sitemap_index.mjs; neither
 *      former writer keeps a <sitemapindex> literal; the four route functions exist.
 *   5. Negative proof: a cross-host index and robots fed through the narrowing
 *      code come out clean, and the un-narrowed static files are detected as
 *      cross-host by the same check (so the check can fail).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const fail = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const hostsCfg = JSON.parse(read('config/site_hosts.json')).hosts || {};
const hosts = Object.keys(hostsCfg);
if (hosts.length < 2) fail.push(`config/site_hosts.json names ${hosts.length} host(s); expected both production hosts`);

// Load the real module with its JSON import inlined (node cannot import the JSON
// without an attribute; the Pages bundler can).
const src = read('functions/_lib/host_crawl_surfaces.js')
  .replace(/^import SITE_HOSTS from [^\n]+$/m, `const SITE_HOSTS = ${JSON.stringify({ hosts: hostsCfg })};`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'host-crawl-'));
const modPath = path.join(tmp, 'host_crawl_surfaces.mjs');
fs.writeFileSync(modPath, src);
const M = await import(pathToFileURL(modPath).href);

const locsOf = (xml, tag) => [...String(xml).matchAll(new RegExp(`<${tag}>\\s*<loc>([^<]+)</loc>`, 'g'))].map((m) => m[1].trim());
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');
const robotsSitemaps = (txt) => [...String(txt).matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);

const staticIndex = read('sitemap.xml');
const staticRobots = read('robots.txt');
for (const host of hosts) {
  const idx = locsOf(M.narrowSitemapIndex(staticIndex, host), 'sitemap');
  if (idx.length !== 1 || hostOf(idx[0]) !== host || !idx[0].endsWith('/' + hostsCfg[host].child_sitemap)) fail.push(`${host}: narrowed sitemap.xml lists ${JSON.stringify(idx)}; expected only https://${host}/${hostsCfg[host].child_sitemap}`);
  const rob = robotsSitemaps(M.narrowRobots(staticRobots, host));
  if (!rob.length) fail.push(`${host}: narrowed robots.txt has no Sitemap line`);
  for (const r of rob) if (hostOf(r) !== host) fail.push(`${host}: narrowed robots.txt names ${r}`);
  if (M.ownerHost('www.' + host) !== host) fail.push(`${host}: www host does not resolve to its owner`);
  for (const other of hosts.filter((h) => h !== host)) {
    if (!M.foreignChild('/' + hostsCfg[other].child_sitemap, host)) fail.push(`${host}: serves ${other}'s child ${hostsCfg[other].child_sitemap} instead of 404`);
  }
  if (M.foreignChild('/' + hostsCfg[host].child_sitemap, host)) fail.push(`${host}: its own child sitemap would 404`);
  const child = read(hostsCfg[host].child_sitemap);
  const urls = locsOf(child, 'url');
  if (!urls.length) fail.push(`${hostsCfg[host].child_sitemap}: lists zero URLs`);
  const off = urls.filter((u) => hostOf(u) !== host);
  if (off.length) fail.push(`${hostsCfg[host].child_sitemap}: ${off.length} URL(s) on another host, e.g. ${off[0]}`);
}
if (M.ownerHost('sprylabs-hpc-site.pages.dev') !== null) fail.push('pages.dev must be served the static files unchanged');

// 4. One writer, wired functions.
for (const f of ['scripts/programmatic/generate_aplayer_phase_expansion.mjs', 'scripts/citation/apply_citation_program.py']) {
  const t = read(f);
  if (/<sitemapindex/.test(t)) fail.push(`${f}: keeps its own <sitemapindex> literal; the index has one writer (scripts/lib/sitemap_index.mjs)`);
  if (!/sitemap_index\.mjs/.test(t)) fail.push(`${f}: does not call scripts/lib/sitemap_index.mjs`);
}
const { buildSitemapIndex } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/sitemap_index.mjs')).href);
const rebuilt = locsOf(buildSitemapIndex(ROOT, '2026-01-01'), 'sitemap');
if (JSON.stringify(rebuilt) !== JSON.stringify(locsOf(staticIndex, 'sitemap'))) fail.push(`sitemap.xml children ${JSON.stringify(locsOf(staticIndex, 'sitemap'))} differ from the writer's ${JSON.stringify(rebuilt)}`);
for (const [route, fn] of [['sitemap.xml', 'serveSitemapIndex'], ['robots.txt', 'serveRobots'], ...hosts.map((h) => [hostsCfg[h].child_sitemap, 'serveChildSitemap'])]) {
  const p = `functions/${route}.js`;
  if (!fs.existsSync(path.join(ROOT, p))) { fail.push(`${p} missing`); continue; }
  const t = read(p);
  if (!new RegExp(`export const onRequestGet = ${fn};`).test(t)) fail.push(`${p}: does not export onRequestGet = ${fn}`);
}

// 5. Negative proof: the check detects the defect on the un-narrowed files.
const rawIdx = locsOf(staticIndex, 'sitemap').map(hostOf);
const rawRobots = robotsSitemaps(staticRobots).map(hostOf);
if (new Set(rawIdx).size < 2 || new Set(rawRobots).size < 2) fail.push('negative proof: the static index/robots no longer name both hosts, so this check no longer proves narrowing (update the proof, do not drop it)');
const crafted = `<sitemapindex>\n  <sitemap><loc>https://${hosts[0]}/a.xml</loc></sitemap>\n  <sitemap><loc>https://${hosts[1]}/b.xml</loc></sitemap>\n</sitemapindex>`;
if (locsOf(M.narrowSitemapIndex(crafted, hosts[0]), 'sitemap').some((u) => hostOf(u) !== hosts[0])) fail.push('negative proof: crafted cross-host index survives narrowing');

fs.rmSync(tmp, { recursive: true, force: true });
if (fail.length) { console.error(`[validate:host-crawl-surfaces] FAIL (${fail.length})`); for (const f of fail) console.error('  - ' + f); process.exit(1); }
console.log(`[validate:host-crawl-surfaces] PASS: ${hosts.length} hosts; each host's sitemap.xml and robots.txt name only its own child; children own-host only; one writer; negative proof held`);
