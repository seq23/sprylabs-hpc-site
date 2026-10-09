# Twin Agent Instructions — Spry HPC Repo Drop

Repository:

```text
seq23/sprylabs-hpc-site
```

## Where the drop goes: a branch, never `main`

Every Saturday from 2026-08-08 to 2026-09-26 the drop was pushed straight to
`main`, and every one of those pushes turned the repository's validation red.
That is not a flaw in any one artifact: a drop is repair instructions for live
pages, so `main` is only valid once those pages have been rebuilt from it. The
drop therefore lands in the same commit as the pages it repairs, and only the
repository's release lane makes that commit.

After each citation velocity run:

1. Create a branch from the current `main`, named for the run:

   ```text
   agent-drop/YYYY-MM-DD-<scope>
   ```

   For BHPC on 2026-10-03 that is `agent-drop/2026-10-03-bhpc`.

2. Commit the digest artifacts on that branch, to:

   ```text
   data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/
   ```

   For BHPC, use `data/report_fixes/agent_runs/YYYY-MM-DD/bhpc/`. For another
   vertical, replace `bhpc` with the safe vertical slug, for example
   `data/report_fixes/agent_runs/YYYY-MM-DD/personal-injury/`.

3. Push the branch. That is the whole hand-off. Opening a pull request titled
   `citation-velocity: <scope> run YYYY-MM-DD` is welcome but not required.

The push starts **Agent Drop Intake**, which checks that the branch holds only
the run directory and hands it to **Spry Content Release**. The release lane
lays the drop onto the tip of `main`, absorbs it, rebuilds the pages it repairs,
validates the result, and pushes drop + pages as one commit. It then closes the
pull request (if any) and deletes the branch. If the intake refuses the
artifact, nothing reaches `main`; the refusal is named on the run and on the
pull request.

**Never push to `main`.** The branch is the road. If a drop reaches `main`
anyway, it can no longer turn `main` red: a `READY_FOR_ABSORPTION` run is inert
everywhere except Spry Content Release (the only lane that sets
`BHPC_ABSORB_READY_RUNS=1`), so Validate Repo validates the tree the commit
actually holds, and the release lane - started by that same push - absorbs the
drop and commits it with its pages, or fails by name without touching `main`.
(GitHub cannot refuse the push itself: a ruleset on this user-owned repository
cannot list GitHub Actions as a bypass actor - API 422 "Actor GitHub Actions
integration must be part of the ruleset source or owner organization",
2026-09-26 - so requiring pull requests would also stop the release lanes.)

What a drop is (directory shape, manifest, branch name) is defined once, in
`.github/scripts/agent_drop_contract.mjs`. This rule is read by
`scripts/validators/validate_agent_drop_gate.mjs`; editing it here without
editing the validator fails the repository's own checks.

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
2. Commit CSV + optional JSON + HTML + manifest together on the
   `agent-drop/YYYY-MM-DD-<scope>` branch, and nothing else: a branch that
   touches any file outside its run directory is refused whole.
3. Write only to `data/report_fixes/agent_runs/YYYY-MM-DD/<scope>/`.
4. Do not edit generated pages, content registries, scripts, workflows, package
   files, docs, validation files, or public HTML.
5. In `seo_execution[]`, `recommended_page_type` must be one of the types in
   `data/report_fixes/bhpc_seo_execution_policy.json` when `page_decision` is
   `build_new` or `consolidate`. On `repair_existing` an unlisted type is
   recorded as advisory and the edit is executed from `exact_edit`.
6. `target_url` may be an extensionless route (`/download`); the repository
   resolves it to the file that serves it (`download.html`).
7. Once the branch is pushed, the repo absorbs the artifacts, normalizes the
   records, bridges them into social/content signals, plans exact repairs/new
   pages, validates, self-reviews, and commits/pushes hands-off.
8. A `target_url` that the site 301-redirects is resolved through `_redirects`
   to the page that serves it.
