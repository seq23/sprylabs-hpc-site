#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readJson, exists, fail, pass, writeSummary } from '../validation/common.mjs';
import { profilePurityFindings } from '../validation/profile_purity_lib.mjs';

const errors = [];
const warnings = [];
const queueSummaries = [];

function readOptionalJson(rel, fallback = null) {
  if (!exists(rel)) return fallback;
  return readJson(rel);
}

function arrayAt(doc, field) {
  if (!field) return null;
  return field.split('.').reduce((value, key) => value && value[key], doc);
}

const contractPath = 'data/strategy/spry_cadence_queue_self_heal_contract.json';
const contract = readOptionalJson(contractPath);
if (!contract) errors.push(`missing_contract:${contractPath}`);
else if (contract.validation_is_read_only !== true) errors.push('contract_must_declare_validation_is_read_only');

const cadencePath = contract?.cadence_source || 'data/strategy/content_release_cadence.json';
const cadence = readOptionalJson(cadencePath);
if (!cadence) {
  errors.push(`missing_cadence_source:${cadencePath}`);
} else {
  if (cadence.targets_are_hard_failures !== false) errors.push('cadence_targets_must_not_be_hard_failures');
  for (const [name, spec] of Object.entries(cadence.targets || {})) {
    if (spec.hard_failure !== false) errors.push(`cadence_target_hard_fails:${name}`);
    if (!Array.isArray(spec.target) || spec.target.length !== 2) errors.push(`cadence_target_range_invalid:${name}`);
  }
}

for (const queue of contract?.queue_files || []) {
  const rel = queue.path;
  if (!rel || rel.split('/').length < 2) errors.push(`queue_path_not_scoped:${rel || 'missing'}`);
  if (!rel?.startsWith('data/')) errors.push(`queue_outside_data:${rel}`);
  const doc = readOptionalJson(rel);
  if (!doc) {
    errors.push(`missing_queue:${rel}`);
    continue;
  }
  const items = arrayAt(doc, queue.array_field) ?? [];
  if (!Array.isArray(items)) {
    errors.push(`queue_items_not_array:${rel}:${queue.array_field}`);
    continue;
  }
  const statusCounts = {};
  for (const item of items) {
    const status = queue.status_field ? item?.[queue.status_field] : item?.status;
    if (status) statusCounts[status] = (statusCounts[status] || 0) + 1;
    const target = item?.target_path || item?.path || item?.slug;
    if (typeof target === 'string' && (target.startsWith('../') || path.isAbsolute(target))) {
      errors.push(`queue_item_unsafe_path:${rel}:${target}`);
    }
  }
  if (items.length === 0 && queue.empty_is_warning === true) warnings.push(`queue_empty:${rel}`);
  queueSummaries.push({ path: rel, item_count: items.length, status_counts: statusCounts });
}

for (const name of fs.readdirSync('.')) {
  if (/queue|cadence|self[-_]?heal/i.test(name) && /\.(json|md|txt)$/i.test(name)) {
    errors.push(`root_generated_control_file:${name}`);
  }
}

const pkg = readJson('package.json');
for (const lane of contract?.self_heal_lanes || []) {
  const command = lane.command || '';
  const script = command.match(/^npm run ([^\s]+)$/)?.[1];
  if (!script || !pkg.scripts?.[script]) errors.push(`missing_self_heal_command:${command}`);
  for (const forbidden of contract?.hard_fail_boundaries?.forbidden_self_heal_for || []) {
    if (!lane.forbidden_for?.includes(forbidden)) errors.push(`self_heal_lane_missing_forbidden_boundary:${lane.id}:${forbidden}`);
  }
}

const repairMap = readOptionalJson('data/validation/governance_repair_map.json', { repairs: {} });
for (const [repairName, repair] of Object.entries(repairMap.repairs || {})) {
  if (!Array.isArray(repair.forbidden_for) || !repair.forbidden_for.includes('protected_lane_mutation')) {
    errors.push(`repair_missing_protected_lane_boundary:${repairName}`);
  }
}

const matrix = readJson('_repo_validation_matrix.json');
const profileFindings = profilePurityFindings(matrix, pkg.scripts || {});
if (profileFindings.length) errors.push(...profileFindings.map((x) => `validation_profile_mutates:${x.profile}:${x.id}`));

const report = {
  status: errors.length ? 'FAIL' : warnings.length ? 'PASS_WITH_WARNING' : 'PASS',
  cadence_source: cadencePath,
  queue_summaries: queueSummaries,
  warnings,
  errors
};

writeSummary('validate-spry-cadence-queue-self-heal', report);
fs.mkdirSync('artifacts/validation', { recursive: true });
fs.writeFileSync('artifacts/validation/spry-cadence-queue-self-heal.json', JSON.stringify(report, null, 2) + '\n');

if (errors.length) fail(`[validate:spry-cadence-queue-self-heal] FAIL: ${errors.length} contract issue(s)`, errors);
if (warnings.length) {
  console.log(`[validate:spry-cadence-queue-self-heal] PASS_WITH_WARNING: ${warnings.length} non-blocking queue/cadence warning(s)`);
  for (const warning of warnings) console.log(` - ${warning}`);
  process.exit(0);
}
pass(`[validate:spry-cadence-queue-self-heal] PASS: ${queueSummaries.length} queues and self-heal lanes are contract-aligned`);
