#!/usr/bin/env node
// Content hash of the build:all input surface, computed from the WORKING
// TREE.
//
// This is deliberately NOT .github/scripts/build_input_hash.sh, even though
// that script's exclude list is reused verbatim below. build_input_hash.sh
// keys off `git ls-files -s`, which reports the SHA of what is in the git
// INDEX (or HEAD, if nothing is staged) — correct for a fresh CI checkout,
// where the index and the working tree are always identical, but blind to an
// uncommitted, UNSTAGED edit locally.
//
// CONFIRMED by reproduction while building this cache: appending one line to
// a tracked page's HTML on disk, without `git add`ing it, left
// build_input_hash.sh's key byte-for-byte unchanged. Wired into
// cached_build_all.sh as-is, that edit would have been served the PRE-edit
// cached tree — a false hit, restoring stale content over a real change. That
// is exactly the "incorrect-but-fast" outcome the task forbids, so the local
// wrapper cannot use that script's key; it needs a key that sees the working
// tree, not the index.
//
// The exclude list is kept identical to build_input_hash.sh's on purpose —
// same directories are pure build receipts/logs, never a generator input, in
// both contexts. If that list changes there, change it here too.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const EXCLUDE_DIR_RE = /(^|\/)(artifacts|reports|logs|test-results|playwright-report|releases|\.build|\.github\/workflows)\//;
const EXCLUDE_EXACT = new Set(['_validation_registry.json', '_repo_validation_matrix.json']);
const EXCLUDE_PREFIX = ['.build-cache/'];

function isExcluded(p) {
  if (EXCLUDE_EXACT.has(p)) return true;
  if (EXCLUDE_PREFIX.some((pre) => p.startsWith(pre))) return true;
  return EXCLUDE_DIR_RE.test(p);
}

function listFiles() {
  const tracked = execFileSync('git', ['ls-files'], { maxBuffer: 1024 * 1024 * 256 })
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
  // Untracked-but-not-ignored files matter here in a way they never can in a
  // fresh CI checkout: a brand new generator script or page someone has not
  // `git add`ed yet is still a real input to the next build:all run.
  const untracked = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    { maxBuffer: 1024 * 1024 * 256 },
  )
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
  const set = new Set([...tracked, ...untracked]);
  return [...set].filter((p) => !isExcluded(p)).sort();
}

const files = listFiles();
if (files.length < 100) {
  console.error(
    `[build-all-cache-key] FAIL: ${files.length} candidate input file(s); refusing a near-constant key (mirrors build_input_hash.sh's identical guard) — a key this small would make every run falsely hit`,
  );
  process.exit(1);
}

const hasher = createHash('sha256');
let counted = 0;
for (const p of files) {
  let content;
  try {
    content = readFileSync(p);
  } catch {
    continue; // listed by git, gone on disk — cannot be part of the key
  }
  const h = createHash('sha256').update(content).digest('hex');
  hasher.update(p);
  hasher.update('\0');
  hasher.update(h);
  hasher.update('\n');
  counted++;
}
const key = hasher.digest('hex');
console.log(`[build-all-cache-key] files=${counted} key=${key}`);
