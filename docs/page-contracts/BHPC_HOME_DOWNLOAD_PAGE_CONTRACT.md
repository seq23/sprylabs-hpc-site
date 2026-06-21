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
