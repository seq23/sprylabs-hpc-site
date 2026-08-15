# Governed Workflow Operations Runbook

## Scope

This runbook governs the three high-impact scheduled generators:

- Content Authority Pipeline
- Daily Insight
- Execution Strict

Each workflow is executable both by its cron schedule and by GitHub Actions `workflow_dispatch`. The machine-readable source of truth is `data/workflows/workflow_contracts.json`.

## Execution chain

Each workflow follows the same enforced chain:

1. GitHub checks out the full `main` history.
2. Node 24 and npm cache are initialized.
3. Dependencies install with `npm ci --ignore-scripts`.
4. `workflow:run` opens a governed trace.
5. `programmatic:run-lane` snapshots public HTML, executes the named workflow command, rebuilds the canonical site, validates candidates, quarantines rejected output, and runs `validate:all`.
6. Existing admitted pages preserve their original admission lane and provenance during rebuilds.
7. The hostile review checks required outputs, forbidden source changes, cleared candidate state, and manual-page admission integrity.
8. Monitor validation verifies schedule/manual triggers, runner wiring, trace completeness, and artifact upload.
9. The workflow uploads its trace and hostile-review report even when the workflow fails.
10. Generated changes are committed only after all governed checks pass.

## Data lineage

The executable lineage registry records, per workflow:

- source workflow file;
- schedule;
- manual-dispatch availability;
- package command;
- programmatic lane;
- input file patterns;
- output file patterns;
- required outputs;
- allowed generated changes;
- forbidden source/governance changes;
- maximum monitor age.

Run:

```bash
npm run validate:workflow-lineage
```

The report is written to `reports/workflow-lineage.json`.


## Generated route-proof manifests

Public-route and browser-suite proof manifests are generated route inventory, not hand-edited source. When a governed workflow admits or quarantines pages, it may regenerate:

- `data/routes/public_route_manifest.json`
- `data/routes/critical_browser_route_manifest.json`
- `config/validation/browser_suite_contract.json`

The hostile review still forbids workflow, package, script, docs, test, and config mutation. Route-proof manifest changes are allowed only because they describe the current public route set required by `validate:ui-test-parity` and `validate:browser-suite-contract`.

## Manual actions

In GitHub:

1. Open **Actions**.
2. Select the workflow.
3. Select **Run workflow**.
4. Use branch `main`.
5. Run it.
6. Open the uploaded `workflow-trace-<id>-<run-number>` artifact if the run fails.

Local diagnostic commands:

```bash
npm run workflow:run -- --workflow content-authority -- npm run programmatic:run-lane -- --lane authority -- npm run workflow:content-authority
npm run workflow:run -- --workflow daily-insight -- npm run programmatic:run-lane -- --lane daily_insight -- npm run workflow:daily-insight
npm run workflow:run -- --workflow execution-strict -- npm run programmatic:run-lane -- --lane authority -- npm run workflow:execution-strict
```

## Scheduled actions

- Execution Strict: `0 14 * * *`
- Content Authority Pipeline: `17 14 * * *`
- Daily Insight: `20 14 * * *`
- Workflow Health Monitor: `35 15 * * *`

The monitor checks the latest completed GitHub run for each governed workflow. A failed or stale latest run is a hard failure and creates a visible Actions alert.

## Failure decision tree

- Command failure: inspect the trace's exit code and the last programmatic stage.
- Admission failure: inspect candidate results and rejection backlog; do not weaken the admission rules.
- Manual-page provenance drift: repair the runner so existing registry ownership is preserved.
- Hostile-review failure: inspect forbidden changed files and required outputs; source/governance mutation by a scheduled generator is not allowed.
- Monitor failure: manually run the named workflow after the source fix and confirm a successful completed run.
- Browser failure: repair the represented route or the test only when evidence proves the expectation is stale. Never reduce the suite to manufacture green.


## Generated-state push collision policy

All eight repository-mutating workflows are governed by `data/workflows/workflow_contracts.json`:

- Content Authority Pipeline
- Daily Insight
- Execution Strict
- Reddit Daily
- Reddit Evening
- Social Signal Processing
- Weekly Synthesis Builder
- Whitepaper Release

Every workflow supports manual dispatch and its declared schedule, runs through the governed trace wrapper, performs hostile review and lineage validation, and uploads its final trace after the push step.

Generated ledgers and rendered outputs are not line-merged. When `main` advances before a workflow can push, the shared helper:

1. discards the stale generated commit;
2. resets to the current remote head;
3. reruns the workflow from its machine-readable contract;
4. repeats canonical validation, hostile review, and trace generation;
5. recommits the regenerated result and retries the push.

This prevents rebase conflicts in shared generated files while preserving the newest admitted repository state.

## Agent intake invariants — 2026-08-15 hostile review

These are hard control-plane invariants for the BHPC/Spry agent-intake lane:

1. **Cross-section evidence is one intake truth.** A page opportunity must inherit evidence from matching result records in the same intake artifact; JSON sections are not isolated authorities.
2. **Named-creator attribution fails closed.** When a query requires creator-specific evidence, an unrelated URL cannot satisfy the gate. First-party evidence domains required by the query must be present.
3. **CREATE intent is stable across reruns.** A route created from `pages_to_build` / `new_page_opportunities` remains a source-intent CREATE on later runs even after the file exists. File existence alone must not reclassify source intent as a repair.
4. **BLOCKED and REQUIRED cannot coexist on one run/scope/route.** The acceptance compiler uses most-restrictive-wins and the standalone acceptance validator independently rejects any unresolved REQUIRED/BLOCKED contradiction before rendering.
5. **Generated pages must be substantive, query-specific output.** The rich-page validator rejects thin or duplicated direct-answer boilerplate and requires first-party evidence to be visibly rendered when the acceptance spec requires it.
6. **Source multiplicity is provenance, not repeated public copy.** Duplicate JSON/CSV/page-spec records for one semantic query are consolidated in visible rendering while all record IDs and evidence URLs remain in machine-readable provenance metadata.
7. **Public-root validators must execute against the staged canonical root.** Standalone validators that read rendered pages use `scripts/site_layout/run_with_public_root.mjs`; never treat the repository shell as the public page tree.
8. **Normalization contract changes reabsorb governed ABSORBED runs.** Parser/evidence contract upgrades must bump the normalization contract version so stale normalized artifacts cannot silently bypass new intake law.
