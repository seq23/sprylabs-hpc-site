# BHPC Agent Artifact Acceptance Runbook

## Authority

Every explicit BHPC agent recommendation must either be implemented as visible semantic content or blocked with a reason. A generic marker, query echo, fallback page, or boilerplate framework cannot count as implementation proof.

## Flow

1. Normalize the agent run artifacts.
2. Apply the explicit execution lane when implementation is intended:
   `npm run execute:agent-run:apply-exact`
3. Validate the already-applied agent-run lane:
   `npm run validate:agent-run`

## Non-negotiables

- The source `fix_recommendation` must be preserved in the acceptance manifest.
- Required strings and block types must be rendered in HTML.
- Legacy `Agent Exact Citation Repair` / `exact intended-winner pipeline` marker-only proof must fail.
- Fallback gap-fill pages must be labeled separately and cannot satisfy exact agent rows.
- `validate:*` commands inspect existing state only. Compile, plan, apply, absorb, trace, build, and self-heal work belongs in `execute:*`, `agent:*`, `release:*`, or `workflow:*` lanes.
