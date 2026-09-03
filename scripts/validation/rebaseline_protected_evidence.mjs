#!/usr/bin/env node
// Regenerate artifacts/validation/pre-implementation-protected-hashes.json.
//
// This exists because the file used to be hand-edited, and a protected baseline
// that is hand-edited is a protected baseline that gets re-pinned by hand the
// moment it becomes inconvenient. It is also why raw evidence for nine of the
// thirteen agent runs was never pinned at all: adding a run meant typing four
// more sha256 lines, so nobody did.
//
// The important property of this tool is what it REFUSES. It is append-only for
// raw evidence: it will add a newly arrived raw artifact or agent declaration,
// and it will NOT rewrite an existing raw pin whose bytes have changed. A raw
// byte change is a defect, and the fix for a defect is never "re-pin it". Run
// with --allow-raw-repin only when a raw change has actually been investigated
// and accepted, and the flag will still be visible in the diff and in the
// baseline's own rebaseline_reason.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  ROOT,
  findAgentManifests,
  safeScope,
  runKey,
  loadExactPolicy,
  policyRenormalizesRun,
  agentDeclaredManifestFields,
  canonicalSha256,
  MANIFEST_ABSORBER_WRITTEN_FIELDS,
  NORMALIZED_ROOT,
} from '../agent_intake/bhpc_agent_common.mjs';
import {rawArtifactRels, normalizedRelFor, DERIVED_REPRODUCIBLE_GUARD, MANIFEST_FILENAME} from './protected_evidence_partition.mjs';

const BASELINE_REL = 'artifacts/validation/pre-implementation-protected-hashes.json';
const allowRawRepin = process.argv.includes('--allow-raw-repin');
const reason = (() => { const i = process.argv.indexOf('--reason'); return i >= 0 ? process.argv[i + 1] : null; })();

const previous = JSON.parse(fs.readFileSync(path.join(ROOT, BASELINE_REL), 'utf8'));
const previousTiers = previous.tiers || {};
const fileSha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');

const policy = loadExactPolicy();
const entries = findAgentManifests();

const rawFiles = {};
const declaredFiles = {};
const frozenDerived = {};
let liveRuns = 0;
for (const entry of entries) {
  const scope = safeScope(entry.scope || entry.manifest?.scope || 'bhpc');
  for (const rel of rawArtifactRels(entry)) rawFiles[rel] = fileSha(rel);
  declaredFiles[entry.manifestRel] = canonicalSha256(agentDeclaredManifestFields(entry.manifest));
  const normalizedRel = `${NORMALIZED_ROOT}/${runKey(entry.runDate, scope)}.json`;
  if (policyRenormalizesRun(entry, policy)) { liveRuns += 1; continue; }
  if (fs.existsSync(path.join(ROOT, normalizedRel))) frozenDerived[normalizedRel] = fileSha(normalizedRel);
}

