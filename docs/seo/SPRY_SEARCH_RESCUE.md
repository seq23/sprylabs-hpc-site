# Spry Executive OS search rescue — 2 November 2026

This branch consolidates the Spry host without changing its shared-host sibling's publishing policy or the protected download page. It does not merge or deploy.

## Evidence and decisions

Monday's audit reports 281 → 64 property impressions over consecutive four-week windows (-77%). Those window dates and a daily series were not supplied. The retained week-41 investigation dates an earlier 89 → 45 decline to 2–8 October versus 25 September–1 October, while showing earlier volatility. An exact onset or algorithmic penalty is not proved.

The live Spry child sitemap contained 543 URLs, not the audit's 1,689-page figure. On 2 November, the committed URL Inspection ledger recorded 177 indexed, 299 crawled-not-indexed and 55 discovered-not-indexed among 541 inspected URLs. All ten evenly spaced live sample pages returned 200, self-canonicals and no noindex. Their distinct visible five-word passage overlap with another sample ranged from 9.0% to 45.6% (mean 26.1%, including navigation). Ten matching source pages had fewer than 300 visible words. Robots allows Google and the named AI crawlers; a fabricated URL returned 404 and the root intentionally redirects to BHPC.

These confirm excessive low-demand overlapping surfaces and weak index uptake. Their role in the traffic decline is **SUSPECTED**, not a confirmed Google penalty. The existing October investigation found no causal template change; it also documents the already-fixed cross-host sitemap defect. There is no evidence supporting seasonality.

The latest query/page export has only 7 raw impressions because it does not include anonymous property-level traffic; do not substitute it for the Monday total. Topic selection uses `data/search_intelligence/spryexecutiveos.com/demand_families.json` (retained 90-day evidence) and the additional structured-conversation query in `provider_inputs/gsc_spry.json`. Near-duplicate pages with small historical impressions consolidate into the evidenced topic rather than being preserved as competing variants.

## Source and runtime

- `data/seo/spry_rescue_guides.json`: eight substantive editorial guides, topic routing terms and actual editorial dates. No inherited unsupported prices, coaching cost claims or invented outcome statistics.
- `scripts/content/build_spry_rescue.cjs`: sole rescue renderer, cumulative redirect ledger, discovery repair, active citation status and internal-link consolidation. It uses the existing Organization and snippet contracts. Publication dates reflect this replacement edition; update dates are editorial inputs, not the build clock.
- `scripts/lib/spry_rescue.cjs`: finite publishing policy. Eight guides, `/knowledge-map/` and `/about` earn an indexable place. Operator/error surfaces and other-host routes are preserved. A future unreviewed Spry variant cannot silently enter a deploy.
- `data/seo/spry_rescue_redirects.json`: 540 retired source routes, including 533 URLs from the 543-URL live sitemap and seven older source routes. Four of the older routes keep their existing BHPC consolidation destinations.
- `functions/_lib/spry_rescue_table.js`: exact aliases, including `.html` and directory `index.html`; no broad unknown-URL redirect. Both public hosts return 301, preserve query strings, and terminate at a kept Spry or BHPC page. Existing canonical-host and four-route consolidation rules run first.
- `scripts/assemble_pages_output.js`: reruns the renderer at the final deploy boundary and omits retired HTML, including any legacy writer's recreated variant. Archive source files remain reversible. This avoids Pages `_redirects` rule limits, following the failure lessons in read-only WPP-llm commits #71–73.
- Insight and phase-expansion HTML writers skip retired Spry output. `build:all:uncached` finishes with the rescue renderer, and `search-loop.config.json` is off. New topics require an explicit editorial addition to the finite source.

## Page contract and verification

Guides answer first, define the term, use question sections, ordered steps, comparison tables where applicable, illustrative examples, a named research reference with its limits, visible FAQs and matching FAQPage/Speakable metadata. Spry Labs is the actual business byline. One manual box has `page_kind` and `slug` parameters. All guides are linked from the directory and the publisher page; existing inbound links consolidate to these guides.

`npm run test:search-rescue` exercises permanent redirects and query preservation for every ledger URL, unknown/preview/utility exclusions, future variant suppression, deploy/sitemap membership, structured-data agreement and build idempotence. It adds no blocking validator and pins no wording. Run existing tests and the canonical `npm run validate:all` profile in the same batch. Existing population and legacy extraction tests may expose contracts built around the former expansion; keep their failures visible, never skip or weaken them.

After an approved merge and normal deployment, verify three live guides and retired URLs, then compare property-level GSC impressions and index uptake over matched windows. This PR alone cannot demonstrate a traffic recovery or a live redirect change.

## Rescue validation receipt

Node 24 deploy assembly and all seven rescue behavior tests pass. The complete Node suite reports 108 passed and three failed (111 tests): `host_consolidation.test.mjs` requires more than 100 Spry sitemap URLs; `route_owner_host.test.mjs` requires more than 100 Spry pages and more than 2,000 total indexable pages. Those population requirements conflict with consolidation and remain unchanged.

The canonical `validate:all` profile was run and failed at the extraction snapshot and citation repair producer. Review then corrected the renderer's extraction contract (`answer`, the existing Article-compatible type), schema identifier, framework metadata and retained query ownership. The reviewed extraction baseline was regenerated through its existing explicit rebaseline mechanism; the extraction check now passes. No validator or test was weakened. A subsequent citation-contract check still rejects the guides for lacking its exact repeated product sentence and literal `/download.html` link, even though each guide has its single absolute, tracked next-step link. These failures remain visible; no full-green validation or merge eligibility is claimed. The PR stays draft.
