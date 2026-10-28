/**
 * The tree manifest the clean-rebuild parity check compares: path -> blob id for
 * every tracked and new non-ignored file in an isolated build clone.
 *
 * Why this is its own module: the dependency directory has to be kept out of the
 * manifest, and the obvious way to do that - naming it in a negative pathspec,
 * `git add -A -- . :(exclude)node_modules` - is what red-ed main on
 * 2026-10-25. `git add` refuses, exit 1, "The following paths are ignored by one
 * of your .gitignore files", whenever a pathspec element names an ignored path.
 * Locally that never fired: `node_modules` in a parity clone is a symlink, and
 * git 2.50 did not match a symlink against the directory rule `node_modules/`,
 * so the path was not ignored and naming it was harmless. The GitHub runner
 * moved to git 2.55, which does match it, and the same command started failing
 * on main - where the parity job runs - while every pull request stayed green.
 *
 * So the directory is made ignored here instead of named: one `/node_modules`
 * line in the clone's own .git/info/exclude, which matches the path whether it
 * is a symlink or a real directory, and then a plain `git add -A -- .` with no
 * pathspec to refuse. Pinned by
 * .github/scripts/test_clean_rebuild_tree_manifest.mjs, which runs both shapes
 * on every pull request.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

/** Kept out of the manifest: installed dependencies are not part of the source. */
export const NOT_SOURCE = ['/node_modules'];

/** Throws on a non-zero git; the caller decides whether that is a validator failure. */
export function git(cwd, args) {
  const r = spawnSync('git', args, {cwd, encoding: 'utf8', maxBuffer: 1 << 28});
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} exited ${r.status}: ${(r.stderr || '').trim().slice(0, 400)}`);
  return r.stdout;
}

/**
 * Ignore the dependency directory in this clone, whatever shape it has, so that
 * `git add` never has to be told about it. Idempotent.
 */
export function ignoreNotSource(base, run = git) {
  const gitDir = path.resolve(base, run(base, ['rev-parse', '--git-dir']).trim());
  const info = path.join(gitDir, 'info');
  fs.mkdirSync(info, {recursive: true});
  const file = path.join(info, 'exclude');
  const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = new Set(have.split('\n').map(l => l.trim()).filter(Boolean));
  const add = NOT_SOURCE.filter(l => !lines.has(l));
  if (add.length) fs.writeFileSync(file, `${have}${have.endsWith('\n') || !have ? '' : '\n'}${add.join('\n')}\n`);
  return file;
}

/** path -> `mode:blob` for every tracked and new non-ignored file after the build. */
export function treeManifest(base, run = git) {
  ignoreNotSource(base, run);
  run(base, ['add', '-A', '--', '.']);
  const o = {};
  for (const rec of run(base, ['ls-files', '-s', '-z']).split('\0')) {
    if (!rec) continue;
    const m = rec.match(/^(\d+) ([0-9a-f]+) \d\t(.*)$/s);
    if (m) o[m[3]] = `${m[1]}:${m[2]}`;
  }
  return o;
}
