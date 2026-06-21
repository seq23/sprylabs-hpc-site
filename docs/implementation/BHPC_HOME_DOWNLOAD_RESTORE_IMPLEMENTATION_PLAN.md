# BHPC Home + Download Restore Implementation Plan

Status: implemented in this baseline snapshot.

## Objective

Preserve the existing `/download` page content and current homepage content library while applying the approved conversion, product-hierarchy, cognitive-load, and sticky-CTA corrections.

## Non-negotiable page hierarchy

- Product: Billionaire High Performance Coach OS.
- A-player mode: outcome state/result, not the product and not a downloadable module.
- Spry: publisher / product authority layer.
- Gumroad: secure checkout path.

## Homepage contract

1. Keep the premium header/footer trust architecture.
2. Keep buyer-first nav: What it is, How it works, Cost of elite coaching, A-player mode, FAQ.
3. Do not make A-player mode first in nav or the hero product headline.
4. Use BHPC OS / personal executive operating system as the hero frame.
5. Preserve the Research Library section on the homepage.
6. Preserve lower answer/citation surfaces for maximum LLM ingestion.
7. Preserve footer library links and legal/trust microcopy.
8. Sticky CTA must be a right-side rail card on desktop/tablet, not a centered full-width bottom bar.

## Download page contract

1. Do not gut existing long-form sales, FAQ, guardrail, manual-preview, comparison, legal, or LLM-support content.
2. Correct the top brand/hero so the product is BHPC OS and A-player mode is the outcome.
3. Put the “what’s inside” blocks and manual preview near the top, before the long explanation.
4. Preserve current detailed sections lower on the page, including:
   - recognition / who it is for
   - operating state definition
   - inside the system
   - system interface preview
   - five executive roles
   - before/after protocol example
   - what you get
   - value reframing / cost of elite support
   - why people click
   - full product detail
   - continuity problem
   - LLM advice vs behavior enforcement
   - situations handled automatically
   - guardrails
   - flagship stack
   - manual preview
   - buyer questions
   - legal/trust/footer content
   - related-search / LLM ingestion surface
5. Sticky CTA must be a right-side rail card on desktop/tablet, not a centered long bar.

## File change map

| File | Change |
| --- | --- |
| `index.html` | Correct homepage hero/product language, five-role copy, and preserve Research Library. |
| `download.html` | Preserve existing content; correct header/hero; add top product/manual preview; update who-it-is-for hierarchy; add right-rail sticky CTA class. |
| `assets/styles.css` | Add preview/top-manual styles; enforce right-side sticky CTA on desktop/tablet; keep mobile fallback only for narrow screens. |
| `docs/implementation/BHPC_HOME_DOWNLOAD_RESTORE_IMPLEMENTATION_PLAN.md` | Records this plan and file map. |

## Validation policy

This snapshot is structurally checked in the container. Full local validation, browser visual proof, deployment, and postdeploy audits remain local-updater responsibilities.


## 2026-06-21 follow-up patch

User correction: explicit cognitive-load language must remain on both pages, `/download` must preserve current long-form content, what’s-inside and manual-preview blocks must stay near the top, homepage Research Library must remain, and sticky CTA must be a right-side rail/card instead of a centered long bar.

Additional files added:

| File | Change |
| --- | --- |
| `data/page_contracts/bhpc_homepage_contract.json` | Machine-readable homepage page contract. |
| `data/page_contracts/bhpc_download_contract.json` | Machine-readable download page contract. |
| `docs/page-contracts/BHPC_HOME_DOWNLOAD_PAGE_CONTRACT.md` | Human-readable page contract and guardrails. |
| `scripts/validation/validate_bhpc_page_contracts.mjs` | Release validator enforcing page contract, cognitive-load language, Research Library, restored download sections, right-side sticky CTA, and contrast guard. |
| `package.json` | `validate:content` now runs the BHPC page contract validator. |