const refusals = [];
const migrated = [];
// Append-only, stated as one rule: a file that was pinned before must still be
// on disk and must still hash to what it was pinned at. That holds across the
// v2 -> v3 tier split too - a file MOVING tier is fine, a file CHANGING is not -
// so the migration cannot be used as cover for a raw byte change.
for (const tierName of ['immutable_evidence', 'agent_declared_manifest', 'frozen_derived']) {
  for (const [file, priorHash] of Object.entries(previousTiers[tierName]?.files || {})) {
    if (!fs.existsSync(path.join(ROOT, file))) { refusals.push(`${tierName}: ${file} was pinned and is no longer present; a protected file does not disappear`); continue; }
    const nowWhole = fileSha(file);
    const nowDeclared = file.endsWith(MANIFEST_FILENAME) ? declaredFiles[file] : null;
    if (nowWhole === priorHash || nowDeclared === priorHash) continue;
    if (allowRawRepin) { migrated.push(`${tierName}: ${file} re-pinned under --allow-raw-repin`); continue; }
    refusals.push(`${tierName}: ${file} changed (pinned ${priorHash.slice(0, 12)}, now ${nowWhole.slice(0, 12)}); protected evidence is append-only here`);
  }
}
// Nothing that was protected may become unprotected by this regeneration. A
// file may leave a hash tier only into the reproduced-from-raw half, never into
// nothing.
const nowPinned = new Set([...Object.keys(rawFiles), ...Object.keys(declaredFiles), ...Object.keys(frozenDerived)]);
const reproduced = new Set();
for (const entry of entries) {
  if (!policyRenormalizesRun(entry, policy)) continue;
  reproduced.add(entry.manifestRel);
  reproduced.add(normalizedRelFor(entry));
}
for (const tierName of ['immutable_evidence', 'agent_declared_manifest', 'frozen_derived']) {
  for (const file of Object.keys(previousTiers[tierName]?.files || {})) {
    if (nowPinned.has(file) || reproduced.has(file)) continue;
    refusals.push(`${tierName}: ${file} would lose all protection - it is in no hash tier and no live run reproduces it`);
  }
}
if (refusals.length) {
  console.error(`[protected-baseline:rebaseline] REFUSED\n${refusals.map(r => `  - ${r}`).join('\n')}`);
  console.error('Investigate the change. Re-run with --allow-raw-repin --reason "<what was investigated and accepted>" only if the change is legitimate.');
  process.exit(1);
}
if (allowRawRepin && !reason) {
  console.error('[protected-baseline:rebaseline] REFUSED: --allow-raw-repin requires --reason "<what was investigated and accepted>".');
  process.exit(2);
}

const baseline = {
  schema_version: '3.0',
  generated_at: previous.generated_at,
  rebaselined_at: new Date().toISOString().slice(0, 10),
  rebaseline_reason: allowRawRepin ? `raw_repin_accepted: ${reason}` : (reason || 'append_only_regeneration_no_raw_pin_rewritten'),
  baseline_reason: previous.baseline_reason,
  note: previous.note,
  tiers: {
    immutable_evidence: {
      enforcement: 'error',
      kind: 'raw_agent_evidence',
      append_only: true,
      completeness: 'every_agent_run_artifact_on_disk_must_be_pinned_here',
      files: Object.fromEntries(Object.keys(rawFiles).sort().map(k => [k, rawFiles[k]])),
    },
    agent_declared_manifest: {
      enforcement: 'declared_subset_sha256',
      kind: 'raw_agent_declaration',
      append_only: true,
      completeness: 'every_agent_run_manifest_on_disk_must_be_pinned_here',
      absorber_written_fields: MANIFEST_ABSORBER_WRITTEN_FIELDS,
      files: Object.fromEntries(Object.keys(declaredFiles).sort().map(k => [k, declaredFiles[k]])),
    },
    frozen_derived: {
      enforcement: 'error',
      kind: 'derived_output_frozen_by_policy',
      frozen_by: 'data/report_fixes/agent_exact_implementation_policy.json',
      files: Object.fromEntries(Object.keys(frozenDerived).sort().map(k => [k, frozenDerived[k]])),
    },
    derived_reproducible: {
      enforcement: 'reproduced_from_raw',
      kind: 'derived_absorber_output',
      guarded_by: DERIVED_REPRODUCIBLE_GUARD,
      note: 'Deliberately carries no file list and no hashes. The set is derived from the runs on disk and the exact-implementation policy, so it cannot drift from what exists, and it is asserted by re-derivation rather than by a pin that a contract bump would falsify.',
    },
    revenue_surface: previousTiers.revenue_surface,
    tooling: previousTiers.tooling,
  },
};

fs.writeFileSync(path.join(ROOT, BASELINE_REL), `${JSON.stringify(baseline, null, 2)}\n`);
for (const line of migrated) console.warn(`[protected-baseline:rebaseline] ${line}`);
console.log(`[protected-baseline:rebaseline] PASS: raw=${Object.keys(rawFiles).length} declared=${Object.keys(declaredFiles).length} frozen_derived=${Object.keys(frozenDerived).length} live_runs_left_to_reproduction=${liveRuns}`);
