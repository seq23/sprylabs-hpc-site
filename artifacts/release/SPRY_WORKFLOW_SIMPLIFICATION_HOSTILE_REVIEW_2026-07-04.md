# Spry Workflow Simplification Hostile Review

Status: STRUCTURALLY_CHECKED_LOCAL_VALIDATION_REQUIRED

Public workflow count: 6

## Public workflows
- `daily-citation-intelligence.yml`
- `deploy-distribution.yml`
- `postdeploy-public-audit.yml`
- `spry-content-release.yml`
- `spry-full-rebuild.yml`
- `validate-repo.yml`

## Retired public workflows
- `citation-velocity-5k.yml`
- `content-authority-pipeline.yml`
- `daily-insight.yml`
- `execution-strict.yml`
- `reddit-daily.yml`
- `reddit-evening.yml`
- `social-signal-processing.yml`
- `synthesis-weekly.yml`
- `validate.yml`
- `whitepaper-release.yml`
- `workflow-monitor.yml`

## Validation note
release:prepush:container was attempted with increased timeout; sandbox timed out during long build/repair chain. The same gates were decomposed and run isolated after repair.

## Isolated validated commands
- `validate:workflow-contract`
- `validate:workflow-topology`
- `validate:workflow-topology:fixtures`
- `validate:workflow-lineage`
- `validate:workflow-monitor`
- `workflow:hostile-review`
- `validate:workflow-yaml-inventory`
- `validate:workflow-runtime-mutations`
- `validate:workflow-artifacts`
- `validate:repo`
- `validate:validation-registry`
- `agent:artifact-shape:self-test`
- `agent:bhpc:validate`
- `agent:bhpc:trace`
- `validate:agent-run`
- `validate:priority-citation-pages`
- `validate:agent-recommendations`
- `validate:page-admission`
- `validate:graph`
- `validate:distribution`
- `validate:browser-structural`
- `validate:citation-contract`
- `validate:citation-strategy`
- `validate:rendered-schema-parity`
- `validate:retired-route-references`
- `validate:ui-test-parity`
- `validate:browser-suite-contract`
- `validate:traffic-qualified-suite`
- `validate:batch-f-continuity`
- `validate:batch-g-continuity`
- `validate:release-atom-contract`
- `validate:release-mix-policy`
- `validate:citation-phase-manifest`
- `validate:no-keyword-swap-pages`
- `validate:claim-safety`
- `validate:internal-link-velocity`
- `validate:llms-full-coverage`
- `validate:sitemap-coverage`
