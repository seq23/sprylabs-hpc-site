# Hostile Compiler Review — BHPC Agent Coverage Repair v5

Generated: 2026-07-04
Repo: `sprylabs-hpc-site`

## Verdict

v5 addresses the actual failure that stopped the local updater: the two new validator commands are now admitted by the validation registry and matrix. It also hardens the root agent-ingestion path so future source recommendations cannot silently disappear.

## Hostile findings and outcomes

### 1. Registry admission failure

**Finding:** v4 added two commands to `package.json` without admitting them in `_validation_registry.json` / `_repo_validation_matrix.json`.

**Outcome:** Fixed. `validate:validation-registry` passes with 119 records and 118 matrix entries.

### 2. Silent source drop risk

**Finding:** Prior workflow allowed source recommendations to exist in `bhpc.json`/`bhpc.html` while disappearing from processed outputs.

**Outcome:** Fixed with `validate:bhpc-agent-source-coverage`. Current report status: `PASS`. Missing normalized count: `0`. Unaddressed count: `0`. Missing proof markers: `0`.

### 3. Recommendation shape rigidity

**Finding:** v3/v4 improved coverage but still risked shape-contracted public output.

**Outcome:** Fixed with `agent_directive` implementation and `validate:bhpc-agent-recommendation-driven-output`. Checked recommendations: `429`. Errors: `0`.

### 4. Misspelled page titles/routes

**Finding:** Exact title/URL matching can fail if an agent misspells a route.

**Outcome:** Fuzzy route resolution is included and self-tested. It resolves high-confidence known-route typos, blocks ambiguity, and preserves explicit new-page intent.

### 5. Duplicate handling

**Finding:** Source records may duplicate concept/page targets; public pages must not duplicate implementation blocks.

**Outcome:** Source record preservation remains individual; canonical public targets are deduped. Date-stamped fallback page generation prevents daily title/query collision.

### 6. New-page opportunity execution

**Finding:** Prior workflow modified existing pages but built zero new HTML pages from the 7/4 opportunities.

**Outcome:** Source coverage report now requires canonical new-page targets to be built or explicitly queued/blocked. Current report shows `10` new-page source records, `5` canonical new-page targets, `5` built, `0` missing.

### 7. Browser validation fallback

**Finding:** Browser availability can be fragile locally/CI.

**Outcome:** Real structural browser validation passed. A browserless mock backup also passed, and it is explicitly labeled non-browser proof (`real_browser_proof=false`).

## Validation result

Passed:
- validation registry
- agent-run validation
- content-release validation
- workflow topology/lineage/monitor/contract validation
- citation strategy validation
- claim safety
- llms full coverage
- sitemap coverage
- browser structural
- browserless mock backup

Wrapper caveat:
- Exact `release:prepush:container` was attempted, but the container tool timed out inside the long wrapper. Component gates were isolated and passed. Local updater still must run the exact wrapper.

## Residual risk

- Generated fallback pages are below former word-count guidance; this is warning-only.
- External AI citation pickup cannot be proven until after deployment and subsequent citation monitoring.

## Status

STRUCTURALLY CHECKED + DEEP COMPONENT VALIDATED — LOCAL UPDATER REQUIRED
