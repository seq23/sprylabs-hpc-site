#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const known = [
  'reports/bhpc-agent-run-intake.json',
  'reports/workflow-hostile-review-all.json',
  'reports/bhpc-agent-source-coverage.json',
  'reports/generated_page_range_repair_report.json',
  'reports/fanout-coverage-info.json',
];
const errors = [];
const warnings = [];
let selfHealed = 0;
let info = 0;
const reports = [];
for (const rel of known) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  let data;
  try { data = JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch { errors.push(`${rel}: invalid JSON`); continue; }
  reports.push(rel);
  for (const error of data.errors || []) errors.push(`${rel}: ${typeof error === 'string' ? error : JSON.stringify(error)}`);
  for (const warning of data.warnings || []) warnings.push(`${rel}: ${typeof warning === 'string' ? warning : JSON.stringify(warning)}`);
  if (Number(data.blocked || 0) > 0) warnings.push(`${rel}: blocked=${data.blocked}`);
  if (Number(data.warning_count || 0) > 0) warnings.push(`${rel}: warning_count=${data.warning_count}`);
  selfHealed += Number(data.repaired || data.self_healed_count || 0);
  info += Number(data.informational || data.informational_count || data.info_count || 0) + (Array.isArray(data.info) ? data.info.length : 0);
}
const status = errors.length ? 'FAIL' : warnings.length ? 'PASS_WITH_STRONG_WARNING' : 'PASS';
const summary = {
  schema_version: '1.1',
  generated_at: new Date().toISOString(),
  status,
  errors: errors.length,
  warnings: warnings.length,
  self_healed: selfHealed,
  informational: info,
  external_decisions: 0,
  reports_checked: reports,
  error_details: errors,
  warning_details: warnings,
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/release-clean-summary.json'), JSON.stringify(summary, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'reports/release-clean-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log('RELEASE VALIDATION: ' + summary.status);
console.log('ERRORS: ' + summary.errors);
console.log('WARNINGS: ' + summary.warnings);
console.log('SELF-HEALED: ' + summary.self_healed);
console.log('INFORMATIONAL: ' + summary.informational);
console.log('EXTERNAL DECISIONS: ' + summary.external_decisions);
if (errors.length) process.exit(1);
