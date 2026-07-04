# Structural Graph Live Policy — Spry

**Status:** Active  
**Scope:** Static public authority pages, generated reference surfaces, sitemaps, llms files, internal-link graph, and release planning.

## Law

All staged structural pages remain live when needed to preserve atlas, cluster, route, sitemap, and internal-link graph integrity.

Daily cadence controls release priority. It must not hide graph-critical pages merely to simulate a drip release.

## Repo-specific interpretation

Spry contains a large public static route graph. The release planner may prioritize a limited number of create, repair, atom, link, schema, or source actions per run, but validators must preserve:

- indexable authority pages already admitted;
- support pages needed for hub/spoke graph integrity;
- sitemap and llms coverage;
- internal-link continuity;
- canonical/noindex policy.

## Validator behavior

`validate:structural-graph-live-policy` checks that:

- critical route manifests exist;
- sitemap files exist and are non-empty;
- `llms.txt` and `llms-full.txt` exist and are non-empty;
- structural graph policy is declared in `data/strategy/citation_strategy_profile.json`;
- daily release cadence does not assert that pages should be hidden to fake cadence.
