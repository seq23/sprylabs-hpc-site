'use strict';
/**
 * THE BUILD CLOCK: the one time every `npm run build:all` generator stamps into
 * a committed file (generated_at, timestamp, ingested_at, created_at, a dated id).
 *
 * WHY. Those generators used `new Date().toISOString()`, the wall clock, so two
 * fresh clones of the same commit built a minute apart wrote different bytes into
 * ~50 tracked files (data/intake, data/backlog, data/answer_surface, reports/,
 * artifacts/validation, the agent acceptance manifests), and a build on another
 * day could also change dated ids. A build's output must be a function of its
 * inputs, and the commit IS the input.
 *
 * WHAT. The SOURCE_DATE_EPOCH convention (reproducible-builds.org): that variable
 * when set (whole seconds since the epoch), otherwise the HEAD commit's committer
 * time. Same commit, same clock, same bytes. A tree with no git history and no
 * SOURCE_DATE_EPOCH throws a named error rather than quietly falling back to the
 * wall clock, which is the nondeterminism this exists to remove.
 *
 * Guarded by validate:clean-rebuild-parity, which builds two fresh clones of
 * HEAD and fails on any tracked file that differs between them.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
let cached = null;

function buildDate() {
  if (cached) return new Date(cached.getTime());
  const fromEnv = process.env.SOURCE_DATE_EPOCH;
  if (fromEnv !== undefined && fromEnv !== '') {
    if (!/^\d+$/.test(fromEnv)) throw new Error(`[build-clock] SOURCE_DATE_EPOCH must be whole seconds since the epoch, got "${fromEnv}"`);
    cached = new Date(Number(fromEnv) * 1000);
    return new Date(cached.getTime());
  }
  let out = '';
  try {
    out = execFileSync('git', ['log', '-1', '--format=%ct', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { out = ''; }
  if (!/^\d+$/.test(out)) {
    throw new Error('[build-clock] STOP no_build_clock: no SOURCE_DATE_EPOCH and no git HEAD commit to date this build from. Set SOURCE_DATE_EPOCH (e.g. `git log -1 --format=%ct`) rather than stamping the wall clock.');
  }
  cached = new Date(Number(out) * 1000);
  return new Date(cached.getTime());
}

/** ISO-8601 build time, the drop-in for `new Date().toISOString()` in a generator. */
function buildTimestamp() {
  return buildDate().toISOString();
}

module.exports = { buildDate, buildTimestamp };
