#!/usr/bin/env node
// Guards the counter that decides what gets published.
//
// `signal_count` on a content cluster drives authority_potential, which drives
// promotion in scripts/authority/cluster_to_authority.js, which publishes a
// public whitepaper. Two scripts maintained that field with private running
// totals and no dedupe, so it climbed on every run regardless of new
// information, and every tracked cluster was eventually published on a timer.
// The result was pages like "State of A Simple Meeting Rule That Prevents
// Calendar Cha" - one observation, seen once, counted 18 times, titled from a
// slug cut mid-word - and a release that went red daily on the demand gate.
//
// Deleting those pages was tried more than once and never held, because the
// counter kept climbing and the next cluster crossed the threshold days later.
// This validator guards the counter instead of the output.
//
// Two checks:
//   1. STRUCTURAL - every cluster's numbers reconcile against its own ledger of
//      distinct signal keys. A hand-set signal_count is caught here.
//   2. BEHAVIOURAL - re-running both writers on unchanged inputs changes
//      nothing. This is the property that actually failed; asserting the
//      structure alone would not have caught the original defect, because the
//      inflated counts were internally consistent at every point in time.
//
// The behavioural check restores every file it touches in a finally block.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const MEMORY = 'data/content_clusters/cluster_memory.json';
const TOUCHED = [MEMORY, 'data/query_coverage_map.json', 'data/community/content_routing_log.json'];
const WRITERS = [
  'scripts/authority/update_content_clusters.js',
  'scripts/community/route_scored_signals.js',
];

const errors = [];
const abs = (rel) => path.join(ROOT, rel);
const readText = (rel) => fs.readFileSync(abs(rel), 'utf8');

if (!fs.existsSync(abs(MEMORY))) {
  console.error(`[cluster-signal-integrity] FAIL: ${MEMORY} is missing. It is tracked in git, so absence means a writer destroyed it, not a fresh checkout.`);
  process.exit(1);
}

const memory = JSON.parse(readText(MEMORY));
const clusters = Array.isArray(memory.clusters) ? memory.clusters : [];

// An empty cluster list would make every loop below a no-op and this validator
// would report PASS having proven nothing - the exact shape of guard that let
// the original defect run for weeks.
if (!clusters.length) {
  console.error('[cluster-signal-integrity] FAIL: cluster_memory.json declares zero clusters. Every check here loops over that list, so an empty one means this validator examined nothing while reporting protection.');
  process.exit(1);
}

// --- 1. structural: numbers reconcile against the ledger ---------------------
let examined = 0;
const saturationFor = (n) => (n >= 300 ? 'authority_ready' : n >= 50 ? 'saturated' : n >= 20 ? 'rising' : 'emerging');
for (const c of clusters) {
  examined += 1;
  const id = c.cluster_id || '(unnamed)';
  const keys = Array.isArray(c.signal_keys) ? c.signal_keys : null;
  if (!keys) {
    errors.push(`${id}: no signal_keys ledger, so signal_count ${c.signal_count} cannot be traced to any observation. This is how the count became a free-running number.`);
    continue;
  }
  if (new Set(keys).size !== keys.length) errors.push(`${id}: signal_keys contains duplicate entries, so the count double-counts observations.`);
  if (Number(c.signal_count) !== keys.length) errors.push(`${id}: signal_count ${c.signal_count} != ${keys.length} distinct signal key(s). The count must be derived from the ledger, never incremented.`);
  if (c.saturation !== saturationFor(keys.length)) errors.push(`${id}: saturation "${c.saturation}" does not match ${keys.length} distinct signal(s) (expected "${saturationFor(keys.length)}"). saturation feeds the promotion score.`);
  const expectedPotential = Math.min(100, Math.round(keys.length * 3 + Number(c.max_signal_score || 0) / 2));
  if (Number(c.authority_potential || 0) !== expectedPotential) {
    errors.push(`${id}: authority_potential ${c.authority_potential} != ${expectedPotential} derived from ${keys.length} distinct signal(s). This is the number that promotes a cluster to a published whitepaper.`);
  }
  if (Number(c.signal_count) === 0) errors.push(`${id}: retained with zero distinct observations. A cluster nothing was ever observed for must be pruned, not carried with a stale score.`);
}

// --- 2. behavioural: the writers are idempotent ------------------------------
const before = new Map();
for (const rel of TOUCHED) before.set(rel, fs.existsSync(abs(rel)) ? readText(rel) : null);
let ranWriters = 0;
try {
  for (const w of WRITERS) {
    execFileSync('node', [w], { cwd: ROOT, stdio: 'pipe' });
    ranWriters += 1;
  }
  for (const rel of TOUCHED) {
    const after = fs.existsSync(abs(rel)) ? readText(rel) : null;
    if (after !== before.get(rel)) {
      errors.push(
        `${rel} changed when the signal writers were re-run on unchanged inputs. That is the re-count defect: ` +
        `${WRITERS.join(' and ')} must converge, because anything they add on a no-op run inflates the score that publishes pages.`
      );
    }
  }
} catch (e) {
  errors.push(`re-running the signal writers failed: ${e.message}`);
} finally {
  for (const [rel, text] of before) {
    if (text === null) { if (fs.existsSync(abs(rel))) fs.rmSync(abs(rel)); }
    else fs.writeFileSync(abs(rel), text);
  }
}
if (ranWriters !== WRITERS.length) {
  errors.push(`only ${ranWriters} of ${WRITERS.length} signal writer(s) ran, so idempotence was not proven for all of them.`);
}

if (errors.length) {
  console.error('[cluster-signal-integrity] FAIL:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`[cluster-signal-integrity] PASS: ${examined} cluster(s) reconcile against their distinct-signal ledger, and ${WRITERS.length} signal writer(s) are idempotent on unchanged inputs.`);
