# Workflow Data Trace — 2026-06-22

## Scope
Checked the scheduled/mutating workflow surface for the Spry Labs HPC site source ZIP after reported failures in Citation Velocity 5K and Content Authority.

## Root Causes Found

1. `scripts/community/route_scored_signals.js` imported `CTA_TARGET` from `scripts/lib/audience_frame.js`, but the library only exported `DISCOVERY_CTA_TARGET`. New content-routing records were written without `cta_target`, causing `content routing invalid` failures.
2. `build:aplayer-phase-expansion` wrote `data/citation/citation_phase_manifest.json` before later programmatic quarantine. After candidates were rejected and pages returned to 2019 active records, the phase manifest could still say 2091/2021/etc., causing `validate:citation-phase-manifest` failures.
3. `scripts/synthesis/build_synthesis_articles.js` rendered queued synthesis pages even when they were not admitted. If a run was interrupted or a non-programmatic build occurred, those pages could leak into citation registries without matching `page_admission_registry` records.
4. `scripts/apply_citation_layer.js` had previously left a circular `https://aplayermode.com` CTA on `/download.html`, which violates the download-page citation contract.

## Repairs Applied

- Added `CTA_TARGET` as a stable alias for `DISCOVERY_CTA_TARGET` in `scripts/lib/audience_frame.js`.
- Added `scripts/citation/sync_citation_phase_metadata.mjs` and wired it into `build:postprocess` immediately after citation postbuild.
- Updated synthesis rendering so queued-but-unadmitted synthesis pages are held/no-op-safe outside programmatic admission runs.
- Updated citation postbuild to skip unadmitted synthesis pages.
- Cleaned `/download.html` circular APlayerMode CTA and hardened `scripts/apply_citation_layer.js` so it does not reintroduce it.

## Workflow Decision

Keep Daily Insight and Weekly Synthesis if Reddit/social signal ingestion remains enabled. They are useful only as signal-aware release surfaces. They should not publish junk or fail the release spine when no high-intent signal is available.

## Local Container Proof Executed

- Workflow contract validator: PASS
- Workflow lineage validator: PASS
- Workflow monitor validator: PASS
- Direct workflow smoke: Daily Insight PASS / no-op duplicate-safe
- Direct workflow smoke: Weekly Synthesis PASS / held unadmitted synthesis pages
- Direct workflow smoke: Social Signal PASS / warning-only empty-source safe
- Direct workflow smoke: Reddit Evening PASS / fallback-safe
- Direct workflow smoke: Reddit Daily PASS / fallback-safe, 0 published pages
- Direct workflow smoke: Execution Strict PASS
- Direct workflow smoke: Whitepaper PASS / no due item
- Direct workflow monitor static mode: PASS
- Citation 5K dry-run plan: PASS
- Citation contract: PASS
- Programmatic registry: PASS
- Content validation: PASS
- Graph validation: PASS
- Distribution validation: PASS
- UI/test parity: PASS
- Browser-suite contract: PASS
- Citation phase manifest: PASS
- llms-full coverage: PASS
- Sitemap coverage: PASS

## Boundary

Exact full GitHub Actions governed `programmatic:run-lane` replay for every workflow was not completed inside this container because long runs exceeded the interactive tool execution window. This ZIP is structurally checked and ready for the local updater/GitHub Actions to perform exact workflow execution under Node 24.
