# BHPC Agent Artifact Acceptance Runbook

## Authority

Every explicit BHPC agent recommendation must either be implemented as visible semantic content or blocked with a reason. A generic marker, query echo, fallback page, or boilerplate framework cannot count as implementation proof.

## Flow

1. Normalize the agent run artifacts.
2. Compile row-level acceptance criteria:
   `npm run agent:bhpc:compile-acceptance`
3. Build the exact implementation plan:
   `npm run agent:bhpc:plan-exact`
4. Apply semantic blocks to the intended winner or routed page:
   `npm run agent:bhpc:apply-exact`
5. Trace rendered proof:
   `npm run agent:bhpc:trace-exact`
6. Validate the agent-run lane:
   `npm run validate:agent-run`

## Non-negotiables

- The source `fix_recommendation` must be preserved in the acceptance manifest.
- Required strings and block types must be rendered in HTML.
- Legacy `Agent Exact Citation Repair` / `exact intended-winner pipeline` marker-only proof must fail.
- Fallback gap-fill pages must be labeled separately and cannot satisfy exact agent rows.
