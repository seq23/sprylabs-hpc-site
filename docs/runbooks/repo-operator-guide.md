# Repo Operator Guide

This guide explains how to reason about the repo without changing public URLs.

## Public site vs operator layer

### Public site
- root-level HTML pages
- family folders serving public routes
- `insights/` for published daily articles
- `/coverage/` for current-state coverage understanding

### Operator layer
- `_ops/` for validators, audits, manifests, and visibility files
- `content/insights/_drafts/` for daily insight source drafts
- `docs/runbooks/` for workflow docs

## Daily article workflow

Source drafts:
- `content/insights/_drafts/`

Published output:
- `insights/`

Visibility layer:
- `/_ops/daily-insights/preview-index.md`
- `/_ops/daily-insights/touched-files-YYYY-MM-DD.txt`
- `/_ops/daily-insights/manifest.json`

## Historical artifacts
Historical phase reports and one-off repo artifacts should live under:
- `_ops/artifacts/root-history/`

They should not accumulate at the repo root unless a script explicitly requires that location.
