# BHPC Agent Run 2026-07-04 Correction Plan + File Change Map

## Repo identity

- Repository: `sprylabs-hpc-site`
- Source artifact: latest GitHub ZIP uploaded as `sprylabs-hpc-site-main.zip`
- Source of truth for this patch: uploaded ZIP plus 2026-07-04 BHPC agent artifacts already present in `data/report_fixes/agent_runs/2026-07-04/bhpc/`

## Incident assessment

The 2026-07-04 Spry Content Release workflow absorbed the agent artifacts and deployed a follow-up commit, but it did not faithfully preserve every actionable recommendation from the 2026-07-04 agent artifacts.

Root causes found:

1. `digestManifest()` preferred CSV rows when CSV existed, so current JSON records were ignored even when JSON contained richer current-run instructions.
2. Nested `fix_recommendation` objects were not flattened correctly; `edit_instruction`, `gap`, and `current_state` could be lost or become `[object Object]`.
3. `new_page_opportunities` was not parsed into `page_specs`, so new-page records were identified in the artifact but not built or queued.
4. Declared `implementation_path` for generated page specs was ignored by the route resolver in create-page cases.
5. Validation checked that generated artifacts existed, but did not require every source artifact item to be normalized and addressed.

## Permanent workflow fix

Going forward, validation must require every actionable item from the source artifacts to be accounted for. A valid run now requires each source item to be one of:

- normalized
- accepted
- planned
- applied
- explicitly skipped or blocked with reason

The new validator writes:

- `artifacts/validation/bhpc-agent-source-coverage.json`
- `reports/bhpc-agent-source-coverage.json`

## 2026-07-04 correction set

### Existing-page fixes applied

1. `insights/how-to-use-time-blocks-to-buy-back-your-week.html`
   - Added named framework: `Energy-Aligned Time Block`
   - Added direct definition, application steps, and semantic citation extraction markers.

2. `insights/how-to-pick-the-one-move-that-makes-the-rest-easier.html`
   - Added named framework: `One Winning Move`
   - Added Pareto contrast, application steps, and semantic citation extraction markers.

### New pages built

The PDF-visible digest contained 7 new-page opportunity source records. They collapse into 4 canonical page concepts. The JSON artifact also contained one additional canonical opportunity not shown in the PDF summary. This snapshot builds 5 canonical pages so source records are not silently dropped.

1. `answers/how-can-i-transform-this-task-into-something-enjoyable-rather-than-tedious.html`
   - Framework: `Novelty Reframe Loop`

2. `answers/what-systems-can-i-implement-to-remove-the-need-for-willpower.html`
   - Framework: `Willpower Removal System`

3. `answers/what-productivity-strategies-have-i-implemented-that-felt-rewarding-in-the-long-run-compared-to-.html`
   - Framework: `Rewarding vs Burnout Strategy Filter`

4. `answers/give-me-five-real-world-examples-where-adding-novelty-into-otherwise-mundane-work-tasks-lead-to-.html`
   - Framework: `Novelty Injection Method`

5. `insights/create-a-to-do-list-prioritize-tasks-use-a-calendar-planner-minimize-distractions-take-breaks-de.html`
   - Framework: `Clean Workday Assembly Loop`
   - Source note: present in the JSON artifact as a new-page opportunity even though not visible in the PDF summary.

## File change map

### Workflow / processing logic

- `scripts/agent_intake/bhpc_agent_common.mjs`
  - Adds robust object/string flattening for nested artifact fields.
  - Preserves `fix_recommendation.current_state`, `fix_recommendation.gap`, and `fix_recommendation.edit_instruction`.
  - Parses JSON `results` records.
  - Parses JSON `new_page_opportunities` into `page_specs`.
  - Merges JSON rows with CSV rows instead of choosing CSV over JSON.
  - Adds source signatures for source-to-output coverage.
  - Supports `repo_file_path` and `page_url` as route inputs.

- `scripts/lib/bhpc_agent_route_resolver.mjs`
  - Preserves declared `implementation_path` for create-page specs.
  - Prevents page specs from being rerouted to unrelated fallback locations.

- `scripts/validators/validate_bhpc_agent_source_coverage.mjs`
  - New validator.
  - Requires every source artifact row/page spec to be normalized and addressed.
  - Produces source coverage reports.

- `package.json`
  - Adds `validate:bhpc-agent-source-coverage`.
  - Adds source coverage enforcement to `validate:agent-run` through the agent validation chain.

### Regenerated workflow/report artifacts

