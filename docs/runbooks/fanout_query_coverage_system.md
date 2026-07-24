# Fan-Out Query Coverage System

## Purpose
This repo uses fan-out query mapping so one page can satisfy multiple real-world phrasings around the same underlying decision without turning the page into keyword soup.

The system is designed to improve:
- retrieval breadth
- model-liftable answer coverage
- comparison capture
- emotional-intent capture
- conversion routing toward the core product surfaces

## Source of truth
- `data/fanout_registry.json` — family profiles and route overrides
- `scripts/fanout/shared.js` — fan-out classification, topic normalization, variant generation, and render contract
- `scripts/apply_fanout.js` — applies fan-out blocks and regenerates manifests
- `scripts/validate_fanout_warning.js` — warning-only validation for this pass

## Required surfaces
Fan-out must exist on these page families:
- homepage
- download page
- product page
- start-here page
- faq pages
- glossary pages
- atlas pages
- comparison pages
- answer pages
- pain / recovery pages
- insight pages
- topic pages

Templates are excluded from direct mutation.

## Render contract
Each page receives:
- one visible block with `data-fanout-query-cluster="true"`
- `data-page-family`
- `data-fanout-topic`
- a visible list of closest query variants
- a visible list of next-best routes by intent
- one machine-readable JSON payload in `<script class="fanout-payload" type="application/json">`

## Intent buckets
Intent buckets are not decorative. They define routing.

Current buckets include combinations of:
- definition
- fit
- comparison
- trust
- pricing
- continuity
- pain
- conversion
- stabilize

## Build / apply sequence
Run in this order:

```bash
npm run fanout:apply
npm run validate:all
```

## Artifacts generated
- `.build/fanout_manifest.json`
- `.build/fanout_missing.json`
- `.build/fanout_duplicates.json`
- `releases/fanout_query_clusters.bhpc.json`

## Manual QA
Check these pages every pass:
- `/`
- `/download.html`
- `/product.html`
- `/start-here.html`
- one comparison page
- one pain / recovery page
- one answer page
- one insight page
- `/legal.html`

Confirm:
- variants read like human search phrases
- no junk title-derived phrases remain
- links route to sensible adjacent pages
- page still reads like a human page first
- fan-out block supports the page instead of overwhelming it

## Failure recovery
If the output is bad:
1. revert the changed HTML files
2. refine `data/fanout_registry.json` or `scripts/fanout/shared.js`
3. rerun `npm run fanout:apply`
4. rerun `npm run validate:all`
5. package only after extracted-ZIP validation also passes

## Packaging rule
Do not call the pass complete until:
1. local validation passes
2. ZIP is created from true repo root
3. ZIP is reopened
4. extracted copy also passes validation
5. required root files are confirmed inside the ZIP
