# Hostile E2E Review — 2026-07-10

## Scope

Full repository review of the Spry HPC autonomous authority engine, paid-agent lane, $0 lane, admin GitHub bridge, validators, workflows, public route graph, schema parity, conversion paths, and packaging.

## Proven defects fixed

1. Private `/admin` pages were incorrectly treated as public indexable authority pages by multiple validators.
2. The generated admin page contained two H1 elements.
3. The compatibility admin redirect lacked explicit `noindex` markup.
4. The required `/coverage/` route was absent even though public pages and manifests referenced it.
5. The schema repair pipeline had not been applied consistently, leaving FAQ and citation schema mismatches.
6. Paid-agent exact apply could reintroduce FAQ parity defects because schema parity was not part of the owner-lane finalization sequence.
7. Public conversion validators incorrectly required commercial CTAs on private admin surfaces.
8. The admin GitHub bridge lacked a direct mocked E2E integration validator.
9. Invalid admin action IDs returned a generic upstream error instead of a bounded client error.
10. GitHub repository configuration accepted any non-empty string instead of a validated owner/repo shape.

## Fixes

- Added private-noindex recognition to public validators.
- Corrected admin heading structure and redirect markup.
- Regenerated `coverage/index.html` and coverage data.
- Repaired schema parity across eligible pages.
- Added schema parity to the paid-agent exact-finalization path.
- Excluded noindex surfaces from conversion-floor validators.
- Added `validate:admin-github-bridge` with mocked login, session, allowlist, injection, dispatch, status, commit, and deployment-receipt proof.
- Added registry and validation-matrix admission for the new integration validator.
- Hardened GitHub repository configuration validation.
- Changed unknown admin actions to return HTTP 400.

## Validation result

Passed:

- Full Safe Autonomy
- Paid-agent exact-plan/apply/trace/validate
- Schema/GEO parity
- Citation strategy
- Claim safety
- LLM coverage
- Sitemap coverage
- Internal links
- Dual-domain contract
- Conversion floors
- Workflow contract/topology/fixtures
- Validation registry
- Admin GitHub bridge mocked E2E
- ZIP integrity and root packaging

## Browser limitation

The Playwright suite could not execute in this container because the required Chromium binary was absent and the environment could not reach the Playwright download host. Browser structural validation passed. Local updater or CI must run the 24-test Playwright suite with Node 24 and the browser installed.
