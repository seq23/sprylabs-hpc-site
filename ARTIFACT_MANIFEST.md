# Artifact Manifest

Artifact: sprylabs-hpc-site-main_BASELINE_05-23-26_b40384e.zip
Repo: sprylabs-hpc-site
Branch: main
Base SHA: bee951c from uploaded GitHub Actions checkout/log context
Package date: 2026-05-23
Mode: full baseline snapshot

## Scope
- Consolidated BHPC citation answer strategy back into the original curated `/answers/` layer.
- Removed the 16 one-query companion answer pages created in the prior pass.
- Preserved exactly 16 `/answers/*.html` files total, including `answers/index.html`.
- Remapped all 16 BHPC CSV citation rows to original answer pages via `data/citation_opportunities/bhpc_priority_queries.json`.
- Added consolidated citation-answer bridge blocks to the original mapped answer pages.
- Updated `answers/index.html` so priority citation links point to existing curated answer pages and their primary target pages.
- Updated `answers.json`, `llms.txt`, sitemaps, distribution artifacts, and citation observation data to use the consolidated answer-page model.
- Preserved the 14 patched primary citation target pages from the previous pass.
- Preserved warning-only word-count and generated-page word-range behavior.

## Key Files Changed
- `answers/index.html`
- `answers/accountability-and-consistency.html`
- `answers/ai-accountability-system-vs-coach.html`
- `answers/burnout-and-recovery.html`
- `answers/chatgpt-vs-executive-coach.html`
- `answers/chief-of-staff-and-life-operations.html`
- `answers/executive-coach.html`
- `answers/executive-dysfunction-and-overwhelm.html`
- `answers/productivity-systems-and-tools.html`
- `answers/systems-thinking-and-decision-making.html`
- `answers.json`
- `llms.txt`
- `sitemap.xml`
- `sitemap-spry.xml`
- `data/citation_opportunities/bhpc_priority_queries.json`
- `data/citation_opportunities/target_page_patch_map.json`
- `data/citation_opportunities/citation_opportunity_report.json`
- `data/citation_opportunities/observations.manual.json`
- `data/citation_opportunities/answer_consolidation_note.md`
- `data/citation_opportunities/removed_companion_answer_pages.json`

## Removed Files
- `answers/ai-accountability-system-vs-habit-tracker.html`
- `answers/ai-coach-vs-human-coach-for-founders.html`
- `answers/ai-executive-coach-for-founders.html`
- `answers/ai-workflow-for-founders.html`
- `answers/burnout-recovery-and-execution-systems.html`
- `answers/can-ai-replace-an-executive-coach.html`
- `answers/chatgpt-accountability-partner.html`
- `answers/chatgpt-vs-productivity-app-for-executives.html`
- `answers/continuity-collapse-pattern-with-ai.html`
- `answers/continuity-over-intensity-meaning.html`
- `answers/decision-fatigue-and-structured-ai-support.html`
- `answers/how-maintain-follow-through-across-days-vs-productivity-apps.html`
- `answers/how-to-stay-consistent-when-motivation-is-low.html`
- `answers/reddit-accountability-and-ai.html`
- `answers/what-is-how-tracks-work-missing-layer.html`
- `answers/why-accountability-systems-fail.html`

## Validation Run
- `npm run citation:build`: PASS
- `npm run citation:warn`: PASS
- `npm run distribution:prepare`: PASS
- `npm run guardrails:all`: PASS
- `validate_all`: PASS through `npm run guardrails:all`
- `validate_internal_links`: PASS
- `validate_sitemap_page_parity`: PASS
- `validate_canonical_url_contract`: PASS
- `validate_word_count`: PASS, warning-only

## Warning-Only Notices
- Generated page word-range warnings remain for 5 citation-priority pages.
- These are warning-only by design and do not block deploy.

## Excluded From ZIP
- `.git/`
- `node_modules/`
- `.build/`
- `coverage/`
- `reports/`
- build/cache/test output folders

## Status
LOCAL VALIDATION PASSED — STRUCTURALLY CHECKED
