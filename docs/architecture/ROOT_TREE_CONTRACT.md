# Spry Labs HPC Root Tree Contract

Status: ACTIVE
Effective: 2026-07-25

## Purpose

The repository root is the deployed static-site root. Public HTML routes therefore remain at the root or in public route directories until a separately approved `dist/` migration occurs. Non-public operations, reports, scripts, data, and documentation must be nested in their canonical system directories.

## Canonical non-public locations

| Material | Canonical location |
|---|---|
| Runtime and validation scripts | `scripts/` |
| Legacy validators still used by the release lane | `scripts/validators/legacy_ops/` |
| Distribution helpers | `scripts/distribution/` |
| Historical root utilities | `scripts/legacy/root-tools/` |
| Canonical content banks | `content/bank/` |
| Agent, citation, release, and workflow data | `data/` |
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
- root-level machine contracts beginning with `_` where the updater and validation control plane require fixed paths.

The root may not receive new ad-hoc reports, migration scripts, temporary shell scripts, phase ledgers, audit notes, or one-off support folders.

## Deployment boundary

This refactor does not move public routes into `dist/` and does not change the Cloudflare Pages output directory. A future source-to-`dist/` migration requires its own approval, route-parity proof, and deployment validation.
