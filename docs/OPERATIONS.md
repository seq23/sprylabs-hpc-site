# Operations

## Shape (7 Nov 2026, owner ruling: "cull down the validation to only what is needed")

- **Pages:** the 1,739 published pages on `billionairehighperformancecoach.com` and
  `spryexecutiveos.com` are static files in this repo, served by Cloudflare Pages (Git
  integration, build `npm run build:pages-output`, output `.pages-output/`, see `wrangler.toml`)
  plus the edge functions in `functions/` (canonical host, route ownership, rescue redirects,
  sitemaps, robots). Nothing regenerates them. New pages come only from Search Loop (below).
- **aplayermode.com:** `aplayermode/` served by the Worker in `workers/aplayermode-com`
  (see `REPO_IDENTITY.md`).

## Workflows (7)

| Workflow | What it does | When |
|---|---|---|
| `validate-repo.yml` | The merge gate (below) | every PR and push to `main` |
| `search-loop.yml` | Shared engine `seq23/search-loop@v1`: finds searches, publishes `/questions/` pages, checks them | daily 11:41 UTC |
| `search-measurements.yml` | Search Console truth and index coverage for both hosts (`.github/scripts/collect_search_measurements.sh`); changes no page | daily 13:23 UTC |
| `weekly-outcome-report.yml` | Week-over-week report from those measurements; uploads `spry-weekly-summary`, which Boss OS sends as "Spry Labs weekly" | Wednesdays |
| `aplayermode-pin-drip.yml` | Pinterest queue refill and per-pin visits (`scripts/aplayermode/weekly_pin_drip.sh`) | Mondays 13:37 UTC |
| `deploy-aplayermode-worker.yml` | Deploys the aplayermode.com Worker and proves the live apex | push to `main` touching `workers/aplayermode-com/**` or `aplayermode/**` |
| `entity-backlink-watch.yml` | Search Readiness k6: fetches every sameAs and pending profile in `config/entity.json`, checks the link-back, lands `reports/entity/backlink_watch.json`; a dead or promotable profile stops red with the exact sameAs change (`scripts/entity/entity_backlink_watch.mjs`) | Wednesdays 14:17 UTC |

Every lane that writes to `main` commits through `.github/scripts/commit_and_push_if_changed.sh`
(push retry, replay after main moves, then asks Validate Repo to check the pushed commit).

## The merge gate (Validate Repo, about 1 minute)

```bash
npm ci --ignore-scripts
npm run typecheck   # node --check on every tracked script
npm test            # behaviour tests in tests/ plus the push-helper regression test
npm run validate    # scripts/validators/run_safety_checks.mjs: the only validator runner
```

`npm run validate` holds safety checks only: no credential or personal mailbox address in the
repo, zero paid LLM, claim safety and Safe Harbor, redirect and link integrity, retired-route
references, canonical hosts, sitemap coverage and Pages publishes pages only. Rule 0 lives in each live
lane's own named stops (the old no-silent-zero-work check read files only retired lanes wrote). A new check goes into that runner only if it protects a live behaviour; page format and
wording are fixed in the writer, never guarded by a blocking validator.

## A Player Mode pins: routine pins, the gate and releasing held pins

- **Every new pin is a routine** (Pinterest assessment, 6-7 Nov 2026): a search-phrase headline
  and 4 to 6 numbered steps, opening its routine page at `aplayermode.com/routines/<slug>/`, never
  the home page. Pages and pins come from ONE file, `config/aplayermode_routines.json`:
  `node scripts/aplayermode/build_routine_pages.mjs` writes the pages, the route list and the
  apex sitemap; `scripts/aplayermode/routine_pins.mjs` plans one pin per routine and holds the gate.
- **The gate** (run by `pin_queue.mjs` on every unreleased pin before it writes the queue) refuses
  "Founding 100", member, join, `$`, Executive Roundtable/Suite, Autopilot and "Cancel any time";
  titles that do not start with a board search phrase; any two pins alike; old-style pins.
- **More pins need more routines.** The refill never draws a second pin from one routine. When
  every routine has its pin and fewer than `refill_threshold` (9) wait, the Monday lane stops with
  `PINTEREST_QUEUE_EXHAUSTED`: add routines to the config, run the page builder, land.
