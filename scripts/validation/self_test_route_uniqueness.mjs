#!/usr/bin/env node
// Two published files that resolve to one route claim one canonical URL. That
// is how /faq and /billionaire-high-performance-coach each had two pages on
// main (16 Oct 2026): legacy "mirror" directory pages faq/index.html and
// billionaire-high-performance-coach/index.html sat beside faq.html and
// billionaire-high-performance-coach.html, and routeFor special-cased the
// mirrors onto the flat route, so validate:velocity-critical failed with
// "duplicate canonical". Nothing ran that validator, so main carried it red.
//
// This test holds both halves:
//   1. routeFor is one-to-one over every published HTML file (the source).
//   2. validate_velocity_critical fails on a duplicate canonical and passes
//      without one (the guard can actually reach what it governs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const { routeFor } = require(path.join(ROOT, 'scripts/lib/dual_domain_policy.cjs'));
const SKIP = new Set(['.pages-output', 'node_modules', '.git', 'scripts', 'data', '.github', '_ops', 'docs', 'templates', 'reports', 'artifacts']);
const failures = [];

const owners = new Map();
let pages = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile() && e.name.endsWith('.html')) {
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      const route = routeFor(rel);
      pages += 1;
      owners.set(route, [...(owners.get(route) || []), rel]);
    }
  }
})(ROOT);
if (pages === 0) failures.push('no published HTML found; the route check checked nothing');
for (const [route, files] of owners) if (files.length > 1) failures.push(`route ${route} is claimed by ${files.join(', ')}`);

// Unit-level: the mirrors' old special cases must stay gone. A directory page
// routes to its trailing-slash form, never onto a sibling flat page's route.
for (const [rel, want] of [['faq/index.html', '/faq/'], ['billionaire-high-performance-coach/index.html', '/billionaire-high-performance-coach/'], ['faq.html', '/faq']]) {
  if (routeFor(rel) !== want) failures.push(`routeFor(${rel}) = ${routeFor(rel)}, expected ${want}`);
}

function fixture(withDuplicate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-critical-'));
  for (const f of ['sitemap.xml', 'llms.txt', 'robots.txt']) fs.writeFileSync(path.join(dir, f), 'x\n');
  fs.writeFileSync(path.join(dir, 'package.json'), '{}\n');
  fs.writeFileSync(path.join(dir, 'download.html'), '<a href="https://aplayermode.com/">Get Instant Access</a>\n');
  const tag = '<link href="https://billionairehighperformancecoach.com/faq" rel="canonical"/>';
  fs.writeFileSync(path.join(dir, 'faq.html'), `<html><head>${tag}</head></html>\n`);
  if (withDuplicate) {
    fs.mkdirSync(path.join(dir, 'faq'));
    fs.writeFileSync(path.join(dir, 'faq', 'index.html'), `<html><head>${tag}</head></html>\n`);
  }
  return dir;
}
const validator = path.join(ROOT, 'scripts/validators/validate_velocity_critical.js');
for (const dup of [true, false]) {
  const dir = fixture(dup);
  const r = spawnSync(process.execPath, [validator], { cwd: dir, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  if (dup && (r.status !== 1 || !/duplicate canonical/.test(r.stderr))) failures.push(`validator did not refuse a duplicate canonical (exit ${r.status})`);
  if (!dup && r.status !== 0) failures.push(`validator refused a clean fixture (exit ${r.status}): ${r.stderr.trim()}`);
}

if (failures.length) {
  console.error('[self_test_route_uniqueness] FAIL');
  failures.forEach(f => console.error(` - ${f}`));
  process.exit(1);
}
console.log(`[self_test_route_uniqueness] OK (${pages} pages, ${owners.size} routes, validator refuses duplicates)`);
