# Build Generator Graph

## Law

`npm run build:all` has never had its generator dependency graph written
down. Its absence is why the pipeline brute-forces convergence: nothing knows
what feeds what, so `converge_tree_before_commit.sh` re-runs the whole chain
up to `CONVERGE_MAX_PASSES` times and asks a guard whether anything moved,
instead of running only the generators a given change could possibly affect.

This document is the graph as it actually exists today, read out of
`package.json` and the generator scripts themselves — not a redesign. It is
evidence-based (each edge below is either the literal `&&` order in
`package.json`, or a confirmed read/write in the named script), and it says
plainly where it stops being provable.

## The chain, in the order `build:all` actually runs it

`build:all` = `build:all:uncached` (see `scripts/build/cached_build_all.sh`
for the cache wrapper; this graph describes what it wraps):

1. `build:generated-content`
   1. `intake` — `build_query_universe.js`, `run_ingestion.js`,
      `collect_queries.js`, `cluster_queries.js`
   2. `scoring` — `score_queries.js`
   3. `backlog` — `build_backlog.js`
   4. `fanout:auto` — `auto_expand_fanout.js`
   5. `answer:all` — observe → score → dashboard → backlog
   6. `backlog:build` — `build_from_scores.js`
   7. `build_insights.js`
   8. `build:authority` — `build_authority_papers.js`
   9. `repair/auto_expand_short_pages.js`
   10. `repair/auto_repair_generated_page_ranges.js`
   11. `answer_surface/update_score_history.js`
   12. `answer_surface/build_weakness_backlog.js`
   13. `build:manual-expansion` — `build_manual_expansion_pages.mjs`
2. `build:postprocess`
   1. `redirects:apply`
   2. `build_knowledge_map.js`
   3. `authority/compute_authority_scores.js`
   4. `internal/build_link_graph.js`
   5. `citation/apply_citation_program.py --postbuild`
   6. `citation/sync_citation_phase_metadata.mjs`
   7. `redirects:apply` (again)
   8. `prepare_distribution_artifacts.js`
   9. `validate:indexnow-batch-budget`
   10. `citation:build` — `build_citation_opportunities.js`
   11. `search:prepare-submission`
   12. `build_404.js`
   13. `install_clarity.js`
3. `build:aplayer-phase-expansion` — `generate_aplayer_phase_expansion.mjs`
4. `build:agent-accepted-content` — compile-acceptance → plan-exact → apply-exact
5. `repair:dual-domain-metadata`
6. `repair:published-agent-blocks`
7. `retrofit:recommendation-summary`
8. `scripts/internal/build_navigation_structure.mjs`
9. `build:visible-faq` — `build_visible_faq_sections.py --apply`
10. `repair:health-boundary`

`converge_tree_before_commit.sh` then repeats steps 1–10 (plus four more
repair stages outside `build:all` itself) until a pass changes nothing,
checked by `validate:extraction-surface-guard:check` — "fixed point reached
after pass N" in its logs means N repeats of this entire chain.

## What is CONFIRMED about the edges

- **Steps 8 and 9 depend on the full page corpus, not a subset.**
  `build_navigation_structure.mjs` reads `data/citation/citable_pages.json`
  (written earlier in the chain) and then walks the page tree with
  `fs.readdirSync` over the content directories, reading and rewriting each
  page's HTML in place (`scripts/internal/build_navigation_structure.mjs:174-366,431-555`).
  `build_visible_faq_sections.py` does the same with `ROOT.rglob("*.html")`
  over the entire tree (`scripts/content/build_visible_faq_sections.py:501`).
  Neither is scoped to "pages touched by this run" — each reads and can
  rewrite every page on disk, every time. This is the exact mechanism behind
  the FROZEN_OUTPUT_MATERIAL_SHRINK defect: a byte count taken between step 3
  (phase-expansion) and step 8 (nav) necessarily undercounts, because step 8
  has not added breadcrumbs yet.
- **Step order is a true dependency order for at least one registry**: step
  8 reads `data/citation/citable_pages.json`, which upstream steps (citation
  build, phase-expansion, agent-accepted-content) write. Running step 8
  before those would read a stale registry.
- **The two append-only validator logs are not read by any generator.**
  `_validation_registry.json` and `_repo_validation_matrix.json` were grepped
  across every script under `scripts/` outside `scripts/validation` and
  `scripts/validators`: zero readers. That is why the build cache
  (`scripts/build/`) and `.github/scripts/build_input_hash.sh` both exclude
  them from the input hash — a validator appending to them cannot change
  what any generator produces.

## What is NOT proven

- **Whether steps 1–7 could safely run in a different order, or in
  parallel, has not been audited.** Several of them read files other steps
  write earlier in the SAME step (e.g. `intake` populates the query universe
  that `scoring`, `backlog`, and later `citation:build` all read), but no
  script-by-script read/write audit was done for the ~25 scripts inside
  steps 1–7 to confirm which of them read only their own declared inputs
  versus scanning the whole tree the way steps 8 and 9 provably do.
- **Whether any step other than 8 and 9 depends on output that has not been
  produced yet** (i.e., whether the `&&` chain in `package.json` is a real
  dependency order everywhere, or is in places just "this is the order
  someone wrote it in") is not established.

Because of that gap, this graph is sufficient to justify caching the
CONVERGENCE RESULT of the whole chain (scope item 1 — see
`docs/runbooks/BUILD_CACHE.md`), and to explain precisely why steps 8 and 9
cannot be decoupled from what precedes them. **It is not sufficient to
justify incremental, per-page rebuilding (only regenerating pages whose
inputs changed) or parallelizing steps 1–7.** A wrong graph ships stale
pages, which is worse than a slow build, so this work stops here rather than
guessing at the remaining edges. Extending this document with a real
script-by-script read/write audit of steps 1–7 is the prerequisite for
either of those next steps.
