#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, writeJson} from './bhpc_agent_common.mjs';
import {resolveBhpcAgentRoute} from '../lib/bhpc_agent_route_resolver.mjs';

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

const report = {
  schema_version: '1.0',
  validator: 'bhpc-route-resolution-self-test',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  cases: {unambiguousTitleTypo, ambiguousTitleTypo, existingPathTypo, newPageSpec},
  errors
};
writeJson('artifacts/validation/bhpc-route-resolution-self-test.json', report);
writeJson('reports/bhpc-route-resolution-self-test.json', report);
if (errors.length) {
  console.error(`[bhpc-route-resolution-self-test] FAIL: ${errors.length} issue(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log('[bhpc-route-resolution-self-test] PASS: isolated fixtures prove unambiguous resolution, ambiguity blocking, and explicit path repair');
