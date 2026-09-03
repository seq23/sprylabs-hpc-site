#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {resolveRuntimePath} from '../lib/runtime_path.mjs';
import {
  ROOT,
  findAgentManifests,
  loadExactPolicy,
  policyRenormalizesRun,
  agentDeclaredManifestFields,
  canonicalSha256,
} from '../agent_intake/bhpc_agent_common.mjs';
import {rawArtifactRels, normalizedRelFor, DERIVED_REPRODUCIBLE_GUARD} from '../validation/protected_evidence_partition.mjs';

const own = JSON.parse(fs.readFileSync('data/content_ownership_registry.json', 'utf8'));
const pre = JSON.parse(fs.readFileSync('artifacts/validation/pre-implementation-protected-hashes.json', 'utf8'));
const errors = [];
const strong_warnings = [];
const seen = new Set();

// `own.routes || []` means an emptied or restructured registry runs the
// duplicate-owner and paid-route-protection loop zero times and this validator
// then falls off the end at exit 0 having asserted nothing about ownership.
if (!(own.routes || []).length) errors.push('data/content_ownership_registry.json lists no routes; expected at least one owned route. An ownership boundary check over zero routes proves nothing.');

for (const route of own.routes || []) {
  if (seen.has(route.source_file)) errors.push(`duplicate owner: ${route.source_file}`);
  seen.add(route.source_file);
  if (route.owner === 'paid_agent' && !route.protected) errors.push(`paid route not protected: ${route.source_file}`);
}

// Tiered, because one flat byte-pinned list protected nothing. Twelve of the
// thirty entries were tooling that is maintained and expected to change, so this
// warned constantly - and a constant warning is an unread one. A retrofit
// injected content into twelve raw agent-run reports and the drift it produced
// was indistinguishable from that background noise.
//
// Evidence and the revenue surface are errors now, not warnings: an agent-run
// input that changes invalidates every conclusion drawn from it, and
// download.html produced real sales. Tooling is checked for existence and
// non-emptiness, which is the failure that actually matters there.
//
// The tiers then had the same defect one level down: RAW agent evidence and
// DERIVED absorber output shared immutable_evidence, and those have opposite
// lifecycles. Raw evidence is a record of fact and must never change. Derived
// output is a function of raw evidence plus the current normalization contract
// and is SUPPOSED to change when the contract changes - so every legitimate
// contract bump fired PROTECTED_BASELINE_DRIFT on files that were behaving
// correctly, and the only available response was to re-pin. A guard that fires
// on legitimate work trains its reader to re-pin reflexively, and the day it
// catches real tampering that reflex fires too.
//
// So the halves are separated by LIFECYCLE, and the derived half is not
// hash-pinned at all - it is asserted reproducible from raw by
// validate:derived-absorber-reproducibility, which never false-fires on a
// contract change and additionally catches a stale or hand-edited derivative
// that a re-pinned hash would wave through. What is left here is the half a
// hash pin is actually TRUE of.
const tiers = pre.tiers || { immutable_evidence: { enforcement: 'error', files: pre.files || {} } };
// With no tiers - or with the `pre.files || {}` fallback taken on a baseline that
// has neither key - Object.entries() is empty, no file is opened and no hash is
// compared, and the run reaches exit 0 protecting nothing.
if (!Object.keys(tiers).length) errors.push('artifacts/validation/pre-implementation-protected-hashes.json declares no tiers and no files; expected the protected-baseline tiers. Comparing zero protected files proves nothing.');
let filesChecked = 0;
for (const [tierName, tier] of Object.entries(tiers)) {
  const enforcement = tier.enforcement || 'error';

  // The derived half declares no files and no hashes on purpose. What has to be
  // true of it is that something still asserts it - a split that leaves one side
  // examining nothing is the same defect in a new place, just harder to see.
  if (enforcement === 'reproduced_from_raw') {
    if (tier.files) errors.push(`protected tier ${tierName} declares a file list; the reproduced-from-raw tier derives its set from the runs on disk and must not carry one, or the two lists drift.`);
    if (tier.guarded_by !== DERIVED_REPRODUCIBLE_GUARD) errors.push(`protected tier ${tierName} names guard ${JSON.stringify(tier.guarded_by)}; expected ${JSON.stringify(DERIVED_REPRODUCIBLE_GUARD)}. An unguarded derived tier is derived output with no protection at all.`);
    continue;
  }

  if (enforcement === 'exists_non_empty') {
    // Each tier carries its own file collection and each can empty on its own,
    // so an emptied tier is reported rather than iterated zero times in silence.
    const tierFiles = tier.files || [];
    if (!tierFiles.length) errors.push(`protected tier ${tierName} lists no files; expected at least one file to exist-check. An empty tier proves nothing.`);
    for (const file of tierFiles) {
      filesChecked += 1;
      const resolvedFile = resolveRuntimePath(file);
      if (!fs.existsSync(resolvedFile)) { errors.push(`protected file missing: ${file}`); continue; }
      if (fs.statSync(resolvedFile).size === 0) errors.push(`protected file emptied: ${file}`);
    }
    continue;
  }

  // The manifest is the one file that is half raw and half derived: the agent
  // declares source/run_date/csv_path/html_path and the absorber writes the rest
  // back over the top of it. Splitting by FILE would give one of those halves
  // the wrong lifecycle whichever way it went, so this tier pins the agent's own
  // declaration by canonical hash and leaves the absorber's overlay to
  // re-derivation. Neither half is unprotected.
  const isDeclaredSubset = enforcement === 'declared_subset_sha256';
  const tierEntries = Object.entries(tier.files || {});
  if (!tierEntries.length) errors.push(`protected tier ${tierName} lists no files; expected at least one sha256-pinned file. Comparing zero hashes proves nothing.`);
  for (const [file, expectedHash] of tierEntries) {
    filesChecked += 1;
    const resolvedFile = resolveRuntimePath(file);
    if (!fs.existsSync(resolvedFile)) { errors.push(`protected file missing: ${file}`); continue; }
    let actualHash;
    if (isDeclaredSubset) {
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(resolvedFile, 'utf8')); }
      catch { errors.push(`protected file unparseable: ${file}`); continue; }
      actualHash = canonicalSha256(agentDeclaredManifestFields(parsed));
    } else {
      actualHash = crypto.createHash('sha256').update(fs.readFileSync(resolvedFile)).digest('hex');
    }
    if (actualHash === expectedHash) continue;
    const finding = { code: 'PROTECTED_BASELINE_DRIFT', tier: tierName, file, expected_sha256: expectedHash, actual_sha256: actualHash, message: `protected file changed: ${file}` };
    if (enforcement === 'error' || isDeclaredSubset) errors.push(`PROTECTED_BASELINE_DRIFT (${tierName}): ${file}`);
    else strong_warnings.push(finding);
  }
}

