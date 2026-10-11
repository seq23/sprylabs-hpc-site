# Zero paid LLM calls

Owner, 11 Oct 2026: "nothing should be paid … cut the probes and make them free."
Policy lives in code: `config/llm_routing.json` (read by `scripts/lib/free_llm_router.mjs`),
guarded by `npm run validate:zero-paid-llm` (HARD_FAIL, container-prepush).

## What was paid (inventory taken 11 Oct 2026)

| Call site | Schedule | Model | What it did | Now |
|---|---|---|---|---|
| `scripts/llm_citation_probe.mjs` in Daily Citation Intelligence | daily 13:37 UTC | `openai/gpt-4o-mini` + OpenRouter web plugin (billed per request) | 25 grounded questions a run; recorded whether answers cited our domains (`data/signals/llm_citation_observations.json`) | **Off every schedule.** On a manual dispatch it runs knowledge mode through the free router ($0 models only). Grounded (paid) mode runs only with `confirm_paid: true`; otherwise `DISABLED_BY_OWNER_POLICY`, exit 0, nothing called |
| `scripts/search_intelligence/observe_live_search.mjs` in Search Intelligence Cycle (`search:observe`, run twice per cycle) | daily 13:23 UTC | `openai/gpt-4o-mini` + web plugin, `parallel` engine (~$0.00127/call) | up to 24 grounded observations × 2 passes a run (`data/search_intelligence/live_search_observations.json`) | **Off.** The cycle stays daily for the free parts (GSC truth, diagnose, bounded repair); the observer gets no key and records `DISABLED_BY_OWNER_POLICY` (healthy by policy, only when 0 calls were attempted) unless dispatched with `confirm_paid: true` |
| Gemini path in `llm_citation_probe.mjs` | none (no key in CI) | `gemini-3.6-flash` | knowledge/grounded fallback | **Removed** |

Already free, verified by reading the code: Spry Content Release, Agent Drop Intake and the
zero-dollar autonomous gap fill (`release:zero-dollar-autonomous`) make no model calls at all.

## The free router

- Ordered `$0/$0` `:free` models with a dated OpenRouter pricing snapshot in `config/llm_routing.json`.
- `max_cost_usd: 0`, `fallback_to_paid: false`. Each request asks OpenRouter to report `usage.cost`;
  a non-zero cost throws `FAIL_LOUD` and fails the run.
- No free model answers → `NAMED_STOP_NO_FREE_MODEL`; key refused (401/402/403, e.g. a disabled
  key) → `NAMED_STOP_CREDENTIAL_REFUSED` ("OpenRouter key disabled or invalid; free routing needs an
  enabled key with a $0 limit"). Both exit 0 with a receipt and generate nothing.

## Running a paid lane on purpose

Actions → the workflow → Run workflow → tick `confirm_paid`. Nothing scheduled can reach a
model-provider secret; `validate:zero-paid-llm` fails the build if that changes.
