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
