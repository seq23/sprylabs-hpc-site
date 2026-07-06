# Architectural Decisions

### Decision ID: ADM-2026-06-18-01
- **Date:** 2026-06-18
- **Status:** Accepted
- **Context:** The repository mixed content generation, repair, scoring, warnings, and 60+ checks in one flat validation path.
- **Decision:** Separate mutation into `build:all`; expose eight read-only validation lanes; govern checks through `_validation_registry.json` and `_repo_validation_matrix.json`.
- **Alternatives Considered:** Keep the flat script; remove legacy validators entirely.
- **Reasoning:** The selected path simplifies operator commands while preserving established domain and publishing assertions.
- **Tradeoffs:** The legacy content lane remains internally broad until assertions are progressively consolidated.
- **Risks Accepted:** Some historic checks are maintained as a grouped compatibility lane.
- **Validation Impact:** Tier 1 registry, matrix, citation, content, graph, distribution, UI parity, and browser-contract gates.
- **Future Reversal Conditions:** Consolidate the legacy lane further only after assertion-level parity is proven.

### Decision ID: ADM-2026-06-18-02
- **Date:** 2026-06-18
- **Status:** Accepted
- **Context:** The site needs extractable pages without replacing existing substance.
- **Decision:** Add a named opening definition, one semantic extraction block, short prose groups, and a product anchor to every registered editorial page; keep 24 priority pages under explicit owner-authored specifications.
- **Alternatives Considered:** Rewrite all pages; optimize only the 24 priority pages.
- **Reasoning:** Structural retrofit preserves the library while making the full corpus machine-readable.
- **Tradeoffs:** Legacy pages use conservative H1-derived framework names until future editorial refinement.
- **Risks Accepted:** Structural consistency is proven; external LLM citation remains unproven until observed.
- **Validation Impact:** Full citable-page registry and route-complete browser contract.
- **Future Reversal Conditions:** Replace a legacy definition only with an approved, page-specific canonical framework.

### Decision ID: ADM-2026-06-18-03
- **Date:** 2026-06-18
- **Status:** Accepted
- **Context:** Owner approved a complete 46-surface manual search expansion and required every new or materially rebuilt page to satisfy the future programmatic publishing gate immediately.
- **Decision:** Build the 46-page reference set from machine-readable page specifications, preserve prior exact acceptance commitments on overlapping pages, enforce one-query/one-owner routing, emit retired URLs as noindex redirect stubs, and admit one consolidated `validate:page-admission` gate. Future programmatic publishing remains capped at ten pages per admitted batch and must inherit the same quality contract.
- **Alternatives Considered:** Publish keyword-swapped pages directly; retrofit rendered HTML after every build; delay quality admission until the later programmatic phase.
- **Reasoning:** Source-first specifications preserve content across rebuilds, exact ownership prevents cannibalization, and one admitted gate controls quality without validator sprawl.
- **Tradeoffs:** Manual pages contain more explicit source and acceptance metadata, and publication requires a stronger upfront content specification.
- **Risks Accepted:** Search performance and external LLM citation remain observational outcomes rather than release guarantees.
- **Validation Impact:** Universal citation validation across all active pages; exact acceptance and programmatic admission across 46 manual targets; 24 browser checks remain fixed.
- **Future Reversal Conditions:** Increase the programmatic batch ceiling only after indexed pilot pages show distinct query matching, no cannibalization, and sustained usefulness.

### Decision ID: ADM-2026-06-18-01
* **Date:** 2026-06-18
* **Status:** Accepted
* **Context:** The citation registry declared page types, but the final post-build HTML could diverge: blanket FAQ and Product/SoftwareApplication schema appeared on unrelated pages, HowTo steps lacked visible IDs, Breadcrumb nodes added invisible hierarchy, and some schema URLs used the wrong domain.
* **Decision:** Compile page-appropriate JSON-LD from the final visible HTML. Emit FAQPage only for visible exact-match FAQs, HowTo only for genuine visible procedures, BreadcrumbList only for visible hierarchy, Article only for editorial pages with truthful bylines and dates, Product only on genuine product surfaces, and Organization/Person/WebSite on their real entity pages. Admit a final-render parity validator as a hard release gate.
* **Alternatives Considered:** Preserve blanket schema for all pages; trust source registries without validating final HTML; maintain separate competing schema scripts.
* **Reasoning:** Final visible HTML is the only reliable parity authority after generators and post-build transforms. One deterministic final graph reduces drift and misleading structured data while keeping the release suitable for the 8 GB local machine.
* **Tradeoffs:** More final-render parsing and validation time; fewer schema types on pages that do not visibly support them.
* **Risks Accepted:** Some legacy pages remain WebPage rather than Article until they gain truthful editorial metadata; rich-result eligibility is not guaranteed.
* **Validation Impact:** `validate:rendered-schema-parity` is a Tier 1 HARD FAIL and the browser sample checks premium visible surfaces on desktop and mobile.
* **Future Reversal Conditions:** Reconsider only if schema.org or search-engine guidance materially changes, or the site adopts a CMS that supplies equally strict final-render parity.

