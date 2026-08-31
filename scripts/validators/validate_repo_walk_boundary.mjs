#!/usr/bin/env node
/**
 * Static guard: a script that recurses from the repo root and writes back into
 * the tree it walked must use the shared walk boundary in scripts/lib/repo_walk.
 *
 * Why
 * ---
 * `git worktree add .claude/worktrees/<id>` puts a COMPLETE second checkout of
 * this repository inside the working tree. .gitignore keeps git out of it but
 * governs nothing else, and roughly nineteen scripts here recurse from the repo
 * root, each with its own hand-written skip list. Three had '.claude'. Sixteen
 * did not. Walkers that descended into a worktree rewrote 2,295 HTML files
 * belonging to another checkout, wrote that checkout's paths into TRACKED data,
 * and counted the foreign pages as their own work - so the run also reported
 * more done than it had done.
 *
 * The rule was already written down. .gitignore says, in as many words, that
 * "the walkers need '.claude' in their skip lists". Nothing enforced it. A rule
 * in a comment beside nineteen private copies of a list is only ever as good as
 * the last person who remembered it, and the next walker written makes twenty.
 * That is the same defect as any other duplicated list, and the fix is the same:
 * one definition, and something that fails when a writer does not use it.
 *
 * This does not try to police every walk. It fails the combination that actually
 * corrupted a checkout - recursing from the root AND writing to a path that came
 * out of that recursion - because a read-only walk over a worktree produces a
 * wrong count, while a writing one produces wrong files in someone else's repo.
 * Read-only root walkers are reported, not failed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const CJS = 'scripts/lib/repo_walk.cjs';
const PY = 'scripts/lib/repo_walk.py';

const ROOTS = ['scripts'];
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.py']);
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '_vendor', 'legacy', 'legacy_ops']);

/** The definition itself, its language halves, and this guard. Not walkers. */
const EXEMPT = new Set([
  CJS,
  PY,
  'scripts/lib/repo_walk.mjs',
  'scripts/validators/validate_repo_walk_boundary.mjs',
]);

/**
 * Root-recursive writers that predate this guard and live outside the validation
 * owner's territory. Named, counted, and re-proved every run: once a file starts
 * using the shared boundary its entry is reported PAID and the run stays green,
 * so the fix and the bookkeeping never have to land in the same commit. A debt
 * that is paid can never hide a defect, so it must not fail a build.
 */
