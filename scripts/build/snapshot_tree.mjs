#!/usr/bin/env node
// Content snapshot of the working tree, used to compute the exact diff a real
// `npm run build:all` invocation produces (see save_build_cache.mjs and
// restore_build_cache.mjs). This is deliberately separate from
// .github/scripts/build_input_hash.sh, which is the proven CACHE KEY
// algorithm (tracked files only, git blob shas, output dirs excluded) already
// shipped in validate-repo.yml (PR #44) — cached_build_all.sh calls that
// script unchanged so the local cache key stays identical to the CI key.
//
// This script instead answers a different, narrower question: "what does the
// working tree actually contain right now, byte for byte" — tracked AND
// untracked-but-not-gitignored files, hashed from disk (not from git's index,
// so an uncommitted edit to a tracked file is seen). That is the only
// definition that lets a restore be proven byte-identical: it has to capture
// every file build:all could plausibly create or rewrite, including new pages
// that are not `git add`ed yet.
//
// Two paths are excluded even though they are not gitignored:
//   - .build-cache/   this cache's own storage; hashing it would make every
//                      snapshot depend on the snapshot before it.
//   - _validation_registry.json, _repo_validation_matrix.json  the two
//     append-only validator logs. CONFIRMED (grep, see PR description) that no
//     generator under scripts/ reads either file, so they are validator
//     output, never a build:all input, and excluding them from the DIFF
//     matches excluding them from the CI key for the same reason.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const EXCLUDE_EXACT = new Set([
  '_validation_registry.json',
  '_repo_validation_matrix.json',
]);
const EXCLUDE_PREFIX = ['.build-cache/'];

function isExcluded(p) {
  if (EXCLUDE_EXACT.has(p)) return true;
  return EXCLUDE_PREFIX.some((pre) => p.startsWith(pre));
}

function listFiles() {
  const tracked = execFileSync('git', ['ls-files'], { maxBuffer: 1024 * 1024 * 256 })
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
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

function snapshot() {
  const files = listFiles();
  const map = {};
  for (const p of files) {
    let content;
    try {
      content = readFileSync(p);
    } catch {
      // Listed by git but gone on disk (broken symlink, race with a
      // concurrent process) — never a case worth crashing the snapshot over;
      // it simply cannot be part of a restorable diff.
      continue;
    }
    map[p] = createHash('sha256').update(content).digest('hex');
  }
  return map;
}

const map = snapshot();
process.stdout.write(JSON.stringify({ files: map, file_count: Object.keys(map).length }));
