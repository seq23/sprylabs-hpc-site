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
  // Three left, and all three are 'exposed: false': they already carry '.claude'
  // in their own hand-written skip lists, so no walker in this repository can
  // reach an agent worktree any more. What is left is duplication, not exposure -
  // each still keeps a private copy of a rule that now has one definition, which
  // is the condition that produced the incident rather than the incident itself.
  //
  // Every entry reports itself PAID the moment its file imports the shared
  // boundary, so the fix and this bookkeeping never have to land together.
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
 * Actually recursive, tied to the directory read itself.
 *
 * The first version of this matched `function NAME(` followed by `NAME(` within
 * 1500 characters, which does not respect function boundaries: any helper called
 * again later in the file looked recursive. That accused
 * scripts/prebuild/run_prebuild_validation.js of being a root-recursive walker
 * because its `readJson` helper is called further down. It performs one flat
 * readdirSync with no descent and could never reach a worktree, so the accusation
 * was unfalsifiable - planting a page under .claude/ produced no difference,
 * because the file never looked in a subdirectory at all.
 *
 * A false positive here is not cheap. It sends someone to fix a file that is not
 * broken, and it inflates this guard's own carried count so the number it reports
 * stops meaning what it says.
 *
 * So: find each function, take its ACTUAL body by matching braces, and require
 * that the body both reads a directory and calls itself. Python's rglob and
 * os.walk are recursive by definition.
 */
function bodyOf(src, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(openIndex, i + 1);
    }
  }
  return '';
}

const READS_DIR = /readdirSync\s*\(|\breaddir\s*\(/;

function hasRecursiveDirWalk(src) {
  if (/\.rglob\s*\(|os\.walk\s*\(/.test(src)) return true;
  const defs = [
    ...src.matchAll(/function\s+(\w+)\s*\([^)]*\)\s*\{/g),
    ...src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\s*)?\([^)]*\)\s*(?:=>\s*)?\{/g),
  ];
  for (const def of defs) {
    const name = def[1];
    const open = src.indexOf('{', def.index + def[0].length - 1);
    if (open < 0) continue;
    const body = bodyOf(src, open);
    if (!body || !READS_DIR.test(body)) continue;
    // Does this function, the one that reads a directory, call itself?
    if (new RegExp(`\\b${name}\\s*\\(`).test(body.slice(1))) return true;
  }
  return false;
}

const ROOT_RECURSIVE_TEST = (src) => ROOT_SEEDED.test(src) && hasRecursiveDirWalk(src);
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
