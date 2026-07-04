# Controlled Release Lane

Repo: seq23/sprylabs-hpc-site

Batch D enables a low-cadence controlled traffic-qualified AEO/GEO/SEO citation-intelligence lane. The lane remains shadow/no-op for public content mutation in this artifact.

Command: `npm run release:controlled-citation-intelligence`

Cadence: 15 target units/day, 25 max units/day.

Runtime mutation boundary: generated signal/proof/report/content state only. Governance files, workflow YAML, package manifests, scripts, docs, workflow contracts, strategy contracts, and validation registries are forbidden runtime mutations.

Daily scheduling: enabled at `37 13 * * *` after structural fixture trace, release planner, proof packet, workflow validators, and browserless fallback proof passed in container. Local updater/browser validation remains required.
