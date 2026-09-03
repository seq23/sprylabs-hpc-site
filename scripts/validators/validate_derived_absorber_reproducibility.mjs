#!/usr/bin/env node
// Derived absorber output is not pinned by hash. It is asserted REPRODUCIBLE.
//
// A hash pin says "these bytes must not change". That is true of raw agent
// evidence and false of derived output, which is a function of raw evidence
// plus the current normalization contract and is SUPPOSED to change when the
// contract changes. Pinning both in one tier meant every legitimate contract
// bump fired the guard, and the only available response was to re-pin - which
// trains the reader to re-pin reflexively, so the day the guard catches real
// tampering that reflex fires too.
//
// Re-derivation never false-fires on a contract change, and it catches
// something the hash pin cannot: a derived file that no longer matches the raw
// evidence it claims to come from. A hand-edited or stale derivative passes a
// hash pin the moment somebody re-pins it. It fails this every time.
//
// The re-derivation runs through the absorber's OWN builders
// (buildNormalizedRecord / buildAbsorbedManifest in bhpc_agent_common.mjs), so
// this validator cannot be asserting a shape the producer stopped producing.
// Nothing is written: digestManifest and the builders are read-only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ROOT,
  findAgentManifests,
  digestManifest,
  readJson,
  writeJson,
  safeScope,
  sourceKey,
  loadExactPolicy,
  policyRenormalizesRun,
  buildNormalizedRecord,
  buildAbsorbedManifest,
  withoutFields,
  canonicalJson,
  SOCIAL_RUNS_ROOT,
  NORMALIZED_VOLATILE_FIELDS,
  MANIFEST_VOLATILE_FIELDS,
} from '../agent_intake/bhpc_agent_common.mjs';
import {normalizedRelFor} from '../validation/protected_evidence_partition.mjs';

const errors = [];
const checked = [];
const policy = loadExactPolicy();
const entries = findAgentManifests();

if (!entries.length) errors.push('found no agent run folders under data/report_fixes/agent_runs; expected at least one. Reproducing zero derived records proves nothing.');

function firstDivergence(expected, actual, trail = '') {
  if (canonicalJson(expected) === canonicalJson(actual)) return null;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${trail || '<root>'}: length ${actual.length} on disk, ${expected.length} re-derived`;
    for (let i = 0; i < expected.length; i += 1) {
      const inner = firstDivergence(expected[i], actual[i], `${trail}[${i}]`);
      if (inner) return inner;
    }
    return trail || '<root>';
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    for (const key of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
      const inner = firstDivergence(expected[key], actual[key], trail ? `${trail}.${key}` : key);
      if (inner) return inner;
    }
    return trail || '<root>';
  }
  return `${trail || '<root>'}: on disk ${JSON.stringify(actual)?.slice(0, 160)} / re-derived ${JSON.stringify(expected)?.slice(0, 160)}`;
}

for (const entry of entries) {
  const scope = safeScope(entry.scope || entry.manifest?.scope || 'bhpc');
  // Runs before the exact-implementation cutover are deliberately never
  // re-normalized, so their derived output is genuinely frozen and is hash
  // pinned by validate:ownership instead. The partition is read from the
  // policy, not hand-listed, so a live run cannot be opted out of here.
  if (!policyRenormalizesRun(entry, policy)) continue;

  const normalizedRel = normalizedRelFor(entry);
  const onDisk = readJson(normalizedRel, null);
  if (!onDisk) { errors.push(`derived output missing: ${normalizedRel} (run ${entry.runDate}/${scope} is live under the current policy and must have a normalized record)`); continue; }

  const digest = digestManifest({...entry, scope});
  const rederived = buildNormalizedRecord({entry, digest, scope, generatedAt: null});

  const divergence = firstDivergence(
    withoutFields(rederived, NORMALIZED_VOLATILE_FIELDS),
    withoutFields(onDisk, NORMALIZED_VOLATILE_FIELDS),
  );
  if (divergence) errors.push(`DERIVED_NOT_REPRODUCIBLE: ${normalizedRel} does not re-derive from its raw evidence under the current contract; first divergence at ${divergence}`);

  // The derived record records the sha256 of every raw artifact it was built
  // from. Re-checking it here is what makes "derived output that no longer
  // matches its raw source" a failure rather than a silent stale file.
  for (const [field, relField] of [['csv_sha256', 'csv_path'], ['html_sha256', 'html_path'], ['json_sha256', 'json_path']]) {
    const rel = onDisk[relField];
    if (!rel) continue;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { errors.push(`DERIVED_RAW_SOURCE_MISSING: ${normalizedRel} names ${rel} as its raw source and that file is not present`); continue; }
    const actual = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    if (onDisk[field] && onDisk[field] !== actual) errors.push(`DERIVED_RAW_SOURCE_DRIFT: ${normalizedRel} records ${field}=${String(onDisk[field]).slice(0, 12)} for ${rel}, which now hashes to ${actual.slice(0, 12)}`);
  }

  // The absorber's overlay on the half-raw manifest is derived too, so it is
  // re-derived rather than pinned. absorbed_record_count in particular is a
  // real cross-check: it must equal the number of records the raw evidence
  // actually yields.
  const socialRel = `${SOCIAL_RUNS_ROOT}/${sourceKey(entry.runDate, scope)}.json`;
  const rederivedManifest = buildAbsorbedManifest({entry, digest, scope, normalizedRel, socialRel, absorbedAt: null});
  const manifestDivergence = firstDivergence(
    withoutFields(rederivedManifest, MANIFEST_VOLATILE_FIELDS),
    withoutFields(entry.manifest, MANIFEST_VOLATILE_FIELDS),
  );
  if (manifestDivergence) errors.push(`MANIFEST_OVERLAY_NOT_REPRODUCIBLE: ${entry.manifestRel} absorber-written fields do not re-derive; first divergence at ${manifestDivergence}`);

  checked.push({run_date: entry.runDate, scope, normalized_path: normalizedRel, manifest_path: entry.manifestRel, records: digest.rows.length});
}

// Rule 0. Splitting the protected baseline into a hash-pinned half and a
// re-derived half is only an improvement if BOTH halves examine something. A
// policy edit that made every run frozen, or an emptied agent_runs tree, would
// leave this validator looping over nothing and exiting 0 while the control
// plane still reported it as active protection.
if (!checked.length) errors.push('reproduced 0 derived records; expected at least one live agent run under data/report_fixes/agent_exact_implementation_policy.json. A reproducibility guard that re-derives nothing proves nothing.');

const status = errors.length ? 'FAIL' : 'PASS';
const report = {
  status,
  errors,
  normalization_contract: readJson('data/report_fixes/agent_exact_implementation_policy.json', {}).effective_from || null,
  live_runs_reproduced: checked.length,
  frozen_runs_skipped: entries.length - checked.length,
  checked,
};
writeJson('artifacts/validation/derived-absorber-reproducibility.json', report);
console.log(JSON.stringify({status, errors, live_runs_reproduced: checked.length, frozen_runs_skipped: entries.length - checked.length}, null, 2));
if (errors.length) process.exit(1);
