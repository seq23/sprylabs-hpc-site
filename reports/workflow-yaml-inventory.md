# Workflow YAML Inventory

Workflow count: 6

| Workflow | Lane | Command | Status |
|---|---|---|---|
| `.github/workflows/daily-citation-intelligence.yml` | citation-intelligence | `npm run workflow:daily-citation-intelligence` | keep_simplified |
| `.github/workflows/deploy-distribution.yml` | distribution | `npm run distribution:deploy` | keep_simplified |
| `.github/workflows/postdeploy-public-audit.yml` | public-audit | `npm run postdeploy:public-click-audit` | keep_simplified |
| `.github/workflows/spry-content-release.yml` | content-release | `npm run workflow:run` | keep_simplified |
| `.github/workflows/spry-full-rebuild.yml` | full-rebuild | `npm run workflow:run` | keep_simplified |
| `.github/workflows/validate-repo.yml` | release-validation | `npm run release:ci-validate` | keep_simplified |
