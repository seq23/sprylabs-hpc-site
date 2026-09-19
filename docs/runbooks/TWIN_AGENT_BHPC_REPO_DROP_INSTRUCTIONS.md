# Twin Agent Instructions — Spry HPC Repo Drop

Repository:

```text
seq23/sprylabs-hpc-site
```

## Where the drop goes: a branch and a pull request, never `main`

Every Saturday from 2026-08-08 to 2026-09-19 the drop was pushed straight to
`main`, and every one of those pushes turned the repository's validation red,
because nothing checked the artifact before it landed on the branch the site
deploys from. The drop now lands the same way every other change does.

After each citation velocity run:

1. Create a branch from the current `main`, named for the run:

   ```text
   agent-drop/YYYY-MM-DD-<scope>
   ```

   For BHPC on 2026-09-26 that is `agent-drop/2026-09-26-bhpc`.

2. Commit the digest artifacts on that branch, to:

   ```text
   data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/
   ```

   For BHPC, use `data/report_fixes/agent_runs/YYYY-MM-DD/bhpc/`. For another
   vertical, replace `bhpc` with the safe vertical slug, for example
   `data/report_fixes/agent_runs/YYYY-MM-DD/personal-injury/`.

3. Push the branch and open a pull request against `main` titled
   `citation-velocity: <scope> run YYYY-MM-DD`. Validate Repo runs on the pull
   request. When it is green the repository owner lands it; the merge is the
   push event that starts absorption.

**Never push to `main`.** A direct push lands content nothing has validated on
the deploy branch. If it happens anyway, the Main Validation Sentinel moves the
drop onto `agent-drop/YYYY-MM-DD-<scope>`, opens the pull request for it, and
returns `main` to its last validated tree - so the artifact is not lost, but the
run is delayed until a person lands the pull request.

This rule is read by `scripts/validators/validate_agent_drop_gate.mjs`; editing
it here without editing the validator fails the repository's own checks.

## Files

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

## Rules

1. Save the digest/report as HTML, not PDF.
2. Commit CSV + optional JSON + HTML + manifest together, in one commit, on the
   `agent-drop/YYYY-MM-DD-<scope>` branch.
3. Write only to `data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/`.
4. Do not edit generated pages, content registries, scripts, workflows, package
   files, docs, validation files, or public HTML.
5. In `seo_execution[]`, `recommended_page_type` must be one of the types in
   `data/report_fixes/bhpc_seo_execution_policy.json` when `page_decision` is
   `build_new` or `consolidate`. On `repair_existing` an unlisted type is
   recorded as advisory and the edit is executed from `exact_edit`.
6. `target_url` may be an extensionless route (`/download`); the repository
   resolves it to the file that serves it (`download.html`).
7. Once the pull request is merged, the repo absorbs the artifacts, normalizes
   the records, bridges them into social/content signals, plans exact
   repairs/new pages, validates, self-reviews, and commits/pushes hands-off.
