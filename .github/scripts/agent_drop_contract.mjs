// THE ONE DEFINITION of what a Twin Agent drop is.
//
// Three components used to decide this on their own: the sentinel's quarantine
// kept DROP_ROOT/MANIFEST constants, the writer's instructions described the
// branch name in prose, and the intake lane assumed whatever landed on main.
// Two components each keeping their own list is how one of them drifts, so every
// reader now imports this file:
//
//   - .github/scripts/quarantine_raw_agent_drop.mjs   (a raw drop found on main)
//   - .github/scripts/overlay_agent_drop.mjs          (a drop branch the release
//                                                       lane absorbs into main)
//   - scripts/validators/validate_agent_drop_gate.mjs (the instructions document
//                                                       must name BRANCH_PREFIX)
//
// A drop is: one or more directories DROP_ROOT/<YYYY-MM-DD>/<scope>/, each
// holding an agent_run_manifest.json, and NOTHING else. Anything outside that
// shape is not a drop and no automation may carry it toward main.

import path from 'node:path';

export const DROP_ROOT = 'data/report_fixes/agent_runs/';
export const MANIFEST = 'agent_run_manifest.json';
export const BRANCH_PREFIX = 'agent-drop/';
// Branch names reach a shell (workflow inputs, git refspecs). Only this shape is
// ever accepted, so no caller has to quote defensively.
export const BRANCH_PATTERN = /^agent-drop\/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9][a-z0-9-]{0,62}$/;
const DIR_PATTERN = /^data\/report_fixes\/agent_runs\/([0-9]{4}-[0-9]{2}-[0-9]{2})\/([a-z0-9][a-z0-9-]{0,62})\/[^/]+$/;

export function branchFor(runDate, scope) {
  return `${BRANCH_PREFIX}${runDate}-${scope}`;
}

// files: repo-relative paths the drop adds or changes.
// Returns {ok:true, dropDirs, runDate, scope, manifests} or
//         {ok:false, reason, detail} with a named reason.
export function classifyDropFiles(files) {
  if (!Array.isArray(files) || !files.length) return {ok: false, reason: 'empty_drop', detail: 'the drop touches no files.'};
  const outside = files.filter((f) => !f.startsWith(DROP_ROOT));
  if (outside.length) {
    return {ok: false, reason: 'not_a_raw_drop', detail: `${outside.length} of ${files.length} file(s) are outside ${DROP_ROOT}: ${outside.slice(0, 5).join(', ')}${outside.length > 5 ? ', ...' : ''}.`};
  }
  const misplaced = files.filter((f) => !DIR_PATTERN.test(f));
  if (misplaced.length) {
    return {ok: false, reason: 'not_a_run_directory', detail: `${misplaced.length} file(s) are not directly inside ${DROP_ROOT}<YYYY-MM-DD>/<scope>/: ${misplaced.slice(0, 5).join(', ')}.`};
  }
  const manifests = files.filter((f) => path.posix.basename(f) === MANIFEST);
  if (!manifests.length) {
    return {ok: false, reason: 'no_manifest', detail: `all ${files.length} file(s) are under ${DROP_ROOT} but none is ${MANIFEST}; without a manifest nothing absorbs it.`};
  }
  const dropDirs = [...new Set(files.map((f) => path.posix.dirname(f)))].sort();
  const withManifest = new Set(manifests.map((m) => path.posix.dirname(m)));
  const orphan = dropDirs.filter((d) => !withManifest.has(d));
  if (orphan.length) {
    return {ok: false, reason: 'no_manifest', detail: `run director${orphan.length === 1 ? 'y' : 'ies'} without ${MANIFEST}: ${orphan.join(', ')}.`};
  }
  const [, runDate, scope] = DIR_PATTERN.exec(`${dropDirs[0]}/x`);
  return {ok: true, dropDirs, runDate, scope, manifests};
}
