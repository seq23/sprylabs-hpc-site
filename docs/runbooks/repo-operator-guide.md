# Repo Operator Guide

This guide explains how to reason about the repo without changing public URLs.

## Public site vs operator layer

### Public site
- root-level HTML pages
- family folders serving public routes
- `insights/` for published daily articles
- `/coverage/` for current-state coverage understanding

### Operator layer
- `scripts/validators/legacy_ops/` for retained legacy validators
- `reports/audits/` for audit evidence
- `docs/operations/` for release visibility files
- `content/insights/_drafts/` for daily insight source drafts
- `docs/runbooks/` for workflow docs

## Daily article workflow

Source drafts:
- `content/insights/_drafts/`

Published output:
- `insights/`

Visibility layer:
- `/docs/operations/daily-insights/preview-index.md`
- `/docs/operations/daily-insights/touched-files-YYYY-MM-DD.txt`
- `/docs/operations/daily-insights/manifest.json`

## Historical artifacts
Historical phase reports and one-off repo artifacts should live under:
- `docs/receipts/archive/root-history/`

They should not accumulate at the repo root unless a script explicitly requires that location.
