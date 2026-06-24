# Twin Agent Instructions — BHPC Repo Drop

Repository:

```text
seq23/sprylabs-hpc-site
```

After each BHPC citation velocity run, commit the email digest artifacts to:

```text
data/report_fixes/agent_runs/YYYY-MM-DD/bhpc/
```

Required files:

```text
bhpc.csv
bhpc.html
agent_run_manifest.json
```

Manifest template:

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

Rules:

1. Save the email digest as HTML, not PDF.
2. Commit CSV + HTML + manifest together.
3. Write only to `data/report_fixes/agent_runs/**`.
4. Do not edit generated pages, content registries, scripts, workflows, package files, docs, validation files, or public HTML.
5. The repo will absorb the artifacts, normalize the records, bridge them into social/content signals, continue the existing content cadence, validate, self-review, and commit/push hands-off.
