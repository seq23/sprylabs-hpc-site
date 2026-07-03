# Workflow Topology

## Law

Workflow topology defines public lanes. Component scripts remain private implementation details unless explicitly admitted as aliases.

## Canonical lanes

1. `workflow:content-authority` — BHPC/Spry agent intake, report contract, exact repairs, content authority rebuild.
2. `workflow:signal-intake` — Reddit, social, ingestion, and answer-surface signal collection.
3. `workflow:content-expansion` — generated/manual/synthesis/whitepaper content expansion.
4. `workflow:citation-expansion` — citation velocity batch generation and planning.
5. `workflow:release-verify` — audit/container/local/postpush release verification.

## Alias policy

Legacy scheduled workflow IDs may remain for schedule history and GitHub continuity, but they must route through a canonical lane. New scheduled workflows should not call component commands directly.

## Proof policy

Topology simplification does not reduce proof. Browser, release, workflow-contract, lineage, monitor, content-release, and full-audit validators remain separate proof boundaries.

## Retirement policy

Deprecated public entrypoints are retired only after their canonical alias path passes local prepush and GitHub workflow validation.
