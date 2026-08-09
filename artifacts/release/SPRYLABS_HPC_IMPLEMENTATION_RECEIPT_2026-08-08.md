# Sprylabs HPC — Full Implementation Receipt

Date: 2026-08-08
Repo: `seq23/sprylabs-hpc-site`
Source ZIP SHA-256: `c22cfbaf407b35fb3544908bd4814f46da9c473d3cf26dd8834d92589c650063`
Artifact mode: full baseline snapshot

## Implemented

1. **Working-tree reorganization**
   - Canonical public source moved from root sprawl to `site/public/`.
   - Generated deployment-ready mirror is `dist/`.
   - Root reduced from 373 entries in the supplied source ZIP to 36 control/deployment entries in the implementation workspace.
   - Existing Cloudflare repository-root output remains compatible through root `_redirects` and `_headers` shims; Pages Functions remain in root `functions/`.
   - The former root-tree aesthetic validator is retired and removed from active validation governance. Route/source/deploy parity replaces it.

2. **Synthesis differentiation**
   - The supplied source ZIP contains 36 `synthesis-*.html` pages and a 36-item synthesis manifest. The audit's 162-page count is not present in this source snapshot.
   - All 36 source-truth synthesis pages were rewritten through explicit differentiation profiles.
   - Rendered visible-text trigram similarity proof: maximum Jaccard `0.6324324324324324`, below the admitted `0.72` ceiling.
   - Future synthesis rendering uses the differentiated profile system rather than noun/token swaps.

3. **Passwordless `/admin/` with real aggressiveness control**
   - `/admin/` has no password/login gate by owner direction.
   - Existing server-side GitHub action allowlist remains bounded.
   - Normal / Aggressive / Maximum now control the actual velocity governor envelope: 25 / 75 / 150 URLs/day maximum tiers.
   - Aggressiveness cannot bypass evidence, duplication, content, or hard validation gates.

4. **Independent SEO/AEO/GEO search-intelligence lane**
   - Separate `scripts/search_intelligence/`, `data/search_intelligence/`, workflow, receipts, provider truth boundaries, self-heal, retest, and rollback evidence.
   - 120 target queries are mapped to existing non-agent-owned pages by page title/H1/canonical relevance.
   - GSC is authoritative for own-site impressions/clicks/CTR/average position.
   - Grounded search is recorded as observation evidence, never represented as literal numeric SERP rank.
   - Provider unavailable/degraded is never green and produces no speculative repair.
   - Repairs are bounded to existing non-agent pages, maximum 5/run, with no new URL and no publishing-cadence mutation.
   - Workflow is an admitted governed mutation lane using the repo's reset-regenerate-validate-recommit helper.

5. **`/agency/` operator surface**
   - Passwordless noindex operator page showing target query, owned surface, GSC truth, grounded/AEO observations, referenced domains, diagnosis/confidence, self-heal/rollback, and retest outcome.
   - Explicitly states and enforces separation from AI-agent intake.

6. **Remaining approved audit repairs**
   - `postdeploy-public-audit.yml` now automatically runs after successful `Deploy Distribution` and remains manually dispatchable.
   - Four known visible repair artifacts are corrected through a separate post-render repair guard outside AI-agent intake.
   - Cadence documentation distinguishes the weekly external agent-artifact lane from daily in-repo release automation.
   - `aggressiveness` is retained and activated rather than retired.

## AI-agent preservation proof

Protected boundary:
- `scripts/agent_intake/**`
- `data/report_fixes/agent_runs/**`
- `data/report_fixes/normalized_agent_runs/**`
- `data/report_fixes/agent_acceptance_manifests/**`

Result: **68 files before / 68 files after / 0 changed / 0 missing**.

Canonical machine-readable proof: `artifacts/release/SPRYLABS_PROTECTED_AGENT_PRESERVATION_PROOF_2026-08-08.json`.

## Explicitly not implemented

- No fallback-admin-password remediation.
- No credential rotation.
- No additional security-header project.
- No dependency-security project.
- No rewrite/refactor of AI-agent intake, acceptance, absorb, exact-apply, or trace code/data.
- No query self-healing through the AI-agent lane.
- No fabrication of 126 synthesis pages absent from the supplied ZIP.

## Validation boundary

Targeted artifact-workspace structural/contract checks are recorded during build. Full governed local validation, browser proof, commit/push, exact-SHA CI, and deployment verification remain the responsibility of the local v3.1 updater lifecycle.
