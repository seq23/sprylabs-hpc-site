#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {resolveRuntimePath} from '../lib/runtime_path.mjs';

const own = JSON.parse(fs.readFileSync('data/content_ownership_registry.json', 'utf8'));
const pre = JSON.parse(fs.readFileSync('artifacts/validation/pre-implementation-protected-hashes.json', 'utf8'));
const errors = [];
const strong_warnings = [];
const seen = new Set();

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
for (const [tierName, tier] of Object.entries(tiers)) {
  const enforcement = tier.enforcement || 'error';
  if (enforcement === 'exists_non_empty') {
    for (const file of tier.files || []) {
      const resolvedFile = resolveRuntimePath(file);
      if (!fs.existsSync(resolvedFile)) { errors.push(`protected file missing: ${file}`); continue; }
      if (fs.statSync(resolvedFile).size === 0) errors.push(`protected file emptied: ${file}`);
    }
    continue;
  }
  for (const [file, expectedHash] of Object.entries(tier.files || {})) {
    const resolvedFile = resolveRuntimePath(file);
    if (!fs.existsSync(resolvedFile)) { errors.push(`protected file missing: ${file}`); continue; }
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(resolvedFile)).digest('hex');
    if (actualHash === expectedHash) continue;
    const finding = { code: 'PROTECTED_BASELINE_DRIFT', tier: tierName, file, expected_sha256: expectedHash, actual_sha256: actualHash, message: `protected file changed: ${file}` };
    if (enforcement === 'error') errors.push(`PROTECTED_BASELINE_DRIFT (${tierName}): ${file}`);
    else strong_warnings.push(finding);
  }
}

const status = errors.length ? 'FAIL' : strong_warnings.length ? 'PASS_WITH_STRONG_WARNING' : 'PASS';
const report = { status, errors, strong_warnings, owners: own.summary };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
