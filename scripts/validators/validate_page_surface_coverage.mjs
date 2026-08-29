#!/usr/bin/env node
/**
 * Guards the REACH of the content validators, not their verdicts.
 *
 * A validator that passes while looking at 40 of 2,265 pages is not protection;
 * it is a green light with no bulb behind it. validate_extractability did exactly
 * that (`readdirSync(cwd).slice(0, 40)`), and validate_above_fold and
 * validate_cta_presence walked three directories non-recursively - 232 files -
 * while printing "OK (N checked pages)".
 *
 * This runs each of them for real, reads the page count out of its own output,
 * and hard-fails if that count falls below the floor recorded in
 * config/validation/page_surface_coverage.json, if a validator reports no count
 * at all, or if it examined zero pages. Narrowing a scan back down now fails
 * here; widening it and raising the floor is the only way forward.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { listIndexablePages } = require('../lib/site_pages.js');

const ROOT = process.cwd();
const CONFIG = 'config/validation/page_surface_coverage.json';
const errors = [];
const rows = [];

if (!fs.existsSync(path.join(ROOT, CONFIG))) {
  console.error(`[validate:page-surface-coverage] FAIL: ${CONFIG} is missing; the coverage floors are the whole point of this check.`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, CONFIG), 'utf8'));
const validators = Array.isArray(cfg.validators) ? cfg.validators : [];

// Rule 0: guarding an empty list of validators is not a pass.
if (validators.length === 0) {
  console.error('[validate:page-surface-coverage] FAIL: the config declares zero validators to guard. A coverage guard that guards nothing must not pass.');
  process.exit(1);
}

const indexable = listIndexablePages().length;
const minSurface = Number(cfg.surface?.min_indexable_pages ?? 0);
if (indexable < minSurface) {
  errors.push(`the indexable page surface itself is ${indexable}, below the recorded floor of ${minSurface}. Either pages were removed, or scripts/lib/site_pages.js stopped seeing them - both change what every validator below is measuring.`);
}

for (const v of validators) {
  const [cmd, ...args] = String(v.command).split(' ');
  let out = '';
  let failed = null;
  try {
    out = execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    failed = e;
    out = `${e.stdout || ''}${e.stderr || ''}`;
  }
  if (failed) {
    errors.push(`${v.label}: exited non-zero, so its reach could not be measured. Fix the validator first. Output: ${String(out).trim().slice(0, 300)}`);
    continue;
  }
  const m = new RegExp(v.count_pattern).exec(out);
  if (!m) {
    errors.push(`${v.label}: output does not report how many pages it examined (pattern ${v.count_pattern} did not match). A validator that will not say what it looked at cannot be trusted to have looked.`);
    continue;
  }
  const examined = Number(m[1]);
  const floor = Number(v.min_pages_examined);
  rows.push({ label: v.label, examined, floor, indexable, coverage_pct: Number(((100 * examined) / Math.max(1, indexable)).toFixed(2)) });
  if (!Number.isFinite(examined) || examined === 0) {
    errors.push(`${v.label}: examined 0 pages.`);
  } else if (examined < floor) {
    errors.push(`${v.label}: examined ${examined} pages, below its recorded floor of ${floor}. Coverage may be raised, never quietly lowered - if this narrowing is deliberate, say why in ${CONFIG} and change the floor in the same commit.`);
  }
  const exemptAllowance = Number(v.max_named_exemptions ?? 0);
  const uncovered = indexable - examined;
  if (uncovered > exemptAllowance) {
    errors.push(`${v.label}: ${uncovered} indexable page(s) are outside its scan but only ${exemptAllowance} named exemption(s) are declared. Every page it skips must be skipped by name, with a reason.`);
  }
}

const report = {
  schema_version: '1.0',
  validator: 'page-surface-coverage',
  status: errors.length ? 'FAIL' : 'PASS',
  indexable_pages: indexable,
  validators_measured: rows.length,
  rows,
  errors,
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/page-surface-coverage.json'), `${JSON.stringify(report, null, 2)}\n`);

if (errors.length) {
  console.error(`[validate:page-surface-coverage] FAIL: ${errors.length} coverage issue(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`[validate:page-surface-coverage] PASS: ${rows.length} content validator(s) measured against ${indexable} indexable pages; ${rows.map((r) => `${r.label}=${r.examined} (${r.coverage_pct}%)`).join(', ')}`);
