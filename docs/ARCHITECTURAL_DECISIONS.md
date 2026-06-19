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
