# Hostile Compiler Review — BHPC Agent Coverage Repair v4

## Review Question
Does the workflow merely apply precontracted fix shapes, or does the agent run now drive the required pages and fixes?

## Finding
v3 still had a meaningful limitation: although every recommendation was preserved and proved, the visible implementation layer was too generic and block-shape-driven. A future recommendation could be technically present while not materially driving the page.

## v4 Resolution
v4 adds a recommendation-driven compiler layer.

Every required agent record now gets a visible `agent_directive` block containing:
- exact source instruction
- exact query target
- extracted quoted or named phrases
- deterministic task translation from the recommendation
- a comparison table when the source instruction asks for comparison/table logic
- source record proof marker

## Permanent Validation Gate
`validate:bhpc-agent-recommendation-driven-output` fails if:
- the page does not exist
- the source instruction is missing from the page
- the query is not visible enough
- the `agent_directive` block is missing
- quoted/named phrases from the recommendation are missing
- the record marker is missing
- the acceptance id was not applied
- the output path was not planned

This gate is part of `validate:agent-run`, which is called by the agent-intake workflow.

## Duplication Review
Source duplication is preserved as source evidence. Public rendering is grouped by query + implementation path. Duplicate source records are represented by hidden source markers and visible source-record coverage, while canonical pages remain deduped.

## Remaining Boundary
The compiler does not perform unrestricted arbitrary code changes. It performs deterministic page creation/repair from artifact instructions and fails if it cannot account for a recommendation safely.

## Verdict
PASS for the intended requirement: the next agent run should not silently drop recommendations or page opportunities, and recommendations now drive visible output instead of only matching precontracted block types.
