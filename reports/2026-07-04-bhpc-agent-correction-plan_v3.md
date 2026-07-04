# 2026-07-04 BHPC Agent Coverage Repair v3 — Implementation Plan + File Change Map

## Objective

Fix the root ingestion problem so future BHPC/Spry agent runs cannot silently drop recommendations, cannot skip new-page opportunities, and cannot create duplicate/misspelled pages when an agent mistypes a known page title or URL.

## Incident Summary

The 2026-07-04 source artifact contained actionable recommendations that were not preserved downstream. In particular, nested JSON recommendations such as `Energy-Aligned Time Block` and `One Winning Move` were present in the raw artifact but absent from normalized outputs and target pages. The same run also contained new-page opportunities that were not built in the workflow output.

## Root Causes Fixed

1. **Nested recommendation parsing gap**
   - The normalizer previously handled flat recommendation strings better than nested objects.
   - v2/v3 preserve nested `fix_recommendation.current_state`, `gap`, and `edit_instruction`.

2. **No source-to-output coverage gate**
   - Prior validation could pass even when source recommendations disappeared.
   - v2/v3 require every source record to be normalized, accepted/planned/applied/skipped, and represented with page-level proof.

3. **Duplicate public rendering**
   - Duplicate source records must be preserved, but duplicate visible page sections should not be rendered repeatedly.
   - v2 groups public sections by canonical query + implementation path while keeping hidden source record markers for each source row.

4. **Misspelled route/title risk**
   - v2 still relied too heavily on exact query/title/path matching.
   - v3 adds typo-tolerant route resolution with high-confidence fuzzy matching and ambiguity blocking.

## v3 Route-Resolution Policy

When an agent misspells a title, query, or URL:

1. If the intended path exists exactly, repair that page.
2. If the intended path does not exist but is a high-confidence typo of exactly one existing page, repair the existing page.
3. If the query is a high-confidence typo of an active query-registry entry, repair that active page.
4. If multiple pages tie or nearly tie, block the route with `BLOCKED_AMBIGUOUS_FUZZY_ROUTE` instead of creating a duplicate.
5. If the record is explicitly a new-page spec, preserve the generated new-page route and do not fuzzy-route it into an existing page.

## Permanent Validation Contract

Future validation must require all source artifact items to be addressed:

- every raw source record normalized
- every source ID accepted/planned/applied/skipped
- every non-skipped source ID has a page-level proof marker
- every canonical new-page target exists as HTML
- duplicate source records are preserved as source records but deduped for public rendering
- route typo self-test passes before agent-run validation

## File Change Map

### `scripts/agent_intake/bhpc_agent_common.mjs`
- Preserves nested recommendation objects.
- Parses JSON `results`, `page_fixes`, `wins`, `pending`, and `new_page_opportunities`.
- Builds canonical page specs from source opportunities.

### `scripts/lib/bhpc_agent_route_resolver.mjs`
- Adds typo-tolerant route resolution.
- Uses high-confidence similarity matching for misspelled intended URLs and query registry titles.
- Blocks ambiguous fuzzy matches instead of creating duplicate pages.
- Preserves explicit new-page specs so they are built rather than accidentally merged into existing pages.

### `scripts/agent_intake/self_test_bhpc_route_resolution.mjs`
- New self-test proving:
  - misspelled query title resolves to the active page
  - misspelled intended URL slug resolves to the existing page
  - explicit new-page specs do not fuzzy-route into existing pages

### `scripts/lib/bhpc_agent_acceptance_parser.mjs`
- Adds route-resolution metadata to acceptance entries.
- Keeps record-level source proof and route decision visible in reports.

### `scripts/agent_intake/build_bhpc_agent_exact_implementation_plan.mjs`
- Groups duplicate source records by operation + implementation path.
- Preserves all source record IDs for coverage.

### `scripts/agent_intake/apply_bhpc_agent_exact_implementation.mjs`
- Renders one visible semantic repair section per canonical page/query group.
- Adds hidden `data-bhpc-agent-record` markers for all deduped source records.
- Cleans duplicate legacy agent sections before applying current grouped sections.

### `scripts/validators/validate_bhpc_agent_source_coverage.mjs`
- Permanent validation gate.
- Fails if any source artifact recommendation is missing from normalized output, unaddressed, or lacks page proof.
- Fails if canonical new-page targets are missing.

### `package.json`
- Adds `agent:bhpc:self-test-route-resolution`.
- Adds route self-test to `validate:agent-run` before acceptance compilation.

### 7/4 content corrections
- Adds `Energy-Aligned Time Block` to `insights/how-to-use-time-blocks-to-buy-back-your-week.html`.
- Adds `One Winning Move` to `insights/how-to-pick-the-one-move-that-makes-the-rest-easier.html`.
- Builds canonical new pages from the 7/4 new-page source records.

## Validation Evidence

Executed in artifact worktree:

- `npm run agent:bhpc:self-test-route-resolution` — PASS
- `npm run validate:agent-run` — PASS
- `npm run validate:bhpc-rich-new-page-contract` — PASS
- `npm run validate:browser-structural` — PASS

Coverage report after v3:

- source records: 225
- new-page source records: 10
- canonical new pages: 5
- missing from normalized: 0
- unaddressed: 0
- missing page-level proof markers: 0
- missing built new pages: 0

## Remaining Boundary

This proves repository processing and static page creation. It does not prove that external AI/search systems will cite the pages after deployment; that requires later external observation.
