# Root Refactor Receipt — 2026-07-25

## Scope

The non-public repository tree was reorganized while preserving the current root-deployed public route contract.

## Moves

- `_ops/validators/` → `scripts/validators/legacy_ops/`
- `_ops/audits/` → `reports/audits/legacy_ops/`
- `_ops/daily-insights/` → `docs/operations/daily-insights/`
- `_ops/query_expansion/` → `data/query_expansion/legacy/`
- `distribution_scripts/` → `scripts/distribution/`
- `content-bank/` → `content/bank/`
- `audit/` → `reports/audits/archive/`
- `proofs/` → `docs/receipts/proofs/`
- `releases/fanout_query_clusters.bhpc.json` → `data/releases/fanout_query_clusters.bhpc.json`
- loose root migration utilities → `scripts/legacy/root-tools/`
- loose historical phase/audit receipts → `docs/receipts/archive/root-history/`

## Preserved at root

Public route HTML, public route directories, Cloudflare control files, package files, updater contracts, validation control-plane manifests, public sitemaps/feeds, and repository identity files remain in their established locations.
