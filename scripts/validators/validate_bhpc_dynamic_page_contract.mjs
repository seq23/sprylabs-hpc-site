#!/usr/bin/env node
import {writeJson} from '../agent_intake/bhpc_agent_common.mjs';
import {collectBhpcRouteAuthority, validateBhpcRouteAuthorityRecord} from '../lib/bhpc_route_authority.mjs';
const {records, admitted, blocked} = collectBhpcRouteAuthority();
const errors = [];
const warnings = [];
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