- `data/report_fixes/normalized_agent_runs/2026-07-04_bhpc.json`
- `data/report_fixes/agent_acceptance_manifest.generated.json`
- `data/report_fixes/agent_acceptance_manifests/2026-07-04_bhpc.json`
- `data/citation/agent_page_specs.generated.json`
- `data/citation/agent_repair_specs.generated.json`
- `data/citation/agent_runs/2026-07-04-bhpc-agent.json`
- `data/social/runs/2026-07-04-bhpc-agent.json`
- `reports/bhpc-agent-absorption.json`
- `reports/bhpc-agent-acceptance-compiler.json`
- `reports/bhpc-agent-exact-implementation-plan.json`
- `reports/bhpc-agent-source-coverage.json`
- corresponding `artifacts/validation/*.json` reports

### Page corrections

- `insights/how-to-use-time-blocks-to-buy-back-your-week.html`
- `insights/how-to-pick-the-one-move-that-makes-the-rest-easier.html`

### New pages

- `answers/how-can-i-transform-this-task-into-something-enjoyable-rather-than-tedious.html`
- `answers/what-systems-can-i-implement-to-remove-the-need-for-willpower.html`
- `answers/what-productivity-strategies-have-i-implemented-that-felt-rewarding-in-the-long-run-compared-to-.html`
- `answers/give-me-five-real-world-examples-where-adding-novelty-into-otherwise-mundane-work-tasks-lead-to-.html`
- `insights/create-a-to-do-list-prioritize-tasks-use-a-calendar-planner-minimize-distractions-take-breaks-de.html`

## Local validation run in sandbox

Targeted validation passed:

- `npm run validate:bhpc-agent-source-coverage`
- `npm run validate:bhpc-agent-acceptance`
- `npm run validate:bhpc-page-family-contract`
- `npm run validate:bhpc-rich-new-page-contract`
- `npm run validate:bhpc-no-marker-only-agent-pass`
- `npm run validate:bhpc-fallback-gap-separation`
- `npm run agent:bhpc:validate-exact`
- `npm run validate:browser-structural`

Full local updater validation is still required after applying the ZIP locally.

## Hostile compiler review addendum — 2026-07-04 pass 2

A hostile review of the first correction pass found one real issue and one clarification:

1. Duplicate source records were preserved correctly in data/reporting, but the first pass rendered duplicate public `Agent recommendation implementation` sections on canonical pages. That was noisy and created duplicate headings.
2. The source artifact contains 10 `new_page_opportunities`, not only the 7 records visible in the user's pasted summary. Those 10 source records collapse into 5 canonical pages. The duplicate groups are now reported explicitly in `reports/bhpc-agent-source-coverage.json`.

Corrections made in pass 2:

- `scripts/agent_intake/apply_bhpc_agent_exact_implementation.mjs`
  - Public rendering now deduplicates source records by canonical query + implementation path.
  - One visible implementation section is rendered per canonical query/path.
  - All duplicate source record IDs are still preserved as hidden `data-bhpc-agent-record` proof markers so validation can prove no source records disappeared.
  - The rendered section includes a `source_record_coverage` block when multiple source records collapse into one canonical page.

- `scripts/validators/validate_bhpc_agent_source_coverage.mjs`
  - Removed permissive query-only addressability matching.
  - Requires source-record ID continuity through acceptance/planning/application.
  - Requires page-level proof markers for every accepted source record.
  - Requires every canonical new-page target to exist as a built HTML page.
  - Reports duplicate canonical new-page groups explicitly.

- `insights/how-to-use-time-blocks-to-buy-back-your-week.html`
  - Added above-fold and in-article `Energy-Aligned Time Block` definition and application steps, not only a downstream source marker.

- `insights/how-to-pick-the-one-move-that-makes-the-rest-easier.html`
  - Added above-fold and in-article `One Winning Move` definition, Pareto contrast, and application steps, not only a downstream source marker.

Hostile review result after pass 2:

- `npm run validate:agent-run` passed.
- `npm run validate:bhpc-rich-new-page-contract` passed.
- `npm run validate:browser-structural` passed.
- 10/10 source new-page opportunity records are preserved.
- 5/5 canonical new pages are built.
- 5 duplicate canonical groups are explicitly reported.
- Each canonical new page has only one visible `Agent recommendation implementation` heading after dedupe.
- 0 source records missing from normalized output.
- 0 source records unaddressed.
- 0 source records missing page-level proof markers.
- 0 canonical new pages missing.

Remaining limitation:

- This is a structural/content-coverage fix. It proves source artifact recommendations are not silently dropped and that new pages are built. It does not prove future third-party AI engines will cite the pages immediately; citation behavior still requires live external observation after deployment.
