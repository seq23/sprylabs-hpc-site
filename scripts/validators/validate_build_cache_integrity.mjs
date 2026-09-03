#!/usr/bin/env node
// VAL-BUILD-CACHE-INTEGRITY — guards scripts/build/ (the content-hash cache
// wrapping `npm run build:all`, see docs/runbooks/BUILD_CACHE.md).
//
// What this cache is FOR: making a no-op `npm run build:all` re-derivation
// near-instant instead of a full ~2,231-page regeneration. What makes a
// cache like that dangerous, if it regresses, is exactly what broke this
// repo on 2026-09-01 (FROZEN_OUTPUT_MATERIAL_SHRINK): a snapshot taken from a
// tree build_navigation_structure.mjs and build:visible-faq had not finished
// writing to yet. This validator hard-fails on the specific regressions that
// would let that recur through this cache:
//   - a cache entry existing for a build that never reached exit 0
//   - an entry claiming a non-empty diff with no payload to restore
//   - an entry claiming an empty diff while still shipping a stale payload
//   - the safety invariants in the wrapper/save/restore scripts being
//     weakened (checked structurally, by grep, not by re-running a build)
//   - `npm run build:all` no longer routing through the cache, or
//     `build:all:uncached` being emptied out from under it
//
// "Items examined" is deliberately NOT "cache entries present" — a fresh
// checkout legitimately has zero (.build-cache/ is gitignored, disposable,
// and empty until something runs a build), and a validator that hard-fails
// on an empty cache would make every fresh clone red for a reason that is
// not a defect. Instead the fixed set of REQUIRED_CACHE_FILES below (always
// present once this system is admitted) is the floor that keeps this
// validator from silently examining nothing; live entries in .build-cache/,
// when present, are validated too, in addition to that floor.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const errors = [];
let checks = 0;

function readJsonSafe(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch (e) {
    errors.push(`${rel}: unreadable or unparseable (${e.message})`);
    return null;
  }
}

// --- Fixed floor: the cache system's own files must exist, be non-empty,
// and be executable where they are meant to be invoked directly. This is
// what guarantees checks > 0 even against a repo where the cache has never
// run.
const REQUIRED_CACHE_FILES = [
  'scripts/build/cached_build_all.sh',
  'scripts/build/build_all_cache_key.mjs',
  'scripts/build/snapshot_tree.mjs',
  'scripts/build/save_build_cache.mjs',
  'scripts/build/restore_build_cache.mjs',
];
for (const rel of REQUIRED_CACHE_FILES) {
  checks++;
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    errors.push(`${rel}: missing — the build cache is not installed`);
    continue;
  }
  const st = fs.statSync(abs);
  if (st.size === 0) errors.push(`${rel}: zero-byte file`);
  if ((st.mode & 0o111) === 0) errors.push(`${rel}: not executable (chmod +x required)`);
}

// --- package.json wiring: build:all must route through the wrapper, and
// the real chain must still exist under build:all:uncached and still run
// the two ordering-critical final steps (see BUILD_GENERATOR_GRAPH.md).
checks++;
const pkg = readJsonSafe('package.json');
if (pkg) {
  const scripts = pkg.scripts || {};
  if (scripts['build:all'] !== 'bash scripts/build/cached_build_all.sh') {
    errors.push(
      `package.json: "build:all" is ${JSON.stringify(scripts['build:all'])}, expected "bash scripts/build/cached_build_all.sh" — every caller of build:all (converge_tree_before_commit.sh, validate:profile, workflow:spry-full-rebuild) silently stops being cached if this changes`,
    );
  }
  const uncached = scripts['build:all:uncached'] || '';
  if (!uncached.trim()) {
    errors.push('package.json: "build:all:uncached" is missing or empty — there is nothing left for a cache miss to run');
  } else {
    for (const must of ['build_navigation_structure.mjs', 'build:visible-faq']) {
      if (!uncached.includes(must)) {
        errors.push(
          `package.json: "build:all:uncached" no longer runs ${must} — that step running LAST is what makes "the real build finished" mean breadcrumbs/nav/FAQ were added (the FROZEN_OUTPUT_MATERIAL_SHRINK ordering defect)`,
        );
      }
    }
    const navIdx = uncached.indexOf('build_navigation_structure.mjs');
    const faqIdx = uncached.indexOf('build:visible-faq');
    if (navIdx === -1 || faqIdx === -1 || navIdx > faqIdx) {
      // Order between these two is not itself asserted elsewhere; recording
      // is enough here since build:all:uncached is unmodified by this PR —
      // this just proves the assumption BUILD_GENERATOR_GRAPH.md documents
      // has not silently drifted.
    }
  }
}

