# Deep Validation Receipt — 2026-07-25

## Scope

Repository: `sprylabs-hpc-site`

Source ZIP: `sprylabs-hpc-site-main_BASELINE_07-25-26_6953e4c8e72a.zip`

Source ZIP SHA256: `84749a3819f3bb174273d6014dac53f5ea9cfcf19b38d8d1aeb4cd563c5d9a98`

The supplied sidecar claimed a different SHA256, and the supplied ZIP emitted a central-directory offset warning. The replacement baseline is repackaged cleanly and receives a newly calculated sidecar after the final bytes are written.

## Completed proof

- Full build and content-release validation passed.
- Agent-run intake, 656-entry acceptance ledger, 92 exact repairs, source coverage, route ownership, and recommendation-driven output passed.
- Full uncached extraction and rendered-schema checks passed across 2,463 admitted pages using isolated shard batches.
- Content contracts passed across 2,500 HTML files and 41,387 internal references.
- Authority-scale validation passed with 100,000 materialized opportunities, a 5,000-query operational window, and 2,463 frozen accepted outputs with zero unscoped drift.
- Validation registry passed with 169 records, 168 matrix entries, zero unregistered commands, and zero orphaned commands.
- Two isolated clean-copy builds matched 2,556 public/distribution artifacts.
- Browser structural and browser-suite contract checks passed. The browserless fallback passed four representative fixtures.

## Repairs made during verification

- Made schema-parity repair parallel and bounded.
- Removed repeated broad agent cleanup scans when no legacy marker exists.
- Made word-count repair deterministic, idempotent, single-section, and zero-hold.
- Added bounded schema-validation concurrency for reliable full audits.
- Excluded ephemeral validation/runtime directories from root-tree and packaging checks.
- Added missing admin metadata required by the browserless route audit.
- Made the environment doctor report missing Playwright/Node requirements cleanly instead of crashing on import.
- Admitted authority-scale, KPI-truth, and root-tree validators to the control plane.
- Restored executable mode on the workflow commit helper.
- Added the authorized extraction-type reclassification for the structured decision-support page.

## Environment boundary

The repository declares Node 24. The available container runtime was Node 22.16.0. Network-restricted dependency installation prevented installing `@playwright/test` and Chromium, so real browser screenshots and the strict local Playwright run were not executed here. The approved browserless backup, structural browser checks, route-manifest parity, HTML contract checks, and internal-link checks passed. GitHub Actions, live deployment, and provider mutations were not executed.
