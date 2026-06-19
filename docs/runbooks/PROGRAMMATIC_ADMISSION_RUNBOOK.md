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
