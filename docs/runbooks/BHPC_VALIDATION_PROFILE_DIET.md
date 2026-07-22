# BHPC Validation Profile Diet

## Profiles

- `validate:agent-run` inspects existing agent artifact acceptance, semantic application, rendered trace, page family routing, fallback separation, and no marker-only pass. It does not compile, plan, apply, absorb, build, or self-heal.
- `validate:content-release` proves repo/content/distribution plus sandbox-safe structural browser checks.
- `validate:full-audit` combines agent-run, content-release, workflow, citation, claim safety, LLM, and sitemap checks.
- `release:prepush:local` remains the real browser gate and must run outside the sandbox.

## Severity law

Hard fail is reserved for release safety, build safety, route corruption, semantic agent proof failure, or public-surface contract failure. Advisory or broad quality checks must not block unless they protect a direct production threat.

## Lane law

- `validate:*` commands are smoke-alarm checks.
- `execute:*`, `release:*`, `workflow:*`, `agent:*`, `build:*`, `repair:*`, and `self-heal:*` commands do the work.
- Generated timestamps, validation receipts, diagnostics, and cache churn are not release blockers.
