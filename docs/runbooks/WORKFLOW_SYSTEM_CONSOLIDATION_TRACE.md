# Workflow System Consolidation Trace

## Decision

The repo now uses one governed workflow system. BHPC agent artifacts feed the existing Content Authority Pipeline instead of creating a second scheduled or agent-only workflow.

## Content Authority Pipeline inputs

- Existing social/reddit/community/citation sources
- `data/report_fixes/agent_runs/**/agent_run_manifest.json` BHPC agent artifact completion signal
- `data/social/runs/**` existing social run backlog
- `data/citation/**` citation strategy and agent evidence

## Trigger model

- Scheduled Content Authority Pipeline keeps existing content cadence.
- Push to `data/report_fixes/agent_runs/**/agent_run_manifest.json` triggers the same Content Authority Pipeline.
- Other governed workflows retain their existing cadence.

## Gap-fill rule

Artifacts are additive. They do not replace the existing content mechanism. If an artifact yields too few records, the workflow still runs the normal content pipeline and fills the remaining output opportunity from current sources.

## Required proof

- Workflow contract validation
- Workflow lineage/data trace for every governed workflow
- Workflow monitor static/live mode
- BHPC artifact validation
- BHPC artifact absorption trace
- Hostile review for modified workflow behavior
