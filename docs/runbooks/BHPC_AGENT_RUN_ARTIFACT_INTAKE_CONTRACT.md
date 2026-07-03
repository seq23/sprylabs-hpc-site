# Agent Run Artifact Intake Contract

## Purpose

This repository accepts Citation Velocity Monitor / Twin Agent artifacts as one input to the existing governed Content Authority Pipeline. It does not create a second automation system.

The artifact lane accepts the legacy BHPC two-file shape and the newer cross-vertical three-file shape.

## Accepted folder shape

```text
data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/
  agent_run_manifest.json
  <scope>.csv      # required unless JSON/HTML-only fallback is intentional
  <scope>.json     # optional; required for the new scoreboard/pages_to_build shape
  <scope>.html     # required digest/report artifact
```

`<scope>` must be a safe slug such as `bhpc`, `personal-injury`, `dentistry`, or another future vertical. The folder name remains the source location; the manifest `scope` may be present for clarity.

Legacy BHPC runs continue to work here:

```text
data/report_fixes/agent_runs/YYYY-MM-DD/bhpc/
  bhpc.csv
  bhpc.html
  agent_run_manifest.json
```

## Required manifest

```json
{
  "source": "twin_agent",
  "run_date": "YYYY-MM-DD",
  "scope": "<scope>",
  "csv_path": "data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/<file>.csv",
  "json_path": "data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/<file>.json",
  "html_path": "data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/<file>.html",
  "status": "READY_FOR_ABSORPTION"
}
```

Accepted statuses:

- `READY_FOR_ABSORPTION`
- `ABSORBED`
- `QUARANTINED`

`json_path` is optional for legacy BHPC artifacts. The newer artifact shape should include it so the workflow can trace `scoreboard.total`, fix rows, and `pages_to_build`.

`pdf_path` is retired for this repo. The email digest/report must be committed as HTML.

## New JSON shape support

The repo now traces and absorbs JSON artifacts with this shape:

```json
{
  "run_date": "YYYY-MM-DD",
  "vertical": "<scope>",
  "scoreboard": {"total": 36},
  "free_wins": [],
  "page_fixes": [],
  "outperform": [],
  "authority_required": [],
  "wins": [],
  "pending": [],
  "pages_to_build": []
}
```

The intake lane records:

- CSV row count
- JSON fix row count
- JSON scoreboard total
- JSON `pages_to_build` count
- normalized run path
- social bridge path
- exact implementation plan coverage

`pages_to_build` entries become forward-only new page specs under `agent/<scope>/...html` unless a manifest or future planner gives a more specific route.

## Hands-off behavior

The consolidated workflow is:

```text
Atomic Twin artifact commit under data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/ with agent_run_manifest.json as the workflow trigger
→ Content Authority Pipeline push trigger
→ artifact validator
→ artifact absorber
→ normalized agent run JSON
→ social signal bridge
→ exact implementation planner
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
data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/
```

The workflow trigger is intentionally narrower than the write boundary: only `agent_run_manifest.json` starts the Content Authority Pipeline. CSV, JSON, and HTML alone must not trigger the workflow.

Twin must not edit workflows, package files, scripts, docs, generated public pages, registries, or validation artifacts.

## Repo-owned outputs

The repository owns these outputs after absorption:

```text
data/report_fixes/normalized_agent_runs/YYYY-MM-DD_<scope>.json
data/social/runs/YYYY-MM-DD-<scope>-agent.json
data/citation/agent_runs/YYYY-MM-DD-<scope>-agent.json
reports/bhpc-agent-absorption.json
reports/bhpc-agent-data-trace.json
artifacts/validation/bhpc-agent-run-intake.json
artifacts/validation/bhpc-agent-data-trace.json
```

The file names retain the existing `bhpc-agent-*` validator names so current workflows continue to work without a workflow split.

## Validation commands

```bash
npm run agent:bhpc:validate
npm run agent:bhpc:absorb
npm run agent:bhpc:trace
npm run agent:bhpc:plan-exact
npm run agent:bhpc:apply-exact
npm run agent:bhpc:trace-exact
npm run agent:bhpc:validate-exact
npm run validate:workflow-contract
npm run validate:workflow-lineage
npm run validate:workflow-monitor
```

## Raw artifact preservation law

After a run is absorbed, the raw source folder must remain present:

```text
data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/
```

For every absorbed normalized run, the repo must retain:

- `agent_run_manifest.json`
- one HTML digest/report artifact
- at least one source payload: CSV or JSON

Generated normalized files, social bridge files, reports, public pages, and validation artifacts do not replace the raw run folder.

A raw run folder may be removed only through an explicit retirement artifact or manual governance decision. Silent deletion is invalid.

