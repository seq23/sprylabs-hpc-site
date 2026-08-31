#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, writeJson} from '../agent_intake/bhpc_agent_common.mjs';
import {collectBhpcRouteAuthority, validateBhpcRouteAuthorityRecord} from '../lib/bhpc_route_authority.mjs';

// collectBhpcRouteAuthority() reads BOTH of its inputs through a readJson whose
// `catch` returns an empty default, so a missing or corrupt artifact yielded zero
// records: validateBhpcRouteAuthorityRecord() then ran zero times and the only
// output was non-failing warnings, printed as "PASS: admitted=0". The helper is
// shared with validate_bhpc_page_family_contract.mjs, so absence and corruption
// are separated from a present-but-empty file here instead.
const REQUIRED_INPUTS = [
  ['data/report_fixes/agent_acceptance_manifest.generated.json', 'npm run agent:bhpc:compile-acceptance'],
  ['artifacts/validation/agent-exact-implementation-plan.json', 'npm run agent:bhpc:plan-exact']
];
for (const [rel, produced] of REQUIRED_INPUTS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[bhpc-dynamic-page-contract] FAIL: required input ${rel} is missing; produce it with \`${produced}\`. Treating a missing artifact as an empty record set proves nothing.`);
    process.exit(1);
  }
  try { JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (error) {
    console.error(`[bhpc-dynamic-page-contract] FAIL: required input ${rel} is not valid JSON (${error.message}); regenerate it with \`${produced}\`. Treating a corrupt artifact as an empty record set proves nothing.`);
    process.exit(1);
  }
}

const {records, admitted, blocked} = collectBhpcRouteAuthority();
const errors = [];
const warnings = [];
// Two sets narrow independently: the record set feeds the per-record contract
// checks, and the admitted subset feeds the page-family coverage check below.
if (!records.length) errors.push(`empty_route_authority_record_set:expected at least one record across ${REQUIRED_INPUTS.map(x => x[0]).join(' and ')}; a route contract that inspects zero records proves nothing`);
if (!admitted.length) errors.push('empty_admitted_record_set:every route authority record is blocked; expected at least one admitted route, and page-family coverage over an empty admitted set proves nothing');
for (const record of records) {
  for (const error of validateBhpcRouteAuthorityRecord(record)) errors.push(error);
  if (record.scope && !['bhpc','aplayer','a-player','a-player-mode'].includes(String(record.scope))) errors.push(`non_bhpc_route_scope:${record.record_id}:${record.scope}`);
  if (record.blocked && record.admitted) errors.push(`blocked_record_admitted:${record.record_id}`);
  if (record.route_status && /fallback/i.test(record.route_status) && record.admission_basis === 'exact_implementation') errors.push(`fallback_counted_as_exact:${record.record_id}`);
}
const pageFamilies = admitted.reduce((acc, row) => { const k = row.page_family || 'unknown'; acc[k]=(acc[k]||0)+1; return acc; }, {});
for (const required of ['intended_winner_repair','authority_insight','answer_page','comparison_page']) {
  if (!Object.keys(pageFamilies).some(k => k.includes(required) || k === required)) warnings.push(`fixture_family_not_currently_present:${required}`);
}
const report = {schema_version:'1.0', validator:'bhpc-dynamic-page-contract', status:errors.length?'FAIL':'PASS', record_count:records.length, admitted_count:admitted.length, blocked_count:blocked.length, page_family_counts:pageFamilies, errors, warnings};
writeJson('artifacts/validation/bhpc-dynamic-page-contract.json', report);
writeJson('reports/bhpc-dynamic-page-contract.json', report);
if (errors.length) { console.error(JSON.stringify(report,null,2)); process.exit(1); }
console.log(`[bhpc-dynamic-page-contract] PASS: admitted=${admitted.length}; blocked=${blocked.length}`);
