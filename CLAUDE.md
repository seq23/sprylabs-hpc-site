# sprylabs-hpc-site — rules for anyone working in this repo

This repository publishes two public hosts from one Cloudflare Pages deployment:
`billionairehighperformancecoach.com` and `spryexecutiveos.com`. Start with
[`REPO_IDENTITY.md`](REPO_IDENTITY.md) for the route/source/deploy contract, and
[`AGENTS.md`](AGENTS.md) for the inherited Repo Operator chassis. `download.html` is protected: read "The download page is protected" in
[`docs/OPERATIONS.md`](docs/OPERATIONS.md) before touching it.

## Company brain

Read `~/Brains/spry.md` before any work (business facts, priorities, voice, settled decisions). New business facts go to the brain via Boss OS, not into this repo or memory. Repo how-tos stay in `docs/`.

## Nothing paid

**Nothing paid.** No lane in this repository spends money: every model call goes through the free
router at `$0`, and nothing on a schedule can reach a model-provider secret except the shared
search loop (`search-loop.yml`), which gets the OpenRouter key only through the pinned engine
and only routed through `config/llm_routing.json` (owner ruling 1 Nov 2026).

The policy, the inventory of what used to be paid, and the named stops are in
[`docs/cost/zero-paid-llm.md`](docs/cost/zero-paid-llm.md). It lives in code in
`config/llm_routing.json` (`max_cost_usd: 0`, `fallback_to_paid: false`), is read by
`scripts/lib/free_llm_router.mjs`, and is enforced by `zero-paid-llm` in `npm run validate`
(the merge gate). A non-zero `usage.cost` on any response throws `FAIL_LOUD` and
fails the run; no free model answering is a named stop, never a paid retry.

A paid lane runs only when a human ticks `confirm_paid` on a manual workflow dispatch.

## Shape and merge gate

The page engine is Search Loop (`search-loop.yml`). The in-repo content engine and its ~250
page-format, citation and governance validators were retired on 7 Nov 2026 (owner ruling: "cull
down the validation to only what is needed"); the published pages are static files and nothing
regenerates them. The six workflows, the merge gate (`npm run typecheck && npm test && npm run
validate`, about a minute) and what each lane does are in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

- **`npm run validate` holds safety checks only** (`scripts/validators/run_safety_checks.mjs`):
  secrets and personal mailbox addresses, zero paid LLM, claim safety, deploy safety (redirects,
  links, canonical hosts, sitemaps, what Pages publishes) and no silent zero work. Do not add a
  page-format or wording validator: fix the page, or the writer, instead.
- **Edge contracts, one definition each:** canonical host `functions/_lib/canonical_host.js`; one
  200 per route across hosts `functions/_lib/route_owner_host.js` (table: `npm run
  build:route-owner-table`); routes retired onto a bhpc page `functions/_lib/host_consolidation.js`;
  rescue redirects `functions/_lib/spry_rescue.js`. Each has a behaviour test in `tests/`.
- **Changing a published page** is a hand edit to that page's file, one page at a time; there is
  no generator to rerun.
