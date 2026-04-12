# Insights Source Layer

This directory is the source layer for the site's daily insight publishing workflow.

## Key paths

### `_drafts/`
Date-prefixed markdown source files for daily insight generation and publishing.

### `_clusters.json`
Cluster/supporting metadata used by the insight workflow.

## Published output
Source drafts from this directory are published into the public `insights/` directory as HTML pages.

## Operator shortcut
If you want to understand what daily articles look like:
1. inspect `content/insights/_drafts/` for source markdown
2. inspect `insights/` for public HTML output
3. inspect `/_ops/daily-insights/preview-index.md` and `manifest.json` for release visibility