- **Held pins** (a `held` block) are never dated or in a feed. While `config.hold_new_pins` is
  set, refills are planned held too.

### Releasing held A Player Mode pins

One command, from anywhere (no checkout):

```sh
gh workflow run aplayermode-pin-drip.yml -R seq23/sprylabs-hpc-site -f release_held=yes
```

The lane runs `scripts/aplayermode/release_held_pins.mjs` (gate again, clear every `held` block
and `hold_new_pins`), then `pin_queue.mjs` dates them 3 a day from tomorrow (Central), and the
push helper commits the queue. `NOTHING_HELD` means there was nothing to release.

## The download page is protected
- `download.html` is the conversion page behind the portfolio's only two verified real sales
  (`data/entity/conversion_evidence.json`; both carry `full_price_status: unverified`, so never call
  either "the $99 sale" and never derive a conversion rate from two data points).
- **Protected, not frozen (owner ruling, 25 Oct 2026):** fix it only when something is really broken
  or clearly costing sales (dead buy button, broken links, search basics such as title, schema,
  canonical). Never touch it in bulk sweeps or cosmetic passes. Every change is deliberate and one
  page only: check the Gumroad buy link works before and after.
- `aplayermode.com` is served by the Worker `aplayermode-com` (source `workers/aplayermode-com`):
  it SERVES the landing page at aplayermode.com (address bar stays), never a 301 to another domain.
  Browsers cache 301s, so test routing changes with `curl` or a private window.

## Search loop (shared engine, from 1 Nov 2026)
- **What:** `.github/workflows/search-loop.yml` calls the shared engine `seq23/search-loop@v1` daily (11:41 UTC, `main-automation` group). It finds easy searches weekly, publishes gated pages under `/questions/` on spryexecutiveos.com, checks each at 2/4/8 weeks and 90 days (strengthen with automatic undo, merge with a 301 into `data/content/manual_redirects.json`), and uploads the `search-loop-week` report artifact. Config: `search-loop.config.json`. Ledger: `data/search-loop/`. How the engine works and the config keys: https://github.com/seq23/search-loop#readme
- **Throttle:** `gh variable set SEARCH_LOOP_MODE --body slow -R seq23/search-loop` (normal | slow | off) — no change here needed. `mode` in `search-loop.config.json` can only lower it.
- **Protected:** `download.html` and the homepage, Spry Labs entity home, admin/agency and aplayermode are in `protected_paths`; the engine never edits them.
- **Cadence:** engine pages are paced by the engine (owner ruling 1 Nov 2026: publish straight away). There is no post-build: the in-repo engine that re-derived sitemaps and heads is retired (7 Nov 2026).
- **The AI numbers (Search Readiness f11):** the engine reads AI-referral visits and AI-bot reads from Cloudflare every day and accumulates them in `data/search-loop/ai-daily.json`; the weekly report sums the last seven days. Both halves need ONE token, the repository secret `SEARCH_LOOP_CF_USAGE_TOKEN`, with **Zone:Read + Zone Analytics:Read** on the zone and **Account Analytics:Read** (the same token also reads the $0 Workers AI lane's neuron budget). spryexecutiveos.com is a free zone, so it has no `clientRefererHost` field and referral visits come from Cloudflare **Web Analytics** instead, which needs `SEARCH_LOOP_CF_ACCOUNT_ID` and the beacon on the site.
- **When the numbers go missing:** a token that cannot read them does not fail - the engine writes the honest `"not read: <reason>"` and every lane stays green. That is how 1-3 Nov 2026 passed with no measurement at all (the secret held a token without `zone.analytics.read`). The guard is `npm run check:ai-measurement`: offline it refuses a seven-day window in which neither number was read for a credential or configuration reason, and `-- --live` asks Cloudflare the same three questions the engine asks. Both run every Wednesday in `weekly-outcome-report.yml`; `npm run self-test:ai-measurement` proves the verdicts offline in the same lane. Rotate the token from the Boss OS vault (`CLOUDFLARE_ANALYTICS_READ_TOKEN`), never by hand on a command line.
- **The only page engine (7 Nov 2026):** the in-repo content engine, its release and rebuild lanes and the search-intelligence page repairs were retired; the ~1,739 pages they published stay exactly as committed. Search Loop owns new pages.