// Completeness, which is the half of this that a pinned list can never give you
// on its own: a hash list only protects what somebody remembered to add. Nine of
// the thirteen agent runs on this tree had NO raw artifact pinned at all, and
// nothing said so, because a guard over four runs and a guard over thirteen
// report identically. These loops walk the tree instead of the list.
const policy = loadExactPolicy();
const runEntries = findAgentManifests();
const rawTier = tiers.immutable_evidence?.files || {};
const declaredTier = tiers.agent_declared_manifest?.files || {};
const frozenTier = tiers.frozen_derived?.files || {};
let rawArtifactsSeen = 0;
let liveRuns = 0;
if (!runEntries.length) errors.push('found no agent run folders under data/report_fixes/agent_runs; expected at least one. Checking the completeness of protection over zero runs proves nothing.');
for (const entry of runEntries) {
  for (const rel of rawArtifactRels(entry)) {
    rawArtifactsSeen += 1;
    if (!(rel in rawTier)) errors.push(`UNPROTECTED_RAW_EVIDENCE: ${rel} is raw agent evidence on disk and is not pinned in immutable_evidence. Raw evidence that nothing pins can be rewritten with no trace.`);
  }
  if (!(entry.manifestRel in declaredTier)) errors.push(`UNPROTECTED_AGENT_DECLARATION: ${entry.manifestRel} is not pinned in agent_declared_manifest. The fields the agent declared would be unprotected.`);

  const normalizedRel = normalizedRelFor(entry);
  const live = policyRenormalizesRun(entry, policy);
  if (live) {
    liveRuns += 1;
    // A live run must not also sit in the frozen hash tier, or the frozen tier
    // becomes the way to opt derived output out of re-derivation - which is the
    // original defect wearing a new tier name.
    if (normalizedRel in frozenTier) errors.push(`FROZEN_TIER_MISUSED: ${normalizedRel} belongs to a run the absorber still regenerates under the current policy, so pinning it by hash asserts something untrue of it. Frozen is for runs the policy will never re-normalize.`);
  } else if (fs.existsSync(path.join(ROOT, normalizedRel)) && !(normalizedRel in frozenTier)) {
    errors.push(`UNPROTECTED_FROZEN_DERIVED: ${normalizedRel} belongs to a pre-cutover run that is never re-normalized, so nothing reproduces it and nothing pins it.`);
  }
}
if (!rawArtifactsSeen) errors.push('found 0 raw agent artifacts on disk; expected at least one. A completeness check over an empty tree proves nothing.');
if (!liveRuns) errors.push('found 0 live agent runs under the current exact-implementation policy, so validate:derived-absorber-reproducibility has nothing to reproduce and the derived half of this split protects nothing.');

// The overall floor: whatever the tier shapes are, a run that opened no protected
// file at all compared nothing and must not report PASS.
if (!filesChecked) errors.push('examined 0 protected files across every tier in artifacts/validation/pre-implementation-protected-hashes.json; expected at least one protected file. A baseline guard that compares no file proves nothing.');

const status = errors.length ? 'FAIL' : strong_warnings.length ? 'PASS_WITH_STRONG_WARNING' : 'PASS';
const report = {
  status,
  errors,
  strong_warnings,
  owners: own.summary,
  protected_files_checked: filesChecked,
  raw_artifacts_on_disk: rawArtifactsSeen,
  agent_runs_on_disk: runEntries.length,
  live_runs_left_to_reproduction: liveRuns,
  derived_reproducible_guard: DERIVED_REPRODUCIBLE_GUARD,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
