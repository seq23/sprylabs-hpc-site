#!/usr/bin/env node
/**
 * validate:generators-keep-demand-pages - every page generator in the Spry
 * content release cycle leaves each demand-family primary page in a shape the
 * demand pass can re-seat, and the demand pass then passes.
 *
 * Why it exists: PR #133 (11 Oct 2026) made comparisons/bhpc-vs-betterup.html a
 * demand-family primary page. build:comparison (inside content:pipeline)
 * re-renders that page every full-content-cycle, and its renderer wrote a flat
 * {"@type":"WebPage"} CITATION_PAGE_SCHEMA with no @graph. apply_demand_families.py
 * (build:demand-families, inside release:content-finalize) carries the FAQPage
 * as an @graph node, could not, and Spry Content Release went red on 12 and 13
 * Oct with "has no parseable CITATION_PAGE_SCHEMA to carry the FAQPage". No
 * check ran a generator before the demand pass, so the clean committed tree
 * validated green the whole time.
 *
 * What it does, on a throwaway copy of the working tree (the real tree is never
 * written):
 *   1. runs every page generator the release cycle runs, in cycle order;
 *   2. requires every strengthened family's primary page to still carry a
 *      CITATION_PAGE_SCHEMA whose JSON has an @graph array;
 *   3. runs apply_demand_families.py --apply --root <copy>, which must exit 0;
 *   4. requires every primary page to carry its family's section with the same
 *      data-demand-hash the committed page carries, and a FAQPage @graph node.
 * Hard-fails on zero strengthened families, and on zero primary pages rewritten
 * by a generator (a run that never exercised the hazard proves nothing).
 * Each generator must still appear in content:pipeline or
 * release:content-finalize, so a renamed or removed stage fails here instead of
 * silently leaving this list.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const TAG = '[generators-keep-demand-pages]';
const GENERATORS = ['build:synthesis', 'build:comparison', 'build:authority', 'build:manual-expansion', 'build:aplayer-phase-expansion'];
const fail = [];
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cycle = `${pkg.scripts['content:pipeline'] || ''} && ${pkg.scripts['release:content-finalize'] || ''}`;
for (const g of GENERATORS) {
  if (!pkg.scripts[g]) fail.push(`generator ${g} is not a package script`);
  else if (!cycle.includes(`npm run ${g}`)) fail.push(`generator ${g} is no longer in content:pipeline or release:content-finalize; update this list`);
}

const hosts = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'config/site_hosts.json'), 'utf8')).hosts);
const pages = new Map();
for (const host of hosts) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/search_intelligence', host, 'demand_families.json'), 'utf8'));
  for (const f of data.families.filter((x) => x.strengthened)) pages.set(f.primary_page.file, f.id);
}
if (pages.size === 0) {
  console.error(`${TAG} FAIL: zero strengthened demand families; refusing to pass having checked nothing`);
  process.exit(1);
}

const SCHEMA_RE = /<script id="CITATION_PAGE_SCHEMA"[^>]*>([\s\S]*?)<\/script>/i;
const graphOf = (html) => {
  const m = SCHEMA_RE.exec(html);
  if (!m) return null;
  try { const g = JSON.parse(m[1])['@graph']; return Array.isArray(g) ? g : null; } catch { return null; }
};
const hashAttr = (html, id) => (html.match(new RegExp(`data-demand-family="${id}"[^>]*data-demand-hash="([^"]+)"|data-demand-hash="([^"]+)"[^>]*data-demand-family="${id}"`)) || []).slice(1).find(Boolean) || null;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-demand-'));
try {
  const SKIP = new Set(['.git', 'node_modules']);
  for (const e of fs.readdirSync(ROOT)) {
    if (SKIP.has(e)) continue;
    fs.cpSync(path.join(ROOT, e), path.join(fx, e), { recursive: true, verbatimSymlinks: true });
  }
  if (fs.existsSync(path.join(ROOT, 'node_modules'))) fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(fx, 'node_modules'), 'dir');

  const committed = new Map();
  for (const rel of pages.keys()) {
    const p = path.join(fx, rel);
    if (!fs.existsSync(p)) { fail.push(`${rel}: primary page missing before any generator ran`); continue; }
    committed.set(rel, fs.readFileSync(p, 'utf8'));
  }

  // The copy has no .git, so date it from the real tree's HEAD the way the
  // build clock asks (scripts/lib/build_clock.cjs), never the wall clock.
  const epoch = process.env.SOURCE_DATE_EPOCH || spawnSync('git', ['log', '-1', '--format=%ct'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  if (!epoch) fail.push('no SOURCE_DATE_EPOCH and no git HEAD to date the generator run from');
  const env = { ...process.env, SOURCE_DATE_EPOCH: epoch };
  for (const g of GENERATORS) {
    if (!pkg.scripts[g]) continue;
    const r = spawnSync('npm', ['run', '-s', g], { cwd: fx, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0) fail.push(`generator ${g} exited ${r.status}: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' | ')}`);
  }

  let rewritten = 0;
  for (const [rel, before] of committed) {
    const after = fs.readFileSync(path.join(fx, rel), 'utf8');
    if (sha(after) !== sha(before)) rewritten += 1;
    if (!graphOf(after)) fail.push(`${rel} (${pages.get(rel)}): after the cycle's generators ran, CITATION_PAGE_SCHEMA is missing or has no @graph, so the demand pass cannot carry its FAQPage`);
  }
  if (rewritten === 0) fail.push('zero demand-family primary pages were rewritten by any generator: this run never exercised the hazard it guards, so it proves nothing');

  const r = spawnSync('node', ['scripts/validation/python_runtime.mjs', 'run', 'scripts/search_intelligence/apply_demand_families.py', '--apply', '--root', fx], { cwd: fx, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) fail.push(`apply_demand_families.py failed after the generators ran: ${(r.stderr + r.stdout).trim().split('\n').filter((l) => /FAIL|Error/.test(l)).slice(-2).join(' | ') || `exit ${r.status}`}`);
  else {
    for (const [rel, before] of committed) {
      const id = pages.get(rel);
      const after = fs.readFileSync(path.join(fx, rel), 'utf8');
      const want = hashAttr(before, id);
      const got = hashAttr(after, id);
      if (!got) fail.push(`${rel}: the demand section for ${id} is gone after a full cycle`);
      else if (want && got !== want) fail.push(`${rel}: demand hash ${got} after the cycle, committed page carries ${want}`);
      if (!(graphOf(after) || []).some((n) => n && n['@type'] === 'FAQPage')) fail.push(`${rel}: no FAQPage node in @graph after the demand pass`);
    }
  }
  if (!fail.length) console.log(`${TAG} PASS: ${GENERATORS.length} generators ran on a copy; ${pages.size} demand-family primary pages (${rewritten} rewritten by a generator) kept an @graph schema, and the demand pass re-seated every family`);
} finally {
  fs.rmSync(fx, { recursive: true, force: true });
}
if (fail.length) {
  for (const f of fail) console.error(`${TAG} FAIL: ${f}`);
  process.exit(1);
}