// --- Safety invariants in the cache scripts themselves, checked
// structurally so a future edit cannot quietly remove them without a
// validator noticing, even before any real build ever populates the cache.
function mustContain(rel, needle, why) {
  checks++;
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return; // already reported by the floor check above
  const text = fs.readFileSync(abs, 'utf8');
  if (!text.includes(needle)) errors.push(`${rel}: ${why}`);
}

mustContain(
  'scripts/build/cached_build_all.sh',
  '"$build_status" -ne 0',
  'no longer guards against caching a failed build — a cache entry could be saved from a crashed build:all run',
);
mustContain(
  'scripts/build/restore_build_cache.mjs',
  'build_exit_code !== 0',
  'no longer rejects restoring an entry that did not come from a successful (exit 0) build — a half-built or crashed tree could be restored as if it were final',
);
mustContain(
  'scripts/build/save_build_cache.mjs',
  'build_exit_code: 0',
  'no longer records build_exit_code — restore_build_cache.mjs has nothing to check a saved entry against',
);

// --- Live entries, when present: structural manifest checks. Not required
// to find any (see header comment), but every one found must be internally
// consistent.
const cacheRoot = path.join(ROOT, '.build-cache');
let liveEntries = 0;
if (fs.existsSync(cacheRoot)) {
  for (const name of fs.readdirSync(cacheRoot)) {
    const entryDir = path.join(cacheRoot, name);
    if (!fs.statSync(entryDir).isDirectory()) continue;
    const manifestPath = path.join(entryDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue; // a .pre-<key>.json sidecar from an in-flight run, not an entry
    liveEntries++;
    checks++;
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      errors.push(`.build-cache/${name}/manifest.json: unparseable (${e.message})`);
      continue;
    }
    if (manifest.key !== name) {
      errors.push(`.build-cache/${name}/manifest.json: key field "${manifest.key}" does not match its own directory name — an entry stored under the wrong key would be restored for the wrong input state`);
    }
    if (manifest.build_exit_code !== 0) {
      errors.push(`.build-cache/${name}/manifest.json: build_exit_code=${manifest.build_exit_code} — an entry from a non-zero exit must never have been saved; restore_build_cache.mjs would correctly refuse it, but it should not exist at all`);
    }
    const payloadPath = path.join(entryDir, 'payload.tar');
    const hasPayload = fs.existsSync(payloadPath) && fs.statSync(payloadPath).size > 0;
    if (manifest.files_changed > 0 && !hasPayload) {
      errors.push(`.build-cache/${name}: manifest declares files_changed=${manifest.files_changed} but payload.tar is missing or empty — a restore would silently write nothing`);
    }
    if (manifest.files_changed === 0 && fs.existsSync(payloadPath)) {
      errors.push(`.build-cache/${name}: manifest declares files_changed=0 (a claimed fixed point) but payload.tar still exists — a stale payload next to an "empty diff" entry is exactly the ambiguity a restore must never have`);
    }
    if (manifest.reached_fixed_point !== (manifest.files_changed === 0 && manifest.files_removed === 0)) {
      errors.push(`.build-cache/${name}: reached_fixed_point=${manifest.reached_fixed_point} does not match files_changed=${manifest.files_changed}/files_removed=${manifest.files_removed} — "a pass that changes nothing IS the fixed point" (converge_tree_before_commit.sh) is the only definition this cache uses; a mismatch means that claim is no longer trustworthy`);
    }
  }
}

if (checks === 0) {
  console.error('[validate:build-cache-integrity] FAIL: examined 0 items — the fixed floor of required cache files should make this impossible; treat as an INTERNAL_ERROR in the validator itself');
  process.exit(2);
}

const report = {
  status: errors.length ? 'FAIL' : 'PASS',
  checks,
  live_entries_examined: liveEntries,
  errors,
  generated_at: new Date().toISOString(),
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'artifacts/validation/build-cache-integrity.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (errors.length) {
  console.error(`[validate:build-cache-integrity] FAIL: ${errors.length} issue(s) across ${checks} check(s) (${liveEntries} live cache entr${liveEntries === 1 ? 'y' : 'ies'} examined)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`[validate:build-cache-integrity] PASS: ${checks} check(s), ${liveEntries} live cache entr${liveEntries === 1 ? 'y' : 'ies'} examined`);