### Decision ID: ADM-2026-06-18-05
* **Date:** 2026-06-18
* **Status:** Accepted
* **Context:** The GEO schema release expanded validation, but the GitHub Actions layer was only checked for file admission. Hostile workflow simulation found distribution could run before the full gate, `execution:strict` validated before citation normalization, Reddit credentials were scoped to the wrong step, generated untracked files could be skipped by the commit helper, and a post-validation rebase could push unvalidated state.
* **Decision:** Admit `validate:workflow-contract` as a Tier 1 hard gate; require Node 24 and a 3072 MB heap in every workflow; require canonical prepush before mutation commits or distribution; make Reddit credentials available to fetch steps; remove static-page secret injection; include all workflows and helpers in artifact hash parity; and revalidate/amend after any automated rebase.
* **Alternatives Considered:** Rely on GitHub to surface workflow failures after deployment; validate only `validate.yml`; leave push races to retry behavior.
* **Reasoning:** CI and scheduled automation are production code. Their command ordering, credential scope, and push semantics must be proven before the ZIP reaches the updater.
* **Tradeoffs:** Slightly more static validation and a second prepush only when a remote race forces a rebase.
* **Risks Accepted:** Live GitHub-hosted execution still depends on GitHub availability and repository secrets; local simulation cannot prove those external services.
* **Validation Impact:** `validate:workflow-contract` is registered as VAL-050/MX-050; all ten workflow mutation commands and the distribution dry-run are exercised before packaging.
* **Future Reversal Conditions:** Retire the custom workflow contract only if an equally strict admitted workflow linter and race-safe release mechanism replace it.

## ADR — Unified programmatic page admission

**Date:** 2026-06-18  
**Status:** Accepted

All workflow-generated public pages are candidates until they pass a lane-specific programmatic admission profile. The permanent registry is `data/content/page_admission_registry.json`; rejected candidates are removed from public output and recorded in `data/programmatic/rejection_backlog.json`. The manual 55-page corpus remains the full-quality reference set, while baseline legacy pages remain registered without being falsely represented as newly reviewed programmatic pages.

## ADR — Registry-driven redirect normalization

**Date:** 2026-06-18  
**Status:** Accepted

`data/content/manual_redirects.json` is the only redirect source. `scripts/content/apply_redirect_map.mjs` normalizes absolute, root-relative, and file-relative internal references after content generation. `validate:retired-route-references` prevents active source or final output from linking to redirect sources, chains, loops, or missing targets.

## ADR — Single validated distribution artifact

**Date:** 2026-06-18  
**Status:** Accepted

Validate builds once, runs the complete CI profile, verifies build idempotence, and uploads a commit-bound artifact with a hash attestation. Deploy Distribution is triggered by the successful Validate run and verifies that artifact before IndexNow submission. Manual deployment executes the same validation profile first.

### Decision ID: ADM-2026-06-18-06
* **Date:** 2026-06-18
* **Status:** Accepted
* **Context:** The first unified programmatic gate declared three strategic axes but did not fully enforce their hardest distinctions. Entity/use-case pages could still be entity-swapped clones, comparison pages could omit official-source mapping and conflict disclosure, question pages could publish equivalent direct answers, and build parity was tested only inside one workspace.
* **Decision:** Keep one programmatic admission command, but enforce axis-specific rules inside it: entity-substitution similarity, query and alias collision checks, comparison entity/source mapping, visible conflict disclosure, verified dates, and direct-answer equivalence. Upgrade clean-rebuild parity to compare the canonical validated full build with a second full build in an isolated copied source tree.
* **Alternatives Considered:** Add three separate validators; rely on manual review; preserve same-workspace idempotence as sufficient proof.
* **Reasoning:** One admitted validator avoids permanent validator sprawl while turning the declared programmatic policies into executable release law. An isolated source copy is the closest artifact-safe equivalent to a clean clone when the delivery ZIP intentionally contains no `.git` directory.
* **Tradeoffs:** Candidate records require more evidence fields, comparison generation requires visible review/disclosure metadata, and CI performs one additional isolated build after the canonical validated build.
* **Risks Accepted:** CI can verify official-source mapping and freshness metadata but cannot prove every provider claim remains current without the scheduled research refresh process.
* **Validation Impact:** `validate:programmatic-admission` hard-fails entity swaps, unsourced comparisons, answer-equivalent question pages, and query collisions. `validate:clean-rebuild-parity` hard-fails either validated-tree/clean-copy drift or second-build nondeterminism.
* **Future Reversal Conditions:** Split the validator only if one axis becomes operationally independent enough to justify its own admitted lifecycle and maintenance cost.

