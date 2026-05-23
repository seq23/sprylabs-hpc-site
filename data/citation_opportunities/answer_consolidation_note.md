# Answer Layer Consolidation Note

The BHPC citation opportunity layer now maps the 16 CSV query rows into the original curated `/answers/` pages instead of maintaining a one-query/one-page companion layer.

## Why

- Avoids doubling the answer surface from 16 to 32 pages.
- Reduces thin-page and cannibalization risk.
- Keeps `/answers/` as a curated answer hub.
- Preserves CSV-driven monitoring, target-page patching, `llms.txt` entries, and warning-only citation readiness.

## Current model

- CSV rows live in `data/citation_opportunities/bhpc_priority_queries.json`.
- Each row has `answer_strategy: consolidated_original_answer_page`.
- Multiple related queries may map to one stronger curated answer page.
- The deeper authority pages remain the primary citation targets.
