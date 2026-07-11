#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

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

for (const [file, expectedHash] of Object.entries(pre.files || {})) {
  if (!fs.existsSync(file)) {
    errors.push(`protected file missing: ${file}`);
    continue;
  }
  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actualHash !== expectedHash) {
    strong_warnings.push({
      code: 'PROTECTED_BASELINE_DRIFT',
      file,
      expected_sha256: expectedHash,
      actual_sha256: actualHash,
      message: `protected file changed: ${file}`,
    });
  }
}

const status = errors.length ? 'FAIL' : strong_warnings.length ? 'PASS_WITH_STRONG_WARNING' : 'PASS';
const report = { status, errors, strong_warnings, owners: own.summary };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
