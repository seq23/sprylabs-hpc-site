#!/usr/bin/env node
import {writeJson} from '../agent_intake/bhpc_agent_common.mjs';
import {collectBhpcRouteAuthority, validateBhpcRouteAuthorityRecord} from '../lib/bhpc_route_authority.mjs';

const {records, admitted, blocked} = collectBhpcRouteAuthority();
const errors = [];
const warnings = [];

if (!records.length) errors.push('no_bhpc_route_authority_records');

const exactPlanRecords = admitted.filter(record => record.source === 'agent_exact_implementation_plan' && record.implementation_path);
const exactPlanPaths = new Set(exactPlanRecords.map(record => record.implementation_path));
const activeAcceptanceIds = new Set(exactPlanRecords.flatMap(record => record.acceptance_ids || []).map(String));
const seenPaths = new Map();
for (const record of records) {
  for (const error of validateBhpcRouteAuthorityRecord(record)) errors.push(error);

  if (record.admitted) {
    const key = record.implementation_path;
    if (key) {
      const previous = seenPaths.get(key);
      if (previous && previous.record_id !== record.record_id) {
        const currentAcceptance = record.source === 'agent_acceptance_manifest';
        const previousAcceptance = previous.source === 'agent_acceptance_manifest';
        const currentActive = currentAcceptance && activeAcceptanceIds.has(String(record.acceptance_id || record.record_id));
        const previousActive = previousAcceptance && activeAcceptanceIds.has(String(previous.acceptance_id || previous.record_id));
        const historicalAcceptanceOnly = currentAcceptance && previousAcceptance && !currentActive && !previousActive;
        if (!exactPlanPaths.has(key) && !historicalAcceptanceOnly) {
          errors.push(`duplicate_admitted_route:${key}:${previous.record_id}:${record.record_id}`);
        }
      } else if (!previous) {
        seenPaths.set(key, record);
      }
    }

    if (!record.rendered_exists) {
      warnings.push(`admitted_route_not_rendered_yet:${record.record_id}:${record.implementation_path}`);
    }
  }

  if (record.blocked && record.rendered_exists) {
    const blockReason = String(record.blocked_reason || record.route_status || record.operation || '');
    const protectedBuyerPageBlock = blockReason.includes('PROTECTED_BUYER_PAGE_CONTRACT');
    if (protectedBuyerPageBlock) {
      warnings.push(`protected_buyer_page_visible_route_agent_injection_blocked:${record.record_id}:${record.implementation_path}:${blockReason}`);
    } else {
      errors.push(`blocked_route_rendered:${record.record_id}:${record.implementation_path}:${blockReason}`);
    }
  }
}

const pageFamilyCounts = admitted.reduce((acc, record) => {
  const key = record.page_family || 'unknown';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const routeShapeCounts = admitted.reduce((acc, record) => {
  const key = record.route_shape || 'unknown';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const sourceCounts = records.reduce((acc, record) => {
  const key = record.source || 'unknown';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const report = {
  schema_version: '2.0',
  validator: 'bhpc-page-family-contract',
  authority_model: 'artifact_admitted_route_authority',
  status: errors.length ? 'FAIL' : 'PASS',
  generated_at: new Date().toISOString(),
  record_count: records.length,
  admitted_count: admitted.length,
  blocked_count: blocked.length,
  page_family_counts: pageFamilyCounts,
  route_shape_counts: routeShapeCounts,
  source_counts: sourceCounts,
  sample_admitted_routes: admitted.slice(0, 25).map(record => ({
    record_id: record.record_id,
    source: record.source,
    scope: record.scope,
    operation: record.operation,
    page_family: record.page_family,
    route_status: record.route_status,
    implementation_path: record.implementation_path,
    route_shape: record.route_shape,
    admission_basis: record.admission_basis
  })),
  errors,
  warnings
};

writeJson('artifacts/validation/bhpc-page-family-contract.json', report);
writeJson('reports/bhpc-page-family-contract.json', report);

if (errors.length) {
  console.error(`[validate:bhpc-page-family-contract] FAIL: ${errors.length} issue(s)`);
  for (const error of errors.slice(0, 120)) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`[validate:bhpc-page-family-contract] PASS: admitted=${admitted.length}; blocked=${blocked.length}; shapes=${JSON.stringify(routeShapeCounts)}`);
