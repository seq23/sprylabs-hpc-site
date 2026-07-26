# Daily Insights Operator Guide

This folder is the operator visibility layer for the repo's daily publishing workflow.

It answers:
- what changed today
- what daily insight pages are live or newly added
- where daily insight source files live
- how content families are organized

## Files in this folder

### `manifest.json`
Machine-readable inventory of notable tracked daily-insight and mechanism/page additions.
Use this when you want a structured list of routes, families, and touched files.

### `preview-index.md`
Human-readable release digest.
Use this first when you want a quick summary.

### `touched-files-YYYY-MM-DD.txt`
Exact touched-file log for a release day.
Use this when you need file-level specificity.

### `CONTENT_FAMILY_MAP.md`
Plain-English map of the repo's major content families.
Use this when you need to understand where things live conceptually.

## Where daily articles live

### Source drafts
`content/insights/_drafts/`

This is the source-draft layer used by the daily/reddit velocity workflow.
Draft filenames are date-prefixed markdown files.

### Published HTML pages
`insights/`

This is the published route layer for daily insight articles.
The site serves these as public pages.

## Daily workflow reference
Main workflow commands live in `package.json` and scripts under:
- `scripts/reddit/`
- `docs/runbooks/reddit-velocity-engine.md`
- `docs/runbooks/daily-auto-publish.md`

## Scope rule
This folder is visibility-only.
It should not become a second publishing system.
