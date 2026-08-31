'use strict';

/**
 * One skip list for every directory walker in this repository.
 *
 * `git worktree add .claude/worktrees/<id>` puts a COMPLETE second checkout of
 * this repository inside the working tree. .gitignore keeps git out of it, but
 * .gitignore governs git, not directory walkers - and roughly nineteen scripts
 * here recurse from the repo root, each carrying its own hand-written skip list.
 * Walkers that descended into a worktree left behind rewrote 2,295 HTML files
 * belonging to another checkout and then wrote that checkout's paths into
 * TRACKED data: data/report_fixes/agent_acceptance_manifest.generated.json had a
 * real page path REPLACED by a .claude/worktrees/... one. The same walk also
 * counted those foreign pages as its own work, so the run reported more done
 * than it had done.
 *
 * The rule was written down - .gitignore says in as many words that "the walkers
 * need '.claude' in their skip lists" - and nothing enforced it. A rule living in
 * a comment next to nineteen private copies of the list is the same defect as
 * nineteen copies of any other list: it is only ever as good as the last person
 * who remembered. Three of the nineteen had '.claude'. Sixteen did not.
 *
 * So this is the list, and scripts/validators/validate_repo_walk_boundary.mjs
 * fails any root-recursive walker that does not use it.
 *
 * The Python half is scripts/lib/repo_walk.py and the two must agree.
 */

/**
 * Directories a repo-root walk must never descend into.
 *
 * `.claude` is the load-bearing entry - it is a nested checkout of this same
 * repo, so everything inside it looks exactly like a real page. The rest are
 * either not ours (node_modules, .git) or build/test output that no walker
 * should be reading as source.
 */
const IGNORED_DIRS = Object.freeze([
  '.claude',            // agent worktrees: a complete second checkout of this repo
  '.git',
  'node_modules',
  '.build',
  '.pages-output',
  '.wrangler',
  '.clarity',
  '.validation-cache',
  '.validation-runtime',
  'coverage',
  'test-results',
  'playwright-report',
  'releases',
  '__pycache__',
  'scripts/_vendor',    // vendored third-party Python, not repo source
]);

const IGNORED_SET = new Set(IGNORED_DIRS);

/**
 * Should a walk skip this directory?
 *
 * Takes the directory's own name and, optionally, its path relative to the repo
 * root, so a nested entry like 'scripts/_vendor' matches too. Callers that only
 * have a name still get the important cases, because '.claude', '.git' and
 * 'node_modules' are matched by name at any depth - a worktree can be nested.
 */
function isIgnoredDir(name, relPath) {
  if (IGNORED_SET.has(name)) return true;
  if (!relPath) return false;
  const rel = String(relPath).split('\\').join('/').replace(/^\.\//, '');
  return IGNORED_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`) || rel.split('/').includes(d));
}

/**
 * A recursive file walk that cannot wander into another checkout.
 *
 * Returns paths relative to `root`. `filter` receives the relative path and is
 * applied to files only.
 */
function walkFiles(root, { filter } = {}) {
  const fs = require('fs');
  const path = require('path');
  const out = [];
  (function recurse(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (isIgnoredDir(entry.name, rel)) continue;
        recurse(full);
      } else if (entry.isFile()) {
        if (!filter || filter(rel)) out.push(rel);
      }
    }
  }(root));
  return out.sort();
}

module.exports = { IGNORED_DIRS, IGNORED_SET, isIgnoredDir, walkFiles };
