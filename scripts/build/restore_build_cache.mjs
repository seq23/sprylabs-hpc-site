#!/usr/bin/env node
// Restore a build-cache entry saved by save_build_cache.mjs: write back the
// exact bytes a real build:all run produced from this same starting tree, and
// delete anything it removed. No generator runs.
//
// Never partially applies: if the manifest or payload is missing or
// unreadable, this exits non-zero and cached_build_all.sh falls back to a
// real build — a cache-restore step that can fail-open into "did nothing" is
// the incorrect-but-fast case the task forbids, so any doubt here is a hard
// failure, not a best-effort restore.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [, , entryDir] = process.argv;
if (!entryDir) {
  console.error('usage: restore_build_cache.mjs <entry-dir>');
  process.exit(2);
}

const manifestPath = `${entryDir}/manifest.json`;
if (!fs.existsSync(manifestPath)) {
  console.error(`[build-cache:restore] FAIL: ${manifestPath} does not exist`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.build_exit_code !== 0) {
  console.error(`[build-cache:restore] FAIL: entry ${entryDir} did not come from a successful build`);
  process.exit(1);
}

const removedPath = `${entryDir}/removed.txt`;
const removed = fs.existsSync(removedPath)
  ? fs.readFileSync(removedPath, 'utf8').split('\n').filter(Boolean)
  : [];
const payloadPath = `${entryDir}/payload.tar`;

if (manifest.files_changed > 0) {
  if (!fs.existsSync(payloadPath)) {
    console.error(`[build-cache:restore] FAIL: manifest declares ${manifest.files_changed} changed file(s) but ${payloadPath} is missing`);
    process.exit(1);
  }
  execFileSync('tar', ['-xf', payloadPath]);
}
for (const p of removed) {
  fs.rmSync(p, { force: true });
}

console.log(
  `[build-cache:restore] OK: wrote ${manifest.files_changed} file(s), removed ${removed.length} file(s) from ${entryDir}`,
);
