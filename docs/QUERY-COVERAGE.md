# Query coverage: missing search questions (2026-09-25)

We checked 20 real-person search questions against both live sitemaps (billionairehighperformancecoach.com and
spryexecutiveos.com, 2,234 URLs combined), `data/demand/measured_demand.json` and
`data/backlog/build_backlog.json`. Nineteen already have a page. The one below does not.

## Why it is listed here and not in the queue

This repo's page queue is `data/demand/measured_demand.json`, and `validate:demand-backed-pages` enforces it.
Its `owner_seed_policy` accepts a record only when it meets one of these conditions:

- it has measured volume (GSC, or the owner's Semrush research);
- it is an `owner_approved_seed` that carries `approved_by`;
- it is a `bhpc_agent_discovery` record. That category is capped and may only shrink.

A research-only phrasing with no volume fits none of these. To promote this question, choose one:

- measure it, for example as a Bing Webmaster Tools Keyword Research seed, and add it with the measured figure;
- have the owner approve it as a seed.

| query | nearest existing page | source |
|---|---|---|
| is executive coaching worth it | /is-billionaire-high-performance-coach-worth-it/ is about the product, not the category | https://stratoscoaching.com/blog/is-executive-coaching-worth-it-reddit.html |

## Measurement, 2026-09-25

The question above was measured through this repo's existing lanes. It did not pass the demand gate, so it stays
here and is **not** in `data/demand/measured_demand.json`. The gate was not loosened and no owner seed was written.

| query | measured search volume (keyword tool) | measured GSC impressions | result |
|---|---|---|---|
| is executive coaching worth it | **0** Bing impressions, us and all markets (see the Bing measurement below) | **0**: no row in `data/queries/evidence/evidence_queries.json`, last GSC ingest `sc-domain:billionairehighperformancecoach.com`, window 2026-05-25..2026-08-23 | below threshold |

- **GSC lane** (`scripts/queries/ingest_gsc_evidence.py`, T1): the query has no impressions in the measured window.
  The gate needs `impressions_90d` above zero.
- **Keyword-tool lane** (Bing Webmaster Tools Keyword Research, T2a): **measured, 0**. The Bing Webmaster API key
  now exists in the credential vault as `bing-webmaster-api-key` and as this repo's GitHub secret
  `BING_WEBMASTER_API_KEY` (both set 2026-09-25), so this lane is no longer a named stop. The measurement is below.
  Semrush (T2b) still has no key; it is not needed while Bing is available.

## Bing keyword measurement, 2026-09-25 (T2a)

The seed was measured through the Bing Webmaster API `GetKeywordStats` (market `us`/`en-US`, and again with no market
filter). The window is 25 weekly buckets, 2026-03-28..2026-09-19. The sum of weekly `Impressions` is the monthly-volume
proxy. As controls, `webinar` and `facebook` returned non-zero weekly rows in the same call shape. The Keyword Research
panel in the web UI agreed: Bing "doesn't have enough data" for this phrasing.

| query | Bing impressions, us (25 wk) | Bing impressions, all markets | `owner_seed_policy` (measured volume > 0) | queued |
|---|---|---|---|---|
| is executive coaching worth it | **0** | **0** | refused | no |

The seed does not clear the gate, so `data/demand/measured_demand.json` is unchanged and the question stays on this
page. A 0 here means the phrasing is below Bing's reporting floor. It does not prove nobody searches for it. The route
that remains is the owner seed (`owner_approved_seed` with `approved_by`).
