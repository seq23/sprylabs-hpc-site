#!/usr/bin/env node
// Save a build-cache entry: the exact diff a real, successful `npm run
// build:all` invocation produced, keyed by the input hash of the tree it
// started from (see .github/scripts/build_input_hash.sh for the key and
// snapshot_tree.mjs for what "diff" means here).
//
// Called only after build:all exits 0 — see scripts/build/cached_build_all.sh.
// A failed or crashed build never reaches this script, so a cache entry can
// never represent a half-built tree; there is nothing to "reject", there is
// simply never a save call.
//
// `reached_fixed_point` records whether THIS invocation, alone, changed
// nothing (files_changed === 0 && files_removed === 0). That is the same
// definition converge_tree_before_commit.sh already uses for its own loop:
// "A pass that changes nothing IS the fixed point." A non-empty diff is still
// a correct, deterministic, cacheable result (replaying it is byte-identical
// to what build:all would produce again from the same starting tree) — it is
// simply not, by itself, proof that the tree it produced needs no further
// pass. The outer convergence loop's own guard-check decides that, unchanged,
// on every restore or real run alike.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [, , key, preSnapshotPath, entryDir] = process.argv;
if (!key || !preSnapshotPath || !entryDir) {
  console.error('usage: save_build_cache.mjs <key> <pre-snapshot.json> <entry-dir>');
  process.exit(2);
}

const pre = JSON.parse(fs.readFileSync(preSnapshotPath, 'utf8')).files;
const postRaw = execFileSync('node', ['scripts/build/snapshot_tree.mjs'], {
  maxBuffer: 1024 * 1024 * 512,
}).toString('utf8');
const post = JSON.parse(postRaw).files;

const changed = [];
for (const [p, hash] of Object.entries(post)) {
  if (pre[p] !== hash) changed.push(p);
}
const removed = Object.keys(pre).filter((p) => !(p in post));

fs.mkdirSync(entryDir, { recursive: true });

if (changed.length) {
  const listPath = `${entryDir}/files.txt`;
  fs.writeFileSync(listPath, changed.join('\0'));
  execFileSync('tar', ['--null', '-T', listPath, '-cf', `${entryDir}/payload.tar`]);
  fs.unlinkSync(listPath);
} else {
  fs.rmSync(`${entryDir}/payload.tar`, { force: true });
}
fs.writeFileSync(`${entryDir}/removed.txt`, removed.join('\n') + (removed.length ? '\n' : ''));

const manifest = {
  key,
  created_at: new Date().toISOString(),
  node_version: process.version,
  build_exit_code: 0,
  pre_file_count: Object.keys(pre).length,
  post_file_count: Object.keys(post).length,
  files_changed: changed.length,
  files_removed: removed.length,
  diff_empty: changed.length === 0 && removed.length === 0,
  reached_fixed_point: changed.length === 0 && removed.length === 0,
};
fs.writeFileSync(`${entryDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `[build-cache:save] key=${key} changed=${changed.length} removed=${removed.length} reached_fixed_point=${manifest.reached_fixed_point}`,
);
