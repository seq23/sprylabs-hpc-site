#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, writeJson, parseVelocityJson, repoPathFromIntendedWinnerPage, repoPathThroughSiteRedirect, loadExactSiteRedirects} from './bhpc_agent_common.mjs';
import {resolveBhpcAgentRoute} from '../lib/bhpc_agent_route_resolver.mjs';
import {requiredBlockTypesForPageFamily} from '../lib/bhpc_agent_block_schema.mjs';
import {groupBhpcSemanticEntries, renderBhpcRecordEvidence} from '../lib/bhpc_agent_semantic_contract.mjs';
import {deriveBhpcRequiredHeading, buildBhpcAcceptanceEntry, BHPC_PROTECTED_BUYER_PAGES, protectedBuyerPageBlockedReason} from '../lib/bhpc_agent_acceptance_parser.mjs';
import {reconcileBhpcAcceptanceRouteConflicts} from './compile_bhpc_agent_acceptance_manifest.mjs';
import {findBhpcAcceptanceRouteConflicts} from '../lib/bhpc_acceptance_invariants.mjs';

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



const aliQuery = "How can ChatGPT help me plan my day like Ali Abdaal's daily highlight method?";
const evidenceBackedPayload = parseVelocityJson({
  results: [{
    query: aliQuery,
    surfaces: {perplexity: {cited_sources: ['https://aliabdaal.com/newsletter/how-i-plan-my-day/']}}
  }],
  new_page_opportunities: [{query: aliQuery, recommended_cluster: 'competitor', why_worth_building: 'Build the evidence-backed comparison framework.'}]
}, 'bhpc', '2099-01-01');
const evidenceBackedSpec = evidenceBackedPayload.page_specs[0];
expect('page opportunity inherits source evidence from matching result row', evidenceBackedSpec?.evidence_inherited === true && evidenceBackedSpec?.evidence_urls?.includes('https://aliabdaal.com/newsletter/how-i-plan-my-day/'), JSON.stringify(evidenceBackedSpec));
expect('evidence-backed creator page remains admissible', evidenceBackedSpec?.operation === 'CREATE_NEW_TARGET_PAGE' && !evidenceBackedSpec?.blocked_reason, JSON.stringify(evidenceBackedSpec));

