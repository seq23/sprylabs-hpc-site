#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {resolveRuntimePath} from '../lib/runtime_path.mjs';

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
const tiers = pre.tiers || { immutable_evidence: { enforcement: 'error', files: pre.files || {} } };
// With no tiers - or with the `pre.files || {}` fallback taken on a baseline that
// has neither key - Object.entries() is empty, no file is opened and no hash is
// compared, and the run reaches exit 0 protecting nothing.
if (!Object.keys(tiers).length) errors.push('artifacts/validation/pre-implementation-protected-hashes.json declares no tiers and no files; expected the protected-baseline tiers. Comparing zero protected files proves nothing.');
let filesChecked = 0;
for (const [tierName, tier] of Object.entries(tiers)) {
  const enforcement = tier.enforcement || 'error';
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
  const tierEntries = Object.entries(tier.files || {});
  if (!tierEntries.length) errors.push(`protected tier ${tierName} lists no files; expected at least one sha256-pinned file. Comparing zero hashes proves nothing.`);
  for (const [file, expectedHash] of tierEntries) {
    filesChecked += 1;
    const resolvedFile = resolveRuntimePath(file);
    if (!fs.existsSync(resolvedFile)) { errors.push(`protected file missing: ${file}`); continue; }
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(resolvedFile)).digest('hex');
    if (actualHash === expectedHash) continue;
    const finding = { code: 'PROTECTED_BASELINE_DRIFT', tier: tierName, file, expected_sha256: expectedHash, actual_sha256: actualHash, message: `protected file changed: ${file}` };
    if (enforcement === 'error') errors.push(`PROTECTED_BASELINE_DRIFT (${tierName}): ${file}`);
    else strong_warnings.push(finding);
  }
}

// The overall floor: whatever the tier shapes are, a run that opened no protected
// file at all compared nothing and must not report PASS.
if (!filesChecked) errors.push('examined 0 protected files across every tier in artifacts/validation/pre-implementation-protected-hashes.json; expected at least one protected file. A baseline guard that compares no file proves nothing.');

const status = errors.length ? 'FAIL' : strong_warnings.length ? 'PASS_WITH_STRONG_WARNING' : 'PASS';
const report = { status, errors, strong_warnings, owners: own.summary, protected_files_checked: filesChecked };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
