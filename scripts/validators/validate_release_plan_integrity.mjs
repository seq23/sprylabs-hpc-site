#!/usr/bin/env node
import fs from 'node:fs';

const planPath = process.env.RELEASE_PLAN_PATH || 'artifacts/validation/daily-citation-release-plan.json';
const errors = [];

if (!fs.existsSync(planPath)) {
  errors.push(`missing release plan: ${planPath}`);
} else {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const selected = Array.isArray(plan.selected) ? plan.selected : [];
  const skipped = Array.isArray(plan.skipped) ? plan.skipped : [];
  const blocked = Array.isArray(plan.blocked) ? plan.blocked : [];
  const all = [...selected, ...skipped, ...blocked];

  if (plan.external_telemetry_present !== false) {
    errors.push('external telemetry must be false unless provided');
  }

  // A clean autonomous run may legitimately select zero units when every
  // candidate is fixture-only, duplicate, protected, unsafe, or otherwise
  // skipped. Integrity requires accounted-for decisions, not forced output.
  if (all.length === 0) {
    errors.push('release plan contains no accounted units');
  }

  for (const item of all) {
    for (const field of ['candidate_id', 'action', 'route_owner', 'source_basis', 'risk_level', 'decision']) {
      const value = item[field];
      if (!value || (Array.isArray(value) && value.length === 0)) {
        errors.push(`${item.candidate_id || 'unknown'} missing ${field}`);
      }
    }
    if (!item.reason && !item.safe_harbor_reason) {
      errors.push(`${item.candidate_id || 'unknown'} missing reason or safe_harbor_reason`);
    }
  }

  const summary = plan.summary || {};
  const expected = {
    selected_units: selected.length,
    skipped_units: skipped.length,
    blocked_units: blocked.length,
  };
  for (const [field, count] of Object.entries(expected)) {
    if (Number(summary[field]) !== count) {
      errors.push(`summary ${field} mismatch: expected ${count}, got ${summary[field]}`);
    }
  }
  if (Number(summary.release_units_planned) !== all.length) {
    errors.push(`summary release_units_planned mismatch: expected ${all.length}, got ${summary.release_units_planned}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('[validate:release-plan-integrity] PASS');
