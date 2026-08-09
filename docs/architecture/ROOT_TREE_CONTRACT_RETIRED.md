# RETIRED — Root Tree Contract

This historical contract is no longer active governance. Repository organization is now handled by the source/build layout (`site/public` → `dist`) and route-parity validation, not root aesthetics.

# Spry Labs HPC Root Tree Contract

Status: RETIRED — HISTORICAL SNAPSHOT
Former effective date: 2026-07-25

## Historical purpose (no longer controlling)

The repository root was the deployed static-site root under this retired contract. Public HTML routes therefore remain at the root or in public route directories until a separately approved `dist/` migration occurs. Non-public operations, reports, scripts, data, and documentation must be nested in their canonical system directories.

## Canonical non-public locations

| Material | Canonical location |
|---|---|
| Runtime and validation scripts | `scripts/` |
| Legacy validators still used by the release lane | `scripts/validators/legacy_ops/` |
| Distribution helpers | `scripts/distribution/` |
| Historical root utilities | `scripts/legacy/root-tools/` |
| Canonical content banks | `content/bank/` |
| Agent, citation, release, and workflow data | `data/` |
| Internal domain contracts | `config/agent/`, `config/authority/`, `config/release/`, `config/validation/` |
| Public/critical route manifests | `data/routes/` |
| Operational instructions | `docs/operations/` and `docs/runbooks/` |
| Current and historical receipts | `docs/receipts/` |
| Audit output and historical audit evidence | `reports/audits/` |
| Generated validation evidence | `artifacts/validation/` and `reports/` |

## Root allowlist

The root may contain:

- public HTML route files;
- public route directories and public collection directories;
- required package and repository identity files;
- Cloudflare static control files;
- public discovery files such as sitemaps, feeds, `robots.txt`, and LLM files;
- only the explicit root-level updater, packaging, lifecycle, and validation-bootstrap contracts whose fixed paths form the repository interface. Arbitrary underscore-prefixed JSON files are not automatically admitted.

The root may not receive new ad-hoc reports, migration scripts, temporary shell scripts, phase ledgers, audit notes, one-off support folders, or domain-specific internal contracts. Ordinary cleanup drift is reported as a warning rather than a release failure; secret-like or credential material remains a hard failure.

## Deployment boundary

This refactor does not move public routes into `dist/` and does not change the Cloudflare Pages output directory. A future source-to-`dist/` migration requires its own approval, route-parity proof, and deployment validation.
