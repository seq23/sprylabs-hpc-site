# Workflow Repair Report — 2026-06-19

## Affected workflows

- Content Authority Pipeline
- Daily Insight
- Execution Strict

## Proven root cause

The shared programmatic runner treated every changed HTML page as belonging to the active workflow lane. Canonical rebuilds also refreshed existing manually governed reference pages. When those pages passed candidate admission, their registry records were replaced with `authority` or `daily_insight` provenance. `validate:programmatic-registry` correctly rejected the drift because manual reference pages must remain `manual` and `full` admitted.

## Repair

- Existing admitted pages now preserve `generation_lane`, `admission_level`, `source`, and `admitted_at` during candidate reconstruction.
- New pages still inherit the active workflow lane.
- Accepted candidates no longer retain temporary baseline/candidate hashes in the canonical registry.
- A focused provenance self-test proves that a manual page remains manual when evaluated under both authority and daily-insight lanes.

## Workflow governance added

Each affected workflow now has:

- scheduled and manual dispatch;
- a machine-readable workflow contract;
- executable input/output lineage;
- a governed runtime wrapper;
- per-run trace JSON;
- hostile review;
- monitor validation;
- trace artifact upload on success or failure;
- source/governance mutation denial before commit.

A separate daily Workflow Health Monitor checks the latest completed GitHub Actions run for failure or staleness.

## Playwright scope

The browser suite remains deliberately bounded at 12 representative routes across desktop and mobile: 24 checks total. The representative matrix covers both domains, static and directory routes, priority/manual/generated sources, how-to/concept/comparison/decision extraction shapes, health-adjacent content, premium GEO pages, prompt artifacts, comparison tables, and enterprise-governance content.

## Disavow asset

The supplied shared A Player Mode/Billionaire High Performance Coach disavow list is versioned for the relevant property as `docs/seo/disavow/billionairehighperformancecoach.com-disavow.txt`. A validator enforces 14 unique domain directives and rejects self-domain entries. Search Console upload remains manual and is not represented as completed.

## Proof executed in the build container

- workflow validation registry: pass;
- workflow contract: pass;
- workflow lineage: pass;
- workflow monitor contract: pass;
- disavow asset validation: pass;
- programmatic provenance regression: pass under authority and daily-insight lanes;
- hostile review + trace self-test: pass for all three workflows;
- browser-suite contract: 12 representative routes × 2 projects = 24 checks across 16 dimensions;
- canonical build: completed;
- broader validation advanced through the legacy content suite but exceeded the container execution window during the large repository scan; local updater and GitHub Actions remain the authoritative runtime gates.
