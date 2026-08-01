#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, writeJson} from './bhpc_agent_common.mjs';
import {resolveBhpcAgentRoute} from '../lib/bhpc_agent_route_resolver.mjs';
import {requiredBlockTypesForPageFamily} from '../lib/bhpc_agent_block_schema.mjs';
import {groupBhpcSemanticEntries, renderBhpcRecordEvidence} from '../lib/bhpc_agent_semantic_contract.mjs';
import {deriveBhpcRequiredHeading} from '../lib/bhpc_agent_acceptance_parser.mjs';

const errors = [];
function expect(label, condition, details = '') {
  if (!condition) errors.push(`${label}${details ? `: ${details}` : ''}`);
}

const fixtureRegistryRows = [
  {
    query_id: 'SELFTEST-QRY-001',
    query: 'Minimum Viable Day',
    aliases: ['minimum viable execution day'],
    primary_page: 'minimum-viable-day/index.html',
    release_status: 'ACTIVE'
  },
  {
    query_id: 'SELFTEST-QRY-002',
    query: 'Minimum Viable Day',
    aliases: [],
    primary_page: 'what-is-a-minimum-viable-day.html',
    release_status: 'ACTIVE'
  }
];

const unambiguousTitleTypo = resolveBhpcAgentRoute({
  query: 'Minimun Viable Execution Day',
  action_tier: 'page fix',
  primary_fix_type: 'completeness',
  fix_recommendation: 'Fix the existing minimum viable day page.'
}, {registryRows: [fixtureRegistryRows[0]]});
expect(
  'unambiguous query typo resolves to the canonical owner',
  unambiguousTitleTypo.implementation_path === 'minimum-viable-day/index.html' && /^TYPO_RESOLVED_/.test(unambiguousTitleTypo.status),
  JSON.stringify(unambiguousTitleTypo)
);
expect(
  'unambiguous query typo carries route-resolution evidence',
  unambiguousTitleTypo.route_resolution?.ambiguous === false && unambiguousTitleTypo.route_resolution?.best?.path === 'minimum-viable-day/index.html',
  JSON.stringify(unambiguousTitleTypo)
);

const ambiguousTitleTypo = resolveBhpcAgentRoute({
  query: 'Minimum Viable Day',
  action_tier: 'page fix',
  primary_fix_type: 'completeness',
  fix_recommendation: 'Repair the appropriate minimum viable day page.'
}, {registryRows: fixtureRegistryRows});
expect(
  'ambiguous query typo blocks rather than guessing',
  ambiguousTitleTypo.status === 'BLOCKED_AMBIGUOUS_FUZZY_ROUTE' && ambiguousTitleTypo.route_resolution?.ambiguous === true,
  JSON.stringify(ambiguousTitleTypo)
);

const existingPathTypo = resolveBhpcAgentRoute({
  query: 'The Arbitration Engine: How to Decide What Actually Matters',
  intended_winner_page: 'https://spryexecutiveos.com/arbitraton-engine.html',
  action_tier: 'page fix',
  primary_fix_type: 'completeness',
  fix_recommendation: 'Fix the existing AI executive coach page.'
});
expect('intended URL slug typo resolves to existing page', existingPathTypo.implementation_path === 'arbitration-engine.html', JSON.stringify(existingPathTypo));
expect('path typo is marked as typo-resolved repair', /^TYPO_RESOLVED_/.test(existingPathTypo.status), existingPathTypo.status);

const newPageSpec = resolveBhpcAgentRoute({
  query: 'What systems can I implement to remove the need for willpower?',
  implementation_path: 'answers/route-resolution-self-test-new-page-do-not-fuzzy-match.html',
  source_section: 'json_new_page_opportunities',
  primary_fix_type: 'pages_to_build',
  action_tier: 'page_spec',
  operation: 'CREATE_NEW_TARGET_PAGE'
});
expect('new page spec keeps generated path instead of fuzzy-routing', newPageSpec.implementation_path === 'answers/route-resolution-self-test-new-page-do-not-fuzzy-match.html', JSON.stringify(newPageSpec));
expect('new page spec stays create route', /CREATE/.test(newPageSpec.status), newPageSpec.status);



const semanticBase = {
  run_date: '2026-08-01',
  scope: 'bhpc',
  implementation_path: 'insights/self-test.html',
  operation: 'CREATE_NEW_TARGET_PAGE',
  page_family: 'comparison_page',
  query: 'Compare two speaking-coach approaches',
  required_heading: 'Compare two speaking-coach approaches',
  source_fix_instruction: 'Add a comparison table.',
  required_strings: ['Compare two speaking-coach approaches'],
  required_block_types: ['direct_answer']
};
const semanticGroups = groupBhpcSemanticEntries([
  {...semanticBase, id: 'semantic-001', record_id: 'semantic-001'},
  {...semanticBase, id: 'semantic-002', record_id: 'semantic-002'},
  {...semanticBase, id: 'semantic-003', record_id: 'semantic-003', required_heading: 'Score vocal clarity', source_fix_instruction: 'Add a vocal clarity scoring protocol.'}
]);
expect('semantic duplicates consolidate without losing record ids', semanticGroups.length === 2 && semanticGroups[0].record_ids.includes('semantic-001') && semanticGroups[0].record_ids.includes('semantic-002'), JSON.stringify(semanticGroups));
const semanticHtml = renderBhpcRecordEvidence(semanticGroups.flatMap(group => group.entries));
expect('semantic evidence renders every source record marker', ['semantic-001','semantic-002','semantic-003'].every(id => semanticHtml.includes(`data-bhpc-agent-record="${id}"`)), semanticHtml);
expect('comparison page family requires comparison table', requiredBlockTypesForPageFamily('comparison_page').includes('comparison_table'), JSON.stringify(requiredBlockTypesForPageFamily('comparison_page')));
const derivedHeading = deriveBhpcRequiredHeading('n/a||Page lacks a clear block||Add an explicit H2 callout matching "Vocal clarity scorecard" under the protocol.', 'Fallback query');
expect('delimiter-rich agent instruction yields a clean required heading', derivedHeading === 'Vocal clarity scorecard', derivedHeading);

const report = {
  schema_version: '1.0',
  validator: 'bhpc-route-resolution-self-test',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  cases: {unambiguousTitleTypo, ambiguousTitleTypo, existingPathTypo, newPageSpec, semantic_group_count: semanticGroups.length, derived_heading: derivedHeading},
  errors
};
writeJson('artifacts/validation/bhpc-route-resolution-self-test.json', report);
writeJson('reports/bhpc-route-resolution-self-test.json', report);
if (errors.length) {
  console.error(`[bhpc-route-resolution-self-test] FAIL: ${errors.length} issue(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log('[bhpc-route-resolution-self-test] PASS: route resolution, semantic grouping, family block requirements, and heading extraction');
