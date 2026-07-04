# Workflow YAML Inventory

Repo: seq23/sprylabs-hpc-site
Workflow count: 13

| Path | Name | Trigger | Lane | Status | Primary command |
|---|---|---|---|---|---|
| `.github/workflows/citation-velocity-5k.yml` | Citation Velocity 5K | workflow_dispatch, schedule | citation-expansion | modify_alias | `npm run workflow:run` |
| `.github/workflows/content-authority-pipeline.yml` | Content Authority Pipeline | workflow_dispatch, schedule, push | content-authority | keep | `npm run workflow:run` |
| `.github/workflows/daily-citation-intelligence.yml` | Daily Citation Intelligence | workflow_dispatch, schedule | daily-citation-intelligence | add | `npm run workflow:daily-citation-intelligence` |
| `.github/workflows/daily-insight.yml` | Daily Insight | workflow_dispatch, schedule | content-expansion | modify_alias | `npm run workflow:run` |
| `.github/workflows/deploy-distribution.yml` | Deploy Distribution | workflow_dispatch, workflow_run | deploy | keep | `npm run release:ci-validate` |
| `.github/workflows/execution-strict.yml` | Execution Strict | workflow_dispatch, schedule | content-expansion | modify_alias | `npm run workflow:run` |
| `.github/workflows/reddit-daily.yml` | Reddit Daily | workflow_dispatch, schedule | signal-intake | modify_alias | `npm run workflow:run` |
| `.github/workflows/reddit-evening.yml` | Reddit Evening | workflow_dispatch, schedule | signal-intake | modify_alias | `npm run workflow:run` |
| `.github/workflows/social-signal-processing.yml` | Social Signal Processing | workflow_dispatch, schedule | signal-intake | modify_alias | `npm run workflow:run` |
| `.github/workflows/synthesis-weekly.yml` | Weekly Synthesis Builder | workflow_dispatch, schedule | content-expansion | modify_alias | `npm run workflow:run` |
| `.github/workflows/validate.yml` | Validate | workflow_dispatch, push, pull_request | validate | modify | `npm run release:ci-validate` |
| `.github/workflows/whitepaper-release.yml` | Whitepaper Release | workflow_dispatch, schedule | content-expansion | modify_alias | `npm run workflow:run` |
| `.github/workflows/workflow-monitor.yml` | Workflow Monitor | workflow_dispatch, schedule | manual-maintenance | keep | `npm run workflow:monitor` |
