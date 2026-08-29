# Workflow YAML Topology — Spry

**Status:** Active topology overhaul  
**Scope:** `.github/workflows/*.yml` and workflow contracts.

## Canonical lanes

Every workflow maps to exactly one lane:

1. validate
2. content-authority
3. signal-intake
4. content-expansion
5. citation-expansion
6. daily-citation-intelligence
7. deploy
8. release-verify

## Runtime mutation law

Scheduled or mutating workflows may mutate generated state only. They may not mutate governance.

Forbidden runtime mutations:

- `.github/**`
- `package.json`
- `package-lock.json`
- `scripts/**`
- `docs/**`
- `_repo*.json`
- `_validation_registry.json`
- `config/authority/citation_intelligence_contract.json`
- `config/release/content_release_contract.json`
- workflow contracts
- strategy contracts

Allowed generated-state mutations:

- `data/signals/**`
- `artifacts/validation/**`
- `reports/**`
- generated `*.html` authority/reference pages admitted by existing page-family contracts
- `sitemap*.xml`
- `llms*.txt`
- `feed.*`
- `data/routes/public_route_manifest.json`
- `data/routes/critical_browser_route_manifest.json`

## Overhaul inventory summary

The repo retains legacy workflow identities only where they map cleanly to canonical lanes and GitHub continuity matters. The new Daily Citation Intelligence workflow is admitted as a manual, proof-producing lane until local validation decides whether scheduling should remain enabled.

Full machine inventory lives at:

- `artifacts/validation/workflow-yaml-inventory.json`
- `reports/workflow-yaml-inventory.md`
