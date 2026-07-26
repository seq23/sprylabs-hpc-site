#!/usr/bin/env node
import fs from 'node:fs';
import { fail, pass, writeSummary } from './common.mjs';

const registry = JSON.parse(fs.readFileSync('data/content/page_admission_registry.json', 'utf8'));
const lanes = JSON.parse(fs.readFileSync('data/content/programmatic_lane_contracts.json', 'utf8')).lanes || {};
const queries = JSON.parse(fs.readFileSync('data/citation/query_registry.json', 'utf8')).queries
  .filter(x => x.release_status === 'ACTIVE' && !/^reports\/|^coverage\//.test(x.primary_page));
const errors = [];
const strong_warnings = [];
const paths = new Set();
const primary = new Map();

if (registry.record_count !== registry.records.length) errors.push('record_count mismatch');
for (const record of registry.records) {
  for (const field of ['path','route','canonical_domain','generation_lane','admission_level','status','primary_query','intent','framework','unique_atom','artifact_type']) {
    if (record[field] === undefined || record[field] === null) errors.push(`${record.path || 'unknown'}: missing ${field}`);
  }
  if (paths.has(record.path)) errors.push(`duplicate path ${record.path}`);
  paths.add(record.path);
  const key = String(record.primary_query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (primary.has(key)) strong_warnings.push(`duplicate registry primary query ${record.primary_query}: ${primary.get(key)}, ${record.path}`);
  else primary.set(key, record.path);
  if (!lanes[record.generation_lane]) errors.push(`${record.path}: unknown lane ${record.generation_lane}`);
  if (!['baseline','full'].includes(record.admission_level)) errors.push(`${record.path}: invalid admission_level ${record.admission_level}`);
  if (record.status !== 'ADMITTED') errors.push(`${record.path}: registry may contain only ADMITTED public pages`);
  if (!fs.existsSync(record.path)) {
    if (queries.some(query => query.primary_page === record.path)) errors.push(`${record.path}: active registered public page missing`);
    else strong_warnings.push(`${record.path}: stale admission record points to a missing page`);
  }
}

const activeQueryOwners = new Map();
for (const query of queries) {
  const key = String(query.query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const prior = activeQueryOwners.get(key);
  if (prior && prior !== query.primary_page) strong_warnings.push(`conflicting active query owners for ${query.query}: ${prior}, ${query.primary_page}`);
  else activeQueryOwners.set(key, query.primary_page);
}
const active = new Set(queries.map(x => x.primary_page));
for (const page of active) {
  if (!paths.has(page)) strong_warnings.push(`${page}: active query owner missing from page admission registry`);
}
for (const page of paths) {
  if (!active.has(page)) strong_warnings.push(`${page}: admission record has no active query owner`);
}

const manual = JSON.parse(fs.readFileSync('data/content/manual_expansion_pages.json', 'utf8')).pages;
for (const page of manual) {
  const record = registry.records.find(x => x.path === page.path);
  if (!record || record.admission_level !== 'full' || record.generation_lane !== 'manual') {
    strong_warnings.push(`${page.path}: manual reference page not full-admitted`);
  }
}

const status = errors.length ? 'FAIL' : strong_warnings.length ? 'PASS_WITH_STRONG_WARNING' : 'PASS';
writeSummary('validate-programmatic-registry', {
  status,
  records: registry.records.length,
  active_queries: active.size,
  lanes: Object.keys(lanes).length,
  errors,
  strong_warnings,
});
if (errors.length) fail(`[validate:programmatic-registry] FAIL: ${errors.length} issue(s)`, errors.slice(0, 200));
if (strong_warnings.length) {
  console.warn(`[validate:programmatic-registry] STRONG WARNING: ${strong_warnings.length} governance drift issue(s)`);
  for (const warning of strong_warnings.slice(0, 200)) console.warn(` - ${warning}`);
  process.exit(0);
}
pass(`[validate:programmatic-registry] OK: ${registry.records.length} active pages registered across ${Object.keys(lanes).length} lanes`);
