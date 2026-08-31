#!/usr/bin/env node
/**
 * The registry and the matrix must agree about which validators exist.
 *
 * scripts/validation/add_validator.mjs used to allocate matrix ids as
 * max(existing numeric id) + 1, computed against whatever tip the branch could
 * see. A local maximum cannot be made concurrency-safe: two branches opened from
 * the same base allocate the SAME id for two DIFFERENT validators, and nothing
 * notices until the merge. It happened three times in one night - MX-191 claimed
 * by both VAL-FROZEN-OUTPUT-CONTRACT and VAL-MAIN-WRITER-VALIDATION-GATE, MX-193
 * by both VAL-BUILD-ALL-INTEGRITY and the renumbered gate, and five at once when
 * this branch merged.
 *
 * The collision is not the dangerous part. The resolution is. Taking one side of
 * the conflict wholesale drops a validator's matrix entry, and the registry still
 * validates clean afterwards - the record is there, the profiles are there, and
 * the guard has simply stopped being wired to anything. A check silently stops
 * running and the control plane reports full health. That is the same defect
 * class as a validator passing on an empty set, one level up.
 *
 * Every collision so far was caught only because whoever resolved the merge
 * thought to look. This is what looks, every run.
 *
 * Overlap with validate_validation_registry.mjs, measured rather than assumed.
 * That validator ALREADY reports a duplicate matrix_id, so rule 1 below is not
 * new coverage and is kept only because the message names both claimants. What it
 * does not catch was tested one case at a time, and it is the dangerous half:
 *
 *   ADMITTED record left with no matrix entry   existing: PASS   this: FAIL
 *   profile step naming a VAL- id nothing defines  existing: PASS   this: FAIL
 *   entry_count that disagrees with the entries    existing: PASS   this: FAIL
 *
 * The first of those is the exact outcome of resolving an id collision by taking
 * one side: the validator is dropped, and the control plane still reports clean.
 * The second found a real defect on main - container-prepush and changed both ran
 * a step identified as VAL-VALIDATION-CACHE-CONTROL-PLANE, which no record and no
 * entry defined; the command was right, so it ran, but nothing could tie it back
 * to its registry record.
 */

import fs from 'node:fs';

const REGISTRY = '_validation_registry.json';
const MATRIX = '_repo_validation_matrix.json';

function readJson(path) {
  if (!fs.existsSync(path)) {
    console.error(`[validate:control-plane-identity] FAIL: ${path} is missing. It is one of the two files that define what validation this repo performs.`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`[validate:control-plane-identity] FAIL: ${path} is not parseable JSON (${error.message}).`);
    process.exit(1);
  }
}

const registry = readJson(REGISTRY);
const matrix = readJson(MATRIX);
const records = registry.records || [];
const entries = matrix.entries || [];

// Rule 0. Both collections are the examination set; either being empty means this
// check compares nothing while reporting that the control plane is consistent.
if (!records.length || !entries.length) {
  console.error(`[validate:control-plane-identity] FAIL: expected records in ${REGISTRY} and entries in ${MATRIX}; found ${records.length} and ${entries.length}. Comparing an empty control plane proves nothing about it.`);
  process.exit(1);
}

const errors = [];

// 1. No two validators may claim the same matrix id.
const byMatrixId = new Map();
for (const entry of entries) {
  const seen = byMatrixId.get(entry.matrix_id);
  if (seen && seen !== entry.validation_id) {
    errors.push(`matrix id ${entry.matrix_id} is claimed by two validators: ${seen} and ${entry.validation_id}. Resolving that by keeping one side drops the other's wiring while the registry still validates clean.`);
  } else if (seen) {
    errors.push(`matrix id ${entry.matrix_id} appears twice for ${entry.validation_id}.`);
  }
  byMatrixId.set(entry.matrix_id, entry.validation_id);
}

// 2. Duplicate validation ids in the registry.
const recordIds = new Set();
for (const record of records) {
  if (recordIds.has(record.validation_id)) errors.push(`${REGISTRY} contains two records for ${record.validation_id}.`);
  recordIds.add(record.validation_id);
}

// 3. A registry record must not point at a matrix entry that does not exist.
for (const record of records) {
  for (const mid of record.matrix_ids || []) {
    if (!byMatrixId.has(mid)) {
      errors.push(`${record.validation_id} names matrix id ${mid}, which no entry in ${MATRIX} provides. The record looks admitted while its wiring is gone.`);
    } else if (byMatrixId.get(mid) !== record.validation_id) {
      errors.push(`${record.validation_id} names matrix id ${mid}, but that entry belongs to ${byMatrixId.get(mid)}. This is the signature of a merge that resolved an id collision by keeping one side.`);
    }
  }
}

// 4. A matrix entry must belong to a validator the registry knows.
for (const entry of entries) {
  if (!recordIds.has(entry.validation_id)) {
    errors.push(`matrix entry ${entry.matrix_id} runs ${entry.validation_id}, which has no record in ${REGISTRY}.`);
  }
}

// 5. Every ADMITTED record must have at least one matrix entry, or it is
//    admitted protection that is wired to nothing.
const entryOwners = new Set(entries.map((e) => e.validation_id));
for (const record of records) {
  if (record.status !== 'ADMITTED') continue;
  if (!entryOwners.has(record.validation_id)) {
    errors.push(`${record.validation_id} is ADMITTED but has no entry in ${MATRIX}, so it is recorded as active protection while nothing runs it.`);
  }
}

// 6. A profile step identified by a VAL- id must name a validator that exists.
//    Steps are also legitimately identified by their npm script name (build:all,
//    validate:repo, agent:bhpc:trace and about eighty others), which is the older
//    convention in this file - checking those against the registry reported
//    eighty false failures on a healthy control plane, so this looks only at ids
//    that claim to be validation ids.
for (const [profileName, profile] of Object.entries(matrix.profiles || {})) {
  for (const step of profile.steps || []) {
    if (!step.id || !/^VAL-/.test(step.id)) continue;
    if (!recordIds.has(step.id) && !entryOwners.has(step.id)) {
      errors.push(`profile ${profileName} runs step ${step.id}, which no registry record or matrix entry defines.`);
    }
  }
}

// 7. The declared counts must match reality, or the file lies about its own size.
if (typeof registry.record_count === 'number' && registry.record_count !== records.length) {
  errors.push(`${REGISTRY} declares record_count ${registry.record_count} but holds ${records.length} records.`);
}
if (typeof matrix.entry_count === 'number' && matrix.entry_count !== entries.length) {
  errors.push(`${MATRIX} declares entry_count ${matrix.entry_count} but holds ${entries.length} entries.`);
}

fs.mkdirSync('artifacts/validation', { recursive: true });
fs.writeFileSync('artifacts/validation/control-plane-identity.json', `${JSON.stringify({
  status: errors.length ? 'FAIL' : 'PASS',
  records: records.length,
  entries: entries.length,
  profiles: Object.keys(matrix.profiles || {}).length,
  errors,
}, null, 2)}\n`);

if (errors.length) {
  console.error('[validate:control-plane-identity] FAIL: the registry and the matrix disagree about what exists');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(`[validate:control-plane-identity] PASS: ${records.length} registry record(s) and ${entries.length} matrix entr(ies) agree; no duplicate matrix ids, no record wired to a missing entry, no entry without a record.`);
