# Programmatic Admission Runbook

## Purpose

Every workflow-generated public page must independently earn its URL before it can enter query ownership, sitemaps, `llms.txt`, distribution artifacts, or IndexNow.

## Governed lanes

- `entity_use_case`
- `comparison_graph`
- `question_cluster`
- `reddit`
- `daily_insight`
- `synthesis`
- `authority`
- `whitepaper`
- `fanout`
- `manual`

Lane requirements are machine-readable in `data/content/programmatic_lane_contracts.json`.

## Workflow sequence

1. A mutating GitHub workflow invokes `npm run programmatic:run-lane -- --lane <lane> -- <mutation command>`.
2. The runner snapshots the public HTML corpus.
3. The mutation command runs.
4. The canonical build and final schema compiler run.
5. New or materially changed public pages become candidates.
6. Candidates are checked for query ownership, intent independence, framework placement, a useful artifact, worked example, CTA coverage, sources, health boundaries, final rendered structure, and similarity.
7. Accepted candidates are written to `data/content/page_admission_registry.json`.
8. Rejected candidates are restored or removed, recorded in `data/programmatic/rejection_backlog.json`, and omitted from all public distribution surfaces.
9. The post-build compiler regenerates query, schema, sitemap, link, and distribution outputs.
10. Full site validation and warning checks run before the commit helper can execute.

A content-quality rejection does not publish and does not invalidate healthy existing pages. Infrastructure defects, registry drift, active-site regressions, or validation failures stop the workflow.

## Pages the exact-agent lane creates

`agent:bhpc:apply-exact` writes a `CREATE_NEW_TARGET_PAGE` page directly to the tree; it does not go through `programmatic:run-lane`. Those pages are gated by `agent:bhpc:admit-created` (`scripts/agent_intake/admit_bhpc_agent_created_pages.mjs`), which runs in `release:content-finalize` after the repair stages and before the corpus run of `validate:programmatic-admission`:

1. Every created page not yet `ADMITTED` in `data/content/page_admission_registry.json` is a candidate.
2. Candidates are judged by `validate_programmatic_admission.py --candidate-only` - per-page quality, query collision, similarity against every admitted page, and similarity between the candidates themselves.
3. Accepted candidates are registered `ADMITTED` at the sealed admission level.
4. Rejected candidates are removed from the tree before anything commits, recorded in `data/content/agent_page_quarantine.json` and `data/programmatic/rejection_backlog.json`, and the plan is rebuilt so the spec reads `BLOCKED` with the gate's reason. A run in which every created page is rejected, or in which nothing was created, is a NAMED stop (exit 0) recorded in `artifacts/validation/agent-created-page-admission.json`; `validate:no-silent-zero-work` reads it.

The quarantine ledger is keyed by path and a fingerprint of the spec (`h1`, `framework`, `type`, `definition`, acceptance ids). Curating the page in `data/citation/agent_page_specs.json` changes the fingerprint and the next release re-judges it; after a generator change, delete the row to re-judge. `validate:agent-created-page-admission-gate` replays the 2026-09-19 near-duplicate pair through this path and fails if the gate stops rejecting it.

## Conversion contract

Every fully admitted programmatic page requires:

- a visible top/header CTA to `/download.html` or the approved Gumroad checkout;
- a contextual body product anchor linking to `/download.html`;
- a visible footer CTA to `/download.html` or the approved Gumroad checkout.

`aplayermode.com` is contextual, not universal.

## Three scalable axes

### Entity × use case

Requires `entity`, `use_case`, and `unique_atom`. Replacing only the entity/persona name is not sufficient.

### Comparison graph

Requires current named entities, a visible comparison table, official sources, a reviewed date, a disclosed methodology, and conflict disclosure where relevant.

### Question cluster

Requires a literal question, a direct answer of at most 70 words, a named framework or decision rule, and a page-specific artifact. Questions with materially identical answers must merge into one owner with aliases or visible FAQ entries.

## Commands

```bash
npm run validate:programmatic-registry
npm run validate:programmatic-admission
npm run programmatic:generate
npm run programmatic:run-lane -- --lane question_cluster -- npm run <mutation-script>
```
