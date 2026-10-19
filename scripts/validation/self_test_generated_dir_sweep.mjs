#!/usr/bin/env node
// Proves a generator's directory sweep never deletes a page another generator owns.
// Incident: generate_aplayer_phase_expansion.mjs rm -rf'd brand-defense/, taking the
// navigation hub brand-defense/index.html with it; validate:frozen-output-contract then
// found 101 frozen blobs linking a /brand-defense/ no file served (Spry Content Release,
// 17-18 Oct 2026). See scripts/lib/generated_dir_sweep.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NAV_HUB_MARKER, sweepGeneratedDir } from '../lib/generated_dir_sweep.mjs';

const ROOT = process.cwd();
let assertions = 0;
const failures = [];
const check = (ok, msg) => { assertions += 1; if (!ok) failures.push(msg); };

// 1. The marker is the one the navigation script actually renders into hubs.
const nav = fs.readFileSync(path.join(ROOT, 'scripts/internal/build_navigation_structure.mjs'), 'utf8');
check(nav.includes(`<section class="card" ${NAV_HUB_MARKER}>`),
  `build_navigation_structure.mjs no longer renders ${NAV_HUB_MARKER}; hubs would be swept as generated pages`);

// 2. Every committed navigation hub inside a generated dir carries the marker today.
const gen = fs.readFileSync(path.join(ROOT, 'scripts/programmatic/generate_aplayer_phase_expansion.mjs'), 'utf8');
const dirsMatch = gen.match(/const GENERATED_DIRS = (\[[^\]]*\]);/);
check(Boolean(dirsMatch), 'GENERATED_DIRS not found in generate_aplayer_phase_expansion.mjs');
const generatedDirs = dirsMatch ? JSON.parse(dirsMatch[1].replace(/'/g, '"')) : [];
check(generatedDirs.length > 0, 'GENERATED_DIRS is empty; nothing to prove');
const hubs = [];
for (const d of generatedDirs) {
  const hub = path.join(ROOT, d, 'index.html');
  if (fs.existsSync(hub)) hubs.push(d + '/index.html');
  if (fs.existsSync(hub)) check(fs.readFileSync(hub, 'utf8').includes(NAV_HUB_MARKER), `${d}/index.html exists without ${NAV_HUB_MARKER}; the sweep would delete it`);
}
check(hubs.length > 0, 'no navigation hub found inside any GENERATED_DIRS entry; the incident shape (brand-defense/index.html) is gone, re-point this test');

// 3. The generator sweeps through the shared function and never rm -rf's a generated dir.
check(gen.includes("from '../lib/generated_dir_sweep.mjs'") && /GENERATED_DIRS\) sweepGeneratedDir\(/.test(gen),
  'generate_aplayer_phase_expansion.mjs does not sweep GENERATED_DIRS through sweepGeneratedDir');
check(!/rmSync\([^)]*recursive:\s*true/.test(gen),
  'generate_aplayer_phase_expansion.mjs calls rmSync({recursive:true}); that deletes pages other generators own');

// 4. Behaviour in a scratch tree: hub (and topic hub) survive, generated pages go, empty dirs go.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-sweep-'));
try {
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), body); };
  const hubHtml = `<html><body><section class="card" ${NAV_HUB_MARKER}><h2>2 pages</h2></section></body></html>`;
  w('brand-defense/index.html', hubHtml);
  w('brand-defense/topics/scams/index.html', hubHtml);
  w('brand-defense/is-x-a-scam.html', '<html><body>generated</body></html>');
  w('brand-defense/topics/scams/notes.json', '{}');
  w('vs/phase4/a.html', '<html>generated</html>');
  w('vs/phase4/deep/b.html', '<html>generated</html>');
  const kept = sweepGeneratedDir(path.join(tmp, 'brand-defense'));
  sweepGeneratedDir(path.join(tmp, 'vs/phase4'));
  check(kept.length === 2, `expected 2 kept hubs, got ${kept.length}: ${kept.join(', ')}`);
  check(fs.existsSync(path.join(tmp, 'brand-defense/index.html')), 'section hub brand-defense/index.html was deleted');
  check(fs.existsSync(path.join(tmp, 'brand-defense/topics/scams/index.html')), 'topic hub was deleted');
  check(!fs.existsSync(path.join(tmp, 'brand-defense/is-x-a-scam.html')), 'generated page survived the sweep');
  check(!fs.existsSync(path.join(tmp, 'brand-defense/topics/scams/notes.json')), 'non-html generated file survived');
  check(!fs.existsSync(path.join(tmp, 'vs/phase4')), 'a fully generated dir was not removed once empty');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  for (const f of failures) console.error(`[generated-dir-sweep-self-test] FAIL: ${f}`);
  process.exit(1);
}
console.log(`[generated-dir-sweep-self-test] PASS: ${assertions} assertion(s); ${hubs.length} navigation hub(s) inside generated dirs (${hubs.join(', ')}) carry the owner marker and survive the sweep, generated pages are removed, and the generator has no rm -rf left.`);
