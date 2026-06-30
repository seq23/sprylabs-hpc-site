# Workflow Audit — SpryLabs HPC — 2026-06-30

## Source inspected

- Latest GitHub web ZIP: `sprylabs-hpc-site-main.zip`
- Failing Citation Velocity 5K logs: `logs_76825253178.zip`

## Failure isolated

`Citation Velocity 5K` failed inside `npm run validate:release-portability`. The generated run appended enough rows to `data/programmatic/rejection_backlog.json` that the root-deployed JSON exceeded the Cloudflare Pages 25 MiB asset limit. The previous oversized `reports/programmatic-candidate-results.json` issue was already fixed; this was the same class of failure in a different generated artifact.

## Workflow inventory and decision

| Workflow | Role | Decision | Cadence | Notes |
|---|---:|---|---|---|
| `validate.yml` | Release validation + attestation | Keep | `main` push, PR, manual | Scoped to `main` so updater tags do not cause duplicate validation/deploy chains. |
| `deploy-distribution.yml` | Deploy validated distribution after `Validate` | Keep | after successful `Validate` on `main`, or manual | Branch-gated to avoid deploying tag-triggered validation artifacts. |
| `workflow-monitor.yml` | Watch governed workflow health | Keep | daily | Static + live monitor for governed automation health. |
| `content-authority-pipeline.yml` | Agent artifact absorption + authority/content pipeline | Keep | daily, manual, manifest-only push | Current artifact shape is manifest-gated under `data/report_fixes/agent_runs/**/agent_run_manifest.json`. |
| `daily-insight.yml` | Publishes one scheduled insight draft | Keep | daily | Normal daily content release lane. |
| `execution-strict.yml` | Full execution/intake/backlog authority lane | Keep | daily | Heavy but governed; still part of site operating system. |
| `reddit-daily.yml` | Reddit ingestion + publish path | Keep | daily | Requires Reddit secrets; still necessary if Reddit source remains active. |
| `reddit-evening.yml` | Evening Reddit refresh without publish | Keep | daily evening | Keeps source data fresh without publishing. |
| `social-signal-processing.yml` | Weekday social signal collection | Keep | weekdays | Feeds authority and insight layers. |
| `synthesis-weekly.yml` | Weekly synthesis article builder | Keep | weekly Monday | Monitor budget already weekly-aware. |
| `whitepaper-release.yml` | Semiannual whitepaper release | Keep | June/December | Monitor budget already semiannual-aware. |
| `citation-velocity-5k.yml` | Bulk citation-surface expansion | Keep but reduce | weekly Tuesday + manual | It should not run daily. It is a batch expansion engine, not an ordinary daily refresh. |

## Changes made

1. Added bounded compaction for `data/programmatic/rejection_backlog.json` inside `scripts/programmatic/run_lane.mjs`.
2. Compacted the existing rejection backlog to the latest 2,500 detailed rows plus aggregate history.
3. Changed `Citation Velocity 5K` from daily to weekly Tuesday at `16:10 UTC`.
4. Updated the governed workflow contract for the new Citation Velocity cadence and monitor budget.
5. Scoped `Validate` to `main` branch pushes/PRs.
6. Scoped `Deploy Distribution` to successful `Validate` runs on `main`.

## Current artifact-shape conclusion

The current agent artifact shape still makes sense: Content Authority is the only workflow allowed to react to incoming agent artifacts, and it reacts only to the manifest file. The 5K workflow is not an artifact intake workflow. It is a bulk programmatic expansion workflow and should run on a slower cadence.

## Remaining operational note

After this patch, manually run `Citation Velocity 5K` once from GitHub Actions to replace the latest failed run with a successful monitored run.
