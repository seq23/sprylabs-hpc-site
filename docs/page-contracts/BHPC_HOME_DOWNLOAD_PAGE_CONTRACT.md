# BHPC Homepage + Download Page Contract

Status: active / release-enforced by `scripts/validation/validate_bhpc_page_contracts.mjs`

## Product hierarchy

- Product: Billionaire High Performance Coach OS.
- A-player mode: outcome state/result only. It is not the product, not a literal installed mode, and not what the user downloads.
- Spry: publisher / product authority layer.
- Gumroad: secure checkout path.

## Homepage contract

1. Keep buyer-first header/nav. A-player mode may remain in nav, but it must never be first.
2. Keep the Research Library section with White Paper, AI Execution Atlas, Insights, Answers, Comparisons, and FAQ.
3. Keep lower answer/citation surface for LLM ingestion.
4. Keep explicit cognitive-load language.
5. Keep paired CTA psychology: Discover your own A-player mode + I need this now.
6. Keep desktop/tablet sticky CTA as a right-side rail/card, not a centered long bottom bar.

## Download page contract

1. Do not gut the current long `/download` page. Preserve the full-detail sales, recognition, inside-system, 5 roles, before/after, what-you-get, value, buyer questions, legal/trust, related-search, and LLM-ingestion content.
2. Keep what’s-inside blocks and manual preview near the top before the long explanation.
3. Keep explicit cognitive-load language tied to planning, sequencing, strategic triage, and next-step selection across projects/roles.
4. Keep product hierarchy: BHPC OS is product; A-player mode is result.
5. Keep desktop/tablet sticky CTA as a right-side rail/card, not a centered long bottom bar.
6. Cream/light sections must use ink or muted warm text. White text may appear only on intentionally dark sections and the dark footer.

## Validation

`npm run validate:content` calls the BHPC page contract validator. Failure means the release must not ship.

## Protected buyer-page freeze guard — Download

- `/download.html` is a protected buyer/conversion page, not an agent-output canvas.
- Visible citation extraction scaffolds, generated extraction structures, BHPC agent semantic repair sections, agent proof markers, and repeated agent framework headings are forbidden on `/download.html`.
- The hero must flow from the H1 directly into the buyer-facing lede.
- The page may keep quiet machine-readable schema, but the buyer page must not show LLM/citation/agent repair scaffolding.
- `/download.html` must remain admitted in `data/release/frozen_output_registry.json`, and its frozen accepted-output blob must be refreshed whenever the protected page contract changes.
- `npm run validate:content` must fail if the download page repeats agent headings, carries visible extraction attributes, has more than one JSON-LD script, or loses the protected buyer-page structure.

## Protected buyer-page freeze guard — Product alias

- `/product.html` is the "Product alias route" onto the same buyer and is protected exactly like `/download.html`: no agent semantic repair sections, no agent blocks, no LLM/citation scaffolding, and its `Product Overview` H1 stays.
- The protected list lives once, in `data/page_contracts/protected_buyer_pages.json`, and every writer reads it: the acceptance parser BLOCKS agent rows aimed at a listed page, the citation program never opens or registers one, and the repair passes skip them.
- `/product.html` is `never_citable`: it must not be an `ACTIVE` record in `data/citation/citable_pages.json` and must not appear in `sitemap-bhpc.xml`. It is a bridge, not an indexable citation page.
- Origin: on 2026-09-26 four Twin Agent REPAIR rows were REQUIRED on `product.html`, Spry Content Release applied them, the citation program registered the rewritten alias as ACTIVE and kept rewriting it, and Validate Repo on release commit `2701370e9` failed extraction-contract, programmatic-admission, search-snippet-bounds and the lastmod truth check on that one page.
- `npm run validate:content` must fail if `product.html` carries agent or citation scaffold, loses its kicker and H1, becomes an ACTIVE citable page, appears in the bhpc sitemap, or if the shared protected list loses either page.



## Visual Layout Guardrails — Download

- Generated Key Criteria extraction text must not render visibly inside the `/download` hero.
- `/download` desktop hero uses left-aligned copy plus exactly one hero product image.
- The second major product image is the large system preview below the top what-is-inside blocks.
- Header and announcement bars must not crowd, overlap, or run words into each other.
- Cream/light panels must use ink or muted-warm text only. White text belongs only on explicitly dark panels.


## Quiet AEO/GEO ingestion guardrails

- Keep homepage as the canonical product/entity explanation surface.
- Keep `/download` as the conversion, proof, and product-preview surface.
- Do not add visible citation-strategy or LLM-surfacing scaffolding back to the buyer page.
- Preserve machine-readable `FAQPage`, `BreadcrumbList`, enriched `Product`, and `WebPage` schema with `about`, `mentions`, and `isPartOf` relationships.
- Preserve sitemap, LLMS, citable-page registry, query/answer graph, and internal-link coverage for both buyer pages.
- Product schema must not contain fake reviews, fake ratings, aggregate ratings, or unsupported claims.