const bareDomainPayload = parseVelocityJson({
  results: [{query: aliQuery, surfaces: {perplexity: {cited_sources: ['aliabdaal.com/newsletter/how-i-plan-my-day/']}}}],
  new_page_opportunities: [{query: aliQuery, recommended_cluster: 'competitor', why_worth_building: 'Bare first-party domains are valid evidence locators.'}]
}, 'bhpc', '2099-01-01');
const bareDomainSpec = bareDomainPayload.page_specs[0];
expect('bare-domain first-party evidence is normalized and admitted', bareDomainSpec?.operation === 'CREATE_NEW_TARGET_PAGE' && bareDomainSpec?.evidence_urls?.some(url => /^https:\/\/aliabdaal\.com\//.test(url)), JSON.stringify(bareDomainSpec));

const unrelatedEvidencePayload = parseVelocityJson({
  results: [{query: aliQuery, surfaces: {perplexity: {cited_sources: ['https://example.com/unrelated-productivity-post']}}}],
  new_page_opportunities: [{query: aliQuery, recommended_cluster: 'competitor', why_worth_building: 'Creator attribution requires creator-domain evidence.'}]
}, 'bhpc', '2099-01-01');
const unrelatedEvidenceSpec = unrelatedEvidencePayload.page_specs[0];
expect('unrelated URL cannot satisfy creator-specific evidence requirement', unrelatedEvidenceSpec?.operation === 'BLOCKED_UNSUPPORTED_PERSON_ATTRIBUTION' && unrelatedEvidenceSpec?.evidence_required_domains?.includes('aliabdaal.com'), JSON.stringify(unrelatedEvidenceSpec));

const existingCreateFixtureRel = 'fixtures/agent_artifacts/cross_vertical_shape/existing-create-intent-self-test.html';
const existingCreateFixtureAbs = path.join(ROOT, existingCreateFixtureRel);
fs.writeFileSync(existingCreateFixtureAbs, '<!doctype html><title>existing create-intent fixture</title>');
const existingCreateRoute = resolveBhpcAgentRoute({
  query: 'Existing create intent must stay create',
  implementation_path: existingCreateFixtureRel,
  source_section: 'json_new_page_opportunities',
  source_intent_operation: 'CREATE_NEW_TARGET_PAGE',
  operation: 'CREATE_NEW_TARGET_PAGE'
});
fs.unlinkSync(existingCreateFixtureAbs);
expect('existing route preserves declared create intent on rerun', existingCreateRoute.status === 'DECLARED_CREATE_EXISTING' && existingCreateRoute.page_family !== 'intended_winner_repair', JSON.stringify(existingCreateRoute));

const unsupportedPayload = parseVelocityJson({
  results: [{query: aliQuery, surfaces: {perplexity: {cited_sources: []}}}],
  new_page_opportunities: [{query: aliQuery, recommended_cluster: 'competitor', why_worth_building: 'Build only when source evidence exists.'}]
}, 'bhpc', '2099-01-02');
const unsupportedSpec = unsupportedPayload.page_specs[0];
expect('unsupported creator page remains blocked', unsupportedSpec?.operation === 'BLOCKED_UNSUPPORTED_PERSON_ATTRIBUTION' && /source evidence/i.test(unsupportedSpec?.blocked_reason || ''), JSON.stringify(unsupportedSpec));

const conflictPath = 'answers/creator-evidence-conflict-self-test.html';
const reconciledConflict = reconcileBhpcAcceptanceRouteConflicts([
  {id:'conflict-required',record_id:'conflict-required',run_date:'2099-01-03',scope:'bhpc',implementation_path:conflictPath,acceptance_status:'REQUIRED',operation:'CREATE_NEW_TARGET_PAGE',route_status:'DECLARED_CREATE',blocked_reason:''},
  {id:'conflict-blocked',record_id:'conflict-blocked',run_date:'2099-01-03',scope:'bhpc',implementation_path:conflictPath,acceptance_status:'BLOCKED',operation:'BLOCKED_UNSUPPORTED_PERSON_ATTRIBUTION',route_status:'BLOCKED_SOURCE_ROW',blocked_reason:'creator-specific behavior claim lacks source evidence'}
]);
expect('conflicting acceptance rows use most-restrictive route state', reconciledConflict.every(entry => entry.acceptance_status === 'BLOCKED'), JSON.stringify(reconciledConflict));
expect('required duplicate inherits blocked reason instead of rendering', /source evidence/i.test(reconciledConflict.find(entry => entry.id === 'conflict-required')?.blocked_reason || ''), JSON.stringify(reconciledConflict));
const rawAcceptanceConflicts = findBhpcAcceptanceRouteConflicts([
  {id:'validator-required',run_date:'2099-01-03',scope:'bhpc',implementation_path:conflictPath,acceptance_status:'REQUIRED'},
  {id:'validator-blocked',run_date:'2099-01-03',scope:'bhpc',implementation_path:conflictPath,acceptance_status:'BLOCKED'}
]);
expect('standalone acceptance invariant detects REQUIRED/BLOCKED contradiction', rawAcceptanceConflicts.length === 1 && rawAcceptanceConflicts[0].required_ids.includes('validator-required') && rawAcceptanceConflicts[0].blocked_ids.includes('validator-blocked'), JSON.stringify(rawAcceptanceConflicts));
expect('reconciled acceptance entries contain no standalone contradiction', findBhpcAcceptanceRouteConflicts(reconciledConflict).length === 0, JSON.stringify(reconciledConflict));

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

// A retired URL the site 301s is resolved to the page a reader lands on.
// 2026-09-26: row 020 targeted insights/how-to-end-the-day-so-tomorrow-starts-
// fast-2.html (deleted 2026-04-06, 301'd by _redirects) and the resolver made
// it a CREATE for a retired page, which validate:bhpc-seo-execution refused and
// Spry Content Release run 36245892727 stopped on.
const siteRedirects = loadExactSiteRedirects();
expect('site redirects are read (Rule 0: a resolver with no rules proves nothing)', siteRedirects.size > 100, `rules=${siteRedirects.size}`);
expect('retired -2 insight resolves through its 301 to the canonical page',
  repoPathFromIntendedWinnerPage('https://spryexecutiveos.com/insights/how-to-end-the-day-so-tomorrow-starts-fast-2.html') === 'insights/how-to-end-the-day-so-tomorrow-starts-fast.html');
expect('retired extensionless form resolves the same way',
  repoPathFromIntendedWinnerPage('https://spryexecutiveos.com/insights/how-to-end-the-day-so-tomorrow-starts-fast-2') === 'insights/how-to-end-the-day-so-tomorrow-starts-fast.html');
const fixtureRules = new Map([
  ['/download.html', '/insights/how-to-end-the-day-so-tomorrow-starts-fast'],
  ['/selftest-chain-a.html', '/selftest-chain-b'],
  ['/selftest-chain-b', '/insights/how-to-end-the-day-so-tomorrow-starts-fast'],
  ['/selftest-loop-a.html', '/selftest-loop-b'],
  ['/selftest-loop-b', '/selftest-loop-a.html'],
  ['/selftest-dead.html', '/selftest-nowhere'],
]);
const redirectCases = {
  existing_file_is_never_redirected: repoPathThroughSiteRedirect('download.html', fixtureRules),
  chain_followed_to_a_real_file: repoPathThroughSiteRedirect('selftest-chain-a.html', fixtureRules),
  loop_returns_original: repoPathThroughSiteRedirect('selftest-loop-a.html', fixtureRules),
  dead_target_returns_original: repoPathThroughSiteRedirect('selftest-dead.html', fixtureRules),
  no_rule_returns_original: repoPathThroughSiteRedirect('selftest-no-rule.html', fixtureRules),
};
expect('an existing file keeps resolving to itself', redirectCases.existing_file_is_never_redirected.path === 'download.html' && !redirectCases.existing_file_is_never_redirected.redirected_from);
expect('a redirect chain is followed to the file that answers it', redirectCases.chain_followed_to_a_real_file.path === 'insights/how-to-end-the-day-so-tomorrow-starts-fast.html' && redirectCases.chain_followed_to_a_real_file.redirected_from === 'selftest-chain-a.html');
expect('a redirect loop returns the original path', redirectCases.loop_returns_original.path === 'selftest-loop-a.html' && !redirectCases.loop_returns_original.redirected_from);
expect('a redirect to a missing page returns the original path', redirectCases.dead_target_returns_original.path === 'selftest-dead.html');
expect('no rule returns the original path', redirectCases.no_rule_returns_original.path === 'selftest-no-rule.html');
const tmpRedirects = path.join(ROOT, '.validation-runtime', 'selftest-redirects');
fs.mkdirSync(path.dirname(tmpRedirects), {recursive: true});
fs.writeFileSync(tmpRedirects, '# comment\n/a /b 302\n/c/* /d 301\n/e/:slug /f 301\n/g /h 301\n/g /i 301\n/j /k\n');
const parsedFixture = loadExactSiteRedirects(tmpRedirects);
fs.rmSync(tmpRedirects, {force: true});
expect('only exact permanent rules are read, first match wins', parsedFixture.size === 1 && parsedFixture.get('/g') === '/h', JSON.stringify([...parsedFixture]));

// Protected buyer pages are BLOCKED at acceptance, whatever the artifact asks.
// download.html was always here; product.html (the "Product alias route") was
// not, and on 2026-09-26 four REPAIR rows rewrote it and turned the release
// commit red. Both pages are pinned, product.html by name, and a real
// unprotected page is the control so the assertion cannot pass by blocking
// everything.
const protectedBuyerCases = BHPC_PROTECTED_BUYER_PAGES.map((page) => {
  const entry = buildBhpcAcceptanceEntry({
    id: `selftest-protected-${page}`,
    run_date: '2099-01-04',
    scope: 'bhpc',
    query: 'what do you get with the product',
    action_tier: 'page fix',
    primary_fix_type: 'completeness',
    operation: 'REPAIR_INTENDED_WINNER_PAGE',
    intended_winner_page: `https://billionairehighperformancecoach.com/${page}`,
    fix_recommendation: 'Add a direct answer, a comparison table and a definition callout to the page.'
  }, {run_date: '2099-01-04', scope: 'bhpc'});
  return {page, implementation_path: entry.implementation_path, acceptance_status: entry.acceptance_status, blocked_reason: entry.blocked_reason};
});
expect('product.html is a protected buyer page by name', BHPC_PROTECTED_BUYER_PAGES.includes('product.html') && BHPC_PROTECTED_BUYER_PAGES.includes('download.html'), JSON.stringify(BHPC_PROTECTED_BUYER_PAGES));
for (const c of protectedBuyerCases) {
  expect(`${c.page}: a REPAIR row resolves onto the protected page itself`, c.implementation_path === c.page, JSON.stringify(c));
  expect(`${c.page}: acceptance is BLOCKED by the protected buyer page contract`, c.acceptance_status === 'BLOCKED' && c.blocked_reason === protectedBuyerPageBlockedReason(c.page) && /^PROTECTED_BUYER_PAGE_CONTRACT:/.test(c.blocked_reason), JSON.stringify(c));
}
expect('download.html keeps the reason string every committed acceptance manifest already carries', protectedBuyerPageBlockedReason('download.html') === 'PROTECTED_BUYER_PAGE_CONTRACT:no_visible_agent_or_citation_injection_on_download');
const unprotectedControl = buildBhpcAcceptanceEntry({
  id: 'selftest-unprotected-control',
  run_date: '2099-01-04',
  scope: 'bhpc',
  query: 'common objections and fit questions',
  action_tier: 'page fix',
  primary_fix_type: 'completeness',
  operation: 'REPAIR_INTENDED_WINNER_PAGE',
  intended_winner_page: 'https://billionairehighperformancecoach.com/faq',
  fix_recommendation: 'Add a direct answer and a definition callout to the page.'
}, {run_date: '2099-01-04', scope: 'bhpc'});
expect('an unprotected existing page stays REQUIRED (the block is not blanket)', /^faq(\/index)?\.html$/.test(unprotectedControl.implementation_path) && fs.existsSync(path.join(ROOT, unprotectedControl.implementation_path)) && !BHPC_PROTECTED_BUYER_PAGES.includes(unprotectedControl.implementation_path) && unprotectedControl.acceptance_status === 'REQUIRED', JSON.stringify({path: unprotectedControl.implementation_path, status: unprotectedControl.acceptance_status, reason: unprotectedControl.blocked_reason}));

const report = {
  schema_version: '1.0',
  validator: 'bhpc-route-resolution-self-test',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  cases: {redirectCases, unambiguousTitleTypo, ambiguousTitleTypo, existingPathTypo, newPageSpec, evidenceBackedSpec, bareDomainSpec, unrelatedEvidenceSpec, existingCreateRoute, unsupportedSpec, reconciledConflict, rawAcceptanceConflicts, semantic_group_count: semanticGroups.length, derived_heading: derivedHeading},
  errors
};
writeJson('artifacts/validation/bhpc-route-resolution-self-test.json', report);
writeJson('reports/bhpc-route-resolution-self-test.json', report);
if (errors.length) {
  console.error(`[bhpc-route-resolution-self-test] FAIL: ${errors.length} issue(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log('[bhpc-route-resolution-self-test] PASS: route resolution, strict evidence provenance, create-intent reruns, conflict blocking, semantic grouping, family block requirements, and heading extraction');
