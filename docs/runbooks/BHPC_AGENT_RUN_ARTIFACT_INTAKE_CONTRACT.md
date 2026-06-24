# BHPC Agent Run Artifact Intake Contract

## Purpose

This repository accepts Citation Velocity Monitor / Twin Agent artifacts as one input to the existing governed Content Authority Pipeline. It does not create a second automation system.

The artifact lane is intentionally narrow:

```text
data/report_fixes/agent_runs/YYYY-MM-DD/bhpc/
  bhpc.csv
  bhpc.html
  agent_run_manifest.json
```

There is no vertical segment beyond `bhpc`.

## Required manifest

```json
{
  "source": "twin_agent",
  "run_date": "YYYY-MM-DD",
  "scope": "bhpc",
  "csv_path": "data/report_fixes/agent_runs/YYYY-MM-DD/bhpc/bhpc.csv",
  "html_path": "data/report_fixes/agent_runs/YYYY-MM-DD/bhpc/bhpc.html",
  "status": "READY_FOR_ABSORPTION"
}
```

Accepted statuses:

- `READY_FOR_ABSORPTION`
- `ABSORBED`
- `QUARANTINED`

`pdf_path` is retired for this repo. The email digest must be committed as HTML.

## Hands-off behavior

The consolidated workflow is:

```text
Atomic Twin artifact commit under data/report_fixes/agent_runs/YYYY-MM-DD/bhpc/ with agent_run_manifest.json as the workflow trigger
→ Content Authority Pipeline push trigger
→ BHPC artifact validator
→ BHPC artifact absorber
→ normalized agent run JSON
→ social signal bridge
→ existing content:pipeline
→ governed programmatic lane
→ build:all
→ validate:all
→ workflow hostile review
→ workflow monitor validation
→ commit/push if changed
```

If no artifact arrives, the scheduled Content Authority Pipeline still runs the existing content mechanism. If an artifact arrives but does not produce enough content signals, the existing content mechanism fills the gap.

## Twin Agent write boundary

Twin may write only inside the agent-run artifact folder:

```text
data/report_fixes/agent_runs/YYYY-MM-DD/bhpc/
```

The workflow trigger is intentionally narrower than the write boundary: only `agent_run_manifest.json` starts the Content Authority Pipeline. CSV and HTML alone must not trigger the workflow.

Twin must not edit workflows, package files, scripts, docs, generated public pages, registries, or validation artifacts.

## Repo-owned outputs

The repository owns these outputs after absorption:

```text
data/report_fixes/normalized_agent_runs/YYYY-MM-DD_bhpc.json
data/social/runs/YYYY-MM-DD-bhpc-agent.json
data/citation/agent_runs/YYYY-MM-DD-bhpc.json
reports/bhpc-agent-absorption.json
reports/bhpc-agent-data-trace.json
artifacts/validation/bhpc-agent-run-intake.json
artifacts/validation/bhpc-agent-data-trace.json
```

## Validation commands

```bash
npm run agent:bhpc:validate
npm run agent:bhpc:absorb
npm run agent:bhpc:trace
npm run validate:workflow-contract
npm run validate:workflow-lineage
npm run validate:workflow-monitor
```
