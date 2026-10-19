// One authority for clearing a generator's output directory before it rewrites it.
//
// A generator owns the pages it writes, not the directory they sit in. brand-defense/
// is both an output dir of scripts/programmatic/generate_aplayer_phase_expansion.mjs
// and a navigation SECTION whose hub (brand-defense/index.html and any
// topics/<id>/index.html) is written by scripts/internal/build_navigation_structure.mjs.
// The generator used to rm -rf the whole dir, which deleted the hub; nothing in
// release:content-finalize rebuilds it before the selfheal profile, so 101 frozen
// blobs linking /brand-defense/ failed validate:frozen-output-contract and Spry
// Content Release went red on main (17 and 18 Oct 2026, run 39135874388).
//
// sweepGeneratedDir deletes every file EXCEPT one another generator has signed,
// and removes a directory only once it is empty.
// scripts/validation/self_test_generated_dir_sweep.mjs proves it.
import fs from 'node:fs';
import path from 'node:path';

// The marker build_navigation_structure.mjs writes into every hub it renders.
// The self-test reads that script and fails if it stops emitting this string.
export const NAV_HUB_MARKER = 'data-internal-nav="hub-index"';

export function isForeignOwnedFile(abs) {
  if (!abs.endsWith('.html')) return false;
  return fs.readFileSync(abs, 'utf8').includes(NAV_HUB_MARKER);
}

// Returns the relative paths it kept, so callers and tests can name them.
export function sweepGeneratedDir(dir, root = dir, kept = []) {
  if (!fs.existsSync(dir)) return kept;
  const before = kept.length;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sweepGeneratedDir(full, root, kept);
    else if (isForeignOwnedFile(full)) kept.push(path.relative(root, full).replace(/\\/g, '/'));
    else fs.rmSync(full, { force: true });
  }
  if (kept.length === before) fs.rmSync(dir, { recursive: true, force: true });
  return kept;
}
