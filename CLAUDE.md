# sprylabs-hpc-site — rules for anyone working in this repo

This repository publishes two public hosts from one Cloudflare Pages deployment:
`billionairehighperformancecoach.com` and `spryexecutiveos.com`. Start with
[`REPO_IDENTITY.md`](REPO_IDENTITY.md) for the route/source/deploy contract, and
[`AGENTS.md`](AGENTS.md) for the inherited Repo Operator chassis.

## Nothing paid

**Nothing paid.** No lane in this repository spends money: every model call goes through the free
router at `$0`, and nothing on a schedule can reach a model-provider secret.

The policy, the inventory of what used to be paid, and the named stops are in
[`docs/cost/zero-paid-llm.md`](docs/cost/zero-paid-llm.md). It lives in code in
`config/llm_routing.json` (`max_cost_usd: 0`, `fallback_to_paid: false`), is read by
`scripts/lib/free_llm_router.mjs`, and is enforced by `npm run validate:zero-paid-llm`
(HARD_FAIL, `container-prepush`). A non-zero `usage.cost` on any response throws `FAIL_LOUD` and
fails the run; no free model answering is a named stop, never a paid retry.

A paid lane runs only when a human ticks `confirm_paid` on a manual workflow dispatch.

This section is read by `npm run validate:claude-md-cost-rule`, so the rule and the document it
points at cannot drift apart or quietly disappear.

## One definition per contract

This repo has been bitten repeatedly by two writers of the same thing disagreeing. When you fix a
head, a tag or a schema node, fix it in the one definition and let the repair apply it everywhere:

| Contract | One definition | Repair | Validator |
|---|---|---|---|
| Which host owns which route | `scripts/lib/dual_domain_policy.cjs` | `repair:dual-domain-metadata` | `validate:host-crawl-surfaces` |
| Title and description bounds | `scripts/lib/search_snippet_bounds.cjs` | `repair:dual-domain-metadata` | `validate:search-snippet-bounds` |
| The social-card head and icon links | `scripts/lib/social_tags.cjs` | `repair:social-tags` | `validate:social-tags` |
| The publisher Organization node | `scripts/lib/organization_node.cjs`, values in `config/entity.json` | `repair:organization-node` | `validate:organization-node` |
| The Spry Labs entity graph (sameAs, @id, entity home `spry-labs.html`, members) | `config/entity.json` | `repair:organization-node`; weekly `entity-backlink-watch.yml` self-heals sameAs by PR | `validate:entity-graph`, `self-test:entity-backlink-watch` |
| One canonical host per domain | `functions/_lib/canonical_host.js` | — (edge) | `validate:canonical-host` |
| One 200 per route across hosts | `functions/_lib/route_owner_host.js` | `build:route-owner-table` | `validate:route-owner-host` |
| Routes retired onto a bhpc page | `functions/_lib/host_consolidation.js` | — (edge) | `validate:host-consolidation` |
| A sitemap page's canonical is on its own host | `dual_domain_policy.cjs`, read by Python through `scripts/lib/canonical_url_cli.cjs` | `repair:dual-domain-metadata` | `validate:sitemap-canonical-on-own-host` |

Never edit `dist/` or generated page output to fix a page: find the writer above, change it, and
rebuild. A fix made in built output is gone on the next build.
