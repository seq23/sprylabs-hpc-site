# BHPC Agent Coverage Repair v4 — Recommendation-Driven Compiler Plan

## Purpose
Fix the root failure from the 2026-07-04 BHPC agent run: agent source artifacts contained actionable recommendations and new-page opportunities that were not all preserved, applied, or built downstream.

## Final v4 Contract
The agent artifact is the execution contract. The workflow must not rely only on precontracted page-fix shapes. Every source recommendation must drive one of these explicit outcomes:

1. **Apply to an existing page** when a valid existing route or typo-resolved route exists.
2. **Create a new page** when the artifact declares a new-page opportunity or no existing intended winner exists.
3. **Block with reason** when route resolution is unsafe, ambiguous, or external-domain blocked.
4. **Skip with reason** only when policy explicitly allows it.

Silent drops are invalid.

## Root Cause
The earlier pipeline preserved some artifact rows but did not enforce semantic recommendation coverage. Nested JSON recommendations and HTML digest recommendations could be normalized but then rendered through generic precontracted blocks. This let the workflow appear successful even when the exact agent recommendation was not truly driving output.

## v4 Fix

### 1. Recommendation-driven output layer
File: `scripts/agent_intake/apply_bhpc_agent_exact_implementation.mjs`

Adds an `agent_directive` rendering block that includes:
- the exact source instruction
- the query target
- extracted quoted/named phrases
- deterministic implementation tasks derived from the recommendation
- comparison/table output when requested by the instruction
- page-level source record markers

This means unknown future recommendation shapes are not discarded. They are rendered as visible page work and validated.

### 2. Permanent output validator
File: `scripts/validators/validate_bhpc_agent_recommendation_driven_output.mjs`

Requires every acceptance entry to prove:
- page exists
- source query is visible
- source fix instruction is visible
- `agent_directive` block exists
- `Agent source instruction` label exists
- quoted/named phrases from the artifact are visible
- record marker exists
- acceptance id was actually applied
- output page appears in the exact implementation plan

### 3. Acceptance parser update
File: `scripts/lib/bhpc_agent_acceptance_parser.mjs`

Adds required strings:
- `Agent-directed implementation`
- `Agent source instruction`

### 4. Block schema update
File: `scripts/lib/bhpc_agent_block_schema.mjs`

Adds permanent block type:
- `agent_directive`

Every agent recommendation now requires this block.

### 5. Package validation update
File: `package.json`

Adds:
- `validate:bhpc-agent-recommendation-driven-output`

Appends it to:
- `validate:agent-run`

Because `release:agent-intake:raw` calls `validate:agent-run`, this check is now part of the agent-intake workflow path.

## File Change Map

| File | Change |
|---|---|
| `scripts/lib/bhpc_agent_block_schema.mjs` | Added `agent_directive` block type and made it mandatory for every agent recommendation. |
| `scripts/lib/bhpc_agent_acceptance_parser.mjs` | Added source instruction proof strings to acceptance requirements. |
| `scripts/agent_intake/apply_bhpc_agent_exact_implementation.mjs` | Added dynamic recommendation renderer that turns arbitrary source instructions into visible page implementation. |
| `scripts/validators/validate_bhpc_agent_recommendation_driven_output.mjs` | New permanent validator proving recommendations, named phrases, and source instructions drive output. |
| `package.json` | Added validator script and appended it to `validate:agent-run`. |
| `reports/bhpc-agent-recommendation-driven-output.json` | Generated validation proof. |
| `artifacts/validation/bhpc-agent-recommendation-driven-output.json` | Generated validation proof. |

## 2026-07-04 Correction Status

- Source records checked: 225
- New-page source records checked: 10
- Canonical new pages built: 5
- Missing from normalized: 0
- Unaddressed: 0
- Missing page-level proof markers: 0
- Recommendation-driven entries checked: 429
- Recommendation-driven validator status: PASS

## Boundary
This does not give the workflow unrestricted authority to execute unsafe code or external actions. It gives the workflow deterministic authority to turn every artifact recommendation into a page repair, page build, explicit queue/block, and validation proof.
