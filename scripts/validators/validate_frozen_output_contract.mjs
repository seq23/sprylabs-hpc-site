#!/usr/bin/env node
// A frozen blob must satisfy the page contracts the repo enforces, so that
// authority:scale:restore can never reintroduce a validator failure.
//
// The defect (Spry Content Release red on 2026-08-31, run 33348302051):
//
//   [validate:citation-schema-serialization] FAIL: 20 of 2253 page(s) do not
//     match the one serialization - CITATION_PAGE_SCHEMA written as Python's
//     default spaced separators
//   [validate:lastmod-ledger-final] FAIL: 1975 of 2228 committed page(s) do not
//     match the ledger committed alongside them
//   self-heal: nothing repairable - these need a decision, not another attempt
//
// Neither finding was about the committed tree; a clean checkout of main passes
// both. The stale bytes were written by authority:scale:restore, which gunzips
// data/release/frozen_accepted_outputs/*.html.gz over any page whose hash has
// drifted. Measured on main at dab147a98, 2131 of 2218 blobs differed from the
// page they froze, and those blobs predate BOTH e700a92fc (one serialization
// for CITATION_PAGE_SCHEMA) and the change that made mainEntityOfPage an
// {"@id"} object rather than a string. Restoring them reintroduced both.
//
// WHAT THIS ASSERTS, AND WHAT IT DELIBERATELY DOES NOT.
//
// The first version of this guard asserted byte parity between each blob and
// the page it freezes. That is the wrong invariant and CI proved it: a full
// validate:all runs build:all first, which legitimately rewrites the tree, and
// the guard then failed on 2222 records that were not defective at all. A store
// being byte-behind a freshly built tree is normal - freeze() runs at the END of
// a lane, so the store is always a snapshot of some earlier accepted output.
//
// What must be true is narrower and holds in every context, because it inspects
// only the blobs: whatever restore() writes must already satisfy the page-shape
// contracts. Those two rules are read from the same
// scripts/lib/citation_page_schema.cjs that validate_citation_schema_serialization.mjs
// measures pages against, so the guard and the check it protects cannot drift
// into two different definitions of the same thing.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const requireCjs = createRequire(import.meta.url);
const ROOT = process.cwd();
const REG = 'data/release/frozen_output_registry.json';
const { SCHEMA_SCRIPT_RE, SERIALIZATION_EXEMPT, serializeSchema, mainEntityOfPageId } =
  requireCjs(path.join(ROOT, 'scripts/lib/citation_page_schema.cjs'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const fail = (msg, extra = []) => {
  console.error(`[frozen-output-contract] FAIL: ${msg}`);
  for (const line of extra) console.error(`  ${line}`);
  process.exit(1);
};

const regPath = path.join(ROOT, REG);
if (!fs.existsSync(regPath)) fail(`${REG} is missing; the store this guard governs does not exist.`);
const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
const records = Object.entries(reg.records || {});

// Rule 0, first empty loop: an empty registry proves nothing about restore().
if (records.length === 0) fail(`${REG} holds no records, so this guard cannot reach what it governs.`);

const problems = [];
let carrying = 0;
let clean = 0;
let missingBlob = 0;
let hashLies = 0;

for (const [route, rec] of records) {
  const blobRel = rec.blob || '';
  const blobAbs = path.join(ROOT, blobRel);
  if (!blobRel || !fs.existsSync(blobAbs)) {
    // restore() exits 1 on the first of these, killing the lane with no earlier signal.
    missingBlob += 1;
    problems.push(`${route}: no frozen blob at ${blobRel || '(none)'}; restore() would exit 1 on it.`);
    continue;
  }
  const raw = zlib.gunzipSync(fs.readFileSync(blobAbs));
  if (sha(raw) !== rec.sha256) {
    hashLies += 1;
    problems.push(`${rec.path}: registry records sha256 ${rec.sha256} but ${blobRel} hashes differently; restore() compares pages against a hash its own blob does not have.`);
    continue;
  }
  const html = raw.toString('utf8');
  // SCHEMA_SCRIPT_RE is shared and global; exec state must not leak between blobs.
  const m = new RegExp(SCHEMA_SCRIPT_RE.source, SCHEMA_SCRIPT_RE.flags.replace('g', '')).exec(html);
  if (!m) continue;
  if (SERIALIZATION_EXEMPT.has(rec.path)) continue;
  carrying += 1;
  const body = m[2];
  let data;
  try {
    data = JSON.parse(body);
  } catch (err) {
    problems.push(`${rec.path}: frozen CITATION_PAGE_SCHEMA is not parseable JSON (${err.message}).`);
    continue;
  }
  if (serializeSchema(data) !== body) {
    problems.push(`${rec.path}: the frozen blob carries a CITATION_PAGE_SCHEMA serialization serializeSchema() would not produce. authority:scale:restore would write it over a correct page and fail validate:citation-schema-serialization.`);
    continue;
  }
  const graph = Array.isArray(data['@graph']) ? data['@graph'] : [data];
  const primary = graph.find((n) => n && ['Article', 'BlogPosting', 'WebPage', 'CollectionPage'].includes(n['@type']));
  if (primary && Object.prototype.hasOwnProperty.call(primary, 'mainEntityOfPage')) {
    const value = primary.mainEntityOfPage;
    const shape = typeof value === 'string' ? 'string'
      : (value && typeof value === 'object') ? `object{${Object.keys(value).sort().join(',')}}`
      : String(typeof value);
    if (shape !== 'object{@id}') {
      problems.push(`${rec.path}: the frozen blob writes mainEntityOfPage as ${shape}, pointing at ${mainEntityOfPageId(value) || 'nothing'}; the one permitted shape is {"@id": canonical}. Restoring it would fail validate:citation-schema-serialization.`);
      continue;
    }
  }
  clean += 1;
}

// Rule 0, second empty loop: records exist but none carries a schema block, so
// a contract check over them would report success having measured nothing.
if (carrying === 0) {
  fail(
    `${records.length} frozen record(s) inspected but NONE carries a CITATION_PAGE_SCHEMA block. ` +
      'The blob store no longer holds the pages this governs, so the guard is inert.',
  );
}

if (problems.length) {
  fail(
    `${problems.length} frozen blob(s) would fail the page contracts if restored ` +
      `(${missingBlob} missing, ${hashLies} hash mismatch). Re-freeze with ` +
      'prepare-drift-scope -> freeze -> clear-scope and commit the store.',
    problems.slice(0, 15).concat(problems.length > 15 ? [`... and ${problems.length - 15} more`] : []),
  );
}

console.log(
  `[frozen-output-contract] PASS: ${clean} of ${carrying} frozen blob(s) carrying CITATION_PAGE_SCHEMA satisfy ` +
    `the serialization and mainEntityOfPage contracts; ${records.length} record(s) in the store. ` +
    'authority:scale:restore cannot reintroduce a validator failure.',
);
