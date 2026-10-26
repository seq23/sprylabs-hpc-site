#!/usr/bin/env node
// Pins treeManifest (scripts/validation/tree_manifest.mjs), which the
// clean-rebuild parity validator uses to index an isolated build clone.
//
// The regression this exists for: `git add -A -- . :(exclude)node_modules`
// exits 1, "The following paths are ignored by one of your .gitignore files",
// whenever the named path really is ignored. In a parity clone node_modules is
// a symlink; git 2.50 did not match it against the `node_modules/` rule, git
// 2.55 on the runner does. Main went red on 2026-10-25 while every pull
// request stayed green, because the parity job runs only on main.
//
// So both shapes are built here and run through the real function on every
// pull request, whatever git the runner ships: a symlink (what a parity clone
// has) and a real directory (what the runner's git now treats the same way).
// The old command is run against the same fixtures to prove the failure is
// real and this test can see it. Zero cases is a failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {treeManifest, ignoreNotSource} from '../../scripts/validation/tree_manifest.mjs';

const errors = [];
let cases = 0;
function expect(label, ok, detail = '') { cases += 1; if (!ok) errors.push(`${label}${detail ? `: ${detail}` : ''}`); }

const git = (cwd, ...args) => spawnSync('git', args, {cwd, encoding: 'utf8'});

/** A clone shaped like a parity clone: a .gitignore with the directory rule, one tracked file, one built file. */
function fixture(shape) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `tree-manifest-${shape}-`));
  git(base, 'init', '--quiet');
  git(base, 'config', 'user.name', 'tree-manifest-test');
  git(base, 'config', 'user.email', 'tree-manifest-test@invalid');
  fs.writeFileSync(path.join(base, '.gitignore'), 'node_modules/\n');
  fs.writeFileSync(path.join(base, 'source.html'), '<html>tracked</html>\n');
  git(base, 'add', '-A');
  git(base, 'commit', '--quiet', '-m', 'base');
  fs.writeFileSync(path.join(base, 'built.html'), '<html>built by the producers</html>\n');
  const nm = path.join(base, 'node_modules');
  if (shape === 'symlink') {
    const real = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-manifest-deps-'));
    fs.mkdirSync(path.join(real, 'some-package'), {recursive: true});
    fs.writeFileSync(path.join(real, 'some-package', 'index.js'), 'module.exports = 1;\n');
    fs.symlinkSync(real, nm, 'dir');
  } else {
    fs.mkdirSync(path.join(nm, 'some-package'), {recursive: true});
    fs.writeFileSync(path.join(nm, 'some-package', 'index.js'), 'module.exports = 1;\n');
  }
  return base;
}

for (const shape of ['symlink', 'realdir']) {
  const base = fixture(shape);

  let manifest, threw = null;
  try { manifest = treeManifest(base); } catch (e) { threw = e; }
  expect(`${shape}: treeManifest does not throw`, threw === null, threw?.message);

  const paths = Object.keys(manifest ?? {});
  expect(`${shape}: the tracked source file is in the manifest`, paths.includes('source.html'), paths.slice(0, 8).join(', '));
  expect(`${shape}: a new built file is in the manifest`, paths.includes('built.html'), paths.slice(0, 8).join(', '));
  expect(`${shape}: nothing under node_modules is in the manifest`, !paths.some(p => p === 'node_modules' || p.startsWith('node_modules/')),
    paths.filter(p => p.startsWith('node_modules')).join(', '));
  expect(`${shape}: the manifest is not empty`, paths.length >= 2, `paths=${paths.length}`);

  // The guard itself: the command this replaced must still be observably broken
  // for the shape the runner's git ignores, so a revert cannot pass unnoticed.
  const old = fixture(shape);
  const r = git(old, 'add', '-A', '--', '.', ':(exclude)node_modules');
  const ignoredRefusal = r.status !== 0 && /ignored by one of your .gitignore files/i.test(`${r.stderr}${r.stdout}`);
  if (shape === 'realdir') {
    expect('realdir: the old pathspec command is refused, which is the bug', ignoredRefusal,
      `status=${r.status} stderr=${(r.stderr || '').trim().slice(0, 160)}`);
  } else {
    // git 2.50 leaves the symlink unignored (so the old command passed); 2.55
    // ignores it (so it failed, and main went red). Either is a known shape.
    expect('symlink: the old command either passes or is refused for the ignored path',
      r.status === 0 || ignoredRefusal, `status=${r.status} stderr=${(r.stderr || '').trim().slice(0, 160)}`);
  }

  // And the replacement survives being run twice on the same clone.
  const file = ignoreNotSource(base);
  const twice = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim() === '/node_modules').length;
  expect(`${shape}: the exclude line is written once, not appended every run`, twice === 1, `lines=${twice}`);
}

expect('both clone shapes were exercised', cases >= 14, `cases=${cases}`);

if (errors.length) {
  console.error(`[test_clean_rebuild_tree_manifest] FAIL (${errors.length} of ${cases} checks):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`[test_clean_rebuild_tree_manifest] OK: ${cases} checks across a symlinked and a real node_modules (git ${spawnSync('git', ['--version'], {encoding: 'utf8'}).stdout.trim()})`);
