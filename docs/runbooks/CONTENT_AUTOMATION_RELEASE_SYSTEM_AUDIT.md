# Content Automation Release System Audit

Generated: 2026-06-21

## Finding

The repo already contains one governed content automation spine. Phase 1-4 citation work is folded into that spine; no second daily release scheduler was created.

## Existing commands confirmed

- workflow:daily-insight
- content:pipeline
- workflow:content-authority
- authority:daily
- reddit:daily
- build:generated-content
- build:new
- build:manual-expansion
- citation:all
- build:all
- validate:all
- release:prepush:container
- release:prepush:local
- release:prepush

## Existing release/admission machinery confirmed

- scripts/release_one_draft.js
- scripts/content/build_manual_expansion_pages.mjs
- scripts/programmatic/generate_candidates.mjs
- scripts/programmatic/run_lane.mjs
- scripts/validators/validate_signal_floor.js
- scripts/validators/validate_publish_signal_gate.js
- scripts/validation/validate_programmatic_registry.mjs
- scripts/validation/validate_programmatic_admission.py
- data/content/programmatic_lane_contracts.json
- data/content/programmatic_candidate_manifest.json
- data/content/page_admission_registry.json
- content/insights/_drafts/
- content/insights/

## Decision

The APlayer/BHPC 2,000-surface expansion is a bulk baseline release through existing admission, registry, sitemap, llms, and validation structures.
