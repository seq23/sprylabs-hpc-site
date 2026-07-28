#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, safeScope} from '../agent_intake/bhpc_agent_common.mjs';

function normalizeRel(value = '') {
  let rel = String(value || '').trim();
  if (!rel) return '';
  if (/^https?:\/\//i.test(rel)) {
    try { rel = new URL(rel).pathname; } catch { return ''; }
  }
  rel = rel.replace(/^\/+/, '');
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return '';
  if (/^n\/?a(?:\/index\.html)?$/i.test(rel)) return '';
  return rel;
}

function renderedPath(value = '') {
  const rel = normalizeRel(value);
  if (!rel) return '';
  if (rel.endsWith('/')) return `${rel}index.html`;
  if (rel.endsWith('.html')) return rel;
  return `${rel.replace(/\/+$/, '')}/index.html`;
}

function routeShape(value = '') {
  const rel = renderedPath(value);
  if (!rel) return 'missing';
  if (/^agent\/[a-z0-9-]+\/[a-z0-9-]+\.html$/i.test(rel)) return 'agent_page';
  if (/^answers\/[a-z0-9-]+\.html$/i.test(rel)) return 'answer_page';
  if (/^comparisons\/[a-z0-9-]+\.html$/i.test(rel)) return 'comparison_page';
  if (/^clusters\/[a-z0-9-]+\.html$/i.test(rel)) return 'cluster_page';
  if (/^insights\/[a-z0-9-]+\.html$/i.test(rel)) return 'insight_page';
  if (/^[a-z0-9-]+\.html$/i.test(rel)) return 'root_html';
  if (/^[a-z0-9-]+\/index\.html$/i.test(rel)) return 'root_directory';
  return 'site_html';
}

function fileExists(rel = '') {
  const rendered = renderedPath(rel);
  return Boolean(rendered && fs.existsSync(path.join(ROOT, rendered)));
}

function sourceExists(rel = '') {
  return Boolean(rel && fs.existsSync(path.join(ROOT, rel)));
}

function recordFromAcceptance(entry = {}) {
  return {
    source: 'agent_acceptance_manifest',
    record_id: String(entry.record_id || entry.id || ''),
    acceptance_id: String(entry.id || entry.record_id || ''),
    scope: safeScope(entry.scope || 'bhpc'),
    operation: String(entry.operation || ''),
    page_family: String(entry.page_family || ''),
    route_status: String(entry.route_status || ''),
    implementation_path: normalizeRel(entry.implementation_path || ''),
    rendered_path: renderedPath(entry.implementation_path || ''),
    route_shape: routeShape(entry.implementation_path || ''),
    blocked_reason: String(entry.blocked_reason || ''),
    acceptance_status: String(entry.acceptance_status || ''),
    source_artifact: 'data/report_fixes/agent_acceptance_manifest.generated.json',
    admission_basis: 'row_level_agent_acceptance'
  };
}

function recordFromPlan(spec = {}) {
  return {
    source: 'agent_exact_implementation_plan',
    record_id: String(spec.record_id || ''),
    acceptance_ids: (spec.acceptance_ids || []).map(String),
    scope: safeScope(spec.scope || 'bhpc'),
    operation: String(spec.operation || ''),
    page_family: String(spec.page_family || ''),
    route_status: String(spec.route_status || ''),
    implementation_path: normalizeRel(spec.implementation_path || ''),
    rendered_path: renderedPath(spec.implementation_path || ''),
    route_shape: routeShape(spec.implementation_path || ''),
    blocked_reason: String(spec.blocked_reason || ''),
    acceptance_status: spec.status === 'BLOCKED' ? 'BLOCKED' : 'REQUIRED',
    source_artifact: 'artifacts/validation/agent-exact-implementation-plan.json',
    admission_basis: 'exact_implementation_plan'
  };
}

function isBlocked(record = {}) {
  return Boolean(
    record.blocked_reason ||
    record.acceptance_status === 'BLOCKED' ||
    String(record.operation || '').startsWith('BLOCKED_') ||
    String(record.route_status || '').startsWith('BLOCKED_')
  );
}

function hasSource(record = {}) {
  return sourceExists(record.source_artifact);
}

export function collectBhpcRouteAuthority() {
  const records = [];
  const acceptance = readJson('data/report_fixes/agent_acceptance_manifest.generated.json', {entries: []});
  const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs: []});

  for (const entry of acceptance.entries || []) records.push(recordFromAcceptance(entry));
  for (const spec of plan.specs || []) records.push(recordFromPlan(spec));

  const byKey = new Map();
  for (const record of records) {
    const key = `${record.record_id}:${record.implementation_path}:${record.source}`;
    if (!record.record_id && !record.implementation_path) continue;
    byKey.set(key, {
      ...record,
      admitted: !isBlocked(record),
      blocked: isBlocked(record),
      source_exists: hasSource(record),
      rendered_exists: fileExists(record.implementation_path)
    });
  }

  const authority = [...byKey.values()];
  return {
    records: authority,
    admitted: authority.filter(record => record.admitted),
    blocked: authority.filter(record => record.blocked)
  };
}

export function validateBhpcRouteAuthorityRecord(record = {}) {
  const errors = [];
  if (!record.record_id) errors.push(`missing_record_id:${record.source}:${record.implementation_path}`);
  if (!record.source_exists) errors.push(`missing_source_artifact:${record.record_id}:${record.source_artifact}`);
  if (!record.blocked && !record.implementation_path) errors.push(`admitted_missing_implementation_path:${record.record_id}`);
  if (!record.blocked && record.route_shape === 'missing') errors.push(`admitted_missing_route_shape:${record.record_id}`);
  if (/^n\/?a(?:\/index\.html)?$/i.test(record.implementation_path)) errors.push(`legacy_na_route_admitted:${record.record_id}`);
  if (record.implementation_path.includes('..') || path.isAbsolute(record.implementation_path)) errors.push(`unsafe_route:${record.record_id}:${record.implementation_path}`);
  if (record.page_family === 'fallback_gap_fill' && record.operation === 'REPAIR_INTENDED_WINNER_PAGE') errors.push(`fallback_gap_fill_counted_as_exact_repair:${record.record_id}:${record.implementation_path}`);
  return errors;
}

export function renderedPathForBhpcRoute(value = '') {
  return renderedPath(value);
}
