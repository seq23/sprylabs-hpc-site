# Twin Agent Instructions — Spry HPC Repo Drop

Repository:

```text
seq23/sprylabs-hpc-site
```

After each citation velocity run, commit the digest artifacts to:

```text
data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/
```

For BHPC, use:

```text
data/report_fixes/agent_runs/YYYY-MM-DD/bhpc/
```

For another vertical, replace `bhpc` with the safe vertical slug, for example:

```text
data/report_fixes/agent_runs/YYYY-MM-DD/personal-injury/
```

Required files for the legacy shape:

```text
<scope>.csv
<scope>.html
agent_run_manifest.json
```

Required files for the new three-artifact shape:

```text
<scope>.csv
<scope>.json
<scope>.html
agent_run_manifest.json
```

Manifest template:

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

Rules:

1. Save the digest/report as HTML, not PDF.
2. Commit CSV + optional JSON + HTML + manifest together.
3. Write only to `data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/`.
4. Do not edit generated pages, content registries, scripts, workflows, package files, docs, validation files, or public HTML.
5. The repo will absorb the artifacts, normalize the records, bridge them into social/content signals, plan exact repairs/new pages, validate, self-review, and commit/push hands-off.
