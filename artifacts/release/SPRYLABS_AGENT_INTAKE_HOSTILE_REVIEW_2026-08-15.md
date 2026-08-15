# SpryLabs Agent Intake Hostile Review Repair — 2026-08-15

## Repository identity

- Repository: `seq23/sprylabs-hpc-site`
- Source of truth for this pass: `sprylabs-hpc-site-main_BASELINE_08-15-26_d0c211ce10cc.zip`
- Scope: hostile review of the agent-intake reliability repair and the current 2026-08-15 intake only

## Hostile findings repaired

1. Bare first-party domains were not recognized as evidence locators.
2. Any unrelated HTTP URL could satisfy the Ali Abdaal creator-attribution evidence gate.
3. Inherited evidence was used for admission but not preserved through acceptance/rendering.
4. Newly created routes changed semantic intent from CREATE to REPAIR merely because the file existed on a rerun.
5. The CREATE apply path used an unrelated `aplayermode.com` marker as a completeness heuristic, creating rewrite instability.
6. The standalone acceptance validator did not reject a same-route REQUIRED/BLOCKED contradiction.
7. Duplicate source representations leaked into repeated visible page copy.
8. Rich-page validation could pass generic repeated direct-answer scaffolding.
9. Standalone rendered-page validators could false-red because they inspected the repo shell rather than the staged public root.
10. ABSORBED normalized runs were not refreshed when the normalization/evidence contract changed.

## Repairs implemented

- Evidence locators normalize HTTP(S), `www`, and bare-domain values from governed evidence fields.
- Creator-specific evidence can declare required first-party domains; the current Ali Abdaal query requires `aliabdaal.com`.
- Evidence URLs and required evidence domains survive page-spec → acceptance → exact-plan → rendered provenance.
- First-party named-method sources render visibly; complete intake provenance is retained in machine-readable metadata.
- Source-intent CREATE is preserved across reruns and exact planning remains 2 repairs + 8 creates for the current run.
- Generated pages have an explicit ownership marker and are byte-idempotent on identical reruns.
- Acceptance invariant helper + standalone validator reject REQUIRED/BLOCKED route contradictions.
- Duplicate semantic source rows consolidate public copy while preserving every record ID.
- Current eight new pages contain query-specific direct answers, protocols, checklists, and copy-use prompts; the rich-page validator rejects thin/duplicated boilerplate.
- Rendered-page validators execute through the canonical staged public-root wrapper.
- Normalization contract `1.4-evidence-provenance-v2` forces governed stale ABSORBED runs to be regenerated after this parser-law change.
- Accepted-output freeze refreshed under the exact 10-route mutation scope.

## Targeted hostile validation performed

- Modified JavaScript syntax checks: PASS.
- BHPC route-resolution hostile self-test: PASS, including bare-domain evidence, unrelated-domain rejection, create-intent rerun stability, and route-conflict blocking.
- Current exact plan: 2 repairs / 8 new pages / 0 blocked.
- Current exact apply: 10 applied / 0 skipped.
- Rich new-page contract: PASS for all 10 current targets.
- Recommendation-driven output validator: PASS for active implementation output.
- Synthetic same-route REQUIRED/BLOCKED injection: validator correctly FAILed; clean manifest restored and PASSed.
- Identical rerun: exact plan remained 2 repairs / 8 creates / 0 blocked.
- Identical rerun page hashes: 10/10 byte-stable.
- Authority accepted-output freeze: 2,693 frozen outputs / 10 scoped mutation routes / 0 unscoped drift / 0 missing rendered outputs.

## Validation not claimed

Full local updater validation, complete repository validator suite, browser/E2E validation, GitHub push, exact-SHA GitHub Actions, deployment, and production behavior are not claimed by this artifact build.

## Status

STRUCTURALLY CHECKED — LOCAL VALIDATION REQUIRED