### Decision ID: ADM-2026-06-19-01
* **Date:** 2026-06-19
* **Status:** Accepted
* **Context:** Content Authority Pipeline, Daily Insight, and Execution Strict all rebuild existing public pages through the shared programmatic lane runner. The runner inferred every changed page's generation lane from the currently executing workflow. When canonical build steps refreshed previously admitted manual reference pages, accepted candidates were silently rewritten from `manual` to `authority` or `daily_insight`. The final registry validator then failed with `manual reference page not full-admitted`.
* **Decision:** Existing admitted pages retain their original admission lane, level, source, and admitted timestamp when a workflow rebuilds their HTML. New pages use the active workflow lane. The three affected workflows now execute through a governed wrapper that emits input/output lineage, a durable trace artifact, hostile review, and monitor validation before any generated commit.
* **Alternatives Considered:** Excluding manual pages from candidate detection; weakening the manual-page registry validator; bypassing final validation; treating each workflow separately. These were rejected because they hide legitimate changes, reduce proof, or duplicate the same defect across workflows.
* **Reasoning:** Provenance belongs to the page's admission contract, not to whichever workflow happened to rebuild the file. One shared correction repairs all three workflows while preserving independent candidate quality validation.
* **Tradeoffs:** Workflow runs produce additional ignored trace artifacts and perform a small extra file-hash snapshot. The live monitor will intentionally fail while a governed workflow's latest completed run remains failed or stale.
* **Risks Accepted:** File-pattern lineage cannot prove semantic correctness by itself; canonical validators and representative Playwright coverage remain required. GitHub live-run monitoring depends on Actions API availability.
* **Validation Impact:** Focused provenance regression, workflow contract validation, workflow lineage validation, hostile review, runtime trace validation, 24 representative Playwright checks, local updater validation, and GitHub Actions reruns.
* **Future Reversal Conditions:** Reconsider only if the repository adopts a different immutable page-identity model or replaces generated HTML snapshots with a transactional content registry that records provenance outside the page admission record.

## ADR — 2026-07-03 — BHPC Agent Artifact Semantic Acceptance

Decision: BHPC agent artifact rows are now governed by an automatic semantic acceptance compiler. The compiler converts each normalized row into route/page-family decisions, required visible strings, required block types, and rendered proof expectations.

Reason: The prior exact implementation pipeline could pass with marker/query presence. That created false confidence because a page could contain `Agent Exact Citation Repair` without implementing the actual recommendation.

Consequence: Marker-only proof is invalid. Fallback gap-fill pages remain allowed for cadence but cannot count as exact agent implementation.

## ADR — 2026-07-06 — Baseline Snapshot Reentry and Active Agent Scope

Decision: Baseline snapshot commits are allowed to contain already-absorbed raw agent manifests, but push-triggered `spry-content-release` must skip commits whose message contains `snapshot update from baseline ZIP`. Recommendation-driven output validation checks acceptance IDs in the active non-blocked exact implementation plan and reports cumulative manifest entries outside that plan as skipped.

Reason: A full repo snapshot is an application event, not a fresh agent artifact event. Reprocessing an already-applied snapshot can compare current/batch evidence against cumulative acceptance data and fail for stale reasons.

Consequence: Manual and scheduled release runs remain available, raw artifacts remain preserved, and active-plan validation stays strict for the implementation pass actually being applied.

## ADR — 2026-07-06 — Metadata Hygiene Severity

Decision: Duplicate meta descriptions are warning-level metadata hygiene. They do not block baseline application unless accompanied by correctness failures such as duplicate titles, missing metadata, canonical mismatch, wrong domain, missing schema, mojibake, or broken required links.

Reason: Duplicate descriptions are worth fixing, but they are not equivalent to broken routing, schema, canonical identity, or content integrity.

Consequence: The release gate still protects page correctness while avoiding failed baseline updates for a low-risk SEO copy collision.