const KNOWN_UNMIGRATED = [
  // Four live root-recursive writers remain, all outside the validation owner's
  // territory and all named by the build agent as outside its own. Two of them run
  // inside Validate Repo itself - .github/workflows/validate-repo.yml calls
  // `npm run cadence:gate` and `npm run cadence:template-share` - so an exposed
  // walker executes on every validation run.
  //
  // 'exposed: true' means the file carries no '.claude' entry at all, so a worktree
  // left under .claude/ is its to rewrite. That is not a miscount: unmigrated,
  // apply_citation_program wrote a worktree path into citable_pages.json,
  // query_registry.json and public_route_manifest.json. These walkers poison
  // authorities.
  //
  // Each reports itself PAID the moment it imports the shared boundary, so the fix
  // and this bookkeeping never have to land together.
  { file: 'scripts/apply_fanout.js', owner: 'content lane (npm run fanout:apply)', exposed: true },
  { file: 'scripts/template_share.js', owner: 'content lane (cadence:template-share - RUNS IN Validate Repo)', exposed: true },
  { file: 'scripts/cadence_gate.js', owner: 'release lane (cadence:gate - RUNS IN Validate Repo)', exposed: true },
  { file: 'scripts/prebuild/run_prebuild_validation.js', owner: 'build chain (prebuild:validate; not reachable from build:all)', exposed: true },
  // Already carry '.claude' privately, so safe today, but each still keeps its own
  // copy of the rule - the condition that produced the incident.
  { file: 'scripts/content/apply_redirect_map.mjs', owner: 'build chain', exposed: false },
  { file: 'scripts/content/build_visible_faq_sections.py', owner: 'build chain', exposed: false },
  { file: 'scripts/internal/build_navigation_structure.mjs', owner: 'build chain', exposed: false },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function stripComments(src, ext) {
  if (ext === '.py') {
    return src.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '').replace(/(^|[^\\])#[^\n]*/g, '$1');
  }
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

/**
 * Root-seeded: the walk starts at the repository root rather than a subdirectory.
 * scripts/validation/validate_python_dependency_contract.py rglobs SCRIPTS, not
 * ROOT, so it can never reach .claude and is correctly not governed here.
 */
const ROOT_SEEDED = /readdirSync\s*\(\s*(?:ROOT|process\.cwd\(\))|\b(?:ROOT|Path\.cwd\(\))\s*\.rglob\s*\(|os\.walk\s*\(\s*(?:ROOT|Path\.cwd\(\))|\bwalk\w*\s*\(\s*(?:ROOT|process\.cwd\(\))/;

/**
 * Actually recursive: a named function that calls itself, an arrow that calls
 * itself, or a language-level recursive walk. Without this, a single flat
 * `fs.readdirSync(ROOT).filter(...)` looked like a root walk -
 * scripts/validators/validate_amazon_book_landing.mjs reads the root once for
 * sitemap files and never descends, so it cannot reach a worktree.
 */
const RECURSES = /function\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]{0,1500}?\b\1\s*\(|const\s+(\w+)\s*=\s*(?:function\s*)?\([^)]*\)\s*(?:=>)?\s*\{[\s\S]{0,1200}?\b\2\s*\(|\.rglob\s*\(|os\.walk\s*\(/;

const ROOT_RECURSIVE_TEST = (src) => ROOT_SEEDED.test(src) && RECURSES.test(src);
/**
 * A write whose destination came out of the walk.
 *
 * Excludes the common `writeFileSync(path.join(ROOT, 'artifacts/...'), ...)`
 * report write, whose destination is a literal this walk never produced -
 * scripts/validators/validate_amazon_book_landing.mjs only reads the root
 * non-recursively and writes one report, so it was a false positive.
 */
const WRITES_WALKED_PATH = /writeFileSync\s*\(\s*(?!["'`])(?!path\.join\s*\(\s*ROOT\s*,\s*["'])|\.write_text\s*\(/;
/** Uses the shared boundary. */
const USES_BOUNDARY = /repo_walk/;

const files = walk('scripts').map((f) => f.split(path.sep).join('/'));

// Rule 0: a boundary guard that reaches no source file protects nothing.
if (!files.length) {
  console.error(`[validate:repo-walk-boundary] FAIL: scanned 0 source files under ${ROOTS.join(', ')}. Expected the repository's scripts. A guard that reads no code cannot govern any walker.`);
  process.exit(1);
}

// The two language halves must list the same directories, or the rule is two
// rules again - which is the defect this whole module exists to remove.
if (!fs.existsSync(CJS) || !fs.existsSync(PY)) {
  console.error(`[validate:repo-walk-boundary] FAIL: the shared boundary is missing (${CJS} / ${PY}).`);
  process.exit(1);
}
const jsDirs = require_(path.resolve(CJS)).IGNORED_DIRS;
const pyDirs = (fs.readFileSync(PY, 'utf8').match(/IGNORED_DIRS = \(([\s\S]*?)\)/) || [, ''])[1]
  .split(',').map((x) => (x.match(/['"]([^'"]+)['"]/) || [, null])[1]).filter(Boolean);
const errors = [];
if (JSON.stringify([...jsDirs].sort()) !== JSON.stringify([...pyDirs].sort())) {
  errors.push(`${CJS} and ${PY} do not list the same directories. JS-only: [${jsDirs.filter((d) => !pyDirs.includes(d))}]; Python-only: [${pyDirs.filter((d) => !jsDirs.includes(d))}]. Two halves that disagree are two rules.`);
}
if (!jsDirs.includes('.claude')) {
  errors.push(`${CJS} does not list '.claude'. That entry is the reason this boundary exists: an agent worktree is a complete second checkout of this repo.`);
}

const debtByFile = new Map(KNOWN_UNMIGRATED.map((e) => [e.file, e]));
const migrated = [];
const carried = [];
const paid = [];
const readOnlyRootWalkers = [];

for (const rel of files) {
  if (EXEMPT.has(rel)) continue;
  const src = stripComments(fs.readFileSync(rel, 'utf8'), path.extname(rel));
  if (!ROOT_RECURSIVE_TEST(src)) continue;
  const uses = USES_BOUNDARY.test(src);
  const writes = WRITES_WALKED_PATH.test(src);

  if (!writes) {
    if (!uses) readOnlyRootWalkers.push(rel);
    continue;
  }
  if (uses) {
    migrated.push(rel);
    if (debtByFile.has(rel)) paid.push(rel);
    continue;
  }
  if (debtByFile.has(rel)) {
    const d = debtByFile.get(rel);
    // An entry that claims to be protected but has lost its '.claude' guard is
    // worse than an unmigrated one, because the list says it is safe.
    const stillHasClaude = /\.claude/.test(fs.readFileSync(rel, 'utf8'));
    if (!d.exposed && !stillHasClaude) {
      errors.push(`${rel}: recorded here as carrying '.claude' in its own skip list, but it no longer does. Either restore it or migrate the file to ${CJS}.`);
      continue;
    }
    carried.push({ file: rel, owner: d.owner, exposed: d.exposed || !stillHasClaude });
    continue;
  }
  errors.push(`${rel}: recurses from the repository root and writes back to a walked path without using ${CJS}. An agent worktree under .claude/ is a complete second checkout, so this walk can rewrite another checkout's files and count them as its own work. Import { isIgnoredDir } or { walkFiles } from scripts/lib/repo_walk.`);
}

// The guard must reach the walkers it governs.
const governed = migrated.length + carried.length + paid.length;
if (!governed) {
  console.error(`[validate:repo-walk-boundary] FAIL: scanned ${files.length} files and identified 0 root-recursive writers. This repo is known to contain about nineteen. The detection patterns no longer reach the code they govern, so this guard is inert.`);
  process.exit(1);
}

for (const entry of KNOWN_UNMIGRATED) {
  if (!fs.existsSync(entry.file)) paid.push(`${entry.file} (no longer present)`);
}

fs.mkdirSync('artifacts/validation', { recursive: true });
fs.writeFileSync('artifacts/validation/repo-walk-boundary.json', `${JSON.stringify({
  status: errors.length ? 'FAIL' : 'PASS',
  files_scanned: files.length,
  boundary_dirs: jsDirs,
  migrated: migrated.sort(),
  carried_unmigrated: carried,
  carried_exposed_count: carried.filter((c) => c.exposed).length,
  paid,
  read_only_root_walkers: readOnlyRootWalkers.sort(),
  errors,
}, null, 2)}\n`);

if (errors.length) {
  console.error('[validate:repo-walk-boundary] FAIL: walk boundary not used');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(`[validate:repo-walk-boundary] PASS: ${files.length} source files scanned; ${migrated.length} root-recursive writer(s) use the shared boundary, ${carried.length} carried as named debt.`);
const exposed = carried.filter((c) => c.exposed);
if (exposed.length) {
  console.warn(`[validate:repo-walk-boundary] ${exposed.length} of those carry NO '.claude' entry at all and can rewrite an agent worktree's files today. Owned outside this validator's territory:`);
  for (const c of exposed) console.warn(`- ${c.file} [${c.owner}]`);
}
if (paid.length) {
  console.log(`[validate:repo-walk-boundary] ${paid.length} named debt entr(ies) now use the boundary. The debt is paid; those KNOWN_UNMIGRATED entries can be deleted:`);
  for (const f of paid) console.log(`- ${f}`);
}
if (readOnlyRootWalkers.length) {
  console.warn(`[validate:repo-walk-boundary] ${readOnlyRootWalkers.length} read-only root walker(s) do not use the boundary. They cannot corrupt another checkout, but they can count its pages as this site's:`);
  for (const f of readOnlyRootWalkers.slice(0, 20)) console.warn(`- ${f}`);
}
