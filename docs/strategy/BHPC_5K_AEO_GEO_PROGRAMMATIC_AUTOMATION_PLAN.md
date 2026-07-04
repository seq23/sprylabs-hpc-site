# BHPC 5K AEO/GEO Programmatic Automation Plan

Status: Active
Source baseline: `sprylabs-hpc-site-main_BASELINE_06-21-26_9b6df023.zip`

## Operating target

The repository currently operates around the 2K admitted-page level. The next threshold is 5K admitted AEO/GEO reference surfaces. The required delta is about 3K additional admitted pages.

The operating pace is 75 generated/admitted surfaces per day until the 5K target is reached.

## Automation rule

No daily manual production is required after this system is merged.

The daily workflow is:

1. GitHub Actions runs `.github/workflows/citation-velocity-5k.yml` on schedule.
2. The workflow invokes the governed workflow runner.
3. The governed runner invokes the admitted programmatic lane `citation_velocity_batch`.
4. The atom generator selects the next 75 unused atoms.
5. The generator renders pages and candidate metadata.
6. The existing programmatic admission system validates and admits only passing pages.
7. Canonical validators run.
8. The safe commit helper commits and pushes generated state only if there are changes.
9. Workflow trace artifacts are uploaded.

## Atom source

The atom source is `data/citation_velocity/atom_axes.json`.

It contains deterministic axes:

- concepts
- audiences
- problem states
- verbs
- outcomes
- comparison entities
- platform workflows
- brand-defense questions

The generator does not freestyle daily content. It expands these governed atoms into query/path/page candidates.

## Daily mix

The default daily batch is 75 pages:

- 35 question-cluster answer pages
- 15 entity/use-case pages
- 10 comparison graph pages
- 5 method pages
- 4 glossary pages
- 3 platform pages
- 3 brand-defense pages

The mix lives in `data/citation_velocity/velocity_5k_plan.json` and is enforced by `scripts/validation/validate_citation_velocity_automation.mjs`.

## Workflow identity

Workflow id: `citation-velocity-5k`
Workflow file: `.github/workflows/citation-velocity-5k.yml`
Schedule: `12 13 * * *`
Lane: `citation_velocity_batch`
Commit message: `auto: citation velocity 5k batch`

## Stop conditions

The generator stops when:

- `page_admission_registry` reaches 5K admitted records;
- no unused atoms remain;
- programmatic admission fails;
- `validate:all` fails;
- governed workflow hostile review fails.

## Guardrails

The system is protected by:

- programmatic lane contracts;
- page admission registry;
- query registry uniqueness;
- no keyword-swap validator;
- claim safety validator;
- internal link velocity validator;
- sitemap and llms-full coverage validators;
- workflow contract, lineage, and monitor validators;
- baseline critical-file parity.

## Operator action required

None for daily production after merge.

Human action is needed only if GitHub Actions fails, an external platform changes behavior, or the repo-level validation gates block publication.


## Traffic-Qualified Automation Authority Patch

This strategy is upgraded by `docs/strategy/TRAFFIC_QUALIFIED_AEO_GEO_GROWTH_6MO_PLAN.md`. Existing BHPC/APlayer authority, citation, and programmatic expansion lanes remain valid where they are source-backed and validator-admitted. Page production is subordinated to traffic-qualified AEO/GEO/SEO release planning. The repo must not claim actual traffic, indexation, rankings, backlinks, AI Overview visibility, or LLM citations without external telemetry recorded in the proof packet. Live firehose sources remain disabled, shadowed, or credential/terms-gated until authority exists.
