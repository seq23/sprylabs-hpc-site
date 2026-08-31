#!/usr/bin/env node
import fs from 'node:fs';
import {fail, pass, writeSummary} from './common.mjs';

const data = JSON.parse(fs.readFileSync('data/citation/query_registry.json', 'utf8'));
const active = (data.queries || []).filter(row => row && row.release_status === 'ACTIVE' && row.query && row.primary_page);
// A registry that loses its queries array - renamed key, truncated write,
// every row flipped out of ACTIVE - leaves nothing to compare, and the run
// still announced deterministic canonical ownership over an empty set.
if (!active.length) fail('[validate:query-owner-uniqueness] FAIL: 0 ACTIVE queries in data/citation/query_registry.json; the registry must list queries carrying release_status ACTIVE with both query and primary_page, and canonical ownership cannot be proved over an empty set.');
const owners = new Map();
const errors = [];
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
for (const row of active) {
  const key = normalize(row.query);
  const prior = owners.get(key);
  if (prior && prior.primary_page !== row.primary_page) {
    errors.push(`normalized active query has multiple canonical owners: ${row.query} -> ${prior.primary_page}, ${row.primary_page}`);
  } else if (!prior) {
    owners.set(key, {primary_page: row.primary_page, query_id: row.query_id || ''});
  }
}
writeSummary('validate-query-owner-uniqueness', {
  status: errors.length ? 'FAIL' : 'PASS',
  active_queries: active.length,
  normalized_queries: owners.size,
  errors
});
if (errors.length) fail(`[validate:query-owner-uniqueness] FAIL: ${errors.length} canonical ownership conflict(s)`, errors);
pass(`[validate:query-owner-uniqueness] PASS: ${active.length} active queries have deterministic canonical ownership`);
