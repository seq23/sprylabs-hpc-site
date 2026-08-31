#!/usr/bin/env node
// Build-completion sentinel for `npm run build:all`.
//
// Why this exists: on 2026-08-30 `build:all` died partway through
// build:postprocess and nobody found out for hours. It surfaced only because a
// human ran it by hand. Every downstream lane read the half-built tree as if it
// were a finished one, and no validator in the repo could tell "build:all
// finished" apart from "build:all was never run here".
//
// The sentinel is written twice per build. `start` stamps IN_PROGRESS before the
// first stage runs; `complete` stamps COMPLETE after the last one. A build that
// dies partway leaves IN_PROGRESS on disk, which
// scripts/validators/validate_build_all_integrity.mjs hard-fails on, naming the
// stage list that never finished. Absence of the file means the build was never
// run in this tree - a different, honestly-reported state, never a silent pass.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
export const SENTINEL_REL = 'artifacts/build/build_all_state.json';
const SENTINEL = path.join(ROOT, SENTINEL_REL);

// The stage list is read from package.json rather than duplicated here, so a
// stage added to build:all cannot drift out of the guard.
export function buildAllStages() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const script = pkg.scripts?.['build:all'];
  if (!script) throw new Error('package.json has no build:all script');
  return script
    .split('&&')
    .map((s) => s.trim())
    .filter(Boolean)
    // The sentinel's own bookend stages are not build work and must not appear
    // in the recorded stage list, or the guard would be asserting itself.
    .filter((s) => !s.includes('record_build_all_state.mjs'));
}

function head() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function write(payload) {
  fs.mkdirSync(path.dirname(SENTINEL), { recursive: true });
  fs.writeFileSync(SENTINEL, JSON.stringify(payload, null, 2) + '\n');
}

function main() {
  const mode = process.argv[2];
  if (mode !== 'start' && mode !== 'complete') {
    console.error('usage: record_build_all_state.mjs <start|complete>');
    process.exit(2);
  }
  const stages = buildAllStages();
  if (!stages.length) {
    console.error('[build:state] REFUSED: build:all resolved to zero stages; the sentinel would assert nothing.');
    process.exit(1);
  }
  if (mode === 'start') {
    write({
      status: 'IN_PROGRESS',
      started_at: new Date().toISOString(),
      completed_at: null,
      head: head(),
      stages,
      stage_count: stages.length,
    });
    console.log(`[build:state] IN_PROGRESS (${stages.length} stages)`);
    return;
  }
  let prior = null;
  try {
    prior = JSON.parse(fs.readFileSync(SENTINEL, 'utf8'));
  } catch {
    // A `complete` with no `start` behind it means build:all was not entered
    // through its own front door. Recording COMPLETE anyway would forge the
    // evidence the validator relies on.
    console.error('[build:state] REFUSED: no IN_PROGRESS sentinel to complete; build:all was not started through this recorder.');
    process.exit(1);
  }
  write({
    status: 'COMPLETE',
    started_at: prior.started_at ?? null,
    completed_at: new Date().toISOString(),
    head: head(),
    stages,
    stage_count: stages.length,
  });
  console.log(`[build:state] COMPLETE (${stages.length} stages)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
